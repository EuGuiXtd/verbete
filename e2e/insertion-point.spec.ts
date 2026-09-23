import { expect, test, type Page } from '@playwright/test';

/**
 * Feedback round 1, item 3: "tinha que dar para selecionar em qual bloco da
 * palavra você quer inserir a letra, em vez de digitar sempre da esquerda
 * para a direita."
 *
 * The engine's own rules are covered exhaustively by unit tests
 * (src/engine/__tests__/match.test.ts — where the cursor arithmetic actually
 * lives). What only a browser can answer is whether the two INPUT paths
 * really reach those rules: a real click on a real tile, and a real arrow
 * key with focus wherever the browser happens to have left it. Both are
 * things a jsdom test can fake into passing while the shipped page does
 * nothing at all.
 */

/** The active row is the first one holding no scored tile — i.e. the draft row. */
function activeRowTiles(page: Page) {
  return page.locator('[role="group"][aria-label="Tabuleiro 1"] > div').nth(0).locator('.sorte');
}

async function letters(page: Page): Promise<string[]> {
  return activeRowTiles(page).evaluateAll((tiles) => tiles.map((tile) => tile.textContent ?? ''));
}

test.describe('choosing which block to type into', () => {
  test('clicking a tile moves the insertion point there, and typing fills from it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    // Third house of the empty first row.
    await activeRowTiles(page).nth(2).click();
    await expect(activeRowTiles(page).nth(2)).toHaveClass(/sorte-cursor/);

    await page.keyboard.type('S');
    // The S landed in house 3, not house 1 — which is the entire feature.
    expect(await letters(page)).toEqual(['', '', 'S', '', '']);
    // And the cursor carried on to the next empty house rather than staying put.
    await expect(activeRowTiles(page).nth(3)).toHaveClass(/sorte-cursor/);
  });

  test('backspace clears the house the player pointed at, not the one before it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
    await page.keyboard.type('PRATO');
    expect(await letters(page)).toEqual(['P', 'R', 'A', 'T', 'O']);

    await activeRowTiles(page).nth(1).click();
    await page.keyboard.press('Backspace');
    expect(await letters(page)).toEqual(['P', '', 'A', 'T', 'O']);
  });

  test('the arrow keys move it too, from whatever has focus', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    // Focus a virtual key first: the whole point of listening on `document`
    // is that play works from any focus position, and the arrow keys have to
    // inherit that rather than needing the board focused.
    await page.getByRole('button', { name: 'Q', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(activeRowTiles(page).nth(2)).toHaveClass(/sorte-cursor/);

    await page.keyboard.press('ArrowLeft');
    await expect(activeRowTiles(page).nth(1)).toHaveClass(/sorte-cursor/);

    await page.keyboard.type('X');
    expect(await letters(page)).toEqual(['', 'X', '', '', '']);
  });

  test('moving the insertion point announces where it went, in its own live region', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
    await page.keyboard.type('PRATO');

    const regions = page.getByRole('status');
    await activeRowTiles(page).nth(2).click();
    // The house AND what is already in it: a listener has no board to look
    // at, and "move there" is a decision about the letter already sitting
    // there. Asserted across the regions rather than at a fixed index, since
    // which of the three carries it is an implementation detail.
    await expect(regions.filter({ hasText: 'Posição 3, A.' })).toHaveCount(1);

    // And it did NOT land in the row/outcome region: that one is atomic, so
    // borrowing it would re-read a whole five-letter summary per arrow key.
    await expect(regions.filter({ hasText: 'Tentativa' })).toHaveCount(0);
  });

  test('typing left to right is untouched for a player who never uses any of this', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    await page.keyboard.type('PRATO');
    expect(await letters(page)).toEqual(['P', 'R', 'A', 'T', 'O']);
    // A sixth letter is still ignored rather than overwriting the fifth.
    await page.keyboard.type('Z');
    expect(await letters(page)).toEqual(['P', 'R', 'A', 'T', 'O']);
    // Backspace still eats from the right.
    await page.keyboard.press('Backspace');
    expect(await letters(page)).toEqual(['P', 'R', 'A', 'T', '']);
    // And no house is marked while the cursor sits past the end of a full
    // word — there is nothing there to mark.
    await page.keyboard.type('O');
    await expect(activeRowTiles(page).locator('.sorte-cursor')).toHaveCount(0);
  });

  test('a scored row is never a target — only the row being typed into', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();
    // Any accepted five-letter word; this one is in the guess table.
    await page.keyboard.type('CASAL');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const board = page.locator('[role="group"][aria-label="Tabuleiro 1"]');
    const scoredRow = board.locator('> div').nth(0);
    await expect(scoredRow.locator('.sorte').first()).toHaveClass(/sorte-(certa|presente|ausente)/);

    // Exactly one marked house on the whole board, and it is in the row
    // below — the new active one — not in the row just scored.
    await expect(board.locator('.sorte-cursor')).toHaveCount(1);
    await expect(scoredRow.locator('.sorte-cursor')).toHaveCount(0);
    await expect(scoredRow.locator('.cursor-pointer')).toHaveCount(0);
  });
});
