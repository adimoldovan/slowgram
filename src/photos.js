import './style.css';
import config from '../config.json';
import { createLightbox, addSwipeGestures, setupLightboxLazyLoading } from './lightbox';

function filterPhotosByColor(color, count) {
  const galleryItems = document.querySelectorAll('.gallery-item');
  let visibleCount = 0;
  
  galleryItems.forEach(item => {
    const photoColors = item.dataset.colors ? item.dataset.colors.split(',') : [];
    const itemElement = item;
    if (photoColors.includes(color)) {
      itemElement.style.display = 'block';
      visibleCount += 1;
    } else {
      itemElement.style.display = 'none';
    }
  });
  
  const countElement = count;
  countElement.textContent = `${visibleCount} photos`;
}

function showAllPhotos(photos, count) {
  const galleryItems = document.querySelectorAll('.gallery-item');
  galleryItems.forEach(item => {
    const itemElement = item;
    itemElement.style.display = 'block';
  });
  const countElement = count;
  countElement.textContent = `${photos.length} photos`;
}

export default async function getPhotosGallery() {
  // region gallery
  const container = document.createElement('div');
  container.className = 'container';

  const gallery = document.createElement('div');
  gallery.id = 'gallery';
  gallery.className = 'gallery';

  const response = await fetch(config.feed.url);
  const photos = await response.json();

  // Extract all unique colors from photos (now handling objects with color and population)
  const allColors = [...new Set(
    photos
      .filter(photo => photo.colors && Array.isArray(photo.colors))
      .flatMap(photo => photo.colors.map(colorObj => colorObj.color))
  )].filter(Boolean);
  

  const count = document.createElement('span');
  count.textContent = `${photos.length} photos`;
  count.className = 'counter';
  container.appendChild(count);

  // Create color filter if there are colors to filter by
  if (allColors.length > 0) {
    const colorFilter = document.createElement('div');
    colorFilter.className = 'color-filter';
    let selectedColor = null;
    
    // Add "Show All" button
    const showAllButton = document.createElement('button');
    showAllButton.textContent = 'All';
    showAllButton.className = 'show-all-button';
    showAllButton.addEventListener('click', () => {
      selectedColor = null;
      document.querySelectorAll('.color-circle').forEach(circle => {
        circle.classList.remove('selected');
      });
      showAllPhotos(photos, count);
    });
    colorFilter.appendChild(showAllButton);
    
    allColors.forEach(color => {
      const colorCircle = document.createElement('div');
      colorCircle.className = 'color-circle';
      colorCircle.style.backgroundColor = color;
      colorCircle.title = color;
      
      colorCircle.addEventListener('click', () => {
        // Toggle selection
        if (selectedColor === color) {
          selectedColor = null;
          colorCircle.classList.remove('selected');
          showAllPhotos(photos, count);
        } else {
          // Remove previous selection
          document.querySelectorAll('.color-circle').forEach(circle => {
            circle.classList.remove('selected');
          });
          
          selectedColor = color;
          colorCircle.classList.add('selected');
          filterPhotosByColor(color, count);
        }
      });
      
      colorFilter.appendChild(colorCircle);
    });
    
    container.appendChild(colorFilter);
  }

  photos.forEach((photo, index) => {
    const link = document.createElement('a');
    link.id = `p${index}`;
    link.href = `#lightbox-${index}`;
    link.className = 'gallery-item';
    // Store colors data for filtering (extract color names from objects)
    link.dataset.colors = (photo.colors || []).map(colorObj => colorObj.color).join(',');

    // Get the smallest size for gallery thumbnail
    const minSize = photo.src.set[0].split(' ')[0];
    const thumbnailSrc = `${photo.src.path}/${minSize}`;

    const img = document.createElement('img');
    img.src = thumbnailSrc;
    // Only use thumbnail size for gallery - no srcset needed
    img.className = 'gallery-image';
    img.alt = `Gallery image ${index + 1}`;

    // Create lightbox using the imported function
    const { lightbox, lightboxImg } = createLightbox(photo, index, photos);

    // Add swipe gestures to the lightbox image
    addSwipeGestures(lightboxImg, index, photos.length);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(lightbox);
  });

  // Setup lazy loading for lightbox images
  setupLightboxLazyLoading();

  container.appendChild(gallery);
  return container;
  // endregion
}
