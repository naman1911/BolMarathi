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

// Bigram sets are memoised by word. A phrasebook says "kahan" and "hai" and
// "kuthe" thousands of times, so the vocabulary is far smaller than the row
// count and this settles quickly.
const BG = new Map();

function bigrams(s) {
  let set = BG.get(s);
  if (set) return set;
  set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  if (BG.size > 20000) BG.clear();
  BG.set(s, set);
  return set;
}

const FUZZY = 0.55;

// The query token's bigrams are the same for every row, so they are computed
// once per query and handed in. The bound in front is not a heuristic: the
// best Dice score two sets can reach is 2·min/(|A|+|B|), so when that is
// already under the threshold, the intersection cannot change the answer.
function dice(word, tokenBigrams) {
  if (word.length < 3 || tokenBigrams.size < 2) return 0;
  const A = bigrams(word), B = tokenBigrams;
  const n = A.size + B.size;
  if ((2 * Math.min(A.size, B.size)) / n < FUZZY) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit += 1;
  return (2 * hit) / n;
}

function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** How well one query word matches one row. 0 means no match at all. */
function tokenScore(token, bg, row, dev) {
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
    if (best >= 4.5) break;          // nothing below can beat a whole word
    if (w === token) best = Math.max(best, 4.5);
    else if (w.startsWith(token)) best = Math.max(best, 3.5);
    else {
      // Inflection lives at the end of the word in both languages, so a
      // shared stem is a strong signal: कितना / कितने, पोहोचतो / पोहोचते.
      const sp = sharedPrefix(w, token);
      if (sp >= 3 && sp >= token.length * 0.7) best = Math.max(best, 2.5);
      else {
        const d = dice(w, bg);
        if (d >= FUZZY) best = Math.max(best, 1 + d);
      }
    }
  }
  return best;
}

/**
 * Whether a query token is why a word is worth marking. The page used to
 * decide this for itself with a prefix test, which disagreed with the search
 * that found the row: "kitna" matches कितना through the fuzzy branch, since
 * the inherent vowel makes the row's key "kitana", and a prefix test leaves
 * the word the reader was looking for unmarked. Same rules, same answer.
 */
export function wordHit(word, token) {
  if (!word || !token) return false;
  if (word === token || word.startsWith(token)) return true;
  if (token.length > 3 && word.includes(token)) return true;
  const sp = sharedPrefix(word, token);
  if (sp >= 3 && sp >= token.length * 0.7) return true;
  return dice(word, bigrams(token)) >= FUZZY;
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

// --- candidates -----------------------------------------------------------
//
// The scorer above is exact but linear: it touches every row, and every word
// of every row. Fine for two thousand rows, hopeless for a hundred thousand.
// So rows are indexed by character trigram, and the scorer only ever sees
// rows that could plausibly match.
//
// The index is sound because of how tokenScore earns a non-zero. An exact
// field, a prefix, a substring and a shared stem of three or more characters
// all require the row to contain a whole trigram of the query token. Only the
// fuzzy Dice branch can in principle fire on a scattered match with no shared
// trigram — bench.mjs measures what that costs against an exhaustive scan,
// and on this data it is nothing.
//
// A row must match every token to score at all, so candidate sets are
// intersected across tokens rather than unioned. That is what makes a second
// word make the search faster instead of slower.

const GRAM = 3;

/** Every trigram of every field on one side of a row. */
function grams(row, key) {
  const out = new Set();
  for (const f of row[key]) {
    if (!f) continue;
    for (let i = 0; i + GRAM <= f.length; i += 1) out.add(f.slice(i, i + GRAM));
  }
  return out;
}

// Posting lists live in one Int32Array rather than an array per trigram:
// at 100k rows that is the difference between 30MB and several hundred.
// Two passes, because holding every row's trigram set at once is the same
// memory problem in a different coat.
function compile(rows, key) {
  const len = new Map();
  for (const row of rows) {
    for (const g of grams(row, key)) len.set(g, (len.get(g) || 0) + 1);
  }

  const at = new Map();
  let total = 0;
  for (const [g, n] of len) { at.set(g, total); total += n; }

  const postings = new Int32Array(total);
  const fill = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    for (const g of grams(rows[i], key)) {
      const c = fill.get(g) || 0;
      postings[at.get(g) + c] = i;
      fill.set(g, c + 1);
    }
  }
  return { at, len, postings };
}

/** Index a set of rows once, so searching them many times stays cheap. */
export function buildIndex(rows) {
  return {
    rows,
    dev: compile(rows, '_dev'),
    rom: compile(rows, '_rom'),
    // Scratch, reused across queries and stamped rather than cleared, so a
    // query costs nothing proportional to the corpus it did not touch.
    qmark: new Float64Array(rows.length),
    tmark: new Float64Array(rows.length),
    hits: new Int32Array(rows.length),
    gen: 0,
    tick: 0,
  };
}

/**
 * Row indices that could match every token. null means the query gave the
 * index nothing to work with (every token shorter than a trigram), and the
 * caller should fall back to scanning.
 *
 * Only a few of a token's trigrams are probed, not all of them. The first
 * one, because a shared stem starts at the start; then the two with the
 * shortest posting lists, because a row containing the token whole contains
 * every one of its trigrams and so is certain to appear under the rarest.
 * Skipping the common trigrams — the "ana" and "aha" that half the corpus
 * carries — is most of the speed.
 */
