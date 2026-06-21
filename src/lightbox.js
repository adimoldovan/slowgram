import { getVisiblePhotoIndices } from './photos';
// photoSlug lives in the shared photo-identity module so the RSS feed's
// /photo/{slug} links (bin/rss.js) stay in lockstep with this routing.
import { photoSlug } from './photo-id.js';
import { photoAlt } from './photo-alt.js';

export { photoSlug };

// Animation timing constants
const TRANSITION_FAST = '0.25s';
const TRANSITION_SLOW = '0.4s';
const TRANSITION_EASING = 'ease-out';
const SWIPE_TRANSITION_FAST = `transform ${TRANSITION_FAST} ${TRANSITION_EASING}, opacity ${TRANSITION_FAST} ${TRANSITION_EASING}`;
const SWIPE_TRANSITION_SLOW = `transform ${TRANSITION_SLOW} ${TRANSITION_EASING}, opacity ${TRANSITION_SLOW} ${TRANSITION_EASING}`;

// Swipe detection constants
const MIN_SWIPE_DISTANCE = 50;
const MAX_VERTICAL_DISTANCE = 100;

let navigating = false;
let hasPushedEntry = false;

// Lazy lightbox registry. Building a full <dialog> (image, buttons, swipe and
// keyboard listeners) for every photo up front does not scale — a 200-item feed
// would create 200 hidden lightboxes nobody may ever open. Instead we register
// the photos and the container, then build each dialog on first open and cache
// it so subsequent opens reuse the same node.
let registeredPhotos = [];
let lightboxContainer = null;
const dialogCache = new Map();

// Cache keys are indices into the photos array passed here, so they are only
// valid for the most recent registration. getPhotosGallery calls this once per
// render; any future caller that reorders photos must re-init to avoid serving
// a stale cached dialog at an index that now points to a different photo.
export function initLightboxes(photos, container) {
  registeredPhotos = photos;
  lightboxContainer = container;
  dialogCache.clear();
}

// Returns the dialog for `index`, building and caching it on first access.
// Returns null for an out-of-range index or before initLightboxes runs.
export function getOrCreateLightbox(index) {
  const cached = dialogCache.get(index);
  if (cached) return cached;

  const photo = registeredPhotos[index];
  if (!photo || !lightboxContainer) return null;

  const { dialog } = createLightbox(photo, index);
  dialogCache.set(index, dialog);
  lightboxContainer.appendChild(dialog);
  return dialog;
}

export function setNavigating(value) {
  navigating = value;
}

export function getNextIndex(currentIndex, direction, visibleIndices) {
  if (visibleIndices.length === 0) return -1;
  const currentVisibleIndex = visibleIndices.indexOf(currentIndex);
  if (currentVisibleIndex === -1) return -1;
  const targetVisibleIndex =
    (currentVisibleIndex + direction + visibleIndices.length) % visibleIndices.length;
  return visibleIndices[targetVisibleIndex];
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
  img.alt = photoAlt(photo, index);
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

  // The glyph textContent (\u00d7, \u2192, \u2190) is decorative, so each button carries an
  // explicit aria-label to give assistive tech a meaningful accessible name.
  const closeBtn = document.createElement('button');
  closeBtn.className = 'slideshow-nav close';
  closeBtn.textContent = '\u00d7';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => dialog.close());

  const nextBtn = document.createElement('button');
  nextBtn.className = 'slideshow-nav next';
  nextBtn.textContent = '\u2192';
  nextBtn.setAttribute('aria-label', 'Next photo');
  nextBtn.addEventListener('click', () => navigateLightbox(index, 1));

  const prevBtn = document.createElement('button');
  prevBtn.className = 'slideshow-nav prev';
  prevBtn.textContent = '\u2190';
  prevBtn.setAttribute('aria-label', 'Previous photo');
  prevBtn.addEventListener('click', () => navigateLightbox(index, -1));

  dialog.appendChild(img);
  dialog.appendChild(closeBtn);
  dialog.appendChild(nextBtn);
  dialog.appendChild(prevBtn);

  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';

    if (navigating) {
      navigating = false;
      return;
    }

    // Restore URL: use history.back() if a pushState entry exists, replaceState otherwise
    if (window.location.pathname !== '/') {
      if (hasPushedEntry) {
        hasPushedEntry = false;
        history.back();
      } else {
        history.replaceState(null, '', '/');
      }
    }

    // Defer scroll to next frame to let history/URL settle
    requestAnimationFrame(() => {
      const thumbnail = document.getElementById(`p${index}`);
      if (thumbnail) thumbnail.scrollIntoView({ block: 'start' });
    });
  });

  addSwipeGestures(dialog, img, index);

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateLightbox(index, -1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateLightbox(index, 1);
    }
  });

  return { dialog, lightboxImg: img };
}

function navigateLightbox(currentIndex, direction) {
  const visibleIndices = getVisiblePhotoIndices();
  const targetIndex = getNextIndex(currentIndex, direction, visibleIndices);
  if (targetIndex === -1) return;

  const currentDialog = getOrCreateLightbox(currentIndex);
  const targetDialog = getOrCreateLightbox(targetIndex);

  if (currentDialog && targetDialog) {
    navigating = true;
    currentDialog.close();
    loadLightboxImage(targetDialog.querySelector('img'));
    targetDialog.showModal();
    history.replaceState(null, '', `/photo/${targetDialog.dataset.photoName}`);
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

  dialog.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
    touchEndX = touchStartX;
    touchEndY = touchStartY;
  });

  dialog.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].clientX;
    touchEndY = e.changedTouches[0].clientY;
    img.style.transition = SWIPE_TRANSITION_FAST;
    handleSwipe();
  });
}

export function loadLightboxImage(img) {
  const { dataset } = img;
  if (!img.src && dataset.src) {
    img.style.opacity = '0';
    img.style.transform = 'translate(-50%, -50%) scale(0.9)';

    // Idempotent: safe to call more than once (e.g. the complete check below
    // fires and then a late load/error event also fires).
    const reveal = () => {
      img.style.transition = SWIPE_TRANSITION_FAST;
      img.style.opacity = '1';
      img.style.transform = 'translate(-50%, -50%) scale(1)';
      img.onload = null;
      img.onerror = null;
    };

    // Wire handlers before assigning src so a cached image can't fire load
    // before they attach. onerror reveals too, so a decode failure shows the
    // broken-image fallback instead of staying invisible at opacity:0.
    img.onload = reveal;
    img.onerror = reveal;

    // srcset/sizes before src so the browser picks the right candidate.
    img.srcset = dataset.srcset;
    img.sizes = dataset.sizes;
    img.src = dataset.src;

    // If the image was already complete (cached) before the handlers attached,
    // the events may never fire — force the reveal.
    if (img.complete) reveal();
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
  const dialog = getOrCreateLightbox(index);
  if (dialog) {
    showDialog(dialog);
    hasPushedEntry = true;
    history.pushState({ lightbox: index }, '', `/photo/${dialog.dataset.photoName}`);
  }
}

export function openLightboxByName(name) {
  // Dialogs are built lazily, so resolve the name to an index off the registry
  // instead of querying the DOM for a node that may not exist yet.
  const index = registeredPhotos.findIndex((photo) => photoSlug(photo) === name);
  const dialog = index === -1 ? null : getOrCreateLightbox(index);
  if (dialog) {
    showDialog(dialog);
    history.replaceState(null, '', `/photo/${dialog.dataset.photoName}`);
  } else {
    history.replaceState(null, '', '/');
  }
}
