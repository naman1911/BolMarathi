// translit.test.mjs — how often roman input reaches the right Devanagari.
//
//   node translit.test.mjs
//
// The lexicon is built from phrases.csv, so scoring it against phrases.csv
// would only prove that a lookup table can look things up. Every row is
// therefore held out in turn: the lexicon is rebuilt five times from four
// fifths of the data and scored on the fifth it has never seen. That is the
// number that says what happens when a person types a word the book does
// not contain.
//
// Rules-only is reported beside it, because the difference between the two
// is the entire argument for shipping a dictionary.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from './csv.js';
import { normDev } from './search.js';
import { transliterate } from './translit.js';
import { pairsFrom, buildLexicon } from './build-lexicon.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rows = parseCSV(fs.readFileSync(path.join(here, 'phrases.csv'), 'utf8'))
  .filter(r => r.hindi && r.roman);

const FOLDS = 5;
const clean = s => normDev(s).replace(/[।?!,.]/g, '').replace(/\s+/g, ' ').trim();

let wordsSeen = 0, wordsRight = 0, ruleRight = 0;
let sentSeen = 0, sentRight = 0;
const misses = [];

for (let f = 0; f < FOLDS; f += 1) {
  const test = rows.filter((_, i) => i % FOLDS === f);
  const train = rows.filter((_, i) => i % FOLDS !== f);

  // Built from the training rows only — no word of a test row reaches it,
  // through either the human spellings or the generated ones.
  const lexicon = buildLexicon(pairsFrom(train), []);

  for (const r of test) {
    const want = clean(r.hindi);
    const got = clean(transliterate(r.roman, lexicon));
    const rule = clean(transliterate(r.roman, null));

    sentSeen += 1;
    if (got === want) sentRight += 1;

    const a = want.split(' '), b = got.split(' '), c = rule.split(' ');
    if (a.length !== b.length) continue;
    for (let i = 0; i < a.length; i += 1) {
      wordsSeen += 1;
      if (a[i] === b[i]) wordsRight += 1;
      else if (misses.length < 25) misses.push([r.roman.split(/\s+/)[i] || '?', b[i], a[i]]);
      if (c.length === a.length && a[i] === c[i]) ruleRight += 1;
    }
  }
}

const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;

console.log(`held out ${FOLDS}-fold over ${rows.length} phrases\n`);
console.log(`words   : ${pct(wordsRight, wordsSeen)} exact  (${wordsRight}/${wordsSeen})`);
console.log(`          ${pct(ruleRight, wordsSeen)} with rules alone, no lexicon`);
console.log(`phrases : ${pct(sentRight, sentSeen)} exact  (${sentRight}/${sentSeen})`);

if (misses.length) {
  console.log(`\nwhat unseen words look like when they are wrong:`);
  for (const [rom, got, want] of misses.slice(0, 15)) {
    console.log(`   ${rom.padEnd(12)} -> ${String(got).padEnd(12)} want ${want}`);
  }
}

// A regression gate, not a target. Rules alone were around a fifth of words;
// the lexicon should stay far clear of that even on words it has never seen.
const rate = (100 * wordsRight) / wordsSeen;
if (rate < 55) {
  console.log(`\nFAIL: held-out word accuracy ${rate.toFixed(1)}% is below 55%`);
  process.exitCode = 1;
}
