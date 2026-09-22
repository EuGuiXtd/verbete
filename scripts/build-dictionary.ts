// Builds the game's word lists and definitions from the raw VERO Hunspell
// dictionary and the raw Portuguese Wiktionary extract:
//
//   - guesses.generated.ts — every accepted five-letter guess, as normalized
//     (accent-free, uppercase) comparison keys, packed with the base-26
//     delta-varint codec.
//   - answers.generated.ts — a small curated pool of five-letter answers, in
//     their accented display form, ranked by real-world frequency and
//     restricted to genuine Wiktionary dictionary head-forms (no
//     conjugations or plurals).
//   - definitions.generated.json (Task 21) — one short, single-sense
//     definition for EVERY answer, sourced from the same Wiktionary extract
//     used above to decide answer eligibility. Each value is
//     `"<pos abbrev> <gloss>"` (e.g. `"s.f. planta ornamental..."`),
//     never the bare gloss alone, so the result screen can show a real
//     part-of-speech abbreviation without a second generated file. A word
//     with no usable gloss (none found, or every candidate would spoil the
//     answer even after redaction — see buildDefinition below) is dropped
//     from answers.generated.ts too: every match ends by revealing the
//     answer's definition, so an answer with nothing to reveal is not an
//     answer. It stays a perfectly valid GUESS. assertBuildInvariants makes
//     this an invariant the build and `pnpm dict:verify` both enforce, which
//     matters because DAILY_POOL_SIZE and EPOCH_DAY_KEY are frozen: a
//     regression here could not be corrected later without renumbering every
//     past puzzle. This is a CC BY-SA 4.0
//     adaptation of Wikcionário content: one sense selected per word, out of
//     however many that entry has, and shortened to fit the result screen —
//     see NOTICE.md for the licence block this ships under, and the UI's
//     link to https://pt.wiktionary.org/wiki/<word>, which is also how this
//     satisfies CC BY-SA's attribution requirement.
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
//   9. Build one definition per surviving candidate and drop the candidates
//      that have none — see buildDefinition and assertBuildInvariants.
//  10. Emit both generated files with the VERO licence header from NOTICE.md.
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
  /** Accented answer -> "<pos abbrev> <gloss>". Keyed by exactly `answers`: every answer has one. See buildDefinitions. */
  definitions: Record<string, string>;
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

export interface WiktionarySense {
  readonly form_of?: readonly unknown[];
  readonly tags?: readonly string[];
  /** Sense definitions, core text first — see buildDefinition below. */
  readonly glosses?: readonly string[];
}

export interface WiktionaryEntry {
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
 * Glosses that ARE an inflection statement rather than a definition:
 * "plural de moça", "feminino de magro", "particípio passado do verbo usar",
 * "segunda pessoa do singular do presente do indicativo do verbo rodar".
 *
 * Anchored at the start of the gloss and required of EVERY sense of the
 * entry (see isInflectionOnlyEntry) — the two properties that make this
 * safe. Task 8 considered and rejected a "does the gloss start with 'plural
 * de'" fallback (see data/blocklist.txt's note on `anões`/`redes`) because
 * an unanchored, any-sense version produces false positives on ordinary
 * prose ("arte: forma de expressão subjetiva…") and would drop genuinely
 * independent headwords like "atriz" and "melhor". This version cannot: a
 * word only loses its entry when Wiktionary offers nothing but the
 * inflection statement itself, and "forma de" alone is deliberately NOT a
 * pattern here — only the grammatically-specific "forma feminina/masculina/
 * plural/verbal de". Measured effect on the real dataset is recorded in the
 * final-review-fixes report.
 */
const INFLECTION_GLOSS_RE =
  /^(?:plural|singular|feminino|masculino|diminutivo|aumentativo|superlativo|comparativo|particípio|gerúndio|infinitivo|(?:primeira|segunda|terceira) pessoa|forma (?:feminina|masculina|plural|verbal|conjugada)|flexão|conjugação)\b/i;

