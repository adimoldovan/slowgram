import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';
import exiftool from 'node-exiftool';
import exiftoolBin from 'dist-exiftool';
import imagemin from 'imagemin';
import webp from 'imagemin-webp';
import sharp from 'sharp';
import { Vibrant } from 'node-vibrant/node';
import {
  buildRss,
  buildItemDescription,
  formatLocation,
  mimeForExt,
  photoId,
  photoPermalink,
  resolvePublishedDates,
  toMonthYear,
} from './rss.js';
import { createClient, pullBucket, syncToS3 } from './s3.js';
import { renderIntoDir, entryAfterRender } from './feed-render.js';
import { extractMeta } from './feed-meta.js';
import { decideFromSource, decideFromPixels, describeUpdate, renderReason } from './feed-plan.js';
import { pruneMirror } from './feed-prune.js';
import { ui, pluralize } from './ui.js';

// The production mirror, injected into planPhoto/reportUpdates (which take a
// mirrorDir param) so those wrappers can be unit-tested against a temp mirror.
const defaultMirrorDir = fileURLToPath(new URL('../.s3-mirror', import.meta.url));

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function confirm(question, { assumeYes = false } = {}) {
  ui.pause();
  if (assumeYes) {
    ui.info(`${question.trim()} (--yes — assuming "yes")`);
    return Promise.resolve(true);
  }
  if (!process.stdin.isTTY) {
    ui.info(`${question.trim()} (no TTY — assuming "no")`);
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question.trim()} `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

// Bind options.assumeYes so syncToS3 receives a one-arg confirm callback.
function confirmWith(options) {
  return (question) => confirm(question, { assumeYes: options.assumeYes });
}

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));

const sizes = [320, 480, 600, 800, 1080, 1440, 1920, 2560];

// Read EXIF for one file through an already-open ExiftoolProcess. The process is
// opened once per build run and reused across every photo (see runBuild) rather
// than spawning the exiftool binary per call — one process start instead of one
// per processed/refreshed photo across the whole library.
async function getExifData(ep, filePath) {
  let data;
  try {
    data = await ep.readMetadata(filePath, ['-File:all']);
  } catch (error) {
    ui.error(`Error reading EXIF data from ${filePath}: ${error.message}`);
    throw error;
  }

  if (!data || !data.data || !data.data[0]) {
    throw new Error(`No EXIF data found in ${filePath}`);
  }

  return data.data[0];
}

// SHA-256 of the whole source file: a cheap "did anything at all change?" check.
function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// SHA-256 of the decoded pixels. Invariant to metadata, so it moves only when
// the image data itself does — this is what separates a metadata-only edit from
// a pixel edit when the file hash has changed. .rotate() (no args) bakes in the
// EXIF orientation, matching the renditions (sharp auto-orients on resize), so
// an orientation-only edit counts as a pixel change and triggers a re-render
// instead of leaving the displayed rotation stale until --rebuild-all.
async function hashPixels(filePath) {
  const buffer = await sharp(filePath).rotate().raw().toBuffer();
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function convertImageToWebp(dir, fileName) {
  try {
    await imagemin([`${dir}/${fileName}`], {
      destination: dir,
      plugins: [webp({ quality: 80 })],
    });
  } catch (error) {
    ui.error(`Error converting ${fileName} to .webp: ${error.message}`);
    throw error;
  }
}

export function getColor(rgb) {
  const [r, g, b] = rgb;

  // Hue ranges are contiguous so no chromatic hue is left without a bucket (the
  // old 150–180 gap leaked cyan/teal into the gray fallback). Low-saturation
  // pixels can still fall through to gray via the per-bucket s/l gates below —
  // that is intentional. `find` returns the first match, so where neighbouring
  // buckets share a boundary (e.g. green/blue at 150) the earlier entry wins.
  const colors = [
    {
      name: 'red',
      check: (h, s, l) => (h >= 345 || h <= 15) && s >= 30 && l >= 20 && l <= 80,
    },
    {
      name: 'orange',
      check: (h, s, l) => h >= 15 && h <= 45 && s >= 40 && l >= 25 && l <= 75,
    },
    {
      name: 'yellow',
      check: (h, s, l) => h >= 45 && h <= 70 && s >= 30 && l >= 30 && l <= 85,
    },
    {
      name: 'green',
      check: (h, s, l) => h >= 70 && h <= 150 && s >= 25 && l >= 20 && l <= 80,
    },
    {
      name: 'blue',
      check: (h, s, l) => h >= 150 && h <= 250 && s >= 25 && l >= 20 && l <= 80,
    },
    {
      name: 'purple',
      check: (h, s, l) => h >= 250 && h <= 345 && s >= 25 && l >= 20 && l <= 80,
    },
  ];

  // Convert RGB to HSL
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  const l = (max + min) / 2;
  let s = 0;
  let h = 0;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / diff + 2) / 6;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / diff + 4) / 6;
        break;
      default:
        h = 0;
        break;
    }
  }

  h *= 360;
  s *= 100;
  const lPercent = l * 100;

  // Check if it's grayscale
  if (s < 15 || lPercent < 15 || lPercent > 85) {
    if (lPercent < 30) return 'black';
    if (lPercent > 70) return 'white';
    return 'gray';
  }

  // Find matching color
  const matchingColor = colors.find((color) => color.check(h, s, lPercent));
  return matchingColor ? matchingColor.name : 'gray';
}

// Turn raw per-color population tallies into feed entries, sorted by population
// descending, with each population expressed as a percentage of the total. A flat
// image can produce an all-zero tally; guard the divide so we return [] instead of
// serializing NaN populations into feed.json.
export function summarizeColorCounts(colorCounts) {
  const totalPopulation = Object.values(colorCounts).reduce((sum, pop) => sum + pop, 0);
  if (totalPopulation === 0) return [];

  return Object.entries(colorCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([color, population]) => ({
      color,
      population: Math.round((population / totalPopulation) * 100),
    }));
}

async function extractColors(filePath) {
  try {
    const palette = await Vibrant.from(filePath).getPalette();
    const colorCounts = {};

    const swatchesToProcess = [
      palette.Vibrant,
      palette.Muted,
      palette.DarkVibrant,
      palette.DarkMuted,
      palette.LightVibrant,
      palette.LightMuted,
    ];

    swatchesToProcess.forEach((swatch) => {
      if (swatch) {
        const color = getColor(swatch.rgb);
        colorCounts[color] = (colorCounts[color] || 0) + swatch.population;
      }
    });

    return summarizeColorCounts(colorCounts);
  } catch (error) {
    ui.error(`Error extracting colors from ${filePath}: ${error.message ?? error}`);
    return [];
  }
}

// Classify one source photo against the existing feed entry without rendering it.
// Returns the action a build would take — 'reuse' (byte-identical), 'refresh'
// (metadata-only edit) or 'render' (new, missing renditions, --rebuild-all, or a
// pixel edit) — a short human reason, and the content hashes computed along the
// way so the build loop can reuse them instead of hashing the source twice. The
// pixel hash is only computed when the cheap source-hash check is inconclusive,
// the same lazy path the build uses. Pure decisions live in feed-plan.js; this
// wrapper just supplies the I/O (hashing + the rendition-existence check).
// mirrorDir is passed in (not closed over) so the wrapper can be unit-tested
// against a temp mirror; run() supplies the module-level mirror.
//
// A source/pixel/EXIF read failure is caught here and reported as a 'render'
// ('check failed'): both callers then re-process the photo, where processImage's
// own per-photo error isolation kicks in (keeping existing renditions or skipping
// a brand-new file). One unreadable source file therefore never aborts the whole
// build or the check — the same isolation the rest of the pipeline already uses.
export async function planPhoto({ file, photosDir, existing, rebuildAll, mirrorDir }) {
  try {
    const filePath = `${photosDir}/${file}`;
    const id = path.parse(file).name;
    const renditionExists = Boolean(
      existing?.src?.src && fs.existsSync(`${mirrorDir}/${id}/${existing.src.src}`)
    );
    const sourceHash = hashFile(filePath);

    const stage1 = decideFromSource({
      rebuildAll,
      hasExisting: Boolean(existing),
      renditionExists,
      sourceMatches: existing?.sourceHash === sourceHash,
    });

    if (stage1 === 'reuse') return { action: 'reuse', reason: 'unchanged', sourceHash };
    if (stage1 === 'render') {
      return {
        action: 'render',
        reason: renderReason({ rebuildAll, hasExisting: Boolean(existing) }),
        sourceHash,
      };
    }

    // inspect-pixels: the source changed but renditions still exist — hash the
    // pixels to separate a metadata-only edit (refresh) from a pixel edit (render).
    const pixelHash = await hashPixels(filePath);
    if (decideFromPixels({ existingPixelHash: existing.pixelHash, pixelHash }) === 'render') {
      return { action: 'render', reason: 'pixels changed', sourceHash, pixelHash };
    }
    return { action: 'refresh', reason: 'metadata only', sourceHash, pixelHash };
  } catch (error) {
    ui.error(`Error checking ${file}: ${error.message}`);
    return { action: 'render', reason: 'check failed' };
  }
}

// `ep` is the open ExiftoolProcess shared across the run (see runBuild); required.
async function processImage(file, index, photosDir, total, options, hashes = {}, ep) {
  const image = {};

  try {
    ui.phase('Process', `${file} · getting EXIF data`);
    const filePath = `${photosDir}/${file}`;
    // Content fingerprints used by incremental builds: the full-file hash flags
    // any edit; the pixel hash lets a later run separate a metadata-only edit
    // (reuse renditions) from a pixel edit (re-render). See the reuse loop in runBuild().
    // runBuild() has already hashed the source to make that decision, so reuse those
    // values when passed and never read/decode the file a second time here.
    image.sourceHash = hashes.sourceHash ?? hashFile(filePath);
    image.pixelHash = hashes.pixelHash ?? (await hashPixels(filePath));
    const data = await getExifData(ep, filePath);
    Object.assign(image, extractMeta(data));

    ui.phase('Process', `${file} · extracting colors`);
    image.colors = await extractColors(filePath);

    const parsedPath = path.parse(filePath);
    const originalWidth = parseInt(String(data.ImageSize).split('x')[0], 10);
    if (!Number.isFinite(originalWidth)) {
      throw new Error(`Unparseable ImageSize "${data.ImageSize}"`);
    }
    image.src = { path: `${config.feed.photos}/${parsedPath.name}`, set: [] };

    // Render into a temp dir and only swap it into place on success, so a failed
    // conversion/resize leaves any renditions pulled from S3 untouched (see
    // renderIntoDir). Without this, clearing the dir up front then failing would
    // strand the photo with no renditions and the sync would delete it from S3.
    const setPath = `${defaultMirrorDir}/${parsedPath.name}`;
    const tmpPath = `${defaultMirrorDir}/.tmp-${parsedPath.name}`;

    if (options.skipResize && options.skipConvert) {
      ui.phase('Process', `${file} · copying original file`);
      await renderIntoDir(setPath, tmpPath, async (outDir) => {
        const originalFileName = `${parsedPath.name}${parsedPath.ext}`;
        fs.copyFileSync(filePath, `${outDir}/${originalFileName}`);
        image.src.set.push(`${originalFileName} ${originalWidth}w`);
        image.src.src = originalFileName;
      });
    } else {
      await renderIntoDir(setPath, tmpPath, async (outDir) => {
        let lastSize = 0;
        const validSizes = sizes.filter((targetWidth) => targetWidth <= originalWidth);

        await Promise.all(
          validSizes.map(async (targetWidth) => {
            const targetFileName = `${parsedPath.name}-${targetWidth}w${parsedPath.ext}`;
            const targetFilePath = `${outDir}/${targetFileName}`;
            let finalFileName = targetFileName;

            if (!options.skipResize) {
              ui.phase('Process', `${file} · resizing to ${targetWidth}w`);
              await sharp(filePath)
                .resize(targetWidth, null, { withoutEnlargement: true })
                .toFile(targetFilePath);
            } else {
              ui.phase('Process', `${file} · copying original to ${targetWidth}w slot`);
              fs.copyFileSync(filePath, targetFilePath);
            }

            if (!options.skipConvert) {
              ui.phase('Process', `${file} · converting ${targetFileName} to .webp`);
              await convertImageToWebp(outDir, targetFileName);
              finalFileName = `${parsedPath.name}-${targetWidth}w.webp`;
              fs.rmSync(targetFilePath);
            }

            image.src.set.push(`${finalFileName} ${targetWidth}w`);
            if (targetWidth > lastSize) {
              lastSize = targetWidth;
              image.src.src = finalFileName;
            }
          })
        );
        // Keep srcset deterministic regardless of Promise resolution order.
        image.src.set.sort((a, b) => parseInt(a.split(' ')[1], 10) - parseInt(b.split(' ')[1], 10));
      });
    }

    return image;
  } catch (error) {
    ui.error(`Error processing ${file}: ${error.message}`);
    return null;
  }
}

function generateRss(images, dir) {
  const site = config.site || {};

  const items = images.map((image) => {
    const id = photoId(image);
    const largestUrl = `${image.src.path}/${image.src.src}`;
    const srcset = image.src.set
      .map((pair) => {
        const [fileName, width] = pair.split(' ');
        return `${image.src.path}/${fileName} ${width}`;
      })
      .join(', ');

    const loc = formatLocation(image.location);
    const title = image.title || loc || id || 'Photo';
    // Caption rows shown under the photo: title, "location · date", camera.
    // image.title (not the fallback) keeps the first row from duplicating the
    // location/date row when a photo has no real title.
    const metaLines = [
      image.title,
      [loc, toMonthYear(image.dateTaken.original)].filter(Boolean).join(' · '),
      image.camera,
    ];

    let length = 0;
    try {
      length = fs.statSync(`${dir}/${id}/${image.src.src}`).size;
    } catch {
      ui.warn(`${id}: enclosure file missing, omitting <enclosure>.`);
    }

    return {
      title,
      // Per-photo permalink (the app's /photo/{slug} deep link), not the bare
      // site URL — so each item opens its own photo in a reader. The image URL
      // is the fallback when no site URL is configured.
      link: photoPermalink(image, site.url, largestUrl),
      guid: largestUrl,
      pubDateMs: image.published,
      descriptionHtml: buildItemDescription({ imgSrc: largestUrl, srcset, alt: title, metaLines }),
      // Only advertise an enclosure when we know its real byte length; some
      // readers reject length="0".
      enclosure: length
        ? { url: largestUrl, length, type: mimeForExt(path.extname(image.src.src)) }
        : undefined,
    };
  });

  items.sort((a, b) => b.pubDateMs - a.pubDateMs);
  const maxItems = config.rss?.maxItems ?? 200;
  const limited = items.slice(0, maxItems);

  const xml = buildRss({
    title: site.title || 'Slowgram',
    link: site.url || '',
    description: site.description || '',
    feedUrl: config.feed?.rss,
    imageUrl: config.gravatarHash
      ? `https://www.gravatar.com/avatar/${config.gravatarHash}?s=144`
      : undefined,
    items: limited,
    // Derive lastBuildDate from the newest item rather than "now" so the output
    // is deterministic: an unchanged feed produces byte-identical rss.xml, which
    // lets the sync skip re-uploading it.
    lastBuildMs: limited[0]?.pubDateMs,
  });

  fs.writeFileSync(`${dir}/rss.xml`, xml);
  ui.success(`rss.xml written (${limited.length}/${items.length} items)`);
  return limited.length;
}

