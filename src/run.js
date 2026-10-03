// A run: three acts of branching map, each ending in a boss. Pure logic, no DOM,
// so tools/balance.mjs can play whole runs headless.
//
// The run is one JSON-serialisable object. Its random stream is part of it, so
// a saved run resumes exactly.

import { STONES, CONDS } from './engine.js';
import {
  RELICS, RELIC_TYPES, BOSS_RELICS, ENEMIES, ACTS, EVENTS, enemiesOf, EASY_OPENERS,
  STONE_PRICE, ONCE_PRICE, RELIC_PRICE, REWARD_STONES, ONCE_STONES,
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
  { n: 4, text: 'Elites bring an extra stone.' },
  { n: 5, text: 'Enemies never blunder.' },
];

// Energy decides what you bring into a duel: each special stone costs some
// (a common 1, an uncommon 2, a rare 3) and together they may cost no more than
// you have. Pebbles are free and never sit in the pouch: they fill your hand up
// to four stones at the start of a duel, the enemy's up to five (it opens, so a
// full board takes five of its stones).
export const HAND = 4;
const ENEMY_STONES = 5;
export const START = { pouch: [], hearts: 6, gold: 30, energy: 1 };
export const COST = { starter: 0, common: 1, uncommon: 2, rare: 3 };
export const costOf = (type) => COST[STONES[type]?.rarity] ?? 0;
export const energyOf = (run) => (run.energy ?? START.energy) + (has(run, 'deep-pockets') ? 1 : 0);
export const handCost = (run, uids) => uids.reduce((n, u) => n + costOf(run.pouch.find((x) => x.uid === u)?.type), 0);

const stone = (run, type) => ({ type, uid: run.nextUid++ });

