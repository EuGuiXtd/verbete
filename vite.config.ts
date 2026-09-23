import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Everything Verbete needs to play a match ships as data — no backend, no
 * API. Offline play is therefore a packaging
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
        // task's report), but not the icons, the manifest, or the font
        // files. Newsreader is self-hosted (src/index.css's own doc comment
        // on its @font-face rules) specifically so it lands here, in the
        // revisioned precache, rather than needing a cross-origin runtime
        // cache that could only ever warm up AFTER a page had already
        // fetched it once online — see the Task 24 report for the offline
        // gap that the old Google-Fonts runtime-caching route (removed
        // here) actually had.
        //
        // `txt` is here for the licences, not for convenience. The installed
        // PWA is the one distribution mode where a copy of this app is
        // handed to someone entirely offline, and both OFL 1.1 (condition 2:
        // the licence must accompany every copy of the font) and LGPLv3 /
        // GPLv3 (section 4: a copy of the licence must be conveyed with the
        // work) require the text to travel with the files. Without this
        // pattern `dist/fonts/OFL.txt` and `dist/licenses/*.txt` ship to the
        // server but never into the precache, so the offline copy carries
        // the fonts and the word lists without their licences.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,ico,woff2,txt}'],
      },
      devOptions: { enabled: false },
    }),
  ],
});
