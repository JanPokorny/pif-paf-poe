'use strict';
// Random-loadout tournament: the question the in-game autobattler asks, but with
// enough games and both seatings to be trustworthy.
//
//   node sim/loadouts.js --loadouts 60 --opponents 16 --games 2 --iters 450
//   node sim/loadouts.js --pool regular,2048,rotate,magnet,stinky   (drop shift+chain)
//
// Every loadout plays `opponents` randomly drawn rivals, `games` times each, in
// both seatings. Then each stone's marginal value is fitted by least squares over
// the loadout scores, which answers "is a stone worth having" directly rather
// than through the accident of which loadouts happened to be generated.

const { TYPES: ALL_TYPES } = require('./engine');
const { runSpecs, wilson, arg, defaultWorkers } = require('./tourney');
const { makeRng } = require('./mcts');

function buildSpecs(opts) {
  const TYPES = opts.pool;
  const rng = makeRng(opts.seed);
  const loadouts = [];
  for (let i = 0; i < opts.loadouts; i++) {
    const h = [];
    for (let j = 0; j < 5; j++) h.push(TYPES[(rng() * TYPES.length) | 0]);
    loadouts.push(h);
  }
  const specs = [];
  let seed = opts.seed + 1;
  for (let i = 0; i < loadouts.length; i++) {
    for (let k = 0; k < opts.opponents; k++) {
      let j = (rng() * loadouts.length) | 0;
      if (j === i) j = (j + 1) % loadouts.length;
      for (let g = 0; g < opts.games; g++) {
        const base = { a: i, b: j, handX: loadouts[i], handO: loadouts[j], iters: opts.iters, rules: opts.rules };
        specs.push({ ...base, first: 'X', seed: seed++ });
        specs.push({ ...base, first: 'O', seed: seed++ });
      }
    }
    // A couple of mirror games per loadout, purely to measure the seat advantage.
    for (let g = 0; g < opts.mirrors; g++) {
      const base = { a: i, b: i, mirror: true, handX: loadouts[i], handO: loadouts[i], iters: opts.iters, rules: opts.rules };
      specs.push({ ...base, first: 'X', seed: seed++ });
      specs.push({ ...base, first: 'O', seed: seed++ });
    }
  }
  return { specs, loadouts };
}

// Least squares over stone counts. The counts of a hand always sum to 5, so an
// intercept would be collinear; we fit without one and read the coefficients as
// "points this stone contributes per copy".
function fitPerStone(loadouts, score, TYPES) {
  const n = TYPES.length;
  const X = loadouts.map(h => TYPES.map(t => h.filter(s => s === t).length));
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let r = 0; r < loadouts.length; r++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += X[r][i] * X[r][j];
      A[i][n] += X[r][i] * score[r];
    }
  }
  for (let c = 0; c < n; c++) {                       // Gaussian elimination
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-9) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return TYPES.map((t, i) => Math.abs(A[i][i]) < 1e-9 ? 0 : A[i][n] / A[i][i]);
}

