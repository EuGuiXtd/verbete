import { describe, expect, it } from 'vitest';
import { boardRows, createMatch, reduce, remainingAttempts } from '../match';
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
    expect(state.draft).toBe('');
  });
});

describe('rejection', () => {
  it('leaves the state identical when the word is too short', () => {
    let state = make('solo', ['CASAL']);
    state = reduce(state, { type: 'TYPE', letter: 'C' }, deps).state;
    const before = state;
    const after = reduce(state, { type: 'SUBMIT' }, deps);
    expect(after.state).toBe(before);
    expect(after.effects).toEqual([{ type: 'REJECTED', reason: 'too_short', word: 'C' }]);
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
