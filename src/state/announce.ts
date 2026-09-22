import type { MatchState } from '../engine/match';
import { scoreGuess } from '../engine/score';
import type { Tile } from '../engine/types';

/**
 * Short pt-BR labels for the aria-live row summary — deliberately terser
 * than Tile.tsx's own per-tile `aria-label` wording ("na posição correta",
 * "existe na palavra, posição errada", "não existe na palavra"). That extra
 * length is fine for one tile visited on its own; repeated once per letter,
 * once per board, on a fully-scored Quarteto row it is the difference
 * between a sentence and a wall of words. See buildAnnouncement's own doc
 * comment for the actual noise measurement.
 */
const TILE_LABEL: Record<Tile, string> = {
  correct: 'correta',
  present: 'na posição errada',
  absent: 'ausente',
};

const FINISHED_LABEL: Record<'won' | 'lost', string> = {
  won: 'Fim de jogo: você venceu!',
  lost: 'Fim de jogo: você não acertou dessa vez.',
};

export interface AnnouncementInput {
  readonly state: MatchState;
  /** The guess just accepted — see MatchProvider's ACCEPTED effect. */
  readonly guessIndex: number;
  /** Boards solved BY this exact guess — see the BOARD_SOLVED effects it produced. */
  readonly solvedBoardIndexes: readonly number[];
  /** Set when this same guess also produced a FINISHED effect. */
  readonly finishedStatus: 'won' | 'lost' | null;
}

/**
 * The pt-BR sentence GuessAnnouncer.tsx reads aloud after every accepted
 * guess — the entire feedback channel for a player who receives no ink at
 * all (see this task's report). Two shapes, chosen by board count:
 *
 * SOLO (one board): every letter states its own result, matching the
 * brief's own worked example exactly — "Linha 2: C correta, A na posição
 * errada, S ausente, A ausente, L ausente." Five letters is nothing to read
 * aloud, and repeating each letter next to its own result is the most
 * direct translation of "what a sighted player reads off the row in one
 * glance" into speech.
 *
 * DUETO/QUARTETO (two or four boards): the SAME five letters were just
 * submitted to every board at once — only the *scoring* differs board to
 * board, never the guess itself. Repeating "letter, result" once per board
 * would repeat those five letters verbatim two or four times over, which is
 * exactly the noise this task's brief warns about: a fully-scored Quarteto
 * row would read out ten or twenty "letter, result" pairs where half of
 * every pair (the letter) never changes. Instead the guess is spelled once
 * ("tentativa C A S A L"), and each board then states only its own five
 * results in order — a player who just typed the guess already knows which
 * letter sits in which position; what they cannot know without sight is how
 * THIS board scored it. Measured against the brief's own worked Solo
 * example: a fully-scored Quarteto row goes from 20 "letter, result" pairs
 * (40 spoken tokens) to one spelled-out word plus four five-result lists
 * (25 tokens) — a real cut, not a cosmetic one, and the one place a naive
 * per-board repeat of the Solo shape becomes unusable.
 *
 * A board solved BY this guess is called out by name ("Tabuleiro 2,
 * resolvido") ahead of its own results, rather than left to be inferred
 * from five "correta" in a row: that explicit word is also this task's fix
 * for the sighted "frozen board reads as shorter, not muted" problem
 * (Board.tsx's own new caption), carried into the one channel where a
 * screen-reader user has no board to glance at afterwards and notice it
 * stopped growing.
 */
export function buildAnnouncement({ state, guessIndex, solvedBoardIndexes, finishedStatus }: AnnouncementInput): string {
  const guess = state.guesses[guessIndex];
  if (guess === undefined) return '';
  const rowNumber = guessIndex + 1;
  const solved = new Set(solvedBoardIndexes);

  const body =
    state.boards.length === 1
      ? buildSoloBody(guess, state.boards[0]!.answerNorm, rowNumber)
      : buildMultiBody(guess, state.boards, rowNumber, solved);

  return finishedStatus === null ? body : `${body} ${FINISHED_LABEL[finishedStatus]}`;
}

function buildSoloBody(guess: string, answerNorm: string, rowNumber: number): string {
  const tiles = scoreGuess(guess, answerNorm);
  const parts = tiles.map((tile, index) => `${guess[index] ?? ''} ${TILE_LABEL[tile]}`);
  return `Linha ${String(rowNumber)}: ${parts.join(', ')}.`;
}

function buildMultiBody(
  guess: string,
  boards: MatchState['boards'],
  rowNumber: number,
  solved: ReadonlySet<number>,
): string {
  const spelled = guess.split('').join(' ');
  const boardTexts = boards.map((board, boardIndex) => {
    const tiles = scoreGuess(guess, board.answerNorm);
    const states = tiles.map((tile) => TILE_LABEL[tile]).join(', ');
    const label = solved.has(boardIndex)
      ? `Tabuleiro ${String(boardIndex + 1)}, resolvido`
      : `Tabuleiro ${String(boardIndex + 1)}`;
    return `${label}: ${states}.`;
  });
  return `Linha ${String(rowNumber)}, tentativa ${spelled}. ${boardTexts.join(' ')}`;
}
