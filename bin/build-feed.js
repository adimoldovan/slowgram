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

const mirrorDir = fileURLToPath(new URL('../.s3-mirror', import.meta.url));

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function confirm(question) {
  if (!process.stdin.isTTY) {
    console.log(`${question}(no TTY — assuming "no")`);
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    skipConvert: false,
    skipResize: false,
    rebuildAll: false,
    syncOnly: false,
    skipSync: false,
    help: false,
  };

  args.forEach((arg) => {
    switch (arg) {
      case '--skip-convert':
        flags.skipConvert = true;
        break;
      case '--skip-resize':
        flags.skipResize = true;
        break;
      case '--rebuild-all':
        flags.rebuildAll = true;
        break;
      case '--sync-only':
        flags.syncOnly = true;
        break;
      case '--skip-sync':
        flags.skipSync = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`Unknown flag: ${arg}`);
        }
        break;
    }
  });

  return flags;
}

function showHelp() {
  console.log(`
Usage: node build-feed.js [options]

Pulls the S3 bucket into .s3-mirror, rebuilds feed.json + rss.xml (preserving
publication dates), then syncs .s3-mirror back to S3 after a confirmation prompt.

Options:
  --rebuild-all     Reprocess every source photo (default: only new or edited ones)
  --skip-convert    Skip WebP conversion (when reprocessing)
  --skip-resize     Skip resizing (when reprocessing)
  --skip-sync       Build into .s3-mirror but do NOT upload to S3
  --sync-only       Skip building; only sync existing .s3-mirror to S3
  --help, -h        Show this help message

Environment Variables:
  SLOWGRAM_SOURCE_PATH    Path to source images (your full library) [build only]
  SLOWGRAM_BUCKET_NAME   Target S3 bucket name [always required]
  AWS_REGION              AWS region (or set config.json aws.region)
  (AWS credentials via the standard AWS credential chain)
`);
}

const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));

const sizes = [320, 480, 600, 800, 1080, 1440, 1920, 2560];

async function getExifData(filePath) {
  let data;
  const ep = new exiftool.ExiftoolProcess(exiftoolBin);
  await ep.open();

  try {
    data = await ep.readMetadata(filePath, ['-File:all']);
  } catch (error) {
    console.error(`Error reading EXIF data from ${filePath}:`, error.message);
    throw error;
  } finally {
    await ep.close();
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

// Remove photo dirs in .s3-mirror that are no longer in the feed so the mirror
// (and the subsequent S3 --delete) matches the current source set exactly.
function pruneMirror(dir, keepIds) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !keepIds.has(entry.name)) {
      fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
      console.log(`  ➤ pruned ${entry.name}`);
    }
  }
}

async function convertImageToWebp(dir, fileName) {
  try {
    await imagemin([`${dir}/${fileName}`], {
      destination: dir,
      plugins: [webp({ quality: 80 })],
    });
  } catch (error) {
    console.error(`\nError converting ${fileName} to .webp:`, error.message);
    throw error;
  }
}

