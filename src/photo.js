import './style.css';

export async function getPhotoView() {
  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = '<p>Photo view</p>'
  return container;
}
