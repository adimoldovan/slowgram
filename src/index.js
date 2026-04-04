import './style.css';
import getHeader from './header';
import getFooter from './footer';
import getPhotosGallery from './photos';
import { openLightboxByName, setNavigating } from './lightbox';

history.scrollRestoration = 'manual';

export function decodeSlug(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

// Dark mode: auto (system) -> dark -> light -> auto ...
function getSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  const effective = mode === 'auto' ? getSystemTheme() : mode;
  document.documentElement.setAttribute('data-theme', effective);
}

const validThemes = ['auto', 'dark', 'light'];
const raw = localStorage.getItem('theme');
const savedTheme = validThemes.includes(raw) ? raw : 'auto';
applyTheme(savedTheme);

// Listen for OS theme changes when in auto mode
window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', () => {
  if ((localStorage.getItem('theme') || 'auto') === 'auto') applyTheme('auto');
});

function createMoonIcon(showAuto) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
  svg.appendChild(path);
  if (showAuto) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '16');
    text.setAttribute('y', '10');
    text.setAttribute('font-size', '9');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', 'currentColor');
    text.setAttribute('stroke', 'none');
    text.textContent = 'A';
    svg.appendChild(text);
  }
  return svg;
}

let currentMode = savedTheme;
const toggle = document.createElement('button');
toggle.className = 'dark-mode-toggle';
toggle.setAttribute('aria-label', `Theme: ${currentMode}`);
toggle.appendChild(createMoonIcon(currentMode === 'auto'));
toggle.addEventListener('click', () => {
  const next = { auto: 'dark', dark: 'light', light: 'auto' };
  currentMode = next[currentMode] || 'auto';
  localStorage.setItem('theme', currentMode);
  applyTheme(currentMode);
  toggle.setAttribute('aria-label', `Theme: ${currentMode}`);
  toggle.replaceChildren(createMoonIcon(currentMode === 'auto'));
});

document.body.appendChild(getHeader());
const main = document.createElement('main');
main.appendChild(await getPhotosGallery());
document.body.appendChild(main);
document.body.appendChild(getFooter());
document.body.appendChild(toggle);

// Deep link: open lightbox if URL is /photo/{name}
// Also handle GitHub Pages SPA redirect via 404.html
const redirectPath = sessionStorage.getItem('redirect');
if (redirectPath) {
  sessionStorage.removeItem('redirect');
  history.replaceState(null, '', redirectPath);
}

const photoMatch = window.location.pathname.match(/^\/photo\/(.+)$/);
if (photoMatch) {
  const name = decodeSlug(photoMatch[1]);
  if (name) openLightboxByName(name);
  else history.replaceState(null, '', '/');
}

// Handle browser back/forward button
window.addEventListener('popstate', () => {
  const openDialog = document.querySelector('dialog.lightbox[open]');
  const match = window.location.pathname.match(/^\/photo\/(.+)$/);

  if (openDialog && !match) {
    setNavigating(true);
    openDialog.close();
  } else if (match) {
    const targetName = decodeSlug(match[1]);
    if (!targetName) {
      history.replaceState(null, '', '/');
      return;
    }
    if (!openDialog || openDialog.dataset.photoName !== targetName) {
      if (openDialog) {
        setNavigating(true);
        openDialog.close();
      }
      openLightboxByName(targetName);
    }
  }
});
