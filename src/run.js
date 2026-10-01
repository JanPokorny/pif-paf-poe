// A run: three acts of branching map, each ending in a boss. Pure logic, no DOM,
// so tools/balance.mjs can play whole runs headless.
//
// The run is one JSON-serialisable object. Its random stream is part of it, so
// a saved run resumes exactly.

import { STONES, TRICKS, TRICK_TYPES, CONDS } from './engine.js';
import {
  RELICS, RELIC_TYPES, ENEMIES, ACTS, EVENTS, enemiesOf, EASY_OPENERS,
  STONE_PRICE, TRICK_PRICE, RELIC_PRICE, REWARD_STONES,
} from './content.js';

// ── Randomness that saves with the run ──────────────────────────────────────

export function rand(run) {
  run.rs = (run.rs + 0x6d2b79f5) | 0;
  let t = Math.imul(run.rs ^ (run.rs >>> 15), 1 | run.rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (run, list) => list[(rand(run) * list.length) | 0];
const int = (run, lo, hi) => lo + ((rand(run) * (hi - lo + 1)) | 0);
function weighted(run, table) {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rand(run) * total;
  for (const [k, w] of Object.entries(table)) { if ((r -= w) < 0) return k; }
  return Object.keys(table)[0];
}
function shuffle(run, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (rand(run) * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Heat ─────────────────────────────────────────────────────────────────────

export const HEAT = [
  { n: 0, text: 'The standard climb.' },
  { n: 1, text: 'Enemies think harder.' },
  { n: 2, text: 'Shops charge a quarter more.' },
  { n: 3, text: 'Start with 1 fewer heart.' },
  { n: 4, text: 'Elites bring an extra stone, bosses an extra trick.' },
  { n: 5, text: 'Enemies never blunder.' },
];

export const START = { pouch: [], tricks: ['overtake'], hearts: 6, gold: 30, slots: 2 };
export const MAX_SLOTS = 5;

const stone = (run, type) => ({ type, uid: run.nextUid++ });

export function newRun({ seed = (Math.random() * 2 ** 31) | 0, heat = 0 } = {}) {
  const hearts = START.hearts - (heat >= 3 ? 1 : 0);
  const run = {
    v: 2, seed, rs: seed, heat,
    act: 1, atBoss: false, map: null,
    hearts, maxHearts: hearts,
    gold: START.gold, pouch: [], tricks: [...START.tricks], relics: [],
    slots: START.slots,
    aids: { free: 0, double: 0 },   // map aids won in duels
    lastHand: null, nextUid: 1,
    rematchUsed: {}, phoenixUsed: false,
    stats: { won: 0, lost: 0, elites: 0, bosses: 0, gold: 0, started: Date.now() },
    screen: 'actintro', pending: null, over: false, victory: false,
  };
  run.pouch = START.pouch.map((t) => stone(run, t));
  run.map = makeMap(run);
  return run;
}

export const has = (run, relic) => run.relics.includes(relic);
export const pouchCap = (run) => 6 + (has(run, 'satchel') ? 2 : 0);
export const trickCap = (run) => 3 + (has(run, 'satchel') ? 1 : 0);
// How many special stones you bring into a duel. Pebbles are always there.
export const handSize = (run) => Math.min(MAX_SLOTS + 1, (run.slots ?? 2) + (has(run, 'deep-pockets') ? 1 : 0));
export const trickUses = (run) => 1 + (has(run, 'gloves') ? 1 : 0);
export const stoneName = (s) => STONES[s.type].name;

// ── Crafting ────────────────────────────────────────────────────────────────
//
// At a workshop two stones become one of the next tier up from the humbler
// of the two (rares stay rare): a choice of two.

const TIERS = ['common', 'uncommon', 'rare'];
export const craftTier = (a, b) => {
  const low = Math.min(TIERS.indexOf(STONES[a.type].rarity), TIERS.indexOf(STONES[b.type].rarity));
  return TIERS[Math.min(TIERS.length - 1, low + 1)];
};
export function craftChoices(run, a, b) {
  const tier = craftTier(a, b);
  const out = [];
  for (let g = 0; out.length < 2 && g < 40; g++) {
    const s = randomStone(run, tier);
    if (!out.some((o) => o.type === s.type) && s.type !== a.type && s.type !== b.type) out.push(s);
  }
  return out;
}
// Trade the two stones (by uid) for the one chosen.
export function craft(run, uidA, uidB, result) {
  run.pouch = run.pouch.filter((s) => s.uid !== uidA && s.uid !== uidB);
  return gainStone(run, result);
}

// ── The map ─────────────────────────────────────────────────────────────────
//
// The whole climb is one game of Ultimate tic-tac-toe with its boss: nine
// clearings in a 3x3, each clearing a 3x3 of squares, all on view. The boss opens in the
// very middle. Where one side steps inside a clearing decides the clearing the
// other must answer in (anywhere, if that one is finished or has nothing left
// for them). Three in a row inside a clearing takes it; three clearings in a
// row win the map.
//
// You mark X wherever you step. A duel lost scorches its square: you may not
// step there again, but the boss may, and you choose again at once -- the
// boss answers only once you have really placed a mark.
//
// Each clearing the boss takes costs you a heart. Its three in a row ends the
// climb; yours, or a map nobody can win any more, is the victory. The climb
// goes through three acts as your marks add up: each new act re-rolls the
// enemies still waiting on the map from its harder cast.

const BOSS_SEES = [0.3, 0.45, 0.6];       // the chance it blocks your two in a row, by act
const ACT_EVERY = 7;                      // your marks to each new act
export const actFor = (marks) => Math.min(3, 1 + Math.floor(marks / ACT_EVERY));
const GOOD = ['shop', 'rest', 'treasure', 'craft', 'gift'];
export const CLEARING_GOLD = 15;          // for each clearing you take
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const CORNERS = [0, 2, 6, 8];

// Squares are keyed "c:i": clearing c (0..8), square i (0..8), both row-major.
export const keyOf = (c, i) => `${c}:${i}`;
export const parseKey = (k) => k.split(':').map(Number);
export const cellAt = (map, k) => { const [c, i] = parseKey(k); return map.cells[c][i]; };

// Three in a row among `marks` (an array of 9) for `who`, as the line, or null.
const lineIn = (marks, who) => LINES.find((l) => l.every((i) => marks[i] === who)) ?? null;
// The most of `who`'s marks in a line through i that the other side has not
// spoiled (for the boss, scorched squares are no obstacle).
function reach(marks, i, who) {
  let best = 0;
  for (const l of LINES) {
    if (!l.includes(i)) continue;
    let n = 0, dead = false;
    for (const j of l) {
      const m = marks[j];
      if (m === who) n++;
      else if (m && !(m === 'S' && who === 'O')) { dead = true; break; }
    }
    if (!dead) best = Math.max(best, n);
  }
  return best;
}
const marksOf = (map, c) => map.cells[c].map((x) => x.mark);
const bigMarks = (map) => map.won.map((w) => (w === 'X' || w === 'O' ? w : w === 'draw' ? 'S' : null));

// Can this side still step anywhere in clearing c?
function openFor(map, c, who) {
  if (map.won[c]) return false;
  return map.cells[c].some((x) => !x.mark || (who === 'O' && x.mark === 'S'));
}
// The clearings a side may step in now.
function clearingsFor(map, who, target) {
  if (target !== null && target !== undefined && openFor(map, target, who)) return [target];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => openFor(map, c, who));
}

// Step back out of a duel you have only looked at.
export function retreat(run) {
  run.map.at = null;
  run.pending = null;
  run.screen = 'map';
}

// The map of the climb, and its boss.
export function makeMap(run) {
  const map = {
    v: 6,
    boss: pick(run, ACTS.flatMap((a) => a.bosses)),
    page: 1,
    cells: [],         // cells[c][i] = {kind, mark, duel?}; mark X, O or S (scorched)
    won: Array(9).fill(null),   // per clearing: 'X', 'O', 'draw' or null
    next: 4,           // the clearing you must step in (null: any)
    at: null,          // the square being visited right now
    lastO: keyOf(4, 4),
    result: null,      // 'won' or 'draw' (the climb is yours), 'lost' (it is over)
    line: null,        // the clearings of the line that ended the map
    fights: 0,         // duels laid out so far, for the gentle first few
    armed: null,       // a map aid about to be used: 'free' or 'double'
  };
  run.map = map;
  for (let c = 0; c < 9; c++) map.cells.push(Array(9).fill(null));
  map.cells[4][4] = { kind: 'boss-mark', mark: 'O' };
  // Where you start hides a gift.
  map.cells[4][pick(run, [0, 1, 2, 3, 5, 6, 7, 8])] = { kind: 'gift', mark: null };
  // Mini-bosses hold the middles of a few clearings: the squares that matter most.
  for (const c of shuffle(run, [0, 1, 2, 3, 5, 6, 7, 8]).slice(0, 3)) map.cells[c][4] = { kind: 'miniboss', mark: null };
  // The rest in a random order, so that the spreading-out of good squares
  // below has no direction to it.
  const order = [];
  for (let c = 0; c < 9; c++) for (let i = 0; i < 9; i++) if (!map.cells[c][i]) order.push([c, i]);
  for (const [c, i] of shuffle(run, order)) map.cells[c][i] = fillCell(run, c, i);
  rollDuels(run);
  return map;
}
const minibossesOf = (act) => enemiesOf(act, 'miniboss');

// The squares around (c, i) across the whole 9x9 sheet, clearing borders and all.
function aroundOnSheet(c, i) {
  const gx = (c % 3) * 3 + (i % 3), gy = ((c / 3) | 0) * 3 + ((i / 3) | 0);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx, y = gy + dy;
      if ((!dx && !dy) || x < 0 || y < 0 || x > 8 || y > 8) continue;
      out.push([((y / 3) | 0) * 3 + ((x / 3) | 0), (y % 3) * 3 + (x % 3)]);
    }
  }
  return out;
}

// The enemies on the squares still open, for the act the climb is in. Called
// when the map is made and whenever a new act begins.
function rollDuels(run) {
  const map = run.map;
  const minis = minibossesOf(run.act).filter((id) => id !== map.boss);
  const minipool = minis.length ? minis : minibossesOf(run.act);
  for (const cl of map.cells) {
    for (const cell of cl) {
      if (cell.mark) continue;
      if (cell.kind === 'fight') {
        const easy = run.act === 1 && map.fights < 4;
        cell.duel = prepareDuel(run, pick(run, easy ? EASY_OPENERS : enemiesOf(run.act, 'normal')), { easy });
        map.fights++;
      } else if (cell.kind === 'elite') cell.duel = prepareDuel(run, pick(run, enemiesOf(run.act, 'elite')));
      else if (cell.kind === 'miniboss') cell.duel = prepareDuel(run, pick(run, minipool));
    }
  }
}

// What a square is. Squares on more lines -- corners and middles, of the
// clearing and of the map -- hide harder things, and good squares keep their
// distance from one another: each good neighbour already laid out makes
// another good square a quarter as likely.
function fillCell(run, c, i) {
  const map = run.map;
  const hard = (CORNERS.includes(i) || i === 4 ? 3 : 0) + (CORNERS.includes(c) || c === 4 ? 3 : 0);
  const table = { fight: 40, elite: 3 + hard, event: 16, treasure: 6, rest: 12, shop: 10, craft: 6 };
  if (c === 4) delete table.elite;
  const near = aroundOnSheet(c, i).filter(([cc, ii]) => GOOD.includes(map.cells[cc][ii]?.kind)).length;
  for (const k of GOOD) if (table[k]) table[k] *= 0.25 ** near;
  return { kind: weighted(run, table), mark: null };
}

export const xCount = (run) => (run.map?.cells ?? []).flat().filter((x) => x.mark === 'X').length;

// Where you may step next: open squares of the clearing you were sent to --
// or of any clearing, with a Free Step armed.
export function reachable(run) {
  const map = run.map;
  if (map.result) return [];
  const out = [];
  for (const c of playableClearings(map)) map.cells[c].forEach((x, i) => { if (!x.mark) out.push(keyOf(c, i)); });
  return out;
}
export const playableClearings = (map) => (map.result ? [] : clearingsFor(map, 'X', map.armed === 'free' ? null : map.next));

// ── Map aids, won in duels ───────────────────────────────────────────────────
//
//   free:   step in any open clearing, once, whatever the send rule says
//   double: the boss does not answer your next step; you go again, sent by
//           your own square
export const AIDS = {
  free: { name: 'Free Step', text: 'Once, step in any open clearing, wherever you were sent.' },
  double: { name: 'Double Step', text: 'Once, the boss does not answer your step: you go again, in the clearing your own square points to.' },
};
export const AID_TYPES = Object.keys(AIDS);
// Arm an aid for the next step, or put it away again.
export function toggleAid(run, kind) {
  const map = run.map;
  if (map.armed === kind) { map.armed = null; return; }
  if ((run.aids?.[kind] ?? 0) > 0) map.armed = kind;
}

// Squares where the boss would take clearing c with its next mark.
export function bossThreats(map, c) {
  if (map.result || map.won[c]) return [];
  const m = marksOf(map, c);
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => (!m[i] || m[i] === 'S') && reach(m, i, 'O') >= 2).map((i) => keyOf(c, i));
}

