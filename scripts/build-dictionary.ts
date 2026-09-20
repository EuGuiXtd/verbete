// Builds the game's two word lists from the raw VERO Hunspell dictionary and
// the raw Portuguese Wiktionary extract:
//
//   - guesses.generated.ts — every accepted five-letter guess, as normalized
//     (accent-free, uppercase) comparison keys, packed with the base-26
//     delta-varint codec.
//   - answers.generated.ts — a small curated pool of five-letter answers, in
//     their accented display form, ranked by real-world frequency and
//     restricted to genuine Wiktionary dictionary head-forms (no
//     conjugations or plurals).
//
// Run with: pnpm dict:build
//
// Pipeline (see .superpowers/sdd/2026-09-20-verbete/task-8-brief.md, as
// amended by the controller after the first version of this pipeline shipped
// a real bug — see "head-form authority" below):
//   1. Expand pt_BR.dic against pt_BR.aff (affix rules) with hunspell-reader.
//   2. Keep forms whose NFC length is exactly five Latin letters.
//   3. Drop tokens that appear only capitalized in the .dic (proper nouns,
//      acronyms) — see the note below on why this heuristic, not DELAF_PB.
//   4. The surviving set, normalized, sorted, deduplicated: the guess list.
//   5. Rank pt_br_50k.txt (frequency list) into a lookup.
//   6. Candidate answers: guess-list words that are genuine Wiktionary
//      head-forms (see loadWiktionaryHeadForms below) AND present in the
//      frequency list, ranked best first, top ANSWER_TARGET.
//   7. Drop NOSUGGEST-flagged words and the manual data/blocklist.txt.
//   8. Resolve normalization collisions: keep the highest-frequency accented
//      form per comparison key.
//   9. Emit both generated files with the VERO licence header from NOTICE.md.
//
// NOTE on step 3: the original design planned to cross-reference the DELAF_PB
// part-of-speech database to strip proper nouns more precisely. That data was
// never acquired (a large academic download, out of scope — see NOTICE.md).
// This build relies solely on the capitalization heuristic below. A manual
// 100-word sample review of the built answer list is the empirical check on
// whether that heuristic is sufficient — see the Task 8 report.
//
// NOTE on step 6, "head-form authority": the first version of this pipeline
// used VERO's own `.dic` structure to decide whether a word was a genuine
// head-form (noun/adjective/adverb/infinitive-verb) versus a derived
// conjugation or plural. That turned out to be the wrong authority: VERO has
// no standalone entry at all for some very common nouns (carro, porta,
// livro, roupa — verified empirically), and separately lists some plurals
// (ouros, olhos, ...) as literal head entries rather than deriving them via
// a suffix rule, so no amount of care reading VERO's structure could recover
// the right answer. The controller's ruling (pulling Task 21's Wiktionary
// extract forward into this task) replaces it: a word is answer-eligible iff
// the Portuguese Wiktionary has a matching entry whose part of speech is
// noun/adjective/adverb/verb and which is not itself a form-of/inflection
// entry. See loadWiktionaryHeadForms and the Task 8 report for the evidence.
//
// The old VERO-`.dic`-based conjugation check is not kept as a pre-filter:
// empirically, every case it caught (e.g. CANTA, a form-of "cantar") is also
// caught by Wiktionary's own form-of tagging, so it added no coverage, and
// dropping it keeps one authority instead of two disagreeing ones.

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { HunspellReader } from 'hunspell-reader';
import { normalize, toNfc } from '../src/engine/normalize';
import { packSortedWords } from '../src/data/codec';
import { DAILY_POOL_SIZE } from '../src/engine/constants';

const RAW_DIR = 'data/raw';
const DIC_PATH = `${RAW_DIR}/pt_BR.dic`;
const AFF_PATH = `${RAW_DIR}/pt_BR.aff`;
const FREQUENCY_PATH = `${RAW_DIR}/pt_br_50k.txt`;
const WIKTIONARY_PATH = `${RAW_DIR}/ptwiktionary.jsonl.gz`;
const BLOCKLIST_PATH = 'data/blocklist.txt';

const WORD_LENGTH = 5;
const WORD_KEY_RE = /^[A-Z]{5}$/;

/**
 * wiktextract part-of-speech values this project treats as citation
 * (head-form) parts of speech: noun, adjective, adverb, infinitive verb.
 * Conjugated verb forms and inflected nouns/adjectives carry these same
 * `pos` values too — they're excluded separately, by `isFormOf` below, not
 * by `pos`.
 */
