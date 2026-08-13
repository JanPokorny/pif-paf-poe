// How good is a hand? The campaign needs an answer cheap enough to call a million
// times, so this fits one.
//
//   node hands.js --opponents 40 --iters 120 --out results/hands.json
//   node hands.js --report --out results/hands.json
//
// There are 252 distinct hands of five stones. Each plays a sample of the others,
// once from each seat, on a space drawn per game -- the circuit RULES.md settles on,
// because a hand cannot prepare for it and so has to survive all six. A Bradley-Terry
// strength is then fitted to the results, which reduces a hand to one number and a
// duel to `sigmoid(mine - theirs)`.
//
// That reduction is an assumption, not a fact: it says the hands form a ladder rather
// than a rock-paper-scissors. Stinky exists in this game precisely because the Magnet
// needed an answer, so the assumption is checked rather than trusted -- a smaller set
// of hands plays a dense round robin, and the fit is scored against what it predicts.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { STONE_TYPES } from './engine.js';
import { makeRng } from './ai.js';
import { CODE, arg, pad, playGame } from './sim.js';

// Every multiset of five, in a stable order.
export function allHands() {
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === 5) return out.push(acc);
    for (let i = start; i < STONE_TYPES.length; i++) walk(i, [...acc, STONE_TYPES[i]]);
  };
  walk(0, []);
  return out;
}

export const handKey = (hand) => hand.slice().sort().join(',');
export const handLabel = (hand) => hand.map((t) => CODE[t]).join(' ');

// The spaces a circuit visits: one per stone type, plus the neutral space.
const SPACES = [null, ...STONE_TYPES];

// ── Playing the sample ──────────────────────────────────────────────────────

if (!isMainThread && workerData?.kind === 'hands') {
  const { specs, hands, iters } = workerData;
  parentPort.postMessage(specs.map(({ i, j, seed, space }) => {
    const r = playGame({
      opener: hands[i], replier: hands[j], itemO: 'mirror',
      seed, iters, i, j, rules: { disabled: space },
    });
    return [i, j, r.openerWon];
  }));
}

function run(specs, hands, iters, workers) {
  const chunks = Array.from({ length: Math.min(workers, specs.length) }, () => []);
  specs.forEach((s, k) => chunks[k % chunks.length].push(s));
  return Promise.all(chunks.map((specs) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'hands', specs, hands, iters } });
    w.on('message', resolve);
    w.on('error', reject);
  }))).then((r) => r.flat());
}

// ── Bradley-Terry ──────────────────────────────────────────────────────────

// One strength per hand, fitted so that the chance i beats j is
// sigmoid(s_i - s_j). Iterative majorisation, which for this model is the standard
// fixed point and needs no step size.
export function fitStrengths(n, wins, games) {
  const p = new Float64Array(n).fill(1);
  for (let pass = 0; pass < 400; pass++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        const g = games[i][j];
        if (g) denom += g / (p[i] + p[j]);
      }
      next[i] = denom ? wins[i] / denom : p[i];
    }
    // Normalise to a geometric mean of one, so the numbers are comparable run to run.
    let logSum = 0, seen = 0;
    for (let i = 0; i < n; i++) if (next[i] > 0) { logSum += Math.log(next[i]); seen++; }
    const scale = Math.exp(logSum / Math.max(1, seen));
    for (let i = 0; i < n; i++) p[i] = (next[i] || p[i]) / scale;
  }
  return Array.from(p, (v) => Math.log(v));
}

export const duelChance = (mine, theirs) => 1 / (1 + Math.exp(theirs - mine));

// ── Reporting ──────────────────────────────────────────────────────────────

