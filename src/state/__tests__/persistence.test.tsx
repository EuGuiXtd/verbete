import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MatchProvider } from '../MatchProvider';
import { useMatch } from '../useMatch';
import { dayKeyOf } from '../../engine/clock';
import { loadHistory, loadPrefs, loadProgress, loadRecent, loadStats, savePrefs, saveProgress } from '../../storage/repository';
import { progressKey, recentKey } from '../../storage/keys';
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

/** Every exclusion set `createInfiniteMatch` has handed to `pickRandomAnswer`, in order. */
const excludeCalls: string[][] = [];

vi.mock('../../data/dictionary', () => ({
  isValidGuess: (word: string) => VALID_GUESSES.has(word),
  dailyPool: () => DAILY_POOL,
  DICTIONARY_VERSION: 'test-fixture',
  pickRandomAnswer: (exclude: ReadonlySet<string>) => {
    excludeCalls.push([...exclude]);
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
  excludeCalls.length = 0;
  localStorage.clear();
  // C4: MatchProvider now opens on the variant/mode last used, defaulting to
  // Solo/Diário on a genuinely first visit. This suite was written against
  // the old hardcoded Solo/Infinito, so it states that preference explicitly
  // rather than relying on a default that no longer exists.
  savePrefs({ ...loadPrefs(), lastVariant: 'solo', lastMode: 'infinito' });
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
  describe('the active variant and mode survive a reload (C4)', () => {
    it('comes back on the variant and mode the player last chose, not Solo/Infinito', () => {
      const first = renderHook(() => useMatch(), { wrapper });
      act(() => {
        first.result.current.selectMode('quarteto', 'diario');
      });
      expect(first.result.current.active).toEqual({ variant: 'quarteto', mode: 'diario' });
      cleanup();

      // A reload: same storage, brand new provider.
      const second = renderHook(() => useMatch(), { wrapper });
      expect(second.result.current.active).toEqual({ variant: 'quarteto', mode: 'diario' });
    });

    it('opens a genuinely first visit on the daily, not on a random infinite word', () => {
      localStorage.clear();
      const { result } = renderHook(() => useMatch(), { wrapper });
      expect(result.current.active).toEqual({ variant: 'solo', mode: 'diario' });
      // And nothing burned an infinite answer on the way in.
      expect(loadProgress('solo', 'infinito')).toBeNull();
    });

    it('falls back to the first-visit default when the stored preference is nonsense', () => {
      savePrefs({
        ...loadPrefs(),
        lastVariant: 'quinteto' as unknown as Variant,
        lastMode: 'semanal' as unknown as Mode,
      });
      const { result } = renderHook(() => useMatch(), { wrapper });
      expect(result.current.active).toEqual({ variant: 'solo', mode: 'diario' });
    });

    it('keeps the rest of the preferences record intact when it records the mode', () => {
      savePrefs({ ...loadPrefs(), theme: 'dark', hardMode: true });
      const { result } = renderHook(() => useMatch(), { wrapper });
      act(() => {
        result.current.selectMode('dueto', 'infinito');
      });
      expect(loadPrefs()).toMatchObject({
        theme: 'dark',
        hardMode: true,
        lastVariant: 'dueto',
        lastMode: 'infinito',
      });
    });
  });

  it("records infinite mode's answers as 'recent', the key the quota ladder clears (I7)", () => {
    // Nothing wrote `verbete:recent:*` before this, so `clearRecent` — the
    // middle rung of safeStorage's escalation ladder — freed zero bytes, and
    // infinite mode repeated words across sessions.
    expect(localStorage.getItem(recentKey('solo'))).toBeNull();
    renderHook(() => useMatch(), { wrapper });
    expect(loadRecent('solo')).toEqual(['casal']);
  });

  it('excludes every remembered word from the next infinite draw, across a reload', () => {
    // The stub walks `infiniteAnswers` in order and ignores the exclusion
    // set, so this asserts what `createInfiniteMatch` actually PASSES rather
    // than what a stub chose to do with it.
    renderHook(() => useMatch(), { wrapper });
    expect(loadRecent('solo')).toEqual(['casal']);
    cleanup();

    // A reload: the recent list is the only thing carrying "casal" forward,
    // because the fresh provider has no previous match in memory to exclude.
    localStorage.removeItem(progressKey('solo', 'infinito'));
    excludeCalls.length = 0;
    renderHook(() => useMatch(), { wrapper });
    expect(excludeCalls[0]).toContain('casal');
  });

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
    expect(loadProgress('solo', 'infinito')?.draft).toBe('     '); // only the mount-time immediate save has landed

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('     ');

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('CA   ');
  });

  it('flushes an un-debounced draft immediately when the tab is hidden', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.type('C');
      result.current.type('A');
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('     ');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(loadProgress('solo', 'infinito')?.draft).toBe('CA   ');
  });

  it('flushes the outgoing match immediately on selectMode, capturing an un-debounced draft', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.type('C');
      result.current.type('A');
    });
    expect(loadProgress('solo', 'infinito')?.draft).toBe('     ');

    act(() => {
      result.current.selectMode('dueto', 'infinito');
    });

    expect(loadProgress('solo', 'infinito')?.draft).toBe('CA   ');
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
    expect(result.current.state.draft).toBe('     ');
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

  /**
   * Feedback round 1, item 3 changed what a draft IS — from a string that
   * grows from the left to a fixed board of five houses with a sentinel for
   * the empty ones — and did it without bumping the storage schema version,
   * on the argument that padding an old left-packed draft on the right
   * reproduces it exactly. That argument is only worth anything if it is
   * tested: a player mid-guess when the new build shipped must find their
   * letters where they left them, in the same houses, with the insertion
   * point where continuing to type would have put it.
   */
  it('restores a draft written by the OLD left-packed format, in the same houses', () => {
    vi.useFakeTimers();
    const today = dayKeyOf(Date.now());
    const first = renderHook(() => useMatch(), { wrapper });
    act(() => {
      first.result.current.selectMode('solo', 'diario');
    });
    typeWord(first.result, 'W0');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const stored = loadProgress('solo', 'diario');
    expect(stored?.dayKey).toBe(today);
    first.unmount();

    // Rewrite that record exactly as a pre-item-3 build would have left it:
    // two letters, no padding, nothing else touched.
    saveProgress({ ...stored!, draft: 'W0' });

    const second = renderHook(() => useMatch(), { wrapper });
    act(() => {
      second.result.current.selectMode('solo', 'diario');
    });
    expect(second.result.current.state.draft).toBe('W0   ');
    // And the insertion point lands where the next letter would have gone.
    expect(second.result.current.state.cursor).toBe(2);
  });

  it('survives a draft that is corrupt rather than merely old', () => {
    vi.useFakeTimers();
    const first = renderHook(() => useMatch(), { wrapper });
    act(() => {
      first.result.current.selectMode('solo', 'diario');
    });
    typeWord(first.result, 'W0');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const stored = loadProgress('solo', 'diario');
    first.unmount();

    // `loadProgress` casts rather than validates (see MatchProvider's own
    // `hasReplayableAnswers` for the same reasoning about `answers`), so a
    // hand-edited record can carry anything at all here.
    saveProgress({ ...stored!, draft: 12345 as unknown as string });

    const second = renderHook(() => useMatch(), { wrapper });
    act(() => {
      second.result.current.selectMode('solo', 'diario');
    });
    expect(second.result.current.state.draft).toBe('     ');
    expect(second.result.current.state.cursor).toBe(0);
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
    // Task 22's HistoryModal reads this straight off the history entry — a
    // regression here would silently make every history row wordless.
    expect(loadHistory()[0]?.answers).toEqual(['casal']);
    // Task 24: this is the ENTIRE mechanism behind "a stale service
    // worker's word-list mismatch is detectable rather than silent" — a
    // finished match with no dictionaryVersion stamp is a version-mismatch
    // defence that silently stopped existing. Compares against the
    // MOCKED DICTIONARY_VERSION ('test-fixture', see this file's own
    // vi.mock above), not a hardcoded literal, so this fails if
    // MatchProvider.tsx's appendHistory call ever stops reading the real
    // export.
    expect(loadHistory()[0]?.dictionaryVersion).toBe('test-fixture');
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
      draft: '     ',
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
      expect(result.current.state.draft).toBe('     ');
    });
  });

  describe('a malformed `answers` field fails safe instead of crashing', () => {
    const base = {
      variant: 'solo' as const,
      mode: 'infinito' as const,
      dayKey: null,
      guesses: [],
      draft: '     ',
      answersHash: 'irrelevant-for-infinite-restore',
      startedAt: 1,
      finishedAt: null,
    };

    it.each([
      [
        'answers is a string whose length happens to match boardCount — has .length but no .map, the actual pre-fix crash',
        'a',
      ],
      ['answers holds a non-string element — reaches normalize() and throws', [123]],
      ['answers is the wrong length for this variant', ['casal', 'terra']],
    ])('%s', (_label, answers) => {
      saveRawProgress('solo', 'infinito', { ...base, answers });

      const { result } = renderHook(() => useMatch(), { wrapper });

      // Falls back to a fresh match rather than throwing during render.
      expect(result.current.state.status).toBe('playing');
      expect(result.current.state.guesses).toEqual([]);
      expect(result.current.state.boards).toHaveLength(1);
      expect(typeof result.current.state.boards[0]?.answer).toBe('string');
    });
  });
});
