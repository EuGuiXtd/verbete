import { describe, expect, it } from 'vitest';
import { createMatch, reduce } from '../../engine/match';
import type { EngineDeps, MatchState } from '../../engine/match';
import { buildAnnouncement } from '../announce';

const deps: EngineDeps = { isValidGuess: () => true, now: () => 1_000 };

function submit(state: MatchState, word: string): { state: MatchState; solved: number[]; finished: 'won' | 'lost' | null } {
  let next = state;
  for (const letter of word) next = reduce(next, { type: 'TYPE', letter }, deps).state;
  const { state: result, effects } = reduce(next, { type: 'SUBMIT' }, deps);
  const solved = effects.filter((e) => e.type === 'BOARD_SOLVED').map((e) => e.boardIndex);
  const finishedEffect = effects.find((e) => e.type === 'FINISHED');
  const finished = finishedEffect?.type === 'FINISHED' ? finishedEffect.status : null;
  return { state: result, solved, finished };
}

describe('buildAnnouncement', () => {
  it('matches the brief\'s own worked Solo example exactly, letter by letter', () => {
    // "cobra" makes CASAL score exactly correct/present/absent/absent/absent
    // (see this test file's own derivation in the task report) — the same
    // pattern the brief's example, "C correta, A na posição errada, S
    // ausente, A ausente, L ausente", spells out.
    let state = createMatch({ variant: 'solo', mode: 'infinito', dayKey: null, answers: ['cobra'], startedAt: 0 });
    let round = submit(state, 'TERRA'); // row 1: a harmless wrong guess, just to land on "Linha 2"
    state = round.state;
    round = submit(state, 'CASAL'); // row 2: the guess the brief's example describes
    state = round.state;

    const text = buildAnnouncement({
      state,
      guessIndex: 1,
      solvedBoardIndexes: round.solved,
      finishedStatus: round.finished,
    });

    expect(text).toBe('Linha 2: C correta, A na posição errada, S ausente, A ausente, L ausente.');
  });

  it('appends the win announcement when this same guess finishes the match', () => {
    const state = createMatch({ variant: 'solo', mode: 'infinito', dayKey: null, answers: ['casal'], startedAt: 0 });
    const round = submit(state, 'CASAL'); // solves it outright

    const text = buildAnnouncement({
      state: round.state,
      guessIndex: 0,
      solvedBoardIndexes: round.solved,
      finishedStatus: round.finished,
    });

    expect(text).toBe(
      'Linha 1: C correta, A correta, S correta, A correta, L correta. Fim de jogo: você venceu!',
    );
  });

  it('appends the loss announcement on the final, still-wrong attempt', () => {
    let state = createMatch({ variant: 'solo', mode: 'infinito', dayKey: null, answers: ['fungo'], startedAt: 0 });
    const guesses = ['CASAL', 'TERRA', 'PRATO', 'CLARO', 'FINDO', 'HORAS']; // 6 attempts, none of them "fungo"
    let round = submit(state, guesses[0]!);
    state = round.state;
    for (const word of guesses.slice(1)) {
      round = submit(state, word);
      state = round.state;
    }

    expect(round.finished).toBe('lost');
    const text = buildAnnouncement({
      state,
      guessIndex: 5,
      solvedBoardIndexes: round.solved,
      finishedStatus: round.finished,
    });

    expect(text.endsWith('Fim de jogo: você não acertou dessa vez.')).toBe(true);
  });

  it('returns an empty string for an out-of-range guess index rather than throwing', () => {
    const state = createMatch({ variant: 'solo', mode: 'infinito', dayKey: null, answers: ['cobra'], startedAt: 0 });
    expect(buildAnnouncement({ state, guessIndex: 0, solvedBoardIndexes: [], finishedStatus: null })).toBe('');
  });

  describe('a multi-board match (Quarteto)', () => {
    it('spells the guess once, states each board\'s own results without repeating the letters, and names a board this guess solved', () => {
      // Four answers chosen so CASAL scores four distinct, hand-verified
      // patterns against them (see this test file's own derivation in the
      // task report) — including one, "casal" itself, that this exact
      // guess solves outright.
      const state = createMatch({
        variant: 'quarteto',
        mode: 'infinito',
        dayKey: null,
        answers: ['cobra', 'casal', 'salta', 'fungo'],
        startedAt: 0,
      });
      const round = submit(state, 'CASAL');

      expect(round.solved).toEqual([1]);
      expect(round.finished).toBeNull(); // three of four boards still open

      const text = buildAnnouncement({
        state: round.state,
        guessIndex: 0,
        solvedBoardIndexes: round.solved,
        finishedStatus: round.finished,
      });

      expect(text).toBe(
        'Linha 1, tentativa C A S A L. ' +
          'Tabuleiro 1: correta, na posição errada, ausente, ausente, ausente. ' +
          'Tabuleiro 2, resolvido: correta, correta, correta, correta, correta. ' +
          'Tabuleiro 3: ausente, correta, na posição errada, na posição errada, na posição errada. ' +
          'Tabuleiro 4: ausente, ausente, ausente, ausente, ausente.',
      );
    });

    it('never repeats a letter once per board — the noise the brief warns about', () => {
      const state = createMatch({
        variant: 'quarteto',
        mode: 'infinito',
        dayKey: null,
        answers: ['cobra', 'salta', 'fungo', 'morde'],
        startedAt: 0,
      });
      const round = submit(state, 'CASAL');

      const text = buildAnnouncement({
        state: round.state,
        guessIndex: 0,
        solvedBoardIndexes: round.solved,
        finishedStatus: round.finished,
      });

      // The guess is spelled out exactly once, up front...
      expect(text.match(/C A S A L/g)).toHaveLength(1);
      // ...and none of its five letters appear again as a bare token
      // anywhere after that (only inside the state words themselves, none
      // of which happen to be single letters).
      const afterSpelling = text.slice(text.indexOf('.') + 1);
      for (const letter of ['C', 'A', 'S', 'L']) {
        expect(afterSpelling).not.toMatch(new RegExp(`\\b${letter}\\b`));
      }
    });
  });
});
