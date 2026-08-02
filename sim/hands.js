'use strict';
// Hand-archetype round robin: how strong is each kind of hand against each other
// kind, and is the "beats" relation a hierarchy or a rock-paper-scissors web?
//
//   node sim/hands.js --games 400 --iters 600
//   node sim/hands.js --games 400 --iters 600 --rules '{"chainPulls":1}'
//
// Every pair plays both seatings, so the matrix is antisymmetric around 50% and
// the first-mover advantage cannot masquerade as hand strength.

const fs = require('fs');
const path = require('path');
const { TYPES } = require('./engine');
const { runSpecs, wilson, arg, defaultWorkers } = require('./tourney');

// Three ways of looking at the same question.
//   mono  - five copies of one stone: what is this stone worth on its own?
//   swap1 - one stone in an otherwise plain hand: marginal value of one copy.
//   swap2 - two copies inside a mixed shell: marginal value in a real hand.
function archetypeSet(set) {
  const A = {};
  if (set === 'swap1') {
    for (const t of TYPES) A[t] = [t, 'regular', 'regular', 'regular', 'regular'];
  } else if (set === 'swap2') {
    for (const t of TYPES) A[t] = [t, t, 'regular', 'shift', 'rotate'];
  } else {
    for (const t of TYPES) A[t] = Array(5).fill(t);
    A.mixed = ['regular', 'shift', '2048', 'rotate', 'chain'];
    A.control = ['regular', 'magnet', 'stinky', 'shift', 'rotate'];
  }
  return A;
}

let ARCHETYPES = archetypeSet('mono');
let NAMES = Object.keys(ARCHETYPES);

function buildSpecs(opts) {
  ARCHETYPES = archetypeSet(opts.set || 'mono');
  NAMES = Object.keys(ARCHETYPES);
  const specs = [];
  let seed = opts.seed;
  const pairs = [];
  for (let i = 0; i < NAMES.length; i++)
    for (let j = i; j < NAMES.length; j++) pairs.push([NAMES[i], NAMES[j]]);
  for (const [a, b] of pairs) {
    const n = Math.ceil(opts.games / 2);
    for (let g = 0; g < n; g++) {
      const base = { key: a + '|' + b, a, b, handX: ARCHETYPES[a], handO: ARCHETYPES[b], iters: opts.iters, rules: opts.rules };
      specs.push({ ...base, first: 'X', seed: seed++ });
      specs.push({ ...base, first: 'O', seed: seed++ });
    }
  }
  return specs;
}

function cliOpts() {
  return {
    games: parseInt(arg('games', '400'), 10),
    iters: parseInt(arg('iters', '600'), 10),
    seed: parseInt(arg('seed', '777000'), 10),
    workers: parseInt(arg('workers', String(defaultWorkers())), 10),
    rules: arg('rules', null) ? JSON.parse(arg('rules', null)) : undefined,
    out: arg('out', null),
    label: arg('label', 'base'),
    set: arg('set', 'mono'),
  };
}

