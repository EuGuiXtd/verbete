import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dayKeyOf } from '../src/engine/clock';
import { dailyAnswers } from '../src/engine/daily';
import { normalize } from '../src/engine/normalize';
import { dailyPool } from '../src/data/dictionary';

// Comfortably longer than --reveal-duration (320ms) + --press-duration
// (140ms) — see src/styles/tokens.css — mirrors resume.spec.ts/quarteto.spec.ts.
const REVEAL_SETTLE_MS = 600;

async function submit(page: Page, word: string): Promise<void> {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(REVEAL_SETTLE_MS);
}

/**
 * GuessAnnouncer.tsx renders two `[role="status"][aria-atomic="true"]`
 * regions, in this exact order — the row/outcome sentence first, the
 * dictionary-definition sentence second (Task 25 fix round 2, R2: they used
 * to be one region, which forced a full re-read of the row/outcome sentence
 * every time the definition landed). `.first()`/`.nth(1)` rather than a
 * class or id: both are otherwise identical `sr-only` divs, and order is
 * the one thing the component actually guarantees.
 */
function announcer(page: Page) {
  return page.locator('[role="status"][aria-atomic="true"]').first();
}

function definitionAnnouncer(page: Page) {
  return page.locator('[role="status"][aria-atomic="true"]').nth(1);
}

