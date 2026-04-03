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

  // Extract unique colors
  const allColors = [
    ...new Set(
      photos
        .filter((photo) => photo.colors && Array.isArray(photo.colors))
        .flatMap((photo) => photo.colors.map((colorObj) => colorObj.color))
    ),
  ].filter(Boolean);

  const count = document.createElement('span');
  count.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
  count.className = 'counter';
  container.appendChild(count);

  // Color filter
  if (allColors.length > 0) {
    const colorFilter = document.createElement('div');
    colorFilter.className = 'color-filter';
    let selectedColor = null;

    const showAllButton = document.createElement('button');
    showAllButton.textContent = 'All';
    showAllButton.className = 'show-all-button';
    showAllButton.addEventListener('click', () => {
      selectedColor = null;
      document.querySelectorAll('.color-circle').forEach((circle) => {
        circle.classList.remove('selected');
      });
      showAllPhotos(photos, count);
    });
    colorFilter.appendChild(showAllButton);

    allColors.forEach((color) => {
      const colorCircle = document.createElement('div');
      colorCircle.className = 'color-circle';
      colorCircle.style.backgroundColor = color;
      colorCircle.title = color;

      colorCircle.addEventListener('click', () => {
        if (selectedColor === color) {
          selectedColor = null;
          colorCircle.classList.remove('selected');
          showAllPhotos(photos, count);
        } else {
          document.querySelectorAll('.color-circle').forEach((circle) => {
            circle.classList.remove('selected');
          });
          selectedColor = color;
          colorCircle.classList.add('selected');
          filterPhotosByColor(color, count, photos);
        }
      });

      colorFilter.appendChild(colorCircle);
    });

    container.appendChild(colorFilter);
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
