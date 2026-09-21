import { createContext, useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { createMatch, reduce } from '../engine/match';
import type { Action, Effect, InvalidReason, MatchState } from '../engine/match';
import { dayKeyOf, epochDayOf } from '../engine/clock';
import { dailyAnswers, dailyNumber as computeDailyNumber } from '../engine/daily';
import { VARIANTS, VARIANT_ORDER } from '../engine/constants';
import type { Mode, Variant } from '../engine/types';
import { dailyPool, isValidGuess, pickRandomAnswer } from '../data/dictionary';
import { useReveal } from './useReveal';
import { useDailyRollover } from './useDailyRollover';

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

/** A fresh daily match for `variant`, pinned to `dayKey`. */
function createDailyMatch(variant: Variant, dayKey: string): MatchState {
  const answers = dailyAnswers(dayKey, variant, dailyPool());
  return createMatch({ variant, mode: 'diario', dayKey, answers, startedAt: Date.now() });
}

/** A fresh infinite match for `variant`, excluding whatever answers are passed in. */
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
 * `null` until `SELECT_MODE` first creates it, so opening the app never
 * burns a daily deck draw or a random infinite word for boards nobody
 * looked at yet.
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
 * Pure — reads no clock, no storage, calls no setter (`Date.now()` inside
 * `createDailyMatch`/`createInfiniteMatch` is the one exception this file
 * has always made, same as the `createSoloMatch` it replaces: a match's own
 * `startedAt` timestamp, not a decision the reducer branches on). Every
 * write to a match goes through this one function, and `useReducer`'s
 * contract is what makes that safe under a fast typist: React guarantees
 * this reducer is called with the true, up-to-date `Slice` for every queued
 * action, in order, even when several dispatches land in the same
 * synchronous browser task with no render in between. That is the property
 * a hand-synced ref cannot give you — see git history on this file for the
 * bug that shipped without it.
 *
 * Every action below carries a raw input — an engine `Action`, a `variant`,
 * a `dayKey` — never a pre-built `MatchState`. `SELECT_MODE` and
 * `ROLLOVER` both need to construct a fresh `MatchState` (via
 * `createDailyMatch`/`createInfiniteMatch`), and both do it from parameters
 * the action itself carries plus `slice`'s own fields (`lastSeenDayKey`,
 * `pendingDaily`) — never from a value some `useEffect` or callback
 * computed outside this function and handed in ready-made. That is what
 * keeps this reducer's guarantee intact for daily mode exactly the way it
 * already held for `NEW_MATCH`.
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
          ? createDailyMatch(action.variant, slice.lastSeenDayKey)
          : createInfiniteMatch(action.variant, new Set());
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
          matches = setMatch(matches, variant, 'diario', createDailyMatch(variant, action.dayKey));
        }
      }
      return { ...slice, matches, pendingDaily, lastSeenDayKey: action.dayKey };
    }
    case 'APPLY_DAILY_ROLLOVER': {
      const dayKey = slice.pendingDaily[action.variant];
      if (dayKey === null) return slice;
      return {
        ...slice,
        matches: setMatch(slice.matches, action.variant, 'diario', createDailyMatch(action.variant, dayKey)),
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
  matches[active.variant][active.mode] = createInfiniteMatch(active.variant, new Set());
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
 * through the engine's `reduce`, and translates the effects it hands back
 * into UI: a toast and a row shake for REJECTED, the reveal gate for
 * ACCEPTED. BOARD_SOLVED and FINISHED need no UI state of their own here —
 * `state.boards[i].solvedAt` and `state.status` already carry that, and
 * Board.tsx already derives its frozen/solved presentation from them.
 */
export function MatchProvider({ children }: MatchProviderProps) {
  const [slice, dispatchProvider] = useReducer(providerReducer, undefined, initSlice);
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const [shakeToken, setShakeToken] = useState(0);
  const reveal = useReveal();

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
  // `providerReducer`, which stays pure. Runs once per render that finds a
  // non-empty queue, in order, regardless of how many dispatches produced
  // it, then drains the queue it just processed.
  useEffect(() => {
    if (slice.pendingEffects.length === 0) return;
    for (const effect of slice.pendingEffects) {
      switch (effect.type) {
        case 'REJECTED':
          setToasts((current) => [...current, { id: nextToastId(), text: REJECTION_MESSAGE[effect.reason] }]);
          setShakeToken((n) => n + 1);
          break;
        case 'ACCEPTED':
          reveal.start();
          // A new row becomes active; that row has never been rejected yet.
          setShakeToken(0);
          break;
        case 'BOARD_SOLVED':
        case 'FINISHED':
          // Already encoded in `slice.match` (solvedAt / status). Later
          // tasks (result modal, stats) hook these; this task has neither.
          break;
      }
    }
    dispatchProvider({ type: 'EFFECTS_FLUSHED' });
  }, [slice.pendingEffects, reveal]);

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
    if (reveal.isRevealing) return;
    dispatchProvider({ type: 'MATCH_ACTION', action: { type: 'SUBMIT' } });
  }, [reveal.isRevealing]);

  const newMatch = useCallback(() => {
    dispatchProvider({ type: 'NEW_MATCH' });
    setToasts([]);
    setShakeToken(0);
  }, []);

  const selectMode = useCallback((variant: Variant, mode: Mode) => {
    dispatchProvider({ type: 'SELECT_MODE', variant, mode });
    setToasts([]);
    setShakeToken(0);
  }, []);

  const applyDailyRollover = useCallback(() => {
    dispatchProvider({ type: 'APPLY_DAILY_ROLLOVER', variant: slice.active.variant });
    setToasts([]);
    setShakeToken(0);
  }, [slice.active.variant]);

  const activeMatch = requireMatch(slice.matches, slice.active.variant, slice.active.mode);
  const dailyNumber = activeMatch.dayKey !== null ? computeDailyNumber(activeMatch.dayKey) : null;
  const dailyRolloverPending =
    slice.active.mode === 'diario' && slice.pendingDaily[slice.active.variant] !== null;

  const value = useMemo<MatchContextValue>(
    () => ({
      state: activeMatch,
      isRevealing: reveal.isRevealing,
      toasts,
      shakeToken,
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
      reveal.isRevealing,
      toasts,
      shakeToken,
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
