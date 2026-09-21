import { expect, test } from '@playwright/test';

/**
 * Six distinct, real, accepted five-letter guesses (see
 * src/data/guesses.generated.ts) — enough to exhaust Solo's six attempts
 * regardless of which word infinite mode drew as the secret. Whether that
 * exhausts the match as a win (one of these happens to be the secret) or a
 * loss (none of them are) is not the point of this spec; either way the
 * match finishes and the reveal must show up and stay up.
 */
const GUESSES = ['CASAS', 'HORAS', 'TERRA', 'PRATO', 'FINDO', 'CLARO'];

test.describe('the end-of-match reveal', () => {
  test('appears via real keyboard play and stays visible — does not swallow its own finishing Enter', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    for (const word of GUESSES) {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    // Regression for a real bug caught during this task's manual playtest:
    // a first version moved focus onto the modal's own "fechar" button as
    // soon as it appeared. Because the match-finishing SUBMIT was itself
    // triggered by an Enter keypress, the browser's own keyup for that same
    // Enter then landed on the newly-focused "fechar" button and activated
    // it — closing the modal before it was ever visibly on screen. This
    // must not just "eventually" be visible; it must survive well past the
    // moment that stray activation would have fired.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(dialog).toBeVisible();

    // The headword shown is a real dictionary entry, not the raw uppercase
    // board letters: lowercase, exactly as src/data/answers.generated.ts
    // stores it.
    const headword = dialog.locator('h3 span').first();
    await expect(headword).toBeVisible();
    const text = await headword.textContent();
    expect(text).toBe(text?.toLowerCase());

    // The Wikcionário link is present and points at this exact word. The
    // href itself is percent-encoded (see ResultModal.tsx's
    // encodeURIComponent(answer)) — this test found that the hard way: it
    // was written comparing the raw text, which only failed the run an
    // unseeded infinite match happened to draw an accented word (e.g.
    // "dúzia"), because plain ASCII answers round-trip through
    // encodeURIComponent unchanged and hid the bug the rest of the time.
    const link = dialog.getByRole('link', { name: /wikcionário/i }).first();
    await expect(link).toHaveAttribute(
      'href',
      `https://pt.wiktionary.org/wiki/${encodeURIComponent(text ?? '')}`,
    );
  });

  test('the "fechar" control actually closes it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    for (const word of GUESSES) {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: /fechar/i }).click();
    await expect(dialog).toBeHidden();
  });

  test('pressing Escape closes it too', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    for (const word of GUESSES) {
      await page.keyboard.type(word);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Not a click on any element — a bare keypress, exercising
    // ResultModal's own `document`-level "Escape" listener, which is
    // otherwise unexercised by every other test in this file (they only
    // ever close it, when they close it at all, via the "fechar" button).
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