export function newRun({ seed = (Math.random() * 2 ** 31) | 0, heat = 0 } = {}) {
  const hearts = START.hearts - (heat >= 3 ? 1 : 0);
  const run = {
    v: 4, seed, rs: seed, heat,
    act: 1, atBoss: false, map: null,
    hearts, maxHearts: hearts,
    gold: START.gold, pouch: [], relics: [],
    energy: START.energy,
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
export const stoneName = (s) => STONES[s.type].name;
export const isOnce = (s) => !!STONES[s.type]?.once;

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
// The stones a workshop will take: all of them.
export const craftable = (run) => run.pouch;

// ── The map ─────────────────────────────────────────────────────────────────
//
// Each act is a game of tic-tac-toe with its boss on an endless sheet of graph
// paper. At first there is only the boss's opening O. Every mark reveals the
// squares around it, and only those can be stepped on -- and a square is
// decided the moment it comes into view, by how much it matters: one that
// would extend your line, or break the boss's, turns up as a hard duel; one
// off to the side as a campfire, a shop or treasure.
//
// Rocks are squares nobody can mark, and they cut every line through them.
// They turn up most where your lines are about to close, so that three in a
// row has to be worked for, not just walked into.
//
// Three Xs in a row open the boss's door. Each line of three Os makes the
// boss stronger, and so does filling the page. A duel lost scorches its
// square -- only the boss may take it now -- and you choose again at once:
// the boss answers only a real X.

export const BOSS_LIVES = 2;              // duels a boss must lose
export const LINE = 3;                     // marks in a row that count
export const MAX_POWER = 2;
// `sees`: the chance the boss blocks your two in a row; `lineDamage`: hearts
// a line of the boss's Os costs you.
export const MAPCFG = { sees: 0.75, lineDamage: 1 };
// Rocks: a lattice -- (x + 3y) mod 7 in two neighbouring classes -- that cuts
// every row, column and diagonal into runs between two and five squares long,
// so an open two is rarely a double threat and a line has to be set up; plus a
// chance by how far your lines through a square already are, more where a
// square would sit on several of them. (tools/maprocks.mjs measures it.)
export const ROCKS = { m: 7, a: 1, b: 3, set: [0, 1], byReach: [0.04, 0.08, 0.15], perLine: 0.05 };
const onLattice = (map, x, y) => {
  const { m, a, b } = ROCKS;
  if (!m) return false;
  const r = ((((a * x + b * y) % m) + m) % m - (map.rockShift ?? 0) + m) % m;
  return ROCKS.set.includes(r);
};
// How far a square is from the boss's first mark: the rings of the page.
export const ringOf = (x, y) => Math.max(Math.abs(x), Math.abs(y));
// The page by distance. Near the start obstacles are laid out against forks
// (layStart); beyond, they thin out ring by ring, while empty squares grow
// until, from MAPGEN.end on, the page is nothing but empty ground: there is a
// finite number of everything. Elites and the stronger enemies lie further out.
export const MAPGEN = {
  rock: 0.34, rockFall: 0.05, rockMin: 0.06,   // the obstacle chance past the start, ring by ring
  forkRock: 0.12,                              // and more where a square would sit on two live lines of yours
  empty: 0.13, emptyFrom: 2, end: 10,          // empty squares from ring 2, everything empty from ring 10
  spread: { fight: 0.5, other: 0.15, good: 0.5 }, // each of the same kind within 2 multiplies the chance
  sameEnemy: 3,                                // the same enemy never within this many squares
  strength: 6,                                 // how sharply the stronger enemies gather further out
};
const emptyChance = (d) => (d >= MAPGEN.end ? 1 : Math.max(0, Math.min(1, (d - MAPGEN.emptyFrom + 1) * MAPGEN.empty)));
function isRock(run, x, y, mine, first = false) {
  const map = run.map;
  const d = ringOf(x, y);
  // Near the start the rocks are laid out in advance (see layStart).
  // Near the start the obstacles are laid out in advance (see layStart); the
  // outer ring of that layout only adds the ones it needs to the usual chance.
  if (map.start && d <= OPENING.near) return map.start.includes(keyOf(x, y));
  if (map.start && d <= OPENING.lay && map.start.includes(keyOf(x, y))) return true;
  if (!map.start && onLattice(map, x, y)) return true;   // an old save's map
  if (first || d >= MAPGEN.end) return false;
  // A square on two or more of your live lines is where a fork would be.
  const lines = liveLines(run.map, x, y, 'X');
  const p = Math.max(MAPGEN.rockMin, MAPGEN.rock - MAPGEN.rockFall * (d - OPENING.lay - 1)) + MAPGEN.forkRock * Math.max(0, lines - 1) + (mine >= 2 ? 0.1 : 0);
  return rand(run) < Math.min(0.9, p);
}
// The start of a page leaves no fork lying open: within OPENING.near squares of
// the boss's first mark no two open lines of three share a square, so every
// line there is a single threat the boss can block. The squares out to
// OPENING.lay are laid out in advance -- the lattice, then the fewest extra rocks
// that break every overlap -- and kept only if enough of the page stays
// reachable from the start.
export const OPENING = { near: 3, lay: 4, room: 14 };
function layStart(run, map) {
  const R = OPENING.lay, inside = (x, y) => Math.max(Math.abs(x), Math.abs(y)) <= R;
  const rocks = new Set();
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (onLattice(map, x, y)) rocks.add(keyOf(x, y));
  const windows = [];
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) for (const [dx, dy] of DIRS4) {
    const w = [];
    for (let j = 0; j < LINE; j++) w.push([x + j * dx, y + j * dy]);
    if (w.every(([wx, wy]) => inside(wx, wy)) && !w.some(([wx, wy]) => !wx && !wy)) windows.push(w.map(([wx, wy]) => keyOf(wx, wy)));
  }
  const near = (k) => { const [x, y] = coords(k); return Math.max(Math.abs(x), Math.abs(y)) <= OPENING.near; };
  const forksOf = () => {
    const open = windows.filter((w) => !w.some((k) => rocks.has(k)));
    const forks = [];
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
      if (open[i].some((k) => near(k) && open[j].includes(k))) forks.push([open[i], open[j]]);
    }
    return forks;
  };
  for (;;) {
    const forks = forksOf();
    if (!forks.length) break;
    // The square that breaks the most forks; the origin's neighbours last.
    const score = new Map();
    for (const pair of forks) for (const k of new Set(pair.flat())) score.set(k, (score.get(k) ?? 0) + 1);
    let best = null, bestScore = -Infinity;
    for (const [k, n] of score) {
      const [x, y] = coords(k);
      const sc = n - (Math.max(Math.abs(x), Math.abs(y)) === 1 ? 0.5 : 0) + rand(run) * 0.4;
      if (sc > bestScore) { best = k; bestScore = sc; }
    }
    rocks.add(best);
  }
  // Then clear every rock the rule does not need, in random order.
  for (const k of shuffle(run, [...rocks])) {
    rocks.delete(k);
    if (forksOf().length) rocks.add(k);
  }
  // Room to move: open squares reachable from the start without crossing a rock.
  const seen = new Set(['0,0']), todo = ['0,0'];
  while (todo.length) {
    const [x, y] = coords(todo.pop());
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = keyOf(x + dx, y + dy);
      if (!seen.has(k) && inside(x + dx, y + dy) && !rocks.has(k)) { seen.add(k); todo.push(k); }
    }
  }
  return seen.size > OPENING.room ? [...rocks] : null;
}

