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
export const ROWS = 7;   // map rows per act, before the boss
export const COLS = 4;

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
    pouch: ['pebble', 'pebble', 'joker', 'firecracker', 'shift', 'rotate'], tricks: ['pluck'], hearts: 4, gold: 80,
    relics: ['lucky-coin'], locked: true,
  },
};

export const HEAT = [
  { n: 0, text: 'The standard climb.' },
  { n: 1, text: 'Enemies think harder.' },
  { n: 2, text: 'Enemy stones are upgraded more often.' },
  { n: 3, text: 'Start with 1 fewer heart.' },
  { n: 4, text: 'Elites and bosses bring an extra stone.' },
  { n: 5, text: 'Enemies never blunder.' },
];

let uidCounter = 1;
const stone = (run, type, plus = false) => ({ type, plus, uid: run.nextUid++ });

export function newRun({ kit = 'apprentice', seed = (Math.random() * 2 ** 31) | 0, heat = 0 } = {}) {
  const k = KITS[kit];
  const run = {
    v: 1, seed, rs: seed, kit, heat,
    act: 1, row: -1, col: null, map: null,
    hearts: k.hearts - (heat >= 3 ? 1 : 0), maxHearts: k.hearts - (heat >= 3 ? 1 : 0),
    gold: k.gold, pouch: [], tricks: [...k.tricks], relics: [...(k.relics ?? [])],
    lastHand: null, nextUid: 1,
    rematchUsed: {}, phoenixUsed: false, removals: 0,
    stats: { won: 0, lost: 0, elites: 0, bosses: 0, gold: 0, started: Date.now() },
    screen: 'map', pending: null, over: false, victory: false,
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
// Four columns, ROWS rows, then the boss. A handful of paths walk upwards one
// column at a time; the nodes are the cells they visit and the edges their
// steps, with diagonal steps that would cross another path refused.

export function makeMap(run) {
  const nodes = {};   // key "r,c" -> {r, c, kind, next: [c...]}
  const key = (r, c) => `${r},${c}`;
  const starts = shuffle(run, [0, 1, 2, 3]);
  const paths = [starts[0], starts[1], starts[2], starts[3], int(run, 0, COLS - 1)];
  const crossing = new Set();   // "r,c1,c2" of diagonal steps taken
  for (const start of paths) {
    let c = start;
    for (let r = 0; r < ROWS; r++) {
      nodes[key(r, c)] ??= { r, c, kind: null, next: [] };
      if (r === ROWS - 1) break;
      let options = [c - 1, c, c + 1].filter((x) => x >= 0 && x < COLS);
      options = options.filter((x) => x === c || !crossing.has(`${r},${x},${c}`));
      const nc = pick(run, options);
      if (nc !== c) crossing.add(`${r},${c},${nc}`);
      const n = nodes[key(r, c)];
      if (!n.next.includes(nc)) n.next.push(nc);
      c = nc;
    }
  }
  // Kinds, row by row.
  for (const n of Object.values(nodes)) {
    if (n.r === 0) n.kind = 'fight';
    else if (n.r === 3) n.kind = 'treasure';
    else if (n.r === ROWS - 1) n.kind = 'rest';
    else {
      const table = { fight: 46, event: 22, shop: 11, rest: 7, elite: n.r >= 2 ? 16 : 0 };
      if (n.r === ROWS - 2) table.rest = 0;
      n.kind = weighted(run, table);
    }
  }
  // Somewhere to spend money, every act.
  const all = Object.values(nodes);
  if (!all.some((n) => n.kind === 'shop')) {
    const cand = all.filter((n) => n.r >= 2 && n.r <= 5 && n.kind !== 'elite');
    if (cand.length) pick(run, cand).kind = 'shop';
  }
  if (!all.some((n) => n.kind === 'elite')) {
    const cand = all.filter((n) => n.r >= 3 && n.r <= 5 && n.kind === 'fight');
    if (cand.length) pick(run, cand).kind = 'elite';
  }
  for (const n of all) n.next.sort((a, b) => a - b);
  return { nodes, boss: ACTS[run.act - 1].boss, visited: [] };
}

export function reachable(run) {
  const { nodes } = run.map;
  if (run.row === -1) return Object.values(nodes).filter((n) => n.r === 0).map((n) => `${n.r},${n.c}`);
  if (run.row === ROWS - 1) return ['boss'];
  const here = nodes[`${run.row},${run.col}`];
  return here.next.map((c) => `${run.row + 1},${c}`);
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
  else if (tier === 'elite') first = 'O';
  else if (has(run, 'opening-book')) first = 'X';
  else first = rand(run) < 0.5 ? 'X' : 'O';
  const types = [...new Set([...CLASSIC_SPACES, ...handO.map((h) => h.type).filter((t) => t !== 'pebble')])];
  const disabled = rand(run) < 0.3 ? null : pick(run, types);
  const heatIters = run.heat >= 1 ? 1.5 : 1;
  const enemyTricks = [...(enemy.tricks ?? [])];
  return {
    enemyId, tier, handO, first, disabled,
    tricksO: enemyTricks, usesO: tier === 'boss' ? 2 : 1,
    modsO: { ...(enemy.mods ?? {}) }, field: enemy.field ?? null,
    iters: Math.round(enemy.iters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder,
    bossRound: context.bossRound ?? 0, bossWins: context.bossWins ?? 0,
    event: context.event ?? null,
  };
}

// What the player brings: the chosen stones (by uid) as a duel hand.
export function playerHand(run, uids) {
  return uids.map((u) => run.pouch.find((s) => s.uid === u)).filter(Boolean)
    .map((s) => ({ type: s.type, plus: s.plus || (s.type === 'pebble' && has(run, 'polisher')) }));
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
export function defaultHand(run) {
  const size = handSize(run);
  const owned = new Set(run.pouch.map((s) => s.uid));
  const chosen = (run.lastHand ?? []).filter((u) => owned.has(u)).slice(0, size);
  const rank = (s) => (s.type === 'pebble' ? 0 : 1) + (s.plus ? 0.5 : 0) + ({ common: 0, uncommon: 0.2, rare: 0.4 }[STONES[s.type].rarity] ?? 0);
  const rest = run.pouch.filter((s) => !chosen.includes(s.uid)).sort((a, b) => rank(b) - rank(a));
  while (chosen.length < Math.min(size, run.pouch.length)) chosen.push(rest.shift().uid);
  return chosen;
}

// ── Entering nodes ──────────────────────────────────────────────────────────

export function enterNode(run, key) {
  if (key === 'boss') {
    run.row = ROWS;
    run.pending = { kind: 'duel', duel: prepareDuel(run, run.map.boss, { bossRound: 0, bossWins: 0 }) };
    run.screen = 'predual';
    return;
  }
  const [r, c] = key.split(',').map(Number);
  run.row = r;
  run.col = c;
  run.map.visited.push(key);
  const node = run.map.nodes[key];
  switch (node.kind) {
    case 'fight': {
      const fought = run.map.visited.length;
      let pool = enemiesOf(run.act, 'normal');
      if (run.act === 1 && fought <= 2) pool = EASY_OPENERS;
      const recent = run.recent ?? [];
      const fresh = pool.filter((e) => !recent.includes(e));
      const id = pick(run, fresh.length ? fresh : pool);
      run.recent = [...recent.slice(-3), id];
      run.pending = { kind: 'duel', duel: prepareDuel(run, id) };
      run.screen = 'predual';
      break;
    }
    case 'elite': {
      const id = pick(run, enemiesOf(run.act, 'elite'));
      run.pending = { kind: 'duel', duel: prepareDuel(run, id) };
      run.screen = 'predual';
      break;
    }
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
  if (has(run, 'lucky-coin')) gold += 8;
  run.gold += gold;
  run.stats.gold += gold;
  const reward = { kind: 'reward', gold, stones: [], trick: null, relic: null, relicChoice: null, tier: duel.tier, taken: {} };
  if (duel.event !== 'thief') reward.stones = stoneChoices(run, duel.tier);
  const trickChance = duel.tier === 'normal' ? 0.3 : duel.tier === 'event' ? 0 : 0.7;
  if (rand(run) < trickChance) reward.trick = randomTrick(run);
  if (duel.tier === 'elite' || duel.event === 'hermit') reward.relic = randomRelic(run);
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
  return duel.tier === 'normal' || duel.tier === 'event' ? 1 : 2;
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
  run.screen = 'map';
  return { kind: 'lost' };
}

// After the reward screen (and after a boss's relic), onward.
export function leaveNode(run) {
  run.pending = null;
  if (run.row === ROWS) {
    if (run.act === ACTS.length) {
      run.over = true;
      run.victory = true;
      run.screen = 'victory';
      return;
    }
    run.act++;
    run.row = -1;
    run.col = null;
    run.map = makeMap(run);
    run.screen = 'actintro';
    return;
  }
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
  const pool = TRICK_TYPES.filter((t) => TRICKS[t].rarity === r);
  return pick(run, pool.length ? pool : TRICK_TYPES);
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
