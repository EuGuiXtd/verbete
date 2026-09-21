import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Header } from '../Header';
import { THEME_ATTRIBUTE } from '../../../state/useTheme';

// jsdom's own matchMedia always answers `false` and never fires a listener,
// but installing a controllable one (as src/state/__tests__/useTheme.test.ts
// does) isn't the point here — Header only needs matchMedia to exist and
// not throw, so useTheme can read a starting `resolved` value.
function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => {
  installMatchMedia();
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe('Header', () => {
  it('carries the wordmark set as a dictionary headword — lowercase serif, then "s.m."', () => {
    render(<Header />);
    // Syllable-dotted, the way a dictionary headword is set (see
    // src/dev/Showcase.tsx's own "ver·be·te"), not the plain word.
    expect(screen.getByText('ver·be·te')).toBeDefined();
    expect(screen.getByText('s.m.')).toBeDefined();
  });

  it('offers help, stats and theme controls, each with a Portuguese accessible name', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: /ajuda/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /estatísticas/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /tema/i })).toBeDefined();
  });

  it('cycles the theme through the document attribute when its button is pressed', () => {
    render(<Header />);
    const themeButton = screen.getByRole('button', { name: /tema/i });

    fireEvent.click(themeButton);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');

    fireEvent.click(themeButton);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');

    fireEvent.click(themeButton);
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false); // back to 'system'
  });
});