function getColor(rgb) {
  const [r, g, b] = rgb;

  const colors = [
    {
      name: 'red',
      range: [0, 25],
      check: (h, s, l) => (h >= 345 || h <= 15) && s >= 30 && l >= 20 && l <= 80,
    },
    {
      name: 'orange',
      range: [15, 45],
      check: (h, s, l) => h >= 15 && h <= 45 && s >= 40 && l >= 25 && l <= 75,
    },
    {
      name: 'yellow',
      range: [45, 70],
      check: (h, s, l) => h >= 45 && h <= 70 && s >= 30 && l >= 30 && l <= 85,
    },
    {
      name: 'green',
      range: [70, 150],
      check: (h, s, l) => h >= 70 && h <= 150 && s >= 25 && l >= 20 && l <= 80,
    },
    {
      name: 'blue',
      range: [150, 250],
      check: (h, s, l) => h >= 180 && h <= 250 && s >= 25 && l >= 20 && l <= 80,
    },
    {
      name: 'purple',
      range: [250, 345],
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

    // Calculate total population for percentage conversion
    const totalPopulation = Object.values(colorCounts).reduce((sum, pop) => sum + pop, 0);

    return Object.entries(colorCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([color, population]) => ({
        color,
        population: Math.round((population / totalPopulation) * 100),
      }));
  } catch (error) {
    console.error(`Error extracting colors from ${filePath}:`, error);
    return [];
  }
}

async function processImage(file, index, photosDir, total, flags, hashes = {}) {
  const progress = `${Math.round((index / total) * 100)}% ${file}`;
  const image = {};

  try {
    process.stdout.write(`  ➤ ${progress}: getting EXIF data\r`);
    const filePath = `${photosDir}/${file}`;
    // Content fingerprints used by incremental builds: the full-file hash flags
    // any edit; the pixel hash lets a later run separate a metadata-only edit
    // (reuse renditions) from a pixel edit (re-render). See the reuse loop in run().
    // run() has already hashed the source to make that decision, so reuse those
    // values when passed and never read/decode the file a second time here.
    image.sourceHash = hashes.sourceHash ?? hashFile(filePath);
    image.pixelHash = hashes.pixelHash ?? (await hashPixels(filePath));
    const data = await getExifData(filePath);
    Object.assign(image, extractMeta(data));

    process.stdout.write(`  ➤ ${progress}: extracting colors\r`);
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
    const setPath = `${mirrorDir}/${parsedPath.name}`;
    const tmpPath = `${mirrorDir}/.tmp-${parsedPath.name}`;

    if (flags.skipResize && flags.skipConvert) {
      process.stdout.write(`  ➤ ${progress}: copying original file                \r`);
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

            if (!flags.skipResize) {
              process.stdout.write(`  ➤ ${progress}: resizing to ${targetWidth}w                \r`);
              await sharp(filePath)
                .resize(targetWidth, null, { withoutEnlargement: true })
                .toFile(targetFilePath);
            } else {
              process.stdout.write(
                `  ➤ ${progress}: copying original to ${targetWidth}w slot                \r`
              );
              fs.copyFileSync(filePath, targetFilePath);
            }

            if (!flags.skipConvert) {
              process.stdout.write(
                `  ➤ ${progress}: Converting ${targetFileName} to .webp        \r`
              );
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
    console.error(`\n❌ Error processing ${file}:`, error.message);
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
      console.log(`⚠️  ${id}: enclosure file missing, omitting <enclosure>.`);
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
  console.log(`✅ rss.xml written (${limited.length}/${items.length} items).`);
}

async function run() {
  console.log();
  const flags = parseArgs();
  if (flags.help) {
    showHelp();
    return;
  }

  const bucket = process.env.SLOWGRAM_BUCKET_NAME;
  if (!bucket) throw new Error('SLOWGRAM_BUCKET_NAME environment variable is required');

  fs.mkdirSync(mirrorDir, { recursive: true });
  const client = createClient(config);

  // --sync-only: skip all building, just push the existing .s3-mirror to S3.
  if (flags.syncOnly) {
    await syncToS3(client, bucket, mirrorDir, { confirm });
    return;
  }

  const photosDir = process.env.SLOWGRAM_SOURCE_PATH;
  if (!photosDir) throw new Error('SLOWGRAM_SOURCE_PATH environment variable is required');
  if (!fs.existsSync(photosDir)) {
    throw new Error(`Source directory does not exist: ${photosDir}`);
  }

  // 1. Mirror the bucket into .s3-mirror (additive download).
  console.log(`➤ Pulling s3://${bucket} into .s3-mirror`);
  const pulled = await pullBucket(client, bucket, mirrorDir);
  console.log(`✅ Mirror ready (${pulled.downloaded} downloaded, ${pulled.skipped} current).`);

  // 2. Existing feed = the publication-date ledger + reuse source.
  const existingFeed = readJsonSafe(`${mirrorDir}/feed.json`) || [];
  const existingMap = new Map(existingFeed.map((e) => [photoId(e), e]));

  // 3. Find source images.
  console.log(`➤ Finding images in ${photosDir}`);
  const imageFiles = fs
    .readdirSync(photosDir)
    // Skip dotfiles, notably macOS AppleDouble sidecars (._foo.jpg) created on
    // non-HFS+ volumes: they share the image extension but aren't valid images.
    .filter((file) => !file.startsWith('.'))
    .filter((file) => ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file).toLowerCase()));
  if (imageFiles.length === 0) {
    console.log('No image files found in source directory');
    return;
  }

  // Photo identity is the extension-less basename (it becomes the mirror dir,
  // the CDN folder and the feed/published key). Two source files that share a
  // basename (e.g. sunset.jpg + sunset.png) would clobber each other's output
  // and conflate publication dates, so refuse rather than silently lose a photo.
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
  console.log(`➤ Found ${imageFiles.length} image files`);

  const activeFlags = [];
  if (flags.rebuildAll) activeFlags.push('rebuild-all');
  if (flags.skipResize) activeFlags.push('skip-resize');
  if (flags.skipConvert) activeFlags.push('skip-convert');
  if (activeFlags.length) console.log(`➤ Active flags: ${activeFlags.join(', ')}`);

  // 4. Decide per photo: reuse as-is, refresh metadata only, or fully reprocess.
  //    The full-file hash is a cheap "did anything change?" check; when it
  //    differs we compare the pixel hash to tell a metadata-only edit (keep the
  //    existing renditions, just refresh feed fields) from a pixel edit (re-render).
  console.log('➤ Processing images...');
  const entries = [];
  let reused = 0;
  let refreshed = 0;
  let built = 0;
  let keptExisting = 0;
  for (const [index, file] of imageFiles.entries()) {
    const id = path.parse(file).name;
    const filePath = `${photosDir}/${file}`;
    const existing = existingMap.get(id);
    const renditionExists =
      existing?.src?.src && fs.existsSync(`${mirrorDir}/${id}/${existing.src.src}`);
    const sourceHash = hashFile(filePath);
    const reusable = !flags.rebuildAll && existing && renditionExists;
    // Computed lazily below if we need to compare pixels; reused by processImage
    // on the re-render path so the source is never decoded twice in one run.
    let pixelHash;

    let entry = null;
    if (reusable && existing.sourceHash === sourceHash) {
      // Fast path: the file is byte-identical to last time -> nothing to do.
      entry = existing;
      reused++;
    } else if (reusable) {
      // Changed (or a legacy entry with no stored hash) but renditions still
      // exist: work out whether the pixels moved. A legacy entry has no pixelHash
      // to compare against, so we trust the existing renditions and treat it as a
      // metadata-only edit (which also backfills both hashes for next time).
      process.stdout.write(`  ➤ ${file}: checking for changes        \r`);
      try {
        pixelHash = await hashPixels(filePath);
        const pixelsChanged = existing.pixelHash != null && pixelHash !== existing.pixelHash;
        if (!pixelsChanged) {
          const meta = extractMeta(await getExifData(filePath));
          entry = { ...existing, ...meta, sourceHash, pixelHash };
          refreshed++;
        }
      } catch (error) {
        // Mirror processImage's error isolation: a bad pixel/EXIF read here must
        // not abort the whole incremental build. Leave entry null so the photo
        // falls through to a full re-render below (which will skip it if it also
        // fails), exactly as a brand-new photo would.
        console.error(`\n❌ Error refreshing ${file}:`, error.message);
      }
    }

    // New photo, missing renditions, --rebuild-all, or pixels changed -> render.
    if (!entry) {
      const rendered = await processImage(file, index, photosDir, imageFiles.length, flags, {
        sourceHash,
        pixelHash,
      });
      // A failed render falls back to the existing entry (its renditions survive,
      // see renderIntoDir) so a transient failure never drops the photo or its
      // images. Only a brand-new photo with no prior entry is dropped.
      const { entry: resolved, status } = entryAfterRender(rendered, existing);
      entry = resolved;
      if (status === 'built') {
        built++;
      } else if (status === 'kept-existing') {
        keptExisting++;
        console.error(`\n⚠️  ${file}: render failed; keeping previous renditions and feed entry.`);
      }
    }

    if (entry) entries.push(entry);
  }
  console.log(''.padStart(200, ' '));
  const keptNote = keptExisting ? `, ${keptExisting} kept-after-failure` : '';
  console.log(
    `✅ ${built} processed, ${refreshed} metadata-refreshed, ${reused} reused${keptNote} (${entries.length} photos).`
  );

  // 5. Assign publication dates from the ledger; new -> now; migration -> dateTaken.
  const knownPublished = {};
  for (const e of existingFeed) {
    if (e.published != null) knownPublished[photoId(e)] = e.published;
  }
  const seed = Object.keys(knownPublished).length ? knownPublished : null;
  if (seed) {
    const missing = existingFeed.filter((e) => e.published == null).map(photoId);
    if (missing.length) {
      console.log(
        `⚠️  ${missing.length} existing photo(s) lack a publication date and will be ` +
          `stamped with now (re-dating to the top): ${missing.join(', ')}`
      );
    }
  }
  const { map: published, firstRun } = resolvePublishedDates(entries, seed, Date.now());
  if (firstRun) {
    console.log("➤ Seeding publication dates from each photo's date taken (first run).");
  }
  for (const e of entries) e.published = published[photoId(e)];

  // 6. Sort by date taken (gallery order) and write feed.json. Minified (no
  // pretty-printing) to shave bytes off the feed every reader downloads.
  entries.sort((a, b) => b.dateTaken.timestamp - a.dateTaken.timestamp);
  fs.writeFileSync(`${mirrorDir}/feed.json`, JSON.stringify(entries));
  console.log(`✅ feed.json written (${entries.length} photos).`);

  // 7. RSS.
  generateRss(entries, mirrorDir);

  // 8. Prune mirror dirs whose source photo is gone. Keyed on the *source* set,
  //    not the feed entries: a photo that failed to render this run is absent
  //    from the feed but still in source, so its renditions must survive — a
  //    transient failure must never cascade into an S3 deletion. Genuinely
  //    removed source photos are no longer in byId, so they are still pruned.
  pruneMirror(mirrorDir, new Set(byId.keys()));

  // 9. Sync up (unless skipped).
  if (flags.skipSync) {
    console.log('➤ --skip-sync set; .s3-mirror built but not uploaded.');
    return;
  }
  await syncToS3(client, bucket, mirrorDir, { confirm });
}

try {
  await run();
  console.log('✅ All done!');
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
