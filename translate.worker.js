// translate.worker.js — the whole pipeline, off the main thread.
//
//   text → which language is this → Devanagari if it arrived in roman
//        → the pack that handles that language → Marathi
//
// Inference is seconds of solid arithmetic, so none of it can happen on the
// page. The worker owns the lexicon and the model packs and reports back in
// three kinds of message: what it detected, how a download is going, and the
// translation when there is one.

import { detect, HINDI, ROMAN, ENGLISH } from './detect.js';
import { transliterate, loadLexicon } from './translit.js';
import { PACKS, stubBackend, onnxBackend } from './engine.js';

let lexicon = { roman: {}, english: [] };
let backend = null;

const packFor = lang => (lang === ENGLISH ? 'english' : 'indic');
const post = m => self.postMessage(m);

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'init') {
      lexicon = await loadLexicon(data.base);
      lexicon.english = new Set(lexicon.english || []);
      backend = data.stub ? stubBackend() : onnxBackend();
      const ready = {};
      for (const name of Object.keys(PACKS)) ready[name] = await backend.has(name);
      post({ type: 'ready', packs: ready, backend: backend.name });
      return;
    }

    if (data.type === 'translate') {
      const { seq, text } = data;
      const raw = String(text || '').trim();
      if (!raw) { post({ type: 'result', seq, empty: true }); return; }

      // An override means the person looked at what we guessed and disagreed,
      // so it wins outright rather than being folded in as another signal.
      const guess = detect(raw, lexicon);
      const lang = data.override || guess.lang;
      const pack = packFor(lang);

      // Roman goes through the lexicon on its way in. The model has never
      // seen "kitna hai" and never will.
      const source = lang === ROMAN ? transliterate(raw, lexicon.roman) : raw;
      post({
        type: 'reading', seq, lang, source,
        confident: data.override ? true : guess.confident,
      });

      if (!(await backend.has(pack))) {
        post({ type: 'needs', seq, pack, lang });
        return;
      }
      await backend.load(pack, p => post({ type: 'progress', ...p }));
      const marathi = await backend.translate(source, pack);
      post({ type: 'result', seq, marathi, source, lang, pack });
      return;
    }

    if (data.type === 'fetch') {
      const { pack } = data;
      post({ type: 'progress', pack, loaded: 0, total: PACKS[pack].bytes });
      await backend.load(pack, p => post({ type: 'progress', ...p }));
      post({ type: 'fetched', pack });
      return;
    }
  } catch (err) {
    post({ type: 'failed', seq: data.seq, message: String((err && err.message) || err) });
  }
});
