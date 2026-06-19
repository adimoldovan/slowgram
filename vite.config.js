import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import appConfig from './config.json';

if (!appConfig?.feed?.url) throw new Error('config.json missing feed.url');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const feedUrl = new URL(appConfig.feed.url);
const cdnOrigin = escapeRe(feedUrl.origin);
const feedFile = escapeRe(feedUrl.pathname.replace(/^\//, ''));

let commitHash;
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  commitHash = 'unknown';
}

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: {
        name: "Adi's slowgram",
        short_name: 'Slowgram',
        description: 'A photo every now and then. No stories, no reels, no likes either.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: new RegExp(`^${cdnOrigin}/${feedFile}$`),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'feed-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: new RegExp(`^${cdnOrigin}/(?!${feedFile}$)`),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'photo-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
});
