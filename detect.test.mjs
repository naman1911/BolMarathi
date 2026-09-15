// detect.test.mjs — is the input Hindi, roman Hindi, or English?
//
//   node detect.test.mjs
//
// phrases.csv holds the same phrase three ways, which is three labelled
// examples per row and 1,833 in total. As with the transliterator, the
// vocabulary is rebuilt per fold from the other four fifths, so a row is
// never classified using words it contributed itself.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from './csv.js';
import { normDev } from './search.js';
import { detect, HINDI, ROMAN, ENGLISH } from './detect.js';
import { pairsFrom, buildLexicon, FUNCTION_WORDS } from './build-lexicon.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rows = parseCSV(fs.readFileSync(path.join(here, 'phrases.csv'), 'utf8'))
  .filter(r => r.hindi && r.roman && r.english);

const FOLDS = 5;
const score = { [HINDI]: [0, 0], [ROMAN]: [0, 0], [ENGLISH]: [0, 0] };
// Split by length too. A bare word is ambiguous in a way a sentence is not —
// "das" is ten in Hindi and a plausible nothing in English — so the two
// deserve separate numbers rather than one average that hides both.
const byLength = { one: [0, 0], many: [0, 0] };
const wrong = [];

for (let f = 0; f < FOLDS; f += 1) {
  const test = rows.filter((_, i) => i % FOLDS === f);
  const train = rows.filter((_, i) => i % FOLDS !== f);

  const roman = buildLexicon(pairsFrom(train), train.flatMap(
    r => r.hindi.split(/\s+/).map(normDev)));
  const english = new Set(FUNCTION_WORDS);
  for (const r of train) {
    for (const w of r.english.toLowerCase().split(/[^a-z]+/)) if (w.length > 1) english.add(w);
  }
  const lexicon = { roman, english };

  for (const r of test) {
    for (const [text, want] of [[r.hindi, HINDI], [r.roman, ROMAN], [r.english, ENGLISH]]) {
      const got = detect(text, lexicon).lang;
      score[want][1] += 1;
      if (got === want) score[want][0] += 1;
      else if (wrong.length < 20) wrong.push([want, got, text]);

      if (want !== HINDI) {
        const bucket = byLength[text.trim().split(/\s+/).length === 1 ? 'one' : 'many'];
        bucket[1] += 1;
        if (got === want) bucket[0] += 1;
      }
    }
  }
}

let right = 0, total = 0;
console.log(`held out ${FOLDS}-fold over ${rows.length} phrases, three ways each\n`);
for (const [label, [ok, n]] of Object.entries(score)) {
  right += ok; total += n;
  console.log(`  ${label.padEnd(6)} ${((100 * ok) / n).toFixed(1).padStart(5)}%  (${ok}/${n})`);
}
console.log(`\n  overall ${((100 * right) / total).toFixed(1)}%  (${right}/${total})`);
console.log(`\nLatin input by length — where all the ambiguity actually lives:`);
for (const [label, [ok, n]] of Object.entries(byLength)) {
  console.log(`  ${(label === 'one' ? 'single word' : 'two or more').padEnd(12)}`
    + ` ${((100 * ok) / n).toFixed(1).padStart(5)}%  (${ok}/${n})`);
}

if (wrong.length) {
  console.log(`\nread the wrong way:`);
  for (const [want, got, text] of wrong.slice(0, 10)) {
    console.log(`   ${want} read as ${got.padEnd(6)} "${text}"`);
  }
}

const rate = (100 * right) / total;
if (rate < 85) {
  console.log(`\nFAIL: detection ${rate.toFixed(1)}% is below 85%`);
  process.exitCode = 1;
}
