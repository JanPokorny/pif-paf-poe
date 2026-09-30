// A run: three acts of branching map, each ending in a boss. Pure logic, no DOM,
// so tools/balance.mjs can play whole runs headless.
//
// The run is one JSON-serialisable object. Its random stream is part of it, so
// a saved run resumes exactly.

import { STONES, STONE_TYPES, TRICKS, TRICK_TYPES } from './engine.js';
import {
  RELICS, RELIC_TYPES, BOSS_RELICS, ENEMIES, ACTS, EVENTS, enemiesOf, EASY_OPENERS,
  STONE_PRICE, TRICK_PRICE, RELIC_PRICE, REWARD_STONES,
} from './content.js';

export const CLASSIC_SPACES = ['shift', '2048', 'rotate', 'mountain', 'magnet', 'stinky'];

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

// ── Starting kits and heat ──────────────────────────────────────────────────

export const KITS = {
  apprentice: {
    name: 'The Apprentice', emoji: '🧒', text: 'A bit of everything. The way the game was taught.',
    pouch: ['pebble', 'pebble', 'shift', 'rotate', 'magnet', 'mountain'], tricks: ['overtake'], hearts: 6, gold: 40,
  },
  tinkerer: {
    name: 'The Tinkerer', emoji: '🧑‍🔧', text: 'Moves stones around. Lots of them.',
    pouch: ['pebble', 'shift', 'shift', 'rotate', 'bumper', 'lasso'], tricks: ['nudge', 'relocate'], hearts: 5, gold: 30,
  },
  warden: {
    name: 'The Warden', emoji: '💂', text: 'Tells the enemy where they may stand.',
    pouch: ['pebble', 'pebble', 'magnet', 'stinky', 'mountain', 'beacon'], tricks: ['muffle'], hearts: 6, gold: 30,
  },
  gambler: {
    name: 'The Gambler', emoji: '🎰', text: 'Rare stones, few hearts. Unlocked by winning once.',
    pouch: ['pebble', 'pebble', 'guardian', 'firecracker', 'shift', 'rotate'], tricks: ['pluck'], hearts: 4, gold: 80,
    relics: ['lucky-coin'], unlock: 'win',
  },
  trickster: {
    name: 'The Trickster', emoji: '🃏', text: 'Plain stones, a sleeve full of tricks. Unlocked by reaching the Quarry.',
    pouch: ['pebble', 'pebble', 'pebble', 'shift', 'hush', 'rotate'], tricks: ['mirror', 'relocate', 'muffle'], hearts: 5, gold: 30,
    relics: ['gloves'], unlock: 'quarry',
  },
  mason: {
    name: 'The Mason', emoji: '🧱', text: 'Walls and glue, and a thick skin. Unlocked by winning at heat 1 or more.',
    pouch: ['pebble', 'mountain', 'mountain', 'glue', 'magnet', 'rotate'], tricks: ['anchor'], hearts: 7, gold: 20,
    unlock: 'heat',
  },
};

export const HEAT = [
  { n: 0, text: 'The standard climb.' },
  { n: 1, text: 'Enemies think harder.' },
  { n: 2, text: 'Enemy stones are upgraded more often.' },
  { n: 3, text: 'Start with 1 fewer heart.' },
  { n: 4, text: 'Elites and bosses bring an extra stone.' },
  { n: 5, text: 'Enemies never blunder, and elites always open.' },
];

let uidCounter = 1;
const stone = (run, type, plus = false) => ({ type, plus, uid: run.nextUid++ });

export function newRun({ kit = 'apprentice', seed = (Math.random() * 2 ** 31) | 0, heat = 0 } = {}) {
  const k = KITS[kit];
  const run = {
    v: 1, seed, rs: seed, kit, heat,
    act: 1, atBoss: false, map: null,
    hearts: k.hearts - (heat >= 3 ? 1 : 0), maxHearts: k.hearts - (heat >= 3 ? 1 : 0),
    gold: k.gold, pouch: [], tricks: [...k.tricks], relics: [...(k.relics ?? [])],
    lastHand: null, nextUid: 1,
    rematchUsed: {}, phoenixUsed: false,
    stats: { won: 0, lost: 0, elites: 0, bosses: 0, gold: 0, started: Date.now() },
    screen: 'actintro', pending: null, over: false, victory: false,
  };
  run.pouch = k.pouch.map((t) => stone(run, t));
  run.map = makeMap(run);
  return run;
}

