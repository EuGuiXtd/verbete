import { describe, expect, it } from 'vitest';
import { boardRows, createMatch, emptyDraft, reduce, remainingAttempts } from '../match';
import { VARIANTS, VARIANT_ORDER } from '../constants';
import type { EngineDeps, MatchState } from '../match';
import type { Variant } from '../types';

const deps: EngineDeps = { isValidGuess: () => true, now: () => 1_000 };
const strictDeps: EngineDeps = {
  isValidGuess: (w) => ['CASAL', 'TERRA', 'ERRAR', 'LICAO', 'PRAIA'].includes(w),
  now: () => 1_000,
};

function make(variant: Variant, answers: string[]): MatchState {
  return createMatch({ variant, mode: 'infinito', dayKey: null, answers, startedAt: 0 });
}

function type(state: MatchState, word: string, d = deps): MatchState {
  let next = state;
  for (const letter of word) next = reduce(next, { type: 'TYPE', letter }, d).state;
  return reduce(next, { type: 'SUBMIT' }, d).state;
}

describe.each(VARIANT_ORDER)('%s', (variant) => {
  const answers = ['CASAL', 'TERRA', 'PRAIA', 'LICAO'].slice(0, VARIANTS[variant].boards);

  it('creates one board per variant with the configured attempts', () => {
    const state = make(variant, answers);
    expect(state.boards).toHaveLength(VARIANTS[variant].boards);
    expect(remainingAttempts(state)).toBe(VARIANTS[variant].attempts);
  });

  it('feeds one guess to every board', () => {
    const state = type(make(variant, answers), 'CASAL');
    expect(state.guesses).toEqual(['CASAL']);
    for (let i = 0; i < state.boards.length; i += 1) {
      expect(boardRows(state, i)).toHaveLength(1);
    }
  });

  it('spends an attempt per accepted guess', () => {
    const state = type(make(variant, answers), 'TERRA');
    expect(remainingAttempts(state)).toBe(VARIANTS[variant].attempts - 1);
  });
});

describe('input handling', () => {
  it('ignores a sixth letter', () => {
    let state = make('solo', ['CASAL']);
    for (const letter of 'CASALX') {
      state = reduce(state, { type: 'TYPE', letter }, deps).state;
    }
    expect(state.draft).toBe('CASAL');
  });

  it('removes the last letter on backspace', () => {
    let state = make('solo', ['CASAL']);
    state = reduce(state, { type: 'TYPE', letter: 'C' }, deps).state;
    state = reduce(state, { type: 'BACKSPACE' }, deps).state;
    // Five empty houses, not an empty string: feedback round 1, item 3 made
    // a draft a fixed board rather than a string that grows from the left.
    expect(state.draft).toBe(emptyDraft());
    expect(state.cursor).toBe(0);
  });
});

describe('rejection', () => {
  it('leaves the state identical when the word is too short', () => {
    let state = make('solo', ['CASAL']);
    state = reduce(state, { type: 'TYPE', letter: 'C' }, deps).state;
    const before = state;
    const after = reduce(state, { type: 'SUBMIT' }, deps);
    expect(after.state).toBe(before);
    expect(after.effects).toEqual([{ type: 'REJECTED', reason: 'too_short', word: 'C    ' }]);
  });

  it('leaves the state identical when the word is not a word', () => {
    let state = make('solo', ['CASAL']);
    for (const letter of 'XBZWK') {
      state = reduce(state, { type: 'TYPE', letter }, strictDeps).state;
    }
    const before = state;
    const after = reduce(state, { type: 'SUBMIT' }, strictDeps);
    expect(after.state).toBe(before);
    expect(after.effects[0]).toMatchObject({ reason: 'not_in_dictionary' });
    expect(remainingAttempts(after.state)).toBe(6);
  });

  it('rejects a repeated guess', () => {
    const state = type(make('solo', ['TERRA']), 'CASAL', strictDeps);
    const again = reduce(
      [...'CASAL'].reduce((s, l) => reduce(s, { type: 'TYPE', letter: l }, strictDeps).state, state),
      { type: 'SUBMIT' },
      strictDeps,
    );
    expect(again.effects[0]).toMatchObject({ reason: 'already_guessed' });
  });
});

