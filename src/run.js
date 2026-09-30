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
// Each act is played against its boss as tic-tac-toe on pages of graph paper,
// 3x3 and fully on view. The boss opens every page with an O in the middle.
// Wherever you go you mark an X; after each step the boss marks an O, on any
// open square -- a shop or a campfire it takes is gone. A duel lost scorches
// its square, for both sides. Three Xs in a row open the boss's door. Three Os in a row cost
// you a heart, and a full page is a draw: either way the page turns, and each
// new page hides less friendly squares than the last.

export const BOSS_LIVES = 2;              // duels a boss must lose
const BOSS_SEES = [0.5, 0.6, 0.7, 0.8];   // the chance it blocks your two in a row, by page
export const SIZE = 3;
export const LINE = 3;
const MID = (SIZE - 1) / 2;
const DIRS4 = [[1, 0], [0, 1], [1, 1], [1, -1]];
export const keyOf = (x, y) => `${x},${y}`;
export const coords = (k) => k.split(',').map(Number);
const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const markAt = (map, x, y) => (inside(x, y) ? map.cells[keyOf(x, y)]?.mark ?? null : '#');

// Every window of LINE squares through (x, y) that fits on the page.
function windowsThrough(x, y) {
  const out = [];
  for (const [dx, dy] of DIRS4) {
    for (let k = 0; k < LINE; k++) {
      const w = [];
      for (let j = 0; j < LINE; j++) w.push([x + (j - k) * dx, y + (j - k) * dy]);
      if (w.every(([wx, wy]) => inside(wx, wy))) out.push(w);
    }
  }
  return out;
}

// How far along a mark's lines are through this square: the most of `mark`
// in any window through it that the other side has not spoiled.
function reach(map, x, y, mark) {
  let best = 0;
  for (const w of windowsThrough(x, y)) {
    let mine = 0, spoiled = false;
    for (const [wx, wy] of w) {
      const m = markAt(map, wx, wy);
      if (m === mark) mine++;
      else if (m) { spoiled = true; break; }
    }
    if (!spoiled) best = Math.max(best, mine);
  }
  return best;
}

// The squares of a finished line of `mark`, or null.
export function lineOf(map, mark) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (markAt(map, x, y) !== mark) continue;
      for (const [dx, dy] of DIRS4) {
        const run = [];
        for (let n = 0; n < LINE && markAt(map, x + n * dx, y + n * dy) === mark; n++) run.push(keyOf(x + n * dx, y + n * dy));
        if (run.length === LINE) return run;
      }
    }
  }
  return null;
}

// Step back out of a duel you have only looked at.
export function retreat(run) {
  run.map.at = null;
  run.pending = null;
  run.screen = 'map';
}

// A fresh page: the act's boss, and how many pages it has taken so far.
export function makeMap(run, prev = null) {
  const mid = keyOf(MID, MID);
  const map = {
    v: 4,
    cells: {},         // "x,y" -> {kind, mark, duel?}
    boss: prev?.boss ?? pick(run, ACTS[run.act - 1].bosses),
    page: (prev?.page ?? 0) + 1,
    at: null,          // the square being visited right now
    lastO: mid,        // the boss's latest mark, for the page to draw in
    result: null,      // 'won' (the door is open), 'lost' or 'draw' (the page turns)
    line: null,        // the squares of the line that ended the page
    fights: prev?.fights ?? 0,   // duels so far this act, for the gentle first few
  };
  map.cells[mid] = { kind: 'boss-mark', mark: 'O' };
  run.map = map;
  const squares = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (keyOf(x, y) !== mid) squares.push(keyOf(x, y));
  // The very first page of the climb hides a gift: a special stone, free.
  const gift = run.act === 1 && map.page === 1 ? pick(run, squares) : null;
  for (const k of shuffle(run, squares)) {
    if (k === gift) map.cells[k] = { kind: 'gift', mark: null };
    else fillCell(run, k);
  }
  return map;
}

