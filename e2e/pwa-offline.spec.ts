import { expect, test } from '@playwright/test';
import { CURRENT_VERSION, computeAnswersHash } from '../src/storage/schema';
import type { ProgressRecord } from '../src/storage/schema';

/**
 * This is the one spec that needs a real service worker — every other e2e
 * spec runs with `serviceWorkers: 'block'` (see playwright.config.ts) to
 * stay fast and deterministic. Opting back in here, at the file level, so
 * only this spec pays the cost.
 */
test.use({ serviceWorkers: 'allow' });

/**
 * A real answer (src/data/answers.generated.ts) with a real, known
 * definition (src/data/definitions.generated.json: `"adv. em alto grau"`)
 * — chosen specifically so this test can force a WIN on the first guess and
 * still assert the exact dictionary gloss the reveal is supposed to show,
 * rather than "some text appeared". No accents, so the normalized guess
 * (what `page.keyboard.type` sends) is identical to the display form.
 */
const ANSWER = 'muito';
const WINNING_GUESS = 'MUITO';
const EXPECTED_GLOSS = 'em alto grau';

// Comfortably longer than --reveal-duration (320ms) + --press-duration
// (140ms) — see src/styles/tokens.css — mirrors resume.spec.ts/quarteto.spec.ts.
const REVEAL_SETTLE_MS = 600;

/**
 * Pre-seeds Solo infinite's stored progress with a FIXED answer, the same
 * shape `MatchProvider.loadOrCreateInfinite` reads back (see
 * src/state/MatchProvider.tsx) — infinite mode's answers are drawn at
 * random and have no daily-seed equivalent to pin from the outside, so this
 * is the only way to make the match's outcome (and therefore its
 * definition) deterministic instead of "whatever `Math.random()` drew
 * today". `page.addInitScript` runs before the app's own scripts on every
 * navigation in this test, including the offline reload — safe here only
 * because no guess is ever submitted before that reload.
 */
async function seedFixedSoloMatch(page: import('@playwright/test').Page): Promise<void> {
  const record: ProgressRecord = {
    variant: 'solo',
    mode: 'infinito',
    dayKey: null,
    guesses: [],
    draft: '',
    answers: [ANSWER],
    answersHash: computeAnswersHash([ANSWER]),
    startedAt: 1_700_000_000_000,
  };
  await page.addInitScript(
    ([key, envelope]) => {
      window.localStorage.setItem(key, envelope);
    },
    ['verbete:progress:solo:infinito', JSON.stringify({ v: CURRENT_VERSION, data: record })] as const,
  );
}

test.describe('offline play (real service worker)', () => {
  test('installs, goes offline, reloads, and finishes a match with the definition reveal', async ({
    page,
    context,
  }) => {
    await seedFixedSoloMatch(page);

    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    // Wait for the service worker to actually activate and take control —
    // `workbox.clientsClaim` (vite.config.ts) means it claims this very
    // page without needing a second reload, but the claim is asynchronous.
    await page.waitForFunction(
      () =>
        navigator.serviceWorker.getRegistration().then((reg) => Boolean(reg?.active)) &&
        navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 20_000 },
    );

    // The definitions chunk must already be in this page's cache before
    // going offline — it is lazy-imported only once a match finishes (see
    // src/data/definitions.ts), which has not happened yet. Confirming it
    // is precached (not merely that the SW is "active") is the whole point
    // of this test per this task's brief: verify, don't assume.
    const definitionsChunkCached = await page.evaluate(async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        if (requests.some((req) => /\/assets\/definitions\.generated-.*\.js$/.test(new URL(req.url).pathname))) {
          return true;
        }
      }
      return false;
    });
    expect(definitionsChunkCached).toBe(true);

    // Newsreader (index.html's Google Fonts <link>, --font-serif in
    // tokens.css) cannot live in the revisioned precache — it's a
    // third-party origin, not part of `dist/` — so it can only be
    // runtime-cached (vite.config.ts's `runtimeCaching` for
    // fonts.googleapis.com/fonts.gstatic.com), and only AFTER this page has
    // actually fetched it once online. Confirm that actually happened
    // before relying on it offline below, the same "verify, don't assume"
    // standard as the definitions chunk above.
    const googleFontsCached = await page.evaluate(async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        if (requests.some((req) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(req.url))) {
          return true;
        }
      }
      return false;
    });
    expect(googleFontsCached).toBe(true);

    // Now actually go offline, and prove the app survives a full reload —
    // not just still-open tabs, which would prove nothing about the
    // precache manifest.
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
    await expect(page.locator('[role="img"]')).toHaveCount(0); // no guesses yet, fresh board

    // Typography is half this product's identity (see tokens.css's own
    // doc comment on the letterpress metaphor) — a graceful fallback to a
    // system serif is still a real degradation, so this checks the actual
    // FontFace load state, not merely that the CSS declares Newsreader
    // (getComputedStyle().fontFamily reports the declared stack regardless
    // of whether the font file itself ever loaded — it can't tell a
    // successful load from a silent fallback).
    await page.waitForFunction(() => document.fonts.ready.then(() => true), undefined, { timeout: 10_000 });
    const newsreaderLoadedOffline = await page.evaluate(() =>
      Array.from(document.fonts).some(
        (face) => face.family.replace(/["']/g, '').toLowerCase() === 'newsreader' && face.status === 'loaded',
      ),
    );
    expect(newsreaderLoadedOffline).toBe(true);

    // Play the match to completion, entirely offline.
    await page.keyboard.type(WINNING_GUESS);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(REVEAL_SETTLE_MS);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Você acertou!');
    // The reveal itself: the answer's headword and its real dictionary
    // gloss, loaded through the dynamically-imported definitions chunk —
    // the one thing an offline test that never reaches this point would
    // fail to prove (see this task's report).
    await expect(dialog).toContainText(ANSWER);
    await expect(dialog).toContainText(EXPECTED_GLOSS);
  });
});
