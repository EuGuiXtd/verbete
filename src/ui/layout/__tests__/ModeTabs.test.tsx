import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MatchProvider } from '../../../state/MatchProvider';
import { ModeTabs } from '../ModeTabs';
import { loadPrefs, savePrefs } from '../../../storage/repository';

// A small, deterministic stand-in for the real 1500-word daily pool — must
// be distinct entries, not just distinct labels: dailyAnswers's real
// (unmocked) dedup loop never terminates against a pool with fewer than
// seven distinct words.
const DAILY_POOL = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(4, '0')}`);
let infiniteAnswerIndex = 0;
const infiniteAnswers = ['casal', 'terra', 'prato', 'findo', 'claro', 'muito', 'nunca'];

vi.mock('../../../data/dictionary', () => ({
  isValidGuess: () => true,
  dailyPool: () => DAILY_POOL,
  DICTIONARY_VERSION: 'test-fixture',
  pickRandomAnswer: () => {
    const answer = infiniteAnswers[infiniteAnswerIndex % infiniteAnswers.length]!;
    infiniteAnswerIndex += 1;
    return answer;
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <MatchProvider>{children}</MatchProvider>;
}

function pressed(name: string): string | null {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed');
}

beforeEach(() => {
  infiniteAnswerIndex = 0;
  // MatchProvider now restores from storage on mount/mode-switch: without
  // this, a later test could "restore" a previous test's leftover progress
  // record instead of the fresh match built from this suite's mocked
  // pickRandomAnswer sequence.
  localStorage.clear();
  // C4: MatchProvider now opens on the variant/mode last used, defaulting to
  // Solo/Diário on a genuinely first visit. This suite was written against
  // the old hardcoded Solo/Infinito, so it states that preference explicitly
  // rather than relying on a default that no longer exists.
  savePrefs({ ...loadPrefs(), lastVariant: 'solo', lastMode: 'infinito' });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ModeTabs', () => {
  it('lands on Solo/Infinito with a "nova palavra" control, no puzzle number', () => {
    render(<ModeTabs />, { wrapper });

    expect(pressed('Solo')).toBe('true');
    expect(pressed('Infinito')).toBe('true');
    expect(screen.getByRole('button', { name: /nova palavra/i })).toBeDefined();
    expect(screen.queryByText(/^#\d+$/)).toBeNull();
  });

  it('shows the puzzle number, not a "nova palavra" control, once switched to Diário', () => {
    render(<ModeTabs />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Diário' }));

    expect(pressed('Diário')).toBe('true');
    expect(screen.getByText(/^#\d+$/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /nova palavra/i })).toBeNull();
  });

  it('switches variant tabs independently of mode', () => {
    render(<ModeTabs />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Dueto' }));

    expect(pressed('Dueto')).toBe('true');
    expect(pressed('Solo')).toBe('false');
    // Mode selection survives the variant switch: still Infinito.
    expect(pressed('Infinito')).toBe('true');
  });

  it('every accessible name is in Portuguese', () => {
    render(<ModeTabs />, { wrapper });
    expect(screen.getByRole('group', { name: 'Variante' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Modo' })).toBeDefined();
  });
});
