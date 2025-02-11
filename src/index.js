import getHeader from './header';
import getFooter from './footer';
import getPhotosGallery from './photos';

document.body.appendChild(getHeader());
const main = document.createElement('main');
main.appendChild(await getPhotosGallery());
document.body.appendChild(main);
document.body.appendChild(getFooter());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }, (err) => {
        console.error('ServiceWorker registration failed: ', err);
      });
  });
}