// WCAG relative-luminance contrast, shared by the AA-contrast suite and the
// focus-ring suite (both need to prove a real colour pair clears a real
// floor from LIVE computed styles, not from reading the CSS source).
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) throw new Error(`Could not parse colour: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Reaches a virtual keyboard key by its exact letter using REAL `Tab`
 * keypresses from a blank focus state — never `.focus()` (Task 25 fix
 * round 2: the reviewer found that a scripted `.focus()` call does not
 * reliably match `:focus-visible` the way a genuine keyboard-driven focus
 * does, especially following a mouse interaction — Chromium's own
 * focus-visible heuristic considers the last input MODALITY, and a script
 * call is neither. A computed-style assertion built on `.focus()` can
 * therefore pass by reading a bogus, un-ringed style rather than the real
 * one). Capped well past the real distance (`Header` + `ModeTabs` + "nova
 * palavra" + the browser's own focusable-scroller stop, see the
 * reachability test's own comment) so a genuine regression fails loudly
 * instead of hanging.
 */
async function tabToLetterKey(page: Page, letter: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
    if (text === letter) return;
  }
  throw new Error(`Could not reach key "${letter}" via real Tab presses within 40 attempts`);
}

test.describe('screen-reader announcements (Task 25)', () => {
  test('the live region exists from the very first render, empty, so the first accepted guess is not missed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    for (const region of [announcer(page), definitionAnnouncer(page)]) {
      await expect(region).toBeAttached();
      expect(await region.textContent()).toBe('');
      // `sr-only` clips the region to a 1x1px box rather than `display:
      // none` (a screen reader ignores a `display: none` region entirely)
      // — so Playwright's own `toBeHidden` (which only checks for zero
      // size or `display`/`visibility` hiding) would actually report this
      // as "visible", the wrong tool for what this element deliberately
      // does. The bounding box itself is the real, technique-specific proof.
      const box = await region.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width * box!.height).toBeLessThanOrEqual(1);
    }
  });

  test('states every letter\'s own result after a Solo guess, matching the brief\'s own worked example', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    // A harmless first guess, then CASAS again on row 2 — this game's own
    // "casas" is never a valid infinite-mode answer collision risk here
    // because the assertion only checks the SHAPE of the sentence (rows,
    // letters, labels), not which one happened to be correct.
    await submit(page, 'TERRA');
    await submit(page, 'CASAS');

    const text = await announcer(page).textContent();
    // Captures each of the five results, then checks every ONE of them is
    // exactly a real label — not merely that the sentence matches a loose
    // shape, and not merely that "at least one" real word appears somewhere
    // (Task 25 fix round 1, F5: the original version of this assertion,
    // `if (text.includes(label)) expect(text).toContain(label)`, could not
    // fail by construction — the condition and the assertion were the same
    // check). This fails if even one of the five is missing, malformed, or
    // not one of the three real labels.
    const match = text?.match(/^Linha 2: C (.+), A (.+), S (.+), A (.+), S (.+)\.$/);
    expect(match).not.toBeNull();
    const validLabels = new Set(['correta', 'na posição errada', 'ausente']);
    for (const label of match!.slice(1)) {
      expect(validLabels.has(label)).toBe(true);
    }
  });

  test('a Quarteto guess spells the word once and names the board it solves, without repeating the letters per board', async ({
    page,
  }) => {
    const dayKey = dayKeyOf(Date.now());
    const answers = dailyAnswers(dayKey, 'quarteto', dailyPool());
    const solvingGuess = normalize(answers[0]!);

    await page.goto('/');
    await page.getByRole('button', { name: 'Quarteto' }).click();
    await page.getByRole('button', { name: 'Diário' }).click();
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await submit(page, solvingGuess);

    const text = await announcer(page).textContent();
    expect(text).toBeTruthy();
    const body = text!;
    // The guess is spelled out once, up front...
    const spelled = solvingGuess.split('').join(' ');
    expect(body).toContain(`tentativa ${spelled}`);
    // ...board 1 is explicitly named as solved...
    expect(body).toContain('Tabuleiro 1, resolvido');
    // ...all four boards are reported...
    for (const n of [1, 2, 3, 4]) expect(body).toContain(`Tabuleiro ${String(n)}`);
    // ...and none of the guess's own letters shows up again as a bare,
    // standalone token after the spelled-out word — the exact noise this
    // task's brief warns a naive per-board repeat would produce.
    const afterSpelling = body.slice(body.indexOf(spelled) + spelled.length);
    for (const letter of new Set(solvingGuess.split(''))) {
      expect(afterSpelling).not.toMatch(new RegExp(`\\b${letter}\\b`));
    }
  });

  test('announces the match outcome on the guess that finishes it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const guesses = ['CASAS', 'HORAS', 'TERRA', 'PRATO', 'FINDO', 'CLARO'];
    let wonEarly = false;
    for (const word of guesses) {
      await submit(page, word);
      const text = await announcer(page).textContent();
      if (text?.includes('Fim de jogo')) {
        wonEarly = true;
        // A loss also names the real word (F2) — checked against the
        // ACTUAL generated dictionary here, not a mock.
        expect(text).toMatch(/Fim de jogo: você (venceu!|não acertou dessa vez\. A palavra era [a-zà-ÿ]+\.)$/);
        break;
      }
    }
    // Six real, distinct guesses against Solo's six attempts always finish
    // the match one way or the other (see result-modal.spec.ts's own
    // identical guess list and reasoning) — so the loop above must have
    // found the outcome sentence before running out of guesses.
    expect(wonEarly).toBe(true);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  // Task 25 fix round 2 (R2): proves the actual fix, against the real
  // dictionary (not a mock) — the row/outcome region must NEVER change once
  // the async definition lands in its own, separate region.
  test('the definition lands in its own region, without re-announcing the row/outcome sentence', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const guesses = ['CASAS', 'HORAS', 'TERRA', 'PRATO', 'FINDO', 'CLARO'];
    let outcomeText = '';
    for (const word of guesses) {
      await submit(page, word);
      const text = await announcer(page).textContent();
      if (text?.includes('Fim de jogo')) {
        outcomeText = text;
        break;
      }
    }
    expect(outcomeText).not.toBe('');

    // Give the async `loadDefinition` chunk plenty of room to resolve —
    // this is the first time it is fetched this session.
    await page.waitForTimeout(2000);

    // The row/outcome region is byte-for-byte the same text it was the
    // instant the match finished — never touched again.
    expect(await announcer(page).textContent()).toBe(outcomeText);

    // The definition region got SOMETHING (a real word from the generated
    // dictionary very likely has one — see this task's report for the
    // known, pre-existing exceptions) without ever touching the other region.
    const definitionText = await definitionAnnouncer(page).textContent();
    if (definitionText !== '') {
      expect(definitionText).toMatch(/^Definição de [a-zà-ÿ]+: .+\.$/);
    }
  });
});

