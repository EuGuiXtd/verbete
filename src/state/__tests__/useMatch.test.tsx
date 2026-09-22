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
const DEFAULT_IS_VALID_GUESS = (word: string) => word === 'CASAL' || word === 'TERRA' || word === 'PRATO';
const isValidGuess = vi.fn(DEFAULT_IS_VALID_GUESS);

vi.mock('../../data/dictionary', () => ({
  isValidGuess: (word: string) => isValidGuess(word),
  pickRandomAnswer: () => {
    const answer = answers[answerIndex % answers.length]!;
    answerIndex += 1;
    return answer;
  },
  DICTIONARY_VERSION: 'test-fixture',
}));

/**
 * Task 25 fix round 1 (F2): MatchProvider now loads each finished match's
 * dictionary definition (`loadDefinition`, src/data/definitions.ts) to
 * append to the same live-region announcement. Mocked here for the same
 * reason the dictionary above is: a real ~35KB JSON import and whatever
 * gloss the real generated data happens to carry for "casal" would make
 * this file's exact-string assertions depend on content this suite does
 * not own. `parseDefinition` is kept real (via `importOriginal`) — it is
 * pure string-splitting logic, not data, and `src/state/announce.ts` needs
 * the genuine implementation to turn `DEFINITIONS`'s raw strings below into
 * the same shape production code produces.
 */
const DEFINITIONS: Record<string, string | null> = {
  casal: 's.m. par de pessoas que vivem juntas',
  terra: null,
  prato: null,
};
vi.mock('../../data/definitions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/definitions')>();
  return {
    ...actual,
    loadDefinition: (word: string) => Promise.resolve(DEFINITIONS[word] ?? null),
  };
});

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
  // Task 25 fix round 1 (F7): `.mockClear()` only resets call history, never
  // a `.mockImplementation(...)` override an earlier test set — a real gap
  // this suite already had, first exposed when the `announcement` tests
  // below needed the default implementation restored after
  // `'loses the match after maxAttempts wrong guesses'` overrides it and
  // never puts it back. Restoring the default here, once, for every test,
  // means any test that needs a different one still sets its own
  // afterwards (as that loss test itself does) — this is not in tension
  // with that, it just makes "the default" an actual guarantee rather than
  // an accident of test order.
  isValidGuess.mockImplementation(DEFAULT_IS_VALID_GUESS);
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
    it('is empty before any guess is accepted', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });
      expect(result.current.announcement).toBe('');
    });

    it('clears on newMatch, so stale text cannot survive into a freshly started match (Task 25 fix round 1, F8)', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });

      typeWord(result, 'TERRA');
      act(() => {
        result.current.submit();
      });
      expect(result.current.announcement).not.toBe('');

      act(() => {
        result.current.newMatch();
      });

      expect(result.current.announcement).toBe('');
    });

    it('clears on selectMode too, for the same reason', () => {
      const { result } = renderHook(() => useMatch(), { wrapper });

      typeWord(result, 'TERRA');
      act(() => {
        result.current.submit();
      });
      expect(result.current.announcement).not.toBe('');

      act(() => {
        result.current.selectMode('dueto', 'infinito');
      });

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

    it('appends the loss line, and the answer, on the final, still-wrong attempt', () => {
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
      // Task 25 fix round 1 (F2): a lost match now names the word — a
      // sighted player still sees it in ResultModal's own reveal; without
      // this a screen-reader user heard only "não foi dessa vez" and never
      // learned it at all.
      expect(result.current.announcement.endsWith('Fim de jogo: você não acertou dessa vez. A palavra era casal.')).toBe(
        true,
      );
    });

    it('sets each board\'s dictionary definition, in its OWN region, once it resolves after the match finishes', async () => {
      const { result } = renderHook(() => useMatch(), { wrapper });

      typeWord(result, 'CASAL'); // the canned answer itself
      act(() => {
        result.current.submit();
      });
      // Task 25 fix round 2 (R2): the definition arrives strictly AFTER the
      // row/outcome sentence, and — the actual point of this test — the two
      // never share one string. `announcement` must already be settled here,
      // before the async `loadDefinition` chain has had any chance to run.
      expect(result.current.announcement).toBe(
        'Linha 1: C correta, A correta, S correta, A correta, L correta. Fim de jogo: você venceu!',
      );
      expect(result.current.definitionAnnouncement).toBe('');

      await act(async () => {
        // `loadDefinition` (mocked above) resolves as a native microtask,
        // unaffected by this file's fake timers (those only replace
        // macrotask timers like setTimeout) — a few ticks drains the
        // `Promise.all(...).then(...)` chain MatchProvider starts once the
        // FINISHED effect is processed.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.definitionAnnouncement).toBe('Definição de casal: par de pessoas que vivem juntas.');
      // Unchanged — the definition never gets folded into it.
      expect(result.current.announcement).toBe(
        'Linha 1: C correta, A correta, S correta, A correta, L correta. Fim de jogo: você venceu!',
      );
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

      // Task 25 fix round 1 (F1, Critical): a SECOND guess must not
      // fabricate fresh results for board 2, which already froze on guess
      // 1 — a real bug a review round caught live, since the first version
      // of this code re-scored the new guess against every board's answer
      // directly, with no reference to `solvedAt`. Only board 1 (still
      // playing) appears, and the lead-in names exactly which board that is.
      act(() => {
        vi.advanceTimersByTime(100); // clear the reveal gate from guess 1
      });
      typeWord(result, 'CASAL'); // any further accepted guess; never board 1's own answer ("terra")
      act(() => {
        result.current.submit();
      });

      // Task 25 fix round 2 (R3): singular agreement — one board left in
      // play reads "Tabuleiro em jogo: 1.", not the plural noun over a
      // single item.
      expect(result.current.announcement).toBe(
        'Linha 2, tentativa C A S A L. Tabuleiro em jogo: 1. ' +
          'Tabuleiro 1: ausente, na posição errada, ausente, ausente, ausente.',
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
