// Maximum dampened pull distance (px) — the indicator asymptotes to this no
// matter how far the finger travels, giving a rubber-band feel.
const MAX_PULL = 150;

// Dampened distance (px) the gesture must reach before a release triggers a refresh.
export const REFRESH_THRESHOLD = 70;

// Map raw finger travel to a dampened indicator distance: smooth, monotonic,
// always less than the raw input, and capped at MAX_PULL.
export function pullDistance(rawDelta) {
  if (rawDelta <= 0) return 0;
  return (MAX_PULL * rawDelta) / (rawDelta + MAX_PULL);
}

export function shouldRefresh(distance) {
  return distance >= REFRESH_THRESHOLD;
}

// Decide what a touch move means from its travel since touchstart. Only a
// downward, vertical-dominant drag is a pull; anything upward or
// horizontal-dominant (e.g. the horizontal color-filter scroller) is ignored so
// we never hijack a sideways swipe.
export function gestureAction({ deltaX, deltaY }) {
  if (deltaY <= 0) return 'ignore';
  if (Math.abs(deltaX) > deltaY) return 'ignore';
  return 'pull';
}

// Wire the pull-to-refresh gesture to the document. Thin touch glue that
// delegates every decision to the tested helpers above. The gesture only arms
// at the very top of the page and never while a lightbox is open.
export function initPullToRefresh(doc = document, win = window) {
  const indicator = doc.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  const spinner = doc.createElement('div');
  spinner.className = 'ptr-spinner';
  indicator.appendChild(spinner);
  doc.body.appendChild(indicator);

  let startX = 0;
  let startY = null; // null = not tracking
  let distance = 0;
  let refreshing = false; // true once a reload has been triggered

  const isArmed = () => win.scrollY === 0 && !doc.querySelector('dialog.lightbox[open]');

  const reset = () => {
    startY = null;
    distance = 0;
    indicator.classList.remove('ptr-pulling');
    indicator.style.transform = '';
    indicator.style.opacity = '';
  };

  doc.addEventListener(
    'touchstart',
    (e) => {
      if (!refreshing && isArmed() && e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startY = null;
      }
    },
    { passive: true }
  );

  doc.addEventListener(
    'touchmove',
    (e) => {
      if (startY === null) return;
      // Bail if a second finger lands or the page scrolled away from the top.
      if (e.touches.length > 1 || win.scrollY > 0) {
        reset();
        return;
      }
      const deltaX = e.touches[0].clientX - startX;
      const deltaY = e.touches[0].clientY - startY;
      if (gestureAction({ deltaX, deltaY }) !== 'pull') {
        reset();
        return;
      }
      e.preventDefault(); // suppress native rubber-band while we drive the indicator
      distance = pullDistance(deltaY);
      indicator.classList.add('ptr-pulling');
      indicator.style.transform = `translate(-50%, ${distance}px)`;
      indicator.style.opacity = `${Math.min(distance / REFRESH_THRESHOLD, 1)}`;
    },
    { passive: false }
  );

  doc.addEventListener('touchend', () => {
    if (startY === null) return;
    if (shouldRefresh(distance)) {
      refreshing = true;
      indicator.classList.add('ptr-refreshing');
      win.location.reload();
    } else {
      reset();
    }
  });

  // iOS fires touchcancel (not touchend) when the system interrupts the gesture
  // — without this the indicator would stay frozen on screen.
  doc.addEventListener('touchcancel', reset);
}
