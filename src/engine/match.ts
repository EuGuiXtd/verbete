import { EMPTY_SLOT, VARIANTS, WORD_LENGTH } from './constants';
import { normalize } from './normalize';
import { scoreGuess } from './score';
import type { MatchStatus, Mode, Tile, Variant } from './types';

export interface BoardState {
  /** Lowercase display form, exactly as stored in ANSWERS (e.g. "então"). */
  readonly answer: string;
  /** normalize(answer): uppercase, diacritic-stripped, used for comparison. */
  readonly answerNorm: string;
  readonly solvedAt: number | null;
}

export interface MatchState {
  readonly variant: Variant;
  readonly mode: Mode;
  readonly dayKey: string | null;
  readonly boards: readonly BoardState[];
  readonly guesses: readonly string[];
  /**
   * Always exactly `WORD_LENGTH` characters: a letter, or `EMPTY_SLOT` for a
   * house the player has not filled. Feedback round 1, item 3 — it used to
   * be a string that grew from the left, which made "type into the third
   * block first" unrepresentable rather than merely unimplemented. A fixed
   * board of houses makes a hole a first-class state, and every other rule
   * in this file follows from that one change.
   */
  readonly draft: string;
  /**
   * Which house the next typed letter lands in: 0..WORD_LENGTH-1, or
   * WORD_LENGTH for "past the last house", the position a complete draft
   * leaves the cursor in. That extra value is not decoration — it is what
   * preserves the pre-existing rule that typing a sixth letter does nothing.
   * See `reduce`'s TYPE case.
   */
  readonly cursor: number;
  readonly status: MatchStatus;
  readonly maxAttempts: number;
  readonly startedAt: number;
  readonly finishedAt: number | null;
}

export interface Row {
  readonly guess: string;
  readonly tiles: readonly Tile[];
}

export type Action =
  | { type: 'TYPE'; letter: string }
  | { type: 'BACKSPACE' }
  | { type: 'MOVE_CURSOR'; index: number }
  | { type: 'SUBMIT' };

export type InvalidReason = 'too_short' | 'not_in_dictionary' | 'already_guessed';

export type Effect =
  /**
   * Emitted ONLY by an explicit MOVE_CURSOR, never by the automatic advance
   * a TYPE or a BACKSPACE performs. A player who moves the insertion point
   * on purpose is asking where it went; a player typing normally is not, and
   * announcing every keystroke would bury the row summary that actually
   * matters (see src/state/announce.ts).
   */
  | { type: 'CURSOR_MOVED'; index: number }
  | { type: 'REJECTED'; reason: InvalidReason; word: string }
  | { type: 'ACCEPTED'; guessIndex: number }
  | { type: 'BOARD_SOLVED'; boardIndex: number; guessIndex: number }
  | { type: 'FINISHED'; status: 'won' | 'lost' };

export interface EngineDeps {
  isValidGuess: (normalized: string) => boolean;
  now: () => number;
}

export interface Transition {
  readonly state: MatchState;
  readonly effects: readonly Effect[];
}

export interface MatchInit {
  variant: Variant;
  mode: Mode;
  dayKey: string | null;
  answers: readonly string[];
  startedAt: number;
}

export function createMatch(init: MatchInit): MatchState {
  return {
    variant: init.variant,
    mode: init.mode,
    dayKey: init.dayKey,
    boards: init.answers.map((answer) => ({
      answer,
      answerNorm: normalize(answer),
      solvedAt: null,
    })),
    guesses: [],
    draft: emptyDraft(),
    cursor: 0,
    status: 'playing',
    maxAttempts: VARIANTS[init.variant].attempts,
    startedAt: init.startedAt,
    finishedAt: null,
  };
}

/** `WORD_LENGTH` empty houses — the draft a fresh match, and every accepted guess, leaves behind. */
export function emptyDraft(): string {
  return EMPTY_SLOT.repeat(WORD_LENGTH);
}

/** True once every house holds a letter, which is the only thing `submit` needs to know about length. */
export function isDraftComplete(draft: string): boolean {
  return !draft.includes(EMPTY_SLOT);
}

/** The draft with `letter` written into house `index`, every other house untouched. */
function writeSlot(draft: string, index: number, letter: string): string {
  return draft.slice(0, index) + letter + draft.slice(index + 1);
}

/**
 * Where the cursor goes after a letter lands in house `from`.
 *
 * The first empty house to the RIGHT, else the first empty house anywhere
 * (wrapping past the end), else — a complete draft — one step right, which
 * for the last house is `WORD_LENGTH`, the "past the end" position.
 *
 * Read left to right on an empty draft this is exactly the old behaviour:
 * 0, 1, 2, 3, 4, then `WORD_LENGTH`, where TYPE stops doing anything. The
 * wrap is what makes the new behaviour useful rather than merely possible —
 * a player who fills house 3 first still gets carried to house 0 rather
 * than being stranded at the end of the word with holes behind them.
 */
export function nextCursor(draft: string, from: number): number {
  for (let index = from + 1; index < WORD_LENGTH; index += 1) {
    if (draft[index] === EMPTY_SLOT) return index;
  }
  for (let index = 0; index < from; index += 1) {
    if (draft[index] === EMPTY_SLOT) return index;
  }
  return Math.min(from + 1, WORD_LENGTH);
}