const ANSWER_ELIGIBLE_POS = new Set(['noun', 'adj', 'adv', 'verb']);

/**
 * How many frequency-ranked, head-form candidates to consider before
 * dropping NOSUGGEST/blocklisted words and resolving normalization
 * collisions. The final answer count is usually a little lower than this —
 * see the measured counts in data/SOURCES.md.
 */
const ANSWER_TARGET = 2400;

const LICENSE_HEADER = `/**
 * GENERATED FILE — produced by \`pnpm dict:build\` (scripts/build-dictionary.ts)
 * from the VERO Hunspell dictionary and affix file for Brazilian Portuguese
 * (data/raw/pt_BR.dic, data/raw/pt_BR.aff), by Raimundo Santos Moura and the
 * LibreOffice pt-BR community. Do not edit by hand — re-run the build.
 *
 * Licence: this derived word list is distributed under the GNU Lesser
 * General Public License version 3 (LGPL-3.0) — the grant common to every
 * downstream reading of VERO's ambiguous upstream licence statement — and
 * additionally under the Mozilla Public License to whatever extent
 * upstream's unversioned MPL grant permits. No specific MPL version is
 * asserted. See NOTICE.md and data/SOURCES.md for full provenance and the
 * four-way licence comparison this relies on.
 */`;

export interface BuildResult {
  /** Normalized (accent-free, uppercase) comparison keys, sorted, deduped. */
  guesses: string[];
  /** Accented display forms, ranked best-first, deduplicated by key. */
  answers: string[];
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Loads data/blocklist.txt into a set of normalized comparison keys. Missing file → empty set. */
async function loadBlocklist(): Promise<Set<string>> {
  const text = await readOptionalFile(BLOCKLIST_PATH);
  const keys = new Set<string>();
  if (text === null) return keys;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0]!.trim();
    if (!line) continue;
    keys.add(normalize(toNfc(line)));
  }
  return keys;
}

/**
 * Reads pt_br_50k.txt into a rank map keyed by the exact accented word text
 * (not the normalized key) — "sabia" and "sábia" are different words that
 * can each have their own frequency rank. The file is pre-sorted by
 * frequency descending, so line order is rank order (0 = most frequent).
 */
async function loadFrequencyRank(): Promise<Map<string, number>> {
  const text = await readFile(FREQUENCY_PATH, 'utf8');
  const rank = new Map<string, number>();
  let index = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const word = toNfc(line.split(/\s+/)[0]!);
    if (!rank.has(word)) rank.set(word, index);
    index += 1;
  }
  return rank;
}

interface WiktionarySense {
  readonly form_of?: readonly unknown[];
  readonly tags?: readonly string[];
}

interface WiktionaryEntry {
  readonly word: string;
  readonly lang_code: string;
  readonly pos: string;
  readonly tags?: readonly string[];
  readonly senses?: readonly WiktionarySense[];
}

/** True for a conjugated/inflected/plural entry — "canta" (verb, form-of "cantar"), "olhos" (noun, form-of "olho"), etc. */
function isFormOf(entry: WiktionaryEntry): boolean {
  if ((entry.tags ?? []).includes('form-of')) return true;
  return (entry.senses ?? []).some((sense) => (sense.form_of?.length ?? 0) > 0);
}

/**
 * True when Wiktionary itself tags this entry (or any of its senses) as a
 * loanword from another language — "Anglicism" is the only such tag this
 * dataset uses at any real scale (verified: 47 entries). This coverage is
 * real but incomplete — "pager" and "remix" are equally obvious English
 * loanwords with no such tag on their entries — so this catches some
 * anglicisms (game, koala, laptop, notebook, reggae, check-up, ...) but not
 * all of them. The remainder needs the manual blocklist; see the Task 8
 * report for why no broader loanword heuristic is used here.
 */
function isTaggedForeignLoanword(entry: WiktionaryEntry): boolean {
  if ((entry.tags ?? []).includes('Anglicism')) return true;
  return (entry.senses ?? []).some((sense) => (sense.tags ?? []).includes('Anglicism'));
}

/**
 * Wiktionary's own markers for a sense nobody would expect a reader to
 * recognize today.
 */
const OBSCURITY_TAGS = new Set(['archaic', 'obsolete', 'rare', 'uncommon', 'dated']);

