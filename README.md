# slowgram

A static photo gallery PWA. Photos are served from a CDN as responsive WebP images with EXIF metadata (camera, location, date). The frontend is vanilla JS bundled with Vite — no framework. Features a lightbox with swipe navigation and color-based filtering using dominant colors extracted from each photo. A CLI (`slowgram`) processes source images: resizes, converts to WebP, reads EXIF data, extracts colors via node-vibrant, and outputs a JSON feed.

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

`slowgram` is the single tool for publishing. It mirrors the S3 bucket into a
local `.s3-mirror/` folder (git-ignored), reuses already-processed photos,
processes any new ones from `SLOWGRAM_SOURCE_PATH`, regenerates `feed.json` and
`rss.xml`, then syncs `.s3-mirror` back to S3 via the AWS SDK — after asking
for confirmation.

Install the command once with `npm link` so `slowgram` is on your PATH. Without
installing, run it via `npx slowgram <command>` or directly with
`node bin/build-feed.js <command>` (all three are equivalent). `slowgram help`
and `slowgram --version` need no environment variables.

```bash
slowgram build              # pull, build new photos, prompt, sync
slowgram build --skip-sync  # build into .s3-mirror only (no upload)
slowgram sync               # upload existing .s3-mirror (no rebuild)
slowgram build --rebuild-all  # reprocess every photo
slowgram check              # report what would rebuild/prune, then exit
slowgram help
```

Environment:

- `SLOWGRAM_SOURCE_PATH` — your full photo library (`build` and `check`).
- `SLOWGRAM_BUCKET_NAME` — target S3 bucket (`build`, `check`, `sync`).
- AWS credentials via the standard AWS chain; region via `AWS_REGION` or
  `config.json` `aws.region`.

Notes:

- **Source = full library.** A photo removed from the source folder is pruned
  from `.s3-mirror` and **deleted from S3** on the next sync (the sync mirrors with
  delete). The script refuses to sync an empty `.s3-mirror` as a safeguard.
- **Only new photos are processed** by default; pass `--rebuild-all` after
  changing sizes or WebP quality.
- **`slowgram check`** is read-only: it pulls the mirror, then reports which
  photos would be rebuilt (an **image** update for a new photo or pixel edit, a
  **metadata** update for a metadata-only edit) and which would be pruned — then
  exits without building or syncing.
- **Publication dates** live in `feed.json` (`published` per photo), so newly
  added photos sort to the top of a reader. On the first run against a feed
  without that field, dates are seeded from each photo's date taken.
- `rss.xml` is uploaded with `Content-Type: application/rss+xml` and a short
  `max-age=900` so feed readers see new photos.
