import { useEffect, useState } from 'react';
import { loadDefinition, parseDefinition } from '../data/definitions';
import type { ParsedDefinition } from '../data/definitions';

export interface DefinitionState {
  /** null while loading, or once settled, for a word with no generated definition. */
  readonly definition: ParsedDefinition | null;
  /** True only while the current `word`'s lookup is in flight. */
  readonly isLoading: boolean;
}

/**
 * Loads `word`'s dictionary definition — via `loadDefinition`'s dynamic
 * import, so nothing here pulls the definitions chunk in before a match
 * actually finishes — and keeps it parsed into abbreviation + gloss for
 * display. `word` is expected to be a finished board's own answer (or
 * `null` while no board has been solved/finished yet, e.g. a still-playing
 * match, or a board a lost multi-board match never reached).
 *
 * A change to `word` before the previous lookup resolves discards that
 * stale result rather than letting it land after the fact: `ResultModal`
 * can show one entry per board, each with its own `useDefinition(word)`
 * call, and a fast unmount/remount (switching modes right after a match
 * ends, say) must never let an old board's definition flash onto a new one.
 */
export function useDefinition(word: string | null): DefinitionState {
  const [definition, setDefinition] = useState<ParsedDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(word !== null);

  useEffect(() => {
    if (word === null) {
      setDefinition(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setDefinition(null);
    setIsLoading(true);

    loadDefinition(word)
      .then((raw) => {
        if (cancelled) return;
        setDefinition(raw !== null ? parseDefinition(raw) : null);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDefinition(null);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [word]);

  return { definition, isLoading };
}
