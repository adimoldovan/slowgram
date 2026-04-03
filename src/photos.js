import config from '../config.json';
import { createLightbox, openLightbox } from './lightbox';

// Module-scoped state instead of window global
let visiblePhotoIndices = [];

export function getVisiblePhotoIndices() {
  return [...visiblePhotoIndices];
}

function filterPhotosByColor(color, count, photos) {
  const galleryItems = document.querySelectorAll('.gallery-item');

  const matchingItems = [];
  galleryItems.forEach((item) => {
    const photoColors = item.dataset.colors ? item.dataset.colors.split(',') : [];
    const photoIndex = parseInt(item.id.replace('p', ''), 10);
    const photo = photos[photoIndex];

    if (photoColors.includes(color)) {
      const colorData = photo.colors?.find((c) => c.color === color);
      const population = colorData ? colorData.population : 0;
      matchingItems.push({ element: item, population, originalOrder: photoIndex });
    } else {
      item.style.display = 'none';
    }
  });

  matchingItems.sort((a, b) => {
    if (b.population !== a.population) return b.population - a.population;
    return a.originalOrder - b.originalOrder;
  });

  visiblePhotoIndices = [];
  matchingItems.forEach((item, index) => {
    item.element.style.display = 'block';
    item.element.style.order = index;
    visiblePhotoIndices.push(item.originalOrder);
  });

  count.textContent = `${matchingItems.length} photo${matchingItems.length === 1 ? '' : 's'}`;
}

function showAllPhotos(photos, count) {
  const galleryItems = document.querySelectorAll('.gallery-item');
  galleryItems.forEach((item) => {
    item.style.display = 'block';
    item.style.order = '';
  });

  visiblePhotoIndices = photos.map((_, index) => index);
  count.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
}

