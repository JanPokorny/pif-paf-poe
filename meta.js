// A metagame instead of a census. Real players do not meet the whole hand space
// in equal proportion: they copy what wins. So a population of random hands
// plays a round, the worst tenth is dropped, the best tenth is copied, and the
// field the next round is played against is whatever that leaves.
//
//   node meta.js --pop 200 --games 8 --rounds 25 --iters 300 --out results/meta.json
//   node meta.js --resume --rounds 25 --out results/meta.json
//   node meta.js --report --out results/meta.json
//
// Each round every hand plays the same number of games, half of them opening and
// half replying, against opponents drawn from the population -- so a hand's
// score is its win rate against the field as it currently stands, and a hand
// that beats the census field but loses to the field that actually forms will
// not survive. That is the whole point of measuring this way.
//
// The run is checkpointed after every round: --resume carries the population on,
// which is how a long run is assembled out of chunks that each fit in a sitting.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { STONE_TYPES } from './engine.js';
import { makeRng } from './ai.js';
import { CODE, arg, pad, pct, playGame, randomHand, sortHand, wilson } from './sim.js';

const label = (hand) => hand.map((t) => CODE[t]).join(' ');
const key = (hand) => hand.join(',');

// ── Workers ─────────────────────────────────────────────────────────────────

if (!isMainThread && workerData?.kind === 'meta') {
  parentPort.postMessage(workerData.specs.map(playGame));
}

function runSpecs(specs, workers) {
  const chunks = Array.from({ length: workers }, () => []);
  specs.forEach((spec, i) => chunks[i % workers].push(spec));
  return Promise.all(chunks.filter((c) => c.length).map((specs) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'meta', specs } });
      w.on('message', resolve);
      w.on('error', reject);
    })
  )).then((r) => r.flat());
}

// ── One round ───────────────────────────────────────────────────────────────

// Every hand opens `games/2` times and replies `games/2` times, so a hand's
// score cannot be inflated by drawing the better seat more often than its rivals.
function buildSpecs(pop, opts, rng, seed) {
  const specs = [];
  const half = Math.max(1, opts.games >> 1);
  const someoneElse = (i) => {
    if (pop.length < 2) return i;
    let j;
    do { j = (rng() * pop.length) | 0; } while (j === i);
    return j;
  };
  for (let i = 0; i < pop.length; i++) {
    for (let g = 0; g < half; g++) {
      const j = someoneElse(i);
      specs.push({ i, j, opener: pop[i], replier: pop[j], iters: opts.iters, seed: seed++ });
      const k = someoneElse(i);
      specs.push({ i: k, j: i, opener: pop[k], replier: pop[i], iters: opts.iters, seed: seed++ });
    }
  }
  return specs;
}

// Drop the worst `cull` of the population, copy the best `cull`. Ties are broken
// at random rather than by position, so nothing survives on index alone.
function select(pop, scores, cull, rng) {
  const order = pop.map((hand, i) => ({ i, hand, score: scores[i], jitter: rng() }))
    .sort((a, b) => (b.score - a.score) || (a.jitter - b.jitter));
  const n = Math.max(1, Math.round(pop.length * cull));
  const survivors = order.slice(0, order.length - n).map((r) => r.hand);
  const copied = order.slice(0, n).map((r) => r.hand.slice());
  return { next: survivors.concat(copied), dropped: order.slice(-n).map((r) => r.hand) };
}

function shares(pop) {
  const out = {};
  for (const t of STONE_TYPES) out[t] = 0;
  for (const hand of pop) for (const t of hand) out[t]++;
  for (const t of STONE_TYPES) out[t] /= pop.length * 5;
  return out;
}

function census(file) {
  if (!file || !existsSync(file)) return null;
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const rows = s.hands.map((h, i) => {
    const t = s.tally[i];
    return {
      key: h, rate: (t.fw + t.sw) / (t.fg + t.sg),
      first: t.fw / t.fg, second: t.sw / t.sg,
    };
  }).sort((a, b) => b.rate - a.rate);
  return Object.fromEntries(rows.map((r, i) => [r.key, { ...r, rank: i + 1, of: rows.length }]));
}

// ── Reporting ───────────────────────────────────────────────────────────────