// How many unspoiled windows through (x, y) already hold one of `mark`'s marks.
function liveLines(map, x, y, mark) {
  let n = 0;
  for (const w of windowsThrough(x, y)) {
    let mine = 0, spoiled = false;
    for (const [wx, wy] of w) {
      const m = lineMarkAt(map, wx, wy);
      if (m === mark) mine++;
      else if (m && !(m === 'S' && mark === 'O')) { spoiled = true; break; }
    }
    if (!spoiled && mine) n++;
  }
  return n;
}
const GOOD = ['shop', 'rest', 'treasure', 'craft', 'gift'];
const DIRS4 = [[1, 0], [0, 1], [1, 1], [1, -1]];
export const keyOf = (x, y) => `${x},${y}`;
export const coords = (k) => k.split(',').map(Number);
// A mark already crossed through in a line of three is spent: no other line
// may use it, so for lines it counts as a rock.
const lineMarkAt = (map, x, y) => { const c = map.cells[keyOf(x, y)]; return c?.line ? '#' : c?.mark ?? null; };
export const cellAt = (map, k) => map.cells[k];

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
// in any window through it that nothing spoils. Rocks spoil every line; a
// scorched square spoils yours but not the boss's.
function reach(map, x, y, mark) {
  let best = 0;
  for (const w of windowsThrough(x, y)) {
    let mine = 0, spoiled = false;
    for (const [wx, wy] of w) {
      const m = lineMarkAt(map, wx, wy);
      if (m === mark) mine++;
      else if (m && !(m === 'S' && mark === 'O')) { spoiled = true; break; }
    }
    if (!spoiled) best = Math.max(best, mine);
  }
  return best;
}

// The new line of three that the mark just made at k completes, if any: its
// squares are crossed through (map.lines) and spent. Only one line per mark.
function claimLine(map, k) {
  const mark = map.cells[k]?.mark;
  if (!mark || mark === 'S') return null;
  for (const w of windowsThrough(...coords(k))) {
    if (w.every(([x, y]) => lineMarkAt(map, x, y) === mark)) {
      const keys = w.map(([x, y]) => keyOf(x, y));
      for (const q of keys) map.cells[q].line = true;
      (map.lines ??= []).push({ mark, cells: keys });
      return keys;
    }
  }
  return null;
}

// The boss's lair takes the place of one of the obstacles next to its first
// mark: a wall like any other, until your line opens it.
export function placeLair(run, map = run.map) {
  if (map.lair) return;
  const near = Object.keys(map.cells).filter((k) => map.cells[k].kind === 'rock' && ringOf(...coords(k)) === 1);
  const pool = near.length ? near : Object.keys(map.cells).filter((k) => map.cells[k].kind === 'rock');
  if (!pool.length) return;
  map.lair = pick(run, pool.sort());
  map.cells[map.lair] = { kind: 'lair', mark: '#' };
}

// Step back out of a duel you have only looked at.
// From the boss too: it waits in its lair as it was, risen already if you
// beat it once.
export function retreat(run) {
  const duel = run.pending?.duel;
  if (run.atBoss && duel) {
    run.map.bossWins = duel.bossWins;
    run.map.bossRound = duel.bossRound;
    run.atBoss = false;
  }
  run.map.at = null;
  run.pending = null;
  run.screen = 'map';
}

