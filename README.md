# बोलपथ — Hindi to Marathi phrasebook

A phrasebook, not a translator. A few thousand phrases a bilingual speaker
actually uses, searchable as you type, spoken aloud on tap, working with no
internet once it has loaded.

The whole thing is one HTML page and a handful of spreadsheets.

## Editing the phrases

Everything lives in `phrases.csv`. Five columns:

| column | what goes there |
| --- | --- |
| `hindi` | the phrase in Hindi |
| `marathi` | how a Marathi speaker would actually say it |
| `roman` | the Hindi in roman letters, so "kitna" finds कितना |
| `situation` | one word — greeting, market, travel, food, help, office… |
| `note` | optional — register, gender variation, a warmer alternative |

Add a row, commit, and the app picks it up on its next load. If a phrase
contains a comma, wrap it in double quotes.

## The second tier: patterns × words

`patterns.csv` holds sentence frames with a slot — *{X} कुठे आहे?* — and
`nouns.csv` holds words that go in it. The app multiplies them at load,
producing about 1,600 sentences from 136 checked items. Verifying stays
linear while coverage grows.

Neither language allows plain substitution, so both tables carry the
grammar needed to do it properly:

| column | why it exists |
| --- | --- |
| `hi_gender`, `mr_gender` | the two languages disagree — चाय is feminine, चहा masculine |
| `mr_oblique` | postpositions need the oblique stem: स्टेशन → स्टेशनला |
| `honorific` | a doctor takes डॉक्टरांना, not डॉक्टरांला |
| `takes` | which categories of noun a pattern accepts |

Built rows are labelled *built* in the app and rank below hand-written ones.

## The third tier: corpus.csv

`phrases.csv` is hand-written and checked. `corpus.csv` is optional and comes
from open, human-translated parallel corpora — currently AI4Bharat's IN22-Conv
(CC-BY-4.0) and Amazon's MASSIVE (CC0) — paired by sentence ID, filtered to
short everyday sentences, and never machine-translated. The app loads it if
present, ranks curated phrases above it, and labels each corpus card with its
source. `build_corpus.py` holds the Colab cells that produce it.

## How search finds things

Typing runs against a trigram index, not the rows. Every field of every row
is cut into three-character pieces and each piece keeps a list of the rows it
appears in; a query looks up a few of its own pieces, intersects the lists —
a second word makes the search *faster*, not slower — and only then scores
the handful of rows that survived. Scoring itself is unchanged, and the page
keeps the best two hundred through a heap rather than sorting everything it
matched.

Parsing the sheets, transliterating every row and building that index happens
in a worker, so none of it touches the page. The page stays typeable while
the phrasebook loads, and if the browser cannot make a module worker the same
modules run in the page instead.

    node bench.mjs

checks both halves of that claim. It verifies the indexed search against an
exhaustive scan — same rows, same order, and a limited search that is exactly
the head of an unlimited one — and then times both as the corpus grows,
adding nouns to the pattern table the way the phrasebook would actually grow
rather than cloning rows, which would flatter the index on one axis and
punish it on another.

On this machine, roughly three to six times faster than a mid-range Android
phone:

| rows | index build | per query | exhaustive scan |
| --- | --- | --- | --- |
| 3,805 | 69 ms | 0.5 ms | 3.7 ms |
| 9,448 | 126 ms | 0.8 ms | 7.8 ms |
| 44,247 | 521 ms | 3.3 ms | 36 ms |
| 211,107 | 2.5 s | 13.5 ms | 149 ms |

The index is not a perfect superset of the scan, and the bench says so rather
than rounding it away. The scorer's fuzzy branch matches words that share
most of their bigrams in a scrambled order, and those share no trigram, so
the index cannot reach them. Across the whole vocabulary that is 384 of 9,926
fuzzy pairs, and every one of them is an anagram coincidence — *lal~ala*,
*beti~tiket*, *patni~pani*, *naki~kitna*. A real transposition does not reach
the threshold anyway, so nothing a person would want is lost, and the index
doubles as a precision filter.

## Running it

It is a static site. Open `index.html` from any web server, or host it on
GitHub Pages: Settings → Pages → Deploy from branch → `main`, root.

Once opened in Chrome on Android, use the browser menu → *Add to Home screen*.
After that it opens like an app and works offline.

## Why not a translation model

Neural translation handles anything and gets the edges wrong. A phrasebook
handles the few thousand things people say and gets them right, because a
person who speaks both wrote each line. For conversation, that is the better
tool — and it fits in a file smaller than a photo.

Type is Tiro Devanagari Marathi for Marathi and Tiro Devanagari Hindi for
Hindi; the two languages draw a few letters differently and deserve their own
faces.

MIT.
