import config from '../config.json';
import icons from './icons';

export default function getFooter() {
  const footer = document.createElement('footer');
  // All values are from trusted config.json, not user input
  footer.innerHTML = `
    <div class="footer-source">
      <a href="${config.gitUrl}" target="_blank">
        <img src="${icons['github.svg']}" alt="github icon" />
      </a>
      <div class="commit-id">${__COMMIT_HASH__}</div>
    </div>`;
  return footer;
}
