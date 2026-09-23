# Data sources

This file records provenance for every raw linguistic source the project's word lists are
derived from: what it is, where it came from, under what licence, and — the fact that actually
governs what ships in the built artifact — whether it is **redistributed** (its terms travel
with the generated word-list files) or **build-time only** (used to produce those files but
never itself embedded in the bundle).

Raw files live in `data/raw/` and are gitignored (see `.gitignore`). They are re-downloadable
inputs, not generated output. Fetch them with `pnpm run sources:fetch`
(`scripts/fetch-sources.ts`), which is idempotent — it skips any file already present.

## VERO Portuguese dictionary (`pt_BR.dic`, `pt_BR.aff`)

- **Name:** VERO — Verificador Ortográfico Livre (Hunspell dictionary and affix file for
  Brazilian Portuguese)
- **Author / credit:** Raimundo Santos Moura and the LibreOffice pt-BR community
- **URLs:**
  - `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.dic`
  - `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.aff`
- **Download date:** 2026-09-20
- **Measured size:** `pt_BR.dic` 4,477,695 bytes; `pt_BR.aff` 979,792 bytes
- **Used for:** source word list for the game's dictionary — every valid five-letter answer and
  guess is derived from this data (affix expansion, then filtering to five-letter forms; see
  Task 8).
- **Redistribution status: REDISTRIBUTED.** The word-list files generated from this data ship in
  the built game bundle.

### Licence

Upstream's licensing statement for this data is genuinely ambiguous, and downstream packagers
who redistribute the same data disagree with each other about what it resolves to. Rather than
pick one reading, this project quotes all four statements found and states below what it relies
on.

