// app.js — the page. Rendering, chips, speech.
// Search itself lives in search.js, and runs in worker.js when it can.

import { normDev, isDevanagari, fold, toRoman, wordHit, indexRow, buildIndex, searchRows }
  from './search.js';
import { loadTiers, countLabel, strip } from './corpus.js';

const PAGE = 200;
const $ = id => document.getElementById(id);
let situation = null;
let seq = 0;        // every search gets a number, so late answers to
let want = 0;       // abandoned questions can be thrown away

// --- the engine, wherever it ended up ------------------------------------
//
// A module worker is the whole point — parsing and indexing the corpus must
// not touch the main thread. But an old Android WebView may not have one, and
// a phrasebook that fails to open is worse than one that stutters while it
// loads, so the same modules run in the page when the worker cannot be made.

// A worker that cannot parse its own modules reports it asynchronously, well
// after construction succeeded — so the fallback has to be able to take over
// later, not just instead.
let started = false;

function connect() {
  let w;
  try {
    w = new Worker('./worker.js', { type: 'module' });
  } catch {
    return inPage();
  }
  w.addEventListener('message', ({ data }) => {
    started = true;
    if (data.type === 'ready') ready(data);
    else if (data.type === 'results') results(data);
    else if (data.type === 'failed') fail(data.message);
  });
  w.addEventListener('error', e => {
    e.preventDefault();
    if (started) return;
    started = true;
    w.terminate();
    ask = inPage();
  });
  w.postMessage({ type: 'load', base: './' });
  return q => w.postMessage(q);
}

function inPage() {
  let index = null;
  loadTiers('./').then(({ rows, situations, counts }) => {
    index = buildIndex(rows.map(indexRow));
    ready({ situations, label: countLabel(counts), total: rows.length });
  }).catch(err => fail(String(err && err.message || err)));

  return ({ q, situation: sit, seq: n }) => {
    if (!index) return;
    const hits = searchRows(index, q, { situation: sit, limit: PAGE });
    results({ seq: n, q, hits: hits.map(strip) });
  };
}

let ask = connect();

function ready({ situations, label }) {
  $('count').textContent = label;
  buildChips(situations);
  search();
}

function fail(message) {
  $('empty').hidden = false;
  $('empty').innerHTML = `<b>पुस्तक उघडलं नाही</b>The phrasebook could not be `
    + `loaded. ${esc(message)}`;
}

function search() {
  seq += 1;
  want = seq;
  ask({ type: 'search', q: $('q').value, situation, seq });
}

// --- render ---------------------------------------------------------------

function buildChips(situations) {
  $('chips').replaceChildren(...situations.map(s => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = s;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      situation = situation === s ? null : s;
      for (const c of $('chips').children) {
        c.setAttribute('aria-pressed', String(c.textContent === situation));
      }
      search();
    });
    return b;
  }));
}

// Mark whole words the query landed on. Character offsets are useless here,
// since matching happens on a normalised or transliterated form.
function highlight(text, query) {
  const raw = String(query || '').trim();
  if (!raw) return esc(text);
  const dev = isDevanagari(raw);
  const tokens = (dev ? normDev(raw) : fold(raw)).split(' ').filter(Boolean);
  if (!tokens.length) return esc(text);

  return String(text).split(/(\s+)/).map(word => {
    if (!word.trim()) return word;
    const key = dev ? normDev(word) : fold(toRoman(word));
    const hit = tokens.some(t => wordHit(key, t));
    return hit ? `<mark>${esc(word)}</mark>` : esc(word);
  }).join('');
}

// The query is the one the results were found for, not whatever is in the box
// now — otherwise the marks drift ahead of the rows they are marking.
function results({ seq: n, q, hits }) {
  if (n !== want) return;
  $('empty').hidden = hits.length > 0;
  if (!hits.length) {
    $('empty').innerHTML = `<b>कुछ नहीं मिला</b>Nothing for “${esc(q)}”`
      + `${situation ? ` in ${esc(situation)}` : ''}. Try fewer words.`;
  }
  $('results').replaceChildren(...hits.map(p => {
    const li = document.createElement('li');
    li.className = 'phrase';
    const tier = p.tier === 'corpus' ? `<span class="tier">${esc(p.source || 'corpus')}</span> `
      : p.tier === 'built' ? '<span class="tier built">built</span> '
      : '';
    li.innerHTML = `
      <div class="hi" lang="hi">${highlight(p.hindi, q)}</div>
      <div class="mr" lang="mr">${highlight(p.marathi, q)}</div>
      ${p.english ? `<div class="en" lang="en">${highlight(p.english, q)}</div>` : ''}
      <div class="meta">
        <span class="note">${tier}${esc(p.note || '')}</span>
        <button class="say" type="button" aria-label="Speak Marathi">▶ बोला</button>
      </div>`;
    const say = () => speak(p.marathi, li.querySelector('.say'));
    li.querySelector('.say').addEventListener('click', e => { e.stopPropagation(); say(); });
    li.addEventListener('click', say);
    return li;
  }));
}

// --- speech ---------------------------------------------------------------

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => /^mr/i.test(v.lang))
      || voices.find(v => /^hi/i.test(v.lang))
      || null;
}

function speak(text, btn) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'mr-IN';
  u.rate = 0.92;
  if (btn) {
    btn.disabled = true;
    u.onend = u.onerror = () => { btn.disabled = false; };
  }
  speechSynthesis.speak(u);
}

// --- wiring ---------------------------------------------------------------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let t;
$('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 40); });
$('q').focus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => { $('status').textContent = 'Saved for offline use'; })
    .catch(() => {});
}