/**
 * True when every sense of this entry is an inflection statement — the
 * untagged twin of isFormOf, for the entries where wiktextract carries no
 * structured `form_of`/`form-of` marking at all and the only evidence is the
 * gloss text. This is cause #1 of the C1 finding: `lados`, `graus`, `moças`,
 * `moços`, `rodas`, `calos`, `magra`, `digna`, `meiga` and `usado` all
 * reached ANSWERS as "head-forms" whose sole Wiktionary sense reads
 * "plural de lado" / "feminino de magro" / "particípio passado do verbo
 * usar".
 */
function isInflectionOnlyEntry(entry: WiktionaryEntry): boolean {
  const senses = entry.senses ?? [];
  if (senses.length === 0) return false;
  return senses.every((sense) => {
    const gloss = collapseWhitespace(sense.glosses?.[0] ?? '');
    return gloss !== '' && INFLECTION_GLOSS_RE.test(gloss);
  });
}

/**
 * Loads every genuine Portuguese Wiktionary head-form entry — `pos` in
 * ANSWER_ELIGIBLE_POS and not a form-of/inflection entry (see isFormOf and
 * isInflectionOnlyEntry) —
 * keyed by word, in file order, with every qualifying entry kept (a word can
 * have more than one, e.g. both a noun and a verb reading). The *set* of
 * keys is the answer-eligibility authority (see the "head-form authority"
 * note at the top of this file for why VERO's own structure isn't used for
 * this anymore); the entries themselves are also what Task 21's
 * `buildDefinition` below sources a gloss from — deliberately the same
 * entries that made the word eligible in the first place, not just any
 * Wiktionary entry for that spelling, so a definition never comes from an
 * obscure or foreign-loanword sense the answer list itself rejected.
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
async function loadEligibleWiktionaryEntries(): Promise<Map<string, WiktionaryEntry[]>> {
  const entries = new Map<string, WiktionaryEntry[]>();
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
    if (isInflectionOnlyEntry(entry)) continue;
    if (isTaggedForeignLoanword(entry)) continue;
    if (isEntirelyObscure(entry)) continue;

    const word = toNfc(entry.word);
    const existing = entries.get(word);
    if (existing) {
      existing.push(entry);
    } else {
      entries.set(word, [entry]);
    }
  }

  return entries;
}

// --- Task 21: definitions ------------------------------------------------

/** Truncation target for a gloss, before the part-of-speech prefix is added. */
const MAX_GLOSS_LENGTH = 90;

/** Collapses Wiktionary's internal whitespace/newlines to single spaces and trims the ends. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Cuts `text` to at most `maxLength` characters, backing up to the last
 * space so a word is never sliced in half, and marks the cut with an
 * ellipsis. Text already within the budget is returned unchanged (no
 * trailing ellipsis on a gloss that was never truncated).
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
  return `${cut}…`;
}

/**
 * The gender/class abbreviation the result screen prefixes a definition
 * with — "s.m." the way a paper dictionary would head "casa", not a bare
 * gloss with no grammatical marker. Wiktionary tags noun gender on the entry
 * itself (`tags: ["masculine"]` / `["feminine"]`, occasionally both for a
 * two-gender noun); a noun entry with neither tag falls back to the bare
 * "s." rather than guessing.
 */
function posAbbreviation(entry: WiktionaryEntry): string {
  const tags = entry.tags ?? [];
  switch (entry.pos) {
    case 'noun': {
      const masculine = tags.includes('masculine');
      const feminine = tags.includes('feminine');
      if (masculine && feminine) return 's.2g.';
      if (feminine) return 's.f.';
      if (masculine) return 's.m.';
      return 's.';
    }
    case 'adj':
      return 'adj.';
    case 'adv':
      return 'adv.';
    case 'verb':
      return 'v.';
    default:
      return '';
  }
}

