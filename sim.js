// Random-hand round robin: how much does the hand you were dealt decide the game,
// and how much does the seat? Runs on Node 22 (ESM detection) and on Deno.
//
//   node sim.js --hands 24 --games 3 --iters 800
//   node sim.js --hands 12 --games 2 --iters 400 --out sim/random-hands.json
//
// A sample of random five-stone hands plays every other hand in the sample, once
// from each seat, so every hand opens exactly as often as it replies and the
// first-mover advantage cannot leak into the hand ranking.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createGame, applyAction, ALL_TYPES, STONE_TYPES } from './engine.js';
import { chooseAction, makeRng } from './ai.js';

export const CODE = {
  shift: 'shi', '2048': '204', rotate: 'rot',
  mountain: 'mou', magnet: 'mag', stinky: 'sti',
  swap: 'swa',   // cut from the pool; older result files still name it
};

// ── One game ────────────────────────────────────────────────────────────────

// X is always the opening seat, so a spec says which hand opens rather than
// which hand is X. Both sides search with the same budget off the same stream.
export function playGame(spec) {
  const rng = makeRng(spec.seed);
  // `spec.rules` carries whatever rules variant the caller is studying, if any.
  // Items are the seat's, not the hand's: only the replier's is ever live.
  const s = createGame({
    handX: spec.opener, handO: spec.replier, first: 'X',
    itemX: spec.itemX ?? null, itemO: spec.itemO ?? null,
    ...(spec.rules ?? {}),
  });
  while (!s.over) applyAction(s, chooseAction(s, { iterations: spec.iters, rng }));
  return {
    opener: spec.i,
    replier: spec.j,
    openerWon: s.winner === 'X' ? 1 : s.winner === null ? 0.5 : 0,
    reason: s.reason,
    turns: s.turns,
  };
}

// ── Workers ─────────────────────────────────────────────────────────────────

// evolve.js imports this module inside its own workers, so the two guards key
// off `kind` rather than off being a worker at all.
if (!isMainThread && workerData?.kind === 'roundrobin') {
  parentPort.postMessage(workerData.specs.map(playGame));
}

function runSpecs(specs, workers) {
  const chunks = Array.from({ length: workers }, () => []);
  specs.forEach((spec, i) => chunks[i % workers].push(spec));

  return Promise.all(chunks.filter((c) => c.length).map((specs) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'roundrobin', specs } });
      w.on('message', resolve);
      w.on('error', reject);
    })
  )).then((results) => results.flat());
}

// ── Setup ───────────────────────────────────────────────────────────────────

export function sortHand(hand) {
  return hand.slice().sort((a, b) => ALL_TYPES.indexOf(a) - ALL_TYPES.indexOf(b));
}

// `pool` is the set of stones being dealt: the game's own by default, something
// wider when a stone is under evaluation.
export function randomHand(rng, pool = STONE_TYPES) {
  return sortHand(Array.from({ length: 5 }, () => pool[(rng() * pool.length) | 0]));
}

export function randomHands(count, rng, pool = STONE_TYPES) {
  const hands = [];
  const seen = new Set();
  while (hands.length < count) {
    const hand = randomHand(rng, pool);
    const key = hand.join(',');
    if (seen.has(key)) continue;   // a repeat would be its own mirror match
    seen.add(key);
    hands.push(hand);
  }
  return hands;
}

// Every ordered pair, so each hand opens against the whole field and replies to
// the whole field. `games` is per ordered pair: the total is hands*(hands-1)*games.
function buildSpecs(hands, opts) {
  const specs = [];
  let seed = opts.seed;
  for (let i = 0; i < hands.length; i++) {
    for (let j = 0; j < hands.length; j++) {
      if (i === j) continue;
      for (let g = 0; g < opts.games; g++) {
        specs.push({ i, j, opener: hands[i], replier: hands[j], iters: opts.iters, seed: seed++ });
      }
    }
  }
  return specs;
}

// ── Reporting ───────────────────────────────────────────────────────────────

