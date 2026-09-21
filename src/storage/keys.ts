import type { Mode, Variant } from '../engine/types';

const PREFIX = 'verbete';

export const metaKey = () => `${PREFIX}:meta`;
export const prefsKey = () => `${PREFIX}:prefs`;
export const historyKey = () => `${PREFIX}:history`;
export const recentKey = (variant: Variant) => `${PREFIX}:recent:${variant}`;
export const progressKey = (variant: Variant, mode: Mode) => `${PREFIX}:progress:${variant}:${mode}`;
export const statsKey = (variant: Variant, mode: Mode) => `${PREFIX}:stats:${variant}:${mode}`;
export const corruptKey = (slice: string, stamp: number) => `${PREFIX}:corrupt:${slice}:${stamp}`;
