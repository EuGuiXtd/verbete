import { expect, test, type Page } from '@playwright/test';

/**
 * Feedback round 1, items 2 and 8 — both of them layout bugs a class-string
 * unit test will happily call correct. `BoardGrid.test.tsx` asserts which
 * Tailwind classes are on the container; that is worth having (it pins the
 * intent, and it runs in milliseconds) but it cannot see a breakpoint, a
 * cascade, or a board that ended up below the fold, because jsdom performs
 * no layout at all. The 2x2 that shipped to the owner passed every one of
 * those assertions.
 *
 * So these measure. Every check below is a `getBoundingClientRect()` on a
 * real Chromium render: which boards share a row, which share a column, and
 * — the part the owner actually complained about — whether they are on
 * screen at the same time.
 */

/** Plain rects: page.evaluate serialises over the wire, and DOMRect's fields are prototype getters JSON.stringify drops. */
async function boardRects(page: Page): Promise<{ x: number; y: number; width: number; height: number }[]> {
  return page.locator('[role="group"][aria-label^="Tabuleiro"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
}

async function open(page: Page, variant: string, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await page.getByRole('button', { name: variant, exact: true }).click();
  await expect(page.locator('[role="group"][aria-label^="Tabuleiro"]').first()).toBeVisible();
}

test.describe('Dueto is side by side at every width (feedback item 2)', () => {
  // 320 is the narrowest phone anyone still ships; 360 and 390 are the two
  // most common in Brazil and both sat BELOW the old `sm:` (640px) gate,
  // which is exactly why the owner saw a stacked pair. 639 is the last pixel
  // under that old gate — the widest screen the old code still stacked on.
  for (const width of [320, 360, 390, 639]) {
    test(`two boards share a row at ${String(width)}px`, async ({ page }) => {
      await open(page, 'Dueto', { width, height: 800 });
      const boards = await boardRects(page);
      expect(boards).toHaveLength(2);
      const [left, right] = boards as [typeof boards[0], typeof boards[0]];

      // Same top line, and horizontally disjoint: that pair of facts IS
      // "side by side", and neither one alone is (two stacked boards also
      // share an x, and two boards in different rows also have disjoint x).
      expect(Math.abs(left.y - right.y)).toBeLessThan(1);
      expect(left.x + left.width).toBeLessThanOrEqual(right.x + 0.5);
      // Neither is a sliver, and they are the same size: a "side by side"
      // that gave one board 8px would satisfy everything above. Measured
      // against the GRID's own width rather than the viewport's, because the
      // grid is capped (`max-w-3xl`) and on a wide screen is deliberately
      // narrower than the page.
      const grid = await page.locator('.grade-dupla').evaluate((el) => el.getBoundingClientRect().width);
      expect(left.width).toBeGreaterThan(grid * 0.4);
      expect(right.width).toBeGreaterThan(grid * 0.4);
      expect(Math.abs(left.width - right.width)).toBeLessThan(1);
      // And the pair really is using the screen, not shrinking into a
      // column: the grid itself claims most of the viewport at these widths.
      expect(grid).toBeGreaterThan(width * 0.8);
    });
  }
});

test.describe('Quarteto puts all four across on a wide screen (feedback item 8)', () => {
  for (const width of [1280, 1512]) {
    test(`four boards share one row, all on screen, at ${String(width)}px`, async ({ page }) => {
      await open(page, 'Quarteto', { width, height: 900 });
      const boards = await boardRects(page);
      expect(boards).toHaveLength(4);

      // One row: every board on the same top line.
      const tops = boards.map((board) => board.y);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);

      // Four distinct columns, left to right, none overlapping.
      const sorted = [...boards].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i - 1]!.x + sorted[i - 1]!.width).toBeLessThanOrEqual(sorted[i]!.x + 0.5);
      }

      // The whole point: no scrolling to reach board 3 or 4. Every board's
      // full box inside the viewport, vertically as well as horizontally —
      // the 2x2 this replaces failed the vertical half at 1280x900.
      for (const board of boards) {
        expect(board.x).toBeGreaterThanOrEqual(-0.5);
        expect(board.x + board.width).toBeLessThanOrEqual(width + 0.5);
        expect(board.y).toBeGreaterThanOrEqual(-0.5);
        expect(board.y + board.height).toBeLessThanOrEqual(900 + 0.5);
      }
    });
  }

  test('falls back to two across on a phone rather than four unreadable columns', async ({ page }) => {
    await open(page, 'Quarteto', { width: 390, height: 844 });
    const boards = await boardRects(page);
    expect(boards).toHaveLength(4);

    const tops = [...new Set(boards.map((board) => Math.round(board.y)))];
    expect(tops).toHaveLength(2);
    const lefts = [...new Set(boards.map((board) => Math.round(board.x)))];
    expect(lefts).toHaveLength(2);
  });
});

/**
 * Task 25's property, re-pinned because item 8 moved the grid it lives on: a
 * board that solved early must shrink from the bottom rather than stretch to
 * its still-playing neighbour's height. `align-items` is the whole mechanism
 * (see BoardGrid.tsx's doc comment on `items-start`), and it is read here off
 * the computed style of the real grid in the real browser, in the four-across
 * configuration this change introduced, rather than off a class string.
 */
test('the four-across grid still anchors its boards to the top of their row', async ({ page }) => {
  await open(page, 'Quarteto', { width: 1280, height: 900 });
  const grid = page.locator('.grade-compacta');
  // Tailwind's `items-start` emits `align-items: flex-start`, which on a grid
  // container behaves exactly as `start` does — this asserts the computed
  // value the browser actually reports, not the keyword the utility is named
  // after. What matters is only that it is not `stretch`, the grid default
  // that was inflating a solved board's box.
  await expect(grid).toHaveCSS('align-items', 'flex-start');
  await expect(grid).toHaveCSS('grid-template-columns', /(\d|\.)+px (\d|\.)+px (\d|\.)+px (\d|\.)+px/);
});
