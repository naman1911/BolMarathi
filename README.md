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
