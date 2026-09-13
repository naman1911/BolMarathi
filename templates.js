// templates.js — coverage without a row for every sentence.
//
// A phrase list grows one line at a time. A pattern list multiplies: thirty-
// eight patterns against ninety-eight nouns is a couple of thousand usable
// sentences, but only a hundred and thirty-six things ever need checking.
//
// The cost is that neither language lets you simply substitute:
//
//   Gender. Both Hindi and Marathi agree adjectives and verbs with the noun,
//   and they disagree with each other about which nouns are what. चाय is
//   feminine in Hindi, चहा masculine in Marathi. So a noun carries two
//   genders and a pattern carries two sets of three forms.
//
//   Case. A Marathi postposition needs the oblique stem: स्टेशन → स्टेशनला,
//   पाणी → पाण्याशिवाय.
//
//   Respect. A doctor or a teacher takes the honorific plural, which is
//   डॉक्टरांना, not डॉक्टरांला. Marked per noun.

const GENDER_KEY = { m: 0, f: 1, n: 2 };

function pick(pattern, gender, lang) {
  const g = GENDER_KEY[(gender || 'n').toLowerCase()] ?? 2;
  const forms = lang === 'hi'
    ? [pattern.hi_m, pattern.hi_f, pattern.hi_n]
    : [pattern.mr_m, pattern.mr_f, pattern.mr_n];
  return forms[g] || forms[2] || forms[0] || '';
}

/**
 * Build every valid pattern × noun combination.
 * Returns rows shaped like phrases.csv rows, tagged tier 'built'.
 */
export function expand(patterns, nouns) {
  const out = [];

  for (const pat of patterns) {
    const takes = (pat.takes || '').split('|').map(s => s.trim()).filter(Boolean);
    const needsStem = pat.form === 'oblique' || pat.form === 'dative';

    for (const noun of nouns) {
      if (takes.length && !takes.includes(noun.category)) continue;

      const hiPattern = pick(pat, noun.hi_gender, 'hi');
      let mrPattern = pick(pat, noun.mr_gender, 'mr');
      if (!hiPattern || !mrPattern) continue;

      const mrNoun = needsStem ? (noun.mr_oblique || noun.mr) : noun.mr;

      // An honorific noun takes ना where an ordinary one takes ला.
      if (pat.form === 'dative' && noun.honorific) {
        mrPattern = mrPattern.replace('{X}ला', '{X}ना');
      }

      out.push({
        hindi: hiPattern.replace('{X}', noun.hi),
        marathi: mrPattern.replace('{X}', mrNoun),
        english: pat.en.replace(/\{X\}/g, noun.en),
        roman: '',
        situation: noun.category,
        note: pat.note || '',
        status: 'built',
        source: pat.id,
        tier: 'built',
      });
    }
  }
  return out;
}