function report(data) {
  const rows = data.hands.map((hand, i) => ({
    label: handLabel(hand), s: data.strength[i],
    rate: data.games[i] ? data.wins[i] / data.games[i] : 0, n: data.games[i],
  })).sort((a, b) => b.s - a.s);

  console.log(`${rows.length} hands, ${data.played} games, ${data.iters} iterations a move\n`);
  console.log(`${pad('', 4)}${pad('hand', 24)}${pad('strength', 10)}${pad('won', 8)}games`);
  const show = (r, k) => console.log(
    `${pad(k, 4)}${pad(r.label, 24)}${pad(r.s.toFixed(3), 10)}${pad((100 * r.rate).toFixed(1) + '%', 8)}${r.n}`);
  rows.slice(0, 8).forEach((r, k) => show(r, k + 1));
  console.log(`${pad('', 4)}...`);
  rows.slice(-8).forEach((r, k) => show(r, rows.length - 7 + k));

  const spread = rows[0].s - rows[rows.length - 1].s;
  console.log(`\nstrength spans ${spread.toFixed(2)}, so the best hand beats the worst`
    + ` ${(100 * duelChance(rows[0].s, rows[rows.length - 1].s)).toFixed(0)}% of the time.`);
  const median = rows[(rows.length / 2) | 0].s;
  console.log(`the best beats the median ${(100 * duelChance(rows[0].s, median)).toFixed(0)}%,`
    + ` and one swap is worth on average ${data.swapGain?.toFixed(3) ?? '?'} of strength.`);

  if (data.dense) {
    const d = data.dense;
    console.log(`\nLadder check: ${d.n} hands in a dense round robin, ${d.games} games a pairing.`);
    console.log(`  the fit predicts a pairing's winner right ${(100 * d.accuracy).toFixed(1)}% of the time`);
    console.log(`  mean error on a pairing's win rate ${(100 * d.meanError).toFixed(1)} points`);
    console.log(`  triples where A beats B beats C beats A: ${(100 * d.intransitive).toFixed(1)}% of ${d.triples}`);
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = {
    opponents: parseInt(arg('opponents', '40'), 10),
    iters: parseInt(arg('iters', '120'), 10),
    dense: parseInt(arg('dense', '14'), 10),      // hands in the ladder check
    denseGames: parseInt(arg('dense-games', '16'), 10),
    seed: parseInt(arg('seed', '31337'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    out: arg('out', 'results/hands.json'),
  };

  if (process.argv.includes('--report')) return report(JSON.parse(readFileSync(opts.out, 'utf8')));

  const hands = allHands();
  const n = hands.length;
  const rng = makeRng(opts.seed);
  const pick = (m) => (rng() * m) | 0;

  // Each hand meets a sample of the others, once from each seat, on a drawn space.
  const specs = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < opts.opponents; k++) {
      const j = pick(n);
      if (j === i) continue;
      const space = SPACES[pick(SPACES.length)];
      specs.push({ i, j, seed: (rng() * 2 ** 31) | 0, space });
      specs.push({ i: j, j: i, seed: (rng() * 2 ** 31) | 0, space });
    }
  }

  // And a dense round robin among a spread of hands, to check the ladder assumption.
  const denseIdx = Array.from({ length: opts.dense }, (_, k) => ((k + 0.5) * n / opts.dense) | 0);
  const denseSpecs = [];
  for (const i of denseIdx) for (const j of denseIdx) {
    if (i >= j) continue;
    for (let g = 0; g < opts.denseGames; g++) {
      const space = SPACES[pick(SPACES.length)];
      denseSpecs.push({ i, j, seed: (rng() * 2 ** 31) | 0, space });
      denseSpecs.push({ i: j, j: i, seed: (rng() * 2 ** 31) | 0, space });
    }
  }

  const started = Date.now();
  const results = await run([...specs, ...denseSpecs], hands, opts.iters, opts.workers);

  const wins = new Float64Array(n), games = Array.from({ length: n }, () => new Float64Array(n));
  for (const [i, j, openerWon] of results) {
    wins[i] += openerWon;
    games[i][j] += 1;
    games[j][i] += 1;
  }
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) total[i] += games[i][j];
  const strength = fitStrengths(n, wins, games);

  // What one swap is worth: over every hand, the mean gain from its best single
  // replacement. It is the size of the reward every rule in the campaign hands out.
  const byKey = new Map(hands.map((h, i) => [handKey(h), i]));
  let gain = 0;
  for (let i = 0; i < n; i++) {
    let best = strength[i];
    for (let k = 0; k < 5; k++) for (const t of STONE_TYPES) {
      const swapped = byKey.get(handKey([...hands[i].slice(0, k), t, ...hands[i].slice(k + 1)]));
      if (swapped !== undefined && strength[swapped] > best) best = strength[swapped];
    }
    gain += best - strength[i];
  }

  // Ladder check, on the dense subset only.
  const dense = (() => {
    const pairs = [];
    for (const i of denseIdx) for (const j of denseIdx) {
      if (i >= j) continue;
      const played = games[i][j];
      if (!played) continue;
      const observed = (wins[i] - 0) / played;   // both seats are in wins[i] and wins[j]
      pairs.push({ i, j, played });
    }
    // Recount properly: wins[i] holds every game i opened, over all opponents, so the
    // per-pair rate has to be taken from the results rather than the totals.
    const tally = new Map();
    for (const [i, j, openerWon] of results) {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      const flip = i < j ? openerWon : 1 - openerWon;
      const t = tally.get(key) ?? { w: 0, n: 0 };
      t.w += flip; t.n += 1;
      tally.set(key, t);
    }
    let right = 0, seen = 0, error = 0;
    const beats = new Map();
    for (const { i, j } of pairs) {
      const t = tally.get(`${i},${j}`);
      if (!t || t.n < 4) continue;
      const observed = t.w / t.n, predicted = duelChance(strength[i], strength[j]);
      seen++;
      error += Math.abs(observed - predicted);
      if ((observed > 0.5) === (predicted > 0.5) || observed === 0.5) right++;
      beats.set(`${i},${j}`, observed > 0.5);
    }
    let triples = 0, cyc = 0;
    const wins3 = (a, b) => (a < b ? beats.get(`${a},${b}`) : !beats.get(`${b},${a}`));
    for (let a = 0; a < denseIdx.length; a++) {
      for (let b = a + 1; b < denseIdx.length; b++) for (let c = b + 1; c < denseIdx.length; c++) {
        const [x, y, z] = [denseIdx[a], denseIdx[b], denseIdx[c]];
        if ([[x, y], [y, z], [x, z]].some(([p, q]) => beats.get(p < q ? `${p},${q}` : `${q},${p}`) === undefined)) continue;
        triples++;
        const ab = wins3(x, y), bc = wins3(y, z), ca = wins3(z, x);
        if (ab === bc && bc === ca) cyc++;
      }
    }
    return {
      n: denseIdx.length, games: opts.denseGames * 2, accuracy: seen ? right / seen : 0,
      meanError: seen ? error / seen : 0, triples, intransitive: triples ? cyc / triples : 0,
    };
  })();

  const data = {
    opts, hands, strength: Array.from(strength), wins: Array.from(wins),
    games: Array.from(total), played: results.length, iters: opts.iters,
    swapGain: gain / n, dense,
  };
  report(data);
  console.log(`\n${((Date.now() - started) / 1000).toFixed(0)}s`);
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(data));
  console.log(`wrote ${opts.out}`);
}

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
