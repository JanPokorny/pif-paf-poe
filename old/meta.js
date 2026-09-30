// A metagame instead of a census. Real players do not meet the whole hand space
// in equal proportion: they copy what wins. So a population of random loadouts
// plays a round, the worst tenth is dropped, the best tenth is copied, and the
// field the next round is played against is whatever that leaves.
//
//   node meta.js --pop 200 --games 8 --rounds 25 --iters 300 --out results/meta.json
//   node meta.js --items --pop 200 --rounds 30 --out results/meta-items.json
//   node meta.js --item mirror --pop 120 --rounds 18 --out results/meta-mirror.json
//   node meta.js --space magnet --pop 120 --rounds 12 --out results/meta-space-magnet.json
//   node meta.js --circuit --pop 120 --rounds 18 --out results/meta-circuit.json
//   node meta.js --resume --rounds 8 --out results/meta-items.json
//   node meta.js --report --out results/meta-items.json
//
// A loadout is a hand and, with --items, a Counterattack. Both are selected
// together, because an item is only worth what it is worth against the field
// that forms, and the field that forms depends on what the items are doing.
//
// A game is fought on a space, and a space switches one stone type off for both
// players: it still occupies its square and still counts towards a line, but it
// has no effect. --space fixes which type that is for a whole run; --circuit
// draws a space per game from the six plus the neutral one, which is the version
// a hand cannot prepare for and therefore has to survive.
//
// --item fixes one Counterattack on everybody instead, which is the other way
// the element could work: not a thing a player chooses but a thing the rules
// hand the replying seat. Then only the hands evolve, and the question the run
// answers is where that one item leaves the seat once the field has settled.
//
// Each round every loadout plays the same number of games, half of them opening
// and half replying, against opponents drawn from the population. A hand that
// beats the census field but loses to the field that actually forms will not
// survive, which is the whole point of measuring this way.
//
// The run is checkpointed after every round: --resume carries the population on,
// which is how a long run is assembled out of chunks that each fit in a sitting.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ITEMS, STONE_TYPES } from './engine.js';
import { makeRng } from './ai.js';
import { CODE, arg, pad, pct, playGame, randomHand, sortHand, wilson } from './sim.js';

// The spaces a circuit visits: one per stone type, plus the neutral space.
const SPACES = [null, ...STONE_TYPES];
const spaceName = (space) => space ?? 'neutral';

// Bringing nothing is on the menu, so an item has to beat the empty slot.
const LOADOUT_ITEMS = [null, ...ITEMS];
const itemName = (item) => item ?? 'none';

const label = (hand) => hand.map((t) => CODE[t]).join(' ');
const handKey = (hand) => hand.join(',');
const key = (b) => `${handKey(b.hand)}|${itemName(b.item)}`;

// Older checkpoints stored bare hands.
const asBuild = (b) => (Array.isArray(b) ? { hand: sortHand(b), item: null } : { hand: sortHand(b.hand), item: b.item ?? null });

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

// Every loadout opens `games/2` times and replies `games/2` times, so a score
// cannot be inflated by drawing the better seat more often than a rival does --
// and every loadout gets its item into play exactly half the time.
function buildSpecs(pop, opts, rng, seed) {
  const specs = [];
  const half = Math.max(1, opts.games >> 1);
  const someoneElse = (i) => {
    if (pop.length < 2) return i;
    let j;
    do { j = (rng() * pop.length) | 0; } while (j === i);
    return j;
  };
  // On a circuit the space is drawn per game, so neither hand knows in advance
  // which of its stones will be dead weight.
  const spaceFor = () => (opts.circuit
    ? SPACES[(rng() * SPACES.length) | 0]
    : opts.space ?? null);
  const match = (i, j, seed) => ({
    i, j, opener: pop[i].hand, replier: pop[j].hand,
    itemX: pop[i].item, itemO: pop[j].item, iters: opts.iters, seed,
    rules: { disabled: spaceFor() },
  });
  for (let i = 0; i < pop.length; i++) {
    for (let g = 0; g < half; g++) {
      specs.push(match(i, someoneElse(i), seed++));
      specs.push(match(someoneElse(i), i, seed++));
    }
  }
  return specs;
}

// Drop the worst `cull` of the population, copy the best `cull`. Ties are broken
// at random rather than by position, so nothing survives on index alone.
function select(pop, scores, cull, rng) {
  const order = pop.map((build, i) => ({ build, score: scores[i], jitter: rng() }))
    .sort((a, b) => (b.score - a.score) || (a.jitter - b.jitter));
  const n = Math.max(1, Math.round(pop.length * cull));
  return order.slice(0, order.length - n).map((r) => r.build)
    .concat(order.slice(0, n).map((r) => ({ hand: r.build.hand.slice(), item: r.build.item })));
}

