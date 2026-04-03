import { describe, it, expect } from 'vitest';
import { photoSlug, getNextIndex, createLightbox } from '../src/lightbox';

describe('photoSlug', () => {
  it('extracts the last path segment', () => {
    const photo = { src: { path: '/photos/summer-trip' } };
    expect(photoSlug(photo)).toBe('summer-trip');
  });

  it('strips trailing dashes', () => {
    const photo = { src: { path: '/photos/summer-trip--' } };
    expect(photoSlug(photo)).toBe('summer-trip');
  });

  it('handles deeply nested paths', () => {
    const photo = { src: { path: '/a/b/c/photo-name' } };
    expect(photoSlug(photo)).toBe('photo-name');
  });

  it('handles single segment path', () => {
    const photo = { src: { path: '/my-photo' } };
    expect(photoSlug(photo)).toBe('my-photo');
  });

  it('returns empty string for empty path', () => {
    const photo = { src: { path: '' } };
    expect(photoSlug(photo)).toBe('');
  });
});

describe('getNextIndex', () => {
  const indices = [0, 1, 2, 3, 4];

  it('moves forward by one', () => {
    expect(getNextIndex(2, 1, indices)).toBe(3);
  });

  it('moves backward by one', () => {
    expect(getNextIndex(2, -1, indices)).toBe(1);
  });

  it('wraps forward from last to first', () => {
    expect(getNextIndex(4, 1, indices)).toBe(0);
  });

  it('wraps backward from first to last', () => {
    expect(getNextIndex(0, -1, indices)).toBe(4);
  });

  it('returns -1 for empty indices', () => {
    expect(getNextIndex(0, 1, [])).toBe(-1);
  });

  it('returns -1 if current index not in visible list', () => {
    expect(getNextIndex(5, 1, indices)).toBe(-1);
  });

  it('works with non-contiguous indices (filtered photos)', () => {
    const filtered = [0, 3, 7, 12];
    expect(getNextIndex(3, 1, filtered)).toBe(7);
    expect(getNextIndex(3, -1, filtered)).toBe(0);
    expect(getNextIndex(12, 1, filtered)).toBe(0);
    expect(getNextIndex(0, -1, filtered)).toBe(12);
  });

  it('handles single item', () => {
    expect(getNextIndex(5, 1, [5])).toBe(5);
    expect(getNextIndex(5, -1, [5])).toBe(5);
  });
});

describe('createLightbox', () => {
  const photo = {
    src: {
      path: '/photos/test-photo',
      src: 'full.webp',
      set: ['thumb.webp 320w', 'medium.webp 800w', 'full.webp 1920w'],
    },
    colors: [{ color: '#ff0000', population: 10 }],
  };

  it('creates a dialog element', () => {
    const { dialog } = createLightbox(photo, 0);
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.className).toBe('lightbox');
    expect(dialog.id).toBe('lightbox-0');
  });

  it('sets the photo name as a data attribute', () => {
    const { dialog } = createLightbox(photo, 0);
    expect(dialog.dataset.photoName).toBe('test-photo');
  });

  it('creates an image with deferred srcset via data attributes', () => {
    const { lightboxImg } = createLightbox(photo, 0);
    expect(lightboxImg.dataset.src).toBe('/photos/test-photo/full.webp');
    expect(lightboxImg.dataset.srcset).toContain('/photos/test-photo/thumb.webp 320w');
    expect(lightboxImg.dataset.srcset).toContain('/photos/test-photo/full.webp 1920w');
  });

  it('includes close, next, and prev buttons', () => {
    const { dialog } = createLightbox(photo, 0);
    const buttons = dialog.querySelectorAll('button.slideshow-nav');
    expect(buttons.length).toBe(3);
    expect(dialog.querySelector('.close')).not.toBeNull();
    expect(dialog.querySelector('.next')).not.toBeNull();
    expect(dialog.querySelector('.prev')).not.toBeNull();
  });
});
