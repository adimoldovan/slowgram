import './style.css';
import Swiper from 'swiper';

export async function getPhotoView(photos, photoId) {
  const container = document.createElement('div');
  container.className = 'swiper';

  const wrapper = document.createElement('div');
  wrapper.className = 'swiper-wrapper';
  container.appendChild(wrapper);

  const nextButton = document.createElement('div');
  nextButton.className = 'swiper-button-next';
  container.appendChild(nextButton);

  const prevButton = document.createElement('div');
  prevButton.className = 'swiper-button-prev';
  container.appendChild(prevButton);

  const swiper = new Swiper('.swiper', {
    slidesPerView: 3,
    spaceBetween: 1,
    centeredSlides: true,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
  });

  photos.forEach((photo, index) => {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    // slide.id = `photo-${photo.id}`;

    const img = document.createElement('img');
    img.srcset = photo.src.set.map((pair) => {
      const parts = pair.split(' ');
      return `${photo.src.path}/${parts[0]} ${parts[1]}`;
    })
      .join(', ');
    img.src = `${photo.src.path}/${photo.src.src}`;
    // img.className = 'swiper-image';
    img.alt = `Image ${photo.id}`;
    // img.sizes = '80vw';

    slide.appendChild(img);
    wrapper.appendChild(slide);
  });

  // const photo = photos.find(photo => photo.id === photoId);
  // const img = document.createElement('img');
  // img.srcset = photo.src.set.map((pair) => {
  //   const parts = pair.split(' ');
  //   return `${photo.src.path}/${parts[0]} ${parts[1]}`;
  // })
  //   .join(', ');
  // img.src = `${photo.src.path}/${photo.src.src}`;
  // img.className = 'single-image';
  // img.alt = `Image ${photo.id}`;
  // img.sizes = '80vw';

  // container.appendChild(img);
  return container;
}
