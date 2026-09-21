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
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

    dispatchKey('a');

    expect(onLetter).toHaveBeenCalledWith('A');
  });

  it('maps Enter to submit and Backspace to delete', () => {
    const onEnter = vi.fn();
    const onBackspace = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter: vi.fn(), onEnter, onBackspace }));

    dispatchKey('Enter');
    dispatchKey('Backspace');

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onBackspace).toHaveBeenCalledTimes(1);
  });

  it('ignores a letter typed with a modifier, so browser/OS shortcuts pass through untouched', () => {
    const onLetter = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

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
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

    dispatchKey('A', { shiftKey: true });

    expect(onLetter).toHaveBeenCalledWith('A');
  });

  it('ignores a key typed into an editable element', () => {
    const onLetter = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

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
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(onLetter).not.toHaveBeenCalled();
  });

  it('ignores non-letter, non-control keys — digits, punctuation and accented/dead keys', () => {
    const onLetter = vi.fn();
    renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

    dispatchKey('1');
    dispatchKey('ç');
    dispatchKey('Dead');
    dispatchKey('´');

    expect(onLetter).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    const onLetter = vi.fn();
    const { unmount } = renderHook(() => usePhysicalKeyboard({ onLetter, onEnter: vi.fn(), onBackspace: vi.fn() }));

    unmount();
    dispatchKey('a');

    expect(onLetter).not.toHaveBeenCalled();
  });
});
