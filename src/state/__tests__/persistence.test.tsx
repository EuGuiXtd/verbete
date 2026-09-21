import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MatchProvider } from '../MatchProvider';
import { useMatch } from '../useMatch';
import { dayKeyOf } from '../../engine/clock';
import { loadHistory, loadProgress, loadStats, saveProgress } from '../../storage/repository';
import { progressKey } from '../../storage/keys';
import type { Mode, Variant } from '../../engine/types';

// A small, deterministic stand-in for the real 1500-word daily pool — must
// be genuinely distinct entries: dailyAnswers's real (unmocked) dedup loop
// never terminates against a pool with fewer than seven distinct words.
const DAILY_POOL = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(4, '0')}`);

let infiniteAnswerIndex = 0;
const infiniteAnswers = ['casal', 'terra', 'prato', 'findo', 'claro'];
const DEFAULT_VALID_GUESSES = ['CASAL', 'TERRA', 'PRATO', 'FINDO', 'CLARO'];
const VALID_GUESSES = new Set(DEFAULT_VALID_GUESSES);

/**
 * Writes a record straight to the raw storage envelope, bypassing
 * `saveProgress`'s `ProgressRecord` type entirely — this is what a genuinely
 * corrupt or hand-edited localStorage value looks like, not something
 * TypeScript would ever let a caller construct through the normal API.
 */
function saveRawProgress(variant: Variant, mode: Mode, data: Record<string, unknown>): void {
  localStorage.setItem(progressKey(variant, mode), JSON.stringify({ v: 1, data }));
}

vi.mock('../../data/dictionary', () => ({
  isValidGuess: (word: string) => VALID_GUESSES.has(word),
  dailyPool: () => DAILY_POOL,
  pickRandomAnswer: () => {
    const answer = infiniteAnswers[infiniteAnswerIndex % infiniteAnswers.length]!;
    infiniteAnswerIndex += 1;
    return answer;
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <MatchProvider>{children}</MatchProvider>;
}

function typeWord(result: { current: ReturnType<typeof useMatch> }, word: string) {
  for (const letter of word) {
    act(() => {
      result.current.type(letter);
    });
  }
}

beforeEach(() => {
  infiniteAnswerIndex = 0;
  localStorage.clear();
  document.documentElement.style.setProperty('--reveal-duration', '0ms');
  document.documentElement.style.setProperty('--press-duration', '0ms');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  document.documentElement.style.removeProperty('--reveal-duration');
  document.documentElement.style.removeProperty('--press-duration');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  // Restored, not just left cleared: 'does not un-finish...' below clears
  // this mid-test to simulate a shrunk dictionary.
  VALID_GUESSES.clear();
  for (const word of DEFAULT_VALID_GUESSES) VALID_GUESSES.add(word);
});

describe('MatchProvider persistence', () => {
  it('restores a committed guess across a remount, keeping the original secret answer', () => {
    const first = renderHook(() => useMatch(), { wrapper });
    typeWord(first.result, 'CASAL');
    act(() => {
      first.result.current.submit();
    });
    expect(first.result.current.state.guesses).toEqual(['CASAL']);
    const originalAnswer = first.result.current.state.boards[0]?.answer;
    first.unmount();

    const second = renderHook(() => useMatch(), { wrapper });
    expect(second.result.current.state.guesses).toEqual(['CASAL']);
    expect(second.result.current.state.boards[0]?.answer).toBe(originalAnswer);
    // The strong version of the same claim: pickRandomAnswer was called
    // exactly once, total, across both mounts. A restore that silently fell
    // back to building a fresh match would have called it a second time.
    expect(infiniteAnswerIndex).toBe(1);
  });

  it('debounces the draft: no save before 500ms, exactly one after', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.type('C');
      result.current.type('A');
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe(''); // only the mount-time immediate save has landed

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('');

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('CA');
  });

  it('flushes an un-debounced draft immediately when the tab is hidden', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.type('C');
      result.current.type('A');
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(loadProgress('solo', 'infinito')?.draft).toBe('CA');
  });

  it('flushes the outgoing match immediately on selectMode, capturing an un-debounced draft', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.type('C');
      result.current.type('A');
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('');

    act(() => {
      result.current.selectMode('dueto', 'infinito');
    });

    expect(loadProgress('solo', 'infinito')?.draft).toBe('CA');
  });

  it('discards a stale daily record whose answersHash no longer matches the word list', () => {
    const today = dayKeyOf(Date.now());
    saveProgress({
      variant: 'solo',
      mode: 'diario',
      dayKey: today,
      guesses: ['CASAL'],
      draft: 'XY',
      answers: null,
      answersHash: 'stale-hash-from-a-previous-deploy',
      startedAt: 1,
    });

    const { result } = renderHook(() => useMatch(), { wrapper });
    act(() => {
      result.current.selectMode('solo', 'diario');
    });

    expect(result.current.state.dayKey).toBe(today);
    expect(result.current.state.guesses).toEqual([]); // discarded, not scored against words the player never saw
    expect(result.current.state.draft).toBe('');
  });

  it('restores an in-progress daily record whose answersHash still matches', () => {
    vi.useFakeTimers();
    const today = dayKeyOf(Date.now());
    const first = renderHook(() => useMatch(), { wrapper });
    act(() => {
      first.result.current.selectMode('solo', 'diario');
    });
    typeWord(first.result, 'W0000'); // a genuine guess against the mocked daily pool's own vocabulary would need its own isValidGuess entry — irrelevant here, TYPE never validates
    act(() => {
      vi.advanceTimersByTime(500); // let the debounced draft save land before "reloading"
    });
    first.unmount();

    // Re-derive what MatchProvider itself would have stored: this test only
    // needs a record whose hash matches today's real derivation, so it goes
    // through the same saveProgress path a live guess would have used
    // rather than fabricating a hash by hand.
    const stored = loadProgress('solo', 'diario');
    expect(stored?.dayKey).toBe(today);

    const second = renderHook(() => useMatch(), { wrapper });
    act(() => {
      second.result.current.selectMode('solo', 'diario');
    });
    expect(second.result.current.state.draft).toBe('W0000');
  });

  it('restores a finished match, preserving the original finishedAt rather than the reload time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const first = renderHook(() => useMatch(), { wrapper });
    typeWord(first.result, 'CASAL');
    act(() => {
      first.result.current.submit();
    });
    expect(first.result.current.state.status).toBe('won');
    expect(first.result.current.state.finishedAt).toBe(1_000_000);
    first.unmount();

    vi.setSystemTime(2_000_000); // the "reload" happens later
    const second = renderHook(() => useMatch(), { wrapper });
    expect(second.result.current.state.status).toBe('won');
    expect(second.result.current.state.finishedAt).toBe(1_000_000); // not 2_000_000
  });

  it('records stats and history exactly once when a match finishes', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });
    typeWord(result, 'CASAL');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.status).toBe('won');
    expect(loadStats('solo', 'infinito').played).toBe(1);
    expect(loadStats('solo', 'infinito').wins).toBe(1);
    expect(loadHistory()).toHaveLength(1);
    expect(loadHistory()[0]).toMatchObject({ variant: 'solo', mode: 'infinito', won: true, attempts: 1 });
  });

  it('does not un-finish a won match on replay, even if the dictionary would now reject the winning guess', () => {
    const first = renderHook(() => useMatch(), { wrapper });
    typeWord(first.result, 'CASAL'); // the first mocked answer — wins on the first guess
    act(() => {
      first.result.current.submit();
    });
    expect(first.result.current.state.status).toBe('won');
    first.unmount();

    // Simulates a dictionary rebuild that would reject this exact guess
    // today. If replay re-validated history against isValidGuess (the bug
    // the reviewer traced beyond "drops a guess"): submit() would REJECT
    // "CASAL" instead of accepting it, the board would never be marked
    // solved, and this won match would come back from reload as "playing"
    // — missing its winning row entirely.
    VALID_GUESSES.clear();

    const second = renderHook(() => useMatch(), { wrapper });
    expect(second.result.current.state.status).toBe('won');
    expect(second.result.current.state.guesses).toEqual(['CASAL']);
    expect(second.result.current.state.boards[0]?.solvedAt).toBe(0);
  });

  describe('a malformed record fails safe instead of crashing', () => {
    const base = {
      variant: 'solo' as const,
      mode: 'infinito' as const,
      dayKey: null,
      draft: '',
      answers: ['casal'],
      answersHash: 'irrelevant-for-infinite-restore',
      startedAt: 1,
      finishedAt: null,
    };

    it.each([
      ['guesses is null — not iterable, the actual pre-fix crash', null],
      ['guesses is a number — not iterable, the actual pre-fix crash', 42],
      ['guesses holds a non-string element', [123]],
      ['a guess is the wrong length', ['CA']],
      ['a guess has lowercase letters', ['casal']],
    ])('%s', (_label, guesses) => {
      saveRawProgress('solo', 'infinito', { ...base, guesses });

      const { result } = renderHook(() => useMatch(), { wrapper });

      // Falls back to a fresh match rather than throwing during render —
      // this render succeeding at all is the assertion for the two
      // non-iterable cases, which would otherwise throw inside
      // replayMatch's `for...of` before any of these expectations ran.
      expect(result.current.state.status).toBe('playing');
      expect(result.current.state.guesses).toEqual([]);
      expect(result.current.state.draft).toBe('');
    });
  });
});
