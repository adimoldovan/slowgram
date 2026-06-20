# slowgram

A static photo gallery PWA. Photos are served from a CDN as responsive WebP images with EXIF metadata (camera, location, date). The frontend is vanilla JS bundled with Vite — no framework. Features a lightbox with swipe navigation and color-based filtering using dominant colors extracted from each photo. A build script (`bin/build-feed.js`) processes source images: resizes, converts to WebP, reads EXIF data, extracts colors via node-vibrant, and outputs a JSON feed.

## Development

```bash
npm install
npm run dev           # dev server with HMR
npm run build         # production build to dist/
npm run preview       # preview production build locally
```

### Other commands

```bash
npm run lint          # eslint
npm run format        # prettier (write)
npm run format:check  # prettier (check only)
```

## Publishing photos (build + sync)

`bin/build-feed.js` is the single tool for publishing. It mirrors the S3
bucket into a local `.s3-mirror/` folder (git-ignored), reuses already-processed
photos, processes any new ones from `SLOWGRAM_SOURCE_PATH`, regenerates
`feed.json` and `rss.xml`, then syncs `.s3-mirror` back to S3 via the AWS SDK —
after asking for confirmation.

```bash
node bin/build-feed.js              # pull, build new photos, prompt, sync
node bin/build-feed.js --skip-sync  # build into .s3-mirror only (no upload)
node bin/build-feed.js --sync-only  # upload existing .s3-mirror (no rebuild)
node bin/build-feed.js --rebuild-all  # reprocess every photo
node bin/build-feed.js --check-for-updates  # report what would rebuild, then exit
node bin/build-feed.js --help
```

Environment:

- `SLOWGRAM_SOURCE_PATH` — your full photo library (build only).
- `SLOWGRAM_BUCKET_NAME` — target S3 bucket (always).
- AWS credentials via the standard AWS chain; region via `AWS_REGION` or
  `config.json` `aws.region`.

Notes:

- **Source = full library.** A photo removed from the source folder is pruned
  from `.s3-mirror` and **deleted from S3** on the next sync (the sync mirrors with
  delete). The script refuses to sync an empty `.s3-mirror` as a safeguard.
- **Only new photos are processed** by default; pass `--rebuild-all` after
  changing sizes or WebP quality.
- **`--check-for-updates`** is read-only: it pulls the mirror, then reports which
  photos would be rebuilt (an **image** update for a new photo or pixel edit, a
  **metadata** update for a metadata-only edit) and which would be pruned — then
  exits without building or syncing.
- **Publication dates** live in `feed.json` (`published` per photo), so newly
  added photos sort to the top of a reader. On the first run against a feed
  without that field, dates are seeded from each photo's date taken.
- `rss.xml` is uploaded with `Content-Type: application/rss+xml` and a short
  `max-age=900` so feed readers see new photos.