1. **Upstream itself** — the `pt_BR.aff` header (the file as downloaded, lines 5–14) and the
   accompanying README in the same repository state, verbatim (Portuguese, with an English
   translation in the same file):
   > "Este programa é livre e pode ser redistribuído e/ou modificado nos termos Licença Pública
   > Geral Menor versão 3 (LGPLv3), como publicado pela Free Software Foundation e pela Mozilla
   > Public License como publicado pela Mozilla Foundation."
   >
   > ("This program is free and can be redistributed and/or modified under the terms of the GNU
   > Lesser General Public License version 3 (LGPLv3), as published by the Free Software
   > Foundation, and the Mozilla Public License, as published by the Mozilla Foundation.")

   Seen at `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.aff`
   and `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/README_en.txt`,
   2026-09-20. No MPL version number is given anywhere in this repository (checked `pt_BR.aff`,
   `README_en.txt`, `README_pt_BR.txt`, `description.xml`; there is no separate `LICENSE` file in
   `pt_BR/` or at the repository root), and the conjunction used is "and", not "or".

2. **Debian**'s `myspell-pt-br` package copyright file, a legal review Debian maintainers
   produced for the same upstream VERO dictionary, states:
   > `License: LGPL-2.1+` (no mention of MPL)

   Seen at `https://sources.debian.org/data/main/m/myspell-pt-br/20131030-19/debian/copyright`,
   2026-09-20.

3. **wooorm/dictionaries**, an actively-maintained npm package bundling the same
   LibreOffice/VERO source, declares in its `package.json` `license` field for `dictionary-pt`:
   > `(LGPL-3.0 OR MPL-2.0)`

   Seen via the npm registry, `https://registry.npmjs.org/dictionary-pt/latest`, 2026-09-20.

4. **Fedora**'s `hunspell-pt-BR` package page states:
   > "License(s): (LGPL-3.0-only OR MPL-1.1) AND (GPL-2.0-only OR LGPL-2.1-only OR MPL-1.1)"

   Seen at `https://packages.fedoraproject.org/pkgs/hunspell-pt/hunspell-pt-BR/`, 2026-09-20.
   This is a compound SPDX expression with two `AND`-joined clauses. The leading
   `(LGPL-3.0-only OR MPL-1.1)` clause is the one to read: it is the only clause of the two that
   matches the LGPL/MPL pattern the other three readings above share, and is treated here as
   Fedora's reading of the same dictionary/affix data this project uses.

**What this project relies on:** the project treats this data, and the word lists derived from
it, as licensed under **LGPL-3.0**, the grant common to all four readings above, and
additionally under the **Mozilla Public License** to whatever extent upstream's own unversioned
MPL grant permits. No specific MPL version is asserted.

**Obligation owed, and where it is discharged.** This is the one grant on this page that is
copyleft and *conveyed*: LGPLv3 section 4, through the GPLv3 section 4 it incorporates, requires
a copy of the licence to travel with the work. Recording it in this file does not satisfy it —
nobody playing the game reads this file. `public/licenses/LGPL-3.0.txt` and
`public/licenses/GPL-3.0.txt` ship as real files, are linked from the in-app "Sobre as palavras e
definições" screen, and are in the service worker precache, so the installed offline copy carries
them. This obligation was missing from both this document and the product until the final
whole-branch review (I2) — the OFL's five conditions were enumerated in detail below while the
LGPL grant chosen above was never asked the same question.

### Task 8 measured build results

The plan's spec guessed 8,000–15,000 guesses and 1,500–3,000 answers. Those were hypotheses;
these are the measured numbers from actually running the pipeline in
`scripts/build-dictionary.ts` against the raw sources (affix-expanded via `hunspell-reader`,
not `unmunch`).

- **Guess list: 18,216** five-letter comparison keys (normalized: accent-free, uppercase),
  after affix expansion, NFC length filtering, and dropping tokens that appear only capitalized
  in `pt_BR.dic` (the proper-noun/acronym heuristic — see NOTICE.md and the Task 8 report for the
  sample review of it). This overshoots the plan's 8k–15k estimate by about 20%. Before
  concluding the five-letter filter needs tightening, the controller confirmed the overshoot is
  mostly real five-letter Portuguese words (VERO's full affix expansion produces 19,603 raw
  five-letter alphabetic forms, of which only 1,387 are dropped as capitalized-only), accepted
  18,216 as-is, and asked for no further tightening. Raw generated file: 30,653 bytes; **gzip -9:
  18,155 bytes**.

- **Answer list: 1,554**, ranked by frequency, restricted to genuine head-forms per the
  Portuguese Wiktionary (see below), NOSUGGEST/blocklist-filtered, collision-resolved, and
  finally restricted to words that actually have a definition (see "Final-review revision"
  below) — above the 1,500-word `DAILY_POOL_SIZE` floor, with 54 words of headroom. Raw
  generated file: 18,905 bytes; **gzip -9: 6,338 bytes**. (Before the final-review revision this
  list held 1,617 words, 141 of which revealed nothing at the end of a match.)

  This required a controller-ruled change mid-task: the first version of this pipeline used
  VERO's own `.dic` structure to decide "is this a genuine head-form (not a conjugation or
  plural)," which produced only 1,217–1,432 candidates — short of the 1,500 floor — because VERO
  itself has no standalone entry for some very common nouns (`carro`, `porta`, `livro`, `roupa`
  — verified empirically) and separately lists some plurals as literal head entries. The
  controller ruled that the raw Portuguese Wiktionary extract (`ptwiktionary.jsonl.gz`, pulled
  forward from Task 21) becomes the head-form authority instead: a word is answer-eligible iff
  Wiktionary has a matching entry whose part of speech is noun/adjective/adverb/verb and which
  is not itself a form-of/inflection entry. This fixed the volume problem (`carro`-class nouns
  have real Wiktionary entries) and, as a side effect, gave a much stronger, machine-checkable
  signal against proper nouns and plurals than the capitalization heuristic alone.

  A first random sample against this new list (1,655 words at the time) still surfaced real
  leaks: a surname passing via a coincidental obscure noun entry, several English loanwords
  Wiktionary doesn't tag as such, words qualifying only through an archaic/obsolete/rare sense
  while their real-world identity is a grammatically-ineligible one (pronoun, conjunction,
  interjection), and one further vulgar/pejorative term missed by the first pass. This led to
  two more data-grounded filters (excluding Wiktionary's own "Anglicism" tag and its
  archaic/obsolete/rare/uncommon/dated tags where *every* sense of an entry carries one) plus 33
  additional `data/blocklist.txt` entries (41 total), each individually verified against the raw
  Wiktionary JSON rather than pattern-matched. Final count after four full sample reviews: 1,617.
  Full
  pipeline, evidence, and all four honest sample reviews are in the Task 8 report
  (`.superpowers/sdd/2026-09-20-verbete/task-8-report.md`).

