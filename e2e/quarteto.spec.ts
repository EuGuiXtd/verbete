import { expect, test, type Locator, type Page } from '@playwright/test';
import { dayKeyOf } from '../src/engine/clock';
import { dailyAnswers } from '../src/engine/daily';
import { normalize } from '../src/engine/normalize';
import { dailyPool } from '../src/data/dictionary';

// Comfortably longer than --reveal-duration (320ms) + --press-duration
// (140ms) — see src/styles/tokens.css — so the per-match reveal gate has
// always cleared before the next guess is typed. Mirrors resume.spec.ts.
const REVEAL_SETTLE_MS = 600;

/**
 * A word guaranteed to be an accepted guess but never a secret answer for
 * ANY variant (see src/data/answers.generated.ts / resume.spec.ts, which
 * relies on the same guarantee) — so submitting it can never accidentally
 * solve one of the three boards this test needs to stay open.
 */
const SAFE_GUESS = 'CASAS';

async function submitGuess(page: Page, word: string): Promise<void> {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(REVEAL_SETTLE_MS);
}

/**
 * How many guesses a board has actually scored, read off the number of
 * `role="img"` tiles inside it (5 per scored row) — not the number of `<div>`
 * rows, which is always `maxAttempts` for an unsolved board regardless of
 * how many guesses it has taken (Board.tsx pads with empty rows up to that;
 * see its own doc comment). A frozen (solved) board's tile count stops
 * growing the moment it solves — that is the freeze this test is proving.
 */
async function scoredRowCount(board: Locator): Promise<number> {
  return (await board.locator('[role="img"]').count()) / 5;
}

test.describe('Quarteto daily: a solved board freezes while the rest of the match keeps going', () => {
  test('solving one board mutes only that board — the other three keep accepting guesses and the match stays in progress', async ({
    page,
  }) => {
    // The daily seed, pinned: derived the exact same way MatchProvider
    // derives it (dayKeyOf(Date.now()) -> dailyAnswers), not guessed or
    // hand-picked, so this test keeps working on whatever day it runs.
    const dayKey = dayKeyOf(Date.now());
    const answers = dailyAnswers(dayKey, 'quarteto', dailyPool());
    expect(answers).toHaveLength(4);
    const solvingGuess = normalize(answers[0]!);

    await page.goto('/');
    await page.getByRole('button', { name: 'Quarteto' }).click();
    await page.getByRole('button', { name: 'Diário' }).click();

    // `.grade-compacta` is Quarteto's own 2x2 grid wrapper (see
    // BoardGrid.tsx / index.css) — its direct children are the four boards,
    // in board order.
    const boards = page.locator('.grade-compacta > div');
    await expect(boards).toHaveCount(4);

    // Solve board 0 outright.
    await submitGuess(page, solvingGuess);

    // Board 0 freezes: muted and marked aria-disabled, exactly the
    // Board.tsx contract Board.test.tsx already proves in isolation — this
    // is the first time it is proven for one board out of four, in a real
    // browser, where the other three sit right next to it.
    await expect(boards.nth(0)).toHaveAttribute('aria-disabled', 'true');
    for (const index of [1, 2, 3]) {
      await expect(boards.nth(index)).not.toHaveAttribute('aria-disabled', 'true');
    }
    expect(await scoredRowCount(boards.nth(0))).toBe(1); // only the solving row — no draft, no padding

    // The match itself is still playing: no end-of-match reveal.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The other three boards still take guesses. A harmless, guaranteed-safe
    // guess (never today's answer for any of them) lands as a new row on
    // each of them...
    await submitGuess(page, SAFE_GUESS);

    expect(await scoredRowCount(boards.nth(0))).toBe(1); // frozen board: unchanged
    for (const index of [1, 2, 3]) {
      expect(await scoredRowCount(boards.nth(index))).toBe(2); // still playing: grew by one
    }

    // ...and the match as a whole is still in progress, not finished by one
    // of its four boards being solved.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
