import type { Mode, Variant } from '../engine/types';

/**
 * The version lives in the payload (see Envelope), not in the key. Keying by
 * version would force rewriting every stored key on each migration; wrapping
 * the payload instead means only the reader needs to know how to walk
 * old -> new shapes.
 */
export const CURRENT_VERSION = 1;

export interface Envelope<T> {
  readonly v: number;
  readonly data: T;
}

/**
 * A resumable slot's last known state — either a match still in progress, or
 * (once `finishedAt` is set) the just-completed match kept around long enough
 * for the UI to re-show the finished board without recomputing it. That's
 * also what "drop finished progress records" (the last rung before the
 * quota-escalation ladder gives up) is dropping: records that are no longer
 * needed to resume anything, only to redisplay it.
 *
 * Daily records never carry `answers` — they're re-derivable from `dayKey`
 * plus the current word list, and `answersHash` is how a reader notices the
 * list moved out from under it (a deploy changed the word list) and should
 * discard the record instead of scoring against the wrong answers. Infinite
 * records DO carry `answers`, because they were drawn at random and are not
 * re-derivable from anything else stored.
 *
 * `finishedAt` is optional, not merely nullable: storage only ever reads or
 * writes whatever the caller gives it, and never invents a value for a field
 * the caller didn't set.
 */
export interface ProgressRecord {
  readonly variant: Variant;
  readonly mode: Mode;
  readonly dayKey: string | null;
  readonly guesses: readonly string[];
  readonly draft: string;
  readonly answers: readonly string[] | null;
  readonly answersHash: string;
  readonly startedAt: number;
  readonly finishedAt?: number | null;
}

/**
 * One completed match, appended to the running history log.
 *
 * `answers` (added by Task 22, for HistoryModal) is the lowercase, accented
 * display form of each board's word, in board order — the same strings
 * `BoardState.answer` carries, and the same shape `definitions.ts` looks up
 * by. It is additive, not a reshape: an entry appended before Task 22 has no
 * such field on disk, so a reader must still tolerate one being absent
 * (`Array.isArray` before use, the same defensive shape check
 * `hasReplayableAnswers` already applies to a stored `ProgressRecord`)
 * rather than trusting the type checker's compile-time guarantee against
 * data that predates it.
 */
export interface HistoryEntry {
  readonly variant: Variant;
  readonly mode: Mode;
  readonly dayKey: string | null;
  readonly won: boolean;
  readonly attempts: number | null;
  readonly finishedAt: number;
  readonly answers: readonly string[];
}

/**
 * Which appearance the player asked for. `'system'` means "no opinion, follow
 * prefers-color-scheme", and is stored as an explicit value rather than as an
 * absent field so that "never chose" and "chose to follow the OS" stay the
 * same thing and neither needs a migration to express.
 *
 * It lives here rather than in state/ because it is part of the persisted
 * shape: storage may not depend on UI code, and the pre-paint script in
 * index.html reads these exact three strings straight out of localStorage.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * User-facing settings. Extend, don't reshape: add fields as later tasks need
 * them rather than guessing more now. Adding a field needs no migration —
 * loadPrefs() merges what it reads over the defaults — but REMOVING or
 * retyping one does.
 */
export interface PrefsRecord {
  readonly colorBlindMode: boolean;
  readonly reduceMotion: boolean;
  readonly hardMode: boolean;
  readonly theme: ThemeChoice;
}

/**
 * Hashes the exact, ordered, lowercase answers a match was created with.
 * Joined with a separator that cannot appear in a word, so two different
 * splits of the same letters (impossible here, since every answer is a fixed
 * length, but kept for safety) can never collide.
 *
 * This is what answersHash on a ProgressRecord stores: not a hash of dayKey,
 * which never changes for a given day, but a hash of the actual words that
 * dayKey resolved to at save time. A deploy that changes the word list
 * changes dailyAnswers(dayKey, variant, pool)'s output for the same dayKey,
 * which changes this hash — which is exactly the signal a reader needs to
 * discard a resumed daily match rather than score it against new answers.
 *
 * Uses FNV-1a rather than importing the engine's own hashSeed: storage may
 * only import *types* from engine/ (see Task 14 brief), not its runtime
 * helpers, so this is intentionally a small, separate implementation.
 */
export function computeAnswersHash(answers: readonly string[]): string {
  const input = answers.join('\u0000');
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
