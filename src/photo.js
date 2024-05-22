import './style.css';
import Swiper from 'swiper';

export async function getPhotoView(photos, photoId) {
  const swiperContainer = document.createElement('div');
  swiperContainer.className = 'swiper swiper-container';

  const mainGalleryWrapper = document.createElement('div');
  mainGalleryWrapper.className = 'swiper-wrapper';
  swiperContainer.appendChild(mainGalleryWrapper);

  // <div class="swiper-slide" style="background-image:url(https://swiperjs.com/demos/images/nature-1.jpg)"></div>
  photos.forEach((photo, index) => {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    const img = document.createElement('img');
    img.src = `${photo.src.path}/${photo.src.src}`;
    slide.appendChild(img);
    mainGalleryWrapper.appendChild(slide);
  });

  const pagination = document.createElement('div');
  pagination.className = 'swiper-pagination';
  swiperContainer.appendChild(pagination);

  // const thumbsContainer = document.createElement('div');
  // thumbsContainer.className = 'swiper-container swiper-thumbs';
  // container.appendChild(thumbsContainer);
  //
  // const thumbsGalleryWrapper = document.createElement('div');
  // thumbsGalleryWrapper.className = 'swiper-wrapper';
  // thumbsContainer.appendChild(thumbsGalleryWrapper);
  //
  // // <div class="swiper-slide" style="background-image:url(https://swiperjs.com/demos/images/nature-1.jpg)"></div>
  // photos.forEach((photo, index) => {
  //   const slide = document.createElement('div');
  //   slide.className = 'swiper-slide';
  //   const img = document.createElement('img');
  //   img.src = `${photo.src.path}/${photo.src.src}`;
  //   slide.appendChild(img);
  //   thumbsGalleryWrapper.appendChild(slide);
  // });


  // const nextButton = document.createElement('div');
  // nextButton.className = 'swiper-button-next';
  // container.appendChild(nextButton);
  //
  // const prevButton = document.createElement('div');
  // prevButton.className = 'swiper-button-prev';
  // container.appendChild(prevButton);

  // photos.forEach((photo, index) => {
  //   const slide = document.createElement('div');
  //   slide.className = 'swiper-slide';
  //   // slide.id = `photo-${photo.id}`;
  //
  //   const img = document.createElement('img');
  //   img.srcset = photo.src.set.map((pair) => {
  //     const parts = pair.split(' ');
  //     return `${photo.src.path}/${parts[0]} ${parts[1]}`;
  //   })
  //     .join(', ');
  //   img.src = `${photo.src.path}/${photo.src.src}`;
  //   // img.className = 'swiper-image';
  //   img.alt = `Image ${photo.id}`;
  //   // img.sizes = '80vw';
  //
  //   slide.appendChild(img);
  //   wrapper.appendChild(slide);
  // });

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

  return swiperContainer;
}

export async function initializeSwiper(photos) {
  const swiper = new Swiper(".swiper-container", {
      spaceBetween: 30,
      pagination: {
        el: ".swiper-pagination",
        clickable: true,
      },
    });
}


