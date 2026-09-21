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

export function loadPrefs(): PrefsRecord {
  return readSlice<PrefsRecord>(store, prefsKey(), 'prefs') ?? DEFAULT_PREFS;
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
