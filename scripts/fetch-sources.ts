// Downloads the raw linguistic sources this project's word lists are
// derived from. Idempotent: a source already present on disk is skipped.
// Raw files live in data/raw/, which is gitignored — they are
// re-downloadable inputs, not generated output, and are never committed.
//
// Run with: pnpm run sources:fetch

import { access, mkdir, writeFile } from 'node:fs/promises';

interface Source {
  name: string;
  url: string;
}

const RAW_DIR = 'data/raw';

const SOURCES: Source[] = [
  {
    name: 'pt_BR.dic',
    url: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.dic',
  },
  {
    name: 'pt_BR.aff',
    url: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/pt_BR/pt_BR.aff',
  },
  {
    name: 'pt_br_50k.txt',
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt',
  },
  {
    // Raw wiktextract JSONL for the Portuguese-language Wiktionary
    // (Wikcionário, pt.wiktionary.org), gzip-compressed (~34 MB; ~330 MB
    // uncompressed). Unlike kaikki's per-language "dictionary/<Language>"
    // pages (which bundle every language's *English*-Wiktionary-described
    // senses and whose processed-JSONL filename does churn between
    // releases), this raw-data endpoint's URL is stable across kaikki
    // releases — only its content updates. One object per line, all
    // languages pt.wiktionary.org documents; scripts/build-dictionary.ts
    // filters to `lang_code === 'pt'` itself. Used (Task 8, pulled forward
    // from Task 21) as the authority for which words are genuine
    // dictionary head-forms — noun/adjective/adverb/infinitive-verb
    // entries that are not themselves a form-of/inflection entry — since
    // VERO's own lemma structure turned out to be an unreliable proxy for
    // that question. See data/SOURCES.md.
    name: 'ptwiktionary.jsonl.gz',
    url: 'https://kaikki.org/ptwiktionary/raw-wiktextract-data.jsonl.gz',
  },
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchSource(source: Source): Promise<void> {
  const path = `${RAW_DIR}/${source.name}`;
  if (await exists(path)) {
    console.log(`skip ${source.name} (already present)`);
    return;
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`${source.name}: HTTP ${response.status} fetching ${source.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  console.log(`got  ${source.name} (${bytes.byteLength} bytes)`);
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });

  for (const source of SOURCES) {
    await fetchSource(source);
  }
}

await main();
