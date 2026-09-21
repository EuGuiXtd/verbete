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

describe('useReveal', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useReveal());
    expect(result.current.isRevealing).toBe(false);
  });

  it('opens the gate on start() and closes it again after exactly the derived duration', () => {
    setToken('--reveal-duration', '320ms');
    setToken('--press-duration', '140ms');
    const duration = revealGateDurationMs();

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start();
    });
    expect(result.current.isRevealing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(duration - 1);
    });
    expect(result.current.isRevealing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isRevealing).toBe(false);
  });

  it('closes immediately when the tokens have collapsed to zero under reduced motion', () => {
    setToken('--reveal-duration', '0ms');
    setToken('--press-duration', '0ms');

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.isRevealing).toBe(false);
  });

  it('restarts the timer if start() is called again before the gate closes', () => {
    setToken('--reveal-duration', '100ms');
    setToken('--press-duration', '0ms');

    const { result } = renderHook(() => useReveal());
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(90);
    });
    act(() => {
      result.current.start(); // a second ACCEPTED before the first gate closed
    });
    act(() => {
      vi.advanceTimersByTime(15); // 105ms since the very first start(), but only 15 since the second
    });
    expect(result.current.isRevealing).toBe(true);
  });
});
