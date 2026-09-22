import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createMatch, reduce } from '../engine/match';
import type { Action, Effect, InvalidReason, MatchState } from '../engine/match';
import { dayKeyOf, epochDayOf } from '../engine/clock';
import { dailyAnswers, dailyNumber as computeDailyNumber } from '../engine/daily';
import { VARIANTS, VARIANT_ORDER, WORD_LENGTH } from '../engine/constants';
import type { Mode, Variant } from '../engine/types';
import { DICTIONARY_VERSION, dailyPool, isValidGuess, pickRandomAnswer } from '../data/dictionary';
import { appendHistory, loadProgress, saveProgress } from '../storage/repository';
import { computeAnswersHash } from '../storage/schema';
import type { ProgressRecord } from '../storage/schema';
import { buildAnnouncement } from './announce';
import { useReveal } from './useReveal';
import { useDailyRollover } from './useDailyRollover';
import { useStats } from './useStats';

/**
 * Rejection reasons, in the one language this game speaks to a player.
 * Keyed by the engine's own `InvalidReason` so a reason the engine adds
 * later fails to compile here rather than falling through silently.
 */
const REJECTION_MESSAGE: Record<InvalidReason, string> = {
  too_short: 'Faltam letras',
  not_in_dictionary: 'Essa palavra não está no dicionário',
  already_guessed: 'Você já tentou essa',
};

/** How long after the last keystroke a drafted-but-unsubmitted guess is written to storage. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
}

export interface MatchContextValue {
  readonly state: MatchState;
  readonly isRevealing: boolean;
  readonly toasts: readonly ToastMessage[];
  /**
   * Bumped once per REJECTED effect against the *current* active row, reset
   * whenever a guess is accepted (a new row becomes active) or a new match
   * starts. Board.tsx folds this into the active row's React key so the
   * shake replays even for two identical rejections in a row — a boolean
   * flip would not survive that, since setting the same value twice is not
   * a change React would ever see.
   */
  readonly shakeToken: number;
  /**
   * The pt-BR sentence GuessAnnouncer.tsx reads aloud, describing whatever
   * the most recently accepted guess revealed — see buildAnnouncement's own
   * doc comment in src/state/announce.ts for the exact shape and why it
   * differs between Solo and a multi-board variant. Empty until the first
   * guess of a session is accepted; stays at its last value afterwards
   * rather than clearing between guesses, since an aria-live region only
   * announces on a text CHANGE and every accepted guess produces new text
   * anyway (a repeated guess is rejected before ever reaching this).
   */
  readonly announcement: string;
  readonly dismissToast: (id: number) => void;
  readonly type: (letter: string) => void;
  readonly backspace: () => void;
  readonly submit: () => void;
  /** Only meaningful in infinite mode; a no-op while a daily match is active. */
  readonly newMatch: () => void;
  /** Which of the six variant x mode matches is currently on screen. */
  readonly active: { readonly variant: Variant; readonly mode: Mode };
  /**
   * Switches which match is on screen. Every one of the six combinations
   * keeps its own `MatchState` for the lifetime of the tab — switching away
   * and back never resets it.
   */
  readonly selectMode: (variant: Variant, mode: Mode) => void;
  /** The active match's puzzle number (e.g. 412), or null outside daily mode. */
  readonly dailyNumber: number | null;
  /**
   * True when the calendar day has moved on for the active variant's daily
   * match while that match was still in progress. The board is deliberately
   * left untouched until `applyDailyRollover` is called — see
   * `providerReducer`'s ROLLOVER case.
   */
  readonly dailyRolloverPending: boolean;
  /** Swaps today's daily match in for the active variant. See `dailyRolloverPending`. */
  readonly applyDailyRollover: () => void;
}

export const MatchContext = createContext<MatchContextValue | null>(null);

let toastSeq = 0;
function nextToastId(): number {
  toastSeq += 1;
  return toastSeq;
}

