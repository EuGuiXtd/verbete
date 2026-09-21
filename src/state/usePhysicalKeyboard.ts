import { useEffect } from 'react';

export interface PhysicalKeyboardHandlers {
  readonly onLetter: (letter: string) => void;
  readonly onEnter: () => void;
  readonly onBackspace: () => void;
}

const LETTER_KEY = /^[a-zA-Z]$/;

/**
 * True for anything that already owns keystrokes: a real `<input>`/
 * `<textarea>`/`<select>`, or a contenteditable region. The game has none
 * of these today — the virtual keyboard is the only touch input path, and
 * this hook exists only to let a desktop player type instead of clicking —
 * but the guard stays regardless, so a dev tool, an embedded iframe, or a
 * future settings field never gets its own typing hijacked by this hook.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // `isContentEditable` is the correct check (it accounts for inheritance
  // from an ancestor), but jsdom does not implement it — it comes back
  // `undefined` even on an element carrying `contenteditable="true"` — so
  // the attribute is checked directly as well, which also covers the case
  // real browsers care about: the attribute present and not explicitly
  // "false".
  if (target.isContentEditable) return true;
  const contentEditable = target.getAttribute('contenteditable');
  if (contentEditable !== null && contentEditable !== 'false') return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/**
 * Ctrl/Alt/Meta mark a browser or OS-level shortcut (copy, reload, switch
 * app, ...) that this hook must never swallow. Shift is deliberately not
 * included: a physically shift-held letter is still just typing (browsers
 * already report the shifted `key` value, e.g. "A"), not a shortcut chord.
 */
function hasBlockingModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}

/**
 * Desktop-only typing path. Listens on `document`, never on a text field —
 * there is no real `<input>` anywhere in this game. A native pt-BR keyboard
 * would offer accented keys, a dead-key `´`, autocorrect and composition
 * events, all of which fight the engine's A–Z-only rule; a lone-character
 * `keydown` on `document` has none of that, which is exactly why the
 * virtual keyboard, not this hook, is the touch input path.
 */
export function usePhysicalKeyboard({ onLetter, onEnter, onBackspace }: PhysicalKeyboardHandlers): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasBlockingModifier(event)) return;
      if (isEditableTarget(event.target)) return;

      if (LETTER_KEY.test(event.key)) {
        onLetter(event.key.toUpperCase());
        return;
      }
      if (event.key === 'Enter') {
        onEnter();
        return;
      }
      if (event.key === 'Backspace') {
        onBackspace();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onLetter, onEnter, onBackspace]);
}
