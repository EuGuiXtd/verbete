import { expect, test, type Locator } from '@playwright/test';

/** Plain {x, y, width, height}, not a DOMRect: page.evaluate serializes over the wire as JSON, and DOMRect's fields are prototype getters that JSON.stringify drops. */
async function rectOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
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
});
