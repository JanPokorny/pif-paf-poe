// How strong is each stone? A hand of it plus a Shift plays a hand of Shift
// and Rotate, the enemy opening, same search budget.
//
//   node tools/stones.mjs --games 60 --iters 200

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { createGame, applyAction, STONE_TYPES } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = ['shift', 'rotate'];

function play({ type, seed, iters }) {
  const first = seed % 2 ? 'X' : 'O';
  const s = createGame({ handX: [type, 'shift'], handO: BASE, first, log: false });
  const rng = makeRng(seed);
  while (!s.over) applyAction(s, chooseAction(s, { iterations: iters, rng }));
  return { type, won: s.winner === 'X' ? 1 : 0, first };
}

if (!isMainThread) parentPort.postMessage(workerData.map(play));
else {
  const games = +arg('games', 60), iters = +arg('iters', 200);
  const specs = [];
  for (const type of STONE_TYPES) for (let g = 0; g < games; g++) specs.push({ type, seed: g + 1, iters });
  const W = cpus().length, chunks = Array.from({ length: W }, () => []);
  specs.forEach((s, i) => chunks[i % W].push(s));
  const res = (await Promise.all(chunks.map((c) => new Promise((ok) => { const w = new Worker(new URL(import.meta.url), { workerData: c }); w.on('message', ok); })))).flat();
  const rows = STONE_TYPES.map((t) => {
    const r = res.filter((x) => x.type === t);
    const o = r.filter((x) => x.first === 'X'), d = r.filter((x) => x.first === 'O');
    const m = (a) => a.reduce((s, x) => s + x.won, 0) / a.length;
    return [t, m(r), m(o), m(d)];
  }).sort((a, b) => b[1] - a[1]);
  for (const [t, all, o, d] of rows) console.log(`${t.padEnd(12)} ${(all * 100).toFixed(0).padStart(3)}%   opening ${(o * 100).toFixed(0).padStart(3)}%  replying ${(d * 100).toFixed(0).padStart(3)}%`);
}
