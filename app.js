// app.js — the page. Data loading, rendering, speech.
// Search itself lives in search.js.

import { indexRow, searchRows, normDev, isDevanagari, fold, toRoman } from './search.js';
import { expand } from './templates.js';

const $ = id => document.getElementById(id);
let phrases = [];
let situation = null;

// --- data -----------------------------------------------------------------

async function sheet(name) {
  const res = await fetch(name, { cache: 'no-cache' }).catch(() => null);
  return res && res.ok ? parseCSV(await res.text()) : [];
}

// Two tiers. phrases.csv is hand-written and checked; corpus.csv, if present,
// is drawn from open parallel corpora and labelled with its source.
// Three tiers, in descending order of how much a person stands behind them:
// hand-written phrases, sentences built from checked patterns and words, and
// anything drawn from open parallel corpora.
async function load() {
  const [curated, patterns, nouns, corpus] = await Promise.all([
    sheet('./phrases.csv'), sheet('./patterns.csv'),
    sheet('./nouns.csv'), sheet('./corpus.csv'),
  ]);
  const built = patterns.length && nouns.length ? expand(patterns, nouns) : [];

  phrases = [
    ...curated.map(p => ({ ...p, tier: 'curated' })),
    ...built,
    ...corpus.map(p => ({ ...p, tier: 'corpus', status: 'corpus' })),
  ].map(indexRow);

  const parts = [`${curated.length} phrases`];
  if (built.length) parts.push(`${built.length} built`);
  if (corpus.length) parts.push(`${corpus.length} from corpora`);
  $('count').textContent = parts.join(' + ');
  buildChips(curated);
  render();
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(v => v.trim()));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// --- render ---------------------------------------------------------------

function buildChips(curated) {
  const sits = [...new Set(curated.map(p => p.situation).filter(Boolean))];
  $('chips').replaceChildren(...sits.map(s => {
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
      render();
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
    const hit = tokens.some(t => key.startsWith(t) || (t.length > 3 && key.includes(t)));
    return hit ? `<mark>${esc(word)}</mark>` : esc(word);
  }).join('');
}

function render() {
  const q = $('q').value;
  const hits = searchRows(phrases, q, { situation }).slice(0, 200);
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
$('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 40); });
$('q').focus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => { $('status').textContent = 'Saved for offline use'; })
    .catch(() => {});
}

load();
