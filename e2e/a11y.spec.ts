import { expect, test } from '@playwright/test';
import { dayKeyOf } from '../src/engine/clock';
import { dailyAnswers } from '../src/engine/daily';
import { normalize } from '../src/engine/normalize';
import { dailyPool } from '../src/data/dictionary';

// Comfortably longer than --reveal-duration (320ms) + --press-duration
// (140ms) — see src/styles/tokens.css — mirrors resume.spec.ts/quarteto.spec.ts.
const REVEAL_SETTLE_MS = 600;

async function submit(page: import('@playwright/test').Page, word: string): Promise<void> {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(REVEAL_SETTLE_MS);
}

/** The one live region GuessAnnouncer.tsx renders — see its own doc comment. */
function announcer(page: import('@playwright/test').Page) {
  return page.locator('[role="status"][aria-atomic="true"]');
}

test.describe('screen-reader announcements (Task 25)', () => {
  test('the live region exists from the very first render, empty, so the first accepted guess is not missed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const region = announcer(page);
    await expect(region).toBeAttached();
    expect(await region.textContent()).toBe('');
    // `sr-only` clips the region to a 1x1px box rather than `display: none`
    // (a screen reader ignores a `display: none` region entirely) — so
    // Playwright's own `toBeHidden` (which only checks for zero size or
    // `display`/`visibility` hiding) would actually report this as
    // "visible", the wrong tool for what this element deliberately does.
    // The bounding box itself is the real, technique-specific proof.
    const box = await region.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width * box!.height).toBeLessThanOrEqual(1);
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
    let finalText = '';
    for (const word of guesses) {
      await submit(page, word);
      const text = await announcer(page).textContent();
      if (text?.includes('Fim de jogo')) {
        wonEarly = true;
        finalText = text;
        // Not end-anchored: a loss also names the word (F2), and by the
        // time this fires the async dictionary-definition line (also F2)
        // may already have landed too — both are additional, later
        // information, not a reason this core outcome sentence should stop
        // being present.
        expect(text).toMatch(/Fim de jogo: você (venceu!|não acertou dessa vez\.)/);
        break;
      }
    }
    // Six real, distinct guesses against Solo's six attempts always finish
    // the match one way or the other (see result-modal.spec.ts's own
    // identical guess list and reasoning) — so the loop above must have
    // found the outcome sentence before running out of guesses.
    expect(wonEarly).toBe(true);

    // Task 25 fix round 1 (F2): a loss must also name the real word — this
    // is the one assertion in this suite that exercises F2 against the
    // ACTUAL generated dictionary (src/data/answers.generated.ts /
    // definitions.generated.json), not a mock, so a real lowercase word
    // must appear after "A palavra era".
    if (finalText.includes('não acertou')) {
      expect(finalText).toMatch(/A palavra era [a-zà-ÿ]+\./);
    }
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('keyboard reachability (Task 25)', () => {
  test('every header control, mode/variant tab, letter key and action key is reachable by Tab alone, in one pass', async ({
    page,
  }) => {
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

test.describe('focus ring clipping (Task 25 fix round 1, F3)', () => {
  test('a focused key\'s focus ring fits entirely inside its scrollable row, not clipped by it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    // "Q": the first key in its row — the one whose ring the reviewer found
    // clipped on THREE sides (top, bottom, and left, since the row's own
    // scrollport starts flush at its left edge — see Keyboard.tsx's own
    // doc comment). If the fix holds here it holds for every ordinary key,
    // whose ring only ever risked the top/bottom clipping every key shared.
    const qKey = page.getByRole('button', { name: 'Q', exact: true });
    await qKey.focus();

    const geometry = await page.evaluate(() => {
      const key = document.activeElement as HTMLElement;
      const row = key.closest('.overflow-x-auto') as HTMLElement | null;
      if (!row) return null;
      const keyRect = key.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const cs = getComputedStyle(key);
      const protrusion = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
      return {
        ringTop: keyRect.top - protrusion,
        ringBottom: keyRect.bottom + protrusion,
        ringLeft: keyRect.left - protrusion,
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        rowLeft: rowRect.left,
      };
    });

    expect(geometry).not.toBeNull();
    const g = geometry!;
    // The row's own box (padding included) is the clipping boundary for its
    // `overflow-x-auto` (and computed `overflow-y: auto`) — the ring must
    // land entirely inside it, not merely up against its edge.
    expect(g.ringTop).toBeGreaterThanOrEqual(g.rowTop - 0.5);
    expect(g.ringBottom).toBeLessThanOrEqual(g.rowBottom + 0.5);
    expect(g.ringLeft).toBeGreaterThanOrEqual(g.rowLeft - 0.5);
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