function candidates(ix, tokens, dev) {
  const { at, len, postings } = dev ? ix.dev : ix.rom;
  const { qmark, tmark, hits } = ix;
  const use = tokens.filter(t => t.length >= GRAM);
  if (!use.length) return null;

  ix.gen += 1;
  const gen = ix.gen;
  const last = use.length - 1;
  const out = [];

  for (let k = 0; k <= last; k += 1) {
    ix.tick += 1;
    const tid = ix.tick;          // unique per token per query, so a row counts
    const collect = k === last;   // once however many trigrams it shares
    for (const g of probes(use[k], at, len)) {
      const start = at.get(g);
      const end = start + len.get(g);
      for (let p = start; p < end; p += 1) {
        const r = postings[p];
        if (tmark[r] === tid) continue;
        tmark[r] = tid;
        if (qmark[r] !== gen) { qmark[r] = gen; hits[r] = 0; }
        hits[r] += 1;
        // A survivor has to appear under the last token too, so the final
        // pass is also the collection pass — no sweep over the corpus.
        if (collect && hits[r] === use.length) out.push(r);
      }
    }
  }
  // Scoring in row order, not in whatever order the posting lists happened to
  // hand them over, so that ties break the same way an exhaustive scan breaks
  // them and results never depend on how the index was laid out.
  return out.sort((a, b) => a - b);
}

const PROBE = 3;

function probes(token, at, len) {
  const seen = new Set();
  let first = null;
  const rest = [];
  for (let i = 0; i + GRAM <= token.length; i += 1) {
    const g = token.slice(i, i + GRAM);
    if (seen.has(g) || at.get(g) === undefined) continue;
    seen.add(g);
    if (first === null) first = g; else rest.push(g);
  }
  if (first === null) return [];
  rest.sort((a, b) => len.get(a) - len.get(b));
  return [first, ...rest.slice(0, PROBE - 1)];
}

const AUTO = new WeakMap();

function indexFor(source) {
  if (!Array.isArray(source)) return source;
  let ix = AUTO.get(source);
  if (!ix) { ix = buildIndex(source); AUTO.set(source, ix); }
  return ix;
}

// Keeping only the best `limit` rows. The page shows two hundred; scoring a
// query that matches a hundred thousand should not also mean allocating and
// sorting a hundred thousand. A min-heap holds the survivors, so the cost of
// a broad query is the scoring, not the bookkeeping.
//
// The order is total — score, then the shorter phrase, then the row's own
// position — so it never depends on the order candidates arrived in, and a
// limited search returns exactly the head of an unlimited one.
function below(a, b) {
  if (a.score !== b.score) return a.score < b.score;
  if (a.row.hindi.length !== b.row.hindi.length) return a.row.hindi.length > b.row.hindi.length;
  return a.idx > b.idx;
}

function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!below(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
}

function heapReplace(h, item) {
  h[0] = item;
  let i = 0;
  for (;;) {
    const l = 2 * i + 1, r = l + 1;
    let s = i;
    if (l < h.length && below(h[l], h[s])) s = l;
    if (r < h.length && below(h[r], h[s])) s = r;
    if (s === i) break;
    [h[i], h[s]] = [h[s], h[i]];
    i = s;
  }
}

/**
 * Rank rows for a query. Every word in the query must match something,
 * so "kitne ka" narrows rather than widens.
 *
 * Takes either an array of indexed rows or the result of buildIndex; an array
 * is indexed on first use and remembered. `limit` keeps only the best n, which
 * is what the page wants. `exhaustive` skips the trigram index and scans every
 * row — bench.mjs checks the indexed answer against it.
 */
export function searchRows(source, query, opts = {}) {
  const { situation = null, exhaustive = false, limit = Infinity } = opts;
  const ix = indexFor(source);
  const rows = ix.rows;
  const raw = String(query || '').trim();
  if (!raw) {
    const all = rows.filter(r => !situation || r.situation === situation);
    return limit < all.length ? all.slice(0, limit) : all;
  }

  const dev = isDevanagari(raw);
  // Keep the query whole as well as in pieces: an exact phrase match should
  // always beat a scattering of separate word matches.
  const phrase = dev ? normDev(raw) : fold(raw);
  let tokens = phrase.split(' ').filter(Boolean);
  if (!dev && tokens.length > 1) {
    const solid = tokens.filter(t => !STOP.has(t));
    if (solid.length) tokens = solid;
  }
  if (!tokens.length) return [];
  const bgs = tokens.map(bigrams);
  const multi = phrase.includes(' ');

  const pool = exhaustive ? null : candidates(ix, tokens, dev);
  const n = pool ? pool.length : rows.length;
  const heap = [];
  const flat = limit === Infinity ? [] : null;

  for (let k = 0; k < n; k += 1) {
    const idx = pool ? pool[k] : k;
    const row = rows[idx];
    if (situation && row.situation !== situation) continue;
    let total = 0, ok = true;
    for (let t = 0; t < tokens.length; t += 1) {
      const s = tokenScore(tokens[t], bgs[t], row, dev);
      if (s === 0) { ok = false; break; }
      total += s;
    }
    if (!ok) continue;
    // Average score, nudged by how much of the row the query accounts for —
    // a short phrase matched fully beats a long one matched partly.
    const len = Math.max(1, (dev ? row._dev[0] : row._rom[0]).length);
    let score = (total / tokens.length) + Math.min(1, raw.length / len);
    if (multi) {
      for (const h of dev ? row._dev : row._rom) {
        if (h === phrase) { score += 4; break; }
        if (h.includes(phrase)) { score += 2; break; }
      }
    }
    if (row.tier === 'built') score *= 0.92;
    if (row.tier === 'corpus') score *= 0.8;
    if (row.status === 'ok') score *= 1.08;

    const hit = { row, score, idx };
    if (flat) flat.push(hit);
    else if (heap.length < limit) heapPush(heap, hit);
    else if (below(heap[0], hit)) heapReplace(heap, hit);
  }

  const out = flat || heap;
  out.sort((a, b) => (below(a, b) ? 1 : below(b, a) ? -1 : 0));
  return out.map(x => x.row);
}
