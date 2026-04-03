import config from '../config.json';
import icons from './icons';

export default function getHeader() {
  const header = document.createElement('header');

  const { gravatarHash } = config;
  const accountLinks = config.accounts
    .map(
      (account) =>
        `<a href="${account.url}" target="_blank">
        <img src="${icons[account.icon]}" alt="${account.name}" />
      </a>`
    )
    .join('');

  // All values are from trusted config.json, not user input
  header.innerHTML = `
    <img class="profile-picture" src="https://www.gravatar.com/avatar/${gravatarHash}?s=200" alt="profile picture" />
    <h1>Adi's slowgram</h1>
    <p>A photo every now and then. No stories, no reels, no likes either.</p>
    ${accountLinks}`;

  return header;
}
