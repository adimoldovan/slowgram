import './style.css';
import config from '../config.json';
import icons from './icons';

export function getFooter() {
  // region footer
  const footer = document.createElement('footer');
  const footerContainer = document.createElement('div');
  footerContainer.className = 'footer-source';
  const ghLink = document.createElement('a');
  ghLink.href = config.gitUrl;
  ghLink.target = '_blank';
  const ghIcon = document.createElement('img');

  ghIcon.src = icons['github.svg'];
  ghIcon.alt = 'github icon';

  ghLink.appendChild(ghIcon);
  footerContainer.appendChild(ghLink);
  footer.appendChild(footerContainer);
  // endregion

  return footer;
}
