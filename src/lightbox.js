// Animation timing constants
const TRANSITION_FAST = '0.6s';
const TRANSITION_SLOW = '0.8s';
const TRANSITION_EASING = 'ease-out';
const SWIPE_TRANSITION_FAST = `transform ${TRANSITION_FAST} ${TRANSITION_EASING}, opacity ${TRANSITION_FAST} ${TRANSITION_EASING}`;
const SWIPE_TRANSITION_SLOW = `transform ${TRANSITION_SLOW} ${TRANSITION_EASING}, opacity ${TRANSITION_SLOW} ${TRANSITION_EASING}`;

// Swipe detection constants
const MIN_SWIPE_DISTANCE = 50;
const MAX_VERTICAL_DISTANCE = 100;

export function createLightbox(photo, index, photos) {
  const nextPhotoId = (index + 1) % photos.length;
  const prevPhotoId = (index - 1 + photos.length) % photos.length;

  const imageSrc = `${photo.src.path}/${photo.src.src}`;
  const imageSrcSet = photo.src.set
    .map((pair) => {
      const parts = pair.split(' ');
      return `${photo.src.path}/${parts[0]} ${parts[1]}`;
    })
    .join(', ');

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

  // Check if device is primarily touch-based (mobile/tablet)
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  if (isMobileDevice) {
    // Hide navigation buttons on mobile devices
    lightboxNext.style.display = 'none';
    lightboxPrev.style.display = 'none';
  }

  lightbox.appendChild(lightboxImg);
  lightbox.appendChild(lightboxNext);
  lightbox.appendChild(lightboxClose);
  lightbox.appendChild(lightboxPrev);

  return { lightbox, lightboxImg };
}

export function addSwipeGestures(lightboxImg, index) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  const img = lightboxImg;

  // Add transition for smooth animations
  img.style.transition = SWIPE_TRANSITION_FAST;
  // Prevent default touch behaviors
  img.style.touchAction = 'none';

  const handleSwipe = () => {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;

    // Reset transform after swipe
    img.style.transform = 'translate(-50%, -50%)';
    img.style.opacity = '1';

    // Check for swipe up to close (negative Y means up)
    if (swipeDistanceY < -MIN_SWIPE_DISTANCE && Math.abs(swipeDistanceX) < MAX_VERTICAL_DISTANCE) {
      // Animate out before closing
      img.style.transition = SWIPE_TRANSITION_SLOW;
      img.style.transform = 'translate(-50%, -150%)';
      img.style.opacity = '0';

      setTimeout(
        () => {
          window.location.hash = `#p${index}`;
        },
        parseInt(TRANSITION_SLOW, 10) * 1000
      );
      return;
    }

    // Process horizontal swipes for navigation
    if (
      Math.abs(swipeDistanceX) > MIN_SWIPE_DISTANCE &&
      Math.abs(swipeDistanceY) < MAX_VERTICAL_DISTANCE
    ) {
      // Get visible photo indices from global state
      const visibleIndices = window.visiblePhotoIndices || [];
      if (visibleIndices.length === 0) return;

      // Find current index in visible array
      const currentVisibleIndex = visibleIndices.indexOf(index);
      if (currentVisibleIndex === -1) return;

      let targetIndex;
      let direction;

      if (swipeDistanceX > 0) {
        // Swipe right - go to previous image
        const prevVisibleIndex =
          (currentVisibleIndex - 1 + visibleIndices.length) % visibleIndices.length;
        targetIndex = visibleIndices[prevVisibleIndex];
        direction = 'right';
      } else {
        // Swipe left - go to next image
        const nextVisibleIndex = (currentVisibleIndex + 1) % visibleIndices.length;
        targetIndex = visibleIndices[nextVisibleIndex];
        direction = 'left';
      }

      // Animate out (faster for horizontal swipes)
      img.style.transition = SWIPE_TRANSITION_FAST;
      if (direction === 'left') {
        img.style.transform = 'translate(-150%, -50%)';
      } else {
        img.style.transform = 'translate(50%, -50%)';
      }
      img.style.opacity = '0';

      setTimeout(
        () => {
          window.location.hash = `#lightbox-${targetIndex}`;
        },
        parseInt(TRANSITION_FAST, 10) * 1000
      );
    }
  };

  img.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    },
    { passive: true }
  );

  img.addEventListener(
    'touchend',
    (e) => {
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      img.style.transition = SWIPE_TRANSITION_FAST;
      handleSwipe();
    },
    { passive: true }
  );
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
        lightboxImg.style.transition = SWIPE_TRANSITION_FAST;
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

        // Always reset transforms first to clear any previous exit animations
        img.style.transition = 'none';
        img.style.transform = 'translate(-50%, -50%)';
        img.style.opacity = '1';

        // Force reflow to ensure the reset is applied immediately
        // eslint-disable-next-line no-unused-expressions
        img.offsetHeight;

        loadLightboxImage(img);

        // Re-enable transition for future animations
        if (img.src) {
          img.style.transition = SWIPE_TRANSITION_FAST;
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
