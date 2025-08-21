import './style.css';
import config from '../config.json';
import { createLightbox, addSwipeGestures, setupLightboxLazyLoading } from './lightbox';

function updateLightboxNavigation(visiblePhotoIndices) {
  // Store visible indices globally for swipe navigation
  window.visiblePhotoIndices = visiblePhotoIndices;
  
  visiblePhotoIndices.forEach((photoIndex, visibleIndex) => {
    const lightbox = document.getElementById(`lightbox-${photoIndex}`);
    if (!lightbox) return;
    
    const nextButton = lightbox.querySelector('.next');
    const prevButton = lightbox.querySelector('.prev');
    
    if (nextButton && prevButton) {
      const nextVisibleIndex = (visibleIndex + 1) % visiblePhotoIndices.length;
      const prevVisibleIndex = (visibleIndex - 1 + visiblePhotoIndices.length) % visiblePhotoIndices.length;
      
      const nextPhotoIndex = visiblePhotoIndices[nextVisibleIndex];
      const prevPhotoIndex = visiblePhotoIndices[prevVisibleIndex];
      
      nextButton.href = `#lightbox-${nextPhotoIndex}`;
      prevButton.href = `#lightbox-${prevPhotoIndex}`;
    }
  });
}

function filterPhotosByColor(color, count, photos) {
  const galleryItems = document.querySelectorAll('.gallery-item');
  
  // First, collect items that match the color with their population data
  const matchingItems = [];
  galleryItems.forEach(item => {
    const photoColors = item.dataset.colors ? item.dataset.colors.split(',') : [];
    const photoIndex = parseInt(item.id.replace('p', ''), 10);
    const photo = photos[photoIndex];
    
    if (photoColors.includes(color)) {
      // Find the population for this specific color
      const colorData = photo.colors?.find(c => c.color === color);
      const population = colorData ? colorData.population : 0;
      
      matchingItems.push({
        element: item,
        population,
        originalOrder: photoIndex
      });
    } else {
      const itemElement = item;
      itemElement.style.display = 'none';
    }
  });
  
  // Sort by population (highest first), then by original order if population is the same
  matchingItems.sort((a, b) => {
    if (b.population !== a.population) {
      return b.population - a.population;
    }
    return a.originalOrder - b.originalOrder;
  });
  
  // Apply the sorted order to the DOM and update lightbox navigation
  const visiblePhotoIndices = [];
  matchingItems.forEach((item, index) => {
    const itemElement = item.element;
    itemElement.style.display = 'block';
    itemElement.style.order = index;
    visiblePhotoIndices.push(item.originalOrder);
  });
  
  // Update lightbox navigation for filtered photos
  updateLightboxNavigation(visiblePhotoIndices);
  
  const countElement = count;
  countElement.textContent = `${matchingItems.length} photos`;
}

function showAllPhotos(photos, count) {
  const galleryItems = document.querySelectorAll('.gallery-item');
  galleryItems.forEach(item => {
    const itemElement = item;
    itemElement.style.display = 'block';
    itemElement.style.order = '';  // Reset order to original
  });
  
  // Reset lightbox navigation to show all photos
  const allPhotoIndices = photos.map((_, index) => index);
  updateLightboxNavigation(allPhotoIndices);
  
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
          filterPhotosByColor(color, count, photos);
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
    addSwipeGestures(lightboxImg, index);

    link.appendChild(img);
    gallery.appendChild(link);
    gallery.appendChild(lightbox);
  });

  // Setup lazy loading for lightbox images
  setupLightboxLazyLoading();

  // Initialize lightbox navigation with all photos visible initially
  const allPhotoIndices = photos.map((_, index) => index);
  updateLightboxNavigation(allPhotoIndices);

  container.appendChild(gallery);
  return container;
  // endregion
}