export const has = (run, relic) => run.relics.includes(relic);
export const pouchCap = (run) => 7 + (has(run, 'satchel') ? 2 : 0);
export const trickCap = (run) => 3 + (has(run, 'satchel') ? 1 : 0);
export const handSize = (run) => 5 + (has(run, 'deep-pockets') ? 1 : 0);
export const trickUses = (run) => 1 + (has(run, 'gloves') ? 1 : 0);
export const stoneName = (s) => STONES[s.type].name + (s.plus ? '+' : '');

// ── The map ─────────────────────────────────────────────────────────────────
//
// Each act is a game of tic-tac-toe with its boss on an endless sheet of
// graph paper. At first there is only the boss's opening O. Every mark, yours
// or the boss's, reveals the squares around it -- and a square is decided the
// moment it is revealed, by how much it matters: a square that would extend
// your line, or break the boss's, turns up as a hard duel; one off to the side
// is a campfire, a shop or treasure. Four Xs in a row open the boss's door.
// Each line of four Os the boss draws makes it stronger. A duel lost scorches
// its square, and the boss never marks shops or campfires.

export const BOSS_LIVES = 2;              // duels a boss must lose
export const LINE = 4;                     // marks in a row that count
export const MAX_POWER = 3;
export const PAGE = 14;                   // squares an act allows before the boss will wait no longer
const DIRS4 = [[1, 0], [0, 1], [1, 1], [1, -1]];
export const keyOf = (x, y) => `${x},${y}`;
export const coords = (k) => k.split(',').map(Number);
const markAt = (map, x, y) => map.cells[keyOf(x, y)]?.mark ?? null;

