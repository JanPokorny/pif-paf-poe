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
//   tune      enemy variants given as --spec JSON, against the act's typical pouch
//   slots     each stone in a hand of four and of five: what the fifth slot changes
//   effects   how often each stone does nothing, and how many choices it asks for
//   matrix    each stone (the rest Pebbles) against every enemy as rolled; --stones a,b to pick some
//
// The player's brain is `--iters` (250) with a 5% blunder: a fair, careful player.

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, applyAction, legalActions, allowedSquares, STONES, STONE_TYPES, CONDS } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
import { ENEMIES } from '../src/content.js';
import * as R from '../src/run.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const P = (n) => Array(Math.max(0, n)).fill('pebble');
const WITH_PLUS = STONE_TYPES;   // (once with the + forms too; there are none now)

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
      const kind = s.selected.type, type = kind;
      const snap = (skip) => JSON.stringify([s.board.map((c) => (c && c.id !== skip ? [c.id, c.player] : null)), s.hands.O.length, s.forced]);
      const hushed = false;
      const before = snap(null), handBefore = s.hands.X.length, pid = s.nextId;   // the hand already gave the stone up at select
      applyAction(s, a);
      bump(type, 'placed');
      const st = STONES[kind];
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
    }
    applyAction(s, a);
  }
  return { key: t.key, exp: t.exp, won: s.winner === 'X' ? 1 : 0, reason: s.reason, turns: s.turns, track };
}

// ── Proposed changes, patched into the stone table for one duel ──────────────

