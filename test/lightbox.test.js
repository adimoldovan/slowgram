import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  photoSlug,
  getNextIndex,
  createLightbox,
  loadLightboxImage,
  initLightboxes,
  getOrCreateLightbox,
  openLightboxByName,
} from '../src/lightbox';

// The lightbox registry is module-level singleton state. Reset it before every
// test so isolation is explicit rather than relying on each test to re-init.
beforeEach(() => {
  initLightboxes([], null);
});

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

  it('gives the glyph buttons accessible names via aria-label', () => {
    const { dialog } = createLightbox(photo, 0);
    expect(dialog.querySelector('.close').getAttribute('aria-label')).toBe('Close');
    expect(dialog.querySelector('.next').getAttribute('aria-label')).toBe('Next photo');
    expect(dialog.querySelector('.prev').getAttribute('aria-label')).toBe('Previous photo');
  });

  it('sets a descriptive alt on the image from the photo metadata', () => {
    const { lightboxImg } = createLightbox({ ...photo, title: 'Misty morning' }, 0);
    expect(lightboxImg.alt).toBe('Misty morning');
  });

  it('falls back to the photo id when the photo has no title or location', () => {
    const { lightboxImg } = createLightbox(photo, 2);
    expect(lightboxImg.alt).toBe('test-photo');
  });
});

describe('getOrCreateLightbox', () => {
  const makePhoto = (slug) => ({
    src: {
      path: `/photos/${slug}`,
      src: 'full.webp',
      set: ['thumb.webp 320w', 'full.webp 1920w'],
    },
  });

  const photos = [makePhoto('photo-a'), makePhoto('photo-b')];

  it('builds the dialog lazily on first access and appends it to the container', () => {
    const container = document.createElement('div');
    initLightboxes(photos, container);

    expect(container.children.length).toBe(0);

    const dialog = getOrCreateLightbox(1);
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.id).toBe('lightbox-1');
    expect(dialog.dataset.photoName).toBe('photo-b');
    expect(container.children.length).toBe(1);
    expect(container.contains(dialog)).toBe(true);
  });

  it('caches the dialog so repeated access returns the same node', () => {
    const container = document.createElement('div');
    initLightboxes(photos, container);

    const first = getOrCreateLightbox(0);
    const second = getOrCreateLightbox(0);
    expect(second).toBe(first);
    expect(container.children.length).toBe(1);
  });

  it('returns null for an out-of-range index', () => {
    const container = document.createElement('div');
    initLightboxes(photos, container);

    expect(getOrCreateLightbox(5)).toBeNull();
    expect(container.children.length).toBe(0);
  });

  it('returns null before initLightboxes registers a container', () => {
    initLightboxes([], null);
    expect(getOrCreateLightbox(0)).toBeNull();
  });
});

describe('openLightboxByName', () => {
  const makePhoto = (slug) => ({
    src: {
      path: `/photos/${slug}`,
      src: 'full.webp',
      set: ['thumb.webp 320w', 'full.webp 1920w'],
    },
  });

  const photos = [makePhoto('photo-a'), makePhoto('photo-b')];

  let replaceSpy;
  let showModalMock;

  beforeEach(() => {
    // jsdom does not implement showModal and has no matchMedia; stub both so the
    // open flow runs without touching real layout.
    showModalMock = vi.fn();
    HTMLDialogElement.prototype.showModal = showModalMock;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    replaceSpy = vi.spyOn(history, 'replaceState');
  });

  afterEach(() => {
    delete HTMLDialogElement.prototype.showModal;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the lazily-created dialog matching the slug and updates the URL', () => {
    const container = document.createElement('div');
    initLightboxes(photos, container);

    openLightboxByName('photo-b');

    const dialog = container.querySelector('#lightbox-1');
    expect(dialog).not.toBeNull();
    expect(showModalMock).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenLastCalledWith(null, '', '/photo/photo-b');
  });

  it('falls back to root for an unknown slug without creating a dialog', () => {
    const container = document.createElement('div');
    initLightboxes(photos, container);

    openLightboxByName('does-not-exist');

    expect(container.children.length).toBe(0);
    expect(replaceSpy).toHaveBeenLastCalledWith(null, '', '/');
  });
});

describe('loadLightboxImage', () => {
  // `cached: true` models a cached image, which reports `complete` synchronously
  // once `src` is assigned — so the test proves the guard reads `complete` after
  // setting `src`, not before.
  const makeImg = (overrides = {}) => {
    const { cached = false, ...rest } = overrides;
    let srcValue = rest.src ?? '';
    const img = {
      style: {},
      dataset: { src: 'full.webp', srcset: 'full.webp 1920w', sizes: '100vw' },
      srcset: '',
      sizes: '',
      complete: false,
      onload: null,
      onerror: null,
      ...rest,
    };
    Object.defineProperty(img, 'src', {
      get: () => srcValue,
      set(value) {
        srcValue = value;
        if (cached) img.complete = true;
      },
      configurable: true,
      enumerable: true,
    });
    return img;
  };

  it('assigns src/srcset/sizes from data attributes and starts hidden', () => {
    const img = makeImg();
    loadLightboxImage(img);
    expect(img.src).toBe('full.webp');
    expect(img.srcset).toBe('full.webp 1920w');
    expect(img.sizes).toBe('100vw');
    expect(img.style.opacity).toBe('0');
  });

  it('wires handlers before they could be missed by a cached load', () => {
    const img = makeImg();
    loadLightboxImage(img);
    expect(typeof img.onload).toBe('function');
    expect(typeof img.onerror).toBe('function');
  });

  it('reveals the image on load', () => {
    const img = makeImg();
    loadLightboxImage(img);
    img.onload();
    expect(img.style.opacity).toBe('1');
    expect(img.style.transform).toBe('translate(-50%, -50%) scale(1)');
    expect(img.onload).toBeNull();
    expect(img.onerror).toBeNull();
  });

  it('reveals the image on error so it never stays invisible', () => {
    const img = makeImg();
    loadLightboxImage(img);
    img.onerror();
    expect(img.style.opacity).toBe('1');
    expect(img.onload).toBeNull();
    expect(img.onerror).toBeNull();
  });

  it('reveals immediately when the image is already complete (cached)', () => {
    const img = makeImg({ cached: true });
    loadLightboxImage(img);
    expect(img.style.opacity).toBe('1');
    expect(img.style.transform).toBe('translate(-50%, -50%) scale(1)');
    expect(img.onload).toBeNull();
    expect(img.onerror).toBeNull();
  });

  it('does nothing when src is already set', () => {
    const img = makeImg({ src: 'already.webp' });
    loadLightboxImage(img);
    expect(img.style.opacity).toBeUndefined();
    expect(img.onload).toBeNull();
  });

  it('does nothing when there is no data src', () => {
    const img = makeImg({ dataset: {} });
    loadLightboxImage(img);
    expect(img.src).toBe('');
    expect(img.onload).toBeNull();
  });
});
