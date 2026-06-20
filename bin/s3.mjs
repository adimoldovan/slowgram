// AWS SDK (v3) wrapper for mirroring the photo bucket. The pure helpers below
// are unit tested; the SDK I/O lives further down (added in a later task).
import fs from 'fs';
import path from 'path';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const CONTENT_TYPES = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.json': 'application/json',
  '.xml': 'application/xml',
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

// Resolve an S3 key to an absolute path inside mirrorDir, or null if the key
// would escape it (path traversal via "../", absolute keys, or NUL bytes).
// We own the bucket, but a corrupt/hostile key must never let a pull write
// outside the mirror.
export function safeMirrorPath(mirrorDir, key) {
  if (typeof key !== 'string' || key.length === 0 || key.includes('\0')) return null;
  // Reject "..", as well as empty segments (leading "/", "//") that would make
  // the key absolute-ish or ambiguous.
  if (key.split('/').some((seg) => seg === '..' || seg === '')) return null;
  const absPath = path.join(mirrorDir, ...key.split('/'));
  const rel = path.relative(mirrorDir, absPath);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return absPath;
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

export function createClient(config) {
  const region = config?.aws?.region || process.env.AWS_REGION;
  return new S3Client(region ? { region } : {});
}

export async function listAllObjects(client, bucket) {
  const objects = [];
  let ContinuationToken;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }));
    for (const o of res.Contents || []) {
      objects.push({ key: o.Key, size: o.Size });
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
}

// Stream a single object to a local path, creating parent dirs.
async function downloadObject(client, bucket, key, absPath) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(absPath);
    res.Body.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.Body.pipe(out);
  });
}

// Additive pull: download objects missing locally or whose size differs.
// Never deletes local-only files (protects unsynced --skip-sync builds).
export async function pullBucket(client, bucket, mirrorDir) {
  const remote = await listAllObjects(client, bucket);
  let downloaded = 0;
  let skipped = 0;
  let skippedUnsafe = 0;
  for (const o of remote) {
    const absPath = safeMirrorPath(mirrorDir, o.key);
    if (!absPath) {
      console.warn(`⚠️  Skipping unsafe S3 key: ${o.key}`);
      skippedUnsafe++;
    } else if (fs.existsSync(absPath) && fs.statSync(absPath).size === o.size) {
      skipped++;
    } else {
      await downloadObject(client, bucket, o.key, absPath);
      downloaded++;
    }
  }
  return { downloaded, skipped, skippedUnsafe };
}

async function uploadFile(client, bucket, file) {
  const cacheControl = cacheControlFor(file.key);
  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: file.key,
      Body: fs.createReadStream(file.absPath),
      ContentType: contentTypeFor(file.key),
      ...(cacheControl ? { CacheControl: cacheControl } : {}),
    },
  }).done();
}

async function deleteKeys(client, bucket, keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
}

// Mirror mirrorDir -> bucket (uploads + deletes) after a confirm() prompt.
// Refuses to run against an empty mirror so a stale/blank .s3-mirror can't wipe S3.
export async function syncToS3(client, bucket, mirrorDir, { confirm }) {
  const local = walkFiles(mirrorDir);
  if (local.length === 0) {
    throw new Error('Refusing to sync: .s3-mirror is empty (this would delete the whole bucket).');
  }

  const remote = await listAllObjects(client, bucket);
  const { toUpload, toDelete } = planSync(local, remote, ['feed.json', 'rss.xml']);

  console.log(`➤ Sync plan: ${toUpload.length} to upload, ${toDelete.length} to delete on S3.`);
  toDelete.forEach((k) => console.log(`   - delete ${k}`));

  if (toUpload.length === 0 && toDelete.length === 0) {
    console.log('✅ S3 already up to date.');
    return { uploaded: 0, deleted: 0 };
  }

  const ok = await confirm('Apply these changes to S3? [y/N] ');
  if (!ok) {
    console.log('✋ Sync cancelled.');
    return { uploaded: 0, deleted: 0, cancelled: true };
  }

  for (const file of toUpload) {
    console.log(`  ➤ upload ${file.key}`);
    await uploadFile(client, bucket, file);
  }
  if (toDelete.length) await deleteKeys(client, bucket, toDelete);

  console.log(`✅ Synced: ${toUpload.length} uploaded, ${toDelete.length} deleted.`);
  return { uploaded: toUpload.length, deleted: toDelete.length };
}