const ORIGINAL = Object.fromEntries(Object.entries(STONES).map(([k, v]) => [k, { ...v }]));
const enemyPulls = (s, pos, cell) => {
  const out = [];
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    const r = ((pos / 3) | 0), c = pos % 3, mr = r + dr, mc = c + dc, fr = r + 2 * dr, fc = c + 2 * dc;
    if (fr < 0 || fr > 2 || fc < 0 || fc > 2) continue;
    const far = fr * 3 + fc, mid = mr * 3 + mc;
    if (s.board[far] && !s.board[mid] && s.board[far].player !== cell.player && !STONES[s.board[far].type].immovable) out.push([far, mid]);
  }
  return out;
};
const ORTHO4 = (i) => [i - 3, i + 3, i % 3 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1].filter((j) => j >= 0 && j < 9);
const AROUND = (i) => [...Array(9).keys()].filter((j) => j !== i && Math.abs(((j / 3) | 0) - ((i / 3) | 0)) <= 1 && Math.abs((j % 3) - (i % 3)) <= 1);
const PATCHES = {
  // Bumper: an enemy stone it cannot push away is knocked off the board.
  'bumper:knock': { apply(s, pos, a, cell) {
    const r = (pos / 3) | 0, c = pos % 3;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
      const n = nr * 3 + nc, cl = s.board[n];
      if (!cl || cl.player === cell.player || STONES[cl.type].immovable) continue;
      if (tr < 0 || tr > 2 || tc < 0 || tc > 2) s.board[n] = null;
      else if (!s.board[tr * 3 + tc]) { s.board[tr * 3 + tc] = cl; s.board[n] = null; }
    }
  } },
  // Rehearse: a copy of the last special stone you placed.
  // Lasso: fetches any enemy stone to an empty square beside it.
  'lasso:fetch': {
    options: (s, pos, cell) => { const out = []; for (let i = 0; i < 9; i++) { const c = s.board[i]; if (!c || c.player === cell.player || STONES[c.type].immovable || ORTHO4(pos).includes(i)) continue; for (const to of ORTHO4(pos)) if (!s.board[to]) out.push({ from: i, to }); } return out; },
    apply(s, pos, a) { s.board[a.to] = s.board[a.from]; s.board[a.from] = null; },
  },
  // Lasso: pulls only enemy stones.
  'lasso:enemy': { options: (s, pos, cell) => (ORIGINAL.lasso.options(s, pos).length && enemyPulls(s, pos, cell).length ? [{}] : []), apply(s, pos, a, cell) { for (const [f, t] of enemyPulls(s, pos, cell)) { s.board[t] = s.board[f]; s.board[f] = null; } } },
  // Mountain: it may go anywhere, whatever the enemy's restrictions.
  'mountain:free': { free: true },

  // Bumper: pushes in all eight directions.
  'bumper:eight': { apply(s, pos, a, cell) {
    const moves = [];
    for (const j of AROUND(pos)) {
      const dr = ((j / 3) | 0) - ((pos / 3) | 0), dc = (j % 3) - (pos % 3), r = ((j / 3) | 0) + dr, c = (j % 3) + dc;
      if (!s.board[j] || s.board[j].player === cell.player || STONES[s.board[j].type].immovable || r < 0 || r > 2 || c < 0 || c > 2) continue;
      if (!s.board[r * 3 + c]) moves.push([j, r * 3 + c]);
    }
    for (const [f, t] of moves) { s.board[t] = s.board[f]; s.board[f] = null; }
  } },
  // Firecracker: leaves a scorched Pebble behind instead of burning away.
  firecracker: { apply(s, pos, a) { const c = s.board[a.target]; s.hands[c.player].push({ type: c.type }); s.board[a.target] = null; s.board[pos].type = 'pebble'; } },
  // Twin: opposite across the board, whatever stands in the centre.
  twin: { options: (s, pos) => { const j = 8 - pos; return j !== pos && !s.board[j] ? [{ target: j }] : []; } },
  // Frog: an enemy stone leapt over turns to your side.
  'frog:turn': { apply(s, pos, a, cell) { const mid = ((pos + a.target) / 2) | 0; s.board[a.target] = s.board[pos]; s.board[pos] = null; if (s.board[mid] && s.board[mid].player !== cell.player) s.board[mid].player = cell.player; } },
  // Frog: an enemy stone leapt over is gone, not back in their hand.
  'frog:remove': { apply(s, pos, a, cell) { const mid = ((pos + a.target) / 2) | 0; s.board[a.target] = s.board[pos]; s.board[pos] = null; if (s.board[mid] && s.board[mid].player !== cell.player) s.board[mid] = null; } },
  // Lasso: always pulls them all, no choice.
  lasso: { options: (s, pos) => ORIGINAL.lasso.options(s, pos).slice(0, 1) },
};
let patched = null;
function patch(id) {
  if (patched === (id ?? null)) return;
  for (const k of Object.keys(ORIGINAL)) { for (const f of Object.keys(STONES[k])) if (!(f in ORIGINAL[k])) delete STONES[k][f]; Object.assign(STONES[k], ORIGINAL[k]); }
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
// offer it (two special stones in act 1, four in act 2, five in act 3), of
// which the dearest the act's energy pays for (1, 3, 5) come along, and
// Pebbles fill the hand up to four.
const ENERGY = Object.fromEntries((arg('energy', '1,4,8')).split(',').map((v, i) => [i + 1, +v]));
const SLOTS = { 1: 4, 2: 4, 3: 4 };
function typicalHand(act, seed) {
  const run = runAt(act, seed * 13 + 1);
  const found = { 1: 2, 2: 4, 3: 5 }[act];
  const pouch = [];
  for (let i = 0; i < found; i++) pouch.push(R.randomStone(run, null, act === 1 ? 'normal' : 'elite').type);
  if (act >= 2) pouch.push(R.randomOnce(run).type);
  const hand = [];
  let left = ENERGY[act];
  for (const t of pouch.sort((x, y) => R.costOf(y) - R.costOf(x))) if (R.costOf(t) <= left) { hand.push(t); left -= R.costOf(t); }
  return [...hand, ...P(R.HAND - hand.length)];
}

const BUILDS = {
  'pebbles only': [],
  'movers (Shift, Rotate)': ['shift', 'rotate'],
  'restrictions (Magnet, Stinky)': ['magnet', 'stinky'],
  'Magnet + Shift': ['magnet', 'shift'],
  'Magnet + Stinky': ['magnet', 'stinky'],
  'two Mountains': ['mountain', 'mountain'],
  'Swap + Lasso': ['swap', 'lasso'],
  'Gravity + Bonfire': ['gravity', 'bonfire'],
  'one-shots (Relocate, Muffle)': ['relocate', 'muffle'],
  'Magnet, Stinky, Shift, Rotate': ['magnet', 'stinky', 'shift', 'rotate'],
};

const EXPERIMENTS = {
  power(g) {
    const out = [];
    const foes = { 'vs Pebbles': P(5), 'vs Shift': ['shift', ...P(4)], 'vs Magnet+Shift': ['magnet', 'shift', ...P(3)] };
    for (const type of WITH_PLUS) for (const [fk, handO] of Object.entries(foes)) for (let i = 0; i < g; i++) {
      out.push({ key: `${type}|${fk}`, handX: [type, ...P(3)], handO, seed: i + 1 });
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
    const withX = arg('with', null) ? [arg('with')] : [];
    for (const [type, p] of versions) {
      const version = p ?? 'now';
      for (const [fk, handO] of Object.entries(foes)) for (let i = 0; i < g; i++) out.push({ key: `${version === 'now' ? type + ' now' : version}|${fk}`, patch: p, handX: [type, ...withX, ...P(3 - withX.length)], handO, seed: i + 1 });
      for (const id of cast) for (let i = 0; i < g / 4; i++) {
        const d = enemyDuel(1, id, i * 31 + 7, { tier: ENEMIES[id].tier });
        out.push({ key: `${version === 'now' ? type + ' now' : version}|act 1`, patch: p, handX: [type, ...withX, ...P(3 - withX.length)], handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, modsO: d.modsO, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
      }
    }
    return out;
  },
  tune(g) {
    // Try enemy variants without touching content.js: --spec '[{"id":"oak","undead":1,"set":{"rules2":["clinch","reserved"]}}, ...]'
    const out = [];
    for (const v of JSON.parse(arg('spec', '[]'))) {
      const e = ENEMIES[v.id], saved = { ...e };
      Object.assign(e, v.set ?? {});
      const ctx = e.tier === 'boss' ? { bossWins: v.undead ? 1 : 0 } : { tier: e.tier };
      const label = v.label ?? `${v.id}${v.undead ? '+undead' : ''} ${JSON.stringify(v.set ?? {})}`;
      for (let i = 0; i < g; i++) {
        const d = enemyDuel(e.act, v.id, i * 17 + 3, ctx);
        out.push({ key: label, handX: typicalHand(e.act, i), handO: d.handO.map((x) => x.type), conds: d.conds, rules: d.rules, modsO: d.modsO, itersO: d.iters, blunderO: d.blunder, seed: i + 1 });
      }
      for (const k of Object.keys(e)) if (!(k in saved)) delete e[k];
      Object.assign(e, saved);
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
      for (const type of arg('stones', null)?.split(',') ?? WITH_PLUS) for (let i = 0; i < g; i++) {
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
    const top = (arg('top', 'magnet,stinky,shift,swap,twin,magpie,gravity,bonfire,rotate,mountain,relocate,lasso')).split(',');
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
    for (const type of WITH_PLUS.filter((x) => x !== 'pebble')) for (let i = 0; i < g; i++) {
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
