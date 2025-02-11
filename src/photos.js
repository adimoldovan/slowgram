import './style.css';
import config from '../config.json';

export default async function getPhotosGallery() {
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
    link.id = `p${index}`;
    link.href = `#lightbox-${index}`;
    link.className = 'gallery-item';

    const imageSrc = `${photo.src.path}/${photo.src.src}`;
    const imageSrcSet = photo.src.set.map((pair) => {
      const parts = pair.split(' ');
      return `${photo.src.path}/${parts[0]} ${parts[1]}`;
    })
      .join(', ');

    const img = document.createElement('img');
    img.src = imageSrc.replace('1080', '320');
    img.srcset = imageSrcSet;
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;
    img.sizes = '320px';

    const nextPhotoId = (index + 1) % photos.length;
    const prevPhotoId = (index - 1 + photos.length) % photos.length;

    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.id = `lightbox-${index}`;
    const lightboxImg = document.createElement('img');
    lightboxImg.src = imageSrc.replace('1080', '320');
    lightboxImg.srcset = imageSrcSet;
    lightboxImg.sizes = '90vw';
    lightboxImg.sizes = `(max-width: 380px) 320px,
              (max-width: 500px) 480px,
              (max-width: 602px) 600px,
              (max-width: 750px) 800px,
              1080px`;

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
    lightboxClose.href = `#${link.id}`;
    lightboxClose.textContent = '×';

    lightbox.appendChild(lightboxImg);
    lightbox.appendChild(lightboxNext);
    lightbox.appendChild(lightboxClose);
    lightbox.appendChild(lightboxPrev);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(lightbox);
  });

  container.appendChild(gallery);
  return container;
  // endregion
}
