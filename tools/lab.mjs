// The stone lab: many AI-vs-AI duels, set up per experiment, played in
// parallel, aggregated into tables. Results go to tools/lab-out/<exp>.json.
//
//   node tools/lab.mjs <experiment> [--games N] [--iters N]
//
// Experiments:
//   power     each stone (+ 3 Pebbles) against a Shift hand and a Magnet+Shift hand
//   skill     the same at a weak and a strong player's search: which stones need skill
//   first     each stone (+ 3 Pebbles) against the act-1 cast as the game rolls them
//   enemies   every enemy against a typical pouch for its act: who is toughest
//   bosses    every boss phase against a set of builds: which build each needs
//   pairs     the strongest stones two by two (+ 2 Pebbles)
//   conds     each condition, typical pouch against a typical enemy
//   proposals the changes the stone report suggests, measured against the stones as they are
//   slots     each stone in a hand of four and of five: what the fifth slot changes
//   effects   how often each stone does nothing, and how many choices it asks for
//
// The player's brain is `--iters` (250) with a 5% blunder: a fair, careful player.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { other, createGame, applyAction, legalActions, allowedSquares, STONES, STONE_TYPES, CONDS } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
import { ENEMIES } from '../src/content.js';
import * as R from '../src/run.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const P = (n) => Array(Math.max(0, n)).fill('pebble');
const SPECIALS = STONE_TYPES.filter((t) => t !== 'pebble');

// ── One duel ────────────────────────────────────────────────────────────────
//
// X is the player, O the enemy (who opens unless told otherwise). Tracks,
// for X's special stones: placed, did nothing (board and hands unchanged, for
// stones that move things), cramped the enemy (for restrictions), and how
// many effect choices it offered.
function duel(t) {
  patch(t.patch);
  const rng = makeRng(t.seed);
  const s = createGame({ handX: t.handX, handO: t.handO, first: t.first ?? 'O', conds: t.conds ?? [], rules: t.rules ?? [], modsO: t.modsO ?? {}, log: false });
  const track = {};
  const bump = (type, k, n = 1) => { (track[type] ??= { placed: 0, dud: 0, bite: 0, restrictTurns: 0, choices: 0, hushed: 0, hushedPebble: 0 })[k] += n; };
  let n = 0;
  while (!s.over && n++ < 400) {
    const me = s.player === 'X';
    const a = chooseAction(s, me
      ? { iterations: t.itersX ?? 250, blunder: t.blunderX ?? 0.05, rng }
      : { iterations: t.itersO ?? 250, blunder: t.blunderO ?? 0, rng });
    if (me && a.type === 'place' && s.selected && s.selected.type !== 'pebble') {
      const type = s.selected.type;
      const snap = (skip) => JSON.stringify([s.board.map((c) => (c && c.id !== skip ? [c.id, c.player] : null)), s.hands.O.length, s.forced, s.silenced.O]);
      const hushed = s.silenced.X > 0;
      const before = snap(null), handBefore = s.hands.X.length, pid = s.nextId;   // the hand already gave the stone up at select
      applyAction(s, a);
      bump(type, 'placed');
      const st = STONES[type];
      if (s.phase === 'effect') bump(type, 'choices', legalActions(s).length);
      // Let the effect play out within X's turn.
      while (!s.over && s.player === 'X' && s.phase === 'effect') applyAction(s, chooseAction(s, { iterations: t.itersX ?? 250, blunder: t.blunderX ?? 0.05, rng }));
      // A dud: nothing on the board, in the enemy's hand or in what they must do changed,
      // and our own hand only lost the stone played.
      if (!hushed && st.kind !== 'restrict' && st.kind !== 'static' && snap(pid) === before && s.hands.X.length === handBefore) bump(type, 'dud');
      continue;
    }
    // A restriction bites when the enemy has fewer squares than are free.
    if (!me && s.phase === 'place') {
      const free = s.board.filter((c) => !c).length;
      const allowed = allowedSquares(s).length;
      for (const c of s.board) if (c && c.player === 'X' && c.hushed !== true && STONES[c.type].restrict) { bump(c.type, 'restrictTurns'); if (allowed < free) bump(c.type, 'bite'); }
      // What a Muffle of ours caught: often just a Pebble, as the enemy sees it coming.
      if (s.silenced.O > 0) { bump('muffle', 'hushed'); if (s.selected.type === 'pebble') bump('muffle', 'hushedPebble'); }
    }
    applyAction(s, a);
  }
  return { key: t.key, exp: t.exp, won: s.winner === 'X' ? 1 : 0, reason: s.reason, turns: s.turns, track };
}

// ── Proposed changes, patched into the stone table for one duel ──────────────