/** A fresh daily match for `variant`, pinned to `dayKey`. Never consults storage — see loadOrCreateDaily. */
function createDailyMatch(variant: Variant, dayKey: string): MatchState {
  const answers = dailyAnswers(dayKey, variant, dailyPool());
  return createMatch({ variant, mode: 'diario', dayKey, answers, startedAt: Date.now() });
}

/** A fresh infinite match for `variant`, excluding whatever answers are passed in. Never consults storage — see loadOrCreateInfinite. */
function createInfiniteMatch(variant: Variant, exclude: ReadonlySet<string>): MatchState {
  const taken = new Set(exclude);
  const answers: string[] = [];
  for (let i = 0; i < VARIANTS[variant].boards; i += 1) {
    const answer = pickRandomAnswer(taken, Math.random);
    taken.add(answer);
    answers.push(answer);
  }
  return createMatch({ variant, mode: 'infinito', dayKey: null, answers, startedAt: Date.now() });
}

/** What today's daily match for (variant, dayKey) should contain right now, re-derived from scratch. */
function currentDailyAnswers(variant: Variant, dayKey: string): { answers: readonly string[]; hash: string } {
  const answers = dailyAnswers(dayKey, variant, dailyPool());
  return { answers, hash: computeAnswersHash(answers) };
}

/**
 * The key `useReveal`'s per-match gates are stored under — see that hook's
 * own doc comment for why a single shared gate is not good enough once six
 * matches (every variant x mode combination) exist behind one MatchProvider.
 */
function matchKey(active: { readonly variant: Variant; readonly mode: Mode }): string {
  return `${active.variant}:${active.mode}`;
}

/** Matches exactly `WORD_LENGTH` uppercase A–Z letters — the one shape replay depends on. */
const GUESS_PATTERN = new RegExp(`^[A-Z]{${String(WORD_LENGTH)}}$`);

/**
 * The structural property `replayMatch` actually depends on: `guesses` is
 * an array, and every entry is a string of exactly `WORD_LENGTH` uppercase
 * letters. Checked at load time, before a record is ever handed to
 * `replayMatch`, for two reasons:
 *
 * 1. A malformed record — `guesses` not an array, or holding something
 *    that is not a string — would otherwise throw inside `replayMatch`'s
 *    `for...of`, during a reducer call. That is a render-time crash, not a
 *    caught, discard-and-fall-back failure the way every other storage
 *    read in this codebase behaves. This check runs first specifically so
 *    a corrupt or hand-edited record is discarded instead of ever reaching
 *    that loop.
 * 2. It is also what makes it safe for `replayMatch` to skip dictionary
 *    validation entirely (see that function's doc comment) — this is the
 *    ONE property replay still needs from a stored guess, checked here
 *    instead of by re-consulting a dictionary that can legitimately change
 *    under a saved game.
 */
function hasReplayableGuesses(guesses: unknown): guesses is readonly string[] {
  return Array.isArray(guesses) && guesses.every((guess) => typeof guess === 'string' && GUESS_PATTERN.test(guess));
}

/**
 * Rebuilds a `MatchState` by folding the engine's own `reduce` over a stored
 * guess list — the exact same function every live guess already goes
 * through — rather than hand-assembling a `MatchState` from the record's
 * fields. `record` is storage's own `ProgressRecord` shape: plain strings,
 * arrays and numbers, exactly what came back out of `loadProgress`, never a
 * `MatchState` itself. `answers` is resolved by whichever caller already
 * decided where they come from — re-derived for daily, read straight off
 * the record for infinite (see `loadOrCreateDaily`/`loadOrCreateInfinite`
 * below) — so this function stays agnostic to *why* they are what they are.
 *
 * Each historical guess is replayed by writing it into `draft` and reducing
 * a `SUBMIT`, not by hand-rolling a second copy of the win/lose/solvedAt
 * bookkeeping `submit()` in engine/match.ts already owns.
 *
 * Replay deliberately passes `isValidGuess: () => true` rather than the
 * real dictionary check: these guesses were valid when they were played,
 * and `isValidGuess` exists to reject a *new* guess, not to re-litigate the
 * past. Re-validating a historical guess against today's dictionary is
 * actively dangerous, not merely redundant — the dictionary is a build
 * artifact that can legitimately change under a saved game (a word dropped
 * from the guess table), and if that word happened to be the one that WON
 * the match, `submit()` would reject it (a discarded REJECTED effect, since
 * replay never surfaces effects), the board would never be marked solved,
 * and a match the player actually won would come back from reload as still
 * "playing" — missing its winning row entirely. `hasReplayableGuesses`
 * (called by every caller of this function, before it's ever called) is
 * what replay actually needs instead: proof each guess is `WORD_LENGTH`
 * uppercase letters, a property that cannot drift with the word list.
 *
 * `deps.now` only matters if a replayed guess finishes the match; the
 * `finishedAt` the player actually experienced is restored afterwards from
 * `record.finishedAt` rather than trusted from the replay, since the replay
 * runs at reload time, not at the moment the match actually ended.
 */
