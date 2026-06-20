// Pure decision rules for the incremental feed build: given the cheap source-hash
// check (and, only when needed, the pixel-hash comparison) decide whether a photo
// can be reused as-is, refreshed (metadata only), or must be re-rendered. Kept in
// its own module with no I/O so the rules can be unit-tested without running the
// whole build — the hashing, EXIF reads and rendering all stay in build-feed's run().
//
// The two-stage shape mirrors run()'s lazy hashing: decideFromSource runs first on
// the always-available source hash, and only its 'inspect-pixels' result asks the
// caller to decode and hash the pixels before calling decideFromPixels. This is what
// keeps a byte-identical photo from ever being decoded a second time in one run.

// Stage 1 — decide from the source hash alone. Returns:
//   'render'         — nothing reusable: a new photo, its renditions are gone, or
//                      --rebuild-all forces a full reprocess.
//   'reuse'          — source is byte-identical to last build; keep the entry as-is.
//   'inspect-pixels' — source changed but renditions still exist; the caller must
//                      hash the pixels and call decideFromPixels to choose.
export function decideFromSource({ rebuildAll, hasExisting, renditionExists, sourceMatches }) {
  if (rebuildAll || !hasExisting || !renditionExists) return 'render';
  if (sourceMatches) return 'reuse';
  return 'inspect-pixels';
}

// Stage 2 — decide once the pixels have been hashed. A metadata-only edit (pixels
// unchanged) just refreshes the feed fields; a pixel edit re-renders. A legacy entry
// has no stored pixel hash to compare against, so we can't prove the pixels moved —
// trust its existing renditions and refresh (which backfills the hash for next time).
export function decideFromPixels({ existingPixelHash, pixelHash }) {
  const pixelsChanged = existingPixelHash != null && pixelHash !== existingPixelHash;
  return pixelsChanged ? 'render' : 'refresh';
}
