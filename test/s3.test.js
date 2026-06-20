import { describe, it, expect } from 'vitest';
import { planSync, contentTypeFor, cacheControlFor } from '../bin/s3.mjs';

const f = (key, size) => ({ key, size, absPath: `/abs/${key}` });

describe('planSync', () => {
  it('uploads new and size-changed files, skips unchanged', () => {
    const local = [f('a/x-320w.webp', 100), f('a/y-320w.webp', 200), f('b/z-320w.webp', 50)];
    const remote = [
      { key: 'a/x-320w.webp', size: 100 }, // unchanged
      { key: 'a/y-320w.webp', size: 999 }, // changed size
      // b/z is new
    ];
    const { toUpload, toDelete } = planSync(local, remote);
    expect(toUpload.map((u) => u.key).sort()).toEqual(['a/y-320w.webp', 'b/z-320w.webp']);
    expect(toDelete).toEqual([]);
  });

  it('deletes remote keys not present locally', () => {
    const local = [f('keep.webp', 10)];
    const remote = [
      { key: 'keep.webp', size: 10 },
      { key: 'gone/old-320w.webp', size: 77 },
    ];
    const { toUpload, toDelete } = planSync(local, remote);
    expect(toUpload).toEqual([]);
    expect(toDelete).toEqual(['gone/old-320w.webp']);
  });

  it('always uploads listed keys even when size matches', () => {
    const local = [f('feed.json', 100), f('rss.xml', 100), f('a.webp', 100)];
    const remote = [
      { key: 'feed.json', size: 100 },
      { key: 'rss.xml', size: 100 },
      { key: 'a.webp', size: 100 },
    ];
    const { toUpload } = planSync(local, remote, ['feed.json', 'rss.xml']);
    expect(toUpload.map((u) => u.key).sort()).toEqual(['feed.json', 'rss.xml']);
  });
});

describe('contentTypeFor', () => {
  it('maps images and feed files', () => {
    expect(contentTypeFor('a/b-320w.webp')).toBe('image/webp');
    expect(contentTypeFor('photo.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('feed.json')).toBe('application/json');
    expect(contentTypeFor('rss.xml')).toBe('application/rss+xml; charset=utf-8');
  });
  it('falls back to octet-stream', () => {
    expect(contentTypeFor('weird.bin')).toBe('application/octet-stream');
  });
});

describe('cacheControlFor', () => {
  it('gives rss.xml a short cache and leaves others undefined', () => {
    expect(cacheControlFor('rss.xml')).toBe('public, max-age=900');
    expect(cacheControlFor('feed.json')).toBeUndefined();
    expect(cacheControlFor('a/b-320w.webp')).toBeUndefined();
  });
});
