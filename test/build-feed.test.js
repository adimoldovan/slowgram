// @vitest-environment node
// This suite exercises the Node build pipeline (bin/feed-build.js + helpers),
// which resolves paths via import.meta.url — that needs the real file: URL the
// node environment provides, not jsdom's. No DOM is used here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { planPhoto, reportUpdates, getColor, summarizeColorCounts } from '../bin/pipeline.js';
import { renderIntoDir, entryAfterRender } from '../bin/feed-render.js';
import { extractMeta } from '../bin/feed-meta.js';
import {
  decideFromSource,
  decideFromPixels,
  describeUpdate,
  renderReason,
} from '../bin/feed-plan.js';
import { pruneMirror } from '../bin/feed-prune.js';
import { formatLocation } from '../bin/rss.js';

// SHA-256 of a file's bytes — mirrors hashFile() in feed-build.js so a test can
// set up an "existing" entry whose sourceHash matches a source file on disk.
const sha256OfFile = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

describe('extractMeta', () => {
  const base = { DateTimeOriginal: '2024:03:15 09:30:00' };

  it('parses DateTimeOriginal into a timestamp and keeps the original string', () => {
    const meta = extractMeta(base);
    expect(meta.dateTaken.original).toBe('2024:03:15 09:30:00');
    expect(meta.dateTaken.timestamp).toBe(Date.parse('2024-03-15T09:30:00'));
  });

  it('joins Make and Model into camera', () => {
    expect(extractMeta({ ...base, Make: 'Fujifilm', Model: 'X100V' }).camera).toBe(
      'Fujifilm X100V'
    );
  });

  it('omits absent camera parts instead of emitting "undefined"', () => {
    expect(extractMeta(base).camera).toBeUndefined();
    expect(extractMeta({ ...base, Make: 'Fujifilm' }).camera).toBe('Fujifilm');
    expect(extractMeta({ ...base, Model: 'X100V' }).camera).toBe('X100V');
  });

  it('maps location, title and keywords through', () => {
    const meta = extractMeta({
      ...base,
      City: 'Cluj',
      State: 'Cluj',
      Country: 'Romania',
      ObjectName: 'Sunset',
      Keywords: ['dusk'],
    });
    expect(meta.location).toEqual({ city: 'Cluj', state: 'Cluj', country: 'Romania' });
    expect(meta.title).toBe('Sunset');
    expect(meta.keywords).toEqual(['dusk']);
  });

  it('throws when DateTimeOriginal is missing', () => {
    expect(() => extractMeta({ Make: 'Fujifilm' })).toThrow('missing DateTimeOriginal');
  });

  it('throws on an unparseable DateTimeOriginal rather than returning NaN', () => {
    expect(() => extractMeta({ DateTimeOriginal: 'not a date' })).toThrow('unparseable');
  });
});

describe('decideFromSource', () => {
  const reusable = {
    rebuildAll: false,
    hasExisting: true,
    renditionExists: true,
    sourceMatches: true,
  };

  it('reuses a byte-identical photo whose renditions still exist', () => {
    expect(decideFromSource(reusable)).toBe('reuse');
  });

  it('inspects pixels when the source changed but renditions still exist', () => {
    expect(decideFromSource({ ...reusable, sourceMatches: false })).toBe('inspect-pixels');
  });

  it('renders a brand-new photo with no existing entry', () => {
    expect(decideFromSource({ ...reusable, hasExisting: false, sourceMatches: false })).toBe(
      'render'
    );
  });

  it('renders when the prior renditions are gone, even if the source matches', () => {
    expect(decideFromSource({ ...reusable, renditionExists: false })).toBe('render');
  });

  it('renders under --rebuild-all regardless of the source hash', () => {
    expect(decideFromSource({ ...reusable, rebuildAll: true })).toBe('render');
  });
});

