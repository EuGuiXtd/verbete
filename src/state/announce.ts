import { parseDefinition } from '../data/definitions';
import { boardRows } from '../engine/match';
import type { MatchState } from '../engine/match';
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

export interface AnnouncementInput {
  readonly state: MatchState;
  /** The guess just accepted — see MatchProvider's ACCEPTED effect. */
  readonly guessIndex: number;
  /** Boards solved BY this exact guess — see the BOARD_SOLVED effects it produced. */
  readonly solvedBoardIndexes: readonly number[];
  /** Set when this same guess also produced a FINISHED effect. */
  readonly finishedStatus: 'won' | 'lost' | null;
}

/** "1", "1 e 2", or "1, 2 e 4" — the one pt-BR list join this file needs. */
function formatList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]!}`;
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
 * exactly the noise this task's brief warns about. Instead the guess is
 * spelled once ("tentativa C A S A L"), and each board then states only its
 * own five results in order.
 *
 * Every board's own row comes from `boardRows()` — the exact function
 * `Board.tsx` renders from — never from re-scoring the guess against every
 * board's answer directly. That distinction is load-bearing, not stylistic:
 * `boardRows` truncates a solved board's rows at `solvedAt + 1`, which is
 * the freeze itself (see its own doc comment in engine/match.ts) — a board
 * solved on an earlier guess has NO row at a later `guessIndex`, and this
 * function skips it entirely rather than inventing one. Re-scoring the raw
 * guess against every board's `answerNorm` regardless of `solvedAt` (this
 * function's first version) does not know that, and reports fabricated,
 * never-happened results for a frozen board on every subsequent guess — a
 * real bug a review round caught live: guess 2 announced fresh "ausente"/
 * "correta" results for a board that had already frozen on guess 1. Deriving
 * from `boardRows` instead of `scoreGuess` directly means the two can never
 * diverge again, by construction, not by discipline.
 *
 * A board solved BY this guess is called out by name ("Tabuleiro 2,
 * resolvido") ahead of its own results. A board frozen by an EARLIER guess
 * is dropped from the per-board list entirely and instead named once in a
 * lead-in ("Tabuleiros em jogo: 1 e 3.", or "Tabuleiro em jogo: 4." when
 * only one is left — see `boardWord` below) — so a board dropping out reads
 * as information (fewer boards are still live) rather than as a silently
 * missing one a listener might assume was simply skipped by accident.
 */
export function buildAnnouncement({ state, guessIndex, solvedBoardIndexes, finishedStatus }: AnnouncementInput): string {
  const guess = state.guesses[guessIndex];
  if (guess === undefined) return '';
  const rowNumber = guessIndex + 1;
  const solved = new Set(solvedBoardIndexes);

  const body =
    state.boards.length === 1
      ? buildSoloBody(state, guessIndex, rowNumber)
      : buildMultiBody(state, guessIndex, rowNumber, guess, solved);

  return finishedStatus === null ? body : `${body} ${buildFinishedSuffix(finishedStatus, state)}`;
}

function buildSoloBody(state: MatchState, guessIndex: number, rowNumber: number): string {
  const row = boardRows(state, 0)[guessIndex];
  // A Solo board only ever has one guess left un-rowed once it freezes, and
  // that freeze IS the match ending (no further guess can ever be accepted
  // afterwards — see engine/match.ts's `reduce`, which refuses any action
  // once `status !== 'playing'`) — so this branch is unreachable in
  // practice. Handled anyway rather than asserted away: an empty sentence
  // is a safe, silent no-op, not a crash, if that invariant ever changes.
  if (row === undefined) return '';
  const guess = row.guess;
  const parts = row.tiles.map((tile, index) => `${guess[index] ?? ''} ${TILE_LABEL[tile]}`);
  return `Linha ${String(rowNumber)}: ${parts.join(', ')}.`;
}

function buildMultiBody(
  state: MatchState,
  guessIndex: number,
  rowNumber: number,
  guess: string,
  solved: ReadonlySet<number>,
): string {
  const spelled = guess.split('').join(' ');
  const activeBoardNumbers: string[] = [];
  const boardTexts: string[] = [];

  state.boards.forEach((_board, boardIndex) => {
    const row = boardRows(state, boardIndex)[guessIndex];
    // No row at this guess index means this board froze on an EARLIER
    // guess (see this function's own doc comment) — it took no part in
    // this guess, so it gets no fabricated result for it.
    if (row === undefined) return;
    activeBoardNumbers.push(String(boardIndex + 1));
    const states = row.tiles.map((tile) => TILE_LABEL[tile]).join(', ');
    const label = solved.has(boardIndex)
      ? `Tabuleiro ${String(boardIndex + 1)}, resolvido`
      : `Tabuleiro ${String(boardIndex + 1)}`;
    boardTexts.push(`${label}: ${states}.`);
  });

  let leadIn = '';
  if (activeBoardNumbers.length < state.boards.length) {
    // Task 25 fix round 2 (R3): singular/plural agreement — one board left
    // in play reads "Tabuleiro em jogo: 4.", not the plural noun over a
    // single item ("Tabuleiros em jogo: 4.") the first version always used.
    const boardWord = activeBoardNumbers.length === 1 ? 'Tabuleiro' : 'Tabuleiros';
    leadIn = `${boardWord} em jogo: ${formatList(activeBoardNumbers)}. `;
  }
  return `Linha ${String(rowNumber)}, tentativa ${spelled}. ${leadIn}${boardTexts.join(' ')}`;
}

/**
 * The win/loss line — and, on a loss, the word(s) themselves. A won match
 * never needs this: the player just typed the winning word, so restating it
 * teaches them nothing a sighted player's own board doesn't already show
 * them for free (the fully-inked row). A LOST match is the opposite: a
 * sighted player still sees the answer, in `ResultModal`'s own reveal — a
 * screen-reader user hearing only "não foi dessa vez" and nothing else
 * never learns it at all, unless they happen to Tab into a dialog that was
 * never announced as having appeared (see ResultModal.tsx's own doc comment
 * on why it still does not steal focus, and this task's report for why that
 * gap is real and not fully closed here). Only the boards that are still
 * UNSOLVED get named: a board the player already solved mid-match is a word
 * they already typed correctly, not one they need told back to them.
 */
function buildFinishedSuffix(status: 'won' | 'lost', state: MatchState): string {
  if (status === 'won') return 'Fim de jogo: você venceu!';

  const unsolved = state.boards.filter((board) => board.solvedAt === null).map((board) => board.answer);
  if (unsolved.length === 0) return 'Fim de jogo: você não acertou dessa vez.';
  const wordLine =
    unsolved.length === 1 ? `A palavra era ${unsolved[0]!}.` : `As palavras eram ${formatList(unsolved)}.`;
  return `Fim de jogo: você não acertou dessa vez. ${wordLine}`;
}

/**
 * The dictionary-definition line, set once `loadDefinition` resolves for
 * every board (see MatchProvider.tsx's own doc comment on the async
 * staleness guard). Read aloud through its OWN, separate live region
 * (`GuessAnnouncer.tsx`'s second `role="status"`) rather than appended to
 * the row/outcome announcement — Task 25 fix round 2 (R2): the row/outcome
 * region is `aria-atomic="true"`, so appending this to it re-read the WHOLE
 * thing on every finished match — the final row's five per-letter results,
 * then the outcome line, then the definition — a full extra utterance for
 * information the player already heard seconds earlier. A dedicated region
 * means only the new, actually-new text is ever spoken.
 *
 * Mirrors `ResultModal`'s own per-board reveal — every board gets an entry,
 * win or lose, exactly like `VerbeteEntry` there — but only for a board
 * whose word actually has a generated definition (see `loadDefinition`'s
 * own doc comment on why that is not every word — a real, pre-existing gap
 * in the generated dictionary, not something this function can fix),
 * silently omitted otherwise, exactly as `ResultModal` itself omits the
 * whole gloss paragraph for one.
 */
export function buildDefinitionsAnnouncement(
  boards: ReadonlyArray<{ readonly answer: string }>,
  rawDefinitions: readonly (string | null)[],
): string {
  const entries = boards
    .map((board, index) => {
      const raw = rawDefinitions[index];
      return raw === null || raw === undefined ? null : { answer: board.answer, gloss: parseDefinition(raw).gloss };
    })
    .filter((entry): entry is { answer: string; gloss: string } => entry !== null);

  if (entries.length === 0) return '';
  if (entries.length === 1 && boards.length === 1) {
    return `Definição de ${entries[0]!.answer}: ${entries[0]!.gloss}.`;
  }
  return `Definições — ${entries.map((entry) => `${entry.answer}: ${entry.gloss}`).join('; ')}.`;
}
