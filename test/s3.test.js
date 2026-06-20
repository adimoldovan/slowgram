import { describe, it, expect } from 'vitest';
import { planSync, contentTypeFor, cacheControlFor, safeMirrorPath } from '../bin/s3.mjs';

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

  it('skips a content-hashed file whose md5 matches the remote ETag', () => {
    const local = [{ ...f('feed.json', 100), md5: 'abc123' }];
    const remote = [{ key: 'feed.json', size: 100, eTag: '"abc123"' }];
    const { toUpload } = planSync(local, remote);
    expect(toUpload).toEqual([]);
  });

  it('uploads a content-hashed file whose content changed despite equal size', () => {
    const local = [{ ...f('rss.xml', 100), md5: 'newhash' }];
    const remote = [{ key: 'rss.xml', size: 100, eTag: '"oldhash"' }];
    const { toUpload } = planSync(local, remote);
    expect(toUpload.map((u) => u.key)).toEqual(['rss.xml']);
  });

  it('uploads a content-hashed file that is missing remotely', () => {
    const local = [{ ...f('feed.json', 100), md5: 'abc123' }];
    const remote = [];
    const { toUpload } = planSync(local, remote);
    expect(toUpload.map((u) => u.key)).toEqual(['feed.json']);
  });

  it('re-uploads when the remote ETag is multipart (cannot prove equality)', () => {
    const local = [{ ...f('feed.json', 100), md5: 'abc123' }];
    const remote = [{ key: 'feed.json', size: 100, eTag: '"abc123-2"' }];
    const { toUpload } = planSync(local, remote);
    expect(toUpload.map((u) => u.key)).toEqual(['feed.json']);
  });
});

describe('safeMirrorPath', () => {
  const mirror = '/tmp/mirror';

  it('resolves normal nested keys inside the mirror', () => {
    expect(safeMirrorPath(mirror, 'sunset/sunset-1920w.webp')).toBe(
      '/tmp/mirror/sunset/sunset-1920w.webp'
    );
    expect(safeMirrorPath(mirror, 'feed.json')).toBe('/tmp/mirror/feed.json');
  });

  it('rejects keys that escape the mirror via ..', () => {
    expect(safeMirrorPath(mirror, '../etc/passwd')).toBeNull();
    expect(safeMirrorPath(mirror, '../../etc/passwd')).toBeNull();
    expect(safeMirrorPath(mirror, 'a/../../b')).toBeNull();
  });

  it('rejects absolute keys, NUL bytes and empty keys', () => {
    expect(safeMirrorPath(mirror, '/etc/passwd')).toBeNull();
    expect(safeMirrorPath(mirror, 'a\0b')).toBeNull();
    expect(safeMirrorPath(mirror, '')).toBeNull();
    expect(safeMirrorPath(mirror, 42)).toBeNull();
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