export default async function getPhotosGallery() {
  const container = document.createElement('div');
  container.className = 'container';

  const gallery = document.createElement('div');
  gallery.id = 'gallery';
  gallery.className = 'gallery';

  let photos;
  try {
    const response = await fetch(config.feed.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    photos = await response.json();
  } catch {
    container.textContent = 'Could not load photos.';
    return container;
  }

  // Extract unique colors, sorted by hue
  function hexToHue(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  const allColors = [
    ...new Set(
      photos
        .filter((photo) => photo.colors && Array.isArray(photo.colors))
        .flatMap((photo) => photo.colors.map((colorObj) => colorObj.color))
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => hexToHue(a) - hexToHue(b));

  const count = document.createElement('span');
  count.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
  count.className = 'counter';
  container.appendChild(count);

  // Color filter bar
  if (allColors.length > 0) {
    const filterOuter = document.createElement('div');
    filterOuter.className = 'color-filter-outer';

    const filterScroll = document.createElement('div');
    filterScroll.className = 'color-filter-scroll';

    const filterTrack = document.createElement('div');
    filterTrack.className = 'color-filter-track';

    const segWidth = 38;
    const setSize = allColors.length + 1; // colors + "All" segment
    const oneSetWidth = setSize * segWidth;

    let selectedColor = null;

    // Build a smooth continuous gradient for the track background
    // One set: [all-rainbow, color0, color1, ..., colorN]
    // Each segment occupies segWidth pixels
    function buildTrackGradient() {
      const stops = [];
      const allRainbow = allColors.slice(0, 6);
      // "All" segment: mini rainbow within its width
      const allStopCount = allRainbow.length;
      for (let i = 0; i < allStopCount; i++) {
        const pct = (i / (allStopCount - 1)) * segWidth;
        stops.push(`${allRainbow[i]} ${pct}px`);
      }
      // Color segments: mostly solid with short blend at edges
      allColors.forEach((color, i) => {
        const start = (i + 1) * segWidth;
        const end = (i + 2) * segWidth;
        stops.push(`${color} ${start}px`);
        stops.push(`${color} ${end - segWidth * 0.1}px`);
      });
      return `linear-gradient(to right, ${stops.join(', ')})`;
    }

    const allGradient = `linear-gradient(135deg, ${allColors.slice(0, 6).join(', ')})`;

    function createAllSegment() {
      const seg = document.createElement('div');
      seg.className = 'color-bar-all';
      seg.dataset.type = 'all';
      return seg;
    }

    function createColorSegment(color) {
      const seg = document.createElement('div');
      seg.className = 'color-bar-segment';
      seg.title = color;
      seg.dataset.color = color;
      // Store color for selected state
      seg.dataset.bg = color;
      return seg;
    }

    let highlightedColor; // track what's visually highlighted

    function highlightCenteredSegment() {
      const scrollCenter = filterScroll.scrollLeft + filterScroll.clientWidth / 2;
      const centeredIndex = Math.floor(scrollCenter / segWidth) % setSize;
      const color = centeredIndex === 0 ? null : allColors[centeredIndex - 1];

      if (color === highlightedColor) return;
      highlightedColor = color;

      filterTrack.querySelectorAll('.selected').forEach((el) => {
        el.classList.remove('selected');
        el.style.background = 'transparent';
      });

      if (color === null) {
        filterTrack.querySelectorAll('.color-bar-all').forEach((el) => {
          el.classList.add('selected');
          el.style.background = allGradient;
        });
      } else {
        filterTrack.querySelectorAll(`[data-color="${color}"]`).forEach((el) => {
          el.classList.add('selected');
          el.style.background = color;
        });
      }
    }

    function applyCenteredFilter() {
      if (highlightedColor === selectedColor) return;
      selectedColor = highlightedColor;
      if (selectedColor === null) {
        showAllPhotos(photos, count);
      } else {
        filterPhotosByColor(selectedColor, count, photos);
      }
    }

    // Build 3 copies for infinite scroll
    for (let rep = 0; rep < 3; rep++) {
      filterTrack.appendChild(createAllSegment());
      allColors.forEach((color) => {
        filterTrack.appendChild(createColorSegment(color));
      });
    }

    // Apply smooth gradient as track background, repeating for 3 copies
    const singleGradient = buildTrackGradient();
    const oneSetPx = (allColors.length + 1) * segWidth;
    filterTrack.style.backgroundImage = singleGradient;
    filterTrack.style.backgroundSize = `${oneSetPx}px 100%`;
    filterTrack.style.backgroundRepeat = 'repeat-x';

    filterScroll.appendChild(filterTrack);
    filterOuter.appendChild(filterScroll);

    // Cap width so only one set of colors is visible at most
    filterOuter.style.maxWidth = `${oneSetWidth}px`;
    filterOuter.style.margin = '0.5rem auto';

    container.appendChild(filterOuter);

    // Center the "All" segment once the element is in the DOM and has layout
    // "All" is selected by default
    filterTrack.querySelectorAll('.color-bar-all').forEach((el) => {
      el.classList.add('selected');
      el.style.background = allGradient;
    });
    requestAnimationFrame(() => {
      filterScroll.scrollLeft = oneSetWidth - filterScroll.clientWidth / 2 + segWidth / 2;
    });

    let ticking = false;
    let filterTimeout = null;
    filterScroll.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const sl = filterScroll.scrollLeft;
        if (sl < oneSetWidth * 0.3) {
          filterScroll.scrollLeft = sl + oneSetWidth;
        } else if (sl > oneSetWidth * 1.7) {
          filterScroll.scrollLeft = sl - oneSetWidth;
        }
        // Highlight follows center immediately
        highlightCenteredSegment();
        ticking = false;
      });

      // Debounce: apply the actual photo filter after scrolling settles
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(applyCenteredFilter, 150);
    });
  }

  photos.forEach((photo, index) => {
    const link = document.createElement('a');
    link.id = `p${index}`;
    link.href = '#';
    link.className = 'gallery-item';
    link.dataset.colors = (photo.colors || []).map((colorObj) => colorObj.color).join(',');

    link.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(index);
    });

    const thumbnailSet = photo.src.set
      .filter((pair) => parseInt(pair.split(' ')[1], 10) <= 800)
      .map((pair) => {
        const parts = pair.split(' ');
        return `${photo.src.path}/${parts[0]} ${parts[1]}`;
      })
      .join(', ');
    const [minSize] = photo.src.set[0].split(' ');
    const thumbnailSrc = `${photo.src.path}/${minSize}`;

    const img = document.createElement('img');
    if (index >= 6) img.loading = 'lazy';
    img.src = thumbnailSrc;
    img.srcset = thumbnailSet;
    img.sizes = '(min-width: 912px) 300px, 33vw';
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;

    const { dialog } = createLightbox(photo, index);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(dialog);
  });

  visiblePhotoIndices = photos.map((_, index) => index);

  container.appendChild(gallery);
  return container;
}
