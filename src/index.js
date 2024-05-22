import { getHeader } from './header';
import { getFooter } from './footer';
import { getPhotosGallery } from './photos';
import { getPhotoView } from './photo';
import config from '../config.json';

function getURLParameters() {
  const params = new URLSearchParams(new URL(window.location.href).search);
  let paramsObject = {};
  for (let param of params) {
    paramsObject[param[0]] = param[1];
  }
  console.log(paramsObject);
  return paramsObject;
}

function renderCommon() {
  document.body.appendChild(getHeader());
  const main = document.createElement('main');
  main.appendChild(document.createElement('div'));
  document.body.appendChild(main);
  document.body.appendChild(getFooter());
}

function renderContent(content) {
  document.querySelector('main > div')
    .replaceWith(content);
}

renderCommon();

const urlParams = getURLParameters();

const response = await fetch(config.feed.url);
const photos = await response.json();

if (urlParams['p']) {
  await renderContent(await getPhotoView(photos, urlParams['p']));
} else {
  await renderContent(await getPhotosGallery(photos));
}

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
