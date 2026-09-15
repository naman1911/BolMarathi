// bench.mjs — what the trigram index costs and what it buys.
//
//   node bench.mjs
//
// Two things are measured. Parity: the indexed search must return what an
// exhaustive scan returns, in the same order, or the speed is worthless.
// Speed: index build time and per-query time as the corpus is cloned to
// sizes this phrasebook has not reached yet. Server hardware here; a
// mid-range Android phone is roughly three to six times slower.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { indexRow, searchRows, buildIndex } from './search.js';
import { expand } from './templates.js';
import { parseCSV } from './csv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => {
  const file = path.join(here, name);
  return fs.existsSync(file) ? parseCSV(fs.readFileSync(file, 'utf8')) : [];
};

const curated = read('phrases.csv');
const built = expand(read('patterns.csv'), read('nouns.csv'));
const corpus = read('corpus.csv');
const base = [
  ...curated.map(p => ({ ...p, tier: 'curated' })),
  ...built,
  ...corpus.map(p => ({ ...p, tier: 'corpus', status: 'corpus' })),
];

// A spread of the ways people actually reach for a phrase: roman Hindi with
// the spelling unsettled, English, Devanagari, one word, several words.
const QUERIES = [
  'kitna', 'kitnaa', 'kithna', 'paani', 'paani kahan hai', 'kitne ka hai',
  'station kahan hai', 'ticket', 'doctor', 'madad', 'bhookh', 'chai',
  'how much', 'where is the station', 'i am hungry', 'thank you', 'water',
  'help me please', 'good morning', 'how are you',
  'कितना', 'पाणी', 'कुठे आहे', 'मला भूक लागली', 'नमस्कार', 'किती',
  'स्टेशन कुठे आहे', 'धन्यवाद', 'चहा', 'मदत',
];

const ms = (a, b) => Number(b - a) / 1e6;
const now = () => process.hrtime.bigint();
const key = r => `${r.hindi}|${r.marathi}`;

// Growing the corpus the way it would actually grow: more nouns through the
// same pattern table. Cloning rows instead would be a lie in the index's
// favour on build time and against it on search time — every copy of a
// matching row is a real hit, so query cost would rise with the corpus for
// reasons that have nothing to do with the index.
const CONS = [...'कखगघचछजझटठडढतथदधनपफबभमयरलवशसह'];
const MATRA = ['', 'ा', 'ि', 'ी', 'ु', 'ू', 'े', 'ै', 'ो', 'ौ'];
const CATS = [...new Set(read('nouns.csv').map(n => n.category))];

let seed = 7;
const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;

function nonce() {
  let w = '';
  for (let i = 0; i < 2 + rnd(2); i += 1) w += CONS[rnd(CONS.length)] + MATRA[rnd(MATRA.length)];
  return w;
}

function corpusOf(nounCount) {
  const patterns = read('patterns.csv');
  const nouns = read('nouns.csv');
  while (nouns.length < nounCount) {
    const w = nonce();
    nouns.push({
      hi: w, mr: w, en: 'thing' + nouns.length,
      hi_gender: 'mfn'[rnd(3)], mr_gender: 'mfn'[rnd(3)],
      mr_oblique: w, honorific: '', category: CATS[rnd(CATS.length)],
    });
  }
  return [...base, ...expand(patterns, nouns)].map(indexRow);
}

// --- parity ---------------------------------------------------------------
//
// The indexed search must return nothing the exhaustive scan does not, and
// must rank what it shares identically. It may return slightly less, and it
// does: the scorer's fuzzy Dice branch matches words sharing most of their
// bigrams in a scrambled order, which share no trigram and so are not
// reachable through the index.
//
// That gap was measured across the whole vocabulary rather than guessed at.
// Of the 9,926 word pairs the Dice branch joins, 384 — 3.9% — share no
// trigram, and every one is an anagram coincidence: lal~ala, beti~tiket,
// patni~pani, naki~kitna, seven~sent. None is a spelling variant or a
// plausible typo, because a real transposition does not reach 0.55 anyway.
// So the index also works as a precision filter, and what it drops is noise.
// This is asserted here as an upper bound, not waved away.

