import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** How often an open tab re-checks the server for a newer service worker. See this component's own doc comment. */
const UPDATE_CHECK_INTERVAL_MS = 60_000;

/**
 * The other half of Task 24's PWA work (see vite.config.ts's doc comment on
 * why `registerType: 'autoUpdate'` is paired with `injectRegister: false`
 * here): a stale service worker keeps serving a stale `ANSWERS` array
 * (src/data/answers.generated.ts), which means a daily word that quietly
 * differs from everyone else's — see `DICTIONARY_VERSION` in
 * src/data/dictionary.ts for the other half of that defence. The built-in
 * `autoUpdate` client behaviour is to reload the page the instant a new
 * service worker takes control, with no warning; mid-guess, that is worse
 * than staying stale. `onNeedReload` intercepts exactly that moment (the
 * new worker has already activated and claimed this page — see
 * vite-plugin-pwa's `client/build/register.js`, the `activated` listener
 * under `if (auto)`) and turns it into a prompt the player controls instead.
 *
 * `needsReload` is this component's own state, not the hook's `needRefresh`
 * tuple: with `registerType: 'autoUpdate'`, the generated register script's
 * `onNeedRefresh` callback is never invoked (that path only exists for
 * `registerType: 'prompt'`) — only `onNeedReload` fires, and it is not
 * wired to any state the hook exposes on its own.
 *
 * By the time `onNeedReload` fires, the new service worker has already
 * activated and taken control (`clientsClaim`, set in vite.config.ts) —
 * reloading needs nothing more than a plain navigation, not another
 * message to the worker.
 *
 * `onRegisteredSW` starts a periodic `registration.update()` poll — this is
 * not decoration, it closes a real race found during this task's manual
 * play-test: `workbox-window` (vite-plugin-pwa's client) only attaches its
 * `updatefound` listener AFTER its own initial `register()` call resolves.
 * If the server is ALREADY serving a newer `sw.js` at that exact moment
 * (e.g. a deploy landed, then a player's very first `register()` call on
 * that stale tab happens to race the browser's own update check), the
 * browser can detect and install the update before that listener exists to
 * hear about it — the new worker still activates and takes over (verified
 * directly against Cache Storage), but `onNeedReload` is never called, so
 * the reload prompt silently never appears. Polling `registration.update()`
 * ourselves, started only once the initial registration has already
 * resolved and its listeners are attached, moves every SUBSEQUENT check
 * safely out of that race; only a deploy landing in the exact instant of a
 * tab's very first registration can still slip past it.
 */
export function UpdatePrompt() {
  const [needsReload, setNeedsReload] = useState(false);
  useRegisterSW({
    onNeedReload: () => setNeedsReload(true),
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needsReload) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="aviso pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <p>Nova versão disponível</p>
        <button type="button" className="tecla px-4" onClick={() => window.location.reload()}>
          recarregar
        </button>
      </div>
    </div>
  );
}
