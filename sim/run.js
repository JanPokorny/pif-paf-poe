'use strict';
// Skill balance tournament.
//
//   node sim/run.js --mode general  --games 300 --iters 400
//   node sim/run.js --mode synergy  --games 300 --iters 400
//   node sim/run.js --mode pool     --games 300 --iters 400   (skills vs each other)
//
// Every match is MIRRORED: both players get the identical hand and the identical
// search budget, and each hand is played twice (once with each player moving
// first). The only asymmetry left is the skill, so the win rate is the skill's
// effect and nothing else.

const { fork } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { TYPES, SKILLS, SKILL_IDS, initGameState, getLegalActions, doAction } = require('./engine');
const { makeRng, mctsSearchIter } = require('./mcts');

// The counter that says "this skill actually did something this game".
const ACTIVATION = {
  whirlwind: 'whirlwind_ring', telekinesis: 'telekinesis_line', relentless: 'relentless_take',
  overload: 'overload_second', lingering: 'lingering_extra', slither: 'slither_diag',
  anchor: 'anchor_shield', scavenger: 'scavenger_steal', none: null,
};

const KEY_STONES = {
  whirlwind: ['rotate'], telekinesis: ['shift'], relentless: ['regular'],
  overload: ['2048'], lingering: ['magnet', 'stinky'], slither: ['chain'],
  anchor: [], scavenger: [], none: [],
};

// ── One game ────────────────────────────────────────────────────────────────

function playGame(spec) {
  const { hand, skillX, skillO, first, iters, seed, smart } = spec;
  const rng = makeRng(seed);
  const s = initGameState(hand, hand, first, { X: skillX, O: skillO });
  let moves = 0, turns = 0;
  while (s.phase !== 'gameOver' && moves < 400) {
    const acts = getLegalActions(s);
    if (!acts.length) break;
    const before = s.currentPlayer;
    doAction(s, acts.length === 1 ? acts[0] : mctsSearchIter(s, iters, rng, { smart }));
    if (s.currentPlayer !== before) turns++;
    moves++;
  }
  return { winner: s.winner, reason: s.winReason || 'cap', turns, stats: s.stats };
}

// ── Spec generation ─────────────────────────────────────────────────────────

function randomHand(rng, size) {
  const h = [];
  for (let i = 0; i < size; i++) h.push(TYPES[(rng() * TYPES.length) | 0]);
  return h;
}

function synergyHand(rng, skill, size) {
  const key = KEY_STONES[skill];
  if (!key.length) return randomHand(rng, size);
  const h = [];
  const n = Math.max(3, Math.round(size * 0.6));
  for (let i = 0; i < n; i++) h.push(key[(rng() * key.length) | 0]);
  while (h.length < size) h.push(TYPES[(rng() * TYPES.length) | 0]);
  return h;
}

function buildSpecs(opts) {
  const rng = makeRng(opts.seed);
  const specs = [];
  let skills = SKILL_IDS.filter(s => s !== 'none');
  if (opts.only) skills = skills.filter(s => opts.only.includes(s));
  const pairs = [];
  if (opts.mode === 'pool') {
    const pool = opts.only ? SKILL_IDS.filter(s => opts.only.includes(s) || s === 'none') : SKILL_IDS;
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) pairs.push([pool[i], pool[j], null]);
  } else if (opts.mode === 'ctrl') {
    // Same hand shapes as --mode synergy, but neither player has a skill: shows
    // what the hand alone does to the first-mover advantage.
    for (const sk of skills) if (KEY_STONES[sk].length) pairs.push(['none', 'none', sk]);
  } else {
    pairs.push(['none', 'none', null]);           // control
    for (const sk of skills) pairs.push([sk, 'none', null]);
  }
  for (const [a, b, handSkill] of pairs) {
    const nHands = Math.ceil(opts.games / 2);
    for (let g = 0; g < nHands; g++) {
      const shape = handSkill || (a === 'none' ? b : a);
      const stacked = opts.mode === 'synergy' || opts.mode === 'ctrl';
      const hand = stacked ? synergyHand(rng, shape, opts.hand) : randomHand(rng, opts.hand);
      const label = handSkill ? `none vs none [${handSkill} hand]` : `${a} vs ${b}`;
      const seed = (rng() * 2 ** 31) | 0;
      // A moves first in one game, B moves first in the other.
      const base = { a, b, label, hand, skillX: a, skillO: b, iters: opts.iters, smart: opts.smart };
      specs.push({ ...base, first: 'X', seed });
      specs.push({ ...base, first: 'O', seed: seed + 1 });
    }
  }
  return specs;
}

// ── Worker ──────────────────────────────────────────────────────────────────

if (process.argv.includes('--worker')) {
  process.on('message', msg => {
    if (msg.type === 'chunk') {
      const out = msg.specs.map(sp => {
        const r = playGame(sp);
        return { a: sp.a, b: sp.b, label: sp.label, first: sp.first, hand: sp.hand, ...r };
      });
      process.send({ type: 'done', out });
    }
  });
  return;
}

// ── Parent ──────────────────────────────────────────────────────────────────

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

