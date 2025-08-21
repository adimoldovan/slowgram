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
  lightbox.style.touchAction = 'none';

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

  // Check if device supports touch
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  if (isTouchDevice) {
    // Hide navigation buttons on touch devices
    lightboxNext.style.display = 'none';
    lightboxPrev.style.display = 'none';
  }

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
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  const minSwipeDistance = 50;

  // Add transition for smooth animations
  lightboxImg.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
  // Prevent default touch behaviors
  lightboxImg.style.touchAction = 'none';

  const handleSwipe = () => {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;

    // Reset transform after swipe
    lightboxImg.style.transform = 'translate(-50%, -50%)';
    lightboxImg.style.opacity = '1';

    // Check for swipe up to close (negative Y means up)
    if (swipeDistanceY < -minSwipeDistance && Math.abs(swipeDistanceX) < 100) {
      // Animate out before closing
      lightboxImg.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
      lightboxImg.style.transform = 'translate(-50%, -150%)';
      lightboxImg.style.opacity = '0';
      
      setTimeout(() => {
        window.location.hash = `#p${index}`;
      }, 300);
      return;
    }

    // Process horizontal swipes for navigation
    if (Math.abs(swipeDistanceX) > minSwipeDistance && Math.abs(swipeDistanceY) < 100) {
      let targetIndex;
      let direction;

      if (swipeDistanceX > 0) {
        // Swipe right - go to previous image
        targetIndex = (index - 1 + photosLength) % photosLength;
        direction = 'right';
      } else {
        // Swipe left - go to next image
        targetIndex = (index + 1) % photosLength;
        direction = 'left';
      }

      // Animate out
      lightboxImg.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
      if (direction === 'left') {
        lightboxImg.style.transform = 'translate(-150%, -50%)';
      } else {
        lightboxImg.style.transform = 'translate(50%, -50%)';
      }
      lightboxImg.style.opacity = '0';

      setTimeout(() => {
        window.location.hash = `#lightbox-${targetIndex}`;
      }, 300);
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    
    currentX = e.changedTouches[0].clientX - touchStartX;
    currentY = e.changedTouches[0].clientY - touchStartY;
    
    // Apply real-time transform while dragging
    lightboxImg.style.transition = 'none';
    lightboxImg.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
    
    // Adjust opacity based on drag distance
    const dragDistance = Math.sqrt(currentX * currentX + currentY * currentY);
    const opacity = Math.max(0.3, 1 - dragDistance / 300);
    lightboxImg.style.opacity = opacity;
  };

  lightboxImg.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    isDragging = true;
    lightboxImg.style.transition = 'none';
  }, { passive: true });

  lightboxImg.addEventListener('touchmove', handleTouchMove, { passive: true });

  lightboxImg.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].clientX;
    touchEndY = e.changedTouches[0].clientY;
    isDragging = false;
    lightboxImg.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    handleSwipe();
  }, { passive: true });

  // Handle touch cancel
  lightboxImg.addEventListener('touchcancel', () => {
    isDragging = false;
    lightboxImg.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    lightboxImg.style.transform = 'translate(-50%, -50%)';
    lightboxImg.style.opacity = '1';
  }, { passive: true });
}

export function setupLightboxLazyLoading() {
  const loadLightboxImage = (lightboxImg) => {
    const { dataset } = lightboxImg;
    if (!lightboxImg.src && dataset.src) {
      // Prepare for entrance animation
      // eslint-disable-next-line no-param-reassign
      lightboxImg.style.opacity = '0';
      // eslint-disable-next-line no-param-reassign
      lightboxImg.style.transform = 'translate(-50%, -50%) scale(0.9)';

      // eslint-disable-next-line no-param-reassign
      lightboxImg.src = dataset.src;
      // eslint-disable-next-line no-param-reassign
      lightboxImg.srcset = dataset.srcset;
      // eslint-disable-next-line no-param-reassign
      lightboxImg.sizes = dataset.sizes;

      // Animate entrance when image loads
      // eslint-disable-next-line no-param-reassign
      lightboxImg.onload = () => {
        // eslint-disable-next-line no-param-reassign
        lightboxImg.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        // eslint-disable-next-line no-param-reassign
        lightboxImg.style.opacity = '1';
        // eslint-disable-next-line no-param-reassign
        lightboxImg.style.transform = 'translate(-50%, -50%) scale(1)';
      };
    }
  };

  const handleHashChange = () => {
    const { hash } = window.location;
    if (hash.startsWith('#lightbox-')) {
      // Prevent body scroll when lightbox is open
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      
      const lightbox = document.querySelector(hash);
      if (lightbox) {
        const img = lightbox.querySelector('img');
        loadLightboxImage(img);

        // Reset any existing transforms for returning to an already loaded image
        if (img.src) {
          img.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
          img.style.opacity = '1';
          img.style.transform = 'translate(-50%, -50%)';
        }
      }
    } else {
      // Re-enable body scroll when lightbox is closed
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
  };

  window.addEventListener('hashchange', handleHashChange);
  // Also check initial hash
  handleHashChange();
}
