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
  DICTIONARY_VERSION: 'test-fixture',
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
  // MatchProvider now restores from storage on mount/mode-switch: without
  // this, a later test in this file could "restore" a previous test's
  // leftover progress record instead of building the fresh match this
  // suite's mocked pickRandomAnswer sequence expects.
  localStorage.clear();
  vi.useFakeTimers();
  // Deterministic, non-zero gate: real enough to prove the race guard works,
  // short enough that the tests don't need to wait long.
  document.documentElement.style.setProperty('--reveal-duration', '100ms');
  document.documentElement.style.setProperty('--press-duration', '0ms');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
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

  it('does not gate submission on a newly active match while a different match is still revealing (Task 23: the reveal gate is per-match, not shared)', () => {
    const { result } = renderHook(() => useMatch(), { wrapper });

    // Solo/infinito accepts a guess and opens ITS OWN reveal gate.
    typeWord(result, 'TERRA');
    act(() => {
      result.current.submit();
    });
    expect(result.current.isRevealing).toBe(true);

    // Switch to a different match — dueto/infinito, never touched before —
    // before Solo's ~100ms gate has cleared.
    act(() => {
      result.current.selectMode('dueto', 'infinito');
    });
    // The newly active match has never revealed anything: its own gate must
    // read closed, not inherit Solo's still-open one.
    expect(result.current.isRevealing).toBe(false);

    // And it must actually be usable, not just report itself as open: a
    // valid guess on THIS match goes through immediately, with no need to
    // wait out Solo's timer.
    typeWord(result, 'CASAL');
    act(() => {
      result.current.submit();
    });
    expect(result.current.state.guesses).toEqual(['CASAL']);
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

  describe('announcement (Task 25: the aria-live sentence GuessAnnouncer.tsx reads aloud)', () => {
    // Self-contained regardless of what an earlier test in this file left
    // behind: `isValidGuess.mockClear()` in the outer `beforeEach` only
    // resets call history, never a `.mockImplementation` override — a real
    // gap this suite already had (an earlier test overrides it to reject
    // "CASAL" specifically and never restores it), just never exercised
    // before now because no test after it relied on the default again.
    beforeEach(() => {
      isValidGuess.mockImplementation((word: string) => word === 'CASAL' || word === 'TERRA' || word === 'PRATO');
    });

    it('is empty before any guess is accepted', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });
      expect(result.current.announcement).toBe('');
    });

    it('states every letter\'s own result after an accepted guess (Solo shape)', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });

      typeWord(result, 'TERRA'); // vs the canned answer "casal"
      act(() => {
        result.current.submit();
      });

      expect(result.current.announcement).toBe(
        'Linha 1: T ausente, E ausente, R ausente, R ausente, A na posição errada.',
      );
    });

    it('appends the win line when this guess finishes the match', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });

      typeWord(result, 'CASAL'); // the canned answer itself
      act(() => {
        result.current.submit();
      });

      expect(result.current.announcement).toBe(
        'Linha 1: C correta, A correta, S correta, A correta, L correta. Fim de jogo: você venceu!',
      );
    });

    it('appends the loss line on the final, still-wrong attempt', () => {
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
      expect(result.current.announcement.startsWith('Linha 6')).toBe(true);
      expect(result.current.announcement.endsWith('Fim de jogo: você não acertou dessa vez.')).toBe(true);
    });

    it('names the board this guess solved in a multi-board match, without repeating the guessed letters per board', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });

      act(() => {
        result.current.selectMode('dueto', 'infinito');
      });
      // Solo's own mount already consumed the first canned answer ("casal");
      // dueto draws the next two off the same cycling mock: "terra", "prato".
      expect(result.current.state.boards.map((b) => b.answer)).toEqual(['terra', 'prato']);

      typeWord(result, 'PRATO'); // solves board index 1 outright; board 0 ("terra") stays open
      act(() => {
        result.current.submit();
      });

      expect(result.current.announcement).toBe(
        'Linha 1, tentativa P R A T O. ' +
          'Tabuleiro 1: ausente, na posição errada, na posição errada, na posição errada, ausente. ' +
          'Tabuleiro 2, resolvido: correta, correta, correta, correta, correta.',
      );
    });
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
