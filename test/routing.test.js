import { describe, it, expect } from 'vitest';
import { decodeSlug } from '../src/index';

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
  const pattern = /^\/photo\/(.+)$/;

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
