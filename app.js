// app.js — the page. Typing, the language readout, speech, and asking for
// a model pack when there isn't one. Everything slow lives in the worker.

import { PACKS, humanBytes } from './engine.js';

const $ = id => document.getElementById(id);
const IDLE = 450;        // inference is expensive; do not start one per keystroke

let seq = 0, want = 0;
let override = null;     // a language the person picked over the guess
let packs = {};
let pending = null;      // pack the current input needs but does not have
let timer;

// A stub backend runs the whole app without downloading a model, which is
// how the interface gets tested. ?stub is for that, not for people.
const stub = new URLSearchParams(location.search).has('stub');
const worker = new Worker('./translate.worker.js', { type: 'module' });
worker.addEventListener('message', ({ data }) => handle(data));
worker.postMessage({ type: 'init', base: './', stub });

// --- talking to the worker ------------------------------------------------

function ask() {
  const text = $('q').value.trim();
  if (!text) { show(null); return; }
  seq += 1; want = seq;
  worker.postMessage({ type: 'translate', seq, text, override });
}

function handle(m) {
  if (m.type === 'ready') {
    packs = m.packs;
    note(`${m.backend === 'stub' ? 'stub engine — no model' : 'IndicTrans2'}`);
    paintPack();
    return;
  }
  if (m.type === 'reading') {
    if (m.seq !== want) return;
    paintReading(m.lang, m.confident);
    $('via').textContent = m.source !== $('q').value.trim() ? m.source : '';
    $('via').hidden = !$('via').textContent;
    return;
  }
  if (m.type === 'needs') {
    if (m.seq !== want) return;
    pending = m.pack;
    // Clear whatever the last translation left behind. Leaving it under a
    // download prompt reads as if it were the answer to what was just typed.
    show(null);
    $('idle').textContent = `${PACKS[m.pack].label} needs its model first.`;
    $('idle').hidden = false;
    paintPack();
    return;
  }
  if (m.type === 'progress') {
    const pct = m.total ? Math.min(100, (100 * m.loaded) / m.total) : 0;
    $('packBar').hidden = false;
    $('packFill').style.width = `${pct}%`;
    $('packGet').disabled = true;
    $('packGet').textContent = `downloading… ${Math.round(pct)}%`;
    return;
  }
  if (m.type === 'fetched') {
    packs[m.pack] = true;
    pending = null;
    paintPack();
    ask();
    return;
  }
  if (m.type === 'result') {
    if (m.seq !== want) return;
    show(m.empty ? null : m.marathi);
    return;
  }
  if (m.type === 'failed') {
    show(null);
    $('idle').textContent = m.message;
    $('idle').hidden = false;
  }
}

// --- painting -------------------------------------------------------------

function show(marathi) {
  const has = Boolean(marathi);
  $('mr').textContent = marathi || '';
  $('mr').hidden = !has;
  $('actions').hidden = !has;
  $('idle').hidden = has;
  if (!has) {
    $('idle').textContent = $('q').value.trim() ? 'Translating…' : 'Marathi appears here.';
    $('via').hidden = true;
    $('reading').hidden = !$('q').value.trim();
  }
}

function paintReading(lang, confident) {
  $('reading').hidden = false;
  for (const c of $('reading').querySelectorAll('.chip')) {
    c.setAttribute('aria-pressed', String(c.dataset.lang === lang));
  }
  // Single words are where detection is genuinely ambiguous. Saying so is
  // more useful than quietly picking one and being wrong half the time.
  $('unsure').hidden = confident;
}

function paintPack() {
  const name = pending || (packs.indic ? null : 'indic');
  if (!name || packs[name]) {
    $('pack').hidden = true;
    const have = Object.keys(PACKS).filter(p => packs[p]);
    note(have.length ? `${have.length} of ${Object.keys(PACKS).length} packs — works offline` : '');
    return;
  }
  const pack = PACKS[name];
  $('pack').hidden = false;
  $('packName').textContent = pack.label;
  $('packWhy').textContent = `${humanBytes(pack.bytes)} once. After this it runs on the `
    + `phone with no connection, and stays until you clear the browser's data.`;
  $('packGet').disabled = false;
  $('packGet').textContent = `Download ${humanBytes(pack.bytes)}`;
  $('packGet').onclick = () => worker.postMessage({ type: 'fetch', pack: name });
}

function note(text) { $('net').textContent = navigator.onLine ? text : 'offline'; }

// --- speech ---------------------------------------------------------------

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const v = voices.find(x => /^mr/i.test(x.lang)) || voices.find(x => /^hi/i.test(x.lang));
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'mr-IN';
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

// --- wiring ---------------------------------------------------------------

$('q').addEventListener('input', () => {
  override = null;              // new text, so the old correction no longer applies
  clearTimeout(timer);
  timer = setTimeout(ask, IDLE);
  if (!$('q').value.trim()) show(null);
});

for (const chip of document.querySelectorAll('.reading .chip')) {
  chip.addEventListener('click', () => { override = chip.dataset.lang; ask(); });
}

$('say').addEventListener('click', () => speak($('mr').textContent));
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('mr').textContent);
    $('copy').textContent = 'copied';
    setTimeout(() => { $('copy').textContent = 'copy'; }, 1200);
  } catch { /* a browser that will not copy is not worth an error */ }
});

addEventListener('online', () => note($('net').textContent));
addEventListener('offline', () => note(''));

$('foot').textContent = 'IndicTrans2 by AI4Bharat, MIT. Runs on the device — nothing typed '
  + 'here is sent anywhere.';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
