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

let navigating = false;
let hasPushedEntry = false;

export function setNavigating(value) {
  navigating = value;
}

function photoSlug(photo) {
  const segments = photo.src.path.split('/').filter(Boolean);
  const last = segments.pop() || '';
  return last.replace(/-+$/, '');
}

export function createLightbox(photo, index) {
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.id = `lightbox-${index}`;
  dialog.dataset.photoName = photoSlug(photo);

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

  const nextBtn = document.createElement('button');
  nextBtn.className = 'slideshow-nav next';
  nextBtn.textContent = '\u2192';
  nextBtn.addEventListener('click', () => navigateLightbox(index, 1));

  const prevBtn = document.createElement('button');
  prevBtn.className = 'slideshow-nav prev';
  prevBtn.textContent = '\u2190';
  prevBtn.addEventListener('click', () => navigateLightbox(index, -1));

  dialog.appendChild(img);
  dialog.appendChild(closeBtn);
  dialog.appendChild(nextBtn);
  dialog.appendChild(prevBtn);

  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';

    if (navigating) return;

    // Restore URL: use history.back() if a pushState entry exists, replaceState otherwise
    if (window.location.pathname !== '/') {
      if (hasPushedEntry) {
        hasPushedEntry = false;
        history.back();
      } else {
        history.replaceState(null, '', '/');
      }
    }

    const thumbnail = document.getElementById(`p${index}`);
    if (thumbnail) thumbnail.scrollIntoView({ block: 'center' });
  });

  addSwipeGestures(dialog, img, index);

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
    try {
      currentDialog.close();
      loadLightboxImage(targetDialog.querySelector('img'));
      targetDialog.showModal();
      history.replaceState(null, '', `/photo/${targetDialog.dataset.photoName}`);
    } finally {
      navigating = false;
    }
  }
}

function addSwipeGestures(dialog, img, index) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  const handleSwipe = () => {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;

    img.style.transform = 'translate(-50%, -50%)';
    img.style.opacity = '1';

    // Swipe up or down to close
    if (
      Math.abs(swipeDistanceY) > MIN_SWIPE_DISTANCE &&
      Math.abs(swipeDistanceX) < MAX_VERTICAL_DISTANCE
    ) {
      const translateY = swipeDistanceY < 0 ? '-150%' : '50%';
      img.style.transition = SWIPE_TRANSITION_SLOW;
      img.style.transform = `translate(-50%, ${translateY})`;
      img.style.opacity = '0';

      setTimeout(
        () => {
          if (dialog.open) dialog.close();
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
          if (!dialog.open) return;
          navigateLightbox(index, direction);
        },
        parseFloat(TRANSITION_FAST) * 1000
      );
    }
  };

  dialog.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    },
    { passive: true }
  );

  dialog.addEventListener(
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
      img.onload = null;
    };
  }
}

function showSwipeHint(dialog) {
  const lastShown = localStorage.getItem('swipeHintShown');
  if (lastShown && Date.now() - Number(lastShown) < 30 * 24 * 60 * 60 * 1000) return;
  if (!matchMedia('(pointer: coarse)').matches) return;

  const overlay = document.createElement('div');
  overlay.className = 'swipe-hint';
  // Static content only — no user input
  overlay.innerHTML =
    '<div class="swipe-hint-arrows">' +
    '<span class="swipe-arrow up">\u2191</span>' +
    '<span class="swipe-arrow left">\u2190</span>' +
    '<span class="swipe-hand">\u270b</span>' +
    '<span class="swipe-arrow right">\u2192</span>' +
    '<span class="swipe-arrow down">\u2193</span>' +
    '</div>' +
    '<p class="swipe-hint-text">Swipe to navigate</p>';

  dialog.appendChild(overlay);
  localStorage.setItem('swipeHintShown', String(Date.now()));

  let dismissed = false;
  let timer;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  };

  dialog.addEventListener('close', dismiss, { once: true });
  timer = setTimeout(dismiss, 5000);
}

function showDialog(dialog) {
  document.body.style.overflow = 'hidden';
  loadLightboxImage(dialog.querySelector('img'));
  dialog.showModal();
  showSwipeHint(dialog);
}

export function openLightbox(index) {
  const dialog = document.getElementById(`lightbox-${index}`);
  if (dialog) {
    showDialog(dialog);
    hasPushedEntry = true;
    history.pushState({ lightbox: index }, '', `/photo/${dialog.dataset.photoName}`);
  }
}

export function openLightboxByName(name) {
  const dialog = document.querySelector(`dialog[data-photo-name="${CSS.escape(name)}"]`);
  if (dialog) {
    showDialog(dialog);
    history.replaceState(null, '', `/photo/${dialog.dataset.photoName}`);
  } else {
    history.replaceState(null, '', '/');
  }
}
