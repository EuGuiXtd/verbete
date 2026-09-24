import { expect, test } from '@playwright/test';

test.describe('keyboard-only activation', () => {
  test('pressing Enter on a focused key fires exactly one action, not two', async ({ page }) => {
    await page.goto('/');

    // Four letters typed via the real physical-keyboard path, deliberately
    // not submitted, so the active row's draft is a known, non-empty length.
    await page.keyboard.type('CASA');
    await expect(page.locator('.sorte-preenchida')).toHaveCount(4);

    // Tab-reachable, then Enter — not a click. jsdom does not turn a
    // focused <button>'s Enter keypress into a native `click`, so this
    // property previously rested on usePhysicalKeyboard.ts's documented
    // spec assumption (`isButtonOwnedActivationKey`) rather than an
    // observation in a real browser, which does fire that click.
    await page.getByRole('button', { name: 'Apagar letra' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sorte-preenchida')).toHaveCount(3);

    // A regression that let the document-level physical-keyboard listener
    // ALSO react to this same Enter (instead of recognizing a button
    // already owns it) fires a second, DIFFERENT action — onEnter() — in a
    // separate render from the click's own onBackspace(), not the same
    // one: submitting a too-short draft shows a rejection toast a few
    // milliseconds later than the backspace itself lands. This waits for
    // that later render's window before checking — long enough for a
    // doubled action to have shown up, short of the toast's 2600ms
    // auto-dismiss (see Toast.tsx) — and then takes one plain, non-retrying
    // snapshot of the count. An auto-retrying `expect(locator).toHaveCount(0)`
    // here would be worthless: its own ~5s default polling window outlasts
    // the toast's 2600ms lifetime, so it would still end up "seeing" 0 and
    // pass even if the toast genuinely appeared and then auto-dismissed —
    // exactly the double-fire this test exists to catch.
    await page.waitForTimeout(400);
    expect(await page.getByText('A palavra tem cinco letras').count()).toBe(0);
  });
});
