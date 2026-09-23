import { useContext } from 'react';
import type { MatchState } from '../engine/match';
import type { Mode, Variant } from '../engine/types';
import { MatchContext } from './MatchProvider';
import type { ToastMessage } from './MatchProvider';

export interface UseMatchResult {
  readonly state: MatchState;
  readonly type: (letter: string) => void;
  readonly backspace: () => void;
  readonly submit: () => void;
  readonly newMatch: () => void;
  readonly isRevealing: boolean;
  /** For ToastHost. Not part of the brief's one-line summary, but the same context value. */
  readonly toasts: readonly ToastMessage[];
  readonly dismissToast: (id: number) => void;
  /** For Board's active-row shake. See MatchContextValue's doc comment. */
  readonly shakeToken: number;
  /** The pt-BR sentence the live region reads aloud — see MatchContextValue's own doc comment. */
  readonly announcement: string;
  /** The dictionary-definition sentence, read through its own separate live region — see MatchContextValue's own doc comment. */
  readonly definitionAnnouncement: string;
  /** For ModeTabs: which of the six variant x mode matches is on screen. */
  readonly active: { readonly variant: Variant; readonly mode: Mode };
  readonly selectMode: (variant: Variant, mode: Mode) => void;
  readonly dailyNumber: number | null;
  readonly dailyRolloverPending: boolean;
  readonly applyDailyRollover: () => void;
}

/**
 * The one hook the UI talks to. Must be called under a `<MatchProvider>` —
 * there is no default match to fall back to, since there is no such thing
 * as "no active match" anywhere this game is actually played.
 */
export function useMatch(): UseMatchResult {
  const context = useContext(MatchContext);
  if (!context) {
    throw new Error('useMatch must be used within a MatchProvider');
  }
  return context;
}