// Read-only report for `slowgram check`: classify every source photo with
// planPhoto (no rendering) and list the ones a build would touch, with their
// update type (image vs metadata), plus the photos that would be pruned because
// their source is gone. Mirrors the build's decision path so the report can't
// drift from what an actual build would do. mirrorDir is passed in (not closed
// over) so the report can be unit-tested against a temp mirror.
//
// Returns { updates, removals } — the same data it prints — so callers (and
// tests) can inspect the result without scraping the log. runBuild() ignores it.
export async function reportUpdates(imageFiles, photosDir, existingMap, keepIds, mirrorDir) {
  ui.info('Checking for updates…');
  const updates = [];
  for (const file of imageFiles) {
    const id = path.parse(file).name;
    ui.phase('Scan', file);
    const plan = await planPhoto({
      file,
      photosDir,
      existing: existingMap.get(id),
      rebuildAll: false,
      mirrorDir,
    });
    const update = describeUpdate(plan);
    if (update) updates.push({ id, ...update });
  }

  // Source photos no longer present would be pruned from the mirror (and deleted
  // from S3 on the next sync). pruneMirror's dry run lists them without touching
  // anything. An unreadable-but-present source file is still in keepIds, so it is
  // classified as a 'render' update above and never appears here.
  const removals = pruneMirror(mirrorDir, keepIds, { dryRun: true });

  for (const { id, kind, reason } of updates) {
    ui.info(`${id} — ${kind} (${reason})`);
  }
  for (const id of removals) {
    ui.info(`${id} — removed (source gone)`);
  }

  const imageCount = updates.filter((u) => u.kind === 'image').length;
  const metadataCount = updates.filter((u) => u.kind === 'metadata').length;
  const pending = updates.length + removals.length;
  if (pending === 0) {
    ui.success(`Up to date — nothing to build (${imageFiles.length} photos).`);
  } else {
    ui.success(
      `${pending} update(s): ${imageCount} image, ${metadataCount} metadata, ` +
        `${removals.length} removal(s). Run "slowgram build" to build.`
    );
  }

  return { updates, removals };
}

