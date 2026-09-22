import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WORD_LENGTH } from '../engine/constants';

// Only used if the tokens genuinely cannot be read (no getComputedStyle, or
// the custom property is unset) — should not happen in the real app, where
// tokens.css always sets both. Chosen close to the brief's original "roughly
// 1.5s" figure so a broken read fails safe (a long gate), not fast (a short
// or nonexistent one).
const FALLBACK_MS = 1500;

function readMs(propertyName: string, fallback: number): number {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return fallback;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim();
  if (raw === '') return fallback;
  const value = raw.endsWith('ms')
    ? Number.parseFloat(raw)
    : raw.endsWith('s')
      ? Number.parseFloat(raw) * 1000
      : Number.parseFloat(raw);
  return Number.isNaN(value) ? fallback : value;
}

/**
 * How long the reveal gate stays up, derived from the same tokens
 * Tile.tsx's own cascade already uses — not a literal duplicating that math.
 * The last tile in a row (index WORD_LENGTH - 1) starts its press
 * `--reveal-duration * (WORD_LENGTH-1)/WORD_LENGTH` after the row appears
 * (see Tile.tsx's `transitionDelay`), then takes `--press-duration` to
 * finish. Both tokens collapse to 0ms under prefers-reduced-motion (see
 * tokens.css), so this collapses with them: a player who asked for reduced
 * motion is never gated behind an animation they cannot see.
 */
export function revealGateDurationMs(): number {
  const reveal = readMs('--reveal-duration', FALLBACK_MS);
  const press = readMs('--press-duration', 0);
  return (reveal * (WORD_LENGTH - 1)) / WORD_LENGTH + press;
}

export interface RevealGates {
  /** True for the duration of one reveal on `key`, starting from that key's last start(). */
  readonly isRevealing: (key: string) => boolean;
  /** Raise `key`'s gate. Call once per ACCEPTED effect on that key's match. */
  readonly start: (key: string) => void;
}

/**
 * The reveal gate lives here, in React, and nowhere near the engine.
 * `reduce` in src/engine/match.ts is synchronous and instantaneous — a
 * submitted guess is scored the moment it is dispatched — but the
 * *animation* that shows the result takes real time, and a fast typist
 * submitting again before it finishes would be submitting into a
 * half-revealed row. If this gate lived in the engine instead, every
 * reducer test would become asynchronous, and the engine's own purity
 * gates (no timers, no host clock) would reject it outright.
 *
 * Keyed, not a single boolean: `MatchProvider` owns six matches at once
 * (every variant x mode combination) behind ONE call to this hook. Task 23
 * found the practical consequence of an earlier, single-gate version of
 * this hook: submitting a guess in one match, then switching tabs before
 * its ~300ms reveal finished, left the NEWLY active match's own "enviar"
 * transiently dead — blocked by an animation on a board that tab was never
 * even showing. Every key here (`"<variant>:<mode>"`, see MatchProvider's
 * `matchKey`) gets its own timer and its own slot in `revealingKeys`, so
 * one match's reveal can never gate, extend or clear another's.
 */
export function useReveal(): RevealGates {
  const [revealingKeys, setRevealingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      for (const timeout of timeoutsRef.current.values()) clearTimeout(timeout);
      timeoutsRef.current.clear();
    },
    [],
  );

  const start = useCallback((key: string) => {
    const existing = timeoutsRef.current.get(key);
    if (existing !== undefined) clearTimeout(existing);

    setRevealingKeys((current) => (current.has(key) ? current : new Set(current).add(key)));

    const timeout = setTimeout(() => {
      timeoutsRef.current.delete(key);
      setRevealingKeys((current) => {
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, revealGateDurationMs());
    timeoutsRef.current.set(key, timeout);
  }, []);

  const isRevealing = useCallback((key: string) => revealingKeys.has(key), [revealingKeys]);

  // Memoized, matching useStats's own return (useStats.ts) — the convention
  // one of the two hooks already documents. `reveal` sits in the dependency
  // array of MatchProvider's history/stats effect, so a fresh object literal
  // every render schedules that effect after every render. Only the
  // `pendingEffects.length === 0` early return stops it double-writing a
  // match into history and double-counting a result, and what keeps the
  // queue empty by then is React's batching, not anything this file
  // guarantees. One unbatched setState away from a real bug.
  return useMemo(() => ({ isRevealing, start }), [isRevealing, start]);
}
