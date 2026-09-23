const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Comparison key: NFD decomposes every diacritic — including the cedilla,
 * which becomes "c" + U+0327 — so one pass strips them all.
 * Use this for anything the game compares. Never for anything it displays.
 */
export function normalize(input: string): string {
  return input.normalize('NFD').replace(COMBINING_MARKS, '').toUpperCase();
}

/**
 * Display/measurement form. Sources and filesystems hand us NFD, where
 * "maçã".length is 6. Recompose before counting letters or storing a word.
 */
export function toNfc(input: string): string {
  return input.normalize('NFC');
}

export function isTypeable(value: string, length: number): boolean {
  return value.length === length && /^[A-Z]+$/.test(value);
}