async function main() {
  const opts = {
    loadouts: parseInt(arg('loadouts', '60'), 10),
    opponents: parseInt(arg('opponents', '16'), 10),
    games: parseInt(arg('games', '2'), 10),
    iters: parseInt(arg('iters', '450'), 10),
    seed: parseInt(arg('seed', '31337'), 10),
    workers: parseInt(arg('workers', String(defaultWorkers())), 10),
    rules: arg('rules', null) ? JSON.parse(arg('rules', null)) : undefined,
    mirrors: parseInt(arg('mirrors', '3'), 10),
    pool: (arg('pool', null) || ALL_TYPES.join(',')).split(','),
    quiet: process.argv.includes('--quiet'),
  };
  for (const t of opts.pool) if (!ALL_TYPES.includes(t)) throw new Error('unknown stone: ' + t);
  const TYPES = opts.pool;
  const { specs, loadouts } = buildSpecs(opts);
  console.error(`loadouts: pool=[${TYPES.join(' ')}] ${loadouts.length} hands, ${specs.length} games, iters=${opts.iters}`);
  const t0 = Date.now();
  const games = await runSpecs(specs, opts.workers);
  console.error(`played ${games.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const pts = new Array(loadouts.length).fill(0), n = new Array(loadouts.length).fill(0);
  let firstPts = 0, firstN = 0, turns = 0;
  for (const g of games) {
    const aPts = g.winner === 'X' ? 1 : g.winner === null ? 0.5 : 0;
    turns += g.turns;
    if (g.mirror) { firstPts += g.first === 'X' ? aPts : 1 - aPts; firstN++; continue; }
    pts[g.a] += aPts; n[g.a]++;
    pts[g.b] += 1 - aPts; n[g.b]++;
  }
  const score = loadouts.map((_, i) => n[i] ? pts[i] / n[i] : 0.5);
  const mean = score.reduce((s, v) => s + v, 0) / score.length;
  const sd = Math.sqrt(score.reduce((s, v) => s + (v - mean) ** 2, 0) / score.length);
  const sorted = [...score].sort((a, b) => b - a);
  const decile = Math.max(1, Math.round(score.length / 10));
  const topDecile = sorted.slice(0, decile).reduce((s, v) => s + v, 0) / decile;
  const botDecile = sorted.slice(-decile).reduce((s, v) => s + v, 0) / decile;

  // One line per pool, for the leave-one-out comparison.
  console.log('POOL\t' + TYPES.join(',') + '\tsd=' + (sd * 100).toFixed(1) +
    '\tp90-p10=' + ((topDecile - botDecile) * 100).toFixed(1) +
    '\tfirst=' + (firstPts / firstN * 100).toFixed(1) +
    '\tturns=' + (turns / games.length).toFixed(1));
  if (opts.quiet) return;

  const pad = (s, w) => String(s).padEnd(w);
  const p3 = x => (x * 100).toFixed(1).padStart(5);

  const ranked = loadouts.map((h, i) => ({ h, i, score: score[i], n: n[i] })).sort((x, y) => y.score - x.score);
  console.log('\ntop and bottom loadouts');
  console.log(pad('rank', 6) + pad('score', 8) + pad('games', 7) + 'hand');
  console.log('-'.repeat(74));
  const show = r => console.log(pad(ranked.indexOf(r) + 1, 6) + pad(p3(r.score) + '%', 8) + pad(r.n, 7) +
    [...r.h].sort().join(' '));
  ranked.slice(0, 8).forEach(show);
  console.log('   ...');
  ranked.slice(-5).forEach(show);

  // Presence: how do hands holding at least one copy do? This is the number the
  // in-game autobattler leaderboard invites you to eyeball, and it is confounded.
  console.log('\nper stone');
  console.log(pad('stone', 10) + pad('in top 25%', 12) + pad('base rate', 11) +
    pad('mean w/ >=1', 13) + pad('mean w/ 0', 11) + pad('fitted value/copy', 18));
  console.log('-'.repeat(76));
  const fit = fitPerStone(loadouts, score, TYPES);
  const fitMean = fit.reduce((s, v) => s + v, 0) / fit.length;
  const topCut = Math.max(1, Math.round(loadouts.length / 4));
  const top = ranked.slice(0, topCut);
  for (let i = 0; i < TYPES.length; i++) {
    const t = TYPES[i];
    const has = loadouts.map(h => h.includes(t));
    const withT = score.filter((_, k) => has[k]), without = score.filter((_, k) => !has[k]);
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
    const inTop = top.filter(r => r.h.includes(t)).length / top.length;
    const baseRate = has.filter(Boolean).length / loadouts.length;
    // Per-copy value expressed as the swing a full five-copy hand would see.
    const perCopy = (fit[i] - fitMean) * 5;
    console.log(pad(t, 10) + pad(p3(inTop) + '%', 12) + pad(p3(baseRate) + '%', 11) +
      pad(p3(mean(withT)) + '%', 13) + pad(without.length ? p3(mean(without)) + '%' : '  n/a ', 11) +
      (perCopy >= 0 ? '+' : '') + (perCopy * 100).toFixed(1) + 'pp for 5 copies');
  }
  console.log('\n"in top 25%" is the eyeball statistic; compare it against "base rate" — a stone');
  console.log('present in 54% of random hands will show up in about 54% of the top hands too.');
}

main();
