# बोलपथ — Hindi to Marathi phrasebook

A phrasebook, not a translator. A few thousand phrases a bilingual speaker
actually uses, searchable as you type, spoken aloud on tap, working with no
internet once it has loaded.

The whole thing is one HTML page and one spreadsheet.

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
