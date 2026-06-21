// Single source of truth for a photo's identity in URLs. Shared by the frontend
// deep-link routing (src/lightbox.js) and the build's RSS <link>s (bin/rss.js)
// so a feed item always points at the same /photo/{slug} the app generates.
// Change the rule here and both sides move together — they cannot drift apart.

// The photo's CDN folder name: the last non-empty segment of its path.
export function photoId(image) {
  return image.src.path.split('/').filter(Boolean).pop() || '';
}

// The deep-link slug: the folder name with trailing dashes stripped.
export function photoSlug(image) {
  return photoId(image).replace(/-+$/, '');
}

// The deep-link path for a photo: /photo/{slug}, percent-encoded per segment so
// it round-trips through decodeSlug (decodeURIComponent) in src/index.js even if
// a CDN folder name ever contains a space, #, ?, %, or non-ASCII character. Every
// write site (gallery hrefs, history.pushState, RSS <link>s) routes through this
// one helper so the URLs stay symmetric with the reader and cannot drift apart.
export function photoPath(image) {
  return `/photo/${photoSlug(image).split('/').map(encodeURIComponent).join('/')}`;
}
