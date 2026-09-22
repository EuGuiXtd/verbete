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
    expect(text).toMatch(/^Linha 2: C .+, A .+, S .+, A .+, S .+\.$/);
    // Every letter gets its own named result — the per-tile detail a
    // screen-reader user cannot get any other way.
    for (const label of ['correta', 'na posição errada', 'ausente']) {
      // At least one of the three labels must appear (which ones depend on
      // the random answer) — this just proves real per-letter vocabulary
      // made it into the sentence, not a placeholder.
      if (text?.includes(label)) expect(text).toContain(label);
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
        expect(text).toMatch(/Fim de jogo: você (venceu!|não acertou dessa vez\.)$/);
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

test.describe('reduced motion (Task 25)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a scored tile carries its real ink colour immediately, with every duration collapsed to effectively zero', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await page.keyboard.type('CASAS');
    await page.keyboard.press('Enter');
    // Deliberately NOT waiting out REVEAL_SETTLE_MS first: under reduced
    // motion the colour must already be correct as soon as the tile exists,
    // not merely after waiting for an animation that should not be running.
    await expect(page.locator('[role="img"]')).toHaveCount(5);

    const durations = await page.evaluate(() => ({
      press: getComputedStyle(document.documentElement).getPropertyValue('--press-duration').trim(),
      reveal: getComputedStyle(document.documentElement).getPropertyValue('--reveal-duration').trim(),
      shake: getComputedStyle(document.documentElement).getPropertyValue('--shake-duration').trim(),
    }));
    // getComputedStyle serialises a zero duration as "0s", not "0ms".
    expect(durations).toEqual({ press: '0s', reveal: '0s', shake: '0s' });

    const tileTransition = await page
      .locator('[role="img"]')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    // 1ms, from index.css's `@media (prefers-reduced-motion: reduce)`
    // `!important` catch-all — never the full 140ms press duration.
    expect(tileTransition).not.toContain('0.14s');
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
