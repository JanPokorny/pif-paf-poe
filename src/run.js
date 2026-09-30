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

export const START = { pouch: ['shift', 'rotate', 'magnet'], tricks: ['overtake'], hearts: 5, gold: 30, slots: 2 };
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
// Each act is a game of tic-tac-toe with its boss on a 5x5 sheet of graph
// paper. At first there is only the boss's opening O in the middle. Every
// mark, yours or the boss's, reveals the squares around it -- and a square is
// decided the moment it is revealed, by how much it matters: a square that
// would extend your line, or break the boss's, turns up as a hard duel; one
// off to the side is a campfire, a shop or treasure. Three Xs in a row open
// the boss's door. Each line of three Os the boss draws makes it stronger. A
// duel lost scorches its square, and the boss never marks shops or campfires.

export const BOSS_LIVES = 2;              // duels a boss must lose
export const SIZE = 5;
export const LINE = 3;                     // marks in a row that count
export const MAX_POWER = 1;
export const PAGE = 10;                   // squares an act allows before the boss will wait no longer
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

function hasLine(map, mark) { return countLines(map, mark) > 0; }
function countLines(map, mark) {
  let lines = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (markAt(map, x, y) !== mark) continue;
      for (const [dx, dy] of DIRS4) {
        if (markAt(map, x - dx, y - dy) === mark) continue;   // count each run once, from its start
        let n = 1;
        while (markAt(map, x + n * dx, y + n * dy) === mark) n++;
        if (n >= LINE) lines++;
      }
    }
  }
  return lines;
}

// Step back out of a duel you have only looked at.
export function retreat(run) {
  run.map.at = null;
  run.pending = null;
  run.screen = 'map';
}

export function makeMap(run) {
  const mid = keyOf(MID, MID);
  const map = {
    v: 3,
    cells: {},         // "x,y" -> {kind, mark, duel?}; only revealed squares exist
    boss: pick(run, ACTS[run.act - 1].bosses),
    at: null,          // the square being visited right now
    lastO: mid,        // the boss's latest mark, for the page to draw in
    open: false,       // the boss's door
    power: 0,          // how much stronger the boss has grown
    oLines: 0,
    visited: 0,
    fights: 0,         // duels revealed so far, for the gentle first few
  };
  map.cells[mid] = { kind: 'boss-mark', mark: 'O' };
  run.map = map;
  reveal(run, MID, MID);
  // The very first page hides a gift: a special stone, free.
  if (run.act === 1) {
    const ring = Object.entries(map.cells).filter(([, c]) => !c.mark && c.kind !== 'elite');
    const [k] = pick(run, ring);
    map.cells[k] = { kind: 'gift', mark: null };
  }
  return map;
}

// Decide what a square is, the moment it comes into view.
function revealCell(run, x, y) {
  const map = run.map;
  const k = keyOf(x, y);
  if (!inside(x, y) || map.cells[k]) return;
  const mine = reach(map, x, y, 'X');     // how much it would do for your lines
  const theirs = reach(map, x, y, 'O');   // how much it would break the boss's
  const stake = Math.max(mine, theirs);
  const table = stake >= 2 ? { elite: 40, fight: 50, event: 10 }
    : stake === 1 ? { elite: 5, fight: 50, event: 18, treasure: 8, rest: 10, shop: 9 }
      : { fight: 36, event: 20, treasure: 14, rest: 15, shop: 15 };
  if (run.act === 1 && map.visited < 2) delete table.elite;
  // One unopened chest on view at a time.
  if (Object.values(map.cells).some((c) => c.kind === 'treasure' && !c.mark)) delete table.treasure;
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

function reveal(run, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) revealCell(run, x + dx, y + dy);
}

export const xCount = (run) => Object.values(run.map?.cells ?? {}).filter((c) => c.mark === 'X').length;

// The page, as a box: {x0, y0, x1, y1}.
export function mapBounds() {
  return { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 };
}

