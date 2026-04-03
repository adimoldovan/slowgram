import './style.css';
import getHeader from './header';
import getFooter from './footer';
import getPhotosGallery from './photos';
import { openLightboxByName, setNavigating } from './lightbox';

export function decodeSlug(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

document.body.appendChild(getHeader());
const main = document.createElement('main');
main.appendChild(await getPhotosGallery());
document.body.appendChild(main);
document.body.appendChild(getFooter());

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
    try {
      openDialog.close();
    } finally {
      setNavigating(false);
    }
  } else if (match) {
    const targetName = decodeSlug(match[1]);
    if (!targetName) {
      history.replaceState(null, '', '/');
      return;
    }
    if (!openDialog || openDialog.dataset.photoName !== targetName) {
      setNavigating(true);
      try {
        if (openDialog) openDialog.close();
        openLightboxByName(targetName);
      } finally {
        setNavigating(false);
      }
    }
  }
});
