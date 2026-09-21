import { expect, test, type Page } from '@playwright/test';

/**
 * Two words guaranteed to be accepted guesses (see src/data/guesses.generated.ts)
 * but never the secret answer (see src/data/answers.generated.ts) — verified
 * against the real generated dictionary, not mocked. That means this test
 * can never accidentally win or lose Solo infinite's match on its own, no
 * matter which answer was drawn: both guesses stay wrong, forever, so the
 * board is deterministically still "playing" after both are submitted.
 */
const FIRST_GUESS = 'CASAS';
const SECOND_GUESS = 'HORAS';

// Comfortably longer than --reveal-duration (320ms) + --press-duration
// (140ms) — see src/styles/tokens.css — so the reveal gate that blocks a
// second SUBMIT while the first guess's row is still animating has always
// cleared before the next guess is typed.
const REVEAL_SETTLE_MS = 600;

async function submitGuess(page: Page, word: string): Promise<void> {
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(REVEAL_SETTLE_MS);
}

/** Every scored tile's letter and result, in DOM order — the entire visible board state. */
async function readScoredTiles(page: Page): Promise<{ label: string | null; letter: string | null }[]> {
  return page.locator('[role="img"]').evaluateAll((tiles) =>
    tiles.map((tile) => ({ label: tile.getAttribute('aria-label'), letter: tile.textContent })),
  );
}

test.describe('resuming a match after reload', () => {
  test('Solo infinite keeps both guessed rows and their exact tile states after a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await submitGuess(page, FIRST_GUESS);
    await submitGuess(page, SECOND_GUESS);

    const before = await readScoredTiles(page);
    // Two five-letter rows scored, nothing more — proves the guesses were
    // actually accepted (a rejection scores nothing) before we even reload.
    expect(before).toHaveLength(10);

    await page.reload();
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const after = await readScoredTiles(page);
    expect(after).toEqual(before);
  });
});