export function makeMap(run) {
  const map = {
    v: 7,
    cells: {},         // "x,y" -> {kind, mark, duel?}; only revealed squares exist. Marks: X, O, S (scorched), # (rock)
    boss: pick(run, ACTS[run.act - 1].bosses),
    at: null,          // the square being visited right now
    lastO: '0,0',      // the boss's latest mark, for the page to draw in
    open: false,       // the boss's door
    power: 0,          // how much stronger the boss has grown
    oLines: 0,
    lines: [],         // lines of three, crossed through: {mark, cells}
    visited: 0,
    fights: 0,         // duels revealed so far, for the gentle first few
  };
  map.cells['0,0'] = { kind: 'boss-mark', mark: 'O' };
  run.map = map;
  // The lattice, shifted so that it never runs through the boss's first mark.
  const shifts = [...Array(ROCKS.m || 1).keys()].filter((sh) => !ROCKS.set.includes((((0 - sh) % (ROCKS.m || 1)) + (ROCKS.m || 1)) % (ROCKS.m || 1)));
  map.rockShift = shifts.length ? pick(run, shifts) : 0;
  for (let tries = 0; tries < 20 && !map.start; tries++) {
    map.start = layStart(run, map) ?? undefined;
    if (!map.start) map.rockShift = shifts.length ? pick(run, shifts) : 0;
  }
  reveal(run, 0, 0, true);
  placeLair(run, map);
  // The very first page hides a gift: a special stone, free.
  // On a square in reach from the very first step.
  if (run.act === 1) {
    const free = ([k, c]) => !c.mark && c.kind !== 'elite';
    const ring = Object.entries(map.cells).filter((e) => free(e) && inReach(map, e[0]));
    const [k] = pick(run, ring.length ? ring : Object.entries(map.cells).filter(free));
    map.cells[k] = { kind: 'gift', mark: null };
  }
  return map;
}

// The revealed squares within r of (x, y), (x, y) itself not included.
function within(map, x, y, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) { const c = map.cells[keyOf(x + dx, y + dy)]; if (c) out.push(c); }
  return out;
}
// An enemy from the pool, the stronger (by how hard it thinks) the further out.
function pickByStrength(run, pool, d) {
  const sorted = [...pool].sort((a, b) => ENEMIES[a].iters - ENEMIES[b].iters);
  const far = Math.min(1, d / (MAPGEN.end - 2));
  const w = sorted.map((_, i) => { const r = sorted.length > 1 ? i / (sorted.length - 1) : 0.5; return Math.exp(MAPGEN.strength * (far - 0.5) * (r - 0.5)); });
  let roll = rand(run) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < sorted.length; i++) if ((roll -= w[i]) < 0) return sorted[i];
  return sorted[sorted.length - 1];
}


