// build-lexicon.mjs — roman spelling to Devanagari word, from the sheets.
//
//   node build-lexicon.mjs
//
// phrases.csv carries a hand-written roman spelling beside every Hindi
// phrase. Where the two have the same number of words they can be zipped,
// which turns 611 checked phrases into a few thousand checked word pairs for
// free. nouns.csv adds its Hindi and Marathi words on top.
//
// Keys are the search's phonetic fold, so every way a person might spell a
// word arrives at the same entry. Where two Hindi words fold together, the
// commoner one wins, and a human spelling always beats a generated one.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from './csv.js';
import { fold, toRoman, normDev } from './search.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = n => {
  const f = path.join(here, n);
  return fs.existsSync(f) ? parseCSV(fs.readFileSync(f, 'utf8')) : [];
};

const strip = w => String(w || '')
  .replace(/[?।!,.'"()‘’“”:;]/g, '')
  .trim();

/**
 * Word pairs from rows whose two halves line up. A row that does not line up
 * is skipped rather than guessed at — a misaligned pair would teach the
 * lexicon a wrong word, and there are enough rows that do line up.
 */
export function pairsFrom(rows) {
  const out = [];
  for (const r of rows) {
    const dev = (r.hindi || '').split(/\s+/).map(strip).filter(Boolean);
    const rom = (r.roman || '').split(/\s+/).map(strip).filter(Boolean);
    if (!dev.length || dev.length !== rom.length) continue;
    for (let i = 0; i < dev.length; i += 1) out.push([rom[i], dev[i]]);
  }
  return out;
}

/** Build the lookup. `human` pairs outrank anything generated. */
export function buildLexicon(human, extraWords = []) {
  const tally = new Map();   // folded key -> Map(devanagari -> weight)

  const add = (key, dev, weight) => {
    if (!key || !dev) return;
    if (!tally.has(key)) tally.set(key, new Map());
    const m = tally.get(key);
    m.set(dev, (m.get(dev) || 0) + weight);
  };

  // A person typed these romanisations, so they are worth far more than a
  // spelling the transliterator invented for itself.
  for (const [rom, dev] of human) add(fold(rom), dev, 100);

  // Every Devanagari word also gets the roman its own transliterator would
  // produce, so a word nobody spelled in roman is still reachable.
  for (const [, dev] of human) add(fold(toRoman(dev)), dev, 1);
  for (const dev of extraWords) {
    add(fold(toRoman(dev)), dev, 1);
  }

  const lexicon = {};
  for (const [key, forms] of tally) {
    let best = null, top = -1;
    for (const [dev, weight] of forms) {
      if (weight > top) { top = weight; best = dev; }
    }
    lexicon[key] = best;
  }
  return lexicon;
}

// The words that make a sentence English regardless of its subject. Without
// these, "where is the station" is four nouns and a coin toss.
export const FUNCTION_WORDS = `a an the this that these those i me my mine you your yours
he him his she her hers it its we us our ours they them their theirs am is are was
were be been being do does did done have has had having will would shall should
can could may might must of in on at to from by for with about into over under
and or but if then than because so as not no yes what when where why how who whom
which there here very much many more most some any all both each few other need
want know like get give go come make take see say tell ask please thanks thank
sorry hello hi bye good bad big small new old near far left right open close`
  .split(/\s+/).filter(Boolean);

if (import.meta.url === `file://${process.argv[1]}`) {
  const phrases = read('phrases.csv');
  const nouns = read('nouns.csv');
  const human = pairsFrom(phrases);

  const extra = [];
  for (const r of phrases) for (const w of (r.hindi || '').split(/\s+/)) extra.push(strip(w));
  for (const n of nouns) { extra.push(strip(n.hi)); extra.push(strip(n.mr)); }

  const roman = buildLexicon(human, extra.filter(Boolean).map(normDev));

  // English vocabulary, for telling "where is the station" apart from
  // "station kahan hai". The english column is the only English the project
  // has, so it is padded with the function words that carry the signal.
  const english = new Set(FUNCTION_WORDS);
  for (const r of phrases) {
    for (const w of (r.english || '').toLowerCase().split(/[^a-z]+/)) {
      if (w.length > 1) english.add(w);
    }
  }
  for (const n of nouns) {
    for (const w of (n.en || '').toLowerCase().split(/[^a-z]+/)) {
      if (w.length > 1) english.add(w);
    }
  }

  const file = path.join(here, 'lexicon.json');
  fs.writeFileSync(file, JSON.stringify({ roman, english: [...english].sort() }));

  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`${human.length} word pairs from ${phrases.length} phrases`);
  console.log(`${Object.keys(roman).length} roman entries, ${english.size} English words`);
  console.log(`-> lexicon.json (${kb} KB)`);
}