## Frequency word list (`pt_br_50k.txt`)

- **Name:** FrequencyWords — Brazilian Portuguese 50k word frequency list (2018, from
  OpenSubtitles2018)
- **Author / credit:** Hermit Dave (`hermitdave/FrequencyWords`)
- **URL:**
  `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt`
- **Licence:** per the repository's own `README.md`
  (`https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/README.md`, seen
  2026-09-20): "MIT License for code. CC-BY-SA-4.0 for content." This file is content (a
  generated frequency list), so **CC BY-SA 4.0**
  (<https://creativecommons.org/licenses/by-sa/4.0/>) applies to it.
- **Download date:** 2026-09-20
- **Measured size:** 650,066 bytes
- **Used for:** ranking candidate answers by real-world word frequency when selecting the
  shipped answer list (Task 8). Not used to determine valid *guesses* — only to help choose which
  valid words are common enough to be good *answers*.
- **Redistribution status: BUILD-TIME ONLY, NEVER REDISTRIBUTED.** This file, and any
  intermediate ranking data derived from it, is consumed only while generating the shipped word
  lists. It is never embedded in the built game bundle. This distinction is what keeps its CC
  BY-SA 4.0 terms off the distributed artifact — the artifact only carries the *output* of
  choices informed by this data (which five-letter words made the answer list), not the
  frequency data or ranking itself.

## Wiktionary / kaikki raw extract (`ptwiktionary.jsonl.gz`)

- **Name:** kaikki.org raw wiktextract data for the Portuguese Wiktionary (Wikcionário,
  pt.wiktionary.org)
- **URL:** `https://kaikki.org/ptwiktionary/raw-wiktextract-data.jsonl.gz` — this specific
  endpoint's URL is stable across kaikki releases (only its content updates over time); it is
  distinct from kaikki's per-language `dictionary/<Language>/` pages, which bundle every
  language's *English*-Wiktionary-described senses under a processed-JSONL filename that does
  churn between releases, and from the deprecated `kaikki.org-dictionary-Portuguese.jsonl`
  (539.6 MB) mirror of that different, larger dataset — neither of those is what this project
  fetches.
- **Format:** gzip-compressed JSONL (one JSON object per line), every language pt.wiktionary.org
  documents senses for — `scripts/build-dictionary.ts` filters to `lang_code === "pt"` itself.
- **Download date:** 2026-09-20. **Upstream dump date:** 2026-09-01 (kaikki's own extraction of
  that dump ran 2026-09-19, per the kaikki page).
- **Measured size:** 35,583,192 bytes (~33.9 MB) gzip-compressed; ~331.9 MB uncompressed
  (kaikki-reported; not independently decompressed-and-measured here — `build-dictionary.ts`
  streams the gunzip rather than writing an uncompressed copy to disk).
- **Licence:** Wiktionary content is **CC BY-SA 4.0**
  (<https://creativecommons.org/licenses/by-sa/4.0/>, Wikcionário's stated licence); kaikki's
  extraction tooling does not change the licence of the underlying Wiktionary text.
- **Used for (Task 8, pulled forward from Task 21 by controller ruling):** the head-form
  authority for candidate answers — a word is answer-eligible only if this extract has a
  matching Portuguese entry whose part of speech is noun/adjective/adverb/verb and which is not
  itself a form-of/inflection entry (see the Task 8 report). **Also used for (Task 21):** the
  short definitions shown when a match ends — see `src/data/definitions.generated.json` and the
  Task 21 report.
- **Redistribution status: split by consumer.** The *existence and part-of-speech* check that
  decides answer-list membership (Task 8, `answers.generated.ts`) remains build-time only — no
  Wiktionary text is copied into that file, only word strings, same as `pt_br_50k.txt` below.
  **`src/data/definitions.generated.json` (Task 21) is REDISTRIBUTED**: it embeds one shortened
  gloss per answer (all 1,554 of them), which is actual Wiktionary sense text and carries the CC BY-
  SA 4.0 obligation `NOTICE.md` documents for it — attribution is given via the result screen's
  link to the specific `https://pt.wiktionary.org/wiki/<word>` article each definition came from.
- **Fetched automatically:** `scripts/fetch-sources.ts` downloads this file like the other three
  raw sources (idempotent — skipped if already present). The original plan expected this file to
  need a manual download step because kaikki's *processed* per-language JSONL filenames churn
  between releases; that concern turned out not to apply to this specific raw-data endpoint,
  whose URL is stable.

### Task 21 measured build results

`src/data/definitions.generated.json`: **1,476 of 1,617 answers (91.3%)** got a usable, non-
spoiling definition at the time of Task 21; the remaining 141 had none, either because the
eligible Wiktionary entries for that word had no non-empty gloss, or because every gloss found
would have contained the answer's own stem. Those 141 stayed in the answer pool and revealed
nothing at the end of a match — which the final whole-branch review reopened as C1; see
"Final-review revision" below for the numbers that actually ship. Raw generated file (Task 21):
89,136 bytes; **gzip -9: 34,438 bytes** (comfortably
inside the ~55–70 KB estimate the spec guessed at) — served as its own code-split chunk (Vite's
dynamic-`import()` output, e.g. `dist/assets/definitions.generated-<hash>.js`), never part of the
initial bundle. Longest generated value measured at 95 characters (the ~90-character gloss
truncation plus its part-of-speech prefix), comfortably under the 100-character ceiling
`src/data/__tests__/definitions.test.ts` checks.

**Post-review revision (still Task 21):** the spoiler check's stem length was shortened from 4
to 3 normalized letters after review found it blind to a derivational relative one letter
shorter than the answer — `socar` shipped defined as "dar socos em" ("socos" shares only 3
letters, "soc", with the 4-letter stem "soca"). Measured against the same final answer list, in
`assertDefinitionDoesNotSpoil`'s doc comment in `scripts/build-dictionary.ts`:

| Stem check | Coverage | Catches `socar`? | Notes |
|---|---|---|---|
| 4-char substring (original) | 1,536/1,617 = 95.0% | No — the leak that prompted this revision | |
| 3-char substring (shipped) | 1,476/1,617 = 91.3% | Yes | Strict superset of every other option measured; no observed blind spot in this dataset |
| 2-char substring | 1,372/1,617 = 84.8% | Yes | Under the ~85% floor for negligible extra safety — rejected |
| Shared prefix with a whole gloss token, length ≥ 3 | 1,484/1,617 = 91.8% | Yes | Rejected despite slightly higher coverage — misses a case in this exact dataset (`maior` defined via "...aos **demais**...", which contains the stem "mai" mid-token, not at a token's start) that the shipped substring check catches; that miss is the same shape a "re-"/"des-"-prefixed spoiler would produce |
| Shared prefix with a whole gloss token, length ≥ 4 | 1,539/1,617 = 95.2% | No | Too loose — does not shorten the effective stem at all |

The 3-char substring check was chosen: it satisfies the one hard requirement (never leak), it is
a strict superset of every other option's rejections measured (nothing it lets through, another
measured option would have caught), and it keeps the exact same "does the definition contain the
stem" shape the original check already had — no new tokenization logic, no new edge cases to
reason about in a place where safety, not cleverness, is the goal.

### Final-review revision (C1): every answer has a definition

The final whole-branch review measured what the 8.7% gap above actually costs a player against
the real deck: **65 of the next 120 days had at least one board whose reveal was empty, 9 of the
next 120 Solo dailies revealed nothing at all, and that day's own Solo daily (`curte`) was one
of them.** Since `DAILY_POOL_SIZE` and `EPOCH_DAY_KEY` are frozen by design, the deck could only
be corrected before the first player arrived.

Diagnosed against the raw extract, the 141 gloss-less answers had three causes, in this
proportion:

| Cause | Count |
|---|---|
| Every candidate gloss contained the answer's own stem, so `spoilsAnswer` rejected all of them | 140 |
| The eligible Wiktionary entries carried no gloss at all (`pasta`) | 1 |

Proper nouns and untagged loanwords (`césar`, `marta`, `erica`, `honor`, `crack`, `flash`,
`recém`, …) were a separate, overlapping population — every one of them reached the pool through
the same all-senses-spoil path, because a gloss like "mamífero carnívoro (Martes martes)"
restates the headword.

Three changes, all in `scripts/build-dictionary.ts` and `data/blocklist.txt`:

1. **Redaction instead of rejection.** `buildDefinition` now runs two passes. The first is
   unchanged — prefer a sense that never mentions the word. The second, new one takes the first
   sense that survives *redaction*: every word of the gloss carrying the answer's stem is
   replaced with an em dash, the mark a printed dictionary uses for its own headword. `saber`
   ships as "conhecimento; aquilo que se —" instead of not shipping at all. The spoiler
   guarantee is unchanged and still hard: the string written to disk contains no occurrence of
   the stem, and `assertDefinitionDoesNotSpoil` still runs over every shipped value and still
   throws. Whole words are redacted, never the bare three letters ("—ar" would leak the rest of
   "votar"). A redacted gloss is only kept if it still carries at least two real content words
   (so "o mesmo que —", "ver —" and "plural de —" are refused) and needs at most two redactions
   (which refuses exactly two glosses in this dataset: `avelã` and `bebum`). 80 of the 1,554
   shipped definitions carry at least one redaction.
2. **Untagged inflection entries excluded** (`isInflectionOnlyEntry`). wiktextract carries no
   `form_of` marking for some plural/feminine/participle entries; their only evidence is a gloss
   that reads "plural de lado", "feminino de magro", "particípio passado do verbo usar". An
   entry whose *every* sense gloss starts with one of those grammatically-specific patterns is
   no longer a head-form. This removes `lados`, `graus`, `moças`, `moços`, `rodas`, `calos`,
   `magra`, `digna`, `meiga`, `usado` and `vendo` from the answer pool. Task 8 considered and
   rejected an unanchored, any-sense version of this rule (see the `anões`/`redes` note in
   `data/blocklist.txt`); the anchored, every-sense version measured **one** false positive on
   the real data — `atriz`, whose sole Wiktionary sense is "feminino de ator" — which is an
   accepted, documented cost. `atriz` remains a valid guess.
3. **Five blocklist additions** — `césar`, `erica`, `marta`, `lúcia`, `pence` — for the
   lowercased-first-name and untagged-loanword leaks the review named that survived the two
   changes above.

And one invariant, so none of this can regress silently: `assertBuildInvariants` now **fails the
build** if any answer has no definition, and `pnpm dict:verify` runs the same assertion against
the committed files on every push. An answer that has nothing to reveal is dropped from
`answers.generated.ts` entirely rather than only being filtered out of the daily pool — that
gives infinite mode the same guarantee as the daily, and it makes the rule a single sentence
both gates can state. Such a word stays a fully valid **guess**; only the answer pool is
affected.

Measured result:

| | Before | After |
|---|---|---|
| Answers | 1,617 | 1,554 |
| Answers with a definition | 1,476 (91.3%) | 1,554 (**100%**) |
| Answers in the frozen daily pool with no definition | 130 | **0** |
| Next 120 days with ≥1 empty board | 65 | **0** |
| Next 120 Solo dailies revealing nothing | 9 | **0** |

Generated file: 94,332 bytes; **gzip -9: 36,322 bytes**. Longest value still 95 characters.

## Newsreader variable font (`Newsreader[opsz,wght].ttf`, `Newsreader-Italic[opsz,wght].ttf`)

- **Name:** Newsreader — a variable serif typeface, canonically distributed via the `google/fonts`
  repository (the same distribution Google Fonts itself serves from)
- **Author / credit:** The Newsreader Project Authors
  (`http://github.com/productiontype/Newsreader`)
- **URLs:**
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf`
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader-Italic%5Bopsz%2Cwght%5D.ttf`
  - `https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/OFL.txt`
- **Download date:** 2026-09-21
- **Measured size (as downloaded — full designer range, unsubsetted):** `Newsreader[opsz,wght].ttf`
  451,664 bytes; `Newsreader-Italic[opsz,wght].ttf` 495,684 bytes; `OFL.txt` 4,394 bytes
- **Used for:** the game's body/display typeface (`--font-serif`, `src/styles/tokens.css`).
  Previously loaded at runtime from Google Fonts (a third-party, cross-origin request that could
  only be runtime-cached, not precached — see Task 24's report for the offline gap that was
  measured to actually cause); self-hosted starting with Task 24 so it enters the service
  worker's revisioned precache instead.
- **Redistribution status: REDISTRIBUTED.** Subsetted, axis-instanced derivatives
  (`public/fonts/Newsreader-Roman.woff2`, `public/fonts/Newsreader-Italic.woff2`) ship in the
  built game bundle, alongside the unmodified `OFL.txt` (`public/fonts/OFL.txt`).

### Licence

**SIL Open Font License, Version 1.1** — read directly from the `OFL.txt` downloaded above, not
asserted from memory. See `NOTICE.md` for the copyright line quoted verbatim and how this
project's use (subsetting, instancing, bundling into a web game) maps to the licence's own
numbered conditions.

### Task 24 measured build results

Both files were subsetted (`pyftsubset`) to exactly the characters this game's shipped UI and
generated data render — derived by scanning `src/data/definitions.generated.json` and
`src/data/answers.generated.ts` directly, not guessed: full ASCII, the Portuguese accented
letters those two files actually contain (à á â ã ä ç é ê í ó ô õ ú and their uppercase forms —
each confirmed present in Newsreader's own glyph set via `fontTools`, not assumed), and the
typographic marks the Wikcionário-derived glosses use (em dash, curly quotes, ellipsis, middle
dot, £, ¨). Characters found in real content but absent from Newsreader itself (Greek letters,
card-suit/music symbols, subscript 2 — confirmed absent via the same `fontTools` check) were left
out: they already render via the fallback stack with or without this change, so subsetting them
out is not a regression.

The `wght` and `opsz` axis ranges were then reduced from a second, separate measurement — every
`font-weight`/`font-*` utility class and CSS `font-weight` declaration reachable in the shipped
app (excluding `src/dev/Showcase.tsx`, which `showcase.html`'s own comment confirms is never a
`vite build` input) — turned up exactly two weights ever used (400, 600) and confirmed every
italic use renders at the default weight, at `text-micro`/`text-small`/`text-body` (12–17px)
only, never at a display size:

| File | Axes shipped | Reasoning | Size (woff2) |
|---|---|---|---|
| `Newsreader-Roman.woff2` | `wght` 350–650 (variable), `opsz` 6–72 (variable, untouched) | `opsz` kept fully variable because it is the browser-driven optical-size axis `tokens.css`'s own doc comment names as the reason a variable serif was chosen at all; `wght` instanced to one weight-step of headroom past the measured 400/600 bounds — not the wider 300–700 Google's stylesheet happened to request | 76,748 bytes |
| `Newsreader-Italic.woff2` | `wght` 400, `opsz` 18 (both pinned — fully static, no `fvar`/`gvar`) | every italic use in the shipped app renders at the default weight, at sizes clustering around `opsz`'s own default (18); a second full variable face would pay for flexibility nothing in this app exercises | 13,888 bytes |

**Total: 90,636 bytes** (self-hosted, precached) — down from an initial subset-only attempt at
180,612 bytes before axis reduction, and comparable in order of magnitude to the 89,136-byte
`definitions.generated.json` chunk already shipped, rather than dwarfing it.

## Summary table

| Source | Redistributed? | Licence (as this project treats it) |
|---|---|---|
| `pt_BR.dic` / `pt_BR.aff` (VERO) | Yes — generated word lists ship in the bundle | LGPL-3.0, additionally MPL to the extent upstream's unversioned grant permits (see "Licence" above — ambiguous upstream, four disagreeing downstream readings) |
| `pt_br_50k.txt` (FrequencyWords) | No — build-time ranking input only | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (content), per upstream README |
| `ptwiktionary.jsonl.gz` (kaikki/Wiktionary) | No, for the Task 8 head-form check (`answers.generated.ts`) — Yes, for Task 21's `src/data/definitions.generated.json` | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (Wikcionário) |
| `Newsreader[opsz,wght].ttf` / `Newsreader-Italic[opsz,wght].ttf` | Yes — subsetted, axis-instanced derivatives ship in the bundle | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) |

## Unresolved

The exact Mozilla Public License **version** VERO is offered under is undetermined upstream.
Upstream's own files never state a version number, and every downstream packager checked here
resolves the ambiguity differently: Debian drops MPL entirely and reads LGPL-2.1+ only; wooorm
reads MPL-2.0; Fedora reads MPL-1.1. None of these is upstream's own statement — each is a
packager's guess at what upstream meant, and none should be mistaken for a confirmed fact.
**Anyone relicensing or commercialising this project should resolve this directly with upstream
(or Legal) before doing so.** Do not assume MPL-2.0, MPL-1.1, or any other specific version
without that resolution.
