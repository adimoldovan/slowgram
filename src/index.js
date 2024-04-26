import './style.css';
import data from './profile.json';
import photos from './photos.json';

const { gravatarHash } = data;

function contentComponent() {
  const main = document.createElement('main');

  // region header
  const header = document.createElement('header');

  header.innerHTML = `<img class="profile-picture" src="https://www.gravatar.com/avatar/${gravatarHash}?s=200" alt="profile picture" />`;

  header.appendChild(document.createElement('h1')).textContent = data.displayName;
  header.appendChild(document.createElement('p')).textContent = data.description;

  // Import icons
  const r = require.context('./assets/social', false, /\.(png|jpe?g|svg)$/);
  const icons = {};
  // eslint-disable-next-line array-callback-return
  r.keys()
    .map((item) => {
      icons[item.replace('./', '')] = r(item);
    });

  // eslint-disable-next-line no-restricted-syntax
  for (const account of data.accounts) {
    const link = document.createElement('a');
    link.href = account.url;
    link.target = '_blank';

    const img = document.createElement('img');
    img.src = icons[account.icon];
    img.alt = account.name;
    link.appendChild(img);
    header.appendChild(link);
  }

  main.appendChild(header);
  // endregion

  // region gallery
  const container = document.createElement('div');
  container.className = 'container';

  const gallery = document.createElement('div');
  gallery.id = 'gallery';
  gallery.className = 'gallery';

  photos.forEach((photo, index) => {
    const link = document.createElement('a');
    link.href = `#lightbox-${index}`;
    link.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = photo.src;
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;

    const nextPhotoId = (index + 1) % photos.length;
    const prevPhotoId = (index - 1 + photos.length) % photos.length;

    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.id = `lightbox-${index}`;
    const lightboxImg = document.createElement('img');
    lightboxImg.src = photo.src;

    const lightboxNext = document.createElement('a');
    lightboxNext.className = 'slideshow-nav next';
    lightboxNext.href = `#lightbox-${nextPhotoId}`;
    lightboxNext.textContent = '→';

    const lightboxPrev = document.createElement('a');
    lightboxPrev.className = 'slideshow-nav prev';
    lightboxPrev.href = `#lightbox-${prevPhotoId}`;
    lightboxPrev.textContent = '←';

    const lightboxClose = document.createElement('a');
    lightboxClose.className = 'slideshow-nav close';
    lightboxClose.href = '#';
    lightboxClose.textContent = 'X';

    const lightboxCaption = document.createElement('h1');
    lightboxCaption.className = 'photo-caption';
    lightboxCaption.textContent = photo.title;

    lightbox.appendChild(lightboxImg);
    lightbox.appendChild(lightboxNext);
    lightbox.appendChild(lightboxClose);
    lightbox.appendChild(lightboxPrev);
    lightbox.appendChild(lightboxCaption);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(lightbox);
  });

  container.appendChild(gallery);
  main.appendChild(gallery);
  // endregion

  // region footer
  const footer = document.createElement('footer');
  main.appendChild(footer);
  // endregion

  return main;
}

document.body.appendChild(contentComponent());
