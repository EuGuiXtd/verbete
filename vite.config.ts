import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Everything Verbete needs to play a match ships as data — no backend, no
 * API (see this task's report). Offline play is therefore a packaging
 * problem: precache the built assets, including the definitions chunk
 * `src/data/definitions.ts` dynamically imports (see that file's own doc
 * comment), and register a service worker that updates itself in the
 * background without ever serving a silently stale word list.
 *
 * `registerType: 'autoUpdate'` alone is not enough for that last part: its
 * built-in client behaviour is to reload the page the instant a new service
 * worker activates, with no warning — mid-guess, that would be worse than
 * not updating at all. `injectRegister: false` turns off vite-plugin-pwa's
 * own auto-injected registration script so `src/ui/feedback/UpdatePrompt.tsx`
 * can register the service worker itself (via `virtual:pwa-register/react`)
 * and intercept that reload with an `onNeedReload` callback, trading the
 * silent reload for a "Nova versão disponível" prompt the player controls.
 * Because that bypasses the one place vite-plugin-pwa would otherwise set
 * `workbox.skipWaiting`/`workbox.clientsClaim` for `registerType:
 * 'autoUpdate'` (see its own source: it only does so when `injectRegister`
 * is left at its default), both are set explicitly below — without them the
 * new worker would sit "waiting" until every open tab closes, and the
 * update prompt would never fire.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Verbete',
        short_name: 'Verbete',
        description: 'Verbete — jogo de adivinhação de palavras em português.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Light mode's --paper (src/styles/tokens.css) — deliberately the
        // ONLY value here, not an oversight. The Web App Manifest spec has
        // no per-color-scheme `theme_color`/`background_color` (no browser
        // ships one either; the plugin's own type is a plain `string`), so
        // there is nothing to branch on at this layer. These two fields
        // govern install/splash-screen chrome ONLY — the OS-drawn surface
        // shown before the app's own document (and its pre-paint script)
        // ever paints a pixel. The actual in-app experience is unaffected:
        // index.html's inline pre-paint script already swaps the live
        // <meta name="theme-color"> between light/dark at runtime, reading
        // the same stored preference the app itself uses (see that
        // script's own doc comment). Net effect: a dark-mode player's
        // install/splash screen briefly shows the light paper tone
        // (#e9e4da) before the app takes over and repaints — there is no
        // manifest-level mechanism available to change that.
        background_color: '#e9e4da',
        theme_color: '#e9e4da',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Default globPatterns is '**/*.{js,css,html}' — already enough to
        // catch the definitions chunk (Vite emits a dynamic JSON import as
        // its own hashed .js file, not a raw .json — verified in this
        // task's report), but not the icons or the manifest itself.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,ico}'],
        // The Newsreader font is loaded from Google's CDN (index.html), not
        // bundled — it cannot be precached (it isn't part of `dist/`), so it
        // is runtime-cached instead: cached the first time it's fetched
        // (i.e. during the online visit before a player ever goes offline),
        // then served from that cache on every request after, online or not.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