// Decide what a square is, the moment it comes into view.
function revealCell(run, x, y, first, broken = false) {
  const map = run.map;
  const k = keyOf(x, y);
  if (map.cells[k]) return false;
  const mine = reach(map, x, y, 'X');     // how much it would do for your lines
  const theirs = reach(map, x, y, 'O');   // how much it would break the boss's
  if (!broken && isRock(run, x, y, mine, first)) { map.cells[k] = { kind: 'rock', mark: '#' }; return true; }
  const d = ringOf(x, y);
  // Empty ground, more of it the further out; nothing else past MAPGEN.end.
  if (!first && rand(run) < emptyChance(d)) { map.cells[k] = { kind: 'empty', mark: null }; return true; }
  const stake = Math.max(mine, theirs);
  const table = { fight: 40, elite: 1 + 2.2 * d, event: 14, treasure: 10, rest: 10, shop: 9, craft: 6 };
  if (stake >= 2) table.elite *= 3;   // a square that matters for a line is guarded
  if (run.act === 1 && map.visited < 2) delete table.elite;
  // One unopened chest on view at a time.
  if (Object.values(map.cells).some((c) => c.kind === 'treasure' && !c.mark)) delete table.treasure;
  // Kinds keep their distance: each of the same kind within two squares makes another less likely.
  const nearby = within(map, x, y, 2);
  const goodNear = nearby.filter((c) => GOOD.includes(c.kind)).length;
  for (const kind of Object.keys(table)) {
    const same = nearby.filter((c) => c.kind === kind).length;
    table[kind] *= (kind === 'fight' ? MAPGEN.spread.fight : MAPGEN.spread.other) ** same;
    if (GOOD.includes(kind)) table[kind] *= MAPGEN.spread.good ** goodNear;   // good squares keep apart from each other too
  }
  const kind = weighted(run, table);
  const cell = { kind, mark: null };
  if (kind === 'fight' || kind === 'elite') {
    const easy = kind === 'fight' && run.act === 1 && map.fights < 3;
    // Never the same face twice close together; the stronger ones further out.
    const seen = new Set(within(map, x, y, MAPGEN.sameEnemy).map((c) => c.duel?.enemyId).filter(Boolean));
    let pool = easy ? EASY_OPENERS : enemiesOf(run.act, kind === 'elite' ? 'elite' : 'normal');
    if (pool.some((e) => !seen.has(e))) pool = pool.filter((e) => !seen.has(e));
    cell.duel = prepareDuel(run, easy ? pick(run, pool) : pickByStrength(run, pool, d), { easy });
    if (kind === 'fight') map.fights++;
  }
  map.cells[k] = cell;
  return true;
}

// Reveal the squares round (x, y); returns the ones that came into view.
// A new mark brings the paper round it into view two squares deep: the inner
// ring is in reach, the outer one only on view, so you see what lies beyond
// the square you step on.
export const SIGHT = 2;
function reveal(run, x, y, first = false) {
  const out = [];
  // Nearest first, so the inner ring is decided with the outer one still unknown.
  for (let r = 1; r <= SIGHT; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && revealCell(run, x + dx, y + dy, first && r === 1)) out.push(keyOf(x + dx, y + dy));
    }
  }
  return out;
}

// In reach: next to an X or an O. Squares further out are on view, not to be taken yet.
export function inReach(map, k) {
  const [x, y] = coords(k);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const m = (dx || dy) && map.cells[keyOf(x + dx, y + dy)]?.mark;
    if (m === 'X' || m === 'O') return true;
  }
  return false;
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
    if ((c.mark && c.mark !== 'S') || !inReach(map, k)) continue;
    const [x, y] = coords(k);
    if (reach(map, x, y, 'O') >= LINE - 1) out.push(k);
  }
  return out;
}

export const lineReach = (map, k, mark = 'X') => reach(map, ...coords(k), mark);
const openSquares = (map) => Object.entries(map.cells).filter(([k, c]) => !c.mark && inReach(map, k)).map(([k]) => k);

// Where you may go next: any open square in reach, and the boss once its lair
// is open.
export function reachable(run) {
  const out = openSquares(run.map);
  if (run.map.open) out.push('boss');
  return out;
}

// The boss's reply: finish a line if it can, block yours if it sees it coming,
// otherwise build its own and spoil yours, with a little noise. It may take a
// square you scorched. It keeps to the squares in reach, as you do, unless
// `far`: then any free square on view.
function bossMark(run, far = false) {
  const map = run.map;
  const free = Object.entries(map.cells).filter(([k, c]) => (!c.mark || c.mark === 'S') && (far || inReach(map, k)));
  if (!free.length) return null;
  const sees = rand(run) < MAPCFG.sees;
  const value = { treasure: 6, gift: 5, shop: 3, rest: 3, craft: 3, event: 2, elite: 1, fight: 1 };
  let best = null, bestScore = -Infinity;
  for (const [k, c] of free) {
    const [x, y] = coords(k);
    const mine = reach(map, x, y, 'O'), yours = reach(map, x, y, 'X');
    let score = (c.mark ? 0 : value[c.kind] ?? 0) + rand(run) * 6;
    if (mine >= LINE - 1) score += 1000;
    if (yours >= LINE - 1 && sees) score += 500;
    score += [0, 8, 20][Math.min(2, yours)] + [0, 6, 16][Math.min(2, mine)];
    if (score > bestScore) { bestScore = score; best = k; }
  }
  map.cells[best].mark = 'O';
  return best;
}