// Wilson score interval: an exact-ish 95% band that stays sane at the small
// per-hand sample sizes this study can afford.
export function wilson(wins, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = wins / n;
  const d = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / d;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export const pad = (s, n) => String(s).padEnd(n);
export const pct = (x) => (x * 100).toFixed(1).padStart(5);

function report(hands, games, opts) {
  const rows = hands.map((hand, i) => ({
    i, hand,
    label: hand.map((t) => CODE[t]).join(' '),
    first: { wins: 0, n: 0 },
    second: { wins: 0, n: 0 },
    turns: 0,
  }));

  let openerWins = 0, byLine = 0, turns = 0;
  for (const g of games) {
    rows[g.opener].first.wins += g.openerWon;
    rows[g.opener].first.n++;
    rows[g.replier].second.wins += 1 - g.openerWon;
    rows[g.replier].second.n++;
    rows[g.opener].turns += g.turns;
    rows[g.replier].turns += g.turns;
    openerWins += g.openerWon;
    if (g.reason === 'line') byLine++;
    turns += g.turns;
  }

  for (const r of rows) {
    r.n = r.first.n + r.second.n;
    r.wins = r.first.wins + r.second.wins;
    r.rate = r.wins / r.n;
    r.firstRate = r.first.wins / r.first.n;
    r.secondRate = r.second.wins / r.second.n;
    r.ci = wilson(r.wins, r.n);
    r.meanTurns = r.turns / r.n;
  }
  rows.sort((a, b) => b.rate - a.rate);

  console.log(`\nrandom hands: ${hands.length} hands, ${games.length} games, ` +
    `${rows[0].n} per hand (${rows[0].first.n} opening, ${rows[0].second.n} replying), iters=${opts.iters}`);

  console.log('\nper-hand win rate, whole field, both seats\n');
  console.log(pad('hand', 24) + pad('total', 8) + pad('95% CI', 17) +
    pad('1st', 8) + pad('2nd', 8) + pad('seat gap', 10) + 'turns');
  console.log('-'.repeat(82));
  for (const r of rows) {
    console.log(pad(r.label, 24) + pad(pct(r.rate) + '%', 8) +
      pad('[' + pct(r.ci[0]) + ',' + pct(r.ci[1]) + ']', 17) +
      pad(pct(r.firstRate) + '%', 8) + pad(pct(r.secondRate) + '%', 8) +
      pad(((r.firstRate - r.secondRate) * 100).toFixed(1) + 'pp', 10) +
      r.meanTurns.toFixed(1));
  }

  // Marginal value of holding a stone at all: the field is random, so a type's
  // holders and non-holders are otherwise comparable samples of hands.
  console.log('\nstone types, by the hands that hold them\n');
  console.log(pad('stone', 10) + pad('hands', 7) + pad('copies', 8) +
    pad('holders', 9) + pad('others', 9) + 'delta');
  console.log('-'.repeat(52));
  const stoneRows = STONE_TYPES.map((t) => {
    const held = rows.filter((r) => r.hand.includes(t));
    const rest = rows.filter((r) => !r.hand.includes(t));
    const mean = (list) => list.reduce((s, r) => s + r.rate, 0) / (list.length || 1);
    return {
      t, hands: held.length,
      copies: rows.reduce((s, r) => s + r.hand.filter((x) => x === t).length, 0),
      held: held.length ? mean(held) : null,
      rest: rest.length ? mean(rest) : null,
    };
  }).sort((a, b) => (b.held ?? 0) - (a.held ?? 0));
  for (const s of stoneRows) {
    console.log(pad(s.t, 10) + pad(s.hands, 7) + pad(s.copies, 8) +
      pad(s.held === null ? '  -  ' : pct(s.held) + '%', 9) +
      pad(s.rest === null ? '  -  ' : pct(s.rest) + '%', 9) +
      (s.held === null || s.rest === null ? '-' : ((s.held - s.rest) * 100).toFixed(1) + 'pp'));
  }

  const openerRate = openerWins / games.length;
  const [lo, hi] = wilson(openerWins, games.length);
  const gaps = rows.map((r) => r.firstRate - r.secondRate);
  console.log('\nsummary');
  console.log('  opening seat wins    ' + pct(openerRate) + '% [' + pct(lo) + ',' + pct(hi) + ']');
  console.log('  hand spread          ' + pct(rows[0].rate) + '% (' + rows[0].label + ') to ' +
    pct(rows[rows.length - 1].rate) + '% (' + rows[rows.length - 1].label + '), ' +
    ((rows[0].rate - rows[rows.length - 1].rate) * 100).toFixed(1) + 'pp');
  console.log('  seat gap per hand    ' + (gaps.reduce((s, g) => s + g, 0) / gaps.length * 100).toFixed(1) +
    'pp mean, ' + (Math.min(...gaps) * 100).toFixed(1) + 'pp to ' + (Math.max(...gaps) * 100).toFixed(1) + 'pp');
  console.log('  hands better 2nd     ' + gaps.filter((g) => g < 0).length + '/' + rows.length);
  console.log('  games decided by     ' + pct(byLine / games.length) + '% line, ' +
    pct(1 - byLine / games.length) + '% full board');
  console.log('  mean game length     ' + (turns / games.length).toFixed(1) + ' turns');

  return { rows, openerRate, stoneRows, byLine: byLine / games.length, turns: turns / games.length };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
}

async function main() {
  const opts = {
    hands: parseInt(arg('hands', '24'), 10),
    games: parseInt(arg('games', '3'), 10),
    iters: parseInt(arg('iters', '800'), 10),
    seed: parseInt(arg('seed', '4242'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    handsFile: arg('hands-file', null),   // a JSON array of hands, e.g. from evolve.js
    out: arg('out', null),
  };

  // A supplied field replaces the random sample; everything downstream is the same.
  const hands = opts.handsFile
    ? JSON.parse(readFileSync(opts.handsFile, 'utf8')).map(sortHand)
    : randomHands(opts.hands, makeRng(opts.seed));
  opts.hands = hands.length;
  const specs = buildSpecs(hands, opts);
  console.error(`playing ${specs.length} games on ${opts.workers} workers...`);

  const t0 = Date.now();
  const games = await runSpecs(specs, opts.workers);
  console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const out = report(hands, games, opts);
  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ opts, ...out }, null, 1));
    console.error('wrote ' + opts.out);
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
