import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const [state, setState] = useState<MatchState>(() => createSoloMatch(new Set()));
  // The authoritative "current state" `dispatch` reads, kept in sync
  // EAGERLY (assigned the instant a new state is computed, inside dispatch
  // and newMatch below) rather than only from the render body. Multiple
  // native keydown events can reach usePhysicalKeyboard's listener — and
  // therefore call `type`/`submit` — back to back inside the same browser
  // task, with no React render in between to refresh a render-time-only
  // ref. A ref synced only at render time would then feed every dispatch
  // in that burst the SAME stale snapshot, silently dropping all but the
  // last keystroke (verified by hand: dispatching 'C' then 'A' synchronously
  // produced a draft of "A", not "CA", before this fix). Eagerly assigning
  // it right after computing each new state closes that gap.
  const stateRef = useRef(state);

  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const [shakeToken, setShakeToken] = useState(0);
  const reveal = useReveal();

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const applyEffects = useCallback(
    (effects: readonly Effect[]) => {
      for (const effect of effects) {
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
            // Already encoded in `state` (solvedAt / status). Later tasks
            // (result modal, stats) hook these; Task 18 has neither.
            break;
        }
      }
    },
    [reveal],
  );

  const dispatch = useCallback(
    (action: Action) => {
      const { state: next, effects } = reduce(stateRef.current, action, { isValidGuess, now: Date.now });
      stateRef.current = next; // eager: see the doc comment on stateRef above
      setState(next);
      if (effects.length > 0) applyEffects(effects);
    },
    [applyEffects],
  );

  const type = useCallback((letter: string) => dispatch({ type: 'TYPE', letter }), [dispatch]);
  const backspace = useCallback(() => dispatch({ type: 'BACKSPACE' }), [dispatch]);
  const submit = useCallback(() => {
    // The reveal gate: belongs here, in the UI, not in the engine. The
    // reducer is synchronous and would happily score a second guess the
    // instant it is dispatched, but the row is still mid-animation on
    // screen — a fast typist submitting here would be submitting into a
    // half-revealed row.
    if (reveal.isRevealing) return;
    dispatch({ type: 'SUBMIT' });
  }, [dispatch, reveal.isRevealing]);

  const newMatch = useCallback(() => {
    const next = createSoloMatch(new Set(stateRef.current.boards.map((board) => board.answer)));
    stateRef.current = next; // eager: see the doc comment on stateRef above
    setState(next);
    setToasts([]);
    setShakeToken(0);
  }, []);

  const value = useMemo<MatchContextValue>(
    () => ({
      state,
      isRevealing: reveal.isRevealing,
      toasts,
      shakeToken,
      dismissToast,
      type,
      backspace,
      submit,
      newMatch,
    }),
    [state, reveal.isRevealing, toasts, shakeToken, dismissToast, type, backspace, submit, newMatch],
  );

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}
