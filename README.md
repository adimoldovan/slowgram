# slowgram

A static photo gallery PWA. Photos are served from a CDN as responsive WebP images with EXIF metadata (camera, location, date). The frontend is vanilla JS bundled with webpack — no framework. Features a lightbox with swipe navigation and color-based filtering using dominant colors extracted from each photo. A build script (`bin/build-feed.mjs`) processes source images: resizes, converts to WebP, reads EXIF data, extracts colors via node-vibrant, and outputs a JSON feed.

## Development

```bash
npm install
npm run build
npm run server        # serves dist/ on http://localhost:8934
npm run watch:build   # rebuilds on file changes
```

### Other commands

```bash
npm run lint          # eslint
npm run format        # prettier (write)
npm run format:check  # prettier (check only)
```