test.describe('keyboard reachability (Task 25)', () => {
  test('every header control, mode/variant tab, letter key and action key is reachable by Tab alone, in one pass', async ({
    page,
  }) => {
    // The app opens on the mode last played and defaults to Diário (C4), but
    // "Começar uma nova palavra" only exists in Infinito and this pass is
    // about reaching EVERY control. Seeded rather than clicked: a click would
    // leave the sequential-focus starting point on the tab it pressed, and
    // Tab has to start from the top of the document for the order below to
    // mean anything.
    await page.addInitScript(([key, envelope]) => {
      window.localStorage.setItem(key, envelope);
    }, ['verbete:prefs', JSON.stringify({ v: 1, data: { lastVariant: 'solo', lastMode: 'infinito' } })] as const);
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const expectedNames = [
      'Ajuda',
      'Estatísticas',
      /^Tema:/,
      'Solo',
      'Dueto',
      'Quarteto',
      'Diário',
      'Infinito',
      'Começar uma nova palavra',
      ...'QWERTYUIOPASDFGHJKLZXCVBNM'.split(''),
      'Enviar tentativa',
      'Apagar última letra',
    ];

    for (const name of expectedNames) {
      await page.keyboard.press('Tab');
      let focused = page.locator(':focus');
      let tagName = await focused.evaluate((el) => el.tagName);
      // Chromium makes a genuinely scrollable container (Shell.tsx's own
      // `<main overflow-y-auto>`, needed for a tall Quarteto board on a
      // short phone) a Tab stop of its own, unprompted by this app — real,
      // documented "focusable scroller" behaviour, not a bug this task
      // introduced. It carries no accessible name of its own and does not
      // replace any control in the list below, so this skips over it (at
      // most once, between "nova palavra" and "Q") rather than asserting it
      // does not exist.
      if (tagName === 'MAIN') {
        await page.keyboard.press('Tab');
        focused = page.locator(':focus');
        tagName = await focused.evaluate((el) => el.tagName);
      }
      await expect(focused).toBeVisible();
      const accessibleName = (await focused.getAttribute('aria-label')) ?? (await focused.textContent());
      if (typeof name === 'string') {
        expect(accessibleName?.trim()).toBe(name);
      } else {
        expect(accessibleName?.trim()).toMatch(name);
      }
    }
  });

  test('no tile is ever a Tab stop — the board is read-only display, not a control', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
    await submit(page, 'CASAS');

    const tabIndexes = await page.locator('.sorte').evaluateAll((tiles) =>
      tiles.map((tile) => tile.getAttribute('tabindex')),
    );
    for (const value of tabIndexes) expect(value).toBeNull();
  });
});

test.describe('focus trap (Task 25)', () => {
  test('Tab from a keyboard-opened dialog\'s own trigger lands inside the dialog, not on a sibling header button', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const ajudaButton = page.getByRole('button', { name: 'Ajuda' });
    await ajudaButton.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Confirms Modal.tsx's own contract (see its doc comment): opening never
    // steals focus, so it is still sitting on "Ajuda" right up until Tab.
    await expect(ajudaButton).toBeFocused();

    await page.keyboard.press('Tab');

    // Redirected into the dialog — never "Estatísticas" or "sistema", the
    // next real DOM siblings this Tab would otherwise land on.
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
    const isInsideDialog = await dialog.evaluate((node, active) => node.contains(active), await focused.elementHandle());
    expect(isInsideDialog).toBe(true);
  });

  test('Shift+Tab from the dialog\'s first control wraps to its last, never escaping to the page behind it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await page.getByRole('button', { name: 'Ajuda' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // "fechar" is the dialog's own first focusable control in DOM order.
    await dialog.getByRole('button', { name: 'fechar' }).focus();
    await page.keyboard.press('Shift+Tab');

    const focused = page.locator(':focus');
    const isInsideDialog = await dialog.evaluate((node, active) => node.contains(active), await focused.elementHandle());
    expect(isInsideDialog).toBe(true);
  });
});