// Where the boss would finish a line with its next mark.
export function bossThreats(map) {
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
export const pageFull = (map) => map.visited >= PAGE || !openSquares(map).length;

// Where you may go next: any open square on view, and the boss once its door
// is open. When the page is full, only the boss.
export function reachable(run) {
  if (pageFull(run.map)) return ['boss'];
  const out = openSquares(run.map);
  if (run.map.open) out.push('boss');
  return out;
}

// The boss's reply: finish a line if it can, block yours if it must,
// otherwise build its own and spoil yours, with a little noise.
function bossMark(run) {
  const map = run.map;
  const free = Object.entries(map.cells).filter(([, c]) => !c.mark && c.kind !== 'shop' && c.kind !== 'rest' && c.kind !== 'gift');
  if (!free.length) return null;
  const value = { treasure: 6, elite: 1, event: 2, fight: 1 };
  let best = null, bestScore = -Infinity;
  for (const [k, c] of free) {
    const [x, y] = coords(k);
    const mine = reach(map, x, y, 'O'), yours = reach(map, x, y, 'X');
    let score = (value[c.kind] ?? 0) + rand(run) * 6;
    if (mine >= LINE - 1) score += 1000;
    if (yours >= LINE - 1) score += 500;
    score += [0, 8, 20][Math.min(2, yours)] + [0, 6, 16][Math.min(2, mine)];
    if (score > bestScore) { bestScore = score; best = k; }
  }
  map.cells[best].mark = 'O';
  return best;
}

// A square is done with: yours if you came through it, scorched if you lost
// the duel there. Then the boss marks, the lines are counted, and the paper
// round the new marks comes into view.
export function settleCell(run, mark) {
  const map = run.map;
  if (map.at === null) return;
  const wasOpen = map.open;
  const at = map.at;
  map.cells[at].mark = mark === 'O' ? 'S' : mark;
  map.freshX = mark === 'X' ? at : null;
  map.at = null;
  map.visited++;
  map.lastO = null;
  map.bonus = 0;
  if (mark === 'X') reveal(run, ...coords(at));
  if (hasLine(map, 'X')) map.open = true;
  // Squares cleared past an open door pay a little extra: a reason to press on.
  if (mark === 'X' && wasOpen) { map.bonus = 10; run.gold += 10; }
  map.lastO = bossMark(run);
  if (map.lastO) reveal(run, ...coords(map.lastO));
  // Every new line of Os makes the boss stronger, up to a point.
  const oLines = countLines(map, 'O');
  if (oLines > (map.oLines ?? 0) && map.power < MAX_POWER) {
    map.power = Math.min(MAX_POWER, map.power + oLines - (map.oLines ?? 0));
    map.news = 'oline';
  }
  map.oLines = oLines;
  // A full page: the boss comes for you, and it has had time to prepare.
  if (pageFull(map) && !map.open) {
    map.open = true;
    map.power = Math.min(MAX_POWER, map.power + 1);
    map.news = 'full';
  }
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
  // Later acts think harder, and heat on top of that.
  let heatIters = [1, 1.4, 1.7][Math.max(0, run.act - 1)] * (run.heat >= 1 ? 1.5 : 1);
  const enemyTricks = [...(enemy.tricks ?? [])];
  const usesO = 1;
  const modsO = { ...(enemy.mods ?? {}) };
  let conds = [], rules = [];
  if (tier === 'boss') {
    rules = [...(((context.bossWins ?? 0) > 0 && enemy.rules2) || enemy.rules || [])];
    const power = run.map?.power ?? 0;
    if (run.heat >= 4) enemyTricks.push(randomTrick(run));
    heatIters *= 1 + 0.5 * power;   // a boss with power thinks harder
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
  run.map.news = null;
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
  run.hearts -= heartsLost(duel);
  if (run.hearts <= 0) {
    if (has(run, 'phoenix') && !run.phoenixUsed) {
      run.phoenixUsed = true;
      run.hearts = 3;
    } else {
      run.hearts = 0;
      run.over = true;
      run.screen = 'gameover';
      run.pending = null;
      return { kind: 'dead' };
    }
  }
  if (duel.tier === 'boss') {
    run.pending = { kind: 'duel', duel: prepareDuel(run, duel.enemyId, { bossRound: duel.bossRound + 1, bossWins: duel.bossWins }) };
    run.screen = 'predual';
    return { kind: 'boss-retry' };
  }
  run.pending = null;
  settleCell(run, 'O');
  run.screen = 'map';
  return { kind: 'lost' };
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
  run.screen = 'map';
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
