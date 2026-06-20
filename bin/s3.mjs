// AWS SDK (v3) wrapper for mirroring the photo bucket. The pure helpers below
// are unit tested; the SDK I/O lives further down (added in a later task).
import fs from 'fs';
import path from 'path';

const CONTENT_TYPES = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.json': 'application/json',
  '.xml': 'application/rss+xml',
};

export function contentTypeFor(key) {
  if (key === 'rss.xml') return 'application/rss+xml; charset=utf-8';
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

// rss.xml must stay fresh for feed readers; everything else keeps the bucket /
// CloudFront defaults (photos are content-addressed; feed.json is bypassed
// client-side via cache:reload), so we return undefined to leave it untouched.
export function cacheControlFor(key) {
  if (key === 'rss.xml') return 'public, max-age=900';
  return undefined;
}

// Compare local mirror vs remote bucket by size. alwaysUpload forces re-upload
// of keys whose size happens to match (used for feed.json + rss.xml).
export function planSync(local, remote, alwaysUpload = []) {
  const remoteByKey = new Map(remote.map((o) => [o.key, o]));
  const localByKey = new Map(local.map((f) => [f.key, f]));
  const force = new Set(alwaysUpload);

  const toUpload = local.filter((f) => {
    if (force.has(f.key)) return true;
    const r = remoteByKey.get(f.key);
    return !r || r.size !== f.size;
  });
  const toDelete = remote.filter((o) => !localByKey.has(o.key)).map((o) => o.key);
  return { toUpload, toDelete };
}

// Recursively list files under dir as { key, size, absPath } with posix keys.
export function walkFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const key = path.relative(dir, abs).split(path.sep).join('/');
        out.push({ key, size: fs.statSync(abs).size, absPath: abs });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
