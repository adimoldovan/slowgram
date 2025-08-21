import './style.css';
import config from '../config.json';
import { createLightbox, addSwipeGestures, setupLightboxLazyLoading } from './lightbox';

export default async function getPhotosGallery() {
  // region gallery
  const container = document.createElement('div');
  container.className = 'container';

  const gallery = document.createElement('div');
  gallery.id = 'gallery';
  gallery.className = 'gallery';

  const response = await fetch(config.feed.url);
  const photos = await response.json();

  const count = document.createElement('span');
  count.textContent = `${photos.length} photos`;
  count.className = 'counter';
  container.appendChild(count);

  photos.forEach((photo, index) => {
    const link = document.createElement('a');
    link.id = `p${index}`;
    link.href = `#lightbox-${index}`;
    link.className = 'gallery-item';

    // Get the smallest size for gallery thumbnail
    const minSize = photo.src.set[0].split(' ')[0];
    const thumbnailSrc = `${photo.src.path}/${minSize}`;

    const img = document.createElement('img');
    img.src = thumbnailSrc;
    // Only use thumbnail size for gallery - no srcset needed
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;

    // Create lightbox using the imported function
    const { lightbox, lightboxImg } = createLightbox(photo, index, photos);

    // Add swipe gestures to the lightbox image
    addSwipeGestures(lightboxImg, index, photos.length);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(lightbox);
  });

  // Setup lazy loading for lightbox images
  setupLightboxLazyLoading();

  container.appendChild(gallery);
  return container;
  // endregion
}