describe('decideFromPixels', () => {
  it('renders when the pixel hash moved (a pixel edit)', () => {
    expect(decideFromPixels({ existingPixelHash: 'aaa', pixelHash: 'bbb' })).toBe('render');
  });

  it('refreshes when the pixels are unchanged (a metadata-only edit)', () => {
    expect(decideFromPixels({ existingPixelHash: 'aaa', pixelHash: 'aaa' })).toBe('refresh');
  });

  it('refreshes a legacy entry with no stored pixel hash rather than re-rendering', () => {
    expect(decideFromPixels({ existingPixelHash: null, pixelHash: 'bbb' })).toBe('refresh');
    expect(decideFromPixels({ existingPixelHash: undefined, pixelHash: 'bbb' })).toBe('refresh');
  });
});

describe('renderReason', () => {
  it('reports a new photo when there is no existing entry', () => {
    expect(renderReason({ rebuildAll: false, hasExisting: false })).toBe('new photo');
  });

  it('reports missing renditions for an existing entry that must re-render', () => {
    expect(renderReason({ rebuildAll: false, hasExisting: true })).toBe('renditions missing');
  });

  it('reports rebuild-all, taking precedence over the new/existing distinction', () => {
    expect(renderReason({ rebuildAll: true, hasExisting: false })).toBe('rebuild-all');
    expect(renderReason({ rebuildAll: true, hasExisting: true })).toBe('rebuild-all');
  });
});

describe('describeUpdate', () => {
  it('reports a render as an image update and carries the reason through', () => {
    expect(describeUpdate({ action: 'render', reason: 'new photo' })).toEqual({
      kind: 'image',
      reason: 'new photo',
    });
    expect(describeUpdate({ action: 'render', reason: 'pixels changed' })).toEqual({
      kind: 'image',
      reason: 'pixels changed',
    });
  });

  it('reports a refresh as a metadata update', () => {
    expect(describeUpdate({ action: 'refresh', reason: 'metadata only' })).toEqual({
      kind: 'metadata',
      reason: 'metadata only',
    });
  });

  it('returns null for a reused photo (no update to report)', () => {
    expect(describeUpdate({ action: 'reuse', reason: 'unchanged' })).toBeNull();
  });
});

describe('formatLocation', () => {
  it('shows the city when present', () => {
    expect(formatLocation({ city: 'Cluj', state: 'Cluj', country: 'Romania' })).toBe(
      'Cluj, Romania'
    );
  });

  it('falls back to the state when there is no city', () => {
    expect(formatLocation({ state: 'Bavaria', country: 'Germany' })).toBe('Bavaria, Germany');
  });

  it('returns the country alone when there is no city or state', () => {
    expect(formatLocation({ country: 'Romania' })).toBe('Romania');
  });

  it('ignores whitespace-only fields', () => {
    expect(formatLocation({ city: '  ', state: 'Bavaria', country: ' Germany ' })).toBe(
      'Bavaria, Germany'
    );
  });

  it('returns an empty string for empty, null or undefined input', () => {
    expect(formatLocation({})).toBe('');
    expect(formatLocation(null)).toBe('');
    expect(formatLocation(undefined)).toBe('');
  });
});

describe('entryAfterRender', () => {
  it('uses the freshly rendered entry when the render succeeded', () => {
    const rendered = { id: 'a', src: {} };
    expect(entryAfterRender(rendered, { id: 'a-old' })).toEqual({
      entry: rendered,
      status: 'built',
    });
  });

  it('falls back to the existing entry when the render failed', () => {
    const existing = { id: 'a', src: {} };
    expect(entryAfterRender(null, existing)).toEqual({
      entry: existing,
      status: 'kept-existing',
    });
  });

  it('drops the photo only when the render failed and there is no existing entry', () => {
    expect(entryAfterRender(null, undefined)).toEqual({ entry: null, status: 'failed' });
  });
});

