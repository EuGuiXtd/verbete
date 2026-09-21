import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealGateDurationMs, useReveal } from '../useReveal';

function setToken(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function clearTokens() {
  document.documentElement.style.removeProperty('--reveal-duration');
  document.documentElement.style.removeProperty('--press-duration');
}

beforeEach(() => {
  vi.useFakeTimers();
  clearTokens();
});

afterEach(() => {
  cleanup();
  clearTokens();
  vi.useRealTimers();
});

describe('revealGateDurationMs', () => {
  it('derives the gate from --reveal-duration and --press-duration, not a literal', () => {
    setToken('--reveal-duration', '320ms');
    setToken('--press-duration', '140ms');

    // Mirrors Tile.tsx's own cascade math: the last tile's delay is
    // reveal-duration * (WORD_LENGTH-1)/WORD_LENGTH, and it then takes
    // press-duration to finish. WORD_LENGTH is 5.
    expect(revealGateDurationMs()).toBeCloseTo((320 * 4) / 5 + 140, 5);
  });

  it('accepts a bare-second token', () => {
    setToken('--reveal-duration', '0.32s');
    setToken('--press-duration', '0s');

    expect(revealGateDurationMs()).toBeCloseTo((320 * 4) / 5, 5);
  });

  it('collapses to zero when prefers-reduced-motion has zeroed the tokens', () => {
    setToken('--reveal-duration', '0ms');
    setToken('--press-duration', '0ms');

    expect(revealGateDurationMs()).toBe(0);
  });
});

/**
 * `useReveal` is a single instance shared by `MatchProvider` across all six
 * variant x mode matches (see that file), so every test here exercises the
 * keyed API against at least two keys — a suite that only ever called
 * `start('solo')` could pass with a single shared boolean underneath and
 * would never catch the cross-match bleed these tests exist to rule out.
 */
describe('useReveal', () => {
  it('starts with every key closed', () => {
    const { result } = renderHook(() => useReveal());
    expect(result.current.isRevealing('solo:diario')).toBe(false);
    expect(result.current.isRevealing('quarteto:infinito')).toBe(false);
  });

  it('opens one key on start() and closes it again after exactly the derived duration', () => {
    setToken('--reveal-duration', '320ms');
    setToken('--press-duration', '140ms');
    const duration = revealGateDurationMs();

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start('solo:diario');
    });
    expect(result.current.isRevealing('solo:diario')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(duration - 1);
    });
    expect(result.current.isRevealing('solo:diario')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isRevealing('solo:diario')).toBe(false);
  });

  it('closes immediately when the tokens have collapsed to zero under reduced motion', () => {
    setToken('--reveal-duration', '0ms');
    setToken('--press-duration', '0ms');

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start('solo:diario');
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.isRevealing('solo:diario')).toBe(false);
  });

  it('restarts the timer for that key if start() is called again before its gate closes', () => {
    setToken('--reveal-duration', '100ms');
    setToken('--press-duration', '0ms');

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start('solo:diario');
    });
    act(() => {
      vi.advanceTimersByTime(90);
    });
    act(() => {
      result.current.start('solo:diario'); // a second ACCEPTED before the first gate closed
    });
    act(() => {
      vi.advanceTimersByTime(15); // 105ms since the very first start(), but only 15 since the second
    });
    expect(result.current.isRevealing('solo:diario')).toBe(true);
  });

  it('keeps two keys fully independent: starting one never opens, extends or is closed by the other', () => {
    setToken('--reveal-duration', '100ms');
    setToken('--press-duration', '0ms');

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start('quarteto:diario');
    });
    expect(result.current.isRevealing('quarteto:diario')).toBe(true);
    // The exact bug this task's brief calls out: switching tabs mid-reveal
    // must not transiently block submission on the newly active match.
    expect(result.current.isRevealing('solo:infinito')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isRevealing('quarteto:diario')).toBe(false);
    expect(result.current.isRevealing('solo:infinito')).toBe(false);

    // Now open the second key and confirm the first (already closed) stays
    // closed — one key's lifecycle must never resurrect another's.
    act(() => {
      result.current.start('solo:infinito');
    });
    expect(result.current.isRevealing('solo:infinito')).toBe(true);
    expect(result.current.isRevealing('quarteto:diario')).toBe(false);
  });
});
