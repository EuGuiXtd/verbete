import type { Mode, Variant } from '../engine/types';
import { emptyStats, type StatsRecord } from '../engine/stats';
import { historyKey, prefsKey, progressKey, recentKey, statsKey } from './keys';
import { readSlice, writeSlice } from './migrations';
import { createStore } from './safeStorage';
import type { HistoryEntry, PrefsRecord, ProgressRecord } from './schema';

// One store for the whole module: safeStorage's canary probe only needs to
// run once per session, and every slice shares the same quota-escalation
// ladder (it reasons about ALL of history/recent/progress at once, not just
// the key currently being written).
const store = createStore();

const DEFAULT_PREFS: PrefsRecord = {
  colorBlindMode: false,
  reduceMotion: false,
  hardMode: false,
  theme: 'system',
};

export function loadProgress(variant: Variant, mode: Mode): ProgressRecord | null {
  return readSlice<ProgressRecord>(store, progressKey(variant, mode), `progress:${variant}:${mode}`);
}

export function saveProgress(record: ProgressRecord): boolean {
  return writeSlice(store, progressKey(record.variant, record.mode), record);
}

export function loadStats(variant: Variant, mode: Mode): StatsRecord {
  return readSlice<StatsRecord>(store, statsKey(variant, mode), `stats:${variant}:${mode}`) ?? emptyStats();
}

export function saveStats(variant: Variant, mode: Mode, stats: StatsRecord): boolean {
  return writeSlice(store, statsKey(variant, mode), stats);
}

/**
 * Merges what was stored over the defaults rather than returning it whole.
 * Prefs is the one slice that grows field by field as settings get added, and
 * a record written before a field existed would otherwise come back with that
 * field `undefined` while TypeScript insisted it was present. Merging makes
 * adding a preference a non-event; it does NOT validate the values that are
 * there, so a reader that cares about a specific field still guards it.
 */
export function loadPrefs(): PrefsRecord {
  const stored = readSlice<Partial<PrefsRecord>>(store, prefsKey(), 'prefs');
  return stored === null ? DEFAULT_PREFS : { ...DEFAULT_PREFS, ...stored };
}

export function savePrefs(prefs: PrefsRecord): boolean {
  return writeSlice(store, prefsKey(), prefs);
}

export function appendHistory(entry: HistoryEntry): boolean {
  const existing = loadHistory();
  return writeSlice(store, historyKey(), [...existing, entry]);
}

export function loadHistory(): readonly HistoryEntry[] {
  return readSlice<readonly HistoryEntry[]>(store, historyKey(), 'history') ?? [];
}

export function loadRecent(variant: Variant): readonly string[] {
  return readSlice<readonly string[]>(store, recentKey(variant), `recent:${variant}`) ?? [];
}

export function saveRecent(variant: Variant, words: readonly string[]): boolean {
  return writeSlice(store, recentKey(variant), words);
}
