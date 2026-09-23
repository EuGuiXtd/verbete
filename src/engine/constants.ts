import type { Mode, Variant } from './types';

export const WORD_LENGTH = 5;
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
