// corpus.js — assembling the three tiers. Used by the worker, and by the
// page itself when the browser has no worker to give.
//
// Three tiers, in descending order of how much a person stands behind them:
// hand-written phrases, sentences built from checked patterns and words, and
// anything drawn from open parallel corpora.

import { parseCSV } from './csv.js';
import { expand } from './templates.js';

async function sheet(base, name) {
  const res = await fetch(base + name, { cache: 'no-cache' }).catch(() => null);
  return res && res.ok ? parseCSV(await res.text()) : [];
}

export async function loadTiers(base = './') {
  const [curated, patterns, nouns, corpus] = await Promise.all([
    sheet(base, 'phrases.csv'), sheet(base, 'patterns.csv'),
    sheet(base, 'nouns.csv'), sheet(base, 'corpus.csv'),
  ]);
  const built = patterns.length && nouns.length ? expand(patterns, nouns) : [];

  return {
    rows: [
      ...curated.map(p => ({ ...p, tier: 'curated' })),
      ...built,
      ...corpus.map(p => ({ ...p, tier: 'corpus', status: 'corpus' })),
    ],
    // Chips come from the hand-written tier only: the built rows would add a
    // chip per noun category and the corpus has no situations at all.
    situations: [...new Set(curated.map(p => p.situation).filter(Boolean))],
    counts: { curated: curated.length, built: built.length, corpus: corpus.length },
  };
}

export function countLabel({ curated, built, corpus }) {
  const parts = [`${curated} phrases`];
  if (built) parts.push(`${built} built`);
  if (corpus) parts.push(`${corpus} from corpora`);
  return parts.join(' + ');
}

// The renderer needs none of the search keys, and they are the bulk of a row.
// Stripping them before postMessage is most of what makes the hop cheap.
export function strip(row) {
  const { _dev, _rom, _en, _devWords, _romWords, ...rest } = row;
  return rest;
}
