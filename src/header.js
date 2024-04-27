import './style.css';
import config from '../config.json';
import icons from './icons';

export function getHeader() {
  // region header
    const header = document.createElement('header');

    const { gravatarHash } = config;
    header.innerHTML = `<img class="profile-picture" src="https://www.gravatar.com/avatar/${gravatarHash}?s=200" alt="profile picture" />`;

    header.appendChild(document.createElement('h1')).textContent = config.displayName;
    header.appendChild(document.createElement('p')).textContent = config.description;

    // eslint-disable-next-line no-restricted-syntax
    for (const account of config.accounts) {
      const link = document.createElement('a');
      link.href = account.url;
      link.target = '_blank';

      const img = document.createElement('img');
      img.src = icons[account.icon];
      img.alt = account.name;
      link.appendChild(img);
      header.appendChild(link);
    }
    // endregion

  return header;
}