describe('pruneMirror', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'slowgram-'));
    fs.mkdirSync(path.join(root, 'keep'));
    fs.mkdirSync(path.join(root, 'gone'));
    fs.writeFileSync(path.join(root, 'keep', 'a-320w.webp'), 'a');
    fs.writeFileSync(path.join(root, 'gone', 'b-320w.webp'), 'b');
    fs.writeFileSync(path.join(root, 'feed.json'), '[]');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('removes dirs whose id is not in the keep set and reports them', () => {
    const pruned = pruneMirror(root, new Set(['keep']));
    expect(pruned).toEqual(['gone']);
    expect(fs.existsSync(path.join(root, 'gone'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'keep'))).toBe(true);
  });

  it('leaves files in the mirror root untouched (only prunes directories)', () => {
    pruneMirror(root, new Set(['keep']));
    expect(fs.existsSync(path.join(root, 'feed.json'))).toBe(true);
  });

  it('keeps every dir when they are all in the keep set', () => {
    expect(pruneMirror(root, new Set(['keep', 'gone']))).toEqual([]);
    expect(fs.existsSync(path.join(root, 'gone'))).toBe(true);
  });

  it('dryRun reports what would be pruned without deleting anything (f-45)', () => {
    const pruned = pruneMirror(root, new Set(['keep']), { dryRun: true });
    expect(pruned).toEqual(['gone']);
    // The renditions must survive a --skip-sync dry run so a later --sync-only
    // does not push the delete to S3 unseen.
    expect(fs.existsSync(path.join(root, 'gone', 'b-320w.webp'))).toBe(true);
  });
});

