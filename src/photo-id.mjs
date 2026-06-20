// Single source of truth for a photo's identity in URLs. Shared by the frontend
// deep-link routing (src/lightbox.js) and the build's RSS <link>s (bin/rss.mjs)
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
