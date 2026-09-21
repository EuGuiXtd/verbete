import { useCallback, useEffect, useRef, useState } from 'react';
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

export interface RevealGate {
  /** True for the duration of one reveal, starting from the last start(). */
  readonly isRevealing: boolean;
  /** Raise the gate. Call once per ACCEPTED effect. */
  readonly start: () => void;
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
 */
export function useReveal(): RevealGate {
  const [isRevealing, setIsRevealing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const start = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    setIsRevealing(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setIsRevealing(false);
    }, revealGateDurationMs());
  }, []);

  return { isRevealing, start };
}
