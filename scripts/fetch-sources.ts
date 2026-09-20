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
];

// The kaikki / Wiktionary Portuguese-sense extract is not fetched by this
// script: it is large, its filename changes with every kaikki release, and
// it is only consumed by a later task (definitions), not this one. When
// it's needed, download it manually from https://kaikki.org/ptwiktionary/
// and save it at this path; see data/SOURCES.md for the manual step.
const KAIKKI_PATH = `${RAW_DIR}/ptwiktionary.jsonl`;

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

  if (await exists(KAIKKI_PATH)) {
    console.log(`skip ptwiktionary.jsonl (already present)`);
  } else {
    console.log(
      'skip ptwiktionary.jsonl: not fetched automatically (large, release filename ' +
        'changes). Manual step: download the Portuguese-sense extract from ' +
        'https://kaikki.org/ptwiktionary/ and save it as data/raw/ptwiktionary.jsonl. ' +
        'See data/SOURCES.md for details. Not required for this task.',
    );
  }
}

await main();
