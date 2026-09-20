import { describe, expect, it } from 'vitest';
import { renderShare } from '../share';
import { createMatch, reduce } from '../match';
import type { EngineDeps } from '../match';

const deps: EngineDeps = { isValidGuess: () => true, now: () => 0 };

function solved() {
  let state = createMatch({
    variant: 'solo', mode: 'diario', dayKey: '2026-09-20',
    answers: ['CASAL'], startedAt: 0,
  });
  for (const word of ['TERRA', 'CASAL']) {
    for (const letter of word) state = reduce(state, { type: 'TYPE', letter }, deps).state;
    state = reduce(state, { type: 'SUBMIT' }, deps).state;
  }
  return state;
}

describe('renderShare', () => {
  it('never leaks the answer', () => {
    const text = renderShare(solved(), { url: 'https://verbete.devduraes.com.br' });
    expect(text).not.toContain('CASAL');
    expect(text).not.toContain('TERRA');
  });

  it('includes the puzzle number, the score and the url', () => {
    const text = renderShare(solved(), { url: 'https://verbete.devduraes.com.br' });
    expect(text).toContain('2/6');
    expect(text).toContain('https://verbete.devduraes.com.br');
  });

  it('draws one emoji row per guess', () => {
    const text = renderShare(solved(), { url: 'https://verbete.devduraes.com.br' });
    const gridLines = text.split('\n').filter((line) => /\p{Extended_Pictographic}/u.test(line));
    expect(gridLines).toHaveLength(2);
  });
});