function replayMatch(record: ProgressRecord, answers: readonly string[]): MatchState {
  let state = createMatch({
    variant: record.variant,
    mode: record.mode,
    dayKey: record.dayKey,
    answers,
    startedAt: record.startedAt,
  });
  for (const guess of record.guesses) {
    state = reduce({ ...state, draft: guess }, { type: 'SUBMIT' }, { isValidGuess: () => true, now: Date.now }).state;
  }
  if (state.status !== 'playing') {
    return record.finishedAt != null ? { ...state, finishedAt: record.finishedAt } : state;
  }
  return { ...state, draft: record.draft };
}

/**
 * Restores `variant`'s daily match for `dayKey` from storage when — and
 * only when — the stored record is actually for that exact day AND
 * re-deriving that day's answers right now produces the same
 * `answersHash` the record was saved with. Either mismatch means the
 * record is stale (the calendar moved on, or a deploy changed the word
 * list since it was written) and the player gets a brand new match rather
 * than one scored against answers they never saw.
 */
function loadOrCreateDaily(variant: Variant, dayKey: string): MatchState {
  const record = loadProgress(variant, 'diario');
  if (
    record !== null &&
    record.variant === variant &&
    record.mode === 'diario' &&
    record.dayKey === dayKey &&
    hasReplayableGuesses(record.guesses)
  ) {
    const { answers, hash } = currentDailyAnswers(variant, dayKey);
    if (hash === record.answersHash) return replayMatch(record, answers);
  }
  return createDailyMatch(variant, dayKey);
}

/**
 * The structural property infinite restore actually needs from a stored
 * `answers` field: an array of exactly `expectedCount` strings. Mirrors
 * `hasReplayableGuesses` above, for the same reason — `record.answers` is
 * typed `readonly string[] | null` on `ProgressRecord`, but that type is
 * only ever checked at compile time; `loadProgress` hands back whatever
 * `JSON.parse` produced from localStorage, cast, not validated. Without this
 * check a hand-edited or corrupt record could carry a non-array with a
 * matching `.length` (a string is not an array but does have `.length`, so
 * e.g. a four-character string would pass a bare `.length === boards` check
 * for Quarteto) and reach `createMatch`'s `init.answers.map(...)`, which
 * throws on a string (no `.map`) — or an array holding non-string entries,
 * which reaches `normalize()` inside `createMatch`'s `.map` and throws
 * there instead. Both are render-time crashes from a corrupt record, same
 * failure class `hasReplayableGuesses` already guards against for guesses.
 */
function hasReplayableAnswers(answers: unknown, expectedCount: number): answers is readonly string[] {
  return Array.isArray(answers) && answers.length === expectedCount && answers.every((answer) => typeof answer === 'string');
}

/**
 * Restores `variant`'s infinite match from storage when a record exists and
 * carries a plausible answer set. Infinite's answers were drawn at random
 * and are not re-derivable from anything else kept in storage, so — unlike
 * daily — this only needs a shape check, not a hash comparison: there is no
 * "current" answer set to compare against.
 */