// Shared setup: ensure mirror dir, create the S3 client, return the bucket.
function buildContext() {
  const bucket = process.env.SLOWGRAM_BUCKET_NAME;
  fs.mkdirSync(defaultMirrorDir, { recursive: true });
  return { bucket, client: createClient(config) };
}

export async function runSync(options = {}) {
  const { bucket, client } = buildContext();
  ui.startPhases(['Sync']);
  ui.phase('Sync');
  const res = await syncToS3(client, bucket, defaultMirrorDir, { confirm: confirmWith(options) });
  return { command: 'sync', synced: !res.cancelled };
}

// Pull + scan + dedupe, shared by build and check. Returns the data both need.
async function pullAndScan(client, bucket) {
  ui.phase('Pull');
  const sp = ui.spinner(`Pulling s3://${bucket} into .s3-mirror`);
  const pulled = await pullBucket(client, bucket, defaultMirrorDir);
  sp.succeed(`Mirror ready (${pulled.downloaded} downloaded, ${pulled.skipped} current)`);

  const existingFeed = readJsonSafe(`${defaultMirrorDir}/feed.json`) || [];
  const existingMap = new Map(existingFeed.map((e) => [photoId(e), e]));

  ui.phase('Scan');
  const photosDir = process.env.SLOWGRAM_SOURCE_PATH;
  if (!fs.existsSync(photosDir)) throw new Error(`Source directory does not exist: ${photosDir}`);
  const imageFiles = fs
    .readdirSync(photosDir)
    .filter((file) => !file.startsWith('.'))
    .filter((file) => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file).toLowerCase()));

  const byId = new Map();
  for (const file of imageFiles) {
    const id = path.parse(file).name;
    if (byId.has(id)) {
      throw new Error(
        `Duplicate photo id "${id}" from "${byId.get(id)}" and "${file}". ` +
          'Source filenames must have unique basenames.'
      );
    }
    byId.set(id, file);
  }
  ui.success(`Found ${pluralize(imageFiles.length, 'image file')}`);
  return { photosDir, imageFiles, existingFeed, existingMap, byId };
}

