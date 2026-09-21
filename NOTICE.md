# NOTICE

This file records third-party attributions for data distributed with this project. It covers
data only — the intent is for the game code (React/CSS/engine) to remain under whatever licence
the project owner selects, kept separate from the notices below, which apply only to the
generated word-list and definition files named in each block. See `data/SOURCES.md` for full
provenance, including sources that are *not* redistributed and so carry no obligation here.

## VERO Brazilian Portuguese dictionary — word lists

The word lists shipped with this game (valid guesses and candidate answers) are derived from the
VERO Hunspell dictionary and affix file for Brazilian Portuguese (`pt_BR.dic`, `pt_BR.aff`),
by Raimundo Santos Moura and the LibreOffice pt-BR community
(`https://github.com/LibreOffice/dictionaries`, `pt_BR/` directory).

**Adaptation made:** the affix rules were expanded against the dictionary's word stems, the
result was filtered to five-letter forms only, and a subset of those was selected as candidate
answers using frequency-based ranking (see the frequency-list notice below) and restricted to
words confirmed as genuine dictionary head-forms by the Portuguese Wiktionary (Wikcionário; see
the Wikcionário notice below — used here only to decide list membership, at build time, not
redistributed as part of this word list; no Wiktionary text is embedded in it). What ships is a
derived word list, not the original dictionary files.

**Licence:** upstream states its own data is licensed under "the GNU Lesser General Public
License version 3 (LGPLv3) ... and the Mozilla Public License", without naming an MPL version.
Downstream packagers who redistribute the same data disagree on how to read this (see
`data/SOURCES.md` for the full four-way comparison: Debian reads LGPL-2.1+ only; wooorm reads
LGPL-3.0 OR MPL-2.0; Fedora reads (LGPL-3.0-only OR MPL-1.1) for the dictionary component).
Rather than assert a reading upstream itself never wrote down, this project distributes the
derived word lists under **LGPL-3.0** — the grant common to all four readings — and additionally
under the **Mozilla Public License**, to whatever extent upstream's unversioned MPL grant
permits. No specific MPL version is asserted.

## Wikcionário (Portuguese Wiktionary) — word definitions

Added by Task 21. `src/data/definitions.generated.json` (produced by `pnpm dict:build` from
`scripts/build-dictionary.ts`, sourced from `data/raw/ptwiktionary.jsonl.gz`) contains a short
definition for 1,476 of this game's 1,617 answers (91.3%) — the rest have no usable, non-spoiling gloss
(see "Adaptation made" below) are simply absent from the file, never from the answer list itself.
The file name differs from what this block originally announced (`data/definicoes.json`): it
ships under `src/data/` instead, as a plain JSON module the game loads via a dynamic `import()`
(see `src/data/definitions.ts`) rather than a top-level data file, so its ~35 KB (gzip) payload
stays out of the initial bundle. Nothing about the licence obligation below changes with the
path.

**Adaptation made:** for each answer, the first Wiktionary sense (in entry order) whose gloss is
non-empty and does not itself contain the answer's own stem is selected — a check that matters in
practice: Wiktionary's own first sense for "casar" is "ato de unir por casamento...", which
contains "casa" and would spoil the game's own reward, so that entry falls through to its second
sense instead (see `scripts/build-dictionary.ts`'s `assertDefinitionDoesNotSpoil` and
`buildDefinition`). The selected gloss is whitespace-normalized and truncated to roughly 90
characters on a word boundary, and prefixed with a part-of-speech abbreviation ("s.f.", "adj.",
"v.", ...) derived from the same Wiktionary entry. This is a single sense selected out of however
many the real entry has, shortened to fit a result screen — an adaptation, not a reproduction of
the entry.

**Licence:** Wiktionary content is licensed under **CC BY-SA 4.0**
(<https://creativecommons.org/licenses/by-sa/4.0/>).
`src/data/definitions.generated.json` is a derivative work of Wikcionário content and is
distributed under the same licence. Attribution is given in the product itself, not only in this
file: the result screen that shows each definition links directly to
`https://pt.wiktionary.org/wiki/<word>` — the specific article the text was adapted from, per
word — which per CC BY-SA 4.0's own recommended practice is the most robust way to credit the
original authors and to indicate that the material was adapted.
