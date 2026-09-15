// translit.js — roman Hindi into Devanagari, so the model can read it.
//
// IndicTrans2 wants Devanagari. People type "kitna hai". Something has to
// bridge that, and the bridge is mostly a dictionary, not a ruleset, because
// the hard part of the problem is not spelling — it is the schwa.
//
// Hindi writes an inherent 'a' after every consonant and then declines to
// pronounce most of them, and roman spelling follows the pronunciation. So
// कितना is typed "kitna": the schwa after त is written in Devanagari and
// absent in roman. Going the other way means putting back a vowel that the
// input never contained, and no rule decides reliably where. कितना takes one
// after त; रस्ता does not. Both look like CC in roman.
//
// A dictionary knows. For anything it does not know — a name, a new word —
// the rules below guess, and they guess that a consonant pair is two
// syllables rather than a conjunct, because that is the commoner case in
// the words people type. lexicon.json is built by build-lexicon.mjs and
// measured by translit.test.mjs against held-out rows.

import { fold } from './search.js';

// Longest first: 'chh' has to be tried before 'ch' before 'c'.
const CONSONANTS = [
  ['chh', 'छ'], ['shh', 'ष'], ['ksh', 'क्ष'], ['gy', 'ज्ञ'],
  ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'],
  ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['ng', 'ंग'],
  ['c', 'च'], ['k', 'क'], ['q', 'क'], ['g', 'ग'], ['j', 'ज'], ['z', 'ज़'],
  ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'], ['f', 'फ़'], ['b', 'ब'],
  ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'],
  ['s', 'स'], ['h', 'ह'], ['x', 'क्स'],
];

// [spelling, standalone, matra]. An empty matra is the inherent vowel.
const VOWELS = [
  ['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'],
  ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['oo', 'ऊ', 'ू'], ['uu', 'ऊ', 'ू'],
  ['ou', 'औ', 'ौ'], ['ea', 'ी', 'ी'], ['ri', 'ऋ', 'ृ'],
  ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'],
  ['o', 'ओ', 'ो'],
];

const HALANT = '्';
const ANUSVARA = 'ं';

// Clusters that really are conjuncts wherever they appear, so the schwa
// guess does not split them: प्र, क्ष, स्त and their friends.
const CONJUNCT = new Set([
  'pr', 'br', 'kr', 'gr', 'tr', 'dr', 'shr', 'sr', 'vr', 'hr', 'mr',
  'st', 'sth', 'sp', 'sk', 'sm', 'sv', 'sn', 'sht', 'shth',
  'ky', 'ty', 'dy', 'ny', 'py', 'by', 'vy', 'shy', 'sy', 'ry', 'ly',
  'ksh', 'gy', 'tt', 'dd', 'kk', 'pp', 'mm', 'nn', 'll', 'ss',
]);

// Roman spells both lengths of these the same way; at the end of a word
// the long one is the safer bet.
const LENGTHENS = { i: 'ी', u: 'ू' };

function matchAt(table, s, i) {
  for (const row of table) {
    if (s.startsWith(row[0], i)) return row;
  }
  return null;
}

/** One roman word into Devanagari by rule. The fallback, not the main path. */
export function transliterateWord(word) {
  const s = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';

  let out = '';
  let i = 0;
  let openConsonant = false;   // a consonant is waiting to learn its vowel

  while (i < s.length) {
    const c = matchAt(CONSONANTS, s, i);
    if (c) {
      if (openConsonant) {
        // Two consonants in a row. Either a conjunct, or a schwa the roman
        // spelling dropped. Word-initial pairs are nearly always conjuncts;
        // elsewhere, only the ones we know are.
        const known = CONJUNCT.has(s.slice(i - 1, i + c[0].length))
          || CONJUNCT.has(s.slice(i - 2, i + c[0].length));
        if (known || out.length <= 2) out += HALANT;
        // otherwise the inherent vowel stands, which is the schwa put back
      }
      // A nasal before another consonant is an anusvara, not a full न.
      if ((c[0] === 'n' || c[0] === 'm') && matchAt(CONSONANTS, s, i + 1) && openConsonant) {
        out += ANUSVARA;
        i += 1;
        openConsonant = false;
        continue;
      }
      out += c[1];
      openConsonant = true;
      i += c[0].length;
      continue;
    }

    const v = matchAt(VOWELS, s, i);
    if (v) {
      // Roman throws vowel length away, and one place it is recoverable is
      // the end of a word: a Hindi word ending in the i sound ends in ई far
      // more often than इ — अभी, दादी, नौकरी, कभी. Same for the u sound.
      const final = i + v[0].length >= s.length && openConsonant;
      const matra = final && LENGTHENS[v[0]] ? LENGTHENS[v[0]] : v[2];
      out += openConsonant ? matra : v[1];
      openConsonant = false;
      i += v[0].length;
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Roman into Devanagari, dictionary first. The lexicon is keyed by the same
 * phonetic fold the search uses, so "kitna", "kitnaa" and "kithna" all reach
 * the same entry and the caller does not have to spell anything correctly.
 */
export function transliterate(text, lexicon = null) {
  return String(text || '').split(/(\s+)/).map(chunk => {
    if (!chunk.trim()) return chunk;
    // Keep punctuation where it was; only the letters are transliterated.
    const m = chunk.match(/^([^a-zA-Z]*)([a-zA-Z]*)([^a-zA-Z]*)$/);
    if (!m) return chunk;
    const [, before, word, after] = m;
    if (!word) return chunk;
    const hit = lexicon && lexicon[fold(word)];
    return before + (hit || transliterateWord(word)) + after;
  }).join('');
}

export async function loadLexicon(base = './') {
  const res = await fetch(base + 'lexicon.json', { cache: 'no-cache' }).catch(() => null);
  return res && res.ok ? res.json() : {};
}