// How good a square is for `who`: taking its clearing, and the map; stopping
// the other side doing so; and where it sends them. Both the boss and the run
// bot judge by it. `sees` is whether the other side's threats are noticed.
export function judge(map, k, who, sees = true) {
  const [c, i] = parseKey(k);
  const them = who === 'X' ? 'O' : 'X';
  const m = marksOf(map, c), big = bigMarks(map);
  let score = 0;
  const takes = reach(m, i, who) >= 2, blocks = reach(m, i, them) >= 2;
  if (takes) {
    big[c] = who;
    score += lineIn(big, who) ? 10000 : 200 + 60 * reach(bigMarks(map), c, who);
    big[c] = null;
  }
  if (blocks && sees) score += 150 + 60 * reach(big, c, them);
  score += 8 * reach(m, i, who) + 4 * reach(big, c, who);
  // Where it sends them: into a clearing they could take at once is bad; a
  // finished one lets them go anywhere, which is nearly as bad.
  const t = i;
  const after = { ...map, cells: map.cells.map((cl, cc) => (cc === c ? cl.map((x, ii) => (ii === i ? { ...x, mark: who } : x)) : cl)) };
  if (takes) after.won = map.won.map((w, cc) => (cc === c ? who : w));
  if (!openFor(after, t, them)) score -= 60;
  else {
    const tm = marksOf(after, t);
    if (tm.some((x, j) => (!x || (them === 'O' && x === 'S')) && reach(tm, j, them) >= 2)) score -= 120 + 60 * reach(bigMarks(after), t, them);
  }
  return score;
}