test.describe('focus ring (Task 25 fix round 2, R1)', () => {
  test('the ring is inset — zero protrusion outside the key\'s own box — at 320px, driven by real Tab presses', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    // "Q": the first key in its row — the one whose OUTSET ring (fix round
    // 1) was clipped on three sides at once. Reached by real `Tab` presses,
    // never `.focus()` — see `tabToLetterKey`'s own doc comment for why
    // that distinction actually matters for a `:focus-visible` assertion.
    await tabToLetterKey(page, 'Q');

    const ring = await page.evaluate(() => {
      const key = document.activeElement as HTMLElement;
      const cs = getComputedStyle(key);
      return {
        outlineStyle: cs.outlineStyle,
        outlineWidth: parseFloat(cs.outlineWidth),
        outlineOffset: parseFloat(cs.outlineOffset),
      };
    });

    expect(ring.outlineStyle).toBe('solid');
    expect(ring.outlineWidth).toBeGreaterThan(0);
    // Negative (inset): the ring's outer edge sits AT OR INSIDE the key's
    // own border box, never beyond it — `outlineOffset + outlineWidth`
    // is the ring's actual outer edge relative to that border, and it must
    // never be positive, which is the one number that would mean "this
    // still needs room outside the box" (fix round 1's whole regression).
    expect(ring.outlineOffset).toBeLessThan(0);
    expect(ring.outlineOffset + ring.outlineWidth).toBeLessThanOrEqual(0.5);
  });

  test('the ring is identically inset at desktop width too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await tabToLetterKey(page, 'Q');

    const ring = await page.evaluate(() => {
      const key = document.activeElement as HTMLElement;
      const cs = getComputedStyle(key);
      return { outlineOffset: parseFloat(cs.outlineOffset), outlineWidth: parseFloat(cs.outlineWidth) };
    });
    expect(ring.outlineOffset).toBeLessThan(0);
    expect(ring.outlineOffset + ring.outlineWidth).toBeLessThanOrEqual(0.5);
  });

  // The whole reason F3's original fix (row padding) was reverted: it cost
  // 36px of keyboard height, measured to push Solo's own sixth row — the
  // one the player types their final guess into — off screen at exactly
  // these two sizes.
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`all six Solo rows are visible without scrolling at ${String(viewport.width)}x${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

      const rows = page.locator('.grid-cols-5');
      await expect(rows).toHaveCount(6); // Solo: maxAttempts rows, always rendered
      const lastRowBox = await rows.last().boundingBox();
      expect(lastRowBox).not.toBeNull();
      // Fully above the keyboard's own top edge, not merely present in the
      // DOM — "reachable by scrolling" (what fix round 1 shipped) is not
      // the same claim as "visible" (what this test actually checks).
      const keyboardTop = await page.getByRole('group', { name: 'Teclado' }).boundingBox();
      expect(keyboardTop).not.toBeNull();
      expect(lastRowBox!.y + lastRowBox!.height).toBeLessThanOrEqual(keyboardTop!.y + 0.5);
    });
  }

  test('AA: the ring\'s colour clears 3:1 against every real .tecla background, computed live', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await tabToLetterKey(page, 'Q');

    // Each of `.tecla`'s real states, added directly to the already
    // `:focus-visible`-matched key — this measures the CSS rule this fix
    // round actually wrote (`.tecla-presente:focus-visible`,
    // `.tecla-certa:focus-visible` overriding the ring to `--knockout`),
    // not a fabricated game outcome; which real guess produces which state
    // for which key is exactly the kind of thing this test should not have
    // to depend on the random secret word for.
    for (const stateClass of [null, 'tecla-ausente', 'tecla-presente', 'tecla-certa']) {
      const measured = await page.evaluate((cls) => {
        const key = document.activeElement as HTMLElement;
        const added = cls !== null && !key.classList.contains(cls);
        if (cls !== null) key.classList.add(cls);
        const cs = getComputedStyle(key);
        const result = {
          outlineColor: cs.outlineColor,
          backgroundColor: cs.backgroundColor,
          outlineStyle: cs.outlineStyle,
        };
        if (added && cls !== null) key.classList.remove(cls);
        return result;
      }, stateClass);

      expect(measured.outlineStyle).toBe('solid');
      const ringRgb = parseRgb(measured.outlineColor);
      const bgRgb = parseRgb(measured.backgroundColor);
      expect(contrast(ringRgb, bgRgb)).toBeGreaterThanOrEqual(3);
    }
  });

  test('a segmented (Dueto/Quarteto) key gets a double inset ring instead of the single-colour outline', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
    await page.getByRole('button', { name: 'Dueto' }).click(); // segments every letter key — see Key.tsx

    await tabToLetterKey(page, 'Q');

    const info = await page.evaluate(() => {
      const key = document.activeElement as HTMLElement;
      const outline = getComputedStyle(key).outlineStyle;
      const after = getComputedStyle(key, '::after');
      return {
        isSegmented: key.classList.contains('tecla-multipla'),
        outlineStyle: outline,
        afterBoxShadow: after.boxShadow,
        afterZIndex: after.zIndex,
      };
    });

    expect(info.isSegmented).toBe(true);
    // The native outline is switched off for a segmented key — see
    // index.css's own doc comment on `.tecla-multipla:focus-visible` for
    // why (it would draw a redundant, single-colour ring UNDER this one).
    expect(info.outlineStyle).toBe('none');
    // Two inset shadows (ink then knockout), not one, not zero, not the
    // key's own ordinary press-out shadow alone.
    expect(info.afterBoxShadow.split('inset').length - 1).toBeGreaterThanOrEqual(2);
    expect(info.afterZIndex).toBe('2');
  });
});

test.describe('reduced motion (Task 25)', () => {
  /**
   * Task 25 fix round 1 (F6): the previous version of this test claimed, in
   * both its own comment and this task's report, to compare a captured
   * background colour between motion states — it never actually read one,
   * and `not.toContain('0.14s')` is not a real proof that the override
   * applied (it would also pass at, say, "0.5s"). This version captures the
   * SAME tile's real background colour and transition duration under both
   * `reduce` and `no-preference`, in two fresh contexts, and compares them
   * directly. Both contexts play Solo's Diário mode specifically so the
   * secret word — and therefore the scored colour — is identical in both
   * (an `infinito` match draws a random word per context, which would make
   * "the same colour" an accident of chance rather than a proven invariant).
   */
  async function scoreFirstTileUnder(
    browser: import('@playwright/test').Browser,
    reducedMotion: 'reduce' | 'no-preference',
  ): Promise<{ color: string; transitionDuration: string; pressDuration: string }> {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Diário' }).click();
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await page.keyboard.type('CASAS');
    await page.keyboard.press('Enter');
    // Deliberately NOT waiting out REVEAL_SETTLE_MS under `reduce`: the
    // colour must already be correct as soon as the tile exists, not merely
    // after waiting for an animation that should not be running. Under
    // `no-preference` the real reveal genuinely takes that long, so this
    // waits for the tile to exist at all rather than a fixed delay either way.
    await expect(page.locator('[role="img"]')).toHaveCount(5);
    if (reducedMotion === 'no-preference') await page.waitForTimeout(REVEAL_SETTLE_MS);

    const result = await page.evaluate(() => {
      const tile = document.querySelector('[role="img"]')!;
      return {
        color: getComputedStyle(tile).backgroundColor,
        transitionDuration: getComputedStyle(tile).transitionDuration,
        pressDuration: getComputedStyle(document.documentElement).getPropertyValue('--press-duration').trim(),
      };
    });
    await context.close();
    return result;
  }

  test('a scored tile\'s colour never depends on the reveal animation having run, only its transition timing does', async ({
    browser,
  }) => {
    const reduced = await scoreFirstTileUnder(browser, 'reduce');
    const normal = await scoreFirstTileUnder(browser, 'no-preference');

    // The actual claim this task's design rests on: colour is applied by
    // class, never by an animation, so it cannot differ by motion setting.
    expect(reduced.color).toBe(normal.color);

    // getComputedStyle serialises a zero duration as "0s", not "0ms".
    expect(reduced.pressDuration).toBe('0s');
    expect(normal.pressDuration).not.toBe('0s');
    // 1ms under reduce (index.css's `@media (prefers-reduced-motion: reduce)`
    // `!important` catch-all) — genuinely different from the real ~140ms
    // press transition under no-preference, not just "does not contain
    // 0.14s" (which "0.5s" would also satisfy without proving anything).
    expect(reduced.transitionDuration).toBe('0.001s');
    expect(reduced.transitionDuration).not.toBe(normal.transitionDuration);
  });
});

test.describe('AA contrast, computed live (Task 25)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`ink on paper and the ghost/absent tile text both clear 4.5:1 in ${scheme} mode`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
      await page.keyboard.type('CASAS');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(REVEAL_SETTLE_MS);

      const colours = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const absentTile = document.querySelector('.sorte-ausente');
        return {
          ink: root.getPropertyValue('--ink').trim(),
          paper: getComputedStyle(document.body).backgroundColor,
          ghostOnTile: absentTile ? getComputedStyle(absentTile).color : null,
          tileBg: absentTile ? getComputedStyle(absentTile).backgroundColor : null,
        };
      });

      // --ink is read as a hex custom property; the rest come back as
      // resolved `rgb(...)` from getComputedStyle.
      const inkHex = colours.ink.replace('#', '');
      const inkRgb: [number, number, number] = [
        parseInt(inkHex.slice(0, 2), 16),
        parseInt(inkHex.slice(2, 4), 16),
        parseInt(inkHex.slice(4, 6), 16),
      ];
      const paperRgb = parseRgb(colours.paper);
      expect(contrast(inkRgb, paperRgb)).toBeGreaterThanOrEqual(4.5);

      expect(colours.ghostOnTile).not.toBeNull();
      expect(colours.tileBg).not.toBeNull();
      const ghostRgb = parseRgb(colours.ghostOnTile!);
      const tileBgRgb = parseRgb(colours.tileBg!);
      expect(contrast(ghostRgb, tileBgRgb)).toBeGreaterThanOrEqual(4.5);

      await context.close();
    });
  }
});
