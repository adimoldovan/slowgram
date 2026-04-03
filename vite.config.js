import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    outDir: 'dist',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
      },
    }),
  ],
});
