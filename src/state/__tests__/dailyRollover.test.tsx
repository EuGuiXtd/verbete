import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MatchProvider } from '../MatchProvider';
import { useMatch } from '../useMatch';

// A small, deterministic stand-in for the real 1500-word daily pool — must
// be genuinely distinct entries: dailyAnswers's real (unmocked) dedup loop
// never terminates against a pool with fewer than seven distinct words.
const DAILY_POOL = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(4, '0')}`);

vi.mock('../../data/dictionary', () => ({
  isValidGuess: () => true,
  dailyPool: () => DAILY_POOL,
  pickRandomAnswer: () => 'casal',
}));

function wrapper({ children }: { children: ReactNode }) {
  return <MatchProvider>{children}</MatchProvider>;
}

// 2026-09-20T23:59:00 in Sao Paulo (UTC-3, no DST) = 2026-09-21T02:59:00Z —
// matches the fixture in useDailyRollover.test.ts.
const START = Date.UTC(2026, 8, 21, 2, 59, 0);

/** Jumps 5 minutes past midnight and fires the trigger useDailyRollover reacts to fastest. */
function crossMidnight() {
  act(() => {
    vi.setSystemTime(START + 5 * 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Moves the clock back to the fixture's starting instant and re-fires the trigger. */
function setClockBack() {
  act(() => {
    vi.setSystemTime(START);
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  // MatchProvider now restores from storage on mount/mode-switch: without
  // this, a later test could "restore" a previous test's leftover progress
  // record instead of the fresh match this suite expects — the two tests
  // that share the same START system time would otherwise see identical
  // dayKeys/hashes and genuinely satisfy the restore path.
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(START);
  document.documentElement.style.setProperty('--reveal-duration', '0ms');
  document.documentElement.style.setProperty('--press-duration', '0ms');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  document.documentElement.style.removeProperty('--reveal-duration');
  document.documentElement.style.removeProperty('--press-duration');
});

describe('daily mode day rollover (via MatchProvider + the real useDailyRollover)', () => {
  it('leaves an in-progress daily match untouched across a day rollover, and flags it pending', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.selectMode('solo', 'diario');
    });
    const dayOneAnswer = result.current.state.boards[0]?.answer;
    const dayOneDayKey = result.current.state.dayKey;
    expect(dayOneDayKey).not.toBeNull();

    act(() => {
      for (const letter of 'ABCDE') result.current.type(letter);
      result.current.submit();
    });
    expect(result.current.state.guesses).toEqual(['ABCDE']);
    expect(result.current.state.status).toBe('playing');

    crossMidnight();

    // The board is not destroyed: same day key, same answer, same guess —
    // exactly what "a daily match still in progress is not destroyed" means.
    expect(result.current.state.dayKey).toBe(dayOneDayKey);
    expect(result.current.state.boards[0]?.answer).toBe(dayOneAnswer);
    expect(result.current.state.guesses).toEqual(['ABCDE']);
    expect(result.current.dailyRolloverPending).toBe(true);

    act(() => {
      result.current.applyDailyRollover();
    });

    expect(result.current.state.dayKey).not.toBe(dayOneDayKey);
    expect(result.current.state.guesses).toHaveLength(0);
    expect(result.current.dailyRolloverPending).toBe(false);
  });

  it('rolls over an already-finished daily match on its own, no banner or button needed', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.selectMode('solo', 'diario');
    });
    const answer = result.current.state.boards[0]!.answer.toUpperCase();
    const dayOneDayKey = result.current.state.dayKey;

    act(() => {
      for (const letter of answer) result.current.type(letter);
      result.current.submit();
    });
    expect(result.current.state.status).toBe('won');

    crossMidnight();

    expect(result.current.state.dayKey).not.toBe(dayOneDayKey);
    expect(result.current.state.status).toBe('playing'); // a brand new match, not the finished one
    expect(result.current.dailyRolloverPending).toBe(false);
  });

  it('refuses to move the day backwards when the device clock is set back', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.selectMode('solo', 'diario');
    });
    act(() => {
      for (const letter of 'ABCDE') result.current.type(letter);
      result.current.submit();
    });
    const dayOneDayKey = result.current.state.dayKey;

    crossMidnight();
    expect(result.current.dailyRolloverPending).toBe(true);

    act(() => {
      result.current.applyDailyRollover();
    });
    const dayTwoDayKey = result.current.state.dayKey;
    expect(dayTwoDayKey).not.toBe(dayOneDayKey);

    setClockBack();

    // Setting the clock back to day one must not unlock day one's match
    // again, and must not disturb day two's, which is already current.
    expect(result.current.state.dayKey).toBe(dayTwoDayKey);
    expect(result.current.dailyRolloverPending).toBe(false);
  });

  it('keeps each variant x mode combination as its own match across a tab switch', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    // Solo infinito is the default landing match.
    act(() => {
      for (const letter of 'ABCDE') result.current.type(letter);
    });
    expect(result.current.state.draft).toBe('ABCDE');

    act(() => {
      result.current.selectMode('solo', 'diario');
    });
    expect(result.current.state.draft).toBe(''); // a different match entirely

    act(() => {
      result.current.selectMode('solo', 'infinito');
    });
    expect(result.current.state.draft).toBe('ABCDE'); // untouched by the detour
  });
});
