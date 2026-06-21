import { describe, it, expect } from 'vitest';
import { decodeSlug, PHOTO_PATH_PATTERN } from '../src/index';
import { photoPath } from '../src/photo-id';

const photo = (folder) => ({ src: { path: `https://cdn/${folder}` } });

describe('decodeSlug', () => {
  it('decodes a normal slug', () => {
    expect(decodeSlug('summer-trip')).toBe('summer-trip');
  });

  it('decodes percent-encoded characters', () => {
    expect(decodeSlug('caf%C3%A9')).toBe('caf\u00e9');
  });

  it('decodes spaces encoded as %20', () => {
    expect(decodeSlug('my%20photo')).toBe('my photo');
  });

  it('returns null for malformed encoding', () => {
    expect(decodeSlug('%E0%A4%A')).toBeNull();
  });

  it('passes through already-decoded strings', () => {
    expect(decodeSlug('hello-world')).toBe('hello-world');
  });
});

describe('URL pattern matching', () => {
  const pattern = PHOTO_PATH_PATTERN;

  it('matches /photo/name', () => {
    const match = '/photo/summer-trip'.match(pattern);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('summer-trip');
  });

  it('matches /photo/ with encoded characters', () => {
    const match = '/photo/caf%C3%A9'.match(pattern);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('caf%C3%A9');
  });

  it('does not match root', () => {
    expect('/'.match(pattern)).toBeNull();
  });

  it('does not match /photo/ with no name', () => {
    expect('/photo/'.match(pattern)).toBeNull();
  });

  it('does not match /photos/name', () => {
    expect('/photos/name'.match(pattern)).toBeNull();
  });

  it('matches paths with slashes in the name', () => {
    const match = '/photo/2024/summer-trip'.match(pattern);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('2024/summer-trip');
  });
});

describe('photoPath', () => {
  it('builds /photo/{slug} for a plain ASCII folder name', () => {
    expect(photoPath(photo('summer-trip'))).toBe('/photo/summer-trip');
  });

  it('percent-encodes characters that would break the URL or decodeSlug', () => {
    expect(photoPath(photo('my photo'))).toBe('/photo/my%20photo');
    expect(photoPath(photo('café'))).toBe('/photo/caf%C3%A9');
    expect(photoPath(photo('a#b?c%d'))).toBe('/photo/a%23b%3Fc%25d');
  });

  it('round-trips through the PHOTO_PATH_PATTERN reader and decodeSlug', () => {
    for (const folder of ['summer-trip', 'my photo', 'café', 'a#b?c%d']) {
      const match = photoPath(photo(folder)).match(PHOTO_PATH_PATTERN);
      expect(match).not.toBeNull();
      expect(decodeSlug(match[1])).toBe(folder);
    }
  });
});