function loadOrCreateInfinite(variant: Variant, exclude: ReadonlySet<string>): MatchState {
  const record = loadProgress(variant, 'infinito');
  if (
    record !== null &&
    record.variant === variant &&
    record.mode === 'infinito' &&
    hasReplayableAnswers(record.answers, VARIANTS[variant].boards) &&
    hasReplayableGuesses(record.guesses)
  ) {
    return replayMatch(record, record.answers);
  }
  return createInfiniteMatch(variant, exclude);
}

/** The `ProgressRecord` that `active`'s current `match` should be saved as. */
function toProgressRecord(active: { readonly variant: Variant; readonly mode: Mode }, match: MatchState): ProgressRecord {
  const answers = match.boards.map((board) => board.answer);
  return {
    variant: active.variant,
    mode: active.mode,
    dayKey: match.dayKey,
    guesses: match.guesses,
    draft: match.draft,
    // Daily is re-derivable from dayKey and never stores its answers (see
    // computeAnswersHash's doc comment in storage/schema.ts); infinite's
    // were drawn at random and have nowhere else to come from.
    answers: active.mode === 'infinito' ? answers : null,
    answersHash: computeAnswersHash(answers),
    startedAt: match.startedAt,
    finishedAt: match.finishedAt,
  };
}

type MatchMap = Record<Variant, Record<Mode, MatchState | null>>;

function emptyMatchMap(): MatchMap {
  const map = {} as MatchMap;
  for (const variant of VARIANT_ORDER) {
    map[variant] = { diario: null, infinito: null };
  }
  return map;
}

function setMatch(matches: MatchMap, variant: Variant, mode: Mode, match: MatchState): MatchMap {
  return { ...matches, [variant]: { ...matches[variant], [mode]: match } };
}

/**
 * Reads the match for `variant`/`mode`, throwing rather than returning
 * `undefined` if it has never been created. The only two places a match is
 * read are `slice.active` (guaranteed populated by `initSlice` and every
 * `SELECT_MODE` branch below) — so a throw here means the invariant was
 * broken elsewhere in this reducer, not a real "no match yet" state a
 * caller needs to handle.
 */
function requireMatch(matches: MatchMap, variant: Variant, mode: Mode): MatchState {
  const match = matches[variant][mode];
  if (match === null) {
    throw new Error(`No match initialized for ${variant}/${mode} before it became active.`);
  }
  return match;
}

/**
 * The match plus whatever engine effects it has produced that the UI has
 * not turned into a toast/shake/reveal yet. `pendingEffects` is a queue,
 * not a snapshot: it accumulates rather than replaces, and the useEffect
 * below drains it after every render that finds it non-empty.
 *
 * `matches` holds all six variant x mode combinations a player can reach,
 * created lazily: a combination the player has never switched to stays
 * `null` until `SELECT_MODE` first creates (or restores) it, so opening the
 * app never burns a daily deck draw or a random infinite word for boards
 * nobody looked at yet.
 *
 * `pendingDaily[variant]` is the new day key a rollover found waiting while
 * that variant's daily match was still in progress — see the ROLLOVER case.
 * It is `null` until a rollover is pending and again once it is applied.
 */
interface Slice {
  readonly active: { readonly variant: Variant; readonly mode: Mode };
  readonly matches: MatchMap;
  readonly pendingEffects: readonly Effect[];
  /** The last calendar day key this reducer has accepted. Never moves backwards. */
  readonly lastSeenDayKey: string;
  readonly pendingDaily: Record<Variant, string | null>;
}

type ProviderAction =
  | { type: 'MATCH_ACTION'; action: Action }
  | { type: 'NEW_MATCH' }
  | { type: 'SELECT_MODE'; variant: Variant; mode: Mode }
  | { type: 'ROLLOVER'; dayKey: string }
  | { type: 'APPLY_DAILY_ROLLOVER'; variant: Variant }
  | { type: 'EFFECTS_FLUSHED' };

