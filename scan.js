// Full census: every distinct five-stone hand plays every other one, from both
// seats. Nothing is sampled -- this is the whole hand space. Six stone types
// make 252 hands and 63252 ordered pairs.
//
//   node scan.js --part 0 --of 6 --iters 300 --out results/scan.json
//   node scan.js --part 1 --of 6 --iters 300 --out results/scan.json
//   ...
//   node scan.js --report --out results/scan.json
//
// That is more than fits in one sitting, so the run is cut into parts. Each part
// plays every Nth pair and adds its counters to the file, and the report says how
// much of the census is in.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { STONE_TYPES } from './engine.js';
import { CODE, arg, pad, pct, playGame, wilson } from './sim.js';

// Every multiset of five stones, in a fixed order so a hand's index means the
// same thing in every part of the run.
export function allHands(pool = STONE_TYPES) {
  const out = [];
  const build = (start, hand) => {
    if (hand.length === 5) { out.push(hand.slice()); return; }
    for (let i = start; i < pool.length; i++) {
      hand.push(pool[i]);
      build(i, hand);
      hand.pop();
    }
  };
  build(0, []);
  return out;
}

// How a census labels itself: the rules it was played under, if not the current
// ones. An older checkpoint predates `rules` and recorded `sticky` instead.
function rulesOf(stateOpts) {
  const r = stateOpts.rules ?? { oneTurnMagnet: !stateOpts.sticky };
  return { oneTurnMagnet: !!r.oneTurnMagnet, oneTurnStinky: !!r.oneTurnStinky };
}
function rulesLabel(rules) {
  const on = Object.keys(rules).filter((k) => rules[k]);
  return on.length ? ` (${on.join(', ')})` : '';
}

const label = (hand) => hand.map((t) => CODE[t]).join(' ');

// ── Workers ─────────────────────────────────────────────────────────────────

if (!isMainThread && workerData?.kind === 'scan') {
  parentPort.postMessage(workerData.specs.map(playGame));
}

function runSpecs(specs, workers) {
  const chunks = Array.from({ length: workers }, () => []);
  specs.forEach((spec, i) => chunks[i % workers].push(spec));
  return Promise.all(chunks.filter((c) => c.length).map((specs) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'scan', specs } });
      w.on('message', resolve);
      w.on('error', reject);
    })
  )).then((r) => r.flat());
}

// ── Checkpoint ──────────────────────────────────────────────────────────────

function emptyState(hands, opts) {
  return {
    opts: { iters: opts.iters, games: opts.games, of: opts.of, rules: opts.rules, pool: opts.pool },
    parts: [],
    hands: hands.map((h) => h.join(',')),
    // per hand: games and wins from each seat, plus turns for the mean
    tally: hands.map(() => ({ fg: 0, fw: 0, sg: 0, sw: 0, turns: 0 })),
    games: 0, openerWins: 0, turns: 0, lineEnds: 0,
  };
}

function load(hands, opts) {
  if (!opts.out || !existsSync(opts.out)) return emptyState(hands, opts);
  const state = JSON.parse(readFileSync(opts.out, 'utf8'));
  if (state.hands.length !== hands.length) {
    throw new Error(`${opts.out} holds ${state.hands.length} hands, this pool has ${hands.length}`);
  }
  if (!opts.reportOnly &&
    JSON.stringify(rulesOf(state.opts)) !== JSON.stringify(rulesOf({ rules: opts.rules }))) {
    throw new Error(`${opts.out} was built under ${JSON.stringify(rulesOf(state.opts))}`);
  }
  return state;
}

function save(state, opts) {
  if (!opts.out) return;
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(state));
}

// ── Reporting ───────────────────────────────────────────────────────────────

