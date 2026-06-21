import { describe, it, expect } from 'vitest';
import { photoAlt } from '../src/photo-alt.js';

describe('photoAlt', () => {
  it('prefers the photo title when present', () => {
    expect(photoAlt({ title: 'Sunrise over the lake' }, 0)).toBe('Sunrise over the lake');
  });

  it('trims whitespace-only titles and falls through', () => {
    expect(photoAlt({ title: '   ', location: { city: 'Cluj', country: 'Romania' } }, 0)).toBe(
      'Cluj, Romania'
    );
  });

  it('falls back to the location when there is no title', () => {
    expect(photoAlt({ location: { city: 'Cluj', country: 'Romania' } }, 0)).toBe('Cluj, Romania');
  });

  it('uses the state when there is no city', () => {
    expect(photoAlt({ location: { state: 'Transylvania', country: 'Romania' } }, 0)).toBe(
      'Transylvania, Romania'
    );
  });

  it('falls back to the photo id before the generic label', () => {
    expect(photoAlt({ src: { path: '/photos/summer-trip' } }, 4)).toBe('summer-trip');
  });

  it('falls back to a generic indexed label when nothing is available', () => {
    expect(photoAlt({}, 4)).toBe('Photo 5');
    expect(photoAlt({ src: {} }, 4)).toBe('Photo 5');
  });

  it('handles a null/undefined photo without throwing', () => {
    expect(photoAlt(undefined, 0)).toBe('Photo 1');
    expect(photoAlt(null, 2)).toBe('Photo 3');
  });
});