/**
 * True when EVERY sense of this entry is tagged as archaic/obsolete/rare/
 * uncommon/dated — i.e. Wiktionary itself has no sense of this word it
 * considers to be in current, ordinary use. A word with at least one
 * plain, untagged sense (even alongside other, rarer ones) is not excluded
 * by this check; only found in the Task 8 second sample review — e.g.
 * "later" qualifies only via two verb senses tagged 'obsolete' and
 * 'uncommon' respectively ("estar oculto, viver em latência"; "o mesmo que
 * latejar"), which is exactly the kind of real-but-unrecognizable word this
 * catches. Affects 403 of ~82,900 qualifying entries in this dataset — a
 * narrow, data-grounded cut, not an invented heuristic.
 */
function isEntirelyObscure(entry: WiktionaryEntry): boolean {
  const senses = entry.senses ?? [];
  if (senses.length === 0) return false;
  return senses.every((sense) => (sense.tags ?? []).some((tag) => OBSCURITY_TAGS.has(tag)));
}

/**
 * Loads the set of words with at least one genuine Portuguese Wiktionary
 * head-form entry: `pos` in ANSWER_ELIGIBLE_POS and not a form-of/inflection
 * entry (see isFormOf). This is the answer-eligibility authority (see the
 * "head-form authority" note at the top of this file for why VERO's own
 * structure isn't used for this anymore).
 *
 * Reads data/raw/ptwiktionary.jsonl.gz — the raw wiktextract JSONL for
 * pt.wiktionary.org, one object per line, every language it documents
 * (~330 MB uncompressed) — via a streaming gunzip + line reader, so the
 * full file is never held in memory at once.
 *
 * Matching against VERO-derived candidate words is exact-text (both sides
 * NFC-normalized, case included, not accent-stripped): Wiktionary writes
 * common words lowercase and proper nouns capitalized, same as VERO and
 * standard Portuguese orthography, so requiring an exact match is also what
 * keeps a capitalized-only Wiktionary entry (e.g. "Marte", "Leila" — both
 * confirmed to have no lowercase counterpart in Wiktionary either) from
 * matching a lowercase VERO candidate.
 */
async function loadWiktionaryHeadForms(): Promise<Set<string>> {
  const heads = new Set<string>();
  const input = createReadStream(WIKTIONARY_PATH).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line) continue;
    let entry: WiktionaryEntry;
    try {
      entry = JSON.parse(line) as WiktionaryEntry;
    } catch {
      continue;
    }
    if (entry.lang_code !== 'pt') continue;
    if (!ANSWER_ELIGIBLE_POS.has(entry.pos)) continue;
    if (isFormOf(entry)) continue;
    if (isTaggedForeignLoanword(entry)) continue;
    if (isEntirelyObscure(entry)) continue;
    heads.add(toNfc(entry.word));
  }

  return heads;
}

/** Runs the affix-expansion + filtering pipeline (steps 1–8) and returns the two word lists. */
export async function buildDictionary(): Promise<BuildResult> {
  const reader = await HunspellReader.createFromFiles(AFF_PATH, DIC_PATH);

  const seenKeys = new Set<string>();
  const sawLowercase = new Set<string>();
  const noSuggestWords = new Set<string>();
  // Every lowercase (i.e. not proper-noun-only), accented five-letter
  // surface form VERO's affix expansion produces — conjugations and
  // plurals included. Whether a given form is actually a head-form is no
  // longer decided from this data at all; it's decided by
  // loadWiktionaryHeadForms below. This set only needs to hold candidates
  // worth checking against Wiktionary and the frequency list.
  const candidateWords = new Set<string>();

  for (const affWord of reader.seqAffWords()) {
    const nfc = toNfc(affWord.word);
    if (nfc.length !== WORD_LENGTH) continue;

    const key = normalize(nfc);
    if (!WORD_KEY_RE.test(key)) continue;

    seenKeys.add(key);

    const firstChar = nfc.charAt(0);
    const isCapitalized = firstChar !== firstChar.toLowerCase();
    if (!isCapitalized) {
      sawLowercase.add(key);
      candidateWords.add(nfc);
    }

    if (affWord.flags.isNoSuggest) noSuggestWords.add(nfc);
  }

  // Step 3 + 4: drop keys that never appeared lowercase (proper nouns,
  // acronyms), then sort + dedupe. Sets already dedupe; sort gives the
  // guess list its final, committed order.
  const guesses = [...seenKeys].filter((key) => sawLowercase.has(key)).sort();
  const guessSet = new Set(guesses);

  // Step 5 and the Wiktionary head-form authority, concurrently — two
  // independent file reads.
  const [frequencyRank, wiktionaryHeadForms] = await Promise.all([
    loadFrequencyRank(),
    loadWiktionaryHeadForms(),
  ]);

  // Step 6: guess-list words that are genuine Wiktionary head-forms AND
  // present in the frequency list, ranked best first, top ANSWER_TARGET.
  const ranked = [...candidateWords]
    .filter((word) => guessSet.has(normalize(word)))
    .filter((word) => wiktionaryHeadForms.has(word))
    .filter((word) => frequencyRank.has(word))
    .sort((a, b) => frequencyRank.get(a)! - frequencyRank.get(b)!)
    .slice(0, ANSWER_TARGET);

  // Step 7: drop NOSUGGEST-flagged words and the manual blocklist.
  const blocklist = await loadBlocklist();
  const filtered = ranked.filter(
    (word) => !noSuggestWords.has(word) && !blocklist.has(normalize(word)),
  );

  // Step 8: keep the single highest-frequency accented form per comparison
  // key. `filtered` is already in best-first rank order, so the first
  // occurrence of a key is the one to keep.
  const answersByKey = new Map<string, string>();
  for (const word of filtered) {
    const key = normalize(word);
    if (!answersByKey.has(key)) answersByKey.set(key, word);
  }

  return { guesses, answers: [...answersByKey.values()] };
}

