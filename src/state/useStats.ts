import { useCallback, useMemo } from 'react';
import { applyResult } from '../engine/stats';
import type { MatchResult, StatsRecord } from '../engine/stats';
import type { Mode, Variant } from '../engine/types';
import { loadStats, saveStats } from '../storage/repository';

export interface UseStatsResult {
  /** Whatever is currently on disk for (variant, mode) — see loadStats' emptyStats() default. */
  readonly getStats: (variant: Variant, mode: Mode) => StatsRecord;
  /**
   * Folds one finished match into that variant/mode's persisted stats and
   * writes the result straight through the repository, returning the
   * updated record so a caller that wants to show it right away (a result
   * modal, say) does not have to read it back out again.
   */
  readonly recordResult: (variant: Variant, mode: Mode, result: MatchResult) => StatsRecord;
}

/**
 * A thin, storage-backed wrapper around engine/stats.ts's pure `applyResult`.
 * Holds no React state of its own — every call reads or writes straight
 * through the repository — so nothing here can drift from what is actually
 * on disk, and MatchProvider can call `recordResult` directly from its
 * effect-draining loop without introducing a second, in-memory copy of "what
 * are the current stats" that would need to be kept in sync with storage on
 * its own.
 */
export function useStats(): UseStatsResult {
  const getStats = useCallback((variant: Variant, mode: Mode) => loadStats(variant, mode), []);

  const recordResult = useCallback((variant: Variant, mode: Mode, result: MatchResult) => {
    const next = applyResult(loadStats(variant, mode), result);
    saveStats(variant, mode, next);
    return next;
  }, []);

  return useMemo(() => ({ getStats, recordResult }), [getStats, recordResult]);
}
