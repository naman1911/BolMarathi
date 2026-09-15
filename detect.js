// detect.js — which of the three things the person just typed.
//
// The app takes Hindi, romanised Hindi and English, and the model it hands
// them to is different in each case: Devanagari and roman go to the Indic
// model as Hindi, English goes to the English model. Guessing wrong means
// translating "where is the station" as if it were Hindi, so this wants to
// be right rather than clever.
//
// Devanagari answers itself. Latin is the real question, and it is settled
// by vocabulary rather than by shape: how many of these words does the roman
// lexicon know, and how many does English? "station kahan hai" has one word
// in both and one word only Hindi has. "where is the station" is carried
// entirely by the function words, which is why they are in the list.

import { fold } from './search.js';

export const HINDI = 'hi';
export const ROMAN = 'roman';
export const ENGLISH = 'en';

const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Returns { lang, confident }. Low confidence is not a failure — it means
 * the page should say which way it read the input, so a person who meant the
 * other one can see that and correct it.
 */
export function detect(text, lexicon = { roman: {}, english: [] }) {
  const raw = String(text || '').trim();
  if (!raw) return { lang: ROMAN, confident: true, hindi: 0, english: 0 };
  if (DEVANAGARI.test(raw)) return { lang: HINDI, confident: true, hindi: 1, english: 0 };

  const english = lexicon.english instanceof Set
    ? lexicon.english
    : new Set(lexicon.english || []);
  const roman = lexicon.roman || {};

  const words = raw.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!words.length) return { lang: ROMAN, confident: false, hindi: 0, english: 0 };

  let hi = 0, en = 0;
  for (const w of words) {
    // A word can count for both — "station", "ticket" and "doctor" live in
    // Hindi too — and when every word does, the tie is broken below.
    if (roman[fold(w)]) hi += 1;
    if (english.has(w)) en += 1;
  }

  // Vocabulary decides when it can. When it cannot — a word neither list has
  // ever seen, which for a 1,000-word lexicon is most of the language — the
  // spelling itself is the evidence, and romanised Hindi has a shape.
  const lang = hi === en ? (shape(words) > 0 ? ROMAN : ENGLISH)
    : hi > en ? ROMAN : ENGLISH;
  const margin = Math.abs(hi - en) / words.length;
  return { lang, confident: margin >= 0.34, hindi: hi, english: en };
}

// Spellings that mean Hindi: the aspirate digraphs Devanagari has letters
// for, doubled vowels standing in for long ones, and a word ending in a
// vowel, which Hindi does constantly and English mostly does not.
const HINDI_MARKS = /kh|gh|bh|dh|jh|chh|ph|aa|ee|oo|ai|au/g;
// Spellings that mean English: endings Hindi has no use for, and the three
// letters romanised Hindi almost never reaches for.
const ENGLISH_MARKS = /ing\b|ed\b|ly\b|tion|ness|ment|ous|[qwx]|ck|ss\b|ee\b/g;

function shape(words) {
  let score = 0;
  for (const w of words) {
    score += (w.match(HINDI_MARKS) || []).length;
    score -= (w.match(ENGLISH_MARKS) || []).length;
    if (/[aeiou]$/.test(w)) score += 1;
    if (w.length > 3 && /[bcdfghjklmnpqrstvwxz]{2}$/.test(w)) score -= 1;
  }
  return score;
}
