// How hard is each enemy? A player bot (MCTS at --piters) duels every enemy
// with a pouch typical of the act it meets them in.
//
//   node tools/balance.mjs --games 40 --piters 300 [--pblunder 0.1] [--only oak,twins]

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { createGame, applyAction } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
import { ENEMIES } from '../src/content.js';
import * as R from '../src/run.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

// A pouch as it might look when meeting an enemy of this act.
function typicalRun(seed, act) {
  const run = R.newRun({ seed });
  run.act = act;
  const gains = [0, 2, 4][act - 1];
  for (let i = 0; i < gains; i++) R.gainStone(run, R.randomStone(run));
  run.slots += act - 1;
  const ups = [0, 1, 3][act - 1];
  for (let i = 0; i < ups; i++) { const u = R.upgradeable(run); if (u.length) R.evolve(u[(R.rand(run) * u.length) | 0]); }
  if (act > 1) run.tricks.push(R.randomTrick(run));
  if (act > 2) run.tricks.push(R.randomTrick(run));
  return run;
}

function duel(spec) {
  const act = spec.act;
  const run = typicalRun(spec.seed, act);
  const duelSpec = R.prepareDuel(run, spec.enemy, { bossWins: spec.life ?? spec.seed % 2 });
  const hand = R.defaultHand(run);
  const s = createGame({ ...R.gameConfig(run, duelSpec, hand), log: false });
  const rng = makeRng(spec.seed * 7 + 1);
  let n = 0;
  while (!s.over && n++ < 200) {
    const me = s.player === 'X';
    const a = chooseAction(s, me ? { iterations: spec.piters, rng, blunder: spec.pblunder } : { iterations: duelSpec.iters, blunder: duelSpec.blunder, rng });
    applyAction(s, a);
  }
  return { enemy: spec.enemy, won: s.winner === 'X' ? 1 : 0, reason: s.reason, conds: duelSpec.conds.join('') };
}

if (!isMainThread) {
  parentPort.postMessage(workerData.map(duel));
} else {
  const games = +arg('games', 30), piters = +arg('piters', 300), pblunder = +arg('pblunder', 0);
  const only = arg('only', null)?.split(',');
  const ids = Object.keys(ENEMIES).filter((k) => !only || only.includes(k));
  const specs = [];
  for (const enemy of ids) for (let g = 0; g < games; g++) specs.push({ enemy, seed: 1000 + g, act: ENEMIES[enemy].act || 1, piters, pblunder, life: arg('life') === undefined ? undefined : +arg('life') });
  const W = Math.max(1, cpus().length);
  const chunks = Array.from({ length: W }, () => []);
  specs.forEach((s, i) => chunks[i % W].push(s));
  const t0 = Date.now();
  const res = (await Promise.all(chunks.filter((c) => c.length).map((c) => new Promise((ok, bad) => {
    const w = new Worker(new URL(import.meta.url), { workerData: c });
    w.on('message', ok); w.on('error', bad);
  })))).flat();
  for (const id of ids) {
    const r = res.filter((x) => x.enemy === id);
    const win = r.reduce((a, b) => a + b.won, 0) / r.length;
    const full = r.filter((x) => x.reason === 'full').length / r.length;
    const e = ENEMIES[id];
    console.log(`${id.padEnd(12)} act ${e.act} ${e.tier.padEnd(6)} win ${(win * 100).toFixed(0).padStart(3)}%   (by full board ${(full * 100).toFixed(0).padStart(3)}%)`);
  }
  console.log(`${res.length} duels in ${((Date.now() - t0) / 1000).toFixed(1)}s on ${W} threads`);
}
