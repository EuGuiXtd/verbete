import { areConsecutive } from './clock';
import type { Mode } from './types';

export interface StatsRecord {
  readonly played: number;
  readonly wins: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly lastWinDayKey: string | null;
  readonly distribution: Readonly<Record<number, number>>;
}

export interface MatchResult {
  readonly won: boolean;
  readonly attempts: number | null;
  readonly dayKey: string | null;
  readonly mode: Mode;
}

export function emptyStats(): StatsRecord {
  return {
    played: 0, wins: 0, streak: 0, bestStreak: 0,
    lastWinDayKey: null, distribution: {},
  };
}

export function applyResult(previous: StatsRecord, result: MatchResult): StatsRecord {
  const distribution = { ...previous.distribution };
  if (result.won && result.attempts !== null) {
    distribution[result.attempts] = (distribution[result.attempts] ?? 0) + 1;
  }

  const base = {
    played: previous.played + 1,
    wins: previous.wins + (result.won ? 1 : 0),
    distribution,
  };

  // Streaks belong to the daily challenge. Infinite mode counts towards games
  // and wins but must never advance or break a streak.
  if (result.mode !== 'diario' || result.dayKey === null) {
    return { ...previous, ...base };
  }

  if (!result.won) {
    return { ...previous, ...base, streak: 0 };
  }

  const continues =
    previous.lastWinDayKey !== null && areConsecutive(previous.lastWinDayKey, result.dayKey);
  const streak = continues ? previous.streak + 1 : 1;

  return {
    ...previous,
    ...base,
    streak,
    bestStreak: Math.max(previous.bestStreak, streak),
    lastWinDayKey: result.dayKey,
  };
}

export function winRate(stats: StatsRecord): number {
  return stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
}
