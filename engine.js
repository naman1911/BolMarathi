// engine.js — the translation model: which one, getting it, keeping it.
//
// IndicTrans2 ships as two checkpoints, not one. Indic→Indic covers Hindi to
// Marathi; English→Indic is a separate model. Downloading both up front
// would be 500MB before the app does anything, so they are packs: the Indic
// pack arrives first because Hindi and romanised Hindi are what this is for,
// and the English pack is fetched the first time somebody types English.
//
// Once a pack is in the Cache API it never leaves, which is what "offline
// after a while" means here. The service worker handles the shell; this
// handles the weights, because they are too large to sit in the shell's
// install step without making the first load fail on a bad connection.

export const PACKS = {
  indic: {
    id: 'bolmarathi/indictrans2-indic-indic-dist-320M-onnx',
    label: 'Hindi to Marathi',
    bytes: 330 * 1024 * 1024,
    from: 'hin_Deva',
    to: 'mar_Deva',
  },
  english: {
    id: 'bolmarathi/indictrans2-en-indic-dist-200M-onnx',
    label: 'English to Marathi',
    bytes: 210 * 1024 * 1024,
    from: 'eng_Latn',
    to: 'mar_Deva',
  },
};

// Pinned rather than floating: a model that loaded yesterday should load
// today, and a transformers.js minor bump has broken ONNX graphs before.
export const RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

/**
 * A backend is anything that can load a pack and translate with it. The real
 * one runs IndicTrans2 through transformers.js; the stub returns marked text
 * without downloading anything, so the whole app — detection, transliteration,
 * download states, offline behaviour, the interface — can be exercised and
 * tested without 330MB and a GPU.
 */
export function stubBackend({ delay = 40 } = {}) {
  const loaded = new Set();
  return {
    name: 'stub',
    has: pack => loaded.has(pack),
    async load(pack, onProgress) {
      for (let p = 0; p <= 100; p += 20) {
        await new Promise(r => setTimeout(r, delay));
        onProgress({ pack, loaded: (PACKS[pack].bytes * p) / 100, total: PACKS[pack].bytes });
      }
      loaded.add(pack);
    },
    async translate(text, pack) {
      await new Promise(r => setTimeout(r, delay));
      return `[${pack}] ${text}`;
    },
  };
}

/**
 * The real backend. transformers.js keeps model files in the Cache API
 * itself, so a pack that has been fetched once is found there on every later
 * load with no network — the reason `has` asks the cache rather than a flag
 * of our own, which would forget across a reload.
 */
export function onnxBackend({ runtime = RUNTIME } = {}) {
  const pipes = new Map();
  let lib = null;

  async function transformers() {
    if (lib) return lib;
    lib = await import(/* @vite-ignore */ `${runtime}`);
    lib.env.allowLocalModels = false;
    lib.env.useBrowserCache = true;
    return lib;
  }

  return {
    name: 'onnx',

    async has(pack) {
      if (pipes.has(pack)) return true;
      if (!('caches' in globalThis)) return false;
      try {
        const cache = await caches.open('transformers-cache');
        const keys = await cache.keys();
        return keys.some(r => r.url.includes(PACKS[pack].id));
      } catch {
        return false;
      }
    },

    async load(pack, onProgress) {
      if (pipes.has(pack)) return;
      const { pipeline } = await transformers();
      const pipe = await pipeline('translation', PACKS[pack].id, {
        dtype: 'q8',
        progress_callback: p => {
          if (p.status === 'progress') {
            onProgress({ pack, loaded: p.loaded, total: p.total || PACKS[pack].bytes, file: p.file });
          }
        },
      });
      pipes.set(pack, pipe);
    },

    async translate(text, pack) {
      const pipe = pipes.get(pack);
      if (!pipe) throw new Error(`pack ${pack} is not loaded`);
      const out = await pipe(text, {
        src_lang: PACKS[pack].from,
        tgt_lang: PACKS[pack].to,
        max_new_tokens: 256,
      });
      return (Array.isArray(out) ? out[0] : out).translation_text;
    },
  };
}

export function humanBytes(n) {
  if (!n) return '—';
  const mb = n / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