function report(state, ranks) {
  const rounds = state.history;
  console.log(`\nmetagame: ${state.pop} hands, ${state.games} games each per round, ` +
    `${rounds.length} rounds, ${state.totalGames} games, iters=${state.iters}, ` +
    `dropping and copying ${(state.cull * 100).toFixed(0)}% a round\n`);

  console.log(pad('round', 7) + pad('opener', 9) + pad('distinct', 10) + pad('commonest', 22) +
    pad('share', 8) + STONE_TYPES.map((t) => pad(CODE[t], 7)).join('') +
    (ranks ? 'census' : ''));
  console.log('-'.repeat(ranks ? 105 : 99));
  for (const r of rounds) {
    console.log(pad(r.round, 7) + pad(pct(r.openerRate) + '%', 9) + pad(r.distinct, 10) +
      pad(r.commonest, 22) + pad(pct(r.topShare) + '%', 8) +
      STONE_TYPES.map((t) => pad(pct(r.shares[t]) + '%', 7)).join('') +
      (ranks ? pct(r.censusRate ?? 0) + '%' : ''));
  }

  const counts = {};
  for (const hand of state.population) counts[key(hand)] = (counts[key(hand)] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('\nwhat the population ended up holding\n');
  console.log(pad('hand', 24) + pad('copies', 9) + pad('share', 8) +
    (ranks ? pad('census rank', 14) + pad('census', 9) + pad('1st', 9) + '2nd' : ''));
  console.log('-'.repeat(ranks ? 88 : 41));
  for (const [k, n] of top) {
    const r = ranks?.[k];
    console.log(pad(label(k.split(',')), 24) + pad(n, 9) + pad(pct(n / state.pop) + '%', 8) +
      (ranks
        ? pad(r ? `${r.rank} of ${r.of}` : '-', 14) +
          (r ? pad(pct(r.rate) + '%', 9) + pad(pct(r.first) + '%', 9) + pct(r.second) + '%' : '-')
        : ''));
  }

  // Selection scores a hand on both seats, but what it is actually picking may
  // be the opening seat alone -- so weight each census rate by how many copies
  // of that hand the population ended up holding.
  if (ranks) {
    const weighted = (pick) => {
      let n = 0, sum = 0;
      for (const hand of state.population) {
        const r = ranks[key(hand)];
        if (!r) continue;
        n++; sum += pick(r);
      }
      return n ? sum / n : 0;
    };
    const all = Object.values(ranks);
    const mean = (list, pick) => list.reduce((s, r) => s + pick(r), 0) / list.length;
    console.log('\n  the surviving hands take ' + pct(weighted((r) => r.first)) +
      '% of their census games from the opening seat and ' +
      pct(weighted((r) => r.second)) + '% from the replying seat');
    console.log('  the hand space as a whole takes ' + pct(mean(all, (r) => r.first)) +
      '% and ' + pct(mean(all, (r) => r.second)) + '%');
  }

  const first = rounds[0], last = rounds[rounds.length - 1];
  const [lo, hi] = wilson(last.openerWins, last.games);
  console.log('\nsummary');
  console.log('  opening seat wins    ' + pct(first.openerRate) + '% in round 1, ' +
    pct(last.openerRate) + '% [' + pct(lo) + ',' + pct(hi) + '] in round ' + last.round);
  console.log('  distinct hands       ' + first.distinct + ' -> ' + last.distinct +
    ' of ' + state.pop);
  console.log('  commonest hand       ' + last.commonest + ' at ' + pct(last.topShare) + '%');
  if (ranks) {
    console.log('  mean census rate     ' + pct(first.censusRate) + '% -> ' +
      pct(last.censusRate) + '% of the population, weighted by copies');
  }
  console.log('  stone shares         ' + STONE_TYPES.map((t) =>
    `${CODE[t]} ${pct(first.shares[t])}->${pct(last.shares[t])}%`).join(', '));
  console.log('  mean game length     ' + last.turns.toFixed(1) + ' turns, ' +
    pct(last.lineRate) + '% decided by a line');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = {
    pop: parseInt(arg('pop', '200'), 10),
    games: parseInt(arg('games', '8'), 10),
    rounds: parseInt(arg('rounds', '25'), 10),
    iters: parseInt(arg('iters', '300'), 10),
    cull: parseFloat(arg('cull', '0.1')),
    seed: parseInt(arg('seed', '777'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    out: arg('out', 'results/meta.json'),
    censusFile: arg('census', 'results/scan.json'),
    resume: process.argv.includes('--resume'),
    reportOnly: process.argv.includes('--report'),
  };
  const ranks = census(opts.censusFile);

  let state = (opts.resume || opts.reportOnly) && existsSync(opts.out)
    ? JSON.parse(readFileSync(opts.out, 'utf8'))
    : null;

  if (!opts.reportOnly) {
    // A resumed run picks the stream up from where it left off, so the rounds
    // after a break are not replays of the rounds before it.
    const rng = makeRng(opts.seed + (state?.history.length ?? 0) * 104729);
    state ??= {
      pop: opts.pop, games: opts.games, iters: opts.iters, cull: opts.cull, seed: opts.seed,
      population: Array.from({ length: opts.pop }, () => randomHand(rng)),
      history: [], totalGames: 0,
    };
    state.startPopulation ??= state.population.map((h) => h.slice());
    state.population = state.population.map(sortHand);

    for (let r = 0; r < opts.rounds; r++) {
      const round = state.history.length + 1;
      const specs = buildSpecs(state.population, state, rng, opts.seed + state.totalGames);
      const games = await runSpecs(specs, opts.workers);

      const score = state.population.map(() => ({ n: 0, wins: 0 }));
      let openerWins = 0, turns = 0, lineEnds = 0;
      for (const g of games) {
        score[g.opener].n++; score[g.opener].wins += g.openerWon;
        score[g.replier].n++; score[g.replier].wins += 1 - g.openerWon;
        openerWins += g.openerWon;
        turns += g.turns;
        if (g.reason === 'line') lineEnds++;
      }

      const counts = {};
      for (const hand of state.population) counts[key(hand)] = (counts[key(hand)] ?? 0) + 1;
      const [commonest, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      state.history.push({
        round,
        games: games.length,
        openerWins,
        openerRate: openerWins / games.length,
        turns: turns / games.length,
        lineRate: lineEnds / games.length,
        distinct: Object.keys(counts).length,
        commonest: label(commonest.split(',')),
        topShare: topCount / state.population.length,
        shares: shares(state.population),
        // Where this population sits in the census, if there is one for this pool.
        censusRate: ranks
          ? state.population.reduce((s, h) => s + (ranks[key(h)]?.rate ?? 0), 0) / state.population.length
          : null,
      });
      state.totalGames += games.length;

      const { next } = select(state.population, score.map((s) => s.wins / s.n), state.cull, rng);
      state.population = next;

      console.error(`  round ${pad(round, 4)} opener ${pct(openerWins / games.length)}%  ` +
        `distinct ${pad(Object.keys(counts).length, 5)} top ${commonest}`);
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, JSON.stringify(state));
    }
  }

  report(state, ranks);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
