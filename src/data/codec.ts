const ALPHABET_SIZE = 26;
const CODE_A = 65;
const WORD_LENGTH = 5;

/** Base-26 integer. 26^5 is 11,881,376 — comfortably inside 24 bits. */
export function encodeWord(word: string): number {
  let value = 0;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    value = value * ALPHABET_SIZE + (word.charCodeAt(i) - CODE_A);
  }
  return value;
}

export function decodeWord(value: number): string {
  const letters = new Array<string>(WORD_LENGTH);
  let rest = value;
  for (let i = WORD_LENGTH - 1; i >= 0; i -= 1) {
    letters[i] = String.fromCharCode(CODE_A + (rest % ALPHABET_SIZE));
    rest = Math.floor(rest / ALPHABET_SIZE);
  }
  return letters.join('');
}

/**
 * Sorted integers stored as gaps, each gap as LEB128, the byte stream as
 * base64. Gaps between neighbours in a dense sorted list are small, so most
 * take one or two bytes — which is why this lands near 13 KB gzipped for
 * ten thousand words where a JSON array takes 28 KB.
 */
export function packSortedWords(sortedWords: readonly string[]): string {
  const bytes: number[] = [];
  let previous = 0;
  for (const word of sortedWords) {
    let delta = encodeWord(word) - previous;
    previous += delta;
    while (delta >= 0x80) {
      bytes.push((delta & 0x7f) | 0x80);
      delta >>>= 7;
    }
    bytes.push(delta);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function unpackWords(base64: string, count: number): Int32Array {
  const binary = atob(base64);
  const table = new Int32Array(count);
  let cursor = 0;
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    let delta = 0;
    let shift = 0;
    for (;;) {
      const byte = binary.charCodeAt(cursor);
      cursor += 1;
      delta |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    value += delta;
    table[index] = value;
  }
  return table;
}

export function containsWord(table: Int32Array, word: string): boolean {
  const target = encodeWord(word);
  let low = 0;
  let high = table.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = table[mid]!;
    if (value === target) return true;
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  return false;
}