const ORIGINAL = Object.fromEntries(Object.entries(STONES).map(([k, v]) => [k, { ...v }]));
const newest = (s, p) => { let best = -1; for (let i = 0; i < 9; i++) if (s.board[i]?.player === p && (best < 0 || s.board[i].id > s.board[best].id)) best = i; return best; };
const ORTHO4 = (i) => [i - 3, i + 3, i % 3 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1].filter((j) => j >= 0 && j < 9);
const PATCHES = {
  // Bribe: only an enemy Pebble beside it.
  bribe: { options: (s, pos, cell) => ORTHO4(pos).filter((j) => s.board[j] && s.board[j].player !== cell.player && s.board[j].type === 'pebble').map((target) => ({ target })) },
  // Firecracker: leaves a scorched Pebble behind instead of burning away.
  firecracker: { apply(s, pos, a) { const c = s.board[a.target]; s.hands[c.player].push({ type: c.type }); s.board[a.target] = null; s.board[pos].type = 'pebble'; } },
  // Overtake: the enemy's centre stone becomes yours.
  'overtake:centre': { apply(s, pos, a, cell) { s.board[4].player = cell.player; } },
  // Twin: opposite across the board, whatever stands in the centre.
  twin: { options: (s, pos) => { const j = 8 - pos; return j !== pos && !s.board[j] ? [{ target: j }] : []; } },
  // Frog: an enemy stone leapt over turns to your side.
  'frog:turn': { apply(s, pos, a, cell) { const mid = ((pos + a.target) / 2) | 0; s.board[a.target] = s.board[pos]; s.board[pos] = null; if (s.board[mid] && s.board[mid].player !== cell.player) s.board[mid].player = cell.player; } },
  // Overtake: the enemy's newest stone goes back to their hand.
  'overtake:last': { options: (s, pos, cell) => { const t = newest(s, other(cell.player)); return t < 0 ? [] : [{ target: t }]; }, apply(s, pos, a) { const c = s.board[a.target]; s.hands[c.player].push({ type: c.type }); s.board[a.target] = null; } },
  // Overtake: the enemy's newest stone becomes a plain Pebble.
  'overtake:dull': { options: (s, pos, cell) => { const t = newest(s, other(cell.player)); return t < 0 ? [] : [{ target: t }]; }, apply(s, pos, a) { s.board[a.target].type = 'pebble'; } },
  // Frog: an enemy stone leapt over is gone, not back in their hand.
  'frog:remove': { apply(s, pos, a, cell) { const mid = ((pos + a.target) / 2) | 0; s.board[a.target] = s.board[pos]; s.board[pos] = null; if (s.board[mid] && s.board[mid].player !== cell.player) s.board[mid] = null; } },
  // Lasso: always pulls them all, no choice.
  lasso: { options: (s, pos) => ORIGINAL.lasso.options(s, pos).slice(0, 1) },
};
let patched = null;
function patch(id) {
  if (patched === (id ?? null)) return;
  for (const k of Object.keys(ORIGINAL)) Object.assign(STONES[k], ORIGINAL[k]);
  if (id) Object.assign(STONES[id.split(':')[0]], PATCHES[id]);
  patched = id ?? null;
}

// ── Experiments: lists of duel set-ups ──────────────────────────────────────

// A run as the game would give it, for rolling enemies with prepareDuel.
function runAt(act, seed) {
  const run = R.newRun({ seed });
  run.act = act;
  return run;
}
function enemyDuel(act, id, seed, ctx = {}) {
  const run = runAt(act, seed);
  return R.prepareDuel(run, id, ctx);
}

// Typical pouches by act: what a player has found by then, as the rewards
// offer it (two special stones in act 1, four in act 2, five in act 3), the
// hand filled up to the act's slots with Pebbles.
const SLOTS = { 1: 4, 2: 5, 3: 6 };
function typicalHand(act, seed) {
  const run = runAt(act, seed * 13 + 1);
  const found = { 1: 2, 2: 4, 3: 5 }[act];
  const hand = [];
  for (let i = 0; i < found; i++) hand.push(R.randomStone(run, null, act === 1 ? 'normal' : 'elite').type);
  if (act >= 2) hand.push(R.randomOnce(run).type);
  return [...hand.slice(0, SLOTS[act]), ...P(SLOTS[act] - hand.length)];
}

const BUILDS = {
  'pebbles only': [],
  'movers (Shift, Rotate)': ['shift', 'rotate'],
  'restrictions (Magnet, Stinky)': ['magnet', 'stinky'],
  'Magnet + Shift': ['magnet', 'shift'],
  'Beacon + Stinky': ['beacon', 'stinky'],
  'two Mountains': ['mountain', 'mountain'],
  'Swap + Turncoat': ['swap', 'turncoat'],
  '2048 + Whirl': ['2048', 'whirl'],
  'one-shots (Pluck, Bribe)': ['pluck', 'bribe'],
  'Magnet, Stinky, Shift, Rotate': ['magnet', 'stinky', 'shift', 'rotate'],
};

