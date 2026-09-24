import type { Mode, Variant } from './types';

export const WORD_LENGTH = 5;

/**
 * What a `MatchState.draft` holds in a slot the player has not filled.
 *
 * Feedback round 1, item 3 ("tinha que dar para selecionar em qual bloco da
 * palavra você quer inserir a letra") turned the draft from a string that
 * GROWS from the left into a fixed board of `WORD_LENGTH` houses that can be
 * filled in any order, which means it needs a way to say "this house is
 * empty" in the middle of a word. A space is the sentinel because the only
 * characters that ever reach a draft slot otherwise are A–Z (see
 * engine/keyboard.ts's `KEY_ROWS` and usePhysicalKeyboard's letter filter),
 * so it can never collide with real input, it survives a JSON round trip to
 * the browser's own storage unchanged, and a stored draft stays readable to
 * a human debugging one by eye.
 *
 * A COMPLETE draft never contains it — which is exactly what `submit` checks
 * instead of the old `length !== WORD_LENGTH` — so nothing downstream of
 * submission (the guess list, scoring, the dictionary lookup, the share
 * grid) ever sees a sentinel.
 */
export const EMPTY_SLOT = ' ';
export const TIME_ZONE = 'America/Sao_Paulo';

/** Day 0 of the daily deck. Changing this renumbers every past puzzle. */
export const EPOCH_DAY_KEY = '2026-01-01';

export const VARIANTS: Record<Variant, { boards: number; attempts: number }> = {
  solo: { boards: 1, attempts: 6 },
  dueto: { boards: 2, attempts: 7 },
  quarteto: { boards: 4, attempts: 9 },
};

export const VARIANT_ORDER: readonly Variant[] = ['solo', 'dueto', 'quarteto'];

/**
 * Size of the slice of ANSWERS the daily deck permutes. FROZEN.
 * The deck shuffles indices 0..DAILY_POOL_SIZE-1, so changing this renumbers
 * every future daily word. New answers append past this index and serve
 * infinite mode only.
 */
export const DAILY_POOL_SIZE = 1500;

export const MODES: readonly Mode[] = ['diario', 'infinito'];

export const VARIANT_LABEL: Record<Variant, string> = {
  solo: 'Solo',
  dueto: 'Dueto',
  quarteto: 'Quarteto',
};

export const MODE_LABEL: Record<Mode, string> = {
  diario: 'Diário',
  infinito: 'Infinito',
};