function wilson(w, n) { // 95% CI half-width-ish bounds for a proportion
  if (!n) return [0, 0];
  const z = 1.96, p = w / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function wilsonPair(w, n) { const [lo, hi] = wilson(w, n); return { lo, hi }; }

async function main() {
  const opts = {
    mode: arg('mode', 'general'),
    games: parseInt(arg('games', '200'), 10),
    iters: parseInt(arg('iters', '400'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, Math.min(os.cpus().length, 8)))), 10),
    seed: parseInt(arg('seed', '12345'), 10),
    out: arg('out', null),
    smart: !process.argv.includes('--dumb'),
    hand: parseInt(arg('hand', '5'), 10),
    only: arg('only', null) ? arg('only', null).split(',') : null,
  };
  const specs = buildSpecs(opts);
  console.error(`mode=${opts.mode} games/matchup=${opts.games} iters=${opts.iters} hand=${opts.hand} rollout=${opts.smart ? 'policy' : 'random'} total=${specs.length} workers=${opts.workers}`);

  const chunks = Array.from({ length: opts.workers }, () => []);
  specs.forEach((s, i) => chunks[i % opts.workers].push(s));

  const t0 = Date.now();
  let finished = 0;
  const results = await Promise.all(chunks.map((chunk, w) => new Promise((res, rej) => {
    const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', m => {
      if (m.type === 'done') { finished++; child.kill(); res(m.out); }
    });
    child.on('error', rej);
    child.send({ type: 'chunk', specs: chunk });
  })));
  const games = results.flat();
  console.error(`played ${games.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Aggregate per matchup, from A's point of view.
  const agg = new Map();
  for (const g of games) {
    const k = g.label || (g.a + ' vs ' + g.b);
    if (!agg.has(k)) agg.set(k, { label: k, a: g.a, b: g.b, w: 0, l: 0, d: 0, n: 0, firstW: 0, firstN: 0, secondW: 0, secondN: 0, reasons: {}, turns: 0, act: 0, actW: 0, full: 0 });
    const r = agg.get(k);
    const aWon = g.winner === 'X', bWon = g.winner === 'O';
    r.n++; r.turns += g.turns;
    if (aWon) r.w++; else if (bWon) r.l++; else r.d++;
    const aFirst = g.first === 'X';
    const pts = aWon ? 1 : bWon ? 0 : 0.5;
    if (aFirst) { r.firstN++; r.firstW += pts; } else { r.secondN++; r.secondW += pts; }
    r.reasons[g.reason] = (r.reasons[g.reason] || 0) + 1;
    const key = ACTIVATION[g.a];
    const fired = key && g.stats && g.stats.X[key] > 0;
    if (fired) { r.act++; if (aWon) r.actW++; else if (!bWon) r.actW += 0.5; }
    if (g.stats && (g.stats.X.remove > 0 || g.stats.O.remove > 0)) r.full++;
  }

  const rows = [...agg.values()].map(r => {
    const score = (r.w + 0.5 * r.d) / r.n;
    const [lo, hi] = wilson(r.w + 0.5 * r.d, r.n);
    return { ...r, score, lo, hi };
  }).sort((x, y) => y.score - x.score);

  const pad = (s, n) => String(s).padEnd(n);
  const p3 = x => (x * 100).toFixed(1).padStart(5);
  console.log('\n' + pad('matchup', 30) + pad('score', 8) + pad('95% CI', 16) + pad('W-L-D', 14) + pad('1st', 7) + pad('2nd', 7) +
    pad('turns', 7) + pad('fired', 7) + pad('|score', 8) + pad('full', 7) + 'endings');
  console.log('-'.repeat(124));
  for (const r of rows) {
    const reasons = Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' ');
    console.log(
      pad(r.label, 30) +
      pad(p3(r.score) + '%', 8) +
      pad('[' + p3(r.lo) + ',' + p3(r.hi) + ']', 16) +
      pad(r.w + '-' + r.l + '-' + r.d, 14) +
      pad(p3(r.firstN ? r.firstW / r.firstN : 0), 7) +
      pad(p3(r.secondN ? r.secondW / r.secondN : 0), 7) +
      pad((r.turns / r.n).toFixed(1), 7) +
      pad(p3(r.act / r.n), 7) +
      pad(r.act ? p3(r.actW / r.act) + '%' : '   -  ', 8) +
      pad(p3(r.full / r.n), 7) + reasons);
  }
  if (opts.mode === 'pool') {
    const per = new Map();
    for (const g of games) {
      for (const [who, sk] of [['X', g.a], ['O', g.b]]) {
        if (!per.has(sk)) per.set(sk, { pts: 0, n: 0 });
        const e = per.get(sk);
        e.n++;
        e.pts += g.winner === who ? 1 : g.winner === null ? 0.5 : 0;
      }
    }
    const board = [...per.entries()].map(([sk, e]) => ({ sk, score: e.pts / e.n, n: e.n, ...wilsonPair(e.pts, e.n) }))
      .sort((a, b) => b.score - a.score);
    console.log('\nleaderboard (every skill against every other, mirrored hands)');
    console.log(pad('skill', 16) + pad('score', 8) + pad('95% CI', 16) + 'games');
    console.log('-'.repeat(52));
    for (const r of board) console.log(pad(r.sk, 16) + pad(p3(r.score) + '%', 8) + pad('[' + p3(r.lo) + ',' + p3(r.hi) + ']', 16) + r.n);
  }

  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, JSON.stringify({ opts, rows }, null, 1));
    console.error('wrote ' + opts.out);
  }
}

main();