// Settle a clearing after a mark: taken, drawn or still open. Returns what changed.
function settleClearing(run, c) {
  const map = run.map;
  const m = marksOf(map, c);
  if (lineIn(m, 'X')) { map.won[c] = 'X'; run.gold += CLEARING_GOLD; return 'X'; }
  if (lineIn(m, 'O')) { map.won[c] = 'O'; return 'O'; }
  if (m.every((x) => x === 'X' || x === 'O')) { map.won[c] = 'draw'; return 'draw'; }
  return null;
}

// A square is done with. Yours if you came through it -- then the boss
// answers. Scorched if you lost the duel there -- then you choose again.
export function settleCell(run, mark) {
  const map = run.map;
  if (map.at === null) return;
  const at = map.at;
  const [c, i] = parseKey(at);
  const cell = map.cells[c][i];
  map.at = null;
  map.lastO = null;
  map.news = null;
  if (mark !== 'X') {
    cell.mark = 'S';
    endIfStuck(run);
    return;
  }
  cell.mark = 'X';
  map.freshX = at;
  const aid = map.armed;
  if (aid) { run.aids[aid]--; map.armed = null; }
  if (settleClearing(run, c) === 'X') map.news = { took: c };
  if ((map.line = lineIn(bigMarks(map), 'X'))) { map.result = 'won'; return; }
  // A new act once enough marks are down: the enemies still waiting grow.
  const act = actFor(xCount(run));
  if (act > run.act) { run.act = act; rollDuels(run); map.news = { ...map.news, act }; }
  if (aid === 'double') map.next = i;
  else bossTurn(run, i);
  endIfStuck(run);
}

