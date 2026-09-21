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

  // The keyboard-only test above cannot, by construction, prove the
  // mouse-click half of finding 2: `blurOnMouseActivation` only ever fires
  // for a real mouse click (`event.detail !== 0`), so a Tab+Enter open never
  // loses focus from "Ajuda" in the first place — the restore-on-close
  // logic has nothing to do there, and mutation-testing this task's report
  // documents confirmed that spec alone stays green whether or not the
  // restore fix exists at all. A genuine mouse click is what actually
  // exercises it: Header no longer blurs Ajuda on click (see Modal.tsx's
  // own doc comment), so Ajuda starts genuinely focused, "fechar" then
  // blurs itself on its own click, and only the restore-on-unmount fix
  // brings focus back to Ajuda afterwards.
  test('a mouse-clicked Ajuda gets focus back after HelpModal closes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Teclado' })).toBeVisible();

    const ajudaButton = page.getByRole('button', { name: 'Ajuda' });
    await ajudaButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'fechar' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(ajudaButton).toBeFocused();
  });
});
