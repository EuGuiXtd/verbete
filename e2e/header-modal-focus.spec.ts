import { expect, test } from '@playwright/test';

test.describe('header modal focus', () => {
  // Review round 2, findings 1 and 2. Three things in one real-browser pass:
  //
  // 1. The keyboard-open path itself works at all: Tab to a modal trigger,
  //    Enter opens it.
  // 2. The historical "focus stolen on mount eats the opening keypress" bug
  //    class (see ResultModal.tsx's own doc comment for the original,
  //    real occurrence of it) never touches these four modals: Modal.tsx
  //    deliberately never moves focus on mount, specifically so the same
  //    Enter that opened the dialog can't also have its `keyup` land on a
  //    freshly-focused close button and close the dialog before it was ever
  //    visibly rendered. This is exactly the kind of claim a real browser
  //    needs to confirm — jsdom's timing does not reproduce the native
  //    keydown/keyup pair a Playwright `press('Enter')` does.
  // 3. Escape closes it AND returns focus to the button that opened it
  //    (Modal.tsx's focus-restore, review round 2 finding 2) — provable
  //    here specifically because the keyboard-open path never blurs the
  //    trigger in the first place (`blurOnMouseActivation` only fires on a
  //    real mouse click), so this also confirms the restore doesn't
  //    somehow move focus away from where it already correctly was.
  test('Tab to Ajuda, Enter opens it and it stays open, Escape closes it and returns focus', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const ajudaButton = page.getByRole('button', { name: 'Ajuda' });
    await ajudaButton.focus();
    await expect(ajudaButton).toBeFocused();

    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Not just "eventually visible" — must survive well past the moment a
    // stray keyup from this same Enter could have closed it, mirroring
    // result-modal.spec.ts's own "stays visible" assertion for the same
    // bug class.
    await page.waitForTimeout(1000);
    await expect(dialog).toBeVisible();
    // This is the assertion that actually has teeth against a reintroduced
    // mount-time focus steal (see this task's report for why "stays
    // visible" alone does not, for this specific button-activates-it
    // interaction shape): Modal.tsx must never move focus into the dialog
    // on open, so it must still be sitting on "Ajuda", not on "fechar" or
    // anywhere else inside the sheet.
    await expect(ajudaButton).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(ajudaButton).toBeFocused();
  });

  // The keyboard-only test above cannot, by construction, prove anything
  // about the mouse path: `blurOnMouseActivation` only ever fires for a
  // real mouse click (`event.detail !== 0`), so a Tab+Enter open never
  // loses focus from "Ajuda" in the first place. A genuine mouse click is
  // what actually exercises it.
  //
  // Round 2 of this task's review had this test assert
  // `expect(ajudaButton).toBeFocused()` after closing — which passed, but
  // for the wrong reason: it required removing `blurOnMouseActivation`
  // from Ajuda so it would still be focused for `Modal` to capture, which
  // in turn left a real button focused after a mouse-driven close. That
  // "worked" for the assertion actually written, but a mouse player who
  // then pressed a bare Enter (not a letter — see
  // `usePhysicalKeyboard.ts`'s `isButtonOwnedActivationKey`) would have
  // reopened the dialog instead of submitting a guess: the Task 20 bug,
  // back through a different door.
  //
  // Round 3 restored `blurOnMouseActivation` on all four modal-opening
  // buttons (see `Modal.tsx`'s own doc comment for why that costs nothing
  // once focus-restore already exists) and this test's assertion changed
  // to match: a mouse-opened, mouse-closed dialog leaves NO button
  // focused — `document.activeElement` at mount time was already `body`,
  // so the restore-on-close is a correct no-op — and the proof that
  // matters is behavioural, not "what has DOM focus": a bare Enter right
  // after closing must reach the game, not reopen Ajuda.
  test('a mouse-clicked Ajuda leaves no button focused, so a bare Enter after closing does not reopen it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const ajudaButton = page.getByRole('button', { name: 'Ajuda' });
    await ajudaButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: 'fechar' }).click();
    await expect(dialog).toBeHidden();

    // The regression round 2 introduced, made concrete: with the draft
    // empty, a bare Enter that actually reaches the game produces a
    // "Faltam letras" rejection toast (engine/match.ts's `too_short`,
    // surfaced via MatchProvider's REJECTED effect) — proof this Enter was
    // not instead swallowed by a still-focused "Ajuda" button re-clicking
    // itself. If it had been swallowed, neither the toast nor this
    // assertion's alternative (the dialog reopening) would leave the
    // dialog visible — but reopening is the one that actually indicates a
    // real regression, so that is what this checks first and foremost.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Faltam letras')).toBeVisible();
  });
});