async function runArchetypes(opts, quiet) {
  const specs = buildSpecs(opts);
  if (!quiet) console.error(`hands[${opts.set || 'mono'}]: ${NAMES.length} archetypes, ${specs.length} games, iters=${opts.iters}, rules=${JSON.stringify(opts.rules || 'default')}`);
  const t0 = Date.now();
  const games = await runSpecs(specs, opts.workers);
  if (!quiet) console.error(`played ${games.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return report(games, opts, quiet);
}

function report(games, opts, quiet) {
  // cell[a][b] = points scored by a against b, over both seatings
  const cell = {}, mirror = {}, meta = {};
  for (const a of NAMES) { cell[a] = {}; for (const b of NAMES) cell[a][b] = { pts: 0, n: 0 }; }
  for (const a of NAMES) { mirror[a] = { firstPts: 0, firstN: 0, turns: 0, n: 0, full: 0 }; meta[a] = { turns: 0, n: 0 }; }

  for (const g of games) {
    const aPts = g.winner === 'X' ? 1 : g.winner === null ? 0.5 : 0;
    if (g.a === g.b) {
      const m = mirror[g.a];
      m.n++; m.turns += g.turns;
      m.firstN++; m.firstPts += g.first === 'X' ? aPts : 1 - aPts;
      if (g.stats && (g.stats.X.remove > 0 || g.stats.O.remove > 0)) m.full++;
      continue;
    }
    cell[g.a][g.b].pts += aPts; cell[g.a][g.b].n++;
    cell[g.b][g.a].pts += 1 - aPts; cell[g.b][g.a].n++;
    for (const k of [g.a, g.b]) { meta[k].turns += g.turns; meta[k].n++; }
  }

  const overall = NAMES.map(a => {
    let pts = 0, n = 0;
    for (const b of NAMES) if (b !== a) { pts += cell[a][b].pts; n += cell[a][b].n; }
    const [lo, hi] = wilson(pts, n);
    return { a, score: pts / n, lo, hi, n, turns: meta[a].turns / (meta[a].n || 1) };
  }).sort((x, y) => y.score - x.score);

  const pad = (s, n) => String(s).padEnd(n);
  const p3 = x => (x * 100).toFixed(1).padStart(5);

  const log = quiet ? () => {} : console.log;
  log('\nmatrix: row archetype scores this %% against column archetype (both seatings)\n');
  log(pad('', 10) + NAMES.map(n => pad(n.slice(0, 8), 9)).join(''));
  for (const a of NAMES) {
    let line = pad(a, 10);
    for (const b of NAMES) line += pad(a === b ? '   -  ' : p3(cell[a][b].pts / cell[a][b].n), 9);
    log(line);
  }

  log('\noverall strength (vs the whole field)');
  log(pad('archetype', 12) + pad('score', 8) + pad('95% CI', 16) + pad('turns', 7) + 'beats');
  log('-'.repeat(78));
  for (const r of overall) {
    const beats = NAMES.filter(b => b !== r.a && cell[r.a][b].pts / cell[r.a][b].n > 0.5).length;
    log(pad(r.a, 12) + pad(p3(r.score) + '%', 8) + pad('[' + p3(r.lo) + ',' + p3(r.hi) + ']', 16) +
      pad(r.turns.toFixed(1), 7) + beats + '/' + (NAMES.length - 1));
  }

  log('\nmirror matches (same archetype both sides): the first-mover advantage');
  log(pad('archetype', 12) + pad('1st wins', 10) + pad('turns', 8) + 'board fills');
  log('-'.repeat(48));
  const mirrorRows = NAMES.map(a => ({ a, ...mirror[a], rate: mirror[a].firstPts / mirror[a].firstN }))
    .sort((x, y) => y.rate - x.rate);
  for (const m of mirrorRows)
    log(pad(m.a, 12) + pad(p3(m.rate) + '%', 10) + pad((m.turns / m.n).toFixed(1), 8) + p3(m.full / m.n) + '%');

  // ── Balance metrics ──
  // Spread: how far the best and worst archetypes are from even.
  // Cycles: a > b > c > a triples. A pure hierarchy has none; RPS is all cycles.
  const beats = (a, b) => cell[a][b].pts / cell[a][b].n > 0.5;
  let cycles = 0, triples = 0;
  for (let i = 0; i < NAMES.length; i++)
    for (let j = i + 1; j < NAMES.length; j++)
      for (let k = j + 1; k < NAMES.length; k++) {
        const [a, b, c] = [NAMES[i], NAMES[j], NAMES[k]];
        triples++;
        const wins = [beats(a, b), beats(b, c), beats(c, a)];
        const back = [beats(b, a), beats(c, b), beats(a, c)];
        if (wins.every(Boolean) || back.every(Boolean)) cycles++;
      }
  const scores = overall.map(r => r.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  const firstAdv = mirrorRows.reduce((s, m) => s + m.rate, 0) / mirrorRows.length;
  const worstFirst = Math.max(...mirrorRows.map(m => m.rate));

  log('\nbalance summary [' + opts.label + ']');
  log('  top archetype        ' + overall[0].a + ' ' + p3(overall[0].score) + '%');
  log('  spread (top-bottom)  ' + (spread * 100).toFixed(1) + 'pp');
  log('  RPS cycles           ' + cycles + '/' + triples + ' triples (' + (cycles / triples * 100).toFixed(0) + '%)');
  log('  first-mover edge     ' + p3(firstAdv) + '% mean, ' + p3(worstFirst) + '% worst (' +
    mirrorRows[0].a + ')');
  log('  mean game length     ' + (overall.reduce((s, r) => s + r.turns, 0) / overall.length).toFixed(1) + ' turns');

  // How many archetypes lose to nothing at all: the sharpest "is something OP" test.
  const unbeaten = NAMES.filter(a => NAMES.every(b => b === a || cell[a][b].pts / cell[a][b].n > 0.5)).length;
  log('  unbeaten archetypes  ' + unbeaten);

  const summary = { label: opts.label, unbeaten, top: overall[0].a, topScore: overall[0].score, spread, cycles, triples,
    firstAdv, worstFirst, worstFirstOf: mirrorRows[0].a,
    turns: overall.reduce((s, r) => s + r.turns, 0) / overall.length,
    bottom: overall[overall.length - 1].a, bottomScore: overall[overall.length - 1].score };

  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify({
      opts, matrix: cell, overall, mirror: mirrorRows,
      summary,
    }, null, 1));
    console.error('wrote ' + opts.out);
  }
  return summary;
}

const summaryOut = {};

if (require.main === module) cliOpts && runArchetypes(cliOpts());

module.exports = { runArchetypes, cliOpts, ARCHETYPES, NAMES };
