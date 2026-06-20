import { describe, it, expect, vi, afterEach } from 'vitest';
import getPhotosGallery, {
  getVisiblePhotoIndices,
  extractColors,
  compareByPopulation,
  buildThumbnail,
} from '../src/photos';
import config from '../config.json';

const samplePhotos = [
  {
    src: {
      path: '/photos/photo-a',
      src: 'full.webp',
      set: ['thumb.webp 320w', 'full.webp 800w'],
    },
    colors: [
      { color: '#ff0000', population: 10 },
      { color: '#00ff00', population: 5 },
    ],
  },
  {
    src: {
      path: '/photos/photo-b',
      src: 'full.webp',
      set: ['thumb.webp 320w', 'full.webp 800w'],
    },
    colors: [{ color: '#0000ff', population: 8 }],
  },
  {
    src: {
      path: '/photos/photo-c',
      src: 'full.webp',
      set: ['thumb.webp 320w', 'full.webp 800w'],
    },
    colors: [
      { color: '#ff0000', population: 20 },
      { color: '#0000ff', population: 3 },
    ],
  },
];

describe('feed fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bypasses the HTTP cache so a new feed is loaded, not the immutable cached copy', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock);

    await getPhotosGallery();

    expect(fetchMock).toHaveBeenCalledWith(
      config.feed.url,
      expect.objectContaining({ cache: 'reload' }),
    );
  });
});

describe('getVisiblePhotoIndices', () => {
  it('returns an array (defaults to empty before gallery loads)', () => {
    const indices = getVisiblePhotoIndices();
    expect(Array.isArray(indices)).toBe(true);
  });

  it('returns a copy, not the internal reference', () => {
    const a = getVisiblePhotoIndices();
    const b = getVisiblePhotoIndices();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('extractColors', () => {
  it('extracts unique colors from photos', () => {
    expect(extractColors(samplePhotos)).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });

  it('handles photos without colors', () => {
    const photos = [
      { src: { path: '/a', src: 'f.webp', set: ['t.webp 320w'] } },
      {
        src: { path: '/b', src: 'f.webp', set: ['t.webp 320w'] },
        colors: [{ color: '#abc', population: 1 }],
      },
    ];

    expect(extractColors(photos)).toEqual(['#abc']);
  });
});

describe('compareByPopulation', () => {
  it('sorts matching photos by population desc, then original order asc', () => {
    const color = '#ff0000';
    const matchingItems = samplePhotos
      .map((photo, index) => {
        const colorData = photo.colors?.find((c) => c.color === color);
        if (!colorData) return null;
        return { population: colorData.population, originalOrder: index };
      })
      .filter(Boolean);

    matchingItems.sort(compareByPopulation);

    // photo-c (population 20) should come before photo-a (population 10)
    expect(matchingItems).toEqual([
      { population: 20, originalOrder: 2 },
      { population: 10, originalOrder: 0 },
    ]);
  });

  it('breaks population ties by original order', () => {
    const matchingItems = [
      { population: 5, originalOrder: 0 },
      { population: 5, originalOrder: 1 },
      { population: 5, originalOrder: 2 },
    ];

    matchingItems.sort(compareByPopulation);

    expect(matchingItems.map((i) => i.originalOrder)).toEqual([0, 1, 2]);
  });
});

describe('buildThumbnail', () => {
  it('filters out sizes larger than 800w for thumbnails', () => {
    const { srcset } = buildThumbnail({
      path: '/photos/test',
      src: 'full.webp',
      set: ['thumb.webp 320w', 'medium.webp 800w', 'large.webp 1920w'],
    });

    expect(srcset).toBe('/photos/test/thumb.webp 320w, /photos/test/medium.webp 800w');
  });

  it('uses first set entry as thumbnail src', () => {
    const { src } = buildThumbnail({
      path: '/photos/test',
      src: 'full.webp',
      set: ['thumb.webp 320w', 'medium.webp 800w'],
    });

    expect(src).toBe('/photos/test/thumb.webp');
  });
});
