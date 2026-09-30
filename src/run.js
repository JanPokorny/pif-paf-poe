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
    relics: ['lucky-coin'], locked: true,
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
    rematchUsed: {}, phoenixUsed: false, removals: 0,
    stats: { won: 0, lost: 0, elites: 0, bosses: 0, gold: 0, started: Date.now() },
    screen: 'actintro', pending: null, over: false, victory: false,
  };
  run.pouch = k.pouch.map((t) => stone(run, t));
  run.map = makeMap(run);
  return run;
}

export const has = (run, relic) => run.relics.includes(relic);
export const pouchCap = (run) => 8 + (has(run, 'satchel') ? 2 : 0);
export const trickCap = (run) => 3 + (has(run, 'satchel') ? 1 : 0);
export const handSize = (run) => 5 + (has(run, 'deep-pockets') ? 1 : 0);
export const trickUses = (run) => 1 + (has(run, 'gloves') ? 1 : 0);
export const stoneName = (s) => STONES[s.type].name + (s.plus ? '+' : '');

// ── The map ─────────────────────────────────────────────────────────────────
//
// Each act is itself a game of tic-tac-toe, drawn on the page: a 4x4 grid of
// encounters. Every square you clear gets your X; after each of your steps the
// act's boss marks an O somewhere, taking that square off the table. Three Xs
// in a row open the boss's door. The boss's first line of three Os, and being
// boxed in with no line of your own, each make the boss stronger.

export const SIZE = 4;
export const MAP_LINES = (() => {
  const out = [];
  const idx = (r, c) => r * SIZE + c;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
        out.push([idx(r, c), idx(r + dr, c + dc), idx(r2, c2)]);
      }
    }
  }
  return out;
})();
const mapNear = (a, b) => a !== b && Math.abs(((a / SIZE) | 0) - ((b / SIZE) | 0)) <= 1 && Math.abs((a % SIZE) - (b % SIZE)) <= 1;

// Step back out of a duel you have only looked at.
export function retreat(run) {
  run.map.at = null;
  run.pending = null;
  run.screen = 'map';
}

export function makeMap(run) {
  const kinds = shuffle(run, [
    'fight', 'fight', 'fight', 'fight', 'fight', 'fight',
    'elite', 'elite', 'event', 'event', 'event',
    'rest', 'rest', 'shop', 'treasure', 'treasure',
  ]);
  // Duels are settled when the map is drawn, so you can scout them.
  const easy = run.act === 1 ? shuffle(run, EASY_OPENERS) : [];
  const normals = shuffle(run, enemiesOf(run.act, 'normal').filter((e) => !easy.includes(e)));
  const elites = shuffle(run, enemiesOf(run.act, 'elite'));
  let nf = 0, ne = 0;
  const cells = kinds.map((kind) => {
    const cell = { kind, mark: null };
    if (kind === 'fight') {
      const id = nf < easy.length ? easy[nf] : normals[(nf - easy.length) % normals.length];
      nf++;
      cell.duel = prepareDuel(run, id);
    } else if (kind === 'elite') {
      cell.duel = prepareDuel(run, elites[ne++ % elites.length]);
    }
    return cell;
  });
  return {
    cells,
    boss: ACTS[run.act - 1].boss,
    at: null,          // the square being visited right now
    lastO: null,       // the boss's latest mark, for the page to draw in
    open: false,       // the boss's door
    power: 0,          // how much stronger the boss has grown
    oLines: 0,
    visited: 0,
  };
}

export const xCount = (run) => run.map.cells.filter((c) => c.mark === 'X').length;
const lineOf = (cells, mark) => MAP_LINES.filter((l) => l.every((i) => cells[i].mark === mark));

// Where you may go next: any open square beside one of your Xs (anywhere at
// all for your first step), and the boss once its door is open.
export function reachable(run) {
  const { cells } = run.map;
  const mine = cells.map((c, i) => (c.mark === 'X' ? i : -1)).filter((i) => i >= 0);
  const out = [];
  cells.forEach((c, i) => {
    if (c.mark) return;
    if (!mine.length || mine.some((m) => mapNear(m, i))) out.push(String(i));
  });
  if (run.map.open) out.push('boss');
  return out;
}

// The boss's reply: win a line if it can, block yours if it must, otherwise
// spoil what it can, with a little noise so it is not the same every time.
function bossMark(run) {
  const { cells } = run.map;
  const free = cells.map((c, i) => (c.mark ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return null;
  const value = { treasure: 14, rest: 8, shop: 9, elite: 4, event: 5, fight: 2 };
  let best = null, bestScore = -Infinity;
  for (const i of free) {
    let score = value[cells[i].kind] + rand(run) * 14;
    for (const l of MAP_LINES) {
      if (!l.includes(i)) continue;
      const xs = l.filter((j) => cells[j].mark === 'X').length;
      const os = l.filter((j) => cells[j].mark === 'O').length;
      if (os === 2 && xs === 0) score += 1000;
      if (xs === 2 && os === 0) score += 400;
      if (xs === 1 && os === 0) score += 12;
      if (os === 1 && xs === 0) score += 7;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  cells[best].mark = 'O';
  return best;
}

// A square is done with: yours if you came through it, the boss's if you lost
// the duel there. Then the boss marks, and the lines are counted.
export function settleCell(run, mark) {
  const map = run.map;
  if (map.at === null) return;
  map.cells[map.at].mark = mark;
  map.freshX = mark === 'X' ? map.at : null;
  map.at = null;
  map.visited++;
  map.lastO = null;
  if (lineOf(map.cells, 'X').length) map.open = true;
  // A square the boss won from you is its move this time.
  if (mark === 'X' && !map.cells.every((c) => c.mark)) map.lastO = bossMark(run);
  // The boss's first line of three makes it stronger; later ones add nothing.
  const oLines = lineOf(map.cells, 'O').length;
  if (oLines && !map.oLines) { map.power++; map.news = 'oline'; }
  map.oLines = oLines;
  if (!map.open && !reachable(run).length) {
    map.open = true;
    map.power++;
    map.news = 'boxed';
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
  const types = [...new Set([...CLASSIC_SPACES, ...handO.map((h) => h.type).filter((t) => t !== 'pebble')])];
  const disabled = rand(run) < 0.3 ? null : pick(run, types);
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
  return {
    enemyId, tier, handO, first, disabled,
    tricksO: enemyTricks, usesO: 1,
    modsO: { ...(enemy.mods ?? {}) }, field: enemy.field ?? null,
    iters: Math.round(enemy.iters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder,
    bossRound: context.bossRound ?? 0, bossWins: context.bossWins ?? 0,
    event: context.event ?? null,
  };
}

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
  const i = Number(key);
  run.map.at = i;
  run.map.news = null;
  const node = run.map.cells[i];
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
      const relic = randomRelic(run);
      const gold = int(run, 15, 30);
      run.gold += gold;
      if (relic) gainRelic(run, relic);
      run.pending = { kind: 'treasure', relic, gold };
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
  if (duel.tier === 'boss' && duel.bossWins + 1 < 2) {
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
    removePrice: price(run, 50 + 25 * run.removals), upgradePrice: price(run, 70), healPrice: price(run, 30),
    upgraded: false, healed: 0,
  };
}

export function upgradeable(run) { return run.pouch.filter((s) => !s.plus); }
