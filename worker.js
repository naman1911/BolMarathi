// worker.js — the corpus lives here, not on the page.
//
// Parsing four sheets, transliterating every row and building the trigram
// index is work measured in seconds once the phrasebook is large. On the main
// thread that is a frozen page and a keyboard that does not respond. Here it
// is nothing: the page paints, the input takes typing, and results arrive
// when they arrive.
//
// Only three messages cross the boundary. load, ready, and a search paired
// with its results — and the results are stripped of the search keys first,
// because those are most of the weight of a row and the renderer wants none
// of them.

import { indexRow, buildIndex, searchRows } from './search.js';
import { loadTiers, countLabel, strip } from './corpus.js';

const PAGE = 200;
let index = null;

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'load') {
    try {
      const { rows, situations, counts } = await loadTiers(data.base);
      index = buildIndex(rows.map(indexRow));
      self.postMessage({ type: 'ready', situations, label: countLabel(counts), total: rows.length });
    } catch (err) {
      self.postMessage({ type: 'failed', message: String(err && err.message || err) });
    }
    return;
  }

  if (data.type === 'search') {
    if (!index) return;
    const hits = searchRows(index, data.q, {
      situation: data.situation,
      limit: PAGE,
    });
    // seq lets the page drop answers to questions it has stopped asking.
    self.postMessage({ type: 'results', seq: data.seq, q: data.q, hits: hits.map(strip) });
  }
});
