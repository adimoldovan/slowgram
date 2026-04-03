import './style.css';
import getHeader from './header';
import getFooter from './footer';
import getPhotosGallery from './photos';

document.body.appendChild(getHeader());
const main = document.createElement('main');
main.appendChild(await getPhotosGallery());
document.body.appendChild(main);
document.body.appendChild(getFooter());
