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

### Task 8 measured build results

The plan's spec guessed 8,000–15,000 guesses and 1,500–3,000 answers. Those were hypotheses;
these are the measured numbers from actually running the pipeline in
`scripts/build-dictionary.ts` against the raw sources above (affix-expanded via
`hunspell-reader`, not `unmunch`).

- **Guess list: 18,216** five-letter comparison keys (normalized: accent-free, uppercase),
  after affix expansion, NFC length filtering, and dropping tokens that appear only capitalized
  in `pt_BR.dic` (the proper-noun/acronym heuristic — see NOTICE.md and the Task 8 report for the
  sample review of it). This overshoots the plan's 8k–15k estimate by about 20%. Before
  concluding the five-letter filter needs tightening, note that VERO's full affix expansion
  produces 19,603 raw five-letter alphabetic forms, of which only 1,387 are dropped as
  capitalized-only — i.e. the overshoot is mostly real five-letter Portuguese words (heavily
  inflected verb forms), not proper-noun leakage. See the Task 8 report for the full sample
  review and the controller's call on whether this needs tightening further.

- **Answer list: BLOCKED below the 1,500-word `DAILY_POOL_SIZE` floor.** Restricting candidate
  answers to genuine dictionary head-forms (a word equal to the literal, unmodified `word/flags`
  line in `pt_BR.dic` — see the Task 8 report for why the naive `prefix === '' && suffix === ''`
  signal hunspell-reader exposes is unreliable and had to be replaced) leaves 7,553 five-letter,
  non-proper head-forms. Intersecting those against `pt_br_50k.txt` yields only **1,217–1,432**
  candidates depending on exact-text vs. accent-insensitive matching — short of the 1,500 answers
  `assertBuildInvariants` requires, and short even before the NOSUGGEST/blocklist/collision drops
  in pipeline steps 7–8 are applied. This is a real ceiling of the two raw sources on hand, not a
  tunable parameter (`ANSWER_TARGET` was already unconstraining at this size). Full analysis,
  including a "carro"/"porta"/"livro"/"roupa" case study showing VERO omits standalone entries
  for some extremely common nouns, is in the Task 8 report
  (`.superpowers/sdd/2026-09-20-verbete/task-8-report.md`). No generated `answers.generated.ts`
  is committed until the controller decides how to close this gap.

## Frequency word list (`pt_br_50k.txt`)

- **Name:** FrequencyWords — Brazilian Portuguese 50k word frequency list (2018, from
  OpenSubtitles2018)
- **Author / credit:** Hermit Dave (`hermitdave/FrequencyWords`)
- **URL:**
  `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt`
- **Licence:** per the repository's own `README.md`
  (`https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/README.md`, seen
  2026-09-20): "MIT License for code. CC-BY-SA-4.0 for content." This file is content (a
  generated frequency list), so **CC BY-SA 4.0** applies to it.
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

## Wiktionary / kaikki definitions extract (`ptwiktionary.jsonl`) — not fetched in this task

- **Name:** kaikki.org Portuguese Wiktionary (Wikcionário) machine-readable extract
- **Source page:** `https://kaikki.org/ptwiktionary/` (release filename changes with every
  kaikki export; not recorded here as fetching it is out of scope for this task — see below)
- **Licence:** Wiktionary content is **CC BY-SA 4.0** (Wikcionário's stated licence); kaikki's
  extraction tooling does not change the licence of the underlying Wiktionary text.
- **Used for:** definitions shown in the finished game (Task 21 — word definitions, not word
  validity or scoring).
- **Redistribution status:** definitions derived from this data, once added, will be
  **redistributed** as `data/definicoes.json` (added in Task 21). This is why the CC BY-SA 4.0
  attribution block for it is written into `NOTICE.md` now, ahead of that file existing.
- **Manual step required:** this file is large and its filename changes with each kaikki
  release, so `scripts/fetch-sources.ts` does not fetch it automatically. It checks for
  `data/raw/ptwiktionary.jsonl` and, if absent, prints a message naming this manual step instead
  of failing. To acquire it: visit `https://kaikki.org/ptwiktionary/`, download the current
  Portuguese-sense JSONL extract, and save it at `data/raw/ptwiktionary.jsonl`. Record the exact
  filename and date actually used in this section when that step is done.

## Summary table

| Source | Redistributed? | Licence (as this project treats it) |
|---|---|---|
| `pt_BR.dic` / `pt_BR.aff` (VERO) | Yes — generated word lists ship in the bundle | LGPL-3.0, additionally MPL to the extent upstream's unversioned grant permits (see "Licence" above — ambiguous upstream, four disagreeing downstream readings) |
| `pt_br_50k.txt` (FrequencyWords) | No — build-time ranking input only | CC BY-SA 4.0 (content), per upstream README |
| `ptwiktionary.jsonl` (kaikki/Wiktionary) | Will be, once added in Task 21 (`data/definicoes.json`) | CC BY-SA 4.0 (Wikcionário) |

## Unresolved

The exact Mozilla Public License **version** VERO is offered under is undetermined upstream.
Upstream's own files never state a version number, and every downstream packager checked here
resolves the ambiguity differently: Debian drops MPL entirely and reads LGPL-2.1+ only; wooorm
reads MPL-2.0; Fedora reads MPL-1.1. None of these is upstream's own statement — each is a
packager's guess at what upstream meant, and none should be mistaken for a confirmed fact.
**Anyone relicensing or commercialising this project should resolve this directly with upstream
(or Legal) before doing so.** Do not assume MPL-2.0, MPL-1.1, or any other specific version
without that resolution.
