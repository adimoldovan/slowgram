import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderIntoDir, entryAfterRender } from '../bin/feed-render.mjs';
import { extractMeta } from '../bin/feed-meta.mjs';
import { formatLocation } from '../bin/rss.mjs';

describe('extractMeta', () => {
  const base = { DateTimeOriginal: '2024:03:15 09:30:00' };

  it('parses DateTimeOriginal into a timestamp and keeps the original string', () => {
    const meta = extractMeta(base);
    expect(meta.dateTaken.original).toBe('2024:03:15 09:30:00');
    expect(meta.dateTaken.timestamp).toBe(Date.parse('2024-03-15T09:30:00'));
  });

  it('joins Make and Model into camera', () => {
    expect(extractMeta({ ...base, Make: 'Fujifilm', Model: 'X100V' }).camera).toBe('Fujifilm X100V');
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

describe('formatLocation', () => {
  it('shows the city when present', () => {
    expect(formatLocation({ city: 'Cluj', state: 'Cluj', country: 'Romania' })).toBe('Cluj, Romania');
  });

  it('falls back to the state when there is no city', () => {
    expect(formatLocation({ state: 'Bavaria', country: 'Germany' })).toBe('Bavaria, Germany');
  });

  it('returns the country alone when there is no city or state', () => {
    expect(formatLocation({ country: 'Romania' })).toBe('Romania');
  });

  it('ignores whitespace-only fields', () => {
    expect(formatLocation({ city: '  ', state: 'Bavaria', country: ' Germany ' })).toBe('Bavaria, Germany');
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
