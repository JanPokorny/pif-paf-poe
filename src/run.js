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

export const START = { pouch: [], hearts: 6, gold: 30, slots: 2 };
export const MAX_SLOTS = 5;

const stone = (run, type) => ({ type, uid: run.nextUid++ });

export function newRun({ seed = (Math.random() * 2 ** 31) | 0, heat = 0 } = {}) {
  const hearts = START.hearts - (heat >= 3 ? 1 : 0);
  const run = {
    v: 2, seed, rs: seed, heat,
    act: 1, atBoss: false, map: null,
    hearts, maxHearts: hearts,
    gold: START.gold, pouch: [], relics: [],
    slots: START.slots,
    aids: { double: 0, breach: 0 },   // map aids won in duels
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
// How many special stones you bring into a duel. Pebbles are always there.
export const handSize = (run) => Math.min(MAX_SLOTS + 1, (run.slots ?? 2) + (has(run, 'deep-pockets') ? 1 : 0));
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
export const PAGE = 12;                   // your steps before the boss will wait no longer
export const MAPCFG = { sees: 0.75 };     // the chance the boss blocks your two in a row
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
function isRock(run, x, y, mine, first = false) {
  const map = run.map;
  // Near the start the rocks are laid out in advance (see layStart).
  if (map.start && Math.max(Math.abs(x), Math.abs(y)) <= OPENING.lay) return map.start.includes(keyOf(x, y));
  if (onLattice(map, x, y)) return true;
  if (first) return false;
  // A square on several of your live lines is where a fork would be: likelier still.
  const lines = liveLines(run.map, x, y, 'X');
  return rand(run) < Math.min(0.9, ROCKS.byReach[Math.min(2, mine)] + ROCKS.perLine * Math.max(0, lines - 1));
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

// Step back out of a duel you have only looked at.
export function retreat(run) {
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
    armed: null,       // a map aid about to be used
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
  // The very first page hides a gift: a special stone, free.
  if (run.act === 1) {
    const ring = Object.entries(map.cells).filter(([, c]) => !c.mark && c.kind !== 'elite');
    const [k] = pick(run, ring);
    map.cells[k] = { kind: 'gift', mark: null };
  }
  return map;
}

// The revealed squares around (x, y).
const around = (map, x, y) => {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const c = map.cells[keyOf(x + dx, y + dy)]; if (c) out.push(c); }
  return out;
};

// Decide what a square is, the moment it comes into view.
function revealCell(run, x, y, first, broken = false) {
  const map = run.map;
  const k = keyOf(x, y);
  if (map.cells[k]) return false;
  const mine = reach(map, x, y, 'X');     // how much it would do for your lines
  const theirs = reach(map, x, y, 'O');   // how much it would break the boss's
  if (!broken && isRock(run, x, y, mine, first)) { map.cells[k] = { kind: 'rock', mark: '#' }; return true; }
  const stake = Math.max(mine, theirs);
  const table = stake >= 2 ? { elite: 40, fight: 50, event: 10 }
    : stake === 1 ? { elite: 5, fight: 50, event: 18, treasure: 8, rest: 10, shop: 9, craft: 6 }
      : { fight: 36, event: 20, treasure: 14, rest: 15, shop: 15, craft: 8 };
  if (run.act === 1 && map.visited < 2) delete table.elite;
  // One unopened chest on view at a time.
  if (Object.values(map.cells).some((c) => c.kind === 'treasure' && !c.mark)) delete table.treasure;
  // Good squares keep their distance: each good neighbour makes another a quarter as likely.
  const near = around(map, x, y).filter((c) => GOOD.includes(c.kind)).length;
  for (const g of GOOD) if (table[g]) table[g] *= 0.25 ** near;
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
  return true;
}

// Reveal the squares round (x, y); returns the ones that came into view.
function reveal(run, x, y, first = false) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && revealCell(run, x + dx, y + dy, first)) out.push(keyOf(x + dx, y + dy));
  return out;
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
    if (c.mark && c.mark !== 'S') continue;
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

// The boss's reply: finish a line if it can, block yours if it sees it coming,
// otherwise build its own and spoil yours, with a little noise. It may take a
// square you scorched.
function bossMark(run) {
  const map = run.map;
  const free = Object.entries(map.cells).filter(([, c]) => !c.mark || c.mark === 'S');
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
export function settleCell(run, mark) {
  const map = run.map;
  if (map.at === null) return;
  const wasOpen = map.open;
  const at = map.at;
  map.at = null;
  map.lastO = null;
  map.bonus = 0;
  map.news = null;
  map.visited++;
  // For the page to animate: what was just marked, and what each mark revealed.
  map.freshS = null; map.revealX = []; map.revealO = [];
  if (mark !== 'X') {
    map.cells[at].mark = 'S';
    map.freshX = null;
    map.freshS = at;
    if (pageFull(map) && !map.open) { map.open = true; map.power = Math.min(MAX_POWER, map.power + 1); map.news = 'full'; }
    return;
  }
  map.cells[at].mark = 'X';
  map.freshX = at;
  map.revealX = reveal(run, ...coords(at));
  if (claimLine(map, at)) map.open = true;
  // Squares cleared past an open door pay a little extra: a reason to press on.
  if (wasOpen) { map.bonus = 10; run.gold += 10; }
  const aid = map.armed;
  if (aid) { run.aids[aid]--; map.armed = null; }
  if (aid !== 'double') {
    map.lastO = bossMark(run);
    if (map.lastO) map.revealO = reveal(run, ...coords(map.lastO));
  }
  // Every new line of Os makes the boss stronger, up to a point.
  if (map.lastO && claimLine(map, map.lastO)) {
    map.oLines++;
    if (map.power < MAX_POWER) { map.power++; map.news = 'oline'; }
  }
  // A full page: the boss comes for you, and it has had time to prepare.
  if (pageFull(map) && !map.open) {
    map.open = true;
    map.power = Math.min(MAX_POWER, map.power + 1);
    map.news = 'full';
  }
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

// ── Map aids, won in duels ───────────────────────────────────────────────────
//
//   double: the boss does not answer your next step
//   breach: a rock you choose crumbles, and the square under it comes into view
export const AIDS = {
  double: { name: 'Double Step', text: 'One step the boss does not answer.' },
  breach: { name: 'Pickaxe', text: 'Break one rock.' },
};
export const AID_TYPES = Object.keys(AIDS);
// Arm an aid for the next step, or put it away again.
export function toggleAid(run, kind) {
  const map = run.map;
  if (map.armed === kind) { map.armed = null; return; }
  if ((run.aids?.[kind] ?? 0) > 0) map.armed = kind;
}
// With the Pickaxe armed, break the rock at k.
export function breach(run, k) {
  const map = run.map;
  if (map.armed !== 'breach' || map.cells[k]?.kind !== 'rock') return false;
  delete map.cells[k];
  revealCell(run, ...coords(k), true, true);
  run.aids.breach--;
  map.armed = null;
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
    if (quirk === 'stocked') handO.push({ type: pick(run, enemy.pool) });
    if (quirk === 'keen') heatIters *= 1.5;
  }
  return {
    enemyId, tier, handO, first: 'O', quirk, conds, rules,
    modsO,
    iters: Math.round(enemy.iters * heatIters), blunder: run.heat >= 5 ? 0 : enemy.blunder * 0.7,
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
    case 'craft': run.pending = { kind: 'craft' }; run.screen = 'craft'; break;
    case 'gift': {
      // A special stone, free: one of two.
      const stones = stoneChoices(run, 'normal', null, 2);
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
  // Instead of a stone, help on the map.
  if (duel.event !== 'thief' && duel.tier !== 'boss' && rand(run) < (duel.tier === 'normal' ? 0.4 : 1)) reward.aid = pick(run, AID_TYPES);
  const big = duel.tier === 'elite' || duel.tier === 'boss';
  if (duel.tier === 'elite' || duel.event === 'hermit' || duel.event === 'nightowl') reward.relic = randomRelic(run);
  if (duel.tier === 'elite') run.stats.elites++;
  if (duel.tier === 'boss') {
    run.stats.bosses++;
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
  return st;
}

export function gainAid(run, kind) { run.aids = run.aids ?? { double: 0, breach: 0 }; run.aids[kind] = (run.aids[kind] ?? 0) + 1; }
export const pouchFull = (run) => run.pouch.length >= pouchCap(run);

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
    slotPrice: price(run, 60 + 40 * (run.slots - START.slots)),
    healed: 0, slotted: false,
  };
}

export const canAddSlot = (run) => run.slots < MAX_SLOTS;