function report(state, hands, opts) {
  const total = hands.length * (hands.length - 1) * state.opts.games;
  const rows = state.tally.map((t, i) => ({
    i, hand: hands[i], label: label(hands[i]),
    n: t.fg + t.sg, wins: t.fw + t.sw,
    rate: (t.fw + t.sw) / (t.fg + t.sg),
    firstRate: t.fg ? t.fw / t.fg : null,
    secondRate: t.sg ? t.sw / t.sg : null,
    ci: wilson(t.fw + t.sw, t.fg + t.sg),
    meanTurns: t.turns / (t.fg + t.sg),
  })).sort((a, b) => b.rate - a.rate);

  console.log(`\ncensus${rulesLabel(rulesOf(state.opts))}: ` +
    `all ${hands.length} hands, every ordered pair, ` +
    `${state.games} of ${total} games played (${(state.games / total * 100).toFixed(1)}%), ` +
    `parts ${state.parts.join(',') || 'none'} of ${state.opts.of}, iters=${state.opts.iters}`);
  console.log(`${rows[0].n} games per hand, ${state.tally[0].fg} opening and ${state.tally[0].sg} replying\n`);

  const head = () => {
    console.log(pad('rank', 6) + pad('hand', 24) + pad('total', 8) + pad('95% CI', 17) +
      pad('1st', 8) + pad('2nd', 8) + pad('seat gap', 10) + 'turns');
    console.log('-'.repeat(88));
  };
  const line = (r, rank) => console.log(pad(rank, 6) + pad(r.label, 24) + pad(pct(r.rate) + '%', 8) +
    pad('[' + pct(r.ci[0]) + ',' + pct(r.ci[1]) + ']', 17) +
    pad(r.firstRate === null ? '-' : pct(r.firstRate) + '%', 8) +
    pad(r.secondRate === null ? '-' : pct(r.secondRate) + '%', 8) +
    pad(r.firstRate === null || r.secondRate === null
      ? '-' : ((r.firstRate - r.secondRate) * 100).toFixed(1) + 'pp', 10) + r.meanTurns.toFixed(1));

  console.log('every hand, best first\n');
  head();
  rows.forEach((r, k) => line(r, k + 1));

  // Copies held, weighted by the games each hand actually played. With the
  // census complete every hand carries the same weight, so this is the exact
  // value of the nth copy rather than an estimate of it.
  console.log('\nwin rate by copies held, over every hand-side played\n');
  console.log(pad('stone', 10) + [0, 1, 2, 3, 4, 5].map((k) => pad(`${k} copies`, 12)).join(''));
  console.log('-'.repeat(82));
  for (const t of state.opts.pool ?? STONE_TYPES) {
    let out = pad(t, 10);
    for (let k = 0; k <= 5; k++) {
      const held = rows.filter((r) => r.hand.filter((x) => x === t).length === k);
      const n = held.reduce((s, r) => s + r.n, 0);
      const wins = held.reduce((s, r) => s + r.wins, 0);
      out += pad(n ? `${pct(wins / n)}% ${held.length}h` : '  -', 12);
    }
    console.log(out);
  }

  const [lo, hi] = wilson(state.openerWins, state.games);
  const gaps = rows.map((r) => r.firstRate - r.secondRate);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log('\nsummary');
  console.log('  opening seat wins    ' + pct(state.openerWins / state.games) +
    '% [' + pct(lo) + ',' + pct(hi) + '] over ' + state.games + ' games');
  console.log('  best hand            ' + rows[0].label + ' ' + pct(rows[0].rate) + '%');
  console.log('  worst hand           ' + rows[rows.length - 1].label + ' ' +
    pct(rows[rows.length - 1].rate) + '%');
  console.log('  hand spread          ' + ((rows[0].rate - rows[rows.length - 1].rate) * 100).toFixed(1) + 'pp');
  console.log('  seat gap per hand    ' + (mean(gaps) * 100).toFixed(1) + 'pp mean, ' +
    (Math.min(...gaps) * 100).toFixed(1) + 'pp to ' + (Math.max(...gaps) * 100).toFixed(1) + 'pp');
  console.log('  hands better 2nd     ' + gaps.filter((g) => g < 0).length + '/' + rows.length);
  console.log('  hands above 50%      ' + rows.filter((r) => r.rate > 0.5).length + '/' + rows.length);
  console.log('  games decided by     ' + pct(state.lineEnds / state.games) + '% line, ' +
    pct(1 - state.lineEnds / state.games) + '% full board');
  console.log('  mean game length     ' + (state.turns / state.games).toFixed(1) + ' turns');
}

// ── Comparing two censuses ──────────────────────────────────────────────────

// A hand is the multiset, so this key survives the stone order. Older
// checkpoints may hold stones that have since been cut, and the Leech -> Swap
// rename, so the key covers those too.
const RENAMED = { leech: 'swap' };
const KEY_TYPES = [...STONE_TYPES, 'swap'];
function handKey(hand) {
  const types = hand.map((t) => RENAMED[t] ?? t);
  return KEY_TYPES.map((t) => types.filter((x) => x === t).length).join('');
}

function ranked(state) {
  return state.tally
    .map((t, i) => {
      const hand = state.hands[i].split(',').map((x) => RENAMED[x] ?? x);
      return { hand, key: handKey(hand), label: label(hand), rate: (t.fw + t.sw) / (t.fg + t.sg) };
    })
    .sort((a, b) => b.rate - a.rate);
}

