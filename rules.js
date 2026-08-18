// How much is it worth to have every restriction stone binding at once? Each
// study plays the older rule -- only the most recently placed Magnet or Stinky
// binds -- against the rule as it stands, where all of them do.
//
//   node rules.js --study magnet --pairs 1000 --iters 300 --out results/rules-magnet.json
//   node rules.js --study stinky --pairs 1000 --iters 300 --out results/rules-stinky.json
//   node rules.js --study stinky --report --out results/rules-stinky.json
//
// Both arms replay the same list of (opening hand, replying hand, seed), so a
// pairing differs between them only where the change actually mattered, and the
// interval is on the per-pairing difference.
//
// Under both arms a restriction binds from wherever its stone now stands and
// stops when the stone leaves the board. What differs is how many of them are
// in force: one, or the intersection of all of them, with the whole free board
// back when that intersection is empty.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { allowedSquares, createGame, applyAction, STONE_TYPES } from './engine.js';
import { chooseAction, makeRng } from './ai.js';
import { arg, pad, pct, randomHand, wilson } from './sim.js';

// A study is a stone, the pool it is dealt from, and the one-turn arm to beat.
const STUDIES = {
  magnet: {
    stone: 'magnet', pool: STONE_TYPES,
    arms: { 'one of them': { oneRestriction: true }, 'all at once': {} },
  },
  stinky: {
    // Stinky is dealt twice as often here, so the study sees hands that hold
    // more than one of it -- which is where the change can show at all.
    stone: 'stinky', pool: [...STONE_TYPES, 'stinky'],
    arms: { 'one of them': { oneRestriction: true }, 'all at once': {} },
  },
};

function playGame(spec) {
  const rng = makeRng(spec.seed);
  const s = createGame({ handX: spec.opener, handO: spec.replier, first: 'X', ...spec.rules });

  // How often a placement was actually made under a restriction -- that is, how
  // often the squares on offer were fewer than the free ones. The change is only
  // worth anything to the extent that this number moves.
  let placements = 0, pulled = 0;
  let plies = 0;
  while (!s.over && plies++ < 200) {
    if (s.phase === 'place') {
      placements++;
      if (allowedSquares(s).length < s.board.filter((c) => !c).length) pulled++;
    }
    applyAction(s, chooseAction(s, { iterations: spec.iters, rng }));
  }
  return {
    k: spec.k,
    openerWon: s.winner === 'X' ? 1 : s.winner === null ? 0.5 : 0,
    line: s.reason === 'line' ? 1 : 0,
    turns: s.turns, placements, pulled,
  };
}

if (!isMainThread && workerData?.kind === 'rules') {
  parentPort.postMessage(workerData.specs.map(playGame));
}

function runSpecs(specs, workers) {
  const chunks = Array.from({ length: workers }, () => []);
  specs.forEach((spec, i) => chunks[i % workers].push(spec));
  return Promise.all(chunks.filter((c) => c.length).map((specs) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'rules', specs } });
      w.on('message', resolve);
      w.on('error', reject);
    })
  )).then((r) => r.flat());
}

// ── Reporting ───────────────────────────────────────────────────────────────

const count = (hand, type) => hand.filter((t) => t === type).length;

