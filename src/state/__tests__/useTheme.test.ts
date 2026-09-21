import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPrefs, savePrefs } from '../../storage/repository';
import { isThemeChoice, THEME_ATTRIBUTE, useTheme } from '../useTheme';

/**
 * A controllable stand-in for window.matchMedia. jsdom ships one, but it
 * always answers `false` and never emits a change, so a test that wanted to
 * assert "resolved follows the OS" against the real one would pass while
 * proving nothing.
 */
function installMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const query = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => query as unknown as MediaQueryList,
  });

  return {
    listenerCount: () => listeners.size,
    set(next: boolean) {
      dark = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

function themeColor(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('isThemeChoice', () => {
  it('accepts exactly the three stored values', () => {
    expect(['system', 'light', 'dark'].every(isThemeChoice)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['Dark', '', null, undefined, 0, {}]) {
      expect(isThemeChoice(value)).toBe(false);
    }
  });
});

describe('useTheme', () => {
  it('defaults to system and leaves the attribute off the document', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it('resolves to dark from the media query alone, without touching the attribute', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(result.current.resolved).toBe('dark');
    // The attribute must stay off: the CSS media query is what governs here,
    // and writing data-theme="dark" would freeze the choice.
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it('follows the OS while the choice is system', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');

    act(() => {
      media.set(true);
    });
    expect(result.current.resolved).toBe('dark');

    act(() => {
      media.set(false);
    });
    expect(result.current.resolved).toBe('light');
  });

  it('overrides a dark OS when the player picks light', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('ignores the OS once a choice is made', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });
    act(() => {
      media.set(false);
    });

    expect(result.current.resolved).toBe('dark');
  });

  it('removes the attribute when the player goes back to system', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');

    act(() => {
      result.current.setTheme('system');
    });
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(result.current.resolved).toBe('dark');
  });

  it('persists the choice so a reload starts where the player left off', () => {
    installMatchMedia(false);
    const first = renderHook(() => useTheme());

    act(() => {
      first.result.current.setTheme('dark');
    });
    first.unmount();
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);

    expect(loadPrefs().theme).toBe('dark');

    const second = renderHook(() => useTheme());
    expect(second.result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('leaves the other preferences alone when writing the theme', () => {
    installMatchMedia(false);
    savePrefs({ colorBlindMode: false, reduceMotion: true, hardMode: true, theme: 'system' });

    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme('dark');
    });

    expect(loadPrefs()).toEqual({
      colorBlindMode: false,
      reduceMotion: true,
      hardMode: true,
      theme: 'dark',
    });
  });

  it('falls back to system when the stored value is not one of the three', () => {
    installMatchMedia(false);
    localStorage.setItem(
      'verbete:prefs',
      JSON.stringify({ v: 1, data: { colorBlindMode: false, reduceMotion: false, hardMode: false, theme: 'sepia' } }),
    );

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it('reads a record written before the theme field existed', () => {
    installMatchMedia(false);
    localStorage.setItem(
      'verbete:prefs',
      JSON.stringify({ v: 1, data: { colorBlindMode: false, reduceMotion: false, hardMode: false } }),
    );

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('keeps the browser chrome colour in step with the resolved theme', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(themeColor()).toBe('#e9e4da');

    act(() => {
      media.set(true);
    });
    expect(themeColor()).toBe('#1a1815');

    act(() => {
      result.current.setTheme('light');
    });
    expect(themeColor()).toBe('#e9e4da');
  });

  it('unsubscribes from the media query on unmount', () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useTheme());
    expect(media.listenerCount()).toBe(1);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('renders without matchMedia at all', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');
  });
});