/**
 * The first three normalized letters of `word` — the substring shared with
 * its derivational relatives, not just its own literal spelling.
 *
 * Shortened from 4 to 3 after review: a 4-letter stem is blind to a
 * derivational relative one letter shorter than the answer itself —
 * "socar" (stem "SOCA") was defined by Wiktionary's own first sense as
 * "dar socos em" ("socos" shares only "SOC" with the stem, not all four
 * letters), which sailed past the 4-letter check and handed a Portuguese
 * speaker the answer outright. Measured against the real, final answer
 * list (see this task's report for the full comparison): a 3-letter
 * substring check catches this and every case the 4-letter check already
 * caught, at a coverage cost of 3.7 points (95.0% -> 91.3% of answers
 * getting a definition at all) — comfortably clear of the ~85% floor below
 * which the trade would need to be made deliberately rather than shipped.
 * A token-aligned "shared prefix with a whole gloss word" rule was also
 * measured and rejected: it scored marginally higher coverage (91.8%) but
 * is NOT a superset of this check's rejections — it missed real cases in
 * this exact dataset where the stem appears right after an unrelated
 * word's own leading letters (e.g. "aos DEMAIS" contains "MAI", the stem of
 * "maior", but "demais" itself doesn't start with it), which is
 * structurally the same shape of miss as a "re-"/"des-"-prefixed
 * derivational relative would produce. A plain substring check has no such
 * blind spot: if the stem appears anywhere in the definition, at any
 * boundary, it is rejected. Going shorter than 3 (measured: 2) drops
 * coverage to 84.8%, under the floor, for negligible additional safety —
 * not worth it.
 */
function definitionStem(word: string): string {
  return normalize(word).slice(0, 3);
}

/** True if `definition` contains `word`'s own stem — see assertDefinitionDoesNotSpoil. */
function spoilsAnswer(word: string, definition: string): boolean {
  return normalize(definition).includes(definitionStem(word));
}

/**
 * The mark a redacted word is replaced with. An em dash is what a printed
 * dictionary prints in place of the headword inside its own entry, so this
 * reads as typography rather than as damage.
 */
const REDACTION = '—';