export async function runCheck() {
  const { bucket, client } = buildContext();
  ui.startPhases(['Pull', 'Scan']);
  const { photosDir, imageFiles, existingMap, byId } = await pullAndScan(client, bucket);
  if (imageFiles.length === 0) {
    ui.info('No image files found in source directory');
    return { command: 'check', updates: [], removals: [] };
  }
  const result = await reportUpdates(
    imageFiles,
    photosDir,
    existingMap,
    new Set(byId.keys()),
    defaultMirrorDir
  );
  return { command: 'check', ...result };
}

export async function runBuild(options) {
  const { bucket, client } = buildContext();
  ui.startPhases(['Pull', 'Scan', 'Process', 'Dates', 'Feed', 'RSS', 'Prune', 'Sync']);
  const { photosDir, imageFiles, existingFeed, existingMap, byId } = await pullAndScan(
    client,
    bucket
  );
  if (imageFiles.length === 0) {
    ui.info('No image files found in source directory');
    return {
      command: 'build',
      built: 0,
      refreshed: 0,
      reused: 0,
      keptExisting: 0,
      pruned: 0,
      feedCount: 0,
      rssCount: 0,
      synced: false,
      dateWarnings: [],
    };
  }

  // --- Process: per-photo reuse / refresh / render (identical logic to today's
  //     run() loop at lines ~657–725, with ui.phase('Process', file) calls). ---
  ui.phase('Process');
  const entries = [];
  let reused = 0;
  let refreshed = 0;
  let built = 0;
  let keptExisting = 0;
  // One exiftool process for the whole run: opened here, reused by every
  // getExifData call below (render + refresh paths), and closed once in finally —
  // instead of spawning/tearing down the binary per photo.
  const ep = new exiftool.ExiftoolProcess(exiftoolBin);
  await ep.open();
  try {
    for (const [index, file] of imageFiles.entries()) {
      const id = path.parse(file).name;
      const existing = existingMap.get(id);
      ui.phase('Process', file);
      const plan = await planPhoto({
        file,
        photosDir,
        existing,
        rebuildAll: options.rebuildAll,
        mirrorDir: defaultMirrorDir,
      });

      let entry = null;
      if (plan.action === 'reuse') {
        entry = existing;
        reused++;
      } else if (plan.action === 'refresh') {
        try {
          const meta = extractMeta(await getExifData(ep, `${photosDir}/${file}`));
          entry = { ...existing, ...meta, sourceHash: plan.sourceHash, pixelHash: plan.pixelHash };
          refreshed++;
        } catch (error) {
          ui.error(`Error refreshing ${file}: ${error.message}`);
        }
      }
      if (!entry) {
        const rendered = await processImage(
          file,
          index,
          photosDir,
          imageFiles.length,
          options,
          {
            sourceHash: plan.sourceHash,
            pixelHash: plan.pixelHash,
          },
          ep
        );
        const { entry: resolved, status } = entryAfterRender(rendered, existing);
        entry = resolved;
        if (status === 'built') built++;
        else if (status === 'kept-existing') {
          keptExisting++;
          ui.warn(`${file}: render failed; keeping previous renditions and feed entry.`);
        }
      }
      if (entry) entries.push(entry);
    }
  } finally {
    await ep.close();
  }
  ui.success(
    `${built} processed, ${refreshed} metadata-refreshed, ${reused} reused` +
      `${keptExisting ? `, ${keptExisting} kept-after-failure` : ''} ` +
      `(${pluralize(entries.length, 'photo')}).`
  );

  // --- Dates: publication-date assignment (identical to lines ~727–746). ---
  ui.phase('Dates');
  const dateWarnings = [];
  const knownPublished = {};
  for (const e of existingFeed) if (e.published != null) knownPublished[photoId(e)] = e.published;
  const seed = Object.keys(knownPublished).length ? knownPublished : null;
  if (seed) {
    const missing = existingFeed.filter((e) => e.published == null).map(photoId);
    if (missing.length) {
      const w =
        `${missing.length} existing photo(s) lack a publication date and will be ` +
        `stamped now (re-dating to the top): ${missing.join(', ')}`;
      dateWarnings.push(w);
      ui.warn(w);
    }
  }
  const { map: published, firstRun } = resolvePublishedDates(entries, seed, Date.now());
  if (firstRun) ui.info("Seeding publication dates from each photo's date taken (first run).");
  for (const e of entries) e.published = published[photoId(e)];

  // --- Feed: write feed.json (identical to lines ~748–752). ---
  ui.phase('Feed');
  entries.sort((a, b) => b.dateTaken.timestamp - a.dateTaken.timestamp);
  fs.writeFileSync(`${defaultMirrorDir}/feed.json`, JSON.stringify(entries));
  ui.success(`feed.json written (${pluralize(entries.length, 'photo')})`);

  // --- RSS (identical to line ~755). ---
  ui.phase('RSS');
  const rssCount = generateRss(entries, defaultMirrorDir);

  // --- Prune + Sync (identical to lines ~762–774). ---
  const keepIds = new Set(byId.keys());
  ui.phase('Prune');
  if (options.skipSync) {
    const removals = pruneMirror(defaultMirrorDir, keepIds, { dryRun: true });
    ui.info('--skip-sync set; .s3-mirror built but not uploaded.');
    return result(false, removals.length);
  }
  const removals = pruneMirror(defaultMirrorDir, keepIds);
  ui.phase('Sync');
  const res = await syncToS3(client, bucket, defaultMirrorDir, { confirm: confirmWith(options) });
  return result(!res.cancelled, removals.length);

  function result(synced, pruned) {
    return {
      command: 'build',
      built,
      refreshed,
      reused,
      keptExisting,
      pruned,
      feedCount: entries.length,
      rssCount,
      synced,
      dateWarnings,
    };
  }
}
