import { getVisiblePhotoIndices } from './photos';

// Animation timing constants
const TRANSITION_FAST = '0.6s';
const TRANSITION_SLOW = '0.8s';
const TRANSITION_EASING = 'ease-out';
const SWIPE_TRANSITION_FAST = `transform ${TRANSITION_FAST} ${TRANSITION_EASING}, opacity ${TRANSITION_FAST} ${TRANSITION_EASING}`;
const SWIPE_TRANSITION_SLOW = `transform ${TRANSITION_SLOW} ${TRANSITION_EASING}, opacity ${TRANSITION_SLOW} ${TRANSITION_EASING}`;

// Swipe detection constants
const MIN_SWIPE_DISTANCE = 50;
const MAX_VERTICAL_DISTANCE = 100;

const isTouchDevice = matchMedia('(pointer: coarse)').matches;
let navigating = false;

export function createLightbox(photo, index) {
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.id = `lightbox-${index}`;

  const imageSrc = `${photo.src.path}/${photo.src.src}`;
  const imageSrcSet = photo.src.set
    .map((pair) => {
      const parts = pair.split(' ');
      return `${photo.src.path}/${parts[0]} ${parts[1]}`;
    })
    .join(', ');

  const maxWidth = Math.max(...photo.src.set.map((pair) => parseInt(pair.split(' ')[1], 10)));

  const img = document.createElement('img');
  img.dataset.src = imageSrc;
  img.dataset.srcset = imageSrcSet;
  img.dataset.sizes = `(max-width: 380px) 320px,
              (max-width: 500px) 480px,
              (max-width: 650px) 600px,
              (max-width: 850px) 800px,
              (max-width: 1150px) 1080px,
              (max-width: 1500px) 1440px,
              (max-width: 2000px) 1920px,
              ${maxWidth}px`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'slideshow-nav close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => dialog.close());

  dialog.appendChild(img);
  dialog.appendChild(closeBtn);

  if (!isTouchDevice) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'slideshow-nav next';
    nextBtn.textContent = '\u2192';
    nextBtn.addEventListener('click', () => navigateLightbox(index, 1));

    const prevBtn = document.createElement('button');
    prevBtn.className = 'slideshow-nav prev';
    prevBtn.textContent = '\u2190';
    prevBtn.addEventListener('click', () => navigateLightbox(index, -1));

    dialog.appendChild(nextBtn);
    dialog.appendChild(prevBtn);
  }

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // Scroll back to the gallery thumbnail on close (but not during navigation)
  dialog.addEventListener('close', () => {
    if (navigating) return;
    const thumbnail = document.getElementById(`p${index}`);
    if (thumbnail) thumbnail.scrollIntoView({ block: 'center' });
  });

  addSwipeGestures(img, index, dialog);

  return { dialog, lightboxImg: img };
}

function navigateLightbox(currentIndex, direction) {
  const visibleIndices = getVisiblePhotoIndices();
  if (visibleIndices.length === 0) return;

  const currentVisibleIndex = visibleIndices.indexOf(currentIndex);
  if (currentVisibleIndex === -1) return;

  const targetVisibleIndex =
    (currentVisibleIndex + direction + visibleIndices.length) % visibleIndices.length;
  const targetIndex = visibleIndices[targetVisibleIndex];

  const currentDialog = document.getElementById(`lightbox-${currentIndex}`);
  const targetDialog = document.getElementById(`lightbox-${targetIndex}`);

  if (currentDialog && targetDialog) {
    navigating = true;
    currentDialog.close();
    loadLightboxImage(targetDialog.querySelector('img'));
    targetDialog.showModal();
    navigating = false;
  }
}

function addSwipeGestures(lightboxImg, index, dialog) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  const img = lightboxImg;
  img.style.transition = SWIPE_TRANSITION_FAST;
  img.style.touchAction = 'none';

  const handleSwipe = () => {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;

    img.style.transform = 'translate(-50%, -50%)';
    img.style.opacity = '1';

    // Swipe up to close
    if (swipeDistanceY < -MIN_SWIPE_DISTANCE && Math.abs(swipeDistanceX) < MAX_VERTICAL_DISTANCE) {
      img.style.transition = SWIPE_TRANSITION_SLOW;
      img.style.transform = 'translate(-50%, -150%)';
      img.style.opacity = '0';

      setTimeout(
        () => {
          dialog.close();
          img.style.transition = 'none';
          img.style.transform = 'translate(-50%, -50%)';
          img.style.opacity = '1';
        },
        parseFloat(TRANSITION_SLOW) * 1000
      );
      return;
    }

    // Horizontal swipe for navigation
    if (
      Math.abs(swipeDistanceX) > MIN_SWIPE_DISTANCE &&
      Math.abs(swipeDistanceY) < MAX_VERTICAL_DISTANCE
    ) {
      const direction = swipeDistanceX > 0 ? -1 : 1;
      const translateX = swipeDistanceX > 0 ? '50%' : '-150%';

      img.style.transition = SWIPE_TRANSITION_FAST;
      img.style.transform = `translate(${translateX}, -50%)`;
      img.style.opacity = '0';

      setTimeout(
        () => {
          img.style.transition = 'none';
          img.style.transform = 'translate(-50%, -50%)';
          img.style.opacity = '1';
          navigateLightbox(index, direction);
        },
        parseFloat(TRANSITION_FAST) * 1000
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

function loadLightboxImage(img) {
  const { dataset } = img;
  if (!img.src && dataset.src) {
    img.style.opacity = '0';
    img.style.transform = 'translate(-50%, -50%) scale(0.9)';

    img.src = dataset.src;
    img.srcset = dataset.srcset;
    img.sizes = dataset.sizes;

    img.onload = () => {
      img.style.transition = SWIPE_TRANSITION_FAST;
      img.style.opacity = '1';
      img.style.transform = 'translate(-50%, -50%) scale(1)';
    };
  }
}

export function openLightbox(index) {
  const dialog = document.getElementById(`lightbox-${index}`);
  if (dialog) {
    loadLightboxImage(dialog.querySelector('img'));
    dialog.showModal();
  }
}
