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

*Not yet present in this repository.* This block is written now so the obligation is recorded
before the data it covers exists. Task 21 will add `data/definicoes.json`, containing word
definitions derived from the Portuguese-language Wiktionary (Wikcionário), extracted via
kaikki.org (`https://kaikki.org/ptwiktionary/`).

**Adaptation made (planned, Task 21):** definitions will be extracted from Wiktionary's raw
sense data, filtered to the senses relevant to this game's word list, and reformatted into the
flat `data/definicoes.json` structure the game consumes — not reproduced as full Wiktionary
entries.

**Licence:** Wiktionary content is licensed under **CC BY-SA 4.0**. `data/definicoes.json`, once
added, is a derivative work of Wikcionário content and is distributed under the same licence,
with attribution to the Wikcionário contributors and a link back to
`https://pt.wiktionary.org/`.
