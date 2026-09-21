import { createContext, useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { createMatch, reduce } from '../engine/match';
import type { Action, Effect, InvalidReason, MatchState } from '../engine/match';
import { isValidGuess, pickRandomAnswer } from '../data/dictionary';
import { useReveal } from './useReveal';

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
  readonly newMatch: () => void;
}

export const MatchContext = createContext<MatchContextValue | null>(null);

let toastSeq = 0;
function nextToastId(): number {
  toastSeq += 1;
  return toastSeq;
}

/** A fresh Solo infinite match, excluding whatever answers are passed in. */
function createSoloMatch(exclude: ReadonlySet<string>): MatchState {
  const answer = pickRandomAnswer(exclude, Math.random);
  return createMatch({
    variant: 'solo',
    mode: 'infinito',
    dayKey: null,
    answers: [answer],
    startedAt: Date.now(),
  });
}

/**
 * The match plus whatever engine effects it has produced that the UI has
 * not turned into a toast/shake/reveal yet. `pendingEffects` is a queue,
 * not a snapshot: it accumulates rather than replaces, and the useEffect
 * below drains it after every render that finds it non-empty.
 */
interface Slice {
  readonly match: MatchState;
  readonly pendingEffects: readonly Effect[];
}

type ProviderAction =
  | { type: 'MATCH_ACTION'; action: Action }
  | { type: 'NEW_MATCH' }
  | { type: 'EFFECTS_FLUSHED' };

/**
 * Pure — reads no clock, no storage, calls no setter. Every write to the
 * match goes through this one function, and `useReducer`'s contract is what
 * makes that safe under a fast typist: React guarantees this reducer is
 * called with the true, up-to-date `Slice` for every queued action, in
 * order, even when several dispatches land in the same synchronous browser
 * task with no render in between. That is the property a hand-synced ref
 * cannot give you — see git history on this file for the bug that shipped
 * without it (dispatching 'C' then 'A' in one task produced a draft of
 * "A", not "CA", because both dispatches read the same stale snapshot).
 * There is no second write path left to reintroduce that race: Task 19's
 * daily mode and Task 20's restore-from-storage both have to come through
 * `NEW_MATCH` or a new `ProviderAction` variant, and either way they get
 * this same guarantee for free, by construction, not by convention.
 *
 * `NEW_MATCH` reads `slice.match` for its exclude set for the same reason
 * `MATCH_ACTION` reads `slice.match` for `reduce`'s previous state: because
 * it is the argument React hands this function, never a value read from
 * outside it.
 *
 * Effects accumulate (`[...slice.pendingEffects, ...effects]`), never
 * replace: two dispatches batched into the same render must not let the
 * first one's toast/shake get silently dropped by the second's. Only
 * `EFFECTS_FLUSHED` — dispatched from the consuming `useEffect`, once per
 * render that has any — drains the queue back to empty.
 */
function providerReducer(slice: Slice, action: ProviderAction): Slice {
  switch (action.type) {
    case 'MATCH_ACTION': {
      const { state, effects } = reduce(slice.match, action.action, { isValidGuess, now: Date.now });
      if (state === slice.match && effects.length === 0) return slice;
      return {
        match: state,
        pendingEffects: effects.length === 0 ? slice.pendingEffects : [...slice.pendingEffects, ...effects],
      };
    }
    case 'NEW_MATCH':
      return {
        match: createSoloMatch(new Set(slice.match.boards.map((board) => board.answer))),
        pendingEffects: [],
      };
    case 'EFFECTS_FLUSHED':
      return slice.pendingEffects.length === 0 ? slice : { ...slice, pendingEffects: [] };
  }
}

function initSlice(): Slice {
  return { match: createSoloMatch(new Set()), pendingEffects: [] };
}

export interface MatchProviderProps {
  readonly children: ReactNode;
}

/**
 * Owns the `MatchState`, dispatches every action through the engine's
 * `reduce`, and translates the effects it hands back into UI: a toast and a
 * row shake for REJECTED, the reveal gate for ACCEPTED. BOARD_SOLVED and
 * FINISHED need no UI state of their own here — `state.boards[i].solvedAt`
 * and `state.status` already carry that, and Board.tsx already derives its
 * frozen/solved presentation from them.
 */
export function MatchProvider({ children }: MatchProviderProps) {
  const [slice, dispatchProvider] = useReducer(providerReducer, undefined, initSlice);
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const [shakeToken, setShakeToken] = useState(0);
  const reveal = useReveal();

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
          // tasks (result modal, stats) hook these; Task 18 has neither.
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

  const value = useMemo<MatchContextValue>(
    () => ({
      state: slice.match,
      isRevealing: reveal.isRevealing,
      toasts,
      shakeToken,
      dismissToast,
      type,
      backspace,
      submit,
      newMatch,
    }),
    [slice.match, reveal.isRevealing, toasts, shakeToken, dismissToast, type, backspace, submit, newMatch],
  );

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}
