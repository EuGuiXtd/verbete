import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { usePhysicalKeyboard } from '../usePhysicalKeyboard';

function dispatchKey(key: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('usePhysicalKeyboard', () => {
  it('maps a lowercase letter key to the uppercase letter handler', () => {
    const onLetter = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    dispatchKey('a');

    expect(onLetter).toHaveBeenCalledWith('A');
  });

  it('maps Enter to submit and Backspace to delete', () => {
    const onEnter = vi.fn();
    const onBackspace = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter: vi.fn(), onEnter, onBackspace , onMoveCursor: vi.fn() }));

    dispatchKey('Enter');
    dispatchKey('Backspace');

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onBackspace).toHaveBeenCalledTimes(1);
  });

  it('ignores a letter typed with a modifier, so browser/OS shortcuts pass through untouched', () => {
    const onLetter = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    dispatchKey('r', { ctrlKey: true });
    dispatchKey('r', { metaKey: true });
    dispatchKey('t', { altKey: true });

    expect(onLetter).not.toHaveBeenCalled();
  });

  it('still accepts a shift-held letter as ordinary typing', () => {
    // Browsers report the already-shifted key value here (e.g. "A", not
    // "a" + shiftKey semantics that must be undone) — Shift alone is not
    // the kind of modifier this hook exists to reject; Ctrl/Alt/Meta are.
    const onLetter = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    dispatchKey('A', { shiftKey: true });

    expect(onLetter).toHaveBeenCalledWith('A');
  });

  it('ignores a key typed into an editable element', () => {
    const onLetter = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(onLetter).not.toHaveBeenCalled();
  });

  it('ignores a key typed into a contenteditable element', () => {
    const onLetter = vi.fn();
    const editable = document.createElement('div');
    // jsdom does not implement the `contentEditable` IDL setter (it leaves
    // the attribute unset and `isContentEditable` comes back `undefined`),
    // so the attribute is set directly — this is also exactly what a real
    // rich-text editor's markup looks like.
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(onLetter).not.toHaveBeenCalled();
  });

  it('ignores non-letter, non-control keys — digits, punctuation and accented/dead keys', () => {
    const onLetter = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    dispatchKey('1');
    dispatchKey('ç');
    dispatchKey('Dead');
    dispatchKey('´');

    expect(onLetter).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    const onLetter = vi.fn();
    const { unmount } = renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

    unmount();
    dispatchKey('a');

    expect(onLetter).not.toHaveBeenCalled();
  });

  describe('a focused <button> owns its own Enter/Space activation', () => {
    it('does not also submit when Enter targets a focused button', () => {
      // Every virtual key, the enviar/apagar action keys, and any other
      // button in the app render as a real <button>. A real browser turns
      // a focused button's Enter keydown into that button's own click —
      // this hook must stay out of the way of that, not add a second
      // action on top of it.
      const onEnter = vi.fn();
      const button = document.createElement('button');
      document.body.appendChild(button);
      renderHook(() => usePhysicalKeyboard({ onLetter: vi.fn(), onEnter, onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onEnter).not.toHaveBeenCalled();
    });

    it('does not reinterpret Enter on a focused button as submit — the button keeps its own action only', () => {
      // The sharper failure mode this guards against: Enter on a focused
      // "apagar" button, unguarded, would both delete a letter (via the
      // button's own click) AND submit (via this hook's onEnter) — two
      // different actions from one keypress, not just a duplicate of one.
      // jsdom does not implement the browser's native "Enter activates a
      // focused button" default action (verified directly: dispatching a
      // keydown Enter at a focused <button> produces no click event), so
      // the button's own resulting click is simulated here to stand in for
      // it — this is what a real browser produces, not an assumption.
      let actions = 0;
      const onEnter = () => {
        actions += 1;
      };
      const button = document.createElement('button');
      button.addEventListener('click', () => {
        actions += 1; // stands in for the button's own onClick (e.g. onBackspace)
      });
      document.body.appendChild(button);
      renderHook(() => usePhysicalKeyboard({ onLetter: vi.fn(), onEnter, onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(actions).toBe(1);
    });

    it('still forwards an ordinary letter typed while a button has focus', () => {
      // A plain <button> does not natively activate on a letter key, so
      // "play from any focus position" must still hold: tabbing onto the
      // theme toggle (or any button) and typing must not go silent.
      const onLetter = vi.fn();
      const button = document.createElement('button');
      document.body.appendChild(button);
      renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

      expect(onLetter).toHaveBeenCalledWith('A');
    });

    it('still submits on Enter when nothing owns it — the ordinary gameplay path', () => {
      // Control case: with no button focused (the common case during
      // actual play, where focus sits on document.body), Enter must keep
      // submitting exactly as before.
      const onEnter = vi.fn();
      renderHook(() => usePhysicalKeyboard({ onLetter: vi.fn(), onEnter, onBackspace: vi.fn() , onMoveCursor: vi.fn() }));

      dispatchKey('Enter');

      expect(onEnter).toHaveBeenCalledTimes(1);
    });
  });
});
