import { expect, test } from '@playwright/test';

/** A confirmed accepted guess (see src/data/guesses.generated.ts) that is never the secret answer — see resume.spec.ts's comment for how that's verified. */
const GUESS = 'CASAS';

test.describe('mode tab focus does not swallow a submit', () => {
  test('clicking a mode tab with the mouse, then typing and pressing Enter, submits the guess', async ({ page }) => {
    await page.goto('/');

    // A real mouse click — not a keyboard activation — on a chrome button
    // outside the virtual keyboard.
    await page.getByRole('button', { name: 'Dueto' }).click();

    await page.keyboard.type(GUESS);
    await page.keyboard.press('Enter');

    // If the tab button had kept DOM focus after that click,
    // usePhysicalKeyboard.ts's isButtonOwnedActivationKey would (correctly,
    // by its own contract) treat it as owning this Enter: the button's own
    // click-on-Enter would just re-select the already-active "Dueto" tab (a
    // no-op), and the guess would never submit — exactly the two guesses
    // lost during Task 20's manual play-test. Two boards x 5 scored tiles
    // is only reachable if the guess actually went through.
    await expect(page.locator('[role="img"]')).toHaveCount(10);
  });

  // Carried gap from Task 20 (see this task's brief): the mirror-image
  // scenario, traced correct by hand but never asserted. Tab-focusing a
  // mode tab and activating it with Enter is a *keyboard* activation
  // (event.detail === 0), which blurOnMouseActivation.ts deliberately does
  // NOT blur — only a real mouse/touch click does (event.detail !== 0). A
  // regression that blurred unconditionally would break exactly this: a
  // keyboard-only player tabbing through the tab strip and pressing Enter
  // to select one.
  test('Tab-focusing a mode tab and pressing Enter switches it and keeps focus', async ({ page }) => {
    await page.goto('/');

    const duetoTab = page.getByRole('button', { name: 'Dueto' });
    await duetoTab.focus();
    await expect(duetoTab).toBeFocused();

    await page.keyboard.press('Enter');

    // The tab actually switched...
    await expect(duetoTab).toHaveAttribute('aria-pressed', 'true');
    // ...and, unlike a mouse click, activating it via the keyboard must not
    // have blurred it: focus stays right where Tab left it.
    await expect(duetoTab).toBeFocused();
  });
});
