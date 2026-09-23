import { expect, test, type Locator, type Page } from '@playwright/test';
import { dayKeyOf } from '../src/engine/clock';
import { dailyAnswers } from '../src/engine/daily';
import { normalize } from '../src/engine/normalize';
import { dailyPool } from '../src/data/dictionary';

/** Plain {x, y, width, height}, not a DOMRect: page.evaluate serializes over the wire as JSON, and DOMRect's fields are prototype getters that JSON.stringify drops. */
async function rectOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function boxShadowOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).boxShadow);
}

// Comfortably longer than --reveal-duration (320ms) + --press-duration
// (140ms) — see src/styles/tokens.css. Mirrors quarteto.spec.ts.
const REVEAL_SETTLE_MS = 600;

async function submitGuess(page: Page, word: string): Promise<void> {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(REVEAL_SETTLE_MS);
}

/**
 * A five-letter accepted guess whose letters are all absent from `answers`,
 * built out of this day's own deck rather than hardcoded — so the test still
 * works whatever day it runs on. Returns null when the day's words happen to
 * leave no clean candidate, which the caller turns into a skip rather than a
 * false red.
 */
function guessWithNoSharedLetters(
  answers: readonly string[],
  pool: readonly string[],
): { guess: string; absentLetter: string } | null {
  const used = new Set(answers.flatMap((answer) => [...normalize(answer)]));
  for (const candidate of pool) {
    const normalized = normalize(candidate);
    if (answers.some((answer) => normalize(answer) === normalized)) continue;
    const letters = [...normalized];
    if (letters.some((letter) => used.has(letter))) continue;
    return { guess: normalized, absentLetter: letters[0]! };
  }
  return null;
}

test.describe('segmented multi-board key geometry', () => {
  test('the gradient-clipped letter stays anchored to the bands box, not shrink-wrapped to the glyph', async ({
    page,
  }) => {
    await page.goto('/');
    // Any board count above one segments every letter key (see Key.tsx:
    // `segmented = states.length > 1`) — Dueto is enough, no guess needed.
    await page.getByRole('button', { name: 'Dueto' }).click();

    const key = page.locator('button.tecla-multipla').first();
    await expect(key).toBeVisible();

    const bandsBox = key.locator('.tecla-multipla-fundo');
    const letterBox = key.locator('.tecla-multipla-letra');

    // jsdom performs no layout at all, so no unit test can see this: the
    // bug this guards against (the letter span shrink-wrapping the glyph
    // instead of stretching to the full button, breaking which quarter of
    // the gradient lines up with which band — see src/index.css's
    // `.tecla-multipla-letra` doc comment) only exists once real layout
    // runs. Two real getBoundingClientRect() calls, compared structurally:
    // no pixel sampling needed, because both boxes must be identical, not
    // merely close.
    expect(await rectOf(letterBox)).toEqual(await rectOf(bandsBox));
  });

  /**
   * The gap the geometry test above could not see. It measured the band's
   * BOX and passed while the band's PAINT was wrong: `.tecla-segmento-ausente`
   * set only `background-color`, so an eliminated key in Dueto/Quarteto
   * rendered as bare page paper with a ghost letter, no silhouette, and a
   * still-clickable 44x44 target. A 44x44 assertion cannot fail on that.
   *
   * The invariant asserted instead is parity with the single-board key: the
   * third state is a blind deboss in this design language, and the segmented
   * variant must carry the same one its sibling does. Both keys are measured
   * in the same browser, in the same run, so the comparison needs no
   * hardcoded shadow string that could drift from the token.
   */
  test('an eliminated segmented band carries the same blind deboss its single-board sibling does', async ({
    page,
  }) => {
    const dayKey = dayKeyOf(Date.now());
    const pool = dailyPool();
    const soloAnswers = dailyAnswers(dayKey, 'solo', pool);
    const duetoAnswers = dailyAnswers(dayKey, 'dueto', pool);

    const solo = guessWithNoSharedLetters(soloAnswers, pool);
    const dueto = guessWithNoSharedLetters(duetoAnswers, pool);
    test.skip(
      solo === null || dueto === null,
      "today's deck leaves no five-letter guess disjoint from its answers",
    );

    await page.goto('/');

    // Single board first: this is the reference deboss.
    await page.getByRole('button', { name: 'Solo' }).click();
    await page.getByRole('button', { name: 'Diário' }).click();
    await submitGuess(page, solo!.guess);
    const singleKey = page.locator(`button.tecla-ausente:has-text("${solo!.absentLetter}")`).first();
    await expect(singleKey).toBeVisible();
    const referenceShadow = await boxShadowOf(singleKey);
    // Guards the guard: if the reference itself ever lost its deboss, the
    // parity assertion below would pass on two equally broken keys.
    expect(referenceShadow).toContain('inset');

    // Now the segmented band for a letter absent on BOTH Dueto boards.
    await page.getByRole('button', { name: 'Dueto' }).click();
    await submitGuess(page, dueto!.guess);
    const bands = page
      .locator(`button.tecla-multipla:has-text("${dueto!.absentLetter}")`)
      .first()
      .locator('.tecla-segmento-ausente');
    await expect(bands).toHaveCount(2);

    for (let index = 0; index < 2; index += 1) {
      expect(await boxShadowOf(bands.nth(index))).toBe(referenceShadow);
    }
  });
});