describe('finishing', () => {
  it('wins when the single board is solved', () => {
    const state = type(make('solo', ['CASAL']), 'CASAL');
    expect(state.status).toBe('won');
  });

  it('loses when attempts run out with a board open', () => {
    // Six distinct five-letter words, all accepted by deps.isValidGuess and
    // none the answer, so every one of them consumes an attempt. Repeating a
    // single word (e.g. TERRA) would trip the already-guessed guard after
    // the first submission and never actually run the match out of attempts.
    let state = make('solo', ['CASAL']);
    for (const word of ['TERRA', 'BRAVO', 'FONTE', 'LIVRO', 'PORTA', 'NUVEM']) {
      state = type(state, word);
    }
    expect(state.status).toBe('lost');
  });

  it('ignores submissions after the match ends', () => {
    const won = type(make('solo', ['CASAL']), 'CASAL');
    const after = reduce(won, { type: 'SUBMIT' }, deps);
    expect(after.state).toBe(won);
  });
});

describe('quarteto freezing', () => {
  const answers = ['CASAL', 'TERRA', 'PRAIA', 'LICAO'];

  it('freezes a solved board while the others keep taking guesses', () => {
    let state = make('quarteto', answers);
    state = type(state, 'CASAL');
    expect(state.boards[0]!.solvedAt).toBe(0);
    expect(state.status).toBe('playing');

    state = type(state, 'TERRA');
    expect(boardRows(state, 0)).toHaveLength(1);
    expect(boardRows(state, 1)).toHaveLength(2);
  });

  it('wins only when every board is solved', () => {
    let state = make('quarteto', answers);
    for (const word of answers) state = type(state, word);
    expect(state.status).toBe('won');
  });
});

/**
 * Feedback round 1, item 3: "tinha que dar para selecionar em qual bloco da
 * palavra você quer inserir a letra, em vez de digitar sempre da esquerda
 * para a direita."
 *
 * Two halves are worth proving, and the SECOND one is the one that can
 * quietly break. The first is that the new thing works. The second is that
 * the old thing is untouched — a player who never discovers this feature
 * must get byte-identical behaviour from every keystroke they already make,
 * which is not something the new code gets for free: the draft's whole
 * representation changed underneath it.
 */