/**
 * These must actually throw and fail the build. The normalization-collision
 * check especially: if two answers share a comparison key, a player types
 * it, wins, and is shown a different word.
 */
export function assertBuildInvariants(guesses: string[], answers: string[]): void {
  const guessSet = new Set(guesses);

  for (const answer of answers) {
    const key = normalize(answer);
    if (!guessSet.has(key)) {
      throw new Error(`answer "${answer}" is not an accepted guess — unplayable`);
    }
    if (!/^[A-Z]{5}$/.test(key)) {
      throw new Error(`answer "${answer}" does not normalize to five letters`);
    }
  }

  const seen = new Map<string, string>();
  for (const answer of answers) {
    const key = normalize(answer);
    const clash = seen.get(key);
    if (clash) {
      throw new Error(
        `answers "${clash}" and "${answer}" share the key ${key}: the player ` +
          `would type it, win, and be shown the other word`,
      );
    }
    seen.set(key, answer);
  }

  if (answers.length < DAILY_POOL_SIZE) {
    throw new Error(`need at least ${DAILY_POOL_SIZE} answers, got ${answers.length}`);
  }
}

function renderGuessesSource(guesses: readonly string[]): string {
  const b64 = packSortedWords(guesses);
  return `${LICENSE_HEADER}

export const GUESSES_B64 = ${JSON.stringify(b64)};
export const GUESSES_COUNT = ${guesses.length};
`;
}

function renderAnswersSource(answers: readonly string[]): string {
  const entries = answers.map((word) => `  ${JSON.stringify(word)},`).join('\n');
  return `${LICENSE_HEADER}
//
// Ranked by real-world frequency using a build-time-only frequency list
// (hermitdave/FrequencyWords, CC BY-SA 4.0) that is never itself
// redistributed — see data/SOURCES.md. Restricted to genuine Portuguese
// Wiktionary head-forms (noun/adjective/adverb/infinitive-verb, not a
// form-of/inflection entry): no conjugations or plurals ship as answers,
// only as accepted guesses. The Wiktionary extract used to decide this is
// also build-time-only for this file's purposes (no Wiktionary text is
// embedded below, only word strings) — see data/SOURCES.md.

export const ANSWERS: readonly string[] = [
${entries}
];
`;
}

/** Writes both generated files into `dir`. Exported so dict:check can reuse it against a temp dir. */
export async function writeGeneratedFiles(
  dir: string,
  guesses: readonly string[],
  answers: readonly string[],
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/guesses.generated.ts`, renderGuessesSource(guesses), 'utf8');
  await writeFile(`${dir}/answers.generated.ts`, renderAnswersSource(answers), 'utf8');
}

async function main(): Promise<void> {
  const { guesses, answers } = await buildDictionary();
  assertBuildInvariants(guesses, answers);
  await writeGeneratedFiles('src/data', guesses, answers);
  console.log(`guesses: ${guesses.length}`);
  console.log(`answers: ${answers.length}`);
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('build-dictionary.ts');
if (isMain) {
  await main();
}