// A square is done with. Yours if you came through it: then the paper round
// it comes into view, the boss answers, and the lines are counted. Scorched
// if you lost the duel there: then you choose again.
// The boss's move. With no free square on view it steps into the fog: an
// unknown square right beside the revealed page, never a rock, the one
// best for its lines.
function bossTurn(run) {
  const o = bossMark(run) ?? bossMark(run, true);
  if (o) return o;
  const map = run.map;
  const fog = new Set();
  for (const k of Object.keys(map.cells)) {
    const [x, y] = coords(k);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = keyOf(x + dx, y + dy);
      if (!map.cells[q]) fog.add(q);
    }
  }
  if (!fog.size) return null;
  let best = null, bestScore = -Infinity;
  for (const q of fog) {
    const sc = reach(map, ...coords(q), 'O') * 3 + rand(run);
    if (sc > bestScore) { best = q; bestScore = sc; }
  }
  revealCell(run, ...coords(best), false, true);
  map.cells[best].mark = 'O';
  return best;
}

// A line of the boss's Os hurts.
function bossLine(run) {
  run.map.oLines++;
  run.map.news = 'oline';
  hurt(run, MAPCFG.lineDamage);
}

// Nowhere left for you to step: the boss moves instead, and its marks reveal
// more of the page. Only if it cannot move either is the page full.
function bossFills(run) {
  const map = run.map;
  for (let guard = 0; guard < 20 && !openSquares(map).length; guard++) {
    const o = bossTurn(run);
    if (!o) break;
    map.lastO = o;
    map.revealO = [...(map.revealO ?? []), ...reveal(run, ...coords(o))];
    if (claimLine(map, o)) bossLine(run);
  }
}

