import './style.css';
import './style.css';
import config from '../config.json';

export async function getPhotosGallery() {
  // region gallery
  const container = document.createElement('div');
  container.className = 'container';

  const gallery = document.createElement('div');
  gallery.id = 'gallery';
  gallery.className = 'gallery';

  const response = await fetch(config.feed.url);
  const photos = await response.json();

  const count = document.createElement('span');
  count.textContent = `${photos.length} photos`;
  count.className = 'counter';
  container.appendChild(count);

  photos.forEach((photo, index) => {
    const link = document.createElement('a');
    link.href = `#lightbox-${index}`;
    // link.addEventListener('click', (event) => {
    //   event.preventDefault();
    //   window.router(`/photo?id=${index}`);
    // });
    link.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = photo.src;
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;
    img.width = 600;
    img.height = 600;

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
  return container
  // main.appendChild(gallery);
  // endregion
}