// Every window of LINE squares through (x, y): lists of [x, y].
function windowsThrough(x, y) {
  const out = [];
  for (const [dx, dy] of DIRS4) {
    for (let k = 0; k < LINE; k++) {
      const w = [];
      for (let j = 0; j < LINE; j++) w.push([x + (j - k) * dx, y + (j - k) * dy]);
      out.push(w);
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

function hasLine(map, mark) {
  for (const [k, c] of Object.entries(map.cells)) {
    if (c.mark !== mark) continue;
    const [x, y] = coords(k);
    for (const [dx, dy] of DIRS4) {
      let n = 1;
      while (n < LINE && markAt(map, x + n * dx, y + n * dy) === mark) n++;
      if (n >= LINE) return true;
    }
  }
  return false;
}
function countLines(map, mark) {
  let lines = 0;
  for (const [k, c] of Object.entries(map.cells)) {
    if (c.mark !== mark) continue;
    const [x, y] = coords(k);
    for (const [dx, dy] of DIRS4) {
      if (markAt(map, x - dx, y - dy) === mark) continue;   // count each run once, from its start
      let n = 1;
      while (markAt(map, x + n * dx, y + n * dy) === mark) n++;
      if (n >= LINE) lines++;
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
  const map = {
    v: 2,
    cells: {},         // "x,y" -> {kind, mark, duel?}; only revealed squares exist
    boss: pick(run, ACTS[run.act - 1].bosses),
    at: null,          // the square being visited right now
    lastO: '0,0',      // the boss's latest mark, for the page to draw in
    open: false,       // the boss's door
    power: 0,          // how much stronger the boss has grown
    oLines: 0,
    visited: 0,
    fights: 0,         // duels revealed so far, for the gentle first few
  };
  map.cells['0,0'] = { kind: 'boss-mark', mark: 'O' };
  run.map = map;
  reveal(run, 0, 0);
  return map;
}

// Decide what a square is, the moment it comes into view.
function revealCell(run, x, y) {
  const map = run.map;
  const k = keyOf(x, y);
  if (map.cells[k]) return;
  const mine = reach(map, x, y, 'X');     // how much it would do for your lines
  const theirs = reach(map, x, y, 'O');   // how much it would break the boss's
  const stake = Math.max(mine, theirs);
  const table = stake >= 3 ? { elite: 55, fight: 40, event: 5 }
    : stake === 2 ? { elite: 28, fight: 52, event: 12, treasure: 3, rest: 3, shop: 2 }
      : stake === 1 ? { elite: 6, fight: 50, event: 20, treasure: 8, rest: 8, shop: 8 }
        : { fight: 30, event: 22, treasure: 16, rest: 16, shop: 16 };
  // The first ring round the boss's opening mark: gentle, and somewhere to shop.
  if (map.visited === 0 && !Object.values(map.cells).some((c) => c.kind === 'shop') && Object.keys(map.cells).length >= 7) {
    table.shop = 60;
  }
  const kind = weighted(run, table);
  const cell = { kind, mark: null };
  if (kind === 'fight') {
    const easy = run.act === 1 && map.fights < 3;
    const pool = easy ? EASY_OPENERS : enemiesOf(run.act, 'normal');
    cell.duel = prepareDuel(run, pick(run, pool));
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

// The squares on view, as a box: {x0, y0, x1, y1}.
export function mapBounds(map) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of Object.keys(map.cells)) {
    const [x, y] = coords(k);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
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
export const pageFull = (map) => map.visited >= PAGE;

// Where you may go next: any open square on view, and the boss once its door
// is open. When the page is full, only the boss.
export function reachable(run) {
  if (pageFull(run.map)) return ['boss'];
  const out = Object.entries(run.map.cells).filter(([, c]) => !c.mark).map(([k]) => k);
  if (run.map.open) out.push('boss');
  return out;
}

// The boss's reply: finish a line if it can, block yours if it must,
// otherwise build its own and spoil yours, with a little noise.
function bossMark(run) {
  const map = run.map;
  const free = Object.entries(map.cells).filter(([, c]) => !c.mark && c.kind !== 'shop' && c.kind !== 'rest');
  if (!free.length) return null;
  const value = { treasure: 6, elite: 1, event: 2, fight: 1 };
  let best = null, bestScore = -Infinity;
  for (const [k, c] of free) {
    const [x, y] = coords(k);
    const mine = reach(map, x, y, 'O'), yours = reach(map, x, y, 'X');
    let score = (value[c.kind] ?? 0) + rand(run) * 6;
    if (mine >= LINE - 1) score += 1000;
    if (yours >= LINE - 1) score += 500;
    score += [0, 6, 20, 60][Math.min(3, yours)] + [0, 5, 16, 40][Math.min(3, mine)];
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
  // Every new line of four Os makes the boss stronger, up to a point.
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

function rollEnemyHand(run, enemy, tier) {
  const act = ACTS[Math.max(0, (enemy.act || run.act) - 1)];
  let size = enemy.size ?? 5;
  if (run.heat >= 4 && (tier === 'elite' || tier === 'boss')) size++;
  const hand = enemy.core.slice(0, size);
  while (hand.length < size) hand.push(pick(run, enemy.pool));
  let plus = tier === 'boss' ? act.bossPlus : act.plus + (tier === 'elite' ? 0.15 : 0);
  if (run.heat >= 2) plus += 0.15;
  if (enemy.act === 0) plus = ACTS[run.act - 1].plus;
  return hand.map((type) => ({ type, plus: type !== 'pebble' && rand(run) < plus }));
}

// Build everything a duel needs except the player's chosen hand.
export function prepareDuel(run, enemyId, context = {}) {
  const enemy = ENEMIES[enemyId];
  const tier = context.tier ?? enemy.tier;
  const handO = rollEnemyHand(run, enemy, tier);
  let first;
  if (tier === 'boss') first = (context.bossRound ?? 0) % 2 === 0 ? 'O' : 'X';
  else if (tier === 'elite' && run.heat >= 5) first = 'O';
  else if (has(run, 'opening-book') && tier !== 'elite') first = 'X';
  else first = rand(run) < 0.5 ? 'X' : 'O';
  // The space switches off a classic stone or one of yours -- never more than
  // one of the enemy's own stones, so it does not gut their whole plan.
  const theirs = (t) => handO.filter((h) => h.type === t).length;
  const types = [...new Set([...CLASSIC_SPACES, ...run.pouch.map((h) => h.type)])].filter((t) => t !== 'pebble' && theirs(t) <= 1);
  const disabled = rand(run) < 0.3 || !types.length ? null : pick(run, types);
  let heatIters = run.heat >= 1 ? 1.5 : 1;
  // A boss the map has fed grows: upgraded stones first, then extra ones.
  if (tier === 'boss' && run.map?.power) {
    for (let k = 0; k < run.map.power; k++) {
      const plain = handO.find((h) => !h.plus && h.type !== 'pebble');
      if (plain) plain.plus = true;
      else if (handO.length < 7) handO.push({ type: pick(run, enemy.pool), plus: true });
    }
    heatIters *= 1 + 0.15 * run.map.power;
  }
  const enemyTricks = [...(enemy.tricks ?? [])];
  const modsO = { ...(enemy.mods ?? {}) };
  // Elites past the first act carry a quirk, so the same face is not the same fight.
  let quirk = null;
  if (tier === 'elite' && run.act >= 2) {
    quirk = pick(run, Object.keys(QUIRKS).filter((q) => q !== 'swift' || run.act >= 3));
    if (quirk === 'swift') first = 'O';
    if (quirk === 'armored') handO.forEach((h) => { if (h.type !== 'pebble') h.plus = true; });
    if (quirk === 'tricky') enemyTricks.push(randomTrick(run));
    if (quirk === 'rooted') modsO.homeTurf = true;
    if (quirk === 'patient') modsO.hourglass = true;
  }
  return {
    enemyId, tier, handO, first, disabled, quirk,
    tricksO: enemyTricks, usesO: 1,
    modsO, field: (tier === 'boss' && (context.bossWins ?? 0) > 0 && enemy.field2) || enemy.field || null,
    iters: Math.round(enemy.iters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder,
    bossRound: context.bossRound ?? 0, bossWins: context.bossWins ?? 0,
    event: context.event ?? null,
  };
}

export const QUIRKS = {
  swift: { name: 'Swift', text: 'It always opens.' },
  armored: { name: 'Armoured', text: 'Every stone it brings is upgraded.' },
  tricky: { name: 'Tricky', text: 'It carries an extra trick.' },
  rooted: { name: 'Rooted', text: 'The space never switches its stones off.' },
  patient: { name: 'Patient', text: 'A full board goes to it, whoever opened.' },
};

// What the player brings: the chosen stones (by uid) as a duel hand.
export function playerHand(run, uids) {
  return uids.map((u) => run.pouch.find((s) => s.uid === u)).filter(Boolean)
    .map((s) => ({ type: s.type, plus: s.plus || (s.type === 'pebble' && has(run, 'polisher')) || autoUpgraded(run, s.type) }));
}

export function autoUpgraded(run, type) {
  return run.relics.some((r) => RELICS[r]?.upgrades?.includes(type));
}

export function playerMods(run) {
  const mods = {};
  for (const r of run.relics) if (RELICS[r]?.mod) mods[RELICS[r].mod] = true;
  return mods;
}

export function gameConfig(run, duel, uids) {
  return {
    handX: playerHand(run, uids), handO: duel.handO, first: duel.first, disabled: duel.disabled,
    tricksX: [...run.tricks], tricksO: duel.tricksO, usesX: trickUses(run), usesO: duel.usesO,
    modsX: playerMods(run), modsO: duel.modsO, field: duel.field,
  };
}

// The default loadout: last time's stones if still owned, topped up.
export function defaultHand(run, disabled = null) {
  const size = handSize(run);
  const owned = new Set(run.pouch.map((s) => s.uid));
  const works = (s) => s.type !== disabled || has(run, 'home-turf');
  const rank = (s) => (works(s) ? 0 : -5) + (s.type === 'pebble' ? 0 : 1) + (s.plus ? 0.5 : 0)
    + ({ common: 0, uncommon: 0.2, rare: 0.4 }[STONES[s.type].rarity] ?? 0);
  // Last time's stones, if still owned -- but not ones this space switches off
  // while something else in the pouch would work.
  const spare = run.pouch.filter((s) => works(s) && !(run.lastHand ?? []).includes(s.uid)).length;
  let dropped = 0;
  const chosen = (run.lastHand ?? []).filter((u) => {
    if (!owned.has(u)) return false;
    const s = run.pouch.find((p) => p.uid === u);
    if (!works(s) && dropped < spare) { dropped++; return false; }
    return true;
  }).slice(0, size);
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
  const type = pick(run, pool);
  const upChance = [0, 0.1, 0.22][run.act - 1] + (tier === 'elite' ? 0.1 : 0);
  return { type, plus: has(run, 'hammer') || rand(run) < upChance };
}

export function stoneChoices(run, tier = 'normal', rarity = null) {
  const n = 3 + (has(run, 'clover') ? 1 : 0);
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
  // A relic that upgrades stones you do not carry is no find at all.
  const useful = pool.filter((r) => !RELICS[r].upgrades || RELICS[r].upgrades.some((ty) => run.pouch.some((p) => p.type === ty)));
  if (useful.length) pool = useful;
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
}

export function gainStone(run, s) {
  const plus = s.plus || has(run, 'hammer');
  const st = stone(run, s.type, plus);
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
    stones.push({ ...s, price: price(run, STONE_PRICE[r] + (s.plus ? 25 : 0)), sold: false });
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
    upgradePrice: price(run, 70), healPrice: price(run, 30),
    upgraded: false, healed: 0,
  };
}

export function upgradeable(run) { return run.pouch.filter((s) => !s.plus); }
