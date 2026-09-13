// search.js — finding a phrase when you half-remember it.
//
// Three problems the naive version had:
//
//   1. Corpus rows carry no roman spelling, so typing "kitna" could never
//      reach them. Every Devanagari string now gets a roman key generated
//      from it, so roman search works on every row whether or not a human
//      typed one.
//   2. Nobody agrees how to spell Hindi in roman letters. kitna, kitnaa,
//      kithnaa, kitana. Both the query and the key are folded down to a
//      loose phonetic skeleton before comparing.
//   3. A two-word query was scored as one blob. Now every word in the query
//      must find a home somewhere in the row, which is what people expect.

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'ळ': 'l',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'k', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f',
};

const VOWELS = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
};

const MATRAS = {
  '\u093e': 'aa', '\u093f': 'i', '\u0940': 'ee', '\u0941': 'u', '\u0942': 'oo',
  '\u0943': 'ri', '\u0947': 'e', '\u0948': 'ai', '\u094b': 'o', '\u094c': 'au',
};

const HALANT = '\u094d';
const ANUSVARA = '\u0902';
const CHANDRA = '\u0901';
const VISARGA = '\u0903';

/** Devanagari → a rough roman spelling. Not scholarly; just searchable. */
export function toRoman(text) {
  if (!text) return '';
  let out = '';
  const s = String(text).normalize('NFC');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const next = s[i + 1];

    if (CONSONANTS[c]) {
      out += CONSONANTS[c];
      if (next === HALANT) { i += 1; continue; }            // conjunct — no vowel
      if (MATRAS[next]) { out += MATRAS[next]; i += 1; continue; }
      if (next === ANUSVARA || next === CHANDRA) { out += 'an'; i += 1; continue; }
      out += 'a';                                            // inherent vowel
      continue;
    }
    if (VOWELS[c]) { out += VOWELS[c]; continue; }
    if (MATRAS[c]) { out += MATRAS[c]; continue; }
    if (c === ANUSVARA || c === CHANDRA) { out += 'n'; continue; }
    if (c === VISARGA) { out += 'h'; continue; }
    if (c === HALANT || c === '\u093c') continue;
    if (/\s/.test(c)) { out += ' '; continue; }
    if (/[a-z0-9]/i.test(c)) { out += c.toLowerCase(); continue; }
    // punctuation and anything else is dropped
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Collapse roman spelling to a phonetic skeleton, so that the many ways
 * people write the same Hindi word all land in the same place.
 */
export function fold(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/aa+/g, 'a').replace(/ee+/g, 'i').replace(/ii+/g, 'i')
    .replace(/oo+/g, 'u').replace(/uu+/g, 'u')
    .replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 'j')
    .replace(/chh/g, 'ch').replace(/ck/g, 'k')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devanagari normalisation — strip nukta, joiners and punctuation. */
export function normDev(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\u093c\u200b-\u200d\ufeff]/g, '')
    .replace(/[?।!,.'"()\u2018\u2019\u201c\u201d]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function isDevanagari(s) {
  return /[\u0900-\u097F]/.test(s);
}

/** English is folded the same way as roman Hindi. That turns "phone" into
 *  "fone" and "water" into "vater", which looks odd but is harmless: the
 *  query goes through the identical fold, so both sides always agree. */
function foldEnglish(s) {
  return fold(String(s || '').replace(/[\/()]/g, ' '));
}

/** Precompute everything a row will be searched on. Done once at load. */
export function indexRow(p) {
  const hi = normDev(p.hindi);
  const mr = normDev(p.marathi);
  const romanHi = fold(p.roman || toRoman(p.hindi));
  const romanMr = fold(toRoman(p.marathi));
  const en = foldEnglish(p.english);
  return {
    ...p,
    _dev: [hi, mr],
    _rom: [romanHi, romanMr, en],
    _en: en,
    _devWords: [...new Set([...hi.split(' '), ...mr.split(' ')])].filter(Boolean),
    _romWords: [...new Set([
      ...romanHi.split(' '), ...romanMr.split(' '), ...en.split(' '),
    ])].filter(Boolean),
  };
}

function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a, b) {
  if (a.length < 3 || b.length < 3) return 0;
  const A = bigrams(a), B = bigrams(b);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit += 1;
  return (2 * hit) / (A.size + B.size);
}