describe('insertion point (feedback round 1, item 3)', () => {
  function typeOnly(state: MatchState, word: string): MatchState {
    let next = state;
    for (const letter of word) next = reduce(next, { type: 'TYPE', letter }, deps).state;
    return next;
  }

  describe('left-to-right typing is unchanged', () => {
    it('fills the houses in order and parks past the end', () => {
      let state = make('solo', ['CASAL']);
      const seen: { draft: string; cursor: number }[] = [];
      for (const letter of 'PRATO') {
        state = reduce(state, { type: 'TYPE', letter }, deps).state;
        seen.push({ draft: state.draft, cursor: state.cursor });
      }
      expect(seen).toEqual([
        { draft: 'P    ', cursor: 1 },
        { draft: 'PR   ', cursor: 2 },
        { draft: 'PRA  ', cursor: 3 },
        { draft: 'PRAT ', cursor: 4 },
        { draft: 'PRATO', cursor: 5 },
      ]);
    });

    it('still ignores a sixth letter rather than overwriting the fifth', () => {
      const full = typeOnly(make('solo', ['CASAL']), 'PRATO');
      const after = reduce(full, { type: 'TYPE', letter: 'Z' }, deps);
      // Identity, not deep equality: a no-op must return the same object,
      // the invariant every other rejection in this engine already holds.
      expect(after.state).toBe(full);
      expect(after.effects).toEqual([]);
    });

    it('still deletes from the right on backspace, one house at a time', () => {
      let state = typeOnly(make('solo', ['CASAL']), 'PRATO');
      state = reduce(state, { type: 'BACKSPACE' }, deps).state;
      expect(state).toMatchObject({ draft: 'PRAT ', cursor: 4 });
      state = reduce(state, { type: 'BACKSPACE' }, deps).state;
      expect(state).toMatchObject({ draft: 'PRA  ', cursor: 3 });
    });

    it('still does nothing on backspace with an untouched draft', () => {
      const empty = make('solo', ['CASAL']);
      expect(reduce(empty, { type: 'BACKSPACE' }, deps).state).toBe(empty);
    });
  });

  describe('typing out of order', () => {
    it('writes where the cursor was put, then carries on to the next empty house', () => {
      let state = make('solo', ['CASAL']);
      state = reduce(state, { type: 'MOVE_CURSOR', index: 2 }, deps).state;
      state = reduce(state, { type: 'TYPE', letter: 'S' }, deps).state;
      expect(state).toMatchObject({ draft: '  S  ', cursor: 3 });
    });

    it('wraps back to the holes it left behind rather than stranding the player at the end', () => {
      let state = make('solo', ['CASAL']);
      state = reduce(state, { type: 'MOVE_CURSOR', index: 3 }, deps).state;
      state = reduce(state, { type: 'TYPE', letter: 'A' }, deps).state;
      expect(state).toMatchObject({ draft: '   A ', cursor: 4 });
      state = reduce(state, { type: 'TYPE', letter: 'L' }, deps).state;
      // House 4 was the last empty one to the right; the next letter has to
      // go somewhere, and the only somewheres left are behind it.
      expect(state).toMatchObject({ draft: '   AL', cursor: 0 });
    });

    it('overwrites the house the player pointed at in a full word, and steps right', () => {
      let state = typeOnly(make('solo', ['CASAL']), 'PRATO');
      state = reduce(state, { type: 'MOVE_CURSOR', index: 1 }, deps).state;
      state = reduce(state, { type: 'TYPE', letter: 'L' }, deps).state;
      expect(state).toMatchObject({ draft: 'PLATO', cursor: 2 });
    });

    it('backspaces the house under the cursor, not the one before it', () => {
      let state = typeOnly(make('solo', ['CASAL']), 'PRATO');
      state = reduce(state, { type: 'MOVE_CURSOR', index: 1 }, deps).state;
      state = reduce(state, { type: 'BACKSPACE' }, deps).state;
      expect(state).toMatchObject({ draft: 'P ATO', cursor: 1 });
    });
  });

  describe('MOVE_CURSOR itself', () => {
    it('announces the move, and only when it actually moves', () => {
      const state = make('solo', ['CASAL']);
      const moved = reduce(state, { type: 'MOVE_CURSOR', index: 3 }, deps);
      expect(moved.effects).toEqual([{ type: 'CURSOR_MOVED', index: 3 }]);
      const again = reduce(moved.state, { type: 'MOVE_CURSOR', index: 3 }, deps);
      expect(again.state).toBe(moved.state);
      expect(again.effects).toEqual([]);
    });

    it('never announces the automatic advance a keystroke performs', () => {
      const state = make('solo', ['CASAL']);
      const typed = reduce(state, { type: 'TYPE', letter: 'P' }, deps);
      expect(typed.state.cursor).toBe(1);
      expect(typed.effects).toEqual([]);
      const erased = reduce(typed.state, { type: 'BACKSPACE' }, deps);
      expect(erased.effects).toEqual([]);
    });

    it('clamps to the nearest real house instead of refusing', () => {
      const state = make('solo', ['CASAL']);
      expect(reduce(state, { type: 'MOVE_CURSOR', index: -4 }, deps).state.cursor).toBe(0);
      expect(reduce(state, { type: 'MOVE_CURSOR', index: 99 }, deps).state.cursor).toBe(4);
    });

    it('cannot be used to reach the past-the-end position a full word parks in', () => {
      const full = typeOnly(make('solo', ['CASAL']), 'PRATO');
      expect(full.cursor).toBe(5);
      const moved = reduce(full, { type: 'MOVE_CURSOR', index: 5 }, deps).state;
      expect(moved.cursor).toBe(4);
    });
  });

  describe('submitting a draft with holes', () => {
    it('is rejected as too_short, exactly like a short one, and costs no attempt', () => {
      let state = make('solo', ['CASAL']);
      state = reduce(state, { type: 'MOVE_CURSOR', index: 4 }, deps).state;
      state = reduce(state, { type: 'TYPE', letter: 'L' }, deps).state;
      // "    L": every house but the last is empty, so the draft is five
      // characters long and still nowhere near a word.
      const after = reduce(state, { type: 'SUBMIT' }, deps);
      expect(after.state).toBe(state);
      expect(after.effects).toEqual([{ type: 'REJECTED', reason: 'too_short', word: '    L' }]);
    });

    it('accepts a word filled out of order, and leaves a clean board behind', () => {
      let state = make('solo', ['CASAL']);
      // C A S A L, entered as L, then the rest wrapping round from the front.
      state = reduce(state, { type: 'MOVE_CURSOR', index: 4 }, deps).state;
      for (const letter of 'LCASA') state = reduce(state, { type: 'TYPE', letter }, deps).state;
      expect(state.draft).toBe('CASAL');
      const after = reduce(state, { type: 'SUBMIT' }, deps);
      expect(after.state.guesses).toEqual(['CASAL']);
      expect(after.state.draft).toBe(emptyDraft());
      expect(after.state.cursor).toBe(0);
      expect(after.state.boards[0]!.solvedAt).toBe(0);
    });
  });
});