/** A word of the gloss, hyphens and apostrophes included so "longa-metragem" redacts as one token. */
const GLOSS_WORD_RE = /\p{L}[\p{L}\p{M}'’-]*/gu;

/**
 * Replaces every word of `gloss` that carries `word`'s stem with REDACTION.
 *
 * This is the answer to the C1 review finding that spoilsAnswer rejected
 * *every* gloss for common headwords whose definitions naturally restate the
 * word — "saber": "conhecimento; aquilo que se sabe"; "votar": "aprovar ou
 * eleger por meio de voto"; "poeta": "quem se dedica à poesia…". Dropping
 * those words is the wrong trade: they are exactly the answers a player is
 * most pleased to land on. Redacting the offending word keeps the gloss and
 * keeps the guarantee, because the shipped string no longer contains the
 * stem at all — assertDefinitionDoesNotSpoil still runs over the redacted
 * result and still throws if anything slips through.
 *
 * Whole words are redacted, never the bare three letters: "—ar" would leak
 * the rest of "votar". The cost is over-redaction where the stem lands
 * mid-word in an unrelated term ("mais" carries "maior"'s stem MAI), which
 * is the same false positive the plain-substring rule already accepts in
 * exchange for having no blind spot — see definitionStem.
 */
function redactSpoilers(word: string, gloss: string): string {
  const stem = definitionStem(word);
  return gloss.replace(GLOSS_WORD_RE, (token) =>
    normalize(token).includes(stem) ? REDACTION : token,
  );
}

/**
 * Words that carry no information once the headword beside them is redacted.
 * "o mesmo que —", "plural de —", "forma reduzida de —" survive a bare word
 * count but tell the player nothing, so they must not be shipped as the
 * reward the whole game builds to.
 */
const EMPTY_GLOSS_WORDS = new Set([
  'mesmo',
  'mesma',
  'forma',
  'formas',
  'plural',
  'singular',
  'feminino',
  'feminina',
  'masculino',
  'masculina',
  'variante',
  'grafia',
  'reduzida',
  'abreviada',
  'regressiva',
  'particípio',
  'pessoa',
  'verbo',
  'indicativo',
  'subjuntivo',
  'sinônimo',
  'diminutivo',
  'aumentativo',
]);

/**
 * How many real content words a redacted gloss must still carry to be worth
 * showing. Two, measured against this dataset: "conhecimento; aquilo que se
 * —" (saber) has exactly two and is a usable definition, while "o mesmo que
 * —" (bônus), "ver —" (crack) and "plural de —" (lados) have zero and are
 * not. A content word is four letters or more, is not the redaction mark,
 * and is not in EMPTY_GLOSS_WORDS.
 */
const MIN_CONTENT_WORDS = 2;

/**
 * How many redactions a gloss may carry before it stops being a definition
 * and starts being a puzzle. Measured on this dataset: exactly two glosses
 * exceed it — "fruta gerada pela —, — ou —, (Corylus —)" (avelã) and
 * "pessoa viciada em — alcoólica ou com intoxicação alcoólica; —, —" (bebum)
 * — and neither is worth showing a player.
 */
const MAX_REDACTIONS = 2;

function countOccurrences(text: string, mark: string): number {
  return text.split(mark).length - 1;
}

function contentWordCount(gloss: string): number {
  return (gloss.match(GLOSS_WORD_RE) ?? []).filter(
    (token) => token.length >= 4 && !EMPTY_GLOSS_WORDS.has(token.toLowerCase()),
  ).length;
}

/**
 * The hard gate: throws — never warns — if `definition` would spoil `word`.
 * Wiktionary defines "casar" (a real answer — see src/data/answers.generated.ts)
 * with a first sense of "ato de unir por casamento...", which contains
 * "casa" and would hand the player the answer inside its own reward. Called
 * unconditionally over every entry actually written to
 * definitions.generated.json (see buildDefinitions' caller in main()) as a
 * safety net — buildDefinition below already skips a spoiling candidate
 * sense in favour of the next one, so this should never actually fire in
 * practice, but a future change to that selection logic that reintroduces a
 * spoiler must fail the build, not ship it with a warning nobody reads.
 */
export function assertDefinitionDoesNotSpoil(word: string, definition: string): void {
  if (spoilsAnswer(word, definition)) {
    throw new Error(
      `definition of "${word}" contains its own stem and would spoil the answer: ${definition}`,
    );
  }
}

/**
 * Picks the first sense, across `entries` in file order, whose first gloss
 * is non-empty and does not spoil `word` (see spoilsAnswer) — "casar"'s own
 * first sense is skipped this way in favour of its second ("ligar; juntar;
 * unir"), rather than failing the whole word.
 *
 * Two passes, in quality order:
 *
 *   1. A gloss that never mentions the word at all. Always preferred: it
 *      reads exactly as Wiktionary wrote it.
 *   2. Failing that, the first gloss that survives redaction (see
 *      redactSpoilers) with MIN_CONTENT_WORDS real words still standing.
 *      Before this pass existed, 140 of the 141 gloss-less answers the C1
 *      review measured were here — common headwords like "saber", "votar",
 *      "reino" and "poeta" whose every sense restates them, which is what
 *      Portuguese dictionary glosses do.
 *
 * Returns null when nothing survives either pass. With the daily-pool
 * invariant in assertBuildInvariants that now means the word does not ship
 * as an answer at all (it stays a valid guess) — see buildDictionary.
 */
export function buildDefinition(word: string, entries: readonly WiktionaryEntry[]): string | null {
  const withAbbrev = (entry: WiktionaryEntry, gloss: string): string => {
    const abbrev = posAbbreviation(entry);
    return abbrev === '' ? gloss : `${abbrev} ${gloss}`;
  };

  for (const entry of entries) {
    for (const sense of entry.senses ?? []) {
      const gloss = truncateAtWordBoundary(
        collapseWhitespace(sense.glosses?.[0] ?? ''),
        MAX_GLOSS_LENGTH,
      );
      if (gloss === '') continue;
      if (spoilsAnswer(word, gloss)) continue;
      return withAbbrev(entry, gloss);
    }
  }

  for (const entry of entries) {
    for (const sense of entry.senses ?? []) {
      const collapsed = collapseWhitespace(sense.glosses?.[0] ?? '');
      if (collapsed === '') continue;
      const redacted = truncateAtWordBoundary(
        redactSpoilers(word, collapsed),
        MAX_GLOSS_LENGTH,
      );
      // Belt and braces: truncation cannot reintroduce the stem, but a
      // future change to either step must not be able to either.
      if (spoilsAnswer(word, redacted)) continue;
      if (contentWordCount(redacted) < MIN_CONTENT_WORDS) continue;
      if (countOccurrences(redacted, REDACTION) > MAX_REDACTIONS) continue;
      return withAbbrev(entry, redacted);
    }
  }

  return null;
}

/** Builds the final word -> "<abbrev> <gloss>" map, in `answers`' own order, for every answer with a usable gloss. */
function buildDefinitions(
  answers: readonly string[],
  wiktionaryEntries: ReadonlyMap<string, WiktionaryEntry[]>,
): Record<string, string> {
  const definitions: Record<string, string> = {};
  for (const answer of answers) {
    const entries = wiktionaryEntries.get(answer);
    if (!entries) continue;
    const definition = buildDefinition(answer, entries);
    if (definition !== null) definitions[answer] = definition;
  }
  return definitions;
}

/** Runs assertDefinitionDoesNotSpoil over every entry actually being shipped. Must throw, not warn — see that function's doc comment. */
export function assertDefinitionsDoNotSpoil(definitions: Readonly<Record<string, string>>): void {
  for (const [word, definition] of Object.entries(definitions)) {
    assertDefinitionDoesNotSpoil(word, definition);
  }
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
  const [frequencyRank, wiktionaryEntries] = await Promise.all([
    loadFrequencyRank(),
    loadEligibleWiktionaryEntries(),
  ]);

  // Step 6: guess-list words that are genuine Wiktionary head-forms AND
  // present in the frequency list, ranked best first, top ANSWER_TARGET.
  const ranked = [...candidateWords]
    .filter((word) => guessSet.has(normalize(word)))
    .filter((word) => wiktionaryEntries.has(word))
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

  const deduped = [...answersByKey.values()];
  // Task 21: one short definition per answer that has a usable, non-spoiling
  // gloss, sourced from the very same eligible entries decided step 6's
  // membership above — see buildDefinitions and its doc comments.
  const definitions = buildDefinitions(deduped, wiktionaryEntries);

  // Step 9 (C1): an answer with no definition reveals nothing, and the
  // reveal is the whole point of the game — so it is not an answer. Dropping
  // it here rather than only filtering the daily pool means infinite mode
  // gets the same guarantee, and it keeps a single invariant the build and
  // `pnpm dict:verify` can both state in one line: every answer has a
  // definition. The word remains a perfectly valid GUESS — the guess list
  // above is untouched by this.
  const answers = deduped.filter((word) => definitions[word] !== undefined);

  return { guesses, answers, definitions };
}

/**
 * These must actually throw and fail the build. The normalization-collision
 * check especially: if two answers share a comparison key, a player types
 * it, wins, and is shown a different word.
 *
 * `definitions` is the third invariant's subject (C1): every shipped answer
 * must have one. It is optional only so a caller measuring the word lists
 * alone can still use the first two checks; both real callers
 * (`pnpm dict:build` and `pnpm dict:verify`) pass it.
 */
export function assertBuildInvariants(
  guesses: string[],
  answers: string[],
  definitions?: Readonly<Record<string, string>>,
): void {
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

  if (definitions !== undefined) {
    // C1's invariant. Every match ends by revealing the answer's real
    // dictionary definition — that reveal is the point of the entire game,
    // so an answer with nothing to reveal is a bug, not a rough edge. This
    // has to be an invariant rather than a one-off list edit because
    // DAILY_POOL_SIZE and EPOCH_DAY_KEY are frozen: once the first player
    // has played, dropping a word from the pool renumbers every past puzzle,
    // so a regression here can never be corrected the way this one was.
    const glossless = answers.filter((answer) => definitions[answer] === undefined);
    if (glossless.length > 0) {
      throw new Error(
        `${glossless.length} answer(s) have no definition and would reveal nothing: ` +
          `${glossless.slice(0, 10).join(', ')}${glossless.length > 10 ? ', …' : ''}`,
      );
    }
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

/**
 * A deterministic fingerprint of the exact, ordered `ANSWERS` array —
 * FNV-1a 32-bit over the words joined by a separator no five-letter answer
 * can contain, mirroring `computeAnswersHash` in src/storage/schema.ts (kept
 * as a separate implementation rather than imported, since this script has
 * no dependency on src/storage/).
 *
 * This is the "version the generated data" half of Task 24's PWA defence:
 * `computeAnswersHash` already stops a resumed DAILY match from scoring
 * against a word list that moved out from under it on the SAME device, but
 * it says nothing about a player on a STALE service worker computing that
 * day's word from an OLD `ANSWERS` array while everyone else's fresh client
 * computes it from the new one — there is no backend here to compare
 * against and catch that live. `DICTIONARY_VERSION` is the fingerprint that
 * makes such a mismatch detectable after the fact (see `HistoryEntry` in
 * src/storage/schema.ts, which stamps every finished match with the
 * dictionary version that produced it) rather than two players silently
 * disagreeing about "today's word" with no way to tell why.
 */
function hashAnswers(answers: readonly string[]): string {
  const input = answers.join('\u0000');
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
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

// See hashAnswers's doc comment in scripts/build-dictionary.ts.
export const DICTIONARY_VERSION = ${JSON.stringify(hashAnswers(answers))};
`;
}

/**
 * definitions.generated.json is plain JSON — dynamically imported at
 * runtime by src/data/definitions.ts, so it cannot carry a JS comment header
 * the way the two `.ts` files above do. Its CC BY-SA 4.0 provenance and
 * adaptation note live in NOTICE.md and in this script's own top-of-file
 * comment instead; the in-app link to https://pt.wiktionary.org/wiki/<word>
 * (src/ui/modals/ResultModal.tsx) is what satisfies attribution for a player
 * actually looking at the data, per CC BY-SA 4.0's own preferred practice.
 */
function renderDefinitionsSource(definitions: Readonly<Record<string, string>>): string {
  return JSON.stringify(definitions);
}

/** Writes every generated file into `dir`. Exported so dict:check can reuse it against a temp dir. */
export async function writeGeneratedFiles(
  dir: string,
  guesses: readonly string[],
  answers: readonly string[],
  definitions: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/guesses.generated.ts`, renderGuessesSource(guesses), 'utf8');
  await writeFile(`${dir}/answers.generated.ts`, renderAnswersSource(answers), 'utf8');
  await writeFile(`${dir}/definitions.generated.json`, renderDefinitionsSource(definitions), 'utf8');
}

async function main(): Promise<void> {
  const { guesses, answers, definitions } = await buildDictionary();
  assertBuildInvariants(guesses, answers, definitions);
  assertDefinitionsDoNotSpoil(definitions);
  await writeGeneratedFiles('src/data', guesses, answers, definitions);
  console.log(`guesses: ${guesses.length}`);
  console.log(`answers: ${answers.length}`);
  console.log(`definitions: ${Object.keys(definitions).length} (${(Object.keys(definitions).length / answers.length * 100).toFixed(1)}% of answers)`);
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('build-dictionary.ts');
if (isMain) {
  await main();
}
