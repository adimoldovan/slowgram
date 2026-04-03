# slowgram

A static photo gallery PWA. Photos are served from a CDN as responsive WebP images with EXIF metadata (camera, location, date). The frontend is vanilla JS bundled with Vite — no framework. Features a lightbox with swipe navigation and color-based filtering using dominant colors extracted from each photo. A build script (`bin/build-feed.mjs`) processes source images: resizes, converts to WebP, reads EXIF data, extracts colors via node-vibrant, and outputs a JSON feed.

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
