import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MatchProvider } from '../MatchProvider';
import { useMatch } from '../useMatch';

// The dictionary is mocked so tests are deterministic: a real pickRandomAnswer
// draw and a real 1600-word guess table would make "assert this exact word"
// and "assert this exact rejection reason" both flaky or roundabout.
const answers = ['casal', 'terra', 'prato'];
let answerIndex = 0;
const isValidGuess = vi.fn((word: string) => word === 'CASAL' || word === 'TERRA' || word === 'PRATO');

vi.mock('../../data/dictionary', () => ({
  isValidGuess: (word: string) => isValidGuess(word),
  pickRandomAnswer: () => {
    const answer = answers[answerIndex % answers.length]!;
    answerIndex += 1;
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
  answerIndex = 0;
  isValidGuess.mockClear();
  vi.useFakeTimers();
  // Deterministic, non-zero gate: real enough to prove the race guard works,
  // short enough that the tests don't need to wait long.
  document.documentElement.style.setProperty('--reveal-duration', '100ms');
  document.documentElement.style.setProperty('--press-duration', '0ms');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.style.removeProperty('--reveal-duration');
  document.documentElement.style.removeProperty('--press-duration');
});

describe('useMatch', () => {
  it('starts a fresh Solo infinite match already in progress', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    expect(result.current.state.variant).toBe('solo');
    expect(result.current.state.mode).toBe('infinito');
    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.boards).toHaveLength(1);
    expect(result.current.state.boards[0]?.answer).toBe('casal');
  });

  it('rejects a too-short guess without spending an attempt, and toasts the reason in pt-BR', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'CA');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.guesses).toHaveLength(0);
    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['Faltam letras']);
  });

  it('rejects a word outside the dictionary, in pt-BR, without spending an attempt', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'ZBZBZ');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.guesses).toHaveLength(0);
    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['Essa palavra não está no dicionário']);
  });

  it('rejects a repeated guess, in pt-BR, without spending a second attempt', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'TERRA');
    act(() => {
      result.current.submit();
    });
    act(() => {
      vi.advanceTimersByTime(100); // clear the reveal gate from the first, accepted guess
    });

    typeWord(result, 'TERRA');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.guesses).toEqual(['TERRA']);
    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['Você já tentou essa']);
  });

  it('accepts a valid guess and opens the reveal gate', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'TERRA');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.guesses).toEqual(['TERRA']);
    expect(result.current.isRevealing).toBe(true);
  });

  it('gates submit while the reveal is in flight — a fast typist cannot submit into a half-revealed row', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'TERRA');
    act(() => {
      result.current.submit();
    });
    expect(result.current.isRevealing).toBe(true);

    // Typed and submitted a second, otherwise-valid guess before the gate closed.
    typeWord(result, 'PRATO');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.guesses).toEqual(['TERRA']); // the second submit was a no-op
    expect(result.current.state.draft).toBe('PRATO'); // typing itself is not gated, only submit

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isRevealing).toBe(false);

    act(() => {
      result.current.submit();
    });
    expect(result.current.state.guesses).toEqual(['TERRA', 'PRATO']); // now it goes through
  });

  it('wins the match on the correct guess and finishes', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'CASAL');
    act(() => {
      result.current.submit();
    });

    expect(result.current.state.status).toBe('won');
  });

  it('loses the match after maxAttempts wrong guesses', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });
    isValidGuess.mockImplementation((word: string) => word !== 'CASAL');

    const wrongGuesses = ['TERRA', 'PRATO', 'FALAR', 'MUNDO', 'LIVRO', 'NUVEM'];
    for (const guess of wrongGuesses) {
      typeWord(result, guess);
      act(() => {
        result.current.submit();
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    expect(result.current.state.status).toBe('lost');
    expect(result.current.state.guesses).toHaveLength(6);
  });

  it('newMatch starts a different match and clears toasts', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    typeWord(result, 'CA');
    act(() => {
      result.current.submit();
    }); // leaves a toast behind

    act(() => {
      result.current.newMatch();
    });

    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.guesses).toHaveLength(0);
    expect(result.current.state.boards[0]?.answer).toBe('terra'); // second canned answer
    expect(result.current.toasts).toHaveLength(0);
  });

  it('composes multiple dispatches issued in the same synchronous burst — a fast typist whose keystrokes all land before React re-renders', () => {
    // Regression test: this reproduces a real bug found by hand in the
    // browser, not a hypothetical. `dispatch` used to read a `stateRef`
    // that was only reassigned inside the component's render body — so two
    // `type()` calls made back to back, with no render in between (exactly
    // what happens when several native keydown events are processed in the
    // same browser task, which is routine for fast typing or key-repeat),
    // both computed `reduce` from the SAME stale snapshot. The second call
    // silently discarded the first: typing "C" then "A" produced a draft of
    // "A", not "CA". A test that wraps every keystroke in its own `act()`
    // (see `typeWord` above) cannot see this, because `act()` flushes a
    // render between calls and hides exactly the gap this test forces open.
    const { result } = renderHook(() => useMatch(), { wrapper });

    act(() => {
      result.current.type('C');
      result.current.type('A');
      result.current.type('S');
      result.current.type('A');
      result.current.type('L');
    });

    expect(result.current.state.draft).toBe('CASAL');
  });

  it('passes through the engine identity contract: a rejection returns the same state object, not a copy', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });
    typeWord(result, 'CA');
    const beforeSubmit = result.current.state;

    act(() => {
      result.current.submit();
    });

    expect(result.current.state).toBe(beforeSubmit);
  });
});
