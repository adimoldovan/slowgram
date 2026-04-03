import { describe, it, expect } from 'vitest';
import { getVisiblePhotoIndices } from '../src/photos';

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

describe('color extraction logic', () => {
  it('extracts unique colors from photos', () => {
    const allColors = [
      ...new Set(
        samplePhotos
          .filter((photo) => photo.colors && Array.isArray(photo.colors))
          .flatMap((photo) => photo.colors.map((colorObj) => colorObj.color)),
      ),
    ].filter(Boolean);

    expect(allColors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });

  it('handles photos without colors', () => {
    const photos = [
      { src: { path: '/a', src: 'f.webp', set: ['t.webp 320w'] } },
      {
        src: { path: '/b', src: 'f.webp', set: ['t.webp 320w'] },
        colors: [{ color: '#abc', population: 1 }],
      },
    ];

    const allColors = [
      ...new Set(
        photos
          .filter((photo) => photo.colors && Array.isArray(photo.colors))
          .flatMap((photo) => photo.colors.map((colorObj) => colorObj.color)),
      ),
    ].filter(Boolean);

    expect(allColors).toEqual(['#abc']);
  });
});

describe('color filtering sort order', () => {
  it('sorts matching photos by population desc, then original order asc', () => {
    // Simulate the sort logic from filterPhotosByColor
    const color = '#ff0000';
    const matchingItems = samplePhotos
      .map((photo, index) => {
        const colorData = photo.colors?.find((c) => c.color === color);
        if (!colorData) return null;
        return { population: colorData.population, originalOrder: index };
      })
      .filter(Boolean);

    matchingItems.sort((a, b) => {
      if (b.population !== a.population) return b.population - a.population;
      return a.originalOrder - b.originalOrder;
    });

    // photo-c (population 20) should come before photo-a (population 10)
    expect(matchingItems).toEqual([
      { population: 20, originalOrder: 2 },
      { population: 10, originalOrder: 0 },
    ]);
  });

  it('breaks population ties by original order', () => {
    const photos = [
      { colors: [{ color: 'red', population: 5 }] },
      { colors: [{ color: 'red', population: 5 }] },
      { colors: [{ color: 'red', population: 5 }] },
    ];

    const matchingItems = photos
      .map((photo, index) => {
        const colorData = photo.colors?.find((c) => c.color === 'red');
        return { population: colorData.population, originalOrder: index };
      })
      .filter(Boolean);

    matchingItems.sort((a, b) => {
      if (b.population !== a.population) return b.population - a.population;
      return a.originalOrder - b.originalOrder;
    });

    expect(matchingItems.map((i) => i.originalOrder)).toEqual([0, 1, 2]);
  });
});

describe('thumbnail srcset building', () => {
  it('filters out sizes larger than 800w for thumbnails', () => {
    const photo = {
      src: {
        path: '/photos/test',
        src: 'full.webp',
        set: ['thumb.webp 320w', 'medium.webp 800w', 'large.webp 1920w'],
      },
    };

    const thumbnailSet = photo.src.set
      .filter((pair) => parseInt(pair.split(' ')[1], 10) <= 800)
      .map((pair) => {
        const parts = pair.split(' ');
        return `${photo.src.path}/${parts[0]} ${parts[1]}`;
      })
      .join(', ');

    expect(thumbnailSet).toBe('/photos/test/thumb.webp 320w, /photos/test/medium.webp 800w');
  });

  it('uses first set entry as thumbnail src', () => {
    const photo = {
      src: {
        path: '/photos/test',
        src: 'full.webp',
        set: ['thumb.webp 320w', 'medium.webp 800w'],
      },
    };

    const [minSize] = photo.src.set[0].split(' ');
    const thumbnailSrc = `${photo.src.path}/${minSize}`;

    expect(thumbnailSrc).toBe('/photos/test/thumb.webp');
  });
});