function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** How well one query word matches one row. 0 means no match at all. */
function tokenScore(token, row, dev) {
  const fields = dev ? row._dev : row._rom;
  const words = dev ? row._devWords : row._romWords;
  let best = 0;

  for (const f of fields) {
    if (!f) continue;
    if (f === token) return 5;
    if (f.startsWith(token)) best = Math.max(best, 4);
    else if (f.includes(token)) best = Math.max(best, 3);
  }
  for (const w of words) {
    if (w === token) best = Math.max(best, 4.5);
    else if (w.startsWith(token)) best = Math.max(best, 3.5);
    else {
      // Inflection lives at the end of the word in both languages, so a
      // shared stem is a strong signal: कितना / कितने, पोहोचतो / पोहोचते.
      const sp = sharedPrefix(w, token);
      if (sp >= 3 && sp >= token.length * 0.7) best = Math.max(best, 2.5);
      else {
        const d = dice(w, token);
        if (d >= 0.55) best = Math.max(best, 1 + d);
      }
    }
  }
  return best;
}

// English function words carry no signal and match almost every row, so a
// query like "I am hungry" would otherwise rank on "I". Drop them whenever
// the query has something more substantial to go on.
const STOP = new Set([
  'a', 'an', 'the', 'i', 'im', 'me', 'my', 'you', 'your', 'he', 'she', 'it',
  'we', 'they', 'is', 'am', 'are', 'was', 'be', 'do', 'does', 'did', 'to',
  'of', 'in', 'on', 'at', 'for', 'and', 'or', 'this', 'that', 'have', 'has',
  'can', 'will', 'would', 'please', 'some', 'any',
]);

/**
 * Rank rows for a query. Every word in the query must match something,
 * so "kitne ka" narrows rather than widens.
 */
export function searchRows(rows, query, { situation = null } = {}) {
  const raw = String(query || '').trim();
  if (!raw) {
    return rows.filter(r => !situation || r.situation === situation);
  }

  const dev = isDevanagari(raw);
  // Keep the query whole as well as in pieces: an exact phrase match should
  // always beat a scattering of separate word matches.
  const phrase = dev ? normDev(raw) : fold(raw);
  let tokens = (dev ? normDev(raw) : fold(raw)).split(' ').filter(Boolean);
  if (!dev && tokens.length > 1) {
    const solid = tokens.filter(t => !STOP.has(t));
    if (solid.length) tokens = solid;
  }
  if (!tokens.length) return [];

  const scored = [];
  for (const row of rows) {
    if (situation && row.situation !== situation) continue;
    let total = 0, worst = Infinity;
    for (const t of tokens) {
      const s = tokenScore(t, row, dev);
      if (s === 0) { worst = 0; break; }
      total += s;
      worst = Math.min(worst, s);
    }
    if (!worst) continue;
    // Average score, nudged by how much of the row the query accounts for —
    // a short phrase matched fully beats a long one matched partly.
    const len = Math.max(1, (dev ? row._dev[0] : row._rom[0]).length);
    let score = (total / tokens.length) + Math.min(1, raw.length / len);
    if (phrase.includes(' ')) {
      const haystacks = dev ? row._dev : row._rom;
      for (const h of haystacks) {
        if (h === phrase) { score += 4; break; }
        if (h.includes(phrase)) { score += 2; break; }
      }
    }
    if (row.tier === 'corpus') score *= 0.8;
    if (row.status === 'ok') score *= 1.08;
    scored.push({ row, score });
  }

  scored.sort((a, b) => b.score - a.score || a.row.hindi.length - b.row.hindi.length);
  return scored.map(x => x.row);
}
