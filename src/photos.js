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
  const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  const CSS_COLOR_RE = /^[a-zA-Z]+$/;
  function isValidColor(c) {
    return typeof c === 'string' && (HEX_COLOR_RE.test(c) || CSS_COLOR_RE.test(c));
  }
  function colorToRgb(color) {
    if (HEX_COLOR_RE.test(color)) {
      return [
        parseInt(color.slice(1, 3), 16) / 255,
        parseInt(color.slice(3, 5), 16) / 255,
        parseInt(color.slice(5, 7), 16) / 255,
      ];
    }
    const el = document.createElement('span');
    el.style.color = color;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    el.remove();
    const match = computed.match(/(\d+)/g);
    if (!match || match.length < 3) return [0, 0, 0];
    return [+match[0] / 255, +match[1] / 255, +match[2] / 255];
  }

  function colorToHue(color) {
    if (typeof color !== 'string') return 0;
    const [r, g, b] = colorToRgb(color);
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
    .filter(isValidColor)
    .sort((a, b) => colorToHue(a) - colorToHue(b));

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

    const allGradient = `linear-gradient(135deg, ${allColors.join(', ')})`;

    function createAllSegment() {
      const seg = document.createElement('div');
      seg.className = 'color-bar-all';
      seg.dataset.type = 'all';
      seg.style.background = allGradient;
      return seg;
    }

    function createColorSegment(color) {
      const seg = document.createElement('div');
      seg.className = 'color-bar-segment';
      seg.title = color;
      seg.dataset.color = color;
      seg.style.background = color;
      return seg;
    }

    function updateSegmentScales() {
      const scrollCenter = filterScroll.scrollLeft + filterScroll.clientWidth / 2;
      const halfVisible = filterScroll.clientWidth / 2;
      const segments = filterTrack.children;
      // Only process segments roughly in the visible range
      const firstVisible = Math.max(0, Math.floor((scrollCenter - halfVisible * 1.5) / segWidth));
      const lastVisible = Math.min(
        segments.length - 1,
        Math.ceil((scrollCenter + halfVisible * 1.5) / segWidth)
      );
      for (let i = 0; i < segments.length; i++) {
        if (i < firstVisible || i > lastVisible) {
          segments[i].style.transform = 'scaleY(0.5) scaleX(0.85)';
          continue;
        }
        const segCenter = i * segWidth + segWidth / 2;
        const dist = Math.abs(segCenter - scrollCenter);
        const t = Math.min(dist / halfVisible, 1);
        // Smooth cubic falloff: stays near 1.0 in center, eases down to 0.5 at edges
        const scale = 0.5 + 0.5 * (1 - t * t * t);
        const isSelected = segments[i].classList.contains('selected');
        const sy = isSelected ? scale * 1.5 : scale;
        const sx = isSelected ? (0.7 + 0.3 * scale) * 1.15 : 0.7 + 0.3 * scale;
        segments[i].style.transform = `scaleY(${sy}) scaleX(${sx})`;
      }
    }

    let highlightedColor = null; // track what's visually highlighted

    function highlightCenteredSegment() {
      const scrollCenter = filterScroll.scrollLeft + filterScroll.clientWidth / 2;
      const centeredIndex = Math.floor(scrollCenter / segWidth) % setSize;
      const color = centeredIndex === 0 ? null : allColors[centeredIndex - 1];

      if (color === highlightedColor) return;
      highlightedColor = color;

      filterTrack.querySelectorAll('.selected').forEach((el) => {
        el.classList.remove('selected');
      });

      if (color === null) {
        filterTrack.querySelectorAll('.color-bar-all').forEach((el) => {
          el.classList.add('selected');
        });
      } else {
        filterTrack.querySelectorAll('.color-bar-segment').forEach((el) => {
          if (el.dataset.color === color) {
            el.classList.add('selected');
          }
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
    });
    requestAnimationFrame(() => {
      filterScroll.scrollLeft = oneSetWidth - filterScroll.clientWidth / 2 + segWidth / 2;
      updateSegmentScales();
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
        // Update scales and highlight
        updateSegmentScales();
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