// The boss's step, in the clearing it was sent to.
function bossTurn(run, target) {
  const map = run.map;
  const where = clearingsFor(map, 'O', target);
  if (!where.length) return;
  const sees = rand(run) < BOSS_SEES[run.act - 1];
  const value = { treasure: 8, gift: 6, shop: 4, rest: 4, craft: 4, event: 2, elite: 0, miniboss: 0, fight: 1 };
  let best = null, bestScore = -Infinity;
  for (const c of where) {
    map.cells[c].forEach((x, i) => {
      if (x.mark && x.mark !== 'S') return;
      const k = keyOf(c, i);
      const score = judge(map, k, 'O', sees) + (x.mark ? 0 : value[x.kind] ?? 0) + rand(run) * 10;
      if (score > bestScore) { bestScore = score; best = k; }
    });
  }
  const [c, i] = parseKey(best);
  const cell = map.cells[c][i];
  map.next = i;
  cell.mark = 'O';
  map.lastO = best;
  if (settleClearing(run, c) === 'O') {
    map.news = { lost: c };
    if (hurt(run, 1)) return;
  }
  if ((map.line = lineIn(bigMarks(map), 'O'))) map.result = 'lost';
}

// A map nobody can win any more, or where you have nowhere left to step, is
// a draw.
function endIfStuck(run) {
  const map = run.map;
  if (map.result || run.over) return;
  const alive = (who) => LINES.some((l) => l.every((c) => map.won[c] === who || !map.won[c]));
  const anyStep = [0, 1, 2, 3, 4, 5, 6, 7, 8].some((c) => openFor(map, c, 'X'));
  if (!anyStep || (!alive('X') && !alive('O'))) map.result = 'draw';
}

