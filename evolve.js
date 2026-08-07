// Evolutionary hand search: random hands play each other, and every hand that
// loses swaps one of its five stones for a different random one. Winners are
// left alone, so a hand only stops changing once it stops losing.
//
//   node evolve.js --pop 12 --replicates 4 --rounds 1500 --iters 400
//   node evolve.js --rounds 1500 --resume results/evolve.json --out results/evolve.json
//
// Each replicate is an independent population in its own worker; nothing crosses
// between them, so they are repeats of the same experiment rather than one big
// pool. --resume continues from the populations a previous run ended with and
// adds its games to the totals, which is how a long run is assembled out of
// chunks. The random stream is re-seeded per chunk, so a resumed run is not
// bit-identical to an uninterrupted one of the same length.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { STONE_TYPES } from './engine.js';
import { makeRng } from './ai.js';
import { CODE, arg, pad, pct, playGame, randomHand, sortHand, wilson } from './sim.js';

const key = (hand) => hand.map((t) => CODE[t]).join(' ');

// ── One replicate ───────────────────────────────────────────────────────────

// A losing hand replaces one slot with a stone it did not already have there.
// The draw excludes the incumbent, so a loss always changes the hand.
function mutate(hand, rng) {
  const at = (rng() * 5) | 0;
  let stone;
  do { stone = STONE_TYPES[(rng() * STONE_TYPES.length) | 0]; } while (stone === hand[at]);
  const next = hand.slice();
  next[at] = stone;
  return sortHand(next);
}

function blankHandStat(hand) {
  return { hand, games: 0, wins: 0, firstGames: 0, firstWins: 0, lives: 0 };
}

function runReplicate(cfg) {
  const rng = makeRng(cfg.seed);
  const hands = cfg.population
    ? cfg.population.map(sortHand)
    : Array.from({ length: cfg.pop }, () => randomHand(rng));

  // Games this hand has survived in its present form, reset by every mutation.
  const age = hands.map(() => 0);

  const out = {
    games: 0, openerWins: 0, turns: 0, lineEnds: 0,
    stoneByCopies: {},   // type -> copies held -> {n, wins}, counted per hand-side
    handStats: {},       // hand -> record over every appearance anywhere in the run
    snapshots: [],       // stone counts across the population, over time
    lifetimes: [],       // games survived per form, closed out at mutation
    seen: {},            // hand -> times it was created, for breadth
  };
  for (const t of STONE_TYPES) out.stoneByCopies[t] = {};

  const noteSide = (hand, won, first) => {
    const k = key(hand);
    const stat = (out.handStats[k] ??= blankHandStat(hand));
    stat.games++;
    stat.wins += won;
    if (first) { stat.firstGames++; stat.firstWins += won; }
    for (const t of STONE_TYPES) {
      const copies = hand.filter((x) => x === t).length;
      const bucket = (out.stoneByCopies[t][copies] ??= { n: 0, wins: 0 });
      bucket.n++;
      bucket.wins += won;
    }
  };

  for (const hand of hands) out.seen[key(hand)] = (out.seen[key(hand)] ?? 0) + 1;

  for (let round = 0; round < cfg.rounds; round++) {
    // Two distinct hands, and a coin flip for who opens: seat is never a
    // property of a hand's position in the population.
    const i = (rng() * hands.length) | 0;
    let j = (rng() * (hands.length - 1)) | 0;
    if (j >= i) j++;
    const [first, second] = rng() < 0.5 ? [i, j] : [j, i];

    const game = playGame({
      opener: hands[first], replier: hands[second], iters: cfg.iters, seed: (rng() * 2 ** 32) >>> 0,
    });

    out.games++;
    out.openerWins += game.openerWon;
    out.turns += game.turns;
    if (game.reason === 'line') out.lineEnds++;
    noteSide(hands[first], game.openerWon, true);
    noteSide(hands[second], 1 - game.openerWon, false);

    age[first]++; age[second]++;

    const loser = game.openerWon === 1 ? second : game.openerWon === 0 ? first : null;
    if (loser !== null) {
      out.lifetimes.push(age[loser]);
      out.handStats[key(hands[loser])].lives++;
      hands[loser] = mutate(hands[loser], rng);
      age[loser] = 0;
      out.seen[key(hands[loser])] = (out.seen[key(hands[loser])] ?? 0) + 1;
    }

    if ((round + 1) % cfg.snapshotEvery === 0) {
      const counts = {};
      for (const t of STONE_TYPES) counts[t] = 0;
      for (const hand of hands) for (const t of hand) counts[t]++;
      out.snapshots.push(counts);
    }
  }

  out.population = hands;
  out.ages = age;
  return out;
}

