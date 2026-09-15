# बोलपथ — Hindi, roman or English into Marathi

A translator that runs on the phone. Type Devanagari, type "kitna hai", or
type English; get Marathi. After the model has been fetched once it needs no
connection, and nothing typed into it is ever sent anywhere.

## How a sentence gets through

    text
      → which language is this?          detect.js
      → Devanagari, if it came in roman  translit.js  + lexicon.json
      → the model pack for that language engine.js
      → Marathi

Everything after the first step happens in a worker. Inference is seconds of
solid arithmetic and the page has to stay typeable while it runs.

### Reading the input

Devanagari answers itself. Latin does not: "station kahan hai" and "where is
the station" are the same alphabet and different languages, and getting it
wrong means translating a sentence as if it were written in a language it was
not. Detection uses vocabulary first — a roman lexicon on one side, English
words on the other — and falls back to spelling when neither list has seen the
word, because romanised Hindi has a shape that English does not.

    node detect.test.mjs

Every row of `phrases.csv` holds the same phrase three ways, which is 1,833
labelled examples. The lexicon is rebuilt five times from four fifths of the
rows and scored on the fifth it has never seen:

| input | read correctly |
| --- | --- |
| Devanagari | 100% |
| romanised Hindi | 89.7% |
| English | 92.6% |
| **overall** | **94.1%** |

Split by length, which is where the truth is:

| | |
| --- | --- |
| two or more words | 97.4% |
| a single word | 80.9% |

A bare word is ambiguous and no amount of cleverness fixes it — *das* is ten
in Hindi and a plausible nothing in English. So the app shows which way it
read the input, marks the reading as uncertain when it is, and lets you say
otherwise in one tap. That is the honest interface for a problem that does
not have a right answer.

### Roman into Devanagari

The model has never seen "kitna hai" and never will. Something has to put it
into Devanagari first, and that turns out to be mostly a dictionary problem
rather than a spelling one.

Hindi writes an inherent *a* after every consonant and then declines to
pronounce most of them; roman spelling follows the pronunciation. कितना is
typed *kitna* — the schwa after त exists in the script and not in the input.
Going backwards means putting back a vowel that was never typed, and no rule
decides reliably where: कितना takes one after त, रस्ता does not, and both look
like CC in roman.

A dictionary knows. `build-lexicon.mjs` zips the Hindi and roman columns of
`phrases.csv` word by word — 611 checked phrases give 1,329 checked word
pairs for free — and keys them by the same phonetic fold the old search used,
so *kitna*, *kitnaa* and *kithna* all arrive at the same entry.

    node build-lexicon.mjs      # -> lexicon.json, 31 KB
    node translit.test.mjs

Held out five ways, so a test word is never in the lexicon scoring it:

| | exact |
| --- | --- |
| words the lexicon has never seen | 79.0% |
| the same words, rules alone | 40.5% |
| whole phrases, every word right | 55.2% |

The gap between those first two rows is the entire argument for shipping a
dictionary. Words the lexicon *does* know are exact, and it knows 1,073 of
them — so in practice the rules only handle names and neologisms.

## The models

IndicTrans2 by AI4Bharat, distilled and quantized to int8. It ships as two
checkpoints, so this ships two packs:

| pack | | when |
| --- | --- | --- |
| Indic→Indic, 320M | ~330 MB | Hindi and roman — fetched first |
| English→Indic, 200M | ~210 MB | the first time you type English |

Both would be over half a gigabyte before the app did anything, which is why
the English one waits until it is needed. A pack lives in the browser's cache
once fetched and stays until site data is cleared. The service worker holds
the shell — page, modules, lexicon — and deliberately does not touch the
weights: an install step that large fails on the connections this is for.

### Producing them

`export/export_indictrans2.py` converts IndicTrans2 to ONNX, quantizes it, and
writes the layout transformers.js reads. Run it, upload the directory, put its
name in `engine.js`.

**This script has not been run.** The sandbox it was written in has no network
route to HuggingFace, so the model was never downloaded and the export never
executed. It is a considered starting point, and its two hazards — Optimum not
recognising IndicTrans2's custom architecture, and IndicTrans2's two-sided
SentencePiece tokenizer becoming one `tokenizer.json` — are documented at the
top of the file. The tokenizer is the one that matters: get it subtly wrong
and the model returns fluent, confident, entirely incorrect Marathi rather
than an error, which is why the script asserts a round trip before finishing.

Everything else in this repository has been run and measured.

## Running it

A static site; it needs a web server, not a `file://` URL, because it uses
modules and a worker.

    python3 -m http.server 8000

`?stub` swaps the model for a stub that echoes marked text. The whole app —
detection, transliteration, the download states, offline behaviour — works
under it without fetching 330MB, which is how the interface is tested.

For GitHub Pages: Settings → Pages → Deploy from branch → `main`, root. On
Android, the browser menu → *Add to Home screen* makes it open like an app.

## What was here before

A hand-written phrasebook with a trigram search index over 611 curated
phrases and 1,597 built from a pattern table. It is in the history, and
`phrases.csv`, `patterns.csv` and `nouns.csv` still earn their place: they are
what the transliteration lexicon and the language detector are built from, and
what both are measured against.

Type is Tiro Devanagari Marathi for Marathi and Tiro Devanagari Hindi for
Hindi; the two languages draw a few letters differently and deserve their own
faces.

MIT. IndicTrans2 is MIT, by AI4Bharat.
