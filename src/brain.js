// The enemy thinks in a Web Worker so the page never freezes; if workers are
// unavailable it thinks on the main thread instead.

import { chooseAction } from './ai.js';

let worker = null;
let seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker === false) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (w) { waiting.delete(e.data.id); w.resolve(e.data.action); }
    };
    worker.onerror = () => {
      worker = false;
      for (const [, w] of waiting) w.fallback();
      waiting.clear();
    };
  } catch {
    worker = false;
  }
  return worker || null;
}

export function think(state, opts) {
  const plain = { ...state, log: null };
  return new Promise((resolve) => {
    const fallback = () => resolve(chooseAction(plain, opts));
    const w = getWorker();
    if (!w) return setTimeout(fallback, 0);
    const id = ++seq;
    waiting.set(id, { resolve, fallback });
    w.postMessage({ id, state: plain, opts });
  });
}
