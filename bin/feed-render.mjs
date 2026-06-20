import fs from 'fs';

// Render a photo's renditions into a fresh temp dir, then atomically swap it
// into place at `setPath`. If `render` throws, `setPath` is left exactly as it
// was — a failed render never destroys renditions already pulled from S3, which
// is what previously turned a transient conversion error into a bucket deletion.
export async function renderIntoDir(setPath, tmpPath, render) {
  fs.rmSync(tmpPath, { recursive: true, force: true });
  fs.mkdirSync(tmpPath, { recursive: true });
  try {
    const result = await render(tmpPath);
    fs.rmSync(setPath, { recursive: true, force: true });
    fs.renameSync(tmpPath, setPath);
    return result;
  } catch (error) {
    fs.rmSync(tmpPath, { recursive: true, force: true });
    throw error;
  }
}

// Decide which feed entry to keep after a render attempt. A successful render
// wins. A failed render falls back to the photo's existing feed entry if it has
// one — its renditions are still intact (renders are non-destructive), so the
// feed stays complete instead of silently dropping the photo and deleting its
// images. Only a brand-new photo with no prior entry is actually dropped.
export function entryAfterRender(rendered, existing) {
  if (rendered) return { entry: rendered, status: 'built' };
  if (existing) return { entry: existing, status: 'kept-existing' };
  return { entry: null, status: 'failed' };
}