// What changed between two whole-space censuses: which hands moved, and which
// stones the top of the table is now made of.
function compare(state, otherFile, top = 15) {
  const now = ranked(state);
  const other = JSON.parse(readFileSync(otherFile, 'utf8'));
  const was = ranked(other);
  const wasBy = Object.fromEntries(was.map((r, i) => [r.key, { ...r, rank: i + 1 }]));
  // Two censuses of different pools share only the hands the smaller one deals.
  const pool = state.opts.pool ?? STONE_TYPES;
  const alsoThere = (t) => (other.opts.pool ?? STONE_TYPES).includes(t);
  const shared = now.filter((r) => wasBy[r.key]);

  console.log(`\nagainst ${otherFile}${rulesLabel(rulesOf(other.opts))}` +
    (shared.length < now.length
      ? `, which deals ${shared.length} of these ${now.length} hands`
      : '') + '\n');
  console.log(pad('now', 5) + pad('was', 5) + pad('hand', 24) +
    pad('total', 9) + pad('before', 9) + 'move');
  console.log('-'.repeat(60));
  for (const [i, r] of now.slice(0, top).entries()) {
    const o = wasBy[r.key];
    if (!o) { console.log(pad(i + 1, 5) + pad('-', 5) + r.label); continue; }
    console.log(pad(i + 1, 5) + pad(o.rank, 5) + pad(r.label, 24) +
      pad(pct(r.rate) + '%', 9) + pad(pct(o.rate) + '%', 9) +
      (r.rate >= o.rate ? '+' : '') + ((r.rate - o.rate) * 100).toFixed(1) + 'pp');
  }

  // A stone is over-represented when the good hands hold it more often than the
  // hand space does. Each census gets its own quartile, since the two need not
  // be the same size.
  console.log(`\nhow often a stone is held, in the top quarter of hands ` +
    `(${Math.round(now.length / 4)} of ${now.length}, ` +
    `${Math.round(was.length / 4)} of ${was.length})\n`);
  console.log(pad('stone', 10) + pad('now', 16) + pad('before', 16) +
    'mean rate by copies held, now vs before');
  console.log('-'.repeat(96));
  for (const t of pool) {
    const share = (list) => {
      const q = Math.round(list.length / 4);
      const held = list.slice(0, q).filter((r) => r.hand.includes(t)).length;
      return `${held}/${q} ${pct(held / q)}%`;
    };
    const curve = (list) => [0, 1, 2].map((k) => {
      const held = list.filter((r) => r.hand.filter((x) => x === t).length === k);
      return held.length ? pct(held.reduce((s, r) => s + r.rate, 0) / held.length) + '%' : '  -  ';
    }).join(' ');
    console.log(pad(t, 10) + pad(share(now), 16) + pad(alsoThere(t) ? share(was) : '-', 16) +
      curve(now) + '   ' + (alsoThere(t) ? curve(was) : ''));
  }

  // The ceiling for a hand that does without the stone entirely.
  console.log('\nbest hand holding none of each stone\n');
  for (const t of pool) {
    const pick = (list) => {
      const at = list.findIndex((r) => !r.hand.includes(t));
      return `${list[at].label} ${pct(list[at].rate)}% at rank ${at + 1}`;
    };
    console.log('  ' + pad(t, 10) + pad(pick(now), 40) +
      (alsoThere(t) ? 'was ' + pick(was) : ''));
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = {
    part: parseInt(arg('part', '0'), 10),
    of: parseInt(arg('of', '6'), 10),
    games: parseInt(arg('games', '1'), 10),
    iters: parseInt(arg('iters', '300'), 10),
    seed: parseInt(arg('seed', '1000'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    out: arg('out', 'results/scan.json'),
    reportOnly: process.argv.includes('--report'),
    compare: arg('compare', null),   // another census to read this one against
    // A census of the game as it stands unless a variant is asked for.
    rules: {
      oneTurnMagnet: process.argv.includes('--one-turn-magnet'),
      oneTurnStinky: process.argv.includes('--one-turn-stinky'),
    },
    pool: STONE_TYPES,
  };

  const hands = allHands(opts.pool);
  const state = load(hands, opts);

  if (!opts.reportOnly) {
    if (state.parts.includes(opts.part)) {
      throw new Error(`part ${opts.part} is already in ${opts.out}`);
    }
    // Every Nth ordered pair, so a part is a fair slice of the whole census
    // rather than a block of neighbouring hands.
    const specs = [];
    let index = 0, seed = opts.seed;
    for (let i = 0; i < hands.length; i++) {
      for (let j = 0; j < hands.length; j++) {
        if (i === j) continue;
        for (let g = 0; g < opts.games; g++, index++, seed++) {
          if (index % opts.of !== opts.part) continue;
          specs.push({
            i, j, opener: hands[i], replier: hands[j],
            iters: opts.iters, seed, rules: opts.rules,
          });
        }
      }
    }

    console.error(`part ${opts.part}/${opts.of}: ${specs.length} games on ${opts.workers} workers...`);
    const t0 = Date.now();
    const games = await runSpecs(specs, opts.workers);
    console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    for (const g of games) {
      const o = state.tally[g.opener], r = state.tally[g.replier];
      o.fg++; o.fw += g.openerWon; o.turns += g.turns;
      r.sg++; r.sw += 1 - g.openerWon; r.turns += g.turns;
      state.games++;
      state.openerWins += g.openerWon;
      state.turns += g.turns;
      if (g.reason === 'line') state.lineEnds++;
    }
    state.parts.push(opts.part);
    state.parts.sort((a, b) => a - b);
    save(state, opts);
    console.error(`wrote ${opts.out} (parts ${state.parts.join(',')})`);
  }

  report(state, hands, opts);
  if (opts.compare) compare(state, opts.compare);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
