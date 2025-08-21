export function createLightbox(photo, index, photos) {
  const nextPhotoId = (index + 1) % photos.length;
  const prevPhotoId = (index - 1 + photos.length) % photos.length;

  const imageSrc = `${photo.src.path}/${photo.src.src}`;
  const imageSrcSet = photo.src.set.map((pair) => {
    const parts = pair.split(' ');
    return `${photo.src.path}/${parts[0]} ${parts[1]}`;
  }).join(', ');

  const maxWidth = Math.max(...photo.src.set.map((pair) => parseInt(pair.split(' ')[1], 10)));

  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.id = `lightbox-${index}`;

  const lightboxImg = document.createElement('img');
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
  lightboxClose.href = `#p${index}`;
  lightboxClose.textContent = '×';

  lightbox.appendChild(lightboxImg);
  lightbox.appendChild(lightboxNext);
  lightbox.appendChild(lightboxClose);
  lightbox.appendChild(lightboxPrev);

  return { lightbox, lightboxImg };
}

export function addSwipeGestures(lightboxImg, index, photosLength) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  const minSwipeDistance = 50;

  const handleSwipe = () => {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;

    // Check for swipe up to close (negative Y means up)
    if (swipeDistanceY < -minSwipeDistance && Math.abs(swipeDistanceX) < 100) {
      window.location.hash = `#p${index}`;
      return;
    }

    // Process horizontal swipes for navigation
    if (Math.abs(swipeDistanceX) > minSwipeDistance && Math.abs(swipeDistanceY) < 100) {
      let targetIndex;

      if (swipeDistanceX > 0) {
        // Swipe right - go to previous image
        targetIndex = (index - 1 + photosLength) % photosLength;
      } else {
        // Swipe left - go to next image
        targetIndex = (index + 1) % photosLength;
      }

      window.location.hash = `#lightbox-${targetIndex}`;
    }
  };

  lightboxImg.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  lightboxImg.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].clientX;
    touchEndY = e.changedTouches[0].clientY;
    handleSwipe();
  }, { passive: true });
}

export function setupLightboxLazyLoading() {
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
}