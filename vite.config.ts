import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Two build targets with genuinely different needs:
 *
 *  - **web** (default) ships to GitHub Pages at https://<user>.github.io/readnote/,
 *    so every asset must be prefixed with that path.
 *  - **native** is loaded by Capacitor from a local origin (capacitor://localhost),
 *    where an absolute "/readnote/..." path points nowhere. It needs relative URLs.
 *
 * Select with BUILD_TARGET=native (see the build:native script).
 */
const isNative = process.env.BUILD_TARGET === 'native'

const BASE = isNative ? './' : '/readnote/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // A service worker inside a Capacitor WebView adds nothing — the assets are
    // already on disk — and its caching actively fights `cap sync` during
    // development, serving a stale bundle after a rebuild. Web target only.
    ...(isNative
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['apple-touch-icon.png'],
            manifest: {
              name: 'ReadNote',
              short_name: 'ReadNote',
              description: 'A personal reading journal. Capture key ideas chapter by chapter.',
              start_url: BASE,
              scope: BASE,
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#f5efe3',
              theme_color: '#9c6f31',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
              navigateFallback: `${BASE}index.html`,
            },
          }),
        ]),
  ],
  server: {
    host: true, // expose on the LAN so a phone can reach the dev server
  },
})