if (!isMainThread && workerData?.kind === 'evolve') {
  parentPort.postMessage(runReplicate(workerData.cfg));
}

function runReplicates(configs) {
  return Promise.all(configs.map((cfg) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'evolve', cfg } });
      w.on('message', resolve);
      w.on('error', reject);
    })
  ));
}

// ── Merging ─────────────────────────────────────────────────────────────────

// Replicates merge into each other exactly as chunks of one replicate do, so a
// resumed run and a four-worker run go through the same code.
function mergeInto(acc, part) {
  acc.games += part.games;
  acc.openerWins += part.openerWins;
  acc.turns += part.turns;
  acc.lineEnds += part.lineEnds;
  acc.lifetimeSum += part.lifetimes.reduce((s, x) => s + x, 0);
  acc.lifetimeN += part.lifetimes.length;

  for (const t of STONE_TYPES) {
    for (const [copies, b] of Object.entries(part.stoneByCopies[t] ?? {})) {
      const into = (acc.stoneByCopies[t][copies] ??= { n: 0, wins: 0 });
      into.n += b.n;
      into.wins += b.wins;
    }
  }
  for (const [k, s] of Object.entries(part.handStats)) {
    const into = (acc.handStats[k] ??= blankHandStat(s.hand));
    into.games += s.games; into.wins += s.wins;
    into.firstGames += s.firstGames; into.firstWins += s.firstWins;
    into.lives += s.lives;
  }
  for (const [k, n] of Object.entries(part.seen)) acc.seen[k] = (acc.seen[k] ?? 0) + n;
  return acc;
}

function emptyAcc() {
  const acc = {
    games: 0, openerWins: 0, turns: 0, lineEnds: 0, lifetimeSum: 0, lifetimeN: 0,
    stoneByCopies: {}, handStats: {}, seen: {}, snapshots: [], populations: [],
  };
  for (const t of STONE_TYPES) acc.stoneByCopies[t] = {};
  return acc;
}

// Snapshots are aligned across replicates (same round count each) and appended
// end to end across chunks, giving one trajectory for the whole run.
function mergeSnapshots(acc, parts) {
  const length = Math.max(...parts.map((p) => p.snapshots.length));
  for (let i = 0; i < length; i++) {
    const counts = {};
    for (const t of STONE_TYPES) counts[t] = 0;
    let stones = 0;
    for (const p of parts) {
      const snap = p.snapshots[i];
      if (!snap) continue;
      for (const t of STONE_TYPES) counts[t] += snap[t];
      stones += Object.values(snap).reduce((s, x) => s + x, 0);
    }
    acc.snapshots.push({ counts, stones });
  }
}

// ── Reporting ───────────────────────────────────────────────────────────────