// What a square is. Corners sit on three lines and hide harder things; each
// new page of an act is less friendly than the last.
function fillCell(run, k) {
  const map = run.map;
  const [x, y] = coords(k);
  const corner = x !== MID && y !== MID;
  const p = map.page - 1;
  const soft = (n) => Math.max(2, n - 3 * p);
  const table = { fight: 42 + 4 * p, elite: 3 + 8 * p + (corner ? 6 : 0), event: 16, treasure: soft(10), rest: soft(14), shop: soft(14) };
  if (run.act === 1 && map.page === 1) delete table.elite;
  // One unopened chest on a page.
  if (Object.values(map.cells).some((c) => c.kind === 'treasure')) delete table.treasure;
  const kind = weighted(run, table);
  const cell = { kind, mark: null };
  if (kind === 'fight') {
    const easy = run.act === 1 && map.fights < 3;
    const pool = easy ? EASY_OPENERS : enemiesOf(run.act, 'normal');
    cell.duel = prepareDuel(run, pick(run, pool), { easy });
    map.fights++;
  } else if (kind === 'elite') {
    cell.duel = prepareDuel(run, pick(run, enemiesOf(run.act, 'elite')));
  }
  map.cells[k] = cell;
}

export const xCount = (run) => Object.values(run.map?.cells ?? {}).filter((c) => c.mark === 'X').length;

// The page, as a box: {x0, y0, x1, y1}.
export function mapBounds() {
  return { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 };
}

// Where the boss would finish a line with its next mark.
export function bossThreats(map) {
  if (map.result) return [];
  const out = [];
  for (const [k, c] of Object.entries(map.cells)) {
    if (c.mark) continue;
    const [x, y] = coords(k);
    if (reach(map, x, y, 'O') >= LINE - 1) out.push(k);
  }
  return out;
}

export const lineReach = (map, k, mark = 'X') => reach(map, ...coords(k), mark);
const openSquares = (map) => Object.entries(map.cells).filter(([, c]) => !c.mark).map(([k]) => k);

// Where you may go next: any open square, or the boss once its door is open.
export function reachable(run) {
  const map = run.map;
  if (map.result === 'won') return ['boss'];
  if (map.result) return [];
  return openSquares(map);
}

// The boss's reply: finish a line if it can, block yours if it must,
// otherwise build its own and spoil yours, with a little noise -- and it
// likes to take the squares you would want.
function bossMark(run) {
  const map = run.map;
  const free = Object.entries(map.cells).filter(([, c]) => !c.mark);
  if (!free.length) return null;
  const value = { treasure: 6, gift: 5, shop: 3, rest: 3, event: 2, elite: 1, fight: 1 };
  // It does not always see your threat coming — less and less, page by page.
  const sees = rand(run) < BOSS_SEES[Math.min(BOSS_SEES.length - 1, map.page - 1)];
  let best = null, bestScore = -Infinity;
  for (const [k, c] of free) {
    const [x, y] = coords(k);
    const mine = reach(map, x, y, 'O'), yours = reach(map, x, y, 'X');
    let score = (value[c.kind] ?? 0) + rand(run) * 8;
    if (mine >= LINE - 1) score += 1000;
    if (yours >= LINE - 1 && sees) score += 500;
    score += [0, 5, 20][Math.min(2, yours)] + [0, 4, 16][Math.min(2, mine)];
    // A fork: two lines at once, and you can block only one.
    if (threatsAfter(map, k) >= 2) score += 300;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  map.cells[best].mark = 'O';
  return best;
}

// How many open squares would finish a line of Os, were the boss to mark `k`.
function threatsAfter(map, k) {
  const c = map.cells[k];
  c.mark = 'O';
  let n = 0;
  for (const [j, d] of Object.entries(map.cells)) {
    if (d.mark || j === k) continue;
    if (reach(map, ...coords(j), 'O') >= LINE - 1) n++;
  }
  c.mark = null;
  return n;
}

// A square is done with: yours if you came through it, scorched if you lost
// the duel there. Then the boss marks, and the page may be over.
export function settleCell(run, mark) {
  const map = run.map;
  if (map.at === null) return;
  const at = map.at;
  // A lost duel scorches its square: no line runs through it, for either side.
  map.cells[at].mark = mark === 'X' ? 'X' : 'S';
  map.freshX = mark === 'X' ? at : null;
  map.at = null;
  map.lastO = null;
  if ((map.line = lineOf(map, 'X'))) { map.result = 'won'; return; }
  map.lastO = bossMark(run);
  if ((map.line = lineOf(map, 'O'))) {
    map.result = 'lost';
    hurt(run, 1);
    return;
  }
  if (!openSquares(map).length) map.result = 'draw';
}

// Turn the page after a lost or drawn one: the boss opens a fresh one.
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
  const node = run.map.cells[key];
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
