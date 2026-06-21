// Single source of truth for a photo's display text: its location label and its
// accessible name (the img `alt`). Shared by the gallery thumbnails
// (src/photos.js), the lightbox image (src/lightbox.js), and the build's RSS feed
// (bin/rss.js re-exports formatLocation) so every surface describes the same photo
// identically. The alt prefers the human-authored title, then the location, then
// the photo id, and finally a generic indexed label so it is never empty — the
// same precedence the RSS pipeline uses for an item's title.
import { photoId } from './photo-id.js';

// Human-readable location label: prefer the city, fall back to the state when
// there's no city, then append the country (e.g. "Cluj, Romania"). Whitespace-
// only fields are ignored. Returns an empty string when nothing is set.
export function formatLocation(location) {
  const clean = (value) => String(value ?? '').trim();
  const place = clean(location?.city) || clean(location?.state);
  return [place, clean(location?.country)].filter(Boolean).join(', ');
}

export function photoAlt(photo, index) {
  const title = String(photo?.title ?? '').trim();
  if (title) return title;
  const location = formatLocation(photo?.location);
  if (location) return location;
  // photoId throws on a photo without src.path, so guard before calling it. The
  // id (the CDN folder name) is a stable identifier, unlike the index, which
  // shifts when the gallery is filtered.
  const id = photo?.src?.path ? photoId(photo) : '';
  if (id) return id;
  return `Photo ${index + 1}`;
}
