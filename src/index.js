import { getHeader } from './header';
import { getFooter } from './footer';
import { getPhotosGallery } from './photos';
import { getPhotoView } from './photo';

const routes = [
  {
    'path': '/',
    'component': async () => await getPhotosGallery()
  },
  {
    'path': '/photo',
    'component': async () => await getPhotoView()
  }
];

document.body.appendChild(getHeader());
const main = document.createElement('main')
main.appendChild(document.createElement('div'));
document.body.appendChild(main);
document.body.appendChild(getFooter());

window.router = async path => {
  window.history.pushState({}, '', path);

  for (const route of routes) {
    if (route.path === path) {
      document.querySelector('main > div')
        .replaceWith(await route.component());
      break;
    }

    const notfound = document.createElement('h1');
    notfound.textContent = 'ups, not found';
    document.querySelector('main > div')
        .replaceWith(await route.component());
  }

  // console.log(window.history);
};

// console.log('index');
window.router('/')
  .then(r => console.log('router done'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((registration) => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, (err) => {
      console.error('ServiceWorker registration failed: ', err);
    });
  });
}
