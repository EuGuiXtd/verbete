import type { Mode, Variant } from '../engine/types';
import { historyKey, progressKey, recentKey } from './keys';

/**
 * Mirrors the Variant/Mode unions from engine/types.ts, duplicated rather
 * than imported: storage may only import *types* from engine/ (see the Task
 * 14 brief), and the quota ladder below needs to iterate every variant/mode
 * combination at runtime, not just name their type. Typed as
 * Record<Variant, true> / Record<Mode, true> so that if engine/types.ts ever
 * gains a variant or mode, TypeScript — not a bug report — is what notices:
 * a missing key is a type error, and so is an extra one.
 */
const VARIANT_SET: Record<Variant, true> = { solo: true, dueto: true, quarteto: true };
const MODE_SET: Record<Mode, true> = { diario: true, infinito: true };
const ALL_VARIANTS = Object.keys(VARIANT_SET) as Variant[];
const ALL_MODES = Object.keys(MODE_SET) as Mode[];

const NOTICE_PT_BR =
  'Não foi possível salvar seu progresso neste dispositivo. Você pode continuar jogando, ' +
  'mas o resultado desta partida não será lembrado.';

export interface KeyValueStore {
  /**
   * False once real storage has proven unusable — reads/writes go to memory
   * only. This, not `set`'s return value, is what tells you whether a write
   * will survive a reload.
   */
  readonly isPersistent: boolean;
  /** Set once, only after the full quota-escalation ladder is exhausted. */
  readonly notice: string | null;
  get(key: string): string | null;
  /**
   * Returns `true` when the write landed *somewhere* — real storage or the
   * in-memory fallback — which in this implementation is always. It is not a
   * durability guarantee: a `true` here can still mean the value only lives
   * in memory for the rest of this session. Check `isPersistent` for that.
   */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): readonly string[];
}

function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  // QuotaExceededError is the modern name; the other two are what older
  // Firefox/WebKit used before standardizing on it.
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22
  );
}

function probePersistence(): boolean {
  const canary = '\u0000verbete-storage-probe\u0000';
  try {
    localStorage.setItem(canary, '1');
    localStorage.removeItem(canary);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort: trims the history log to its most recent 50 entries. */
function trimHistory(): void {
  try {
    const raw = localStorage.getItem(historyKey());
    if (raw === null) return;
    const parsed = JSON.parse(raw) as { v?: unknown; data?: unknown };
    if (!Array.isArray(parsed.data)) return;
    localStorage.setItem(historyKey(), JSON.stringify({ v: parsed.v, data: parsed.data.slice(-50) }));
  } catch {
    // Best effort. If even this fails, the retry that follows fails too and
    // the ladder simply moves to the next rung.
  }
}

/** Best-effort: clears every variant's "recently played" list. */
function clearRecent(): void {
  for (const variant of ALL_VARIANTS) {
    try {
      localStorage.removeItem(recentKey(variant));
    } catch {
      // Best effort.
    }
  }
}

/** Best-effort: drops any progress record whose match has already finished. */
function dropFinishedProgress(): void {
  for (const variant of ALL_VARIANTS) {
    for (const mode of ALL_MODES) {
      const key = progressKey(variant, mode);
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        const parsed = JSON.parse(raw) as { data?: { finishedAt?: number | null } };
        if (parsed.data?.finishedAt != null) {
          localStorage.removeItem(key);
        }
      } catch {
        // Best effort.
      }
    }
  }
}

const ESCALATION_STEPS: readonly (() => void)[] = [trimHistory, clearRecent, dropFinishedProgress];

export function createStore(): KeyValueStore {
  let persistent = probePersistence();
  let notice: string | null = null;
  const memory = new Map<string, string>();

  function get(key: string): string | null {
    if (!persistent) return memory.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      // Storage turned hostile after a successful probe (e.g. the browser
      // revoked access mid-session). Degrade silently, same as a failed
      // probe would have.
      persistent = false;
      return memory.get(key) ?? null;
    }
  }

  function writeThrough(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  function set(key: string, value: string): boolean {
    if (!persistent) {
      memory.set(key, value);
      return true;
    }
    try {
      writeThrough(key, value);
      return true;
    } catch (error) {
      if (!isQuotaExceeded(error)) {
        // Not a quota problem (e.g. access revoked mid-session): there is
        // nothing to escalate, storage itself is gone. Degrade immediately.
        persistent = false;
        memory.set(key, value);
        return true;
      }
      for (const relieve of ESCALATION_STEPS) {
        relieve();
        try {
          writeThrough(key, value);
          return true;
        } catch (retryError) {
          if (!isQuotaExceeded(retryError)) break;
          // Still a quota error: move on to the next rung.
        }
      }
      // Every rung tried and failed (or failed for a non-quota reason).
      // Storage is unusable for the rest of this session.
      persistent = false;
      notice = NOTICE_PT_BR;
      memory.set(key, value);
      return true;
    }
  }

  function remove(key: string): void {
    if (!persistent) {
      memory.delete(key);
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      persistent = false;
      memory.delete(key);
    }
  }

  function keys(): readonly string[] {
    if (!persistent) return [...memory.keys()];
    try {
      return Object.keys(localStorage);
    } catch {
      persistent = false;
      return [...memory.keys()];
    }
  }

  return {
    get isPersistent() {
      return persistent;
    },
    get notice() {
      return notice;
    },
    get,
    set,
    remove,
    keys,
  };
}
