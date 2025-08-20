import './style.css';
import config from '../config.json';

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

    const imageSrc = `${photo.src.path}/${photo.src.src}`;
    const imageSrcSet = photo.src.set.map((pair) => {
      const parts = pair.split(' ');
      return `${photo.src.path}/${parts[0]} ${parts[1]}`;
    })
      .join(', ');

    // Get the actual max width from the srcset
    const maxWidth = Math.max(...photo.src.set.map((pair) => parseInt(pair.split(' ')[1], 10)));
    // Get the smallest size for gallery thumbnail
    const minSize = photo.src.set[0].split(' ')[0];
    const thumbnailSrc = `${photo.src.path}/${minSize}`;

    const img = document.createElement('img');
    img.src = thumbnailSrc;
    // Only use thumbnail size for gallery - no srcset needed
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;

    const nextPhotoId = (index + 1) % photos.length;
    const prevPhotoId = (index - 1 + photos.length) % photos.length;

    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.id = `lightbox-${index}`;
    const lightboxImg = document.createElement('img');
    // Store data for lazy loading
    lightboxImg.dataset.src = imageSrc;
    lightboxImg.dataset.srcset = imageSrcSet;
    lightboxImg.dataset.sizes = `(max-width: 380px) 320px,
              (max-width: 500px) 480px,
              (max-width: 650px) 600px,
              (max-width: 850px) 800px,
              (max-width: 1150px) 1080px,
              (max-width: 1500px) 1440px,
              (max-width: 2000px) 1920px,
              ${maxWidth}px`;

    const lightboxNext = document.createElement('a');
    lightboxNext.className = 'slideshow-nav next';
    lightboxNext.href = `#lightbox-${nextPhotoId}`;
    lightboxNext.textContent = '→';

    const lightboxPrev = document.createElement('a');
    lightboxPrev.className = 'slideshow-nav prev';
    lightboxPrev.href = `#lightbox-${prevPhotoId}`;
    lightboxPrev.textContent = '←';

    const lightboxClose = document.createElement('a');
    lightboxClose.className = 'slideshow-nav close';
    lightboxClose.href = `#${link.id}`;
    lightboxClose.textContent = '×';

    lightbox.appendChild(lightboxImg);
    lightbox.appendChild(lightboxNext);
    lightbox.appendChild(lightboxClose);
    lightbox.appendChild(lightboxPrev);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(lightbox);
  });

  // Add lazy loading for lightbox images
  const loadLightboxImage = (lightboxImg) => {
    const { dataset } = lightboxImg;
    if (!lightboxImg.src && dataset.src) {
      // eslint-disable-next-line no-param-reassign
      lightboxImg.src = dataset.src;
      // eslint-disable-next-line no-param-reassign
      lightboxImg.srcset = dataset.srcset;
      // eslint-disable-next-line no-param-reassign
      lightboxImg.sizes = dataset.sizes;
    }
  };

  // Listen for hash changes to load lightbox images when opened
  const handleHashChange = () => {
    const { hash } = window.location;
    if (hash.startsWith('#lightbox-')) {
      const lightbox = document.querySelector(hash);
      if (lightbox) {
        const img = lightbox.querySelector('img');
        loadLightboxImage(img);
      }
    }
  };

  window.addEventListener('hashchange', handleHashChange);
  // Also check initial hash
  handleHashChange();

  container.appendChild(gallery);
  return container;
  // endregion
}