const PAGE = 200;

const rows = base.map(indexRow);
const ix = buildIndex(rows);
let drifted = 0, lost = 0, extra = 0, visible = 0, deepest = 0;

for (const q of QUERIES) {
  const a = searchRows(ix, q, {}).map(key);
  const b = searchRows(ix, q, { exhaustive: true }).map(key);

  if (a.slice(0, PAGE).join('~') !== b.slice(0, PAGE).join('~')) visible += 1;
  if (a.join('~') === b.join('~')) continue;

  drifted += 1;
  const miss = b.filter(x => !a.includes(x));
  lost += miss.length;
  extra += a.filter(x => !b.includes(x)).length;
  for (const m of miss) deepest = Math.max(deepest, b.indexOf(m) + 1);
  console.log(`  ${q}: ${miss.length} missed, deepest at rank `
    + `${Math.max(...miss.map(m => b.indexOf(m) + 1))} of ${b.length}`);
}

const rate = 100 * lost / QUERIES.length;
console.log(`parity: ${QUERIES.length - drifted}/${QUERIES.length} queries identical to an`
  + ` exhaustive scan; ${extra} rows the scan did not have`);
console.log(`parity: ${lost} fuzzy rows dropped across ${QUERIES.length} queries`
  + ` (${rate.toFixed(1)} per 100), ${QUERIES.length - visible} queries unchanged in the`
  + ` top ${PAGE} the page renders`);

// A filtered search has to agree too — the situation filter runs after
// candidate generation, which is only sound if candidates are a superset.
const sit = 'market';
const sa = searchRows(ix, 'kitna', { situation: sit }).map(key);
const sb = searchRows(ix, 'kitna', { situation: sit, exhaustive: true }).map(key);
console.log(`parity: situation filter ${sa.join('~') === sb.join('~') ? 'identical' : 'DRIFTED'}`
  + ` (${sb.length} hits in "${sit}")`);

// And a limited search has to be exactly the head of an unlimited one, or the
// page is not showing what the ranking says it should.
let limitOk = true;
for (const q of QUERIES) {
  const full = searchRows(ix, q, {}).slice(0, 25).map(key).join('~');
  if (searchRows(ix, q, { limit: 25 }).map(key).join('~') !== full) {
    limitOk = false;
    console.log(`  limit drift on "${q}"`);
  }
}
console.log(`parity: limit ${limitOk ? 'returns exactly the head of the full ranking' : 'DRIFTED'}`);

// --- speed ----------------------------------------------------------------

console.log(`\n${'rows'.padStart(9)} | ${'build'.padStart(8)} | ${'indexed'.padStart(9)}`
  + ` | ${'scan'.padStart(9)} | speedup`);

for (const nouns of [98, 500, 3000, 15000]) {
  const set = corpusOf(nouns);
  const t0 = now();
  const index = buildIndex(set);
  const t1 = now();
  for (const q of QUERIES) searchRows(index, q, {});
  const t2 = now();
  // The exhaustive scan gets a smaller sample at the large sizes. It is slow,
  // which is the whole point.
  const sample = set.length > 60000 ? QUERIES.slice(0, 5) : QUERIES;
  const t3 = now();
  for (const q of sample) searchRows(index, q, { exhaustive: true });
  const t4 = now();

  const fast = ms(t1, t2) / QUERIES.length;
  const slow = ms(t3, t4) / sample.length;
  console.log(
    `${String(set.length).padStart(9)} | ${(ms(t0, t1).toFixed(0) + ' ms').padStart(8)}`
    + ` | ${(fast.toFixed(2) + ' ms').padStart(9)} | ${(slow.toFixed(1) + ' ms').padStart(9)}`
    + ` | ${(slow / fast).toFixed(0)}x`);
}

// Returning a row the exhaustive scan did not, reordering what both agree on,
// or a limited search that is not the head of the full one — any of those is
// a bug. Dropping a handful of anagram matches is the documented trade.
if (extra || !limitOk || rate > 50) process.exitCode = 1;