// The map is decided: a win or a draw is the climb's victory, a loss its end.
export function endMap(run) {
  run.over = true;
  run.victory = run.map.result !== 'lost';
  run.screen = run.victory ? 'victory' : 'gameover';
  run.pending = null;
}

// Hearts lost, with the Phoenix's second chance. True if the climb is over.
export function hurt(run, n) {
  run.hearts -= n;
  if (run.hearts > 0) return false;
  if (has(run, 'phoenix') && !run.phoenixUsed) {
    run.phoenixUsed = true;
    run.hearts = 3;
    return false;
  }
  run.hearts = 0;
  run.over = true;
  run.screen = 'gameover';
  run.pending = null;
  return true;
}

// ── Duels ───────────────────────────────────────────────────────────────────

function rollEnemyHand(run, enemy, tier, context) {
  if (tier === 'miniboss') return [];
  const act = ACTS[Math.max(0, (enemy.act || run.act) - 1)];
  let size = enemy.size ?? act.size;
  if (run.heat >= 4 && tier === 'elite') size++;
  if (context.easy) size = Math.min(size, 1);
  const hand = enemy.core.slice(0, size);
  while (hand.length < size) hand.push(pick(run, enemy.pool));
  return hand.map((type) => ({ type }));
}


// Build everything a duel needs except the player's chosen hand.
export function prepareDuel(run, enemyId, context = {}) {
  const enemy = ENEMIES[enemyId];
  const tier = context.tier ?? enemy.tier;
  const handO = rollEnemyHand(run, enemy, tier, context);
  // Heat makes everyone think harder. Later acts' rank and file already think
  // hard by nature; they are eased a little, as an act is several pages of them.
  let heatIters = (tier === 'miniboss' ? 1 : [1, 0.8, 0.6][Math.max(0, run.act - 1)]) * (run.heat >= 1 ? 1.5 : 1);
  const enemyTricks = [...(enemy.tricks ?? [])];
  const usesO = 1;
  const modsO = { ...(enemy.mods ?? {}) };
  let conds = [], rules = [];
  if (tier === 'miniboss') {
    // From the second act on, a mini-boss brings its harder rules.
    rules = [...((run.act >= 2 && enemy.rules2) || enemy.rules || [])];
    if (run.heat >= 4) enemyTricks.push(randomTrick(run));
  } else {
    // A home rule, or sometimes one rolled for the day.
    const act = ACTS[run.act - 1];
    const chance = context.easy ? 0 : act.cond + (tier === 'elite' ? 0.25 : 0);
    if (enemy.cond) conds = [enemy.cond];
    else if (rand(run) < chance) conds = [pick(run, Object.keys(CONDS))];
  }
  // Elites past the first act carry a quirk, so the same face is not the same fight.
  let quirk = null;
  if (tier === 'elite' && run.act >= 2) {
    quirk = pick(run, Object.keys(QUIRKS));
    if (quirk === 'tricky') enemyTricks.push(randomTrick(run));
    if (quirk === 'stocked') handO.push({ type: pick(run, enemy.pool) });
    if (quirk === 'keen') heatIters *= 1.5;
  }
  return {
    enemyId, tier, handO, first: 'O', quirk, conds, rules,
    tricksO: enemyTricks, usesO,
    modsO,
    iters: Math.round(enemy.iters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder * 0.7,
    event: context.event ?? null,
  };
}

export const QUIRKS = {
  tricky: { name: 'Tricky', text: 'It carries an extra trick.' },
  stocked: { name: 'Stocked', text: 'It brings an extra stone.' },
  keen: { name: 'Keen', text: 'It thinks harder.' },
};

// What the player brings: the chosen stones (by uid) as a duel hand.
export function playerHand(run, uids) {
  return uids.map((u) => run.pouch.find((s) => s.uid === u)).filter(Boolean).map((s) => ({ type: s.type }));
}

export function playerMods(run) {
  const mods = {};
  for (const r of run.relics) if (RELICS[r]?.mod) mods[RELICS[r].mod] = true;
  return mods;
}

export function gameConfig(run, duel, uids) {
  return {
    handX: playerHand(run, uids), handO: duel.handO, first: 'O',
    tricksX: [...run.tricks], tricksO: duel.tricksO, usesX: trickUses(run), usesO: duel.usesO,
    modsX: playerMods(run), modsO: duel.modsO, conds: duel.conds ?? [], rules: duel.rules ?? [],
  };
}

// The default loadout: last time's stones if still owned, topped up.
export function defaultHand(run) {
  const size = handSize(run);
  const owned = new Set(run.pouch.map((s) => s.uid));
  const rank = (s) => ({ common: 0, uncommon: 0.2, rare: 0.4 }[STONES[s.type].rarity] ?? 0);
  const chosen = (run.lastHand ?? []).filter((u) => owned.has(u)).slice(0, size);
  const rest = run.pouch.filter((s) => !chosen.includes(s.uid)).sort((a, b) => rank(b) - rank(a));
  while (chosen.length < Math.min(size, run.pouch.length)) chosen.push(rest.shift().uid);
  return chosen;
}

// ── Entering nodes ──────────────────────────────────────────────────────────

export function enterNode(run, key) {
  run.map.at = key;
  const node = cellAt(run.map, key);
  switch (node.kind) {
    case 'fight':
    case 'elite':
    case 'miniboss':
      node.duel ??= prepareDuel(run, pick(run, enemiesOf(run.act, node.kind === 'elite' ? 'elite' : 'normal')));
      run.pending = { kind: 'duel', duel: JSON.parse(JSON.stringify(node.duel)) };
      run.screen = 'predual';
      break;
    case 'shop': run.pending = { kind: 'shop', shop: makeShop(run) }; run.screen = 'shop'; break;
    case 'rest': run.pending = { kind: 'rest' }; run.screen = 'rest'; break;
    case 'craft': run.pending = { kind: 'craft' }; run.screen = 'craft'; break;
    case 'gift': {
      // A special stone, free: one of two.
      const stones = stoneChoices(run, 'normal', null, 2);
      run.pending = { kind: 'reward', gift: true, gold: 0, stones, trick: null, relic: null, relicChoice: null, tier: 'gift', taken: {} };
      run.screen = 'reward';
      break;
    }
    case 'treasure': {
      // Two relics to choose from.
      const first = randomRelic(run);
      let second = null;
      for (let g = 0; g < 10 && first; g++) { second = randomRelic(run); if (second !== first) break; }
      const choices = [first, second !== first ? second : null].filter(Boolean);
      const gold = int(run, 15, 30);
      run.gold += gold;
      run.pending = { kind: 'treasure', choices, relic: null, gold };
      run.screen = 'treasure';
      break;
    }
    case 'event': {
      const seen = run.seenEvents ?? [];
      const pool = EVENTS.filter((e) => !seen.includes(e.id));
      const ev = pick(run, pool.length ? pool : EVENTS);
      run.seenEvents = [...seen, ev.id];
      run.pending = { kind: 'event', id: ev.id };
      run.screen = 'event';
      break;
    }
  }
}

// ── Duel results ────────────────────────────────────────────────────────────

export function duelWon(run) {
  const duel = run.pending.duel;
  run.stats.won++;
  const act = ACTS[run.act - 1];
  let gold = int(run, ...act.gold);
  if (duel.tier === 'elite') gold += 20;
  if (duel.tier === 'miniboss') gold += 35;
  if (duel.event === 'thief') gold += 45;
  if (duel.event === 'nightowl') gold += 30;
  if (has(run, 'lucky-coin')) gold += 8;
  run.gold += gold;
  run.stats.gold += gold;
  const reward = { kind: 'reward', gold, stones: [], trick: null, relic: null, relicChoice: null, tier: duel.tier, taken: {} };
  if (duel.event !== 'thief') reward.stones = stoneChoices(run, duel.tier);
  const trickChance = duel.tier === 'normal' ? 0.3 : duel.tier === 'event' ? 0 : 0.7;
  if (rand(run) < trickChance) reward.trick = randomTrick(run);
  // Instead of a stone, help on the map.
  if (duel.event !== 'thief' && rand(run) < (duel.tier === 'normal' ? 0.4 : 1)) reward.aid = pick(run, AID_TYPES);
  const big = duel.tier === 'elite' || duel.tier === 'miniboss';
  if (big || duel.event === 'hermit' || duel.event === 'nightowl') reward.relic = randomRelic(run);
  if (duel.tier === 'elite') run.stats.elites++;
  if (duel.tier === 'miniboss') run.stats.bosses++;
  if (big && has(run, 'herbs')) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
  if (big && has(run, 'bell') && !reward.trick) reward.trick = randomTrick(run);
  run.pending = reward;
  run.screen = 'reward';
  return reward;
}

export function heartsLost(duel) {
  return duel.tier === 'elite' || duel.tier === 'miniboss' ? 2 : 1;
}


export function duelLost(run) {
  const duel = run.pending.duel;
  run.stats.lost++;
  if (has(run, 'rematch') && !run.rematchUsed[run.act]) {
    run.rematchUsed[run.act] = true;
    run.pending = { kind: 'duel', duel: prepareDuel(run, duel.enemyId, { tier: duel.tier, event: duel.event }) };
    run.screen = 'predual';
    return { kind: 'rematch' };
  }
  if (hurt(run, heartsLost(duel))) return { kind: 'dead' };
  run.pending = null;
  settleCell(run, 'O');
  if (!run.over) run.screen = 'map';
  return { kind: run.over ? 'dead' : 'lost' };
}

// After the reward screen (and after a boss's relic), onward.
export function leaveNode(run) {
  run.pending = null;
  if (run.atBoss) {
    if (run.act === ACTS.length) {
      run.over = true;
      run.victory = true;
      run.screen = 'victory';
      return;
    }
    run.act++;
    run.atBoss = false;
    run.map = makeMap(run);
    run.screen = 'actintro';
    return;
  }
  settleCell(run, 'X');
  if (!run.over) run.screen = 'map';
}

// ── Loot ────────────────────────────────────────────────────────────────────

function rarityTable(run, tier) {
  const t = [
    { common: 64, uncommon: 31, rare: 5 },
    { common: 48, uncommon: 38, rare: 14 },
    { common: 36, uncommon: 42, rare: 22 },
  ][run.act - 1];
  const out = { ...t };
  if (tier !== 'normal') { out.rare += 12; out.common -= 12; }
  if (has(run, 'clover')) { out.rare += 8; out.common -= 8; }
  return out;
}

export function randomStone(run, rarity = null, tier = 'normal') {
  const r = rarity ?? weighted(run, rarityTable(run, tier));
  const pool = REWARD_STONES.filter((t) => STONES[t].rarity === r);
  return { type: pick(run, pool) };
}

export function stoneChoices(run, tier = 'normal', rarity = null, count = 3) {
  const n = count + (has(run, 'clover') ? 1 : 0);
  const out = [];
  for (let guard = 0; out.length < n && guard < 50; guard++) {
    const s = randomStone(run, rarity, tier);
    if (!out.some((o) => o.type === s.type)) out.push(s);
  }
  return out;
}

export function randomTrick(run, rarity = null) {
  const r = rarity ?? weighted(run, { common: 60, uncommon: 28, rare: 12 });
  // Something you do not already carry, if there is anything left.
  const fresh = TRICK_TYPES.filter((t) => !run.tricks.includes(t));
  const pool = fresh.filter((t) => TRICKS[t].rarity === r);
  return pick(run, pool.length ? pool : fresh.length ? fresh : TRICK_TYPES);
}

export function randomRelic(run, rarity = null) {
  let pool = RELIC_TYPES.filter((r) => !has(run, r));
  if (rarity) pool = pool.filter((r) => RELICS[r].rarity === rarity);
  if (!pool.length) pool = RELIC_TYPES.filter((r) => !has(run, r));
  if (!pool.length) return null;
  const table = { common: 55, uncommon: 32, rare: 13 };
  const byR = weighted(run, table);
  const narrowed = pool.filter((r) => RELICS[r].rarity === byR);
  return pick(run, narrowed.length ? narrowed : pool);
}

// Things that happen the moment a relic is picked up.
export function gainRelic(run, id) {
  if (!id || has(run, id)) return;
  run.relics.push(id);
  if (id === 'iron-heart') { run.maxHearts += 2; run.hearts = Math.min(run.maxHearts, run.hearts + 2); }
  if (id === 'piggy') run.gold += 60;
  if (id === 'war-chest') run.gold += 150;
}

export function gainStone(run, s) {
  const st = stone(run, s.type);
  run.pouch.push(st);
  return st;
}

export function gainAid(run, kind) { run.aids = run.aids ?? { free: 0, double: 0 }; run.aids[kind]++; }
export const pouchFull = (run) => run.pouch.length >= pouchCap(run);
export const tricksFull = (run) => run.tricks.length >= trickCap(run);

// ── Shop ────────────────────────────────────────────────────────────────────

export function price(run, base) {
  return Math.round(base * (has(run, 'badge') ? 0.75 : 1) * (run.heat >= 2 ? 1.25 : 1) * (1 + 0.1 * (run.act - 1)));
}

export function makeShop(run) {
  const stones = [];
  const rarities = ['common', 'common', 'uncommon', 'uncommon', 'rare'];
  for (const r of rarities) {
    let s;
    for (let g = 0; g < 20; g++) { s = randomStone(run, r); if (!stones.some((o) => o.type === s.type)) break; }
    stones.push({ ...s, price: price(run, STONE_PRICE[r]), sold: false });
  }
  const tricks = [];
  for (const r of ['common', 'common', 'uncommon', 'rare']) {
    const t = randomTrick(run, r);
    tricks.push({ trick: t, price: price(run, TRICK_PRICE[r]), sold: false });
  }
  const relics = [];
  for (let i = 0; i < 2; i++) {
    const id = randomRelic(run);
    if (id && !relics.some((x) => x.relic === id)) relics.push({ relic: id, price: price(run, RELIC_PRICE[RELICS[id].rarity]), sold: false });
  }
  return {
    stones, tricks, relics,
    healPrice: price(run, 30),
    slotPrice: price(run, 60 + 40 * (run.slots - START.slots)),
    healed: 0, slotted: false,
  };
}

export const canAddSlot = (run) => run.slots < MAX_SLOTS;
