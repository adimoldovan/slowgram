// Map raw EXIF into the metadata fields stored in the feed. Shared by the full
// processor and the metadata-only refresh path so they stay in sync. Kept pure
// (no I/O) and in its own module so the date-parsing and field-mapping edge
// cases can be unit-tested without running the whole build.
export function extractMeta(data) {
  if (!data.DateTimeOriginal) {
    throw new Error('missing DateTimeOriginal in EXIF data');
  }
  const dateParts = data.DateTimeOriginal.split(' ');
  const datePart = dateParts[0].replace(/:/g, '-');
  const [, timePart] = dateParts;
  const timestamp = Date.parse(`${datePart}T${timePart}`);
  // A NaN timestamp would silently poison the date sort (NaN comparators give an
  // unstable order for the whole feed), so reject it here and let the caller skip.
  if (Number.isNaN(timestamp)) {
    throw new Error(`unparseable DateTimeOriginal "${data.DateTimeOriginal}"`);
  }
  return {
    dateTaken: { timestamp, original: data.DateTimeOriginal },
    // Make and Model can be individually absent; join only the parts that are
    // present so a partial EXIF block never yields the literal "undefined undefined"
    // (which is truthy and would leak into the feed and RSS caption as a real value).
    camera: [data.Make, data.Model].filter(Boolean).join(' ') || undefined,
    location: { city: data.City, state: data.State, country: data.Country },
    title: data.ObjectName,
    keywords: data.Keywords,
  };
}
