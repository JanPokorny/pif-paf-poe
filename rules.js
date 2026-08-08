// A rules variant, measured against the rules as they stand: what happens if a
// Magnet's pull is permanent instead of lasting one turn?
//
//   node rules.js --pairs 1000 --iters 300 --out results/rules.json
//   node rules.js --report --out results/rules.json
//
// Both arms replay the same list of (opening hand, replying hand, seed), so a
// pairing differs between them only where the change actually mattered, and the
// interval is on the per-pairing difference.
//
// The variant is the smallest one that is still recognisably "persistent": the
// most recently placed Magnet binds its opponent until another Magnet replaces
// it or it leaves the board, rather than for a single turn. Super Magnet is what
// this already does for one item, so under the variant that item is a no-op.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createGame, applyAction } from './engine.js';
import { chooseAction, makeRng } from './ai.js';
import { arg, pad, pct, randomHand, wilson } from './sim.js';

const ARMS = ['base', 'sticky'];

function playGame(spec) {
  const rng = makeRng(spec.seed);
  const s = createGame({
    handX: spec.opener, handO: spec.replier, first: 'X',
    stickyMagnet: spec.arm === 'sticky',
  });

  // How often a placement was actually made under a Magnet's pull: the variant
  // is only worth anything to the extent that this number moves.
  let placements = 0, pulled = 0;
  let plies = 0;
  while (!s.over && plies++ < 200) {
    if (s.phase === 'place') {
      placements++;
      const r = s.restriction;
      if (r && r.owner !== s.player && s.board.some((c) => c?.id === r.id)) pulled++;
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
  const pairings = buildPairings(state.pairs, state.seed);
  console.log(`\npersistent Magnet: ${n} hand pairings per arm, ` +
    `${Object.keys(state.arms).length} arms, iters=${state.iters}\n`);

  const summary = {};
  for (const arm of ARMS) {
    const a = state.arms[arm];
    if (!a) continue;
    const sum = (xs) => xs.reduce((x, y) => x + y, 0);
    summary[arm] = {
      opener: sum(a.wins) / n,
      line: sum(a.line) / n,
      turns: sum(a.turns) / n,
      pull: sum(a.pulled) / sum(a.placements),
    };
  }
  const base = summary.base, sticky = summary.sticky;
  if (!base || !sticky) { console.log('both arms are needed for a comparison'); return; }

  const diffs = state.arms.sticky.wins.map((w, k) => w - state.arms.base.wins[k]);
  const delta = diffs.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - delta) ** 2, 0) / (n - 1));
  const half = 1.96 * sd / Math.sqrt(n);
  const [blo, bhi] = wilson(state.arms.base.wins.reduce((x, y) => x + y, 0), n);
  const [slo, shi] = wilson(state.arms.sticky.wins.reduce((x, y) => x + y, 0), n);

  console.log(pad('', 24) + pad('one turn', 12) + pad('persistent', 12) + 'change');
  console.log('-'.repeat(60));
  console.log(pad('opening seat wins', 24) + pad(pct(base.opener) + '%', 12) +
    pad(pct(sticky.opener) + '%', 12) +
    (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + 'pp [' +
    ((delta - half) * 100).toFixed(1) + ',' + ((delta + half) * 100).toFixed(1) + ']');
  console.log(pad('  95% CI', 24) + pad('[' + pct(blo) + ',' + pct(bhi) + ']', 14) +
    '[' + pct(slo) + ',' + pct(shi) + ']');
  console.log(pad('placements under a pull', 24) + pad(pct(base.pull) + '%', 12) +
    pad(pct(sticky.pull) + '%', 12) +
    ((sticky.pull - base.pull) * 100).toFixed(1) + 'pp');
  console.log(pad('games decided by a line', 24) + pad(pct(base.line) + '%', 12) +
    pad(pct(sticky.line) + '%', 12) + ((sticky.line - base.line) * 100).toFixed(1) + 'pp');
  console.log(pad('mean game length', 24) + pad(base.turns.toFixed(2), 12) +
    pad(sticky.turns.toFixed(2), 12) + (sticky.turns - base.turns).toFixed(2) + ' turns');

  // What the change is worth to the stone itself. Every pairing contributes two
  // hand-sides, each with its own Magnet count, and the seats are balanced
  // across the arms because both arms play the identical list of pairings.
  console.log('\nwin rate by Magnets held, over every hand-side played\n');
  console.log(pad('rules', 12) + [0, 1, 2, 3, 4, 5].map((k) => pad(`${k} held`, 12)).join(''));
  console.log('-'.repeat(84));
  for (const arm of ARMS) {
    const a = state.arms[arm];
    if (!a) continue;
    const tally = Array.from({ length: 6 }, () => ({ n: 0, w: 0 }));
    pairings.forEach((p, k) => {
      const o = tally[count(p.opener, 'magnet')];
      const r = tally[count(p.replier, 'magnet')];
      o.n++; o.w += a.wins[k];
      r.n++; r.w += 1 - a.wins[k];
    });
    console.log(pad(arm === 'base' ? 'one turn' : 'persistent', 12) +
      tally.map((t) => pad(t.n ? `${pct(t.w / t.n)}% ${t.n}` : '  -', 12)).join(''));
  }
  console.log('\n  a hand-side is one hand in one seat; every pairing contributes two');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

// The same pairings for both arms, and the same ones the report reads back.
function buildPairings(pairs, seed) {
  const rng = makeRng(seed);
  return Array.from({ length: pairs }, (_, k) => ({
    k, opener: randomHand(rng), replier: randomHand(rng), seed: seed + k * 7919,
  }));
}

async function main() {
  const opts = {
    pairs: parseInt(arg('pairs', '1000'), 10),
    iters: parseInt(arg('iters', '300'), 10),
    seed: parseInt(arg('seed', '54321'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    only: arg('only', null)?.split(','),
    out: arg('out', 'results/rules.json'),
    reportOnly: process.argv.includes('--report'),
  };

  let state = existsSync(opts.out) ? JSON.parse(readFileSync(opts.out, 'utf8')) : null;
  if (state && (state.pairs !== opts.pairs || state.iters !== opts.iters) && !opts.reportOnly) {
    throw new Error(`${opts.out} was built with pairs=${state.pairs} iters=${state.iters}`);
  }
  state ??= { pairs: opts.pairs, iters: opts.iters, seed: opts.seed, arms: {} };

  if (!opts.reportOnly) {
    const pairings = buildPairings(opts.pairs, opts.seed);
    const arms = (opts.only ?? ARMS).filter((a) => !state.arms[a]);
    if (!arms.length) throw new Error('every requested arm is already in the file');
    console.error(`${arms.length} arms x ${opts.pairs} pairings on ${opts.workers} workers...`);

    for (const arm of arms) {
      const t0 = Date.now();
      const games = await runSpecs(
        pairings.map((p) => ({ ...p, arm, iters: opts.iters })), opts.workers);
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