// `quiet`: the boss does not answer (for tools that walk a whole page).
export function settleCell(run, mark, { quiet = false } = {}) {
  const map = run.map;
  if (map.at === null) return;
  const at = map.at;
  map.at = null;
  map.lastO = null;
  map.news = null;
  map.visited++;
  // For the page to animate: what was just marked, and what each mark revealed.
  map.freshS = null; map.revealX = []; map.revealO = [];
  if (mark !== 'X') {
    map.cells[at].mark = 'S';
    map.freshX = null;
    map.freshS = at;
    bossFills(run);
    return;
  }
  map.cells[at].mark = 'X';
  map.freshX = at;
  map.revealX = reveal(run, ...coords(at));
  if (claimLine(map, at)) map.open = true;
  if (!quiet) {
    map.lastO = bossTurn(run);
    if (map.lastO) map.revealO = reveal(run, ...coords(map.lastO));
  }
  // Every new line of Os costs you hearts.
  if (map.lastO && claimLine(map, map.lastO)) bossLine(run);
  bossFills(run);
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
  // Enemies grow with the acts as your energy does: one special stone in the
  // first, two in the second, three in the third; an elite brings one more.
  let size = enemy.size ?? act.size + (tier === 'elite' ? 1 : 0);
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
  let heatIters = (tier === 'boss' ? 1 : [1, 0.8, 0.6][Math.max(0, run.act - 1)]) * (run.heat >= 1 ? 1.5 : 1);
  for (const type of enemy.once ?? []) handO.push({ type });
  // Pebbles to fill its hand: enough for a full board, and one to spare.
  for (let k = ENEMY_STONES - handO.length; k > 0; k--) handO.push({ type: 'pebble' });
  const modsO = { ...(enemy.mods ?? {}) };
  let conds = [], rules = [];
  if (tier === 'boss') {
    // Its second life brings its harder rules. Grown stronger on the map, it
    // thinks harder; at full strength it brings the harder rules from the first.
    const power = run.map?.power ?? 0;
    rules = [...(((context.bossWins ?? 0) > 0 || power >= 2) && enemy.rules2 || enemy.rules || [])];
    heatIters *= 1 + 0.25 * power;
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
    if (quirk === 'tricky') handO.push(randomOnce(run));
    if (quirk === 'stocked') handO.unshift({ type: pick(run, enemy.pool) });
    if (quirk === 'keen') heatIters *= 1.5;
  }
  // A boss's undead phase may think harder than its first.
  const baseIters = tier === 'boss' && (context.bossWins ?? 0) > 0 && enemy.iters2 ? enemy.iters2 : enemy.iters;
  return {
    enemyId, tier, handO, first: 'O', quirk, conds, rules,
    modsO,
    iters: Math.round(baseIters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder * 0.7,
    bossRound: context.bossRound ?? 0, bossWins: context.bossWins ?? 0,
    event: context.event ?? null,
  };
}

export const QUIRKS = {
  tricky: { name: 'Tricky', text: 'It carries a one-shot stone.' },
  stocked: { name: 'Stocked', text: 'It brings an extra stone.' },
  keen: { name: 'Keen', text: 'It thinks harder.' },
};

// What the player brings: the chosen stones (by uid) as a duel hand.
// The chosen stones, and Pebbles up to a hand of four.
export function playerHand(run, uids) {
  const hand = uids.map((u) => run.pouch.find((s) => s.uid === u)).filter(Boolean).map((s) => ({ type: s.type }));
  while (hand.length < HAND) hand.push({ type: 'pebble' });
  return hand;
}

export function playerMods(run) {
  const mods = {};
  for (const r of run.relics) if (RELICS[r]?.mod) mods[RELICS[r].mod] = true;
  return mods;
}

export function gameConfig(run, duel, uids) {
  return {
    handX: playerHand(run, uids), handO: duel.handO, first: 'O',
    modsX: playerMods(run), modsO: duel.modsO, conds: duel.conds ?? [], rules: duel.rules ?? [],
  };
}

// The default loadout: last time's stones if still owned, topped up.
// The default loadout: last time's stones if still owned and affordable, then
// the dearest stones the energy still pays for.
export function defaultHand(run) {
  const energy = energyOf(run);
  const owned = new Set(run.pouch.map((s) => s.uid));
  const chosen = [];
  const take = (u) => { if (!chosen.includes(u) && handCost(run, [...chosen, u]) <= energy) chosen.push(u); };
  for (const u of run.lastHand ?? []) if (owned.has(u)) take(u);
  if (!run.lastHand) for (const s of [...run.pouch].sort((a, b) => costOf(b.type) - costOf(a.type))) take(s.uid);
  return chosen;
}

// ── Entering nodes ──────────────────────────────────────────────────────────

export function enterNode(run, key) {
  if (key === 'boss') {
    run.atBoss = true;
    run.pending = { kind: 'duel', duel: prepareDuel(run, run.map.boss, { bossRound: run.map.bossRound ?? 0, bossWins: run.map.bossWins ?? 0 }) };
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
    case 'empty': settleCell(run, 'X'); if (!run.over) run.screen = 'map'; break;   // nothing here: just the X
    case 'shop': run.pending = { kind: 'shop', shop: makeShop(run) }; run.screen = 'shop'; break;
    case 'rest': run.pending = { kind: 'rest' }; run.screen = 'rest'; break;
    case 'craft': run.pending = { kind: 'craft' }; run.screen = 'craft'; break;
    case 'gift': {
      // A special stone, free: one of two, both of them stones the energy you
      // have can bring along.
      const stones = stoneChoices(run, 'normal', energyOf(run) >= 3 ? null : energyOf(run) >= 2 ? 'uncommon' : 'common', 2);
      run.pending = { kind: 'reward', gift: true, gold: 0, stones, once: null, relic: null, relicChoice: null, tier: 'gift', taken: {} };
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
    // A boss is beaten twice, and rises again with its harder rules.
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
  const reward = { kind: 'reward', gold, stones: [], once: null, relic: null, relicChoice: null, tier: duel.tier, taken: {} };
  if (duel.event !== 'thief') reward.stones = stoneChoices(run, duel.tier);
  const onceChance = duel.tier === 'normal' ? 0.3 : duel.tier === 'event' ? 0 : 0.7;
  if (rand(run) < onceChance) reward.once = randomOnce(run);
  const big = duel.tier === 'elite' || duel.tier === 'boss';
  if (duel.tier === 'elite' || duel.event === 'hermit' || duel.event === 'nightowl') reward.relic = randomRelic(run);
  if (duel.tier === 'elite') { run.stats.elites++; run.energy = (run.energy ?? START.energy) + 1; reward.energy = 1; }
  if (duel.tier === 'boss') {
    run.stats.bosses++;
    run.energy = (run.energy ?? START.energy) + 2;   // a boss beaten: more energy for the climb
    reward.energy = 2;
    reward.relicChoice = shuffle(run, BOSS_RELICS.filter((r) => !has(run, r))).slice(0, 3);
    run.hearts = Math.min(run.maxHearts, run.hearts + 3);
  }
  if (big && has(run, 'herbs')) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
  if (big && has(run, 'bell') && !reward.once) reward.once = randomOnce(run);
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
  // Lost to the boss: thrown out of its lair, which shuts. Another line of
  // three opens it again; a boss beaten once is still risen when you return.
  if (duel.tier === 'boss') {
    const map = run.map;
    map.bossWins = duel.bossWins;
    map.bossRound = duel.bossRound + 1;
    map.open = false;
    map.doorHeard = false;
    map.at = null;
    map.news = 'thrown';
    run.atBoss = false;
    run.pending = null;
    run.screen = 'map';
    return { kind: 'boss-out' };
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

export function randomOnce(run, rarity = null) {
  const r = rarity ?? weighted(run, { common: 60, uncommon: 28, rare: 12 });
  const pool = ONCE_STONES.filter((t) => STONES[t].rarity === r);
  return { type: pick(run, pool.length ? pool : ONCE_STONES) };
}

// After a duel: the one-shot stones you played are gone from the pouch.
export function spendOnce(run, uids, spent) {
  const left = [...spent];
  for (const u of uids ?? []) {
    const st = run.pouch.find((x) => x.uid === u);
    const k = st ? left.indexOf(st.type) : -1;
    if (k < 0) continue;
    left.splice(k, 1);
    run.pouch = run.pouch.filter((x) => x !== st);
  }
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
  // A new stone goes into the hand you last took into a duel, if the energy
  // left over pays for it.
  if (run.lastHand) {
    const hand = run.lastHand.filter((u) => run.pouch.some((x) => x.uid === u));
    if (handCost(run, hand) + costOf(st.type) <= energyOf(run)) hand.push(st.uid);
    run.lastHand = hand;
  }
  return st;
}


// ── Shop ────────────────────────────────────────────────────────────────────

export function price(run, base) {
  return Math.round(base * (has(run, 'badge') ? 0.75 : 1) * (run.heat >= 2 ? 1.25 : 1) * (1 + 0.1 * (run.act - 1)));
}

export function makeShop(run) {
  const stones = [];
  const rarities = ['common', 'common', 'uncommon', 'uncommon', 'rare', ...(has(run, 'satchel') ? ['uncommon'] : [])];
  for (const r of rarities) {
    let s;
    for (let g = 0; g < 20; g++) { s = randomStone(run, r); if (!stones.some((o) => o.type === s.type)) break; }
    stones.push({ ...s, price: price(run, STONE_PRICE[r]), sold: false });
  }
  const once = [];
  for (const r of ['common', 'common', 'uncommon', 'rare']) {
    let s;
    for (let g = 0; g < 20; g++) { s = randomOnce(run, r); if (!once.some((o) => o.type === s.type)) break; }
    once.push({ ...s, price: price(run, ONCE_PRICE[r]), sold: false });
  }
  const relics = [];
  for (let i = 0; i < 2; i++) {
    const id = randomRelic(run);
    if (id && !relics.some((x) => x.relic === id)) relics.push({ relic: id, price: price(run, RELIC_PRICE[RELICS[id].rarity]), sold: false });
  }
  return {
    stones, once, relics,
    healPrice: price(run, 30),
    energyPrice: price(run, 50 + 10 * ((run.energy ?? START.energy) - START.energy)),
    healed: 0, energized: false,
  };
}