function report(acc, opts) {
  const share = (snap, t) => snap.counts[t] / snap.stones;
  const snaps = acc.snapshots;
  const quarters = [0, 1, 2, 3].map((q) => snaps[Math.min(snaps.length - 1,
    Math.floor((q + 1) * snaps.length / 4) - 1)]).filter(Boolean);

  console.log(`\nevolution: ${opts.replicates} populations of ${opts.pop}, ` +
    `${acc.games} games total, iters=${opts.iters}` +
    (opts.chunks > 1 ? `, ${opts.chunks} chunks` : ''));
  console.log(`${Object.keys(acc.seen).length} distinct hands visited, ` +
    `${Object.keys(acc.handStats).length} of them played`);

  // Drift of the pool itself: what the live hands are made of, censused as the
  // run goes. A stone that wins keeps its holders alive and a stone that loses
  // is what a losing hand throws away, so share is selection -- but only if it
  // clears the noise. One census is `stones` slots wide, so read the mean over
  // the whole run against the +-se column, not any single column.
  const uniform = 1 / STONE_TYPES.length;
  const se = Math.sqrt(uniform * (1 - uniform) / snaps[0].stones);
  console.log(`\nstone share of the live hands, uniform is ${pct(uniform)}%, ` +
    `census of ${snaps[0].stones} slots +-${pct(se)}pp\n`);
  console.log(pad('stone', 10) +
    quarters.map((_, q) => pad(`${(q + 1) * 25}% in`, 8)).join('') +
    pad('mean', 8) + pad('sd', 8) + 'vs uniform');
  console.log('-'.repeat(70));
  const drift = STONE_TYPES.map((t) => {
    const series = snaps.map((snap) => share(snap, t));
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
    return { t, mean, sd };
  }).sort((a, b) => b.mean - a.mean);
  for (const d of drift) {
    const delta = (d.mean - uniform) * 100;
    console.log(pad(d.t, 10) + quarters.map((s) => pad(pct(share(s, d.t)) + '%', 8)).join('') +
      pad(pct(d.mean) + '%', 8) + pad(pct(d.sd) + 'pp', 8) +
      (delta >= 0 ? '+' : '') + delta.toFixed(1) + 'pp');
  }
  // Censuses overlap in membership, so the spread above is not sqrt(n)-shrinkable
  // into a confidence interval. Treat a mean within about one sd of uniform as
  // undecided and read the copies table below instead.

  // Win rate of a hand-side by how many copies of a stone it holds. Every game
  // in the run contributes both of its sides, so n is large and the comparison
  // is within one pool of opponents.
  console.log('\nwin rate by copies held (both sides of every game)\n');
  console.log(pad('stone', 10) + [0, 1, 2, 3].map((k) => pad(`${k}${k === 3 ? '+' : ''} copies`, 11)).join(''));
  console.log('-'.repeat(54));
  const copyRow = (t, k) => {
    const buckets = k === 3
      ? [3, 4, 5].map((c) => acc.stoneByCopies[t][c]).filter(Boolean)
      : [acc.stoneByCopies[t][k]].filter(Boolean);
    const n = buckets.reduce((s, b) => s + b.n, 0);
    const wins = buckets.reduce((s, b) => s + b.wins, 0);
    return n ? pad(pct(wins / n) + '% ' + (n >= 1000 ? (n / 1000).toFixed(0) + 'k' : n), 11) : pad('-', 11);
  };
  for (const d of drift) console.log(pad(d.t, 10) + [0, 1, 2, 3].map((k) => copyRow(d.t, k)).join(''));

  // The hands the search keeps coming back to, and how they do from each seat.
  const hands = Object.values(acc.handStats)
    .filter((h) => h.games >= opts.minGames)
    .map((h) => ({
      ...h,
      rate: h.wins / h.games,
      firstRate: h.firstGames ? h.firstWins / h.firstGames : null,
      secondRate: h.games - h.firstGames
        ? (h.wins - h.firstWins) / (h.games - h.firstGames) : null,
      ci: wilson(h.wins, h.games),
    }))
    .sort((a, b) => b.rate - a.rate);

  console.log(`\nhands played at least ${opts.minGames} games, by win rate\n`);
  console.log(pad('hand', 24) + pad('games', 7) + pad('total', 8) + pad('95% CI', 17) +
    pad('1st', 8) + pad('2nd', 8) + 'seat gap');
  console.log('-'.repeat(80));
  for (const h of hands.slice(0, opts.top)) {
    console.log(pad(key(h.hand), 24) + pad(h.games, 7) + pad(pct(h.rate) + '%', 8) +
      pad('[' + pct(h.ci[0]) + ',' + pct(h.ci[1]) + ']', 17) +
      pad(h.firstRate === null ? '-' : pct(h.firstRate) + '%', 8) +
      pad(h.secondRate === null ? '-' : pct(h.secondRate) + '%', 8) +
      (h.firstRate === null || h.secondRate === null
        ? '-' : ((h.firstRate - h.secondRate) * 100).toFixed(1) + 'pp'));
  }
  if (hands.length > opts.top) console.log(`... and ${hands.length - opts.top} more`);

  console.log('\nfinal populations\n');
  acc.populations.forEach((pop, i) => {
    console.log('  #' + (i + 1) + '  ' + pop.map(key).join('  |  '));
  });

  const [lo, hi] = wilson(acc.openerWins, acc.games);
  console.log('\nsummary');
  console.log('  opening seat wins    ' + pct(acc.openerWins / acc.games) + '% [' +
    pct(lo) + ',' + pct(hi) + '] over ' + acc.games + ' games');
  console.log('  mean survival        ' + (acc.lifetimeSum / acc.lifetimeN).toFixed(2) +
    ' games between mutations');
  console.log('  games decided by     ' + pct(acc.lineEnds / acc.games) + '% line, ' +
    pct(1 - acc.lineEnds / acc.games) + '% full board');
  console.log('  mean game length     ' + (acc.turns / acc.games).toFixed(1) + ' turns');

  return hands;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = {
    pop: parseInt(arg('pop', '12'), 10),
    replicates: parseInt(arg('replicates', '4'), 10),
    rounds: parseInt(arg('rounds', '1500'), 10),
    iters: parseInt(arg('iters', '400'), 10),
    seed: parseInt(arg('seed', '90210'), 10),
    snapshotEvery: parseInt(arg('snapshot-every', '50'), 10),
    minGames: parseInt(arg('min-games', '40'), 10),
    top: parseInt(arg('top', '20'), 10),
    resume: arg('resume', null),
    out: arg('out', null),
    handsOut: arg('hands-out', null),   // finalists, for sim.js --hands-file
  };

  let acc = emptyAcc();
  let chunk = 0;
  let populations = null;
  if (opts.resume) {
    const prior = JSON.parse(readFileSync(opts.resume, 'utf8'));
    acc = prior.acc;
    chunk = prior.opts.chunks ?? 1;
    populations = prior.acc.populations;
    opts.pop = prior.opts.pop;
    opts.replicates = prior.opts.replicates;
    console.error(`resuming from ${opts.resume}: ${acc.games} games so far`);
  }
  opts.chunks = chunk + 1;

  const configs = Array.from({ length: opts.replicates }, (_, i) => ({
    pop: opts.pop,
    rounds: opts.rounds,
    iters: opts.iters,
    snapshotEvery: opts.snapshotEvery,
    seed: opts.seed + chunk * 1_000_003 + i * 7919,
    population: populations ? populations[i] : null,
  }));

  // --rounds 0 with --resume is report-only: re-read a checkpoint and print it
  // again, or export a different field from it, without replaying anything.
  if (opts.rounds > 0) {
    console.error(`chunk ${opts.chunks}: ${opts.replicates} x ${opts.rounds} games...`);
    const t0 = Date.now();
    const parts = await runReplicates(configs);
    console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    for (const part of parts) mergeInto(acc, part);
    mergeSnapshots(acc, parts);
    acc.populations = parts.map((p) => p.population);
  } else {
    opts.chunks = chunk;
  }

  const hands = report(acc, opts);

  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ opts, acc }, null, 1));
    console.error('wrote ' + opts.out);
  }
  if (opts.handsOut) {
    // A field for sim.js to play out properly: evenly spaced ranks from the top
    // of the qualifying list to the bottom, so the evaluation tests the whole
    // ordering rather than only re-playing the winners.
    const step = Math.max(1, (hands.length - 1) / Math.max(1, opts.top - 1));
    const field = [];
    for (let i = 0; field.length < opts.top && i < hands.length; i += step) {
      field.push(hands[Math.round(i)].hand);
    }
    mkdirSync(dirname(opts.handsOut), { recursive: true });
    writeFileSync(opts.handsOut, JSON.stringify(field));
    console.error(`wrote ${opts.handsOut} (${field.length} hands, ranks 1..${hands.length})`);
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
