import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, savePrefs } from '../storage/repository';
import type { ThemeChoice } from '../storage/schema';

export type { ThemeChoice };

/** What the page actually renders as, once `'system'` has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * The attribute tokens.css keys off. `'system'` is expressed by the attribute
 * being ABSENT, not by `data-theme="system"`, because the dark rules are
 * written as `:root:not([data-theme='light'])` inside the media query — an
 * attribute with any value would still have to be excluded by name, and one
 * more name is one more way to get it wrong.
 */
export const THEME_ATTRIBUTE = 'data-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Kept in sync with --paper in src/styles/tokens.css and the script in index.html. */
const PAPER: Record<ResolvedTheme, string> = {
  light: '#e9e4da',
  dark: '#1a1815',
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Puts the choice on the document. Exported because the pre-paint script in
 * index.html does the same thing in plain JS before the bundle exists, and
 * the two must not drift.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute(THEME_ATTRIBUTE);
  } else {
    root.setAttribute(THEME_ATTRIBUTE, choice);
  }
}

function prefersDark(): boolean {
  // jsdom and very old browsers may not have matchMedia at all; treat its
  // absence as "no dark preference" rather than throwing on first render.
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function readStoredChoice(): ThemeChoice {
  // loadPrefs() fills in a missing `theme` from the defaults, but it does not
  // check the value — a hand-edited or half-migrated record can still hold
  // something that is not one of the three. Anything unrecognised means
  // "no opinion".
  const stored: unknown = loadPrefs().theme;
  return isThemeChoice(stored) ? stored : 'system';
}

function syncThemeColor(resolved: ResolvedTheme): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', PAPER[resolved]);
}

export interface ThemeControl {
  /** What the player asked for, including `'system'`. */
  readonly theme: ThemeChoice;
  /** What that currently means on this device. */
  readonly resolved: ResolvedTheme;
  setTheme(next: ThemeChoice): void;
}

/**
 * Three-state appearance control: follow the OS, or override it in either
 * direction. The choice survives a reload through prefs; the no-flash problem
 * is handled separately by the inline script in index.html, which applies the
 * same attribute before first paint.
 */
export function useTheme(): ThemeControl {
  const [theme, setThemeState] = useState<ThemeChoice>(readStoredChoice);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    // Re-read on mount: the OS could have changed between the initial state
    // being computed and this effect running.
    setSystemDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  const resolved: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Reconciles the attribute with React's idea of the choice. On first mount
  // this is normally a no-op, because the pre-paint script already wrote it.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    syncThemeColor(resolved);
  }, [resolved]);

  const setTheme = useCallback((next: ThemeChoice) => {
    // Applied here as well as in the effect so the paint and the write happen
    // in the same frame as the click, not one render later.
    applyTheme(next);
    setThemeState(next);
    savePrefs({ ...loadPrefs(), theme: next });
  }, []);

  return { theme, resolved, setTheme };
}
