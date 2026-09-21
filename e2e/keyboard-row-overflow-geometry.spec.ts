import { expect, test } from '@playwright/test';

/**
 * Task 23 found this by rendering, not by reading the source: a segmented
 * (Dueto/Quarteto) key is fixed at 44px with no narrower mobile variant
 * (see Key.tsx's `.tecla-multipla`), so at 320px its keyboard row is far
 * wider than the viewport. The row's old `justify-content: center` (paired
 * with `overflow-x-auto`) is the exact same flex-centering-vs-overflow trap
 * Shell.tsx's own doc comment describes for the vertical axis: centering
 * overflowing content shifts the flex line so part of it starts to the
 * LEFT of the scrollport's origin, and `scrollLeft` cannot go negative to
 * reach it. Measured before the fix: "Q" sat off-screen at every reachable
 * scroll position on a 320px viewport in Quarteto — not merely
 * inconvenient, genuinely untappable. jsdom cannot see this at all (it
 * performs no layout), so this is a real-browser geometry test, the same
 * pattern segmented-key-geometry.spec.ts already established.
 */
test.describe('keyboard row overflow at 320px does not strand a key off-screen', () => {
  test('the first letter key sits flush at the row\'s own left edge at rest, not off-screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Quarteto' }).click();

    const firstRow = page.locator('[role="group"][aria-label="Teclado"] > div').first();
    const rowBox = await firstRow.boundingBox();
    const firstKey = firstRow.getByRole('button').first();
    const keyBox = await firstKey.boundingBox();

    expect(rowBox).not.toBeNull();
    expect(keyBox).not.toBeNull();
    // At rest (scrollLeft defaults to 0) the very first key's left edge must
    // be at or after the row's own left edge — never negative relative to
    // it, which is what "off-screen and unreachable" looked like before
    // this fix (measured: -78px at a 320px viewport).
    expect(keyBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 0.5);
  });

  test('the appended enviar/apagar keys are reachable by scrolling the last row all the way right', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Quarteto' }).click();

    const lastRow = page.locator('[role="group"][aria-label="Teclado"] > div').last();
    await lastRow.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });

    const sendButton = page.getByRole('button', { name: 'Enviar tentativa' });
    await expect(sendButton).toBeVisible();
    const rowBox = await lastRow.boundingBox();
    const sendBox = await sendButton.boundingBox();
    expect(sendBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    // Fully inside the row's own visible box, not clipped off its right edge.
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);
  });
});