describe('renderIntoDir', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'slowgram-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('replaces the target dir with the rendered output on success', async () => {
    const setPath = path.join(root, 'photo');
    const tmpPath = path.join(root, '.tmp-photo');
    fs.mkdirSync(setPath);
    fs.writeFileSync(path.join(setPath, 'old.webp'), 'old');

    await renderIntoDir(setPath, tmpPath, async (tmp) => {
      fs.writeFileSync(path.join(tmp, 'new-320w.webp'), 'new');
    });

    expect(fs.readdirSync(setPath)).toEqual(['new-320w.webp']);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('leaves the existing target dir untouched when the render throws', async () => {
    const setPath = path.join(root, 'photo');
    const tmpPath = path.join(root, '.tmp-photo');
    fs.mkdirSync(setPath);
    fs.writeFileSync(path.join(setPath, 'good-1080w.webp'), 'keep me');

    await expect(
      renderIntoDir(setPath, tmpPath, async (tmp) => {
        fs.writeFileSync(path.join(tmp, 'partial.jpg'), 'half');
        throw new Error('cwebp ENOENT');
      })
    ).rejects.toThrow('cwebp ENOENT');

    expect(fs.readdirSync(setPath)).toEqual(['good-1080w.webp']);
    expect(fs.readFileSync(path.join(setPath, 'good-1080w.webp'), 'utf8')).toBe('keep me');
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('creates the target dir when it does not exist yet and the render succeeds', async () => {
    const setPath = path.join(root, 'brand-new');
    const tmpPath = path.join(root, '.tmp-brand-new');

    await renderIntoDir(setPath, tmpPath, async (tmp) => {
      fs.writeFileSync(path.join(tmp, 'x-320w.webp'), 'x');
    });

    expect(fs.readdirSync(setPath)).toEqual(['x-320w.webp']);
  });

  it('does not create the target dir when a brand-new render throws', async () => {
    const setPath = path.join(root, 'brand-new');
    const tmpPath = path.join(root, '.tmp-brand-new');

    await expect(
      renderIntoDir(setPath, tmpPath, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(fs.existsSync(setPath)).toBe(false);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('returns the render callback result', async () => {
    const setPath = path.join(root, 'photo');
    const tmpPath = path.join(root, '.tmp-photo');
    const result = await renderIntoDir(setPath, tmpPath, async () => 'done');
    expect(result).toBe('done');
  });
});

// planPhoto and reportUpdates are the I/O wrappers around the pure feed-plan
// rules: they supply the hashing and the rendition-existence check. The pure
// decisions are covered above; these exercise the wrappers themselves against a
// real temp source + mirror — most importantly the safety invariant that an
// unreadable source file is classified 'render' ('check failed') and never pruned.
describe('planPhoto', () => {
  let root;
  let photosDir;
  let mirrorDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'slowgram-'));
    photosDir = path.join(root, 'source');
    mirrorDir = path.join(root, 'mirror');
    fs.mkdirSync(photosDir);
    fs.mkdirSync(mirrorDir);
    fs.writeFileSync(path.join(photosDir, 'photo.jpg'), 'pixels');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('renders a brand-new photo and returns the source hash', async () => {
    const plan = await planPhoto({
      file: 'photo.jpg',
      photosDir,
      existing: undefined,
      rebuildAll: false,
      mirrorDir,
    });
    expect(plan).toEqual({
      action: 'render',
      reason: 'new photo',
      sourceHash: sha256OfFile(path.join(photosDir, 'photo.jpg')),
    });
  });

  it('reuses a byte-identical photo whose rendition still exists in the mirror', async () => {
    const sourceHash = sha256OfFile(path.join(photosDir, 'photo.jpg'));
    fs.mkdirSync(path.join(mirrorDir, 'photo'));
    fs.writeFileSync(path.join(mirrorDir, 'photo', 'photo-320w.webp'), 'rendition');

    const plan = await planPhoto({
      file: 'photo.jpg',
      photosDir,
      existing: { sourceHash, src: { src: 'photo-320w.webp' } },
      rebuildAll: false,
      mirrorDir,
    });
    expect(plan).toEqual({ action: 'reuse', reason: 'unchanged', sourceHash });
  });

  it('renders when the source matches but the rendition is gone from the mirror', async () => {
    const sourceHash = sha256OfFile(path.join(photosDir, 'photo.jpg'));
    // No file written under mirror/photo, so the rendition-existence check fails.
    const plan = await planPhoto({
      file: 'photo.jpg',
      photosDir,
      existing: { sourceHash, src: { src: 'photo-320w.webp' } },
      rebuildAll: false,
      mirrorDir,
    });
    expect(plan).toEqual({ action: 'render', reason: 'renditions missing', sourceHash });
  });

  it("classifies an unreadable source as a 'render' with reason 'check failed' (safety invariant)", async () => {
    // A path that cannot be read as a file (here a directory that looks like an
    // image) drives planPhoto into its catch branch, exactly as a permission
    // error or a corrupt read would. The build must then re-render it, never
    // silently drop it.
    fs.mkdirSync(path.join(photosDir, 'broken.jpg'));
    const plan = await planPhoto({
      file: 'broken.jpg',
      photosDir,
      existing: undefined,
      rebuildAll: false,
      mirrorDir,
    });
    expect(plan).toEqual({ action: 'render', reason: 'check failed' });
    expect(plan.sourceHash).toBeUndefined();
  });
});

describe('reportUpdates', () => {
  let root;
  let photosDir;
  let mirrorDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'slowgram-'));
    photosDir = path.join(root, 'source');
    mirrorDir = path.join(root, 'mirror');
    fs.mkdirSync(photosDir);
    fs.mkdirSync(mirrorDir);
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports an unreadable but present source as an image update and never prunes it (safety invariant)', async () => {
    // 'broken.jpg' is present in the source set (so it is in keepIds) but cannot
    // be read — it plans as 'check failed'. 'gone' has renditions in the mirror
    // but no source, so it is the only thing eligible for pruning.
    fs.mkdirSync(path.join(photosDir, 'broken.jpg'));
    fs.mkdirSync(path.join(mirrorDir, 'broken'));
    fs.writeFileSync(path.join(mirrorDir, 'broken', 'broken-320w.webp'), 'rendition');
    fs.mkdirSync(path.join(mirrorDir, 'gone'));
    fs.writeFileSync(path.join(mirrorDir, 'gone', 'gone-320w.webp'), 'rendition');

    const { updates, removals } = await reportUpdates(
      ['broken.jpg'],
      photosDir,
      new Map(),
      new Set(['broken']),
      mirrorDir
    );

    expect(updates).toEqual([{ id: 'broken', kind: 'image', reason: 'check failed' }]);
    // The unreadable photo is rebuilt, not pruned: it is absent from removals and
    // its mirror dir is left intact.
    expect(removals).toEqual(['gone']);
    expect(fs.existsSync(path.join(mirrorDir, 'broken'))).toBe(true);
    // dryRun: even the genuinely-gone photo's renditions are only reported.
    expect(fs.existsSync(path.join(mirrorDir, 'gone'))).toBe(true);
  });

  it('reports nothing to build when every source reuses and no source is gone', async () => {
    fs.writeFileSync(path.join(photosDir, 'photo.jpg'), 'pixels');
    const sourceHash = sha256OfFile(path.join(photosDir, 'photo.jpg'));
    fs.mkdirSync(path.join(mirrorDir, 'photo'));
    fs.writeFileSync(path.join(mirrorDir, 'photo', 'photo-320w.webp'), 'rendition');

    const existingMap = new Map([['photo', { sourceHash, src: { src: 'photo-320w.webp' } }]]);
    const { updates, removals } = await reportUpdates(
      ['photo.jpg'],
      photosDir,
      existingMap,
      new Set(['photo']),
      mirrorDir
    );

    expect(updates).toEqual([]);
    expect(removals).toEqual([]);
  });
});

