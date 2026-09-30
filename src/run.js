// A run: three acts of branching map, each ending in a boss. Pure logic, no DOM,
// so tools/balance.mjs can play whole runs headless.
//
// The run is one JSON-serialisable object. Its random stream is part of it, so
// a saved run resumes exactly.

import { STONES, TRICKS, TRICK_TYPES, CONDS } from './engine.js';
import {
  RELICS, RELIC_TYPES, BOSS_RELICS, ENEMIES, ACTS, EVENTS, enemiesOf, EASY_OPENERS,
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
  { n: 2, text: 'Enemy stones are evolved more often.' },
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
export const evolvable = (run) => run.pouch.filter((s) => STONES[s.type].evolvesTo);
export function evolve(s) { s.type = STONES[s.type].evolvesTo ?? s.type; return s; }

// ── The map ─────────────────────────────────────────────────────────────────
//
// Each act is a game of Ultimate tic-tac-toe with its boss: nine clearings in
// a 3x3, each clearing a 3x3 of squares, all on view. The boss opens in the
// very middle. Where one side steps inside a clearing decides the clearing the
// other must answer in (anywhere, if that one is finished or has nothing left
// for them). Three in a row inside a clearing takes it; three clearings in a
// row win the map.
//
// You mark X wherever you step. A duel lost scorches its square: you may not
// step there again, but the boss may, and you choose again at once -- the
// boss answers only once you have really placed a mark. The boss fights the
// squares it takes too, and may lose: then the square is scorched and its
// turn is gone.
//
// Each clearing the boss takes costs you a heart; its three in a row costs
// one more and a fresh map, as does a map where nobody can win any more.
// Every new map in an act is less friendly than the last.

export const BOSS_LIVES = 2;              // duels a boss must lose
const BOSS_LOSES = { fight: 0.5, elite: 0.7 };   // the chance it loses the duel on a square it takes
const BOSS_SEES = [0.3, 0.4, 0.5, 0.6];   // the chance it blocks your two in a row, by map
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

// A fresh map: the act's boss, and how many maps it has taken so far.
export function makeMap(run, prev = null) {
  const map = {
    v: 5,
    boss: prev?.boss ?? pick(run, ACTS[run.act - 1].bosses),
    page: (prev?.page ?? 0) + 1,
    cells: [],         // cells[c][i] = {kind, mark, duel?}; mark X, O or S (scorched)
    won: Array(9).fill(null),   // per clearing: 'X', 'O', 'draw' or null
    next: 4,           // the clearing you must step in (null: any)
    at: null,          // the square being visited right now
    lastO: keyOf(4, 4),
    result: null,      // 'won' (the door is open), 'lost' or 'draw' (a fresh map follows)
    line: null,        // the clearings of the line that ended the map
    fights: prev?.fights ?? 0,   // duels so far this act, for the gentle first few
  };
  run.map = map;
  // The very first map of the climb hides a gift where you start.
  const gift = run.act === 1 && map.page === 1 ? pick(run, [0, 1, 2, 3, 5, 6, 7, 8]) : -1;
  for (let c = 0; c < 9; c++) {
    map.cells.push([]);
    for (let i = 0; i < 9; i++) {
      if (c === 4 && i === 4) map.cells[c].push({ kind: 'boss-mark', mark: 'O' });
      else if (c === 4 && i === gift) map.cells[c].push({ kind: 'gift', mark: null });
      else map.cells[c].push(fillCell(run, c, i));
    }
  }
  return map;
}

// What a square is. Squares on more lines -- corners and middles, of the
// clearing and of the map -- hide harder things; each new map of an act is
// less friendly than the last.
function fillCell(run, c, i) {
  const map = run.map;
  const p = map.page - 1;
  const hard = (CORNERS.includes(i) || i === 4 ? 3 : 0) + (CORNERS.includes(c) || c === 4 ? 3 : 0);
  const soft = (n) => Math.max(2, n - 3 * p);
  const table = { fight: 40 + 4 * p, elite: 2 + 6 * p + hard, event: 16, treasure: soft(6), rest: soft(12), shop: soft(10) };
  if (run.act === 1 && map.page === 1 && c === 4) delete table.elite;
  const kind = weighted(run, table);
  const cell = { kind, mark: null };
  if (kind === 'fight') {
    const easy = run.act === 1 && map.fights < 4;
    const pool = easy ? EASY_OPENERS : enemiesOf(run.act, 'normal');
    cell.duel = prepareDuel(run, pick(run, pool), { easy });
    map.fights++;
  } else if (kind === 'elite') {
    cell.duel = prepareDuel(run, pick(run, enemiesOf(run.act, 'elite')));
  }
  return cell;
}

export const xCount = (run) => (run.map?.cells ?? []).flat().filter((x) => x.mark === 'X').length;

// Where you may step next: open squares of the clearing you were sent to, or
// the boss once its door is open.
export function reachable(run) {
  const map = run.map;
  if (map.result === 'won') return ['boss'];
  if (map.result) return [];
  const out = [];
  for (const c of clearingsFor(map, 'X', map.next)) map.cells[c].forEach((x, i) => { if (!x.mark) out.push(keyOf(c, i)); });
  return out;
}
export const playableClearings = (map) => (map.result ? [] : clearingsFor(map, 'X', map.next));

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
  map.bossLost = null;
  map.news = null;
  if (mark !== 'X') {
    cell.mark = 'S';
    endIfStuck(run);
    return;
  }
  cell.mark = 'X';
  map.freshX = at;
  if (settleClearing(run, c) === 'X') map.news = { took: c };
  if ((map.line = lineIn(bigMarks(map), 'X'))) { map.result = 'won'; return; }
  bossTurn(run, i);
  endIfStuck(run);
}

