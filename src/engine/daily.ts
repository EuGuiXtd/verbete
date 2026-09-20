import { epochDayOf } from './clock';
import { VARIANTS } from './constants';
import { hashSeed, mulberry32, shuffled } from './rng';
import type { Variant } from './types';

const SALT = 'verbete.devduraes.com.br/v1';

/** 1 solo + 2 dueto + 4 quarteto. */
const SLOTS_PER_DAY = 7;

/**
 * Where each variant reads inside the day's seven slots.
 * APPEND-ONLY. Inserting a variant in the middle shifts every later variant's
 * whole future history. A new variant takes the next free offset and
 * SLOTS_PER_DAY grows; the existing numbers never move.
 */
const SLOT_OFFSET: Record<Variant, number> = { solo: 0, dueto: 1, quarteto: 3 };

const permutations = new Map<string, readonly number[]>();

function permutationFor(cycle: number, poolSize: number): readonly number[] {
  // Memoized: without this, each of the seven daily lookups reshuffles 1500
  // elements from scratch.
  //
  // Keyed on cycle AND poolSize, not cycle alone: dailyAnswers takes the pool
  // as a caller-supplied argument, so nothing stops two calls in one process
  // from passing different-length pools. A cycle-only key would hand back a
  // permutation sized for the wrong pool, and the non-null assertions below
  // would turn the resulting out-of-range read into a silently wrong answer
  // instead of a crash. Do not simplify this back to cycle alone.
  const key = `${cycle}|${poolSize}`;
  let cached = permutations.get(key);
  if (!cached) {
    const indices = Array.from({ length: poolSize }, (_, i) => i);
    cached = shuffled(indices, mulberry32(hashSeed(`${SALT}|cycle|${cycle}`)));
    permutations.set(key, cached);
  }
  return cached;
}

function drawAt(cursor: number, poolSize: number): number {
  const cycle = Math.floor(cursor / poolSize);
  const position = cursor % poolSize;
  return permutationFor(cycle, poolSize)[position]!;
}

export function dailyAnswers(
  dayKey: string,
  variant: Variant,
  pool: readonly string[],
): readonly string[] {
  const day = epochDayOf(dayKey);
  const base = day * SLOTS_PER_DAY;

  // Draw all seven of the day's slots from one stream, deduplicating as we go:
  // at a cycle boundary the last word of cycle c can reappear early in c+1.
  // Deduplicating across the whole day is what guarantees that no two boards —
  // in the same variant or across variants — share a word today.
  const daily: string[] = [];
  const taken = new Set<string>();
  for (let cursor = base; daily.length < SLOTS_PER_DAY; cursor += 1) {
    const word = pool[drawAt(cursor, pool.length)]!;
    if (taken.has(word)) continue;
    taken.add(word);
    daily.push(word);
  }

  const offset = SLOT_OFFSET[variant];
  return daily.slice(offset, offset + VARIANTS[variant].boards);
}

export function dailyNumber(dayKey: string): number {
  return epochDayOf(dayKey) + 1;
}
