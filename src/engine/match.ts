import { VARIANTS, WORD_LENGTH } from './constants';
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
  readonly draft: string;
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
  | { type: 'SUBMIT' };

export type InvalidReason = 'too_short' | 'not_in_dictionary' | 'already_guessed';

export type Effect =
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
    draft: '',
    status: 'playing',
    maxAttempts: VARIANTS[init.variant].attempts,
    startedAt: init.startedAt,
    finishedAt: null,
  };
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
      if (state.draft.length >= WORD_LENGTH) return { state, effects: [] };
      return { state: { ...state, draft: state.draft + action.letter }, effects: [] };
    }
    case 'BACKSPACE': {
      if (state.draft.length === 0) return { state, effects: [] };
      return { state: { ...state, draft: state.draft.slice(0, -1) }, effects: [] };
    }
    case 'SUBMIT':
      return submit(state, deps);
  }
}

function submit(state: MatchState, deps: EngineDeps): Transition {
  const word = state.draft;

  // Every rejection returns the SAME state object, so a wrong guess costs no
  // attempt and callers can assert identity rather than deep-compare.
  if (word.length !== WORD_LENGTH) {
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
      draft: '',
      status,
      finishedAt: status === 'playing' ? null : deps.now(),
    },
    effects,
  };
}