/**
 * Reads no clock beyond `Date.now()` inside `createDailyMatch`/
 * `createInfiniteMatch`/`replayMatch` (a match's own `startedAt`/`finishedAt`
 * timestamp, not a decision this function branches on) and reads storage
 * only through `loadOrCreateDaily`/`loadOrCreateInfinite`, both synchronous,
 * deterministic lookups keyed on this action's own primitive fields — the
 * same kind of sanctioned exception `Date.now()` already was before this
 * task. Every write to a match goes through this one function, and
 * `useReducer`'s contract is what makes that safe under a fast typist: React
 * guarantees this reducer is called with the true, up-to-date `Slice` for
 * every queued action, in order, even when several dispatches land in the
 * same synchronous browser task with no render in between. That is the
 * property a hand-synced ref cannot give you — see git history on this file
 * for the bug that shipped without it.
 *
 * Every action below carries a raw input — an engine `Action`, a `variant`,
 * a `dayKey` — never a pre-built `MatchState`. `SELECT_MODE` and
 * `ROLLOVER` both need to construct a fresh (or restored) `MatchState` (via
 * `loadOrCreateDaily`/`loadOrCreateInfinite`), and both do it from
 * parameters the action itself carries plus `slice`'s own fields
 * (`lastSeenDayKey`, `pendingDaily`) — never from a value some `useEffect`
 * or callback computed outside this function and handed in ready-made. In
 * particular, restoring a match from storage is not an exception to this:
 * `loadOrCreateDaily`/`loadOrCreateInfinite` fetch the raw `ProgressRecord`
 * themselves, right here, and turn it into a `MatchState` via `replayMatch`
 * in the same synchronous call — there is no `RESTORE` action anywhere in
 * `ProviderAction`, and no dispatch site in this file ever carries a
 * `MatchState`. That is what keeps this reducer's guarantee intact for
 * restore-from-storage exactly the way it already held for `NEW_MATCH`.
 */
function providerReducer(slice: Slice, action: ProviderAction): Slice {
  switch (action.type) {
    case 'MATCH_ACTION': {
      const { variant, mode } = slice.active;
      const current = requireMatch(slice.matches, variant, mode);
      const { state, effects } = reduce(current, action.action, { isValidGuess, now: Date.now });
      if (state === current && effects.length === 0) return slice;
      return {
        ...slice,
        matches: setMatch(slice.matches, variant, mode, state),
        pendingEffects: effects.length === 0 ? slice.pendingEffects : [...slice.pendingEffects, ...effects],
      };
    }
    case 'NEW_MATCH': {
      const { variant, mode } = slice.active;
      // The reset control only exists in infinite mode (see ModeTabs); a
      // stray dispatch against a daily match is a no-op, not a crash.
      if (mode !== 'infinito') return slice;
      const current = requireMatch(slice.matches, variant, mode);
      const next = createInfiniteMatch(variant, new Set(current.boards.map((board) => board.answer)));
      return { ...slice, matches: setMatch(slice.matches, variant, mode, next), pendingEffects: [] };
    }
    case 'SELECT_MODE': {
      if (slice.active.variant === action.variant && slice.active.mode === action.mode) return slice;
      const existing = slice.matches[action.variant][action.mode];
      if (existing !== null) {
        return { ...slice, active: { variant: action.variant, mode: action.mode } };
      }
      const created =
        action.mode === 'diario'
          ? loadOrCreateDaily(action.variant, slice.lastSeenDayKey)
          : loadOrCreateInfinite(action.variant, new Set());
      return {
        ...slice,
        active: { variant: action.variant, mode: action.mode },
        matches: setMatch(slice.matches, action.variant, action.mode, created),
      };
    }
    case 'ROLLOVER': {
      // Refuse to go backwards: setting the device clock back must not
      // unlock a replay of a match already played, nor even acknowledge a
      // day key at or before the one already recorded.
      if (epochDayOf(action.dayKey) <= epochDayOf(slice.lastSeenDayKey)) return slice;

      let matches = slice.matches;
      let pendingDaily = slice.pendingDaily;
      for (const variant of VARIANT_ORDER) {
        const current = matches[variant].diario;
        if (current === null || current.dayKey === action.dayKey) continue;
        if (current.status === 'playing') {
          // In progress: never destroyed here. ModeTabs/App surface a
          // banner off `pendingDaily`; the swap only happens through
          // APPLY_DAILY_ROLLOVER, on the player's own button press.
          pendingDaily = { ...pendingDaily, [variant]: action.dayKey };
        } else {
          // Finished: rolls over on its own, no banner needed.
          matches = setMatch(matches, variant, 'diario', loadOrCreateDaily(variant, action.dayKey));
        }
      }
      return { ...slice, matches, pendingDaily, lastSeenDayKey: action.dayKey };
    }
    case 'APPLY_DAILY_ROLLOVER': {
      const dayKey = slice.pendingDaily[action.variant];
      if (dayKey === null) return slice;
      return {
        ...slice,
        matches: setMatch(slice.matches, action.variant, 'diario', loadOrCreateDaily(action.variant, dayKey)),
        pendingDaily: { ...slice.pendingDaily, [action.variant]: null },
      };
    }
    case 'EFFECTS_FLUSHED':
      return slice.pendingEffects.length === 0 ? slice : { ...slice, pendingEffects: [] };
  }
}