const EXPERIMENTS = {
  power(g) {
    const out = [];
    const foes = { 'vs Pebbles': P(5), 'vs Shift': ['shift', ...P(4)], 'vs Magnet+Shift': ['magnet', 'shift', ...P(3)] };
    for (const type of STONE_TYPES) for (const [fk, handO] of Object.entries(foes)) for (let i = 0; i < g; i++) {
      out.push({ key: `${type}|${fk}`, handX: [type === 'pebble' ? 'pebble' : type, ...P(3)], handO, seed: i + 1 });
    }
    return out;
  },
  skill(g) {
    const out = [];
    for (const type of STONE_TYPES) for (const [lvl, it, bl] of [['weak', 60, 0.25], ['strong', 600, 0]]) for (let i = 0; i < g; i++) {
      out.push({ key: `${type}|${lvl}`, handX: [type, ...P(3)], handO: ['shift', ...P(4)], itersX: it, blunderX: bl, seed: i + 1 });
    }
    return out;
  },
  first(g) {
    const out = [];
    const cast = Object.keys(ENEMIES).filter((k) => ENEMIES[k].act === 1 && ENEMIES[k].tier === 'normal');
    for (const type of STONE_TYPES) for (const id of cast) for (let i = 0; i < g; i++) {
      const d = enemyDuel(1, id, i * 31 + 7);
      out.push({ key: `${type}|${id}`, handX: [type, ...P(3)], handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, modsO: d.modsO, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
    }
    return out;
  },
  proposals(g) {
    // Each proposed change against the original: standard hands and the act-1 cast.
    const out = [];
    const foes = { 'vs Pebbles': P(5), 'vs Shift': ['shift', ...P(4)], 'vs Magnet+Shift': ['magnet', 'shift', ...P(3)] };
    const cast = Object.keys(ENEMIES).filter((k) => ENEMIES[k].act === 1 && ENEMIES[k].tier !== 'boss');
    const only = arg('only', null)?.split(',');
    const keys = Object.keys(PATCHES).filter((k) => !only || only.includes(k));
    const versions = [...new Set(keys.map((k) => k.split(':')[0]))].map((k) => [k, null]).concat(keys.map((k) => [k.split(':')[0], k]));
    for (const [type, p] of versions) {
      const version = p ?? 'now';
      for (const [fk, handO] of Object.entries(foes)) for (let i = 0; i < g; i++) out.push({ key: `${version === 'now' ? type + ' now' : version}|${fk}`, patch: p, handX: [type, ...P(3)], handO, seed: i + 1 });
      for (const id of cast) for (let i = 0; i < g / 4; i++) {
        const d = enemyDuel(1, id, i * 31 + 7, { tier: ENEMIES[id].tier });
        out.push({ key: `${version === 'now' ? type + ' now' : version}|act 1`, patch: p, handX: [type, ...P(3)], handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, modsO: d.modsO, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
      }
    }
    return out;
  },
  slots(g) {
    // Each stone with three Pebbles and with four, against a Shift hand: what a fifth slot changes.
    const out = [];
    for (const type of STONE_TYPES) for (const n of [3, 4]) for (let i = 0; i < g; i++) {
      out.push({ key: `${type}|${n + 1} stones`, handX: [type, ...P(n)], handO: ['shift', ...P(4)], seed: i + 1 });
    }
    return out;
  },
  matrix(g) {
    // Each stone, the rest Pebbles, against every enemy of every act as the game rolls them.
    const out = [];
    for (const [id, e] of Object.entries(ENEMIES)) {
      if (!e.act || e.tier === 'boss') continue;
      for (const type of STONE_TYPES) for (let i = 0; i < g; i++) {
        const d = enemyDuel(e.act, id, i * 31 + 7, { tier: e.tier });
        out.push({ key: `${type}|${id}`, handX: [type, ...P(SLOTS[e.act] - 1)], handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, modsO: d.modsO, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
      }
    }
    return out;
  },
  enemies(g) {
    const out = [];
    for (const [id, e] of Object.entries(ENEMIES)) {
      if (!e.act) continue;
      const phases = e.tier === 'boss' ? [0, 1] : [null];
      for (const ph of phases) for (let i = 0; i < g; i++) {
        const d = enemyDuel(e.act, id, i * 17 + 3, e.tier === 'boss' ? { bossWins: ph } : { tier: e.tier });
        out.push({ key: `${id}${ph ? '+undead' : ''}`, handX: typicalHand(e.act, i), handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, modsO: d.modsO, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
      }
    }
    // The events' duels too.
    for (const id of ['hermit', 'nightowl', 'thief']) for (let i = 0; i < g; i++) {
      const d = enemyDuel(2, id, i * 17 + 3, { tier: 'event', event: id });
      out.push({ key: id, handX: typicalHand(2, i), handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
    }
    return out;
  },
  bosses(g) {
    const out = [];
    for (const [id, e] of Object.entries(ENEMIES)) {
      if (e.tier !== 'boss') continue;
      for (const ph of [0, 1]) for (const [bk, build] of Object.entries(BUILDS)) for (let i = 0; i < g; i++) {
        const d = enemyDuel(e.act, id, i * 17 + 3, { bossWins: ph });
        const slots = SLOTS[e.act];
        out.push({ key: `${id}${ph ? '+undead' : ''}|${bk}`, handX: [...build.slice(0, slots), ...P(slots - build.length)], handO: d.handO.map((x) => x.type), rules: d.rules, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
      }
    }
    return out;
  },
  pairs(g) {
    const top = (arg('top', 'magnet,stinky,beacon,shift,swap,twin,turncoat,magpie,2048,flip,rotate,mountain,bribe,pluck')).split(',');
    const out = [];
    for (let a = 0; a < top.length; a++) for (let b = a; b < top.length; b++) for (let i = 0; i < g; i++) {
      out.push({ key: `${top[a]}+${top[b]}`, handX: [top[a], top[b], ...P(2)], handO: ['magnet', 'shift', 'rotate', ...P(2)], seed: i + 1 });
    }
    return out;
  },
  conds(g) {
    const out = [];
    for (const c of ['none', ...Object.keys(CONDS)]) for (let i = 0; i < g; i++) {
      out.push({ key: c, handX: typicalHand(2, i), handO: ['magnet', 'shift', 'rotate', ...P(2)], conds: c === 'none' ? [] : [c], seed: i + 1 });
    }
    return out;
  },
  effects(g) {
    // Every stone in mixed realistic hands, many times: for its effect statistics.
    const out = [];
    for (const type of SPECIALS) for (let i = 0; i < g; i++) {
      const run = runAt(2, i * 7 + 11);
      const other = R.randomStone(run).type;
      out.push({ key: type, handX: [type, other, ...P(3)], handO: ['magnet', 'shift', 'rotate', ...P(2)], seed: i + 1 });
    }
    return out;
  },
};

// ── Running ────────────────────────────────────────────────────────────────

if (!isMainThread) {
  parentPort.on('message', (batch) => parentPort.postMessage(batch.map(duel)));
} else {
  const exp = process.argv[2];
  if (!EXPERIMENTS[exp]) { console.log('experiments:', Object.keys(EXPERIMENTS).join(', ')); process.exit(1); }
  const games = +arg('games', 120);
  const iters = arg('iters', null);
  const tasks = EXPERIMENTS[exp](games).map((t) => ({ ...t, exp, ...(iters && !t.itersX ? { itersX: +iters } : {}) }));
  const t0 = Date.now();
  const W = cpus().length;
  const workers = Array.from({ length: W }, () => new Worker(new URL(import.meta.url)));
  const results = [];
  let next = 0;
  const BATCH = 20;
  await Promise.all(workers.map((w) => new Promise((done) => {
    const feed = () => {
      if (next >= tasks.length) { w.terminate(); done(); return; }
      const batch = tasks.slice(next, next + BATCH); next += BATCH;
      w.once('message', (r) => { results.push(...r); if (results.length % 2000 < BATCH) process.stderr.write(`  ${results.length}/${tasks.length}\n`); feed(); });
      w.postMessage(batch);
    };
    feed();
  })));
  // Aggregate by key.
  const by = {};
  for (const r of results) {
    const a = (by[r.key] ??= { n: 0, won: 0, full: 0, turns: 0, track: {} });
    a.n++; a.won += r.won; a.turns += r.turns; if (r.reason === 'full') a.full++;
    for (const [type, tr] of Object.entries(r.track)) {
      const b = (a.track[type] ??= { placed: 0, dud: 0, bite: 0, restrictTurns: 0, choices: 0, hushed: 0, hushedPebble: 0 });
      for (const k of Object.keys(b)) b[k] += tr[k];
    }
  }
  mkdirSync(new URL('./lab-out/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`./lab-out/${exp}.json`, import.meta.url), JSON.stringify({ exp, games, secs: (Date.now() - t0) / 1000, by }, null, 1));
  const rows = Object.entries(by).map(([k, a]) => [k, a.won / a.n, a.n]).sort((x, y) => y[1] - x[1]);
  for (const [k, w, n] of rows) console.log(`${k.padEnd(48)} ${(w * 100).toFixed(1).padStart(5)}%  (${n})`);
  console.log(`${results.length} duels in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
