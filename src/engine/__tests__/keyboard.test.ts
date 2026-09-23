import { describe, expect, it } from 'vitest';
import { KEY_ROWS, keyboardStates } from '../keyboard';
import { createMatch, reduce } from '../match';
import type { EngineDeps } from '../match';

const deps: EngineDeps = { isValidGuess: () => true, now: () => 0 };

function play(variant: 'solo' | 'dueto', answers: string[], words: string[]) {
  let state = createMatch({ variant, mode: 'infinito', dayKey: null, answers, startedAt: 0 });
  for (const word of words) {
    for (const letter of word) state = reduce(state, { type: 'TYPE', letter }, deps).state;
    state = reduce(state, { type: 'SUBMIT' }, deps).state;
  }
  return state;
}

describe('KEY_ROWS', () => {
  it('is QWERTY without accented keys or cedilla', () => {
    const letters = KEY_ROWS.flat().join('');
    expect(letters).toBe('QWERTYUIOPASDFGHJKLZXCVBNM');
  });
});

describe('keyboardStates', () => {
  it('reports one state per board', () => {
    const state = play('dueto', ['CASAL', 'TERRA'], ['CASAL']);
    expect(keyboardStates(state).get('C')).toHaveLength(2);
  });

  it('marks untouched letters unused', () => {
    const state = play('solo', ['CASAL'], ['TERRA']);
    expect(keyboardStates(state).get('B')).toEqual(['unused']);
  });

  it('keeps the best state a letter has reached', () => {
    // TERRA then CASAL: A is present in the first guess, correct in the second.
    const state = play('solo', ['CASAL'], ['TERRA', 'CASAL']);
    expect(keyboardStates(state).get('A')).toEqual(['correct']);
  });

  it('does not downgrade correct to absent', () => {
    const state = play('solo', ['CASAL'], ['CASAL']);
    expect(keyboardStates(state).get('C')).toEqual(['correct']);
  });
});