export function remainingAttempts(state: MatchState): number {
  return state.maxAttempts - state.guesses.length;
}

/**
 * Rows are derived, never stored. A board that was solved at guess k stops
 * producing rows after k, which is how "solved boards freeze" falls out with
 * no branch of its own.
 */
export function boardRows(state: MatchState, boardIndex: number): readonly Row[] {
  const board = state.boards[boardIndex]!;
  const limit = board.solvedAt !== null ? board.solvedAt + 1 : state.guesses.length;
  return state.guesses.slice(0, limit).map((guess) => ({
    guess,
    tiles: scoreGuess(guess, board.answerNorm),
  }));
}

export function reduce(state: MatchState, action: Action, deps: EngineDeps): Transition {
  if (state.status !== 'playing') return { state, effects: [] };

  switch (action.type) {
    case 'TYPE': {
      // The one case that is not about the cursor at all: a complete draft
      // parks the cursor past the last house, and typing there is the same
      // no-op it has always been. A player who wants to overwrite a letter
      // in a full word says so by moving the cursor onto it first.
      if (state.cursor >= WORD_LENGTH) return { state, effects: [] };
      const draft = writeSlot(state.draft, state.cursor, action.letter);
      return { state: { ...state, draft, cursor: nextCursor(draft, state.cursor) }, effects: [] };
    }
    case 'BACKSPACE': {
      // Clears the house UNDER the cursor when that house holds something,
      // and otherwise the nearest one behind it. On a draft typed left to
      // right the cursor always sits on an empty house, so this is
      // indistinguishable from the old "delete the last letter" — but after
      // a player taps house 2 to fix it, it deletes house 2, which is the
      // house they just pointed at, not the one before it.
      if (state.cursor < WORD_LENGTH && state.draft[state.cursor] !== EMPTY_SLOT) {
        return { state: { ...state, draft: writeSlot(state.draft, state.cursor, EMPTY_SLOT) }, effects: [] };
      }
      if (state.cursor === 0) return { state, effects: [] };
      const target = state.cursor - 1;
      if (state.draft[target] === EMPTY_SLOT) return { state: { ...state, cursor: target }, effects: [] };
      return { state: { ...state, draft: writeSlot(state.draft, target, EMPTY_SLOT), cursor: target }, effects: [] };
    }
    case 'MOVE_CURSOR': {
      // Clamped rather than rejected: a caller asking for house -1 or house
      // 9 wants the nearest end, and there is no state in which refusing to
      // move is more useful than moving as far as asked. WORD_LENGTH itself
      // is deliberately NOT reachable this way — it is the resting place a
      // completed draft leaves the cursor in, not a house anyone can point
      // at.
      const index = Math.min(Math.max(action.index, 0), WORD_LENGTH - 1);
      if (index === state.cursor) return { state, effects: [] };
      return { state: { ...state, cursor: index }, effects: [{ type: 'CURSOR_MOVED', index }] };
    }
    case 'SUBMIT':
      return submit(state, deps);
  }
}

function submit(state: MatchState, deps: EngineDeps): Transition {
  const word = state.draft;

  // Every rejection returns the SAME state object, so a wrong guess costs no
  // attempt and callers can assert identity rather than deep-compare.
  // Was `word.length !== WORD_LENGTH`. A draft is now always exactly that
  // long — what varies is how many of its houses are filled — so the
  // question "is this guess finished" became "are there any holes in it".
  // The rejection reason and its message are unchanged: a hole in the middle
  // and a missing last letter are the same complaint to a player, "a palavra
  // tem cinco letras".
  if (!isDraftComplete(word)) {
    return { state, effects: [{ type: 'REJECTED', reason: 'too_short', word }] };
  }
  if (state.guesses.includes(word)) {
    return { state, effects: [{ type: 'REJECTED', reason: 'already_guessed', word }] };
  }
  if (!deps.isValidGuess(word)) {
    return { state, effects: [{ type: 'REJECTED', reason: 'not_in_dictionary', word }] };
  }

  const guessIndex = state.guesses.length;
  const effects: Effect[] = [{ type: 'ACCEPTED', guessIndex }];

  const boards = state.boards.map((board, boardIndex) => {
    if (board.solvedAt !== null || board.answerNorm !== word) return board;
    effects.push({ type: 'BOARD_SOLVED', boardIndex, guessIndex });
    return { ...board, solvedAt: guessIndex };
  });

  const guesses = [...state.guesses, word];
  const allSolved = boards.every((board) => board.solvedAt !== null);
  const outOfAttempts = guesses.length >= state.maxAttempts;
  const status: MatchStatus = allSolved ? 'won' : outOfAttempts ? 'lost' : 'playing';
  if (status !== 'playing') effects.push({ type: 'FINISHED', status });

  return {
    state: {
      ...state,
      boards,
      guesses,
      draft: emptyDraft(),
      cursor: 0,
      status,
      finishedAt: status === 'playing' ? null : deps.now(),
    },
    effects,
  };
}