function shares(pop) {
  const out = {};
  for (const t of STONE_TYPES) out[t] = 0;
  for (const b of pop) for (const t of b.hand) out[t]++;
  for (const t of STONE_TYPES) out[t] /= pop.length * 5;
  return out;
}

function itemShares(pop) {
  const out = {};
  for (const item of LOADOUT_ITEMS) out[itemName(item)] = 0;
  for (const b of pop) out[itemName(b.item)]++;
  for (const k of Object.keys(out)) out[k] /= pop.length;
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
  const withItems = !!state.items;
  console.log(`\nmetagame${withItems ? ' with Counterattacks' : ''}` +
    `${state.fixedItem ? `, everybody replying with ${state.fixedItem}` : ''}` +
    `${state.circuit ? ', on a circuit of all six spaces' : ''}` +
    `${state.space ? `, on the ${state.space} space` : ''}: ${state.pop} loadouts, ` +
    `${state.games} games each per round, ${rounds.length} rounds, ${state.totalGames} games, ` +
    `iters=${state.iters}, dropping and copying ${(state.cull * 100).toFixed(0)}% a round\n`);

  console.log(pad('round', 7) + pad('opener', 9) + pad('distinct', 10) +
    STONE_TYPES.map((t) => pad(CODE[t], 7)).join('') +
    (withItems ? pad('commonest item', 18) + pad('share', 8) : pad('commonest', 22) + 'share'));
  console.log('-'.repeat(withItems ? 96 : 100));
  for (const r of rounds) {
    const topItem = r.itemShares
      ? Object.entries(r.itemShares).sort((a, b) => b[1] - a[1])[0]
      : null;
    console.log(pad(r.round, 7) + pad(pct(r.openerRate) + '%', 9) + pad(r.distinct, 10) +
      STONE_TYPES.map((t) => pad(pct(r.shares[t]) + '%', 7)).join('') +
      (topItem
        ? pad(topItem[0], 18) + pad(pct(topItem[1]) + '%', 8)
        : pad(r.commonest, 22) + pct(r.topShare) + '%'));
  }

  if (withItems) {
    // Share is what selection did; the second-seat rate is why. Both are pooled
    // over the last quarter of the run, once the field has stopped moving.
    const tail = rounds.slice(Math.floor(rounds.length * 0.75));
    const pooled = {};
    for (const r of tail) {
      for (const [item, v] of Object.entries(r.itemGames ?? {})) {
        pooled[item] ??= { n: 0, wins: 0 };
        pooled[item].n += v.n;
        pooled[item].wins += v.wins;
      }
    }
    const ending = rounds[rounds.length - 1].itemShares;
    const rows = LOADOUT_ITEMS.map(itemName).map((item) => ({
      item, share: ending[item] ?? 0,
      n: pooled[item]?.n ?? 0,
      rate: pooled[item]?.n ? pooled[item].wins / pooled[item].n : null,
    })).sort((a, b) => b.share - a.share || (b.rate ?? 0) - (a.rate ?? 0));

    console.log(`\nCounterattacks: share of the population at the end, and how the` +
      ` holders did\nin the replying seat over the last ${tail.length} rounds\n`);
    console.log(pad('counterattack', 16) + pad('share', 9) + pad('start', 9) +
      pad('2nd seat', 10) + pad('95% CI', 16) + 'games');
    console.log('-'.repeat(68));
    for (const r of rows) {
      const ci = r.rate === null ? null : wilson(pooled[r.item].wins, r.n);
      console.log(pad(r.item, 16) + pad(pct(r.share) + '%', 9) +
        pad(pct(rounds[0].itemShares[r.item] ?? 0) + '%', 9) +
        pad(r.rate === null ? '-' : pct(r.rate) + '%', 10) +
        pad(ci ? '[' + pct(ci[0]) + ',' + pct(ci[1]) + ']' : '-', 16) + r.n);
    }
  }

  if (state.circuit) {
    const tail = rounds.slice(Math.floor(rounds.length * 0.7));
    const pooled = {};
    for (const r of tail) {
      for (const [sp, v] of Object.entries(r.spaceGames ?? {})) {
        pooled[sp] ??= { n: 0, openerWins: 0 };
        pooled[sp].n += v.n;
        pooled[sp].openerWins += v.openerWins;
      }
    }
    console.log(`\nby space, over the last ${tail.length} rounds\n`);
    console.log(pad('space', 12) + pad('opener', 10) + pad('95% CI', 16) + 'games');
    console.log('-'.repeat(48));
    for (const sp of SPACES.map(spaceName)) {
      const v = pooled[sp];
      if (!v) continue;
      const [lo, hi] = wilson(v.openerWins, v.n);
      console.log(pad(sp, 12) + pad(pct(v.openerWins / v.n) + '%', 10) +
        pad('[' + pct(lo) + ',' + pct(hi) + ']', 16) + v.n);
    }
  }

  const counts = {};
  for (const b of state.population) counts[key(b)] = (counts[key(b)] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('\nwhat the population ended up holding\n');
  console.log(pad('hand', 24) + pad('counterattack', 16) + pad('copies', 9) + pad('share', 8) +
    (ranks ? pad('census rank', 14) + pad('1st', 9) + '2nd' : ''));
  console.log('-'.repeat(ranks ? 96 : 57));
  for (const [k, n] of top) {
    const [hk, item] = k.split('|');
    const r = ranks?.[hk];
    console.log(pad(label(hk.split(',')), 24) + pad(item, 16) + pad(n, 9) +
      pad(pct(n / state.pop) + '%', 8) +
      (ranks
        ? pad(r ? `${r.rank} of ${r.of}` : '-', 14) +
          (r ? pad(pct(r.first) + '%', 9) + pct(r.second) + '%' : '-')
        : ''));
  }

  // Selection scores a loadout on both seats, but what it is actually picking
  // may be the opening seat alone.
  if (ranks) {
    const weighted = (pick) => {
      let n = 0, sum = 0;
      for (const b of state.population) {
        const r = ranks[handKey(b.hand)];
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
  console.log('  distinct loadouts    ' + first.distinct + ' -> ' + last.distinct +
    ' of ' + state.pop);
  console.log('  commonest            ' + last.commonest + ' at ' + pct(last.topShare) + '%');
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
    items: process.argv.includes('--items'),
    item: arg('item', null),     // one Counterattack, given to everybody
    space: arg('space', null),   // one stone type switched off for the whole run
    circuit: process.argv.includes('--circuit'),   // a space drawn per game
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
      items: opts.items,
      circuit: opts.circuit,
      space: opts.space,
      fixedItem: opts.item,
      population: Array.from({ length: opts.pop }, () => ({
        hand: randomHand(rng),
        item: opts.items ? LOADOUT_ITEMS[(rng() * LOADOUT_ITEMS.length) | 0] : opts.item,
      })),
      history: [], totalGames: 0,
    };
    state.population = state.population.map(asBuild);

    for (let r = 0; r < opts.rounds; r++) {
      const round = state.history.length + 1;
      const specs = buildSpecs(state.population, state, rng, opts.seed + state.totalGames);
      const games = await runSpecs(specs, opts.workers);

      const score = state.population.map(() => ({ n: 0, wins: 0 }));
      // Per-space record, so a circuit says which spaces the seat turns on.
      const spaceGames = {};
      // Every item's record from the seat it is live in.
      const itemGames = {};
      let openerWins = 0, turns = 0, lineEnds = 0;
      for (const g of games) {
        score[g.opener].n++; score[g.opener].wins += g.openerWon;
        score[g.replier].n++; score[g.replier].wins += 1 - g.openerWon;
        const item = itemName(state.population[g.replier].item);
        itemGames[item] ??= { n: 0, wins: 0 };
        itemGames[item].n++;
        itemGames[item].wins += 1 - g.openerWon;
        openerWins += g.openerWon;
        turns += g.turns;
        if (g.reason === 'line') lineEnds++;
        if (state.circuit) {
          const sp = spaceName(g.space);
          spaceGames[sp] ??= { n: 0, openerWins: 0 };
          spaceGames[sp].n++;
          spaceGames[sp].openerWins += g.openerWon;
        }
      }

      const counts = {};
      for (const b of state.population) counts[key(b)] = (counts[key(b)] ?? 0) + 1;
      const [commonest, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const [hk, item] = commonest.split('|');
      state.history.push({
        round,
        games: games.length,
        openerWins,
        openerRate: openerWins / games.length,
        turns: turns / games.length,
        lineRate: lineEnds / games.length,
        distinct: Object.keys(counts).length,
        commonest: label(hk.split(',')) + (state.items ? ` + ${item}` : ''),
        topShare: topCount / state.population.length,
        shares: shares(state.population),
        itemShares: state.items ? itemShares(state.population) : null,
        itemGames: state.items ? itemGames : null,
        spaceGames: state.circuit ? spaceGames : null,
        censusRate: ranks
          ? state.population.reduce((s, b) => s + (ranks[handKey(b.hand)]?.rate ?? 0), 0) / state.pop
          : null,
      });
      state.totalGames += games.length;
      state.population = select(state.population, score.map((s) => s.wins / s.n), state.cull, rng);

      console.error(`  round ${pad(round, 4)} opener ${pct(openerWins / games.length)}%  ` +
        `distinct ${pad(Object.keys(counts).length, 5)} top ${label(hk.split(','))}` +
        (state.items ? ` + ${item}` : ''));
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, JSON.stringify(state));
    }
  }

  report(state, ranks);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
