import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `base` must match the GitHub Pages project path (https://<user>.github.io/booknotes/).
// Everything the app references — icons, manifest, assets — therefore has to be
// relative or base-prefixed; an absolute "/icon.png" 404s once deployed under /booknotes/.
const BASE = '/booknotes/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'BookNotes',
        short_name: 'BookNotes',
        description: 'A personal reading journal. Capture key ideas chapter by chapter.',
        // Both must sit inside the base path or iOS refuses to install the app.
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5efe3',
        theme_color: '#9c6f31',
        icons: [
          // No leading slash: these resolve against the manifest's own location,
          // which keeps them correct under the /booknotes/ base.
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Tesseract pulls its wasm and language data from a CDN on first use. Leaving
        // those requests alone means the service worker never tries to cache a
        // multi-megabyte model it cannot serve offline anyway.
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
  server: {
    host: true, // expose on the LAN so a phone can reach the dev server
  },
})