describe('getColor', () => {
  it('classifies the primary hues', () => {
    expect(getColor([255, 0, 0])).toBe('red');
    expect(getColor([0, 255, 0])).toBe('green');
    expect(getColor([0, 0, 255])).toBe('blue');
  });

  it('classifies cyan/teal (hue 150-180) as blue instead of falling through to gray', () => {
    // rgb(0,180,160) is hue ~173: above green's 150 ceiling but below the old
    // blue floor of 180, so it used to leak into the gray fallback.
    expect(getColor([0, 180, 160])).toBe('blue');
  });

  it('keeps the green/blue seam contiguous around hue 150', () => {
    // The fix moved blue's floor from 180 to 150. Pixels just below the seam
    // stay green; just above, they become blue — no gap, no double-gray.
    expect(getColor([0, 255, 127])).toBe('green'); // hue ~149.9
    expect(getColor([0, 255, 128])).toBe('blue'); // hue ~150.1
  });

  it('still treats desaturated pixels as grayscale', () => {
    expect(getColor([128, 128, 128])).toBe('gray');
    expect(getColor([10, 10, 10])).toBe('black');
    expect(getColor([245, 245, 245])).toBe('white');
  });
});

describe('summarizeColorCounts', () => {
  it('converts tallies to percentages sorted by population descending', () => {
    expect(summarizeColorCounts({ red: 30, blue: 10 })).toEqual([
      { color: 'red', population: 75 },
      { color: 'blue', population: 25 },
    ]);
  });

  it('rounds percentages, which need not sum to 100', () => {
    // 1/3 each → 33 after rounding, so the populations sum to 99, not 100.
    expect(summarizeColorCounts({ red: 1, green: 1, blue: 1 })).toEqual([
      { color: 'red', population: 33 },
      { color: 'green', population: 33 },
      { color: 'blue', population: 33 },
    ]);
  });

  it('returns [] for an all-zero tally instead of NaN populations', () => {
    expect(summarizeColorCounts({ gray: 0, blue: 0 })).toEqual([]);
  });

  it('returns [] for an empty tally', () => {
    expect(summarizeColorCounts({})).toEqual([]);
  });
});