function report(state) {
  const n = state.pairs;
  const study = STUDIES[state.study];
  const names = Object.keys(study.arms);
  const pairings = buildPairings(state.pairs, state.seed, study.pool);
  console.log(`\nevery ${study.stone} in force: ${n} hand pairings per arm, ` +
    `${Object.keys(state.arms).length} of ${names.length} arms, iters=${state.iters}, ` +
    `pool of ${study.pool.length}\n`);

  const sum = (xs) => xs.reduce((x, y) => x + y, 0);
  const summary = {};
  for (const arm of names) {
    const a = state.arms[arm];
    if (!a) continue;
    summary[arm] = {
      opener: sum(a.wins) / n,
      line: sum(a.line) / n,
      turns: sum(a.turns) / n,
      bound: sum(a.pulled) / sum(a.placements),
    };
  }
  const [first, second] = names;
  if (!summary[first] || !summary[second]) {
    console.log('both arms are needed for a comparison');
    return;
  }

  const diffs = state.arms[second].wins.map((w, k) => w - state.arms[first].wins[k]);
  const delta = sum(diffs) / n;
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - delta) ** 2, 0) / (n - 1));
  const half = 1.96 * sd / Math.sqrt(n);
  const ci = (arm) => {
    const [lo, hi] = wilson(sum(state.arms[arm].wins), n);
    return '[' + pct(lo) + ',' + pct(hi) + ']';
  };

  const row = (name, a, b, tail) =>
    console.log(pad(name, 24) + pad(a, 15) + pad(b, 15) + tail);
  row('', first, second, 'change');
  console.log('-'.repeat(62));
  row('opening seat wins', pct(summary[first].opener) + '%', pct(summary[second].opener) + '%',
    (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + 'pp [' +
    ((delta - half) * 100).toFixed(1) + ',' + ((delta + half) * 100).toFixed(1) + ']');
  row('  95% CI', ci(first), ci(second), '');
  row('placements under it', pct(summary[first].bound) + '%', pct(summary[second].bound) + '%',
    ((summary[second].bound - summary[first].bound) * 100).toFixed(1) + 'pp');
  row('games decided by a line', pct(summary[first].line) + '%', pct(summary[second].line) + '%',
    ((summary[second].line - summary[first].line) * 100).toFixed(1) + 'pp');
  row('mean game length', summary[first].turns.toFixed(2), summary[second].turns.toFixed(2),
    (summary[second].turns - summary[first].turns).toFixed(2) + ' turns');

  // What the change is worth to the stone itself. Every pairing contributes two
  // hand-sides, each with its own count of the stone, and the seats are balanced
  // across the arms because both arms play the identical list of pairings.
  console.log(`\nwin rate by ${study.stone} held, over every hand-side played\n`);
  console.log(pad('rules', 12) + [0, 1, 2, 3, 4, 5].map((k) => pad(`${k} held`, 12)).join(''));
  console.log('-'.repeat(84));
  for (const arm of names) {
    const a = state.arms[arm];
    if (!a) continue;
    const tally = Array.from({ length: 6 }, () => ({ n: 0, w: 0 }));
    pairings.forEach((p, k) => {
      const o = tally[count(p.opener, study.stone)];
      const r = tally[count(p.replier, study.stone)];
      o.n++; o.w += a.wins[k];
      r.n++; r.w += 1 - a.wins[k];
    });
    console.log(pad(arm, 12) +
      tally.map((t) => pad(t.n ? `${pct(t.w / t.n)}% ${t.n}` : '  -', 12)).join(''));
  }
  console.log('\n  a hand-side is one hand in one seat; every pairing contributes two');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

// The same pairings for both arms, and the same ones the report reads back.
function buildPairings(pairs, seed, pool) {
  const rng = makeRng(seed);
  return Array.from({ length: pairs }, (_, k) => ({
    k, opener: randomHand(rng, pool), replier: randomHand(rng, pool), seed: seed + k * 7919,
  }));
}

async function main() {
  const opts = {
    study: arg('study', 'magnet'),
    pairs: parseInt(arg('pairs', '1000'), 10),
    iters: parseInt(arg('iters', '300'), 10),
    seed: parseInt(arg('seed', '54321'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    only: arg('only', null)?.split(','),
    out: arg('out', null),
    reportOnly: process.argv.includes('--report'),
  };
  const study = STUDIES[opts.study];
  if (!study) throw new Error(`unknown study: ${opts.study}`);
  opts.out ??= `results/rules-${opts.study}.json`;

  let state = existsSync(opts.out) ? JSON.parse(readFileSync(opts.out, 'utf8')) : null;
  if (state && !opts.reportOnly &&
    (state.pairs !== opts.pairs || state.iters !== opts.iters || state.study !== opts.study)) {
    throw new Error(`${opts.out} holds study=${state.study} pairs=${state.pairs} iters=${state.iters}`);
  }
  state ??= {
    study: opts.study, pairs: opts.pairs, iters: opts.iters, seed: opts.seed, arms: {},
  };

  if (!opts.reportOnly) {
    const pairings = buildPairings(opts.pairs, opts.seed, study.pool);
    const arms = (opts.only ?? Object.keys(study.arms)).filter((a) => !state.arms[a]);
    if (!arms.length) throw new Error('every requested arm is already in the file');
    console.error(`${arms.length} arms x ${opts.pairs} pairings on ${opts.workers} workers...`);

    for (const arm of arms) {
      const t0 = Date.now();
      const games = await runSpecs(
        pairings.map((p) => ({ ...p, rules: study.arms[arm], iters: opts.iters })), opts.workers);
      const slot = {
        wins: Array(opts.pairs).fill(0), line: Array(opts.pairs).fill(0),
        turns: Array(opts.pairs).fill(0),
        placements: Array(opts.pairs).fill(0), pulled: Array(opts.pairs).fill(0),
      };
      for (const g of games) {
        slot.wins[g.k] = g.openerWon;
        slot.line[g.k] = g.line;
        slot.turns[g.k] = g.turns;
        slot.placements[g.k] = g.placements;
        slot.pulled[g.k] = g.pulled;
      }
      state.arms[arm] = slot;
      console.error(`  ${pad(arm, 12)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, JSON.stringify(state));
    }
  }

  report(state);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
