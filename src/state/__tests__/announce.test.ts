import { describe, expect, it } from 'vitest';
import { createMatch, reduce } from '../../engine/match';
import type { EngineDeps, MatchState } from '../../engine/match';
import { buildAnnouncement, buildDefinitionsAnnouncement } from '../announce';

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

    // Task 25 fix round 1 (F2): a lost match also names the still-unsolved
    // word — the one thing a sighted player still gets from ResultModal's
    // own reveal that a screen-reader user otherwise never learns at all.
    expect(text.endsWith('Fim de jogo: você não acertou dessa vez. A palavra era fungo.')).toBe(true);
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

    it('drops a board frozen by an earlier guess from a later announcement, naming which boards are still in play (Task 25 fix round 1, F1)', () => {
      // The Critical bug this regresses: the first version of buildMultiBody
      // re-scored the new guess against every board's `answerNorm` directly,
      // with no reference to `solvedAt` — so a board already frozen kept
      // getting fresh, fabricated per-letter results on every later guess,
      // confirmed live in a real Quarteto run (guess 2 announced results
      // for a board that solved on guess 1 and never played again).
      const state = createMatch({
        variant: 'quarteto',
        mode: 'infinito',
        dayKey: null,
        answers: ['cobra', 'casal', 'salta', 'fungo'],
        startedAt: 0,
      });
      const first = submit(state, 'CASAL'); // solves board index 1 ("casal") outright
      expect(first.solved).toEqual([1]);

      const second = submit(first.state, 'TERRA');
      expect(second.solved).toEqual([]); // no board newly solved this guess

      const text = buildAnnouncement({
        state: second.state,
        guessIndex: 1,
        solvedBoardIndexes: second.solved,
        finishedStatus: second.finished,
      });

      expect(text).toBe(
        'Linha 2, tentativa T E R R A. Tabuleiros em jogo: 1, 3 e 4. ' +
          'Tabuleiro 1: ausente, ausente, ausente, correta, correta. ' +
          'Tabuleiro 3: na posição errada, ausente, ausente, ausente, correta. ' +
          'Tabuleiro 4: ausente, ausente, ausente, ausente, ausente.',
      );
      // Board 2 ("casal", frozen since guess 1) must not appear at all —
      // not with stale results, not with fabricated new ones.
      expect(text).not.toContain('Tabuleiro 2');
    });

    it('agrees in number when exactly one board is left in play (Task 25 fix round 2, R3)', () => {
      const state = createMatch({
        variant: 'quarteto',
        mode: 'infinito',
        dayKey: null,
        answers: ['cobra', 'casal', 'salta', 'fungo'],
        startedAt: 0,
      });
      const afterCobra = submit(state, 'COBRA'); // solves board 0
      const afterCasal = submit(afterCobra.state, 'CASAL'); // solves board 1
      const afterSalta = submit(afterCasal.state, 'SALTA'); // solves board 2 — only board 3 ("fungo") left
      const final = submit(afterSalta.state, 'TERRA'); // harmless; never any board's own answer

      const text = buildAnnouncement({
        state: final.state,
        guessIndex: 3,
        solvedBoardIndexes: final.solved,
        finishedStatus: final.finished,
      });

      expect(text).toContain('Tabuleiro em jogo: 4.');
      expect(text).not.toContain('Tabuleiros em jogo');
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

  describe('buildDefinitionsAnnouncement (Task 25 fix round 1, F2)', () => {
    it('states one board\'s definition directly, without a board number nobody needs for Solo', () => {
      expect(buildDefinitionsAnnouncement([{ answer: 'cobra' }], ['s.f. réptil sem patas'])).toBe(
        'Definição de cobra: réptil sem patas.',
      );
    });

    it('lists every board with a definition, semicolon-separated, for a multi-board match', () => {
      const text = buildDefinitionsAnnouncement(
        [{ answer: 'cobra' }, { answer: 'casal' }, { answer: 'fungo' }],
        ['s.f. réptil sem patas', 's.m. par de pessoas', null],
      );
      expect(text).toBe('Definições — cobra: réptil sem patas; casal: par de pessoas.');
    });

    it('returns an empty string when no board has a generated definition, rather than an empty label', () => {
      expect(buildDefinitionsAnnouncement([{ answer: 'cobra' }], [null])).toBe('');
    });
  });
});