// The boss's step, in the clearing it was sent to.
function bossTurn(run, target) {
  const map = run.map;
  const where = clearingsFor(map, 'O', target);
  if (!where.length) return;
  const sees = rand(run) < BOSS_SEES[Math.min(BOSS_SEES.length - 1, map.page - 1)];
  const value = { treasure: 8, gift: 6, shop: 4, rest: 4, event: 2, elite: 0, fight: 1 };
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
  // A square with an enemy on it is a duel for the boss too, and it may lose.
  if (!cell.mark && rand(run) < (BOSS_LOSES[cell.kind] ?? 0)) {
    cell.mark = 'S';
    map.bossLost = best;
    return;
  }
  cell.mark = 'O';
  map.lastO = best;
  if (settleClearing(run, c) === 'O') {
    map.news = { lost: c };
    if (hurt(run, 1)) return;
  }
  if ((map.line = lineIn(bigMarks(map), 'O'))) {
    map.result = 'lost';
    hurt(run, 1);
  }
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

// Start a fresh map after a lost or drawn one.
export function nextPage(run) {
  makeMap(run, run.map);
  run.screen = 'map';
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
  if (tier === 'boss') return [];
  const act = ACTS[Math.max(0, (enemy.act || run.act) - 1)];
  let size = enemy.size ?? act.size;
  if (run.heat >= 4 && tier === 'elite') size++;
  if (context.easy) size = Math.min(size, 1);
  const hand = enemy.core.slice(0, size);
  while (hand.length < size) hand.push(pick(run, enemy.pool));
  let evolveChance = act.evolve + (tier === 'elite' ? 0.15 : 0);
  if (run.heat >= 2) evolveChance += 0.15;
  if (enemy.act === 0) evolveChance = ACTS[run.act - 1].evolve;
  return hand.map((type) => ({ type: STONES[type].evolvesTo && rand(run) < evolveChance ? STONES[type].evolvesTo : type }));
}


// Build everything a duel needs except the player's chosen hand.
export function prepareDuel(run, enemyId, context = {}) {
  const enemy = ENEMIES[enemyId];
  const tier = context.tier ?? enemy.tier;
  const handO = rollEnemyHand(run, enemy, tier, context);
  // Heat makes everyone think harder. Later acts' rank and file already think
  // hard by nature; they are eased a little, as an act is several pages of them.
  let heatIters = (tier === 'boss' ? 1 : [1, 0.8, 0.6][Math.max(0, run.act - 1)]) * (run.heat >= 1 ? 1.5 : 1);
  const enemyTricks = [...(enemy.tricks ?? [])];
  const usesO = 1;
  const modsO = { ...(enemy.mods ?? {}) };
  let conds = [], rules = [];
  if (tier === 'boss') {
    rules = [...(((context.bossWins ?? 0) > 0 && enemy.rules2) || enemy.rules || [])];
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
    if (quirk === 'armored') handO.forEach((h) => { h.type = STONES[h.type].evolvesTo ?? h.type; });
    if (quirk === 'tricky') enemyTricks.push(randomTrick(run));
    if (quirk === 'stocked') handO.push({ type: pick(run, enemy.pool) });
    if (quirk === 'keen') heatIters *= 1.5;
  }
  return {
    enemyId, tier, handO, first: 'O', quirk, conds, rules,
    tricksO: enemyTricks, usesO,
    modsO,
    iters: Math.round(enemy.iters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder * 0.7,
    bossRound: context.bossRound ?? 0, bossWins: context.bossWins ?? 0,
    event: context.event ?? null,
  };
}

export const QUIRKS = {
  armored: { name: 'Seasoned', text: 'Every stone it brings is evolved.' },
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
  const rank = (s) => ({ common: 0, uncommon: 0.2, rare: 0.4 }[STONES[s.type].rarity] ?? 0) + (STONES[s.type].evolvesFrom ? 0.5 : 0);
  const chosen = (run.lastHand ?? []).filter((u) => owned.has(u)).slice(0, size);
  const rest = run.pouch.filter((s) => !chosen.includes(s.uid)).sort((a, b) => rank(b) - rank(a));
  while (chosen.length < Math.min(size, run.pouch.length)) chosen.push(rest.shift().uid);
  return chosen;
}

// ── Entering nodes ──────────────────────────────────────────────────────────

export function enterNode(run, key) {
  if (key === 'boss') {
    run.atBoss = true;
    run.pending = { kind: 'duel', duel: prepareDuel(run, run.map.boss, { bossRound: 0, bossWins: 0 }) };
    run.screen = 'predual';
    return;
  }
  run.map.at = key;
  const node = cellAt(run.map, key);
  switch (node.kind) {
    case 'fight':
    case 'elite':
      node.duel ??= prepareDuel(run, pick(run, enemiesOf(run.act, node.kind === 'elite' ? 'elite' : 'normal')));
      run.pending = { kind: 'duel', duel: JSON.parse(JSON.stringify(node.duel)) };
      run.screen = 'predual';
      break;
    case 'shop': run.pending = { kind: 'shop', shop: makeShop(run) }; run.screen = 'shop'; break;
    case 'rest': run.pending = { kind: 'rest' }; run.screen = 'rest'; break;
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
  if (duel.tier === 'boss' && duel.bossWins + 1 < BOSS_LIVES) {
    // A boss is beaten twice. The next round swaps who opens.
    run.pending = { kind: 'duel', duel: prepareDuel(run, duel.enemyId, { bossRound: duel.bossRound + 1, bossWins: duel.bossWins + 1 }) };
    run.screen = 'predual';
    return { kind: 'boss-continue' };
  }
  const act = ACTS[run.act - 1];
  let gold = int(run, ...act.gold);
  if (duel.tier === 'elite') gold += 20;
  if (duel.tier === 'boss') gold += 60;
  if (duel.event === 'thief') gold += 45;
  if (duel.event === 'nightowl') gold += 30;
  if (has(run, 'lucky-coin')) gold += 8;
  run.gold += gold;
  run.stats.gold += gold;
  const reward = { kind: 'reward', gold, stones: [], trick: null, relic: null, relicChoice: null, tier: duel.tier, taken: {} };
  if (duel.event !== 'thief') reward.stones = stoneChoices(run, duel.tier);
  const trickChance = duel.tier === 'normal' ? 0.3 : duel.tier === 'event' ? 0 : 0.7;
  if (rand(run) < trickChance) reward.trick = randomTrick(run);
  if (duel.tier === 'elite' || duel.event === 'hermit' || duel.event === 'nightowl') reward.relic = randomRelic(run);
  if (duel.tier === 'elite') run.stats.elites++;
  if (duel.tier === 'boss') {
    run.stats.bosses++;
    reward.relicChoice = shuffle(run, BOSS_RELICS.filter((r) => !has(run, r))).slice(0, 3);
    run.hearts = Math.min(run.maxHearts, run.hearts + 3);
  }
  if ((duel.tier === 'elite' || duel.tier === 'boss') && has(run, 'herbs')) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
  if ((duel.tier === 'elite' || duel.tier === 'boss') && has(run, 'bell') && !reward.trick) reward.trick = randomTrick(run);
  run.pending = reward;
  run.screen = 'reward';
  return reward;
}

export function heartsLost(duel) {
  return duel.tier === 'elite' ? 2 : 1;
}

export function duelLost(run) {
  const duel = run.pending.duel;
  run.stats.lost++;
  if (has(run, 'rematch') && !run.rematchUsed[run.act]) {
    run.rematchUsed[run.act] = true;
    run.pending = { kind: 'duel', duel: prepareDuel(run, duel.enemyId, { tier: duel.tier, bossRound: duel.bossRound + (duel.tier === 'boss' ? 1 : 0), bossWins: duel.bossWins, event: duel.event }) };
    run.screen = 'predual';
    return { kind: 'rematch' };
  }
  if (hurt(run, heartsLost(duel))) return { kind: 'dead' };
  if (duel.tier === 'boss') {
    run.pending = { kind: 'duel', duel: prepareDuel(run, duel.enemyId, { bossRound: duel.bossRound + 1, bossWins: duel.bossWins }) };
    run.screen = 'predual';
    return { kind: 'boss-retry' };
  }
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
  if (tier === 'elite' || tier === 'boss') { out.rare += 12; out.common -= 12; }
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
  let pool = RELIC_TYPES.filter((r) => !has(run, r) && !BOSS_RELICS.includes(r));
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

export const pouchFull = (run) => run.pouch.length >= pouchCap(run);
export const tricksFull = (run) => run.tricks.length >= trickCap(run);

// ── Shop ────────────────────────────────────────────────────────────────────

export function price(run, base) {
  return Math.round(base * (has(run, 'badge') ? 0.75 : 1) * (1 + 0.1 * (run.act - 1)));
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
    upgradePrice: price(run, has(run, 'whetstone') ? 35 : 70), healPrice: price(run, 30),
    slotPrice: price(run, 60 + 40 * (run.slots - START.slots)),
    upgraded: false, healed: 0, slotted: false,
  };
}

export const upgradeable = evolvable;
export const canAddSlot = (run) => run.slots < MAX_SLOTS;
