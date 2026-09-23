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

// Real answers are stored lowercase, with diacritics ("então", "dália") — not
// as the uppercase ASCII stand-in `solved()` uses. A case-sensitive leak
// check against that stand-in cannot catch a leak of the real stored casing,
// so this fixture uses the genuine storage shape.
function solvedLowercaseAccented() {
  let state = createMatch({
    variant: 'solo', mode: 'diario', dayKey: '2026-09-20',
    answers: ['lição'], startedAt: 0,
  });
  for (const word of ['TERRA', 'LICAO']) {
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

  // The fixture above spells its answer as uppercase ASCII, but real answers
  // are stored lowercase and accented (e.g. "então", "dália"). A leak of the
  // real stored casing — e.g. a future debug line reading `board.answer` —
  // would emit that lowercase accented form, which a case-sensitive check
  // against the uppercase stand-in above cannot catch. This fixture uses the
  // genuine storage shape and checks both the accented display form and its
  // normalized (uppercase, diacritic-stripped) comparison form.
  it('never leaks a lowercase accented answer, in either its display or normalized form', () => {
    const text = renderShare(solvedLowercaseAccented(), { url: 'https://verbete.devduraes.com.br' });
    expect(text).not.toContain('lição');
    expect(text).not.toContain('LICAO');
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
