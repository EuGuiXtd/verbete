import type { MouseEvent } from 'react';

/**
 * Clears focus after a real mouse/touch click, but not after a
 * keyboard-synthesized one. `event.detail` is 0 for a click a keyboard
 * activation (Enter/Space on a focused button) synthesizes, and 1 or more
 * for an actual mouse click — see the UIEvent.detail spec.
 *
 * Every "chrome" button outside the virtual keyboard — a mode/variant tab,
 * "nova palavra", the daily-rollover banner's "jogar", the theme toggle —
 * needs this on its `onClick`. `usePhysicalKeyboard.ts`'s
 * `isButtonOwnedActivationKey` correctly treats *any* currently-focused
 * button as owning the next Enter keystroke (that is what makes a
 * keyboard-only player's Tab-to-a-virtual-key-then-Enter produce exactly
 * one action — see e2e/keyboard-single-action.spec.ts). Without this, a
 * mouse click on a chrome button leaves it focused, and the very next
 * Enter a player presses — meaning to submit a guess — gets swallowed by
 * that button instead: found by hand during Task 20's play-test, twice.
 *
 * Blurring on a keyboard-synthesized click instead (by omitting the
 * `event.detail !== 0` guard) would break Tab-then-Enter navigation of the
 * tab itself, which is why this checks *how* the click happened rather
 * than blurring unconditionally.
 *
 * Deliberately never applied to the virtual keyboard's own buttons
 * (src/ui/keyboard/Key.tsx, Keyboard.tsx's `ActionKey`): a keyboard-only
 * player who tabs to a letter or action key and presses Enter is supposed
 * to have that key itself own the keystroke.
 */
export function blurOnMouseActivation(event: MouseEvent<HTMLButtonElement>): void {
  if (event.detail !== 0) event.currentTarget.blur();
}