function initSlice(): Slice {
  const active: { variant: Variant; mode: Mode } = { variant: 'solo', mode: 'infinito' };
  const matches = emptyMatchMap();
  matches[active.variant][active.mode] = loadOrCreateInfinite(active.variant, new Set());
  return {
    active,
    matches,
    pendingEffects: [],
    lastSeenDayKey: dayKeyOf(Date.now()),
    pendingDaily: { solo: null, dueto: null, quarteto: null },
  };
}

export interface MatchProviderProps {
  readonly children: ReactNode;
}

/**
 * Owns all six variant x mode `MatchState`s, dispatches every action
 * through the engine's `reduce`, translates the effects it hands back into
 * UI (a toast and a row shake for REJECTED, the reveal gate for ACCEPTED),
 * and persists progress, stats and history through `src/storage/`.
 *
 * Four independent triggers write progress, none of them a keystroke: each
 * committed guess (immediately), the draft (debounced 500ms), the tab being
 * backgrounded (`visibilitychange` → `hidden`, more reliable than
 * `beforeunload` on mobile), and — for stats/history, which are cumulative
 * logs rather than a snapshot of the active match — once, exactly when a
 * match finishes.
 */
export function MatchProvider({ children }: MatchProviderProps) {
  const [slice, dispatchProvider] = useReducer(providerReducer, undefined, initSlice);
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const [shakeToken, setShakeToken] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const reveal = useReveal();
  const stats = useStats();

  const activeMatch = requireMatch(slice.matches, slice.active.variant, slice.active.mode);

  // Always-current snapshot of what is on screen, for callbacks that must
  // persist "whatever is active right now" without becoming unstable
  // themselves (a fresh identity every render would retrigger every effect
  // below on every keystroke). Same ref-for-latest-value pattern
  // useDailyRollover already uses for `onNewDay`.
  const latestRef = useRef({ active: slice.active, match: activeMatch });
  latestRef.current = { active: slice.active, match: activeMatch };

  const flushActiveProgress = useCallback(() => {
    saveProgress(toProgressRecord(latestRef.current.active, latestRef.current.match));
  }, []);

  // On each committed guess: this fires exactly when `guesses` gets a new
  // array, which only happens on an accepted SUBMIT (see engine/match.ts's
  // submit()) — a TYPE/BACKSPACE only ever touches `draft`, never `guesses`.
  useEffect(() => {
    flushActiveProgress();
  }, [activeMatch.guesses, flushActiveProgress]);

  // The draft, debounced: a keystroke must not hit storage on every press,
  // only once typing has paused for DRAFT_SAVE_DEBOUNCE_MS.
  useEffect(() => {
    const timer = setTimeout(flushActiveProgress, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [activeMatch.draft, flushActiveProgress]);

  // A backgrounded tab, not `beforeunload`: many mobile browsers never fire
  // beforeunload for a tab switch or an app switch, so this is the more
  // reliable moment to catch a draft the 500ms debounce above has not
  // flushed yet.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushActiveProgress();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushActiveProgress]);

  // The one place a day change is detected. `ROLLOVER` carries only the raw
  // day key `useDailyRollover` computed from the real clock — every
  // `MatchState` it might lead to is still built inside `providerReducer`.
  const handleNewDay = useCallback((dayKey: string) => {
    dispatchProvider({ type: 'ROLLOVER', dayKey });
  }, []);
  useDailyRollover(handleNewDay);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  // The one place side effects actually happen — deliberately not inside
  // `providerReducer`, which stays free of anything but the sanctioned
  // clock/storage reads documented on it. Runs once per render that finds a
  // non-empty queue, in order, regardless of how many dispatches produced
  // it, then drains the queue it just processed.
  useEffect(() => {
    if (slice.pendingEffects.length === 0) return;
    // Announcement bookkeeping for GuessAnnouncer.tsx (Task 25): every
    // accepted guess starts its own batch — see buildAnnouncement's own doc
    // comment in src/state/announce.ts for the sentence itself. Reset on
    // each ACCEPTED rather than accumulated across the whole queue so two
    // SUBMITs landing in the same flush (not something a normal player can
    // trigger — submit() gates on reveal.isRevealing — but not something
    // this loop should silently mix together either) never let an earlier
    // batch's BOARD_SOLVED/FINISHED bleed into a later one's sentence.
    let announcedGuessIndex: number | null = null;
    let solvedBoardIndexes: number[] = [];
    let finishedStatus: 'won' | 'lost' | null = null;
    for (const effect of slice.pendingEffects) {
      switch (effect.type) {
        case 'REJECTED':
          setToasts((current) => [...current, { id: nextToastId(), text: REJECTION_MESSAGE[effect.reason] }]);
          setShakeToken((n) => n + 1);
          break;
        case 'ACCEPTED':
          // Keyed to the match that actually accepted the guess. `slice.active`
          // is correct here (not `latestRef`): every effect in this queue was
          // produced by a MATCH_ACTION dispatched against `slice.active` at
          // the time, and this effect drain always runs against the same
          // `slice` snapshot that produced it (see this useEffect's deps).
          reveal.start(matchKey(slice.active));
          // A new row becomes active; that row has never been rejected yet.
          setShakeToken(0);
          announcedGuessIndex = effect.guessIndex;
          solvedBoardIndexes = [];
          finishedStatus = null;
          break;
        case 'BOARD_SOLVED':
          if (effect.guessIndex === announcedGuessIndex) solvedBoardIndexes.push(effect.boardIndex);
          break;
        case 'FINISHED': {
          finishedStatus = effect.status;
          // The one write that must happen exactly once per completed
          // match: stats and history are cumulative logs, not a snapshot of
          // the active match, so the per-guess and debounced progress saves
          // above must never touch them — only this branch does, driven by
          // the FINISHED effect itself, which engine/match.ts's submit()
          // emits at most once per match.
          const { variant, mode } = slice.active;
          const attempts = effect.status === 'won' ? activeMatch.guesses.length : null;
          const dayKey = activeMatch.dayKey;
          stats.recordResult(variant, mode, { won: effect.status === 'won', attempts, dayKey, mode });
          appendHistory({
            variant,
            mode,
            dayKey,
            won: effect.status === 'won',
            attempts,
            finishedAt: activeMatch.finishedAt ?? Date.now(),
            // Task 22's HistoryModal is the only place a player can revisit
            // a word they learned; without this the history log would have
            // nothing to show but a date and a score.
            answers: activeMatch.boards.map((board) => board.answer),
            // Task 24: stamps which build's word list produced this match,
            // so a stale-service-worker mismatch is detectable after the
            // fact rather than silent. See HistoryEntry's doc comment.
            dictionaryVersion: DICTIONARY_VERSION,
          });
          saveProgress(toProgressRecord(slice.active, activeMatch));
          break;
        }
      }
    }
    if (announcedGuessIndex !== null) {
      setAnnouncement(
        buildAnnouncement({ state: activeMatch, guessIndex: announcedGuessIndex, solvedBoardIndexes, finishedStatus }),
      );
    }
    dispatchProvider({ type: 'EFFECTS_FLUSHED' });
  }, [slice.pendingEffects, slice.active, activeMatch, reveal, stats]);

  const type = useCallback(
    (letter: string) => dispatchProvider({ type: 'MATCH_ACTION', action: { type: 'TYPE', letter } }),
    [],
  );
  const backspace = useCallback(
    () => dispatchProvider({ type: 'MATCH_ACTION', action: { type: 'BACKSPACE' } }),
    [],
  );
  const submit = useCallback(() => {
    // The reveal gate: belongs here, in the UI, not in the engine. The
    // reducer is synchronous and would happily score a second guess the
    // instant it is dispatched, but the row is still mid-animation on
    // screen — a fast typist submitting here would be submitting into a
    // half-revealed row.
    //
    // `latestRef` (not `slice.active` closed over directly), same reason as
    // `flushActiveProgress` above: this callback's identity only changes
    // when `reveal.isRevealing` itself changes, so it must read whichever
    // match is active AT CALL TIME, not whichever was active when it was
    // last recreated. Reading the wrong (stale) key here is exactly how a
    // reveal on the match you just left could gate the one you switched to.
    if (reveal.isRevealing(matchKey(latestRef.current.active))) return;
    dispatchProvider({ type: 'MATCH_ACTION', action: { type: 'SUBMIT' } });
  }, [reveal.isRevealing]);

  const newMatch = useCallback(() => {
    dispatchProvider({ type: 'NEW_MATCH' });
    setToasts([]);
    setShakeToken(0);
  }, []);

  const selectMode = useCallback(
    (variant: Variant, mode: Mode) => {
      // Persist whatever the match we are leaving has, including a draft
      // the 500ms debounce has not flushed yet — the only moment that draft
      // would otherwise be lost, since nothing else touches an inactive
      // match's storage record once it stops being active.
      flushActiveProgress();
      dispatchProvider({ type: 'SELECT_MODE', variant, mode });
      setToasts([]);
      setShakeToken(0);
    },
    [flushActiveProgress],
  );

  const applyDailyRollover = useCallback(() => {
    dispatchProvider({ type: 'APPLY_DAILY_ROLLOVER', variant: slice.active.variant });
    setToasts([]);
    setShakeToken(0);
  }, [slice.active.variant]);

  const dailyNumber = activeMatch.dayKey !== null ? computeDailyNumber(activeMatch.dayKey) : null;
  const dailyRolloverPending =
    slice.active.mode === 'diario' && slice.pendingDaily[slice.active.variant] !== null;
  // The public `isRevealing` stays a plain boolean — always the CURRENTLY
  // active match's own gate, never another one's. `useReveal`'s keying by
  // match is an internal detail of this provider; nothing outside it needs
  // to know a key even exists.
  const isRevealingActive = reveal.isRevealing(matchKey(slice.active));

  const value = useMemo<MatchContextValue>(
    () => ({
      state: activeMatch,
      isRevealing: isRevealingActive,
      toasts,
      shakeToken,
      announcement,
      dismissToast,
      type,
      backspace,
      submit,
      newMatch,
      active: slice.active,
      selectMode,
      dailyNumber,
      dailyRolloverPending,
      applyDailyRollover,
    }),
    [
      activeMatch,
      isRevealingActive,
      toasts,
      shakeToken,
      announcement,
      dismissToast,
      type,
      backspace,
      submit,
      newMatch,
      slice.active,
      selectMode,
      dailyNumber,
      dailyRolloverPending,
      applyDailyRollover,
    ],
  );

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}
