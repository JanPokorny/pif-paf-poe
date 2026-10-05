// Pif-paf-poe duel engine, grown out of old/engine.js for the roguelike.
//
// A duel is tic-tac-toe on a 3x3 board. Each side brings a handful of stones:
// plain Pebbles, and special stones that do something when placed -- mostly
// move stones already on the board. A side whose hand is empty finds a Pebble. You are X, the enemy is O, and the
// enemy always opens; a full board goes to you.
//
// Some duels carry a condition for both sides (gravity, no centre, a shared
// hand), and a boss plays only Pebbles but brings a rule of its own.
//
// The state is a plain mutable object: `applyAction` mutates it, `cloneState`
// branches it, and everything else is a pure function of it. The AI and the UI
// run the very same code, so what you see is what the enemy reasons about.
//
// A turn is select -> place -> effect -> check. An effect with a single
// possible outcome resolves on its own.

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
export const BLOCKS = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
export const DIRS = ['up', 'down', 'left', 'right'];
const DELTA = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
  upleft: [-1, -1], upright: [-1, 1], downleft: [1, -1], downright: [1, 1],
};
const ORTHO = ['up', 'down', 'left', 'right'];

export const other = (p) => (p === 'X' ? 'O' : 'X');
export const row = (i) => (i / 3) | 0;
export const col = (i) => i % 3;
const at = (r, c) => (r < 0 || r > 2 || c < 0 || c > 2 ? -1 : r * 3 + c);
export const step = (i, dir, n = 1) => at(row(i) + DELTA[dir][0] * n, col(i) + DELTA[dir][1] * n);

export function adjacent(a, b) {
  return Math.abs(row(a) - row(b)) + Math.abs(col(a) - col(b)) === 1;
}
export function touching(a, b) {   // adjacent, corners included
  return a !== b && Math.abs(row(a) - row(b)) <= 1 && Math.abs(col(a) - col(b)) <= 1;
}
export const near = (plus) => (plus ? touching : adjacent);
const neighbours = (i, plus) => {
  const out = [];
  for (let j = 0; j < 9; j++) if (near(plus)(i, j)) out.push(j);
  return out;
};
const rowSquares = (r) => [r * 3, r * 3 + 1, r * 3 + 2];
const colSquares = (c) => [c, c + 3, c + 6];


// ── Stones ──────────────────────────────────────────────────────────────────
//
// Every stone type is data plus up to three hooks:
//   options(s, pos, cell) -> the choices its effect offers (objects merged into
//                            the effect action); [] or absent means no effect
//   apply(s, pos, action, cell) -> 'again' if the stone became another and
//                            that one acts now (a Parrot)
//   restrict(square, stonePos) -> does this square satisfy it?
// `immovable` stones are walls for every movement effect, and are stepped over.
//
// "Beside" always means the four squares that share a side.
//
export const STONES = {};
const def = (id, spec) => { STONES[id] = { id, ...spec }; };
// What a stone in hand or on the board does.
export const specOf = (c) => STONES[c.type];
const inLine = (a, b) => a !== b && (row(a) === row(b) || col(a) === col(b));

def('pebble', {
  name: 'Pebble', rarity: 'starter', kind: 'plain',
  text: 'Does nothing: just a mark on the board.',
});

def('shift', {
  name: 'Shift', rarity: 'common', kind: 'move',
  text: 'Slide this stone\'s row or column one step. What falls off the end wraps around.',
  options: (s, pos) => DIRS.map((dir) => ({ dir, index: dir === 'left' || dir === 'right' ? row(pos) : col(pos) })),
  apply(s, pos, a) { stepAlong(s, lineOrder(a.index, a.dir)); },
});

def('rotate', {
  name: 'Waltz', rarity: 'common', kind: 'move',
  text: 'Turn a 2x2 block this stone is in one step, either way.',
  options: (s, pos) => Object.keys(BLOCKS).filter((block) => BLOCKS[block].includes(pos)).flatMap((block) => [{ block, cw: true }, { block, cw: false }]),
  apply(s, pos, a) {
    const [tl, tr, bl, br] = BLOCKS[a.block];
    stepAlong(s, a.cw ? [tl, tr, br, bl] : [tl, bl, br, tr]);
  },
});

def('magnet', {
  name: 'Magnet', rarity: 'uncommon', kind: 'restrict', reach: 'beside',
  text: 'The enemy must place beside it.',
  restrict: (sq, m) => adjacent(sq, m),
});

def('stinky', {
  name: 'Stinky', rarity: 'uncommon', kind: 'restrict', reach: 'beside',
  text: 'The enemy must not place beside it.',
  restrict: (sq, m) => !adjacent(sq, m),
});

def('mountain', {
  name: 'Mountain', rarity: 'common', kind: 'static', immovable: true,
  text: 'Nothing ever moves it.',
});

def('gravity', {
  name: 'Gravity', rarity: 'rare', kind: 'move',
  text: 'Every stone slides one way, your pick, as far as it can. Mountains hold.',
  options: () => DIRS.map((dir) => ({ dir })),
  apply(s, pos, a) { slideAll(s, a.dir, null); },
});

def('bumper', {
  name: 'Bumper', rarity: 'uncommon', kind: 'move', reach: 'beside',
  text: 'Pushes each enemy stone beside it one step away. One pushed off the edge is knocked off the board.',
  options: () => [{}],
  apply(s, pos, a, cell) {
    const moves = [], off = [];
    for (const dir of ORTHO) {
      const n = step(pos, dir), beyond = step(pos, dir, 2);
      if (n < 0 || !s.board[n] || s.board[n].player === cell.player || isStuck(s, n)) continue;
      if (beyond < 0) off.push(n);
      else if (!s.board[beyond]) moves.push([n, beyond]);
    }
    for (const n of off) s.board[n] = null;
    for (const [from, to] of moves) move(s, from, to);
  },
});

// Lasso: pull a stone, either side's, from anywhere onto an empty square beside it.
const lassoOptions = (s, pos) => {
  const out = [];
  const beside = neighbours(pos, false);
  for (let i = 0; i < 9; i++) {
    const c = s.board[i];
    if (i === pos || !c || isStuck(s, i) || beside.includes(i)) continue;
    for (const to of beside) if (!s.board[to]) out.push({ from: i, to });
  }
  return out;
};

def('lasso', {
  name: 'Lasso', rarity: 'uncommon', kind: 'move', reach: 'beside',
  text: 'Pulls any stone, yours too, onto an empty square beside it.',
  options: lassoOptions,
  apply(s, pos, a) { move(s, a.from, a.to); },
});

def('swap', {
  name: 'Swap', rarity: 'uncommon', kind: 'move',
  text: 'Trade places with any stone on the board.',
  options(s, pos) {
    if (isStuck(s, pos)) return [];
    return [...Array(9).keys()].filter((j) => j !== pos && s.board[j] && !isStuck(s, j)).map((target) => ({ target }));
  },
  apply(s, pos, a) {
    const held = s.board[a.target];
    s.board[a.target] = s.board[pos];
    s.board[pos] = held;
  },
});

def('frog', {
  name: 'Frog', rarity: 'common', kind: 'move', reach: 'beside',
  text: 'Leaps over a stone beside it. An enemy stone leapt over goes back to its owner\'s hand, and a Pebble of yours takes its square.',
  options(s, pos) {
    const out = [];
    if (isStuck(s, pos)) return out;
    for (const dir of ORTHO) {
      const n = step(pos, dir), beyond = step(pos, dir, 2);
      if (beyond >= 0 && s.board[n] && !s.board[beyond]) out.push({ target: beyond });
    }
    return out;
  },
  apply(s, pos, a, cell) {
    const mid = at((row(pos) + row(a.target)) / 2, (col(pos) + col(a.target)) / 2);
    move(s, pos, a.target);
    const jumped = s.board[mid];
    if (!jumped || jumped.player === cell.player) return;
    returnToHand(s, mid);
    s.board[mid] = { player: cell.player, type: 'pebble', id: s.nextId++ };
    s.placements[cell.player]++;
  },
});

// The board's outer ring, clockwise from the top left corner.
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

def('bonfire', {
  name: 'Bonfire', rarity: 'common', kind: 'move',
  text: 'Turns the outer ring of the board one step, the way you pick. Mountains hold.',
  options: (s) => (RING.some((i) => s.board[i] && !isStuck(s, i)) ? [{ spin: 1 }, { spin: -1 }] : []),
  apply(s, pos, a) { stepAlong(s, a.spin > 0 ? RING : [...RING].reverse()); },
});

def('firecracker', {
  name: 'Firecracker', rarity: 'rare', kind: 'move', reach: 'line',
  text: 'Blows a stone in its row or column back to its owner\'s hand.',
  options: (s, pos) => [...Array(9).keys()].filter((j) => inLine(j, pos) && s.board[j]).map((target) => ({ target })),
  apply(s, pos, a) { returnToHand(s, a.target); },
});

def('parrot', {
  name: 'Parrot', rarity: 'common', kind: 'copy', copies: true,
  text: 'Becomes a copy of any stone on the board, either side\'s, and does what it does.',
  // One square per kind of stone: copying either of two Shifts is the same.
  options(s, pos) {
    const seen = new Set(), out = [];
    for (let j = 0; j < 9; j++) {
      const c = s.board[j];
      if (j === pos || !c || c.type === 'pebble' || STONES[c.type].copies || seen.has(c.type)) continue;
      seen.add(c.type);
      out.push({ target: j });
    }
    return out;
  },
  apply(s, pos, a, cell) {
    const type = s.board[a.target].type;
    note(s, `copy:parrot:${type}`);
    cell.type = type;
    return 'again';
  },
});

def('twin', {
  name: 'Twin', rarity: 'common', kind: 'move',
  text: 'A Pebble lands on the square opposite it across the board, if that is empty.',
  options(s, pos) {
    const j = 8 - pos;
    return j !== pos && !s.board[j] ? [{ target: j }] : [];
  },
  apply(s, pos, a, cell) {
    s.board[a.target] = { player: cell.player, type: 'pebble', id: s.nextId++ };
    s.placements[cell.player]++;
  },
});

def('magpie', {
  name: 'Magpie', rarity: 'rare', kind: 'curse',
  text: 'Steals a stone of your choice from the enemy\'s hand into yours.',
  options(s, pos, cell) {
    return [...new Set(s.hands[other(cell.player)].map((h) => h.type))].map((stone) => ({ stone }));
  },
  apply(s, pos, a, cell) {
    const hand = s.hands[other(cell.player)];
    const [taken] = hand.splice(hand.findIndex((h) => h.type === a.stone), 1);
    s.hands[cell.player].push({ type: taken.type });
  },
});

// One-shot stones: placed like any other, then they do their one thing. Once
// played in a duel, one is gone from your pouch for good.
const mine = (s, p) => [...Array(9).keys()].filter((i) => s.board[i]?.player === p);
const empties = (s) => [...Array(9).keys()].filter((i) => !s.board[i]);

def('relocate', {
  name: 'Relocate', rarity: 'uncommon', kind: 'once', once: true,
  text: 'Move one of your stones, this one too, to any empty square.',
  options: (s, pos, cell) => mine(s, cell.player).filter((from) => !isStuck(s, from)).flatMap((from) => empties(s).map((to) => ({ from, to }))),
  apply(s, pos, a) { move(s, a.from, a.to); },
});

def('mind-control', {
  name: 'Mind Control', rarity: 'rare', kind: 'once', once: true, reach: 'beside',
  text: 'An enemy stone beside it becomes yours, and the Mind Control is gone.',
  options: (s, pos, cell) => neighbours(pos, false).filter((j) => s.board[j] && s.board[j].player !== cell.player).map((target) => ({ target })),
  apply(s, pos, a, cell) { s.board[a.target].player = cell.player; s.board[pos] = null; },
});

def('muffle', {
  name: 'Muffle', rarity: 'common', kind: 'once', once: true, reach: 'line', hushes: true,
  text: 'As long as it stands, enemy stones in its row and column do nothing: no effect, no restriction, no wall.',
});

def('hammer', {
  name: 'Hammer', rarity: 'uncommon', kind: 'once', once: true, reach: 'beside',
  text: 'Smashes a stone beside it, either side\'s, off the board for good.',
  options: (s, pos) => neighbours(pos, false).filter((j) => s.board[j]).map((target) => ({ target })),
  apply(s, pos, a) { s.board[a.target] = null; },
});

def('snatch', {
  name: 'Snatch', rarity: 'uncommon', kind: 'once', once: true, reach: 'beside',
  text: 'Takes a stone beside it, either side\'s, off the board into your hand.',
  options: (s, pos) => neighbours(pos, false).filter((j) => s.board[j] && !isStuck(s, j)).map((target) => ({ target })),
  apply(s, pos, a, cell) {
    const c = s.board[a.target];
    s.board[a.target] = null;
    s.hands[cell.player].push({ type: c.type });
  },
});

def('seed', {
  name: 'Seed', rarity: 'common', kind: 'once', once: true, reach: 'beside',
  text: 'A Mountain of yours grows on an empty square beside it.',
  options: (s, pos) => neighbours(pos, false).filter((j) => !s.board[j]).map((target) => ({ target })),
  apply(s, pos, a, cell) {
    s.board[a.target] = { player: cell.player, type: 'mountain', id: s.nextId++ };
    s.placements[cell.player]++;
  },
});

// The Nomad moves by itself: at the end of each of its owner's turns (see
// nomadSquares and the 'nomad' phase below), not when placed.
def('nomad', {
  name: 'Nomad', rarity: 'common', kind: 'move', wanders: true,
  text: 'At the end of each of your turns it moves on to the next free square, row by row. Your Nomads travel together. Three in a row counts only after.',
});

export const STONE_TYPES = Object.keys(STONES);
// Stones you can find: everything but the Pebble.
export const BASE_STONES = STONE_TYPES.filter((t) => t !== 'pebble');
export const ONCE_STONES = STONE_TYPES.filter((t) => STONES[t].once);



// ── Conditions: a duel's rule for both sides ────────────────────────────────

export const CONDS = {
  gravity: { name: 'Permanent Gravity', text: 'After every turn, stones fall as far down as they can. Mountains hold.' },
  nocentre: { name: 'Hollow', text: 'Nobody may place on the centre square.' },
  shared: { name: 'Open Hands', text: 'Either side may play the other\'s stones. A stone takes the colour of whoever plays it. After the duel they go back to their owners.' },
};

// ── Boss rules: a boss plays only Pebbles, but brings one of these ───────────

export const RULES = {
  tactics: { name: 'Tactics', text: 'Before each of your turns, the boss picks which stone you must play.', dictate: true },
  headstart: { name: 'Head Start', text: 'The boss plays twice on its first turn.' },
  double: { name: 'Double Time', text: 'Every turn is two stones in a row, for both sides. The boss starts.' },
  elko: { name: 'Elbow', text: 'Rows do not count: an L of three wins.' },
  clinch: { name: 'Clinch', text: 'You must place beside one of the boss\'s stones.' },
  column: { name: 'Column', text: 'Each turn the boss closes a column to you.', dictate: true },
  spy: { name: 'Spy', text: 'Each turn the boss picks which way your stones move.', dictate: true },
  patient: { name: 'Patience', text: 'A full board goes to the boss.' },
  reserved: { name: 'Reserved', text: 'You may not place on the centre square. The boss may.' },
};

// Winning shapes: lines of three, or under the Elbow, L-shapes of three.
export const ELS = Object.values(BLOCKS).flatMap((b) => b.map((skip) => b.filter((x) => x !== skip)));
const shapesOf = (s) => (s.rules.includes('elko') ? ELS : LINES);

// ── Queries ─────────────────────────────────────────────────────────────────

// A stone does its thing unless an enemy Muffle stands in its row or column (Muffles
// themselves are never hushed).
export function active(s, cell) {
  if (STONES[cell.type].hushes) return true;
  const i = s.board.indexOf(cell);
  return i < 0 || ![...Array(9).keys()].some((j) => inLine(i, j) && s.board[j] && s.board[j].player !== cell.player && STONES[s.board[j].type].hushes);
}

// Mountains are walls to every movement effect, and moving stones step over
// them. A hushed Mountain is no wall.
export function isStuck(s, i) {
  const c = s.board[i];
  if (!c) return false;
  if (!active(s, c)) return false;
  return !!STONES[c.type].immovable;
}

export function hasLine(s, player) { return !!winningLine(s, player); }
export function winningLine(s, player) {
  const b = s.board;
  const mine = (i) => b[i] && b[i].player === player;
  return shapesOf(s).find((l) => l.every(mine)) ?? null;
}

const freeSquares = (b) => { const o = []; for (let i = 0; i < 9; i++) if (!b[i]) o.push(i); return o; };

// Every restriction the opponent has on the board pulls at once, and you must
// place where you satisfy as many of them as any square can.
export function restrictionsOn(s, player) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const c = s.board[i];
    if (!c || c.player === player || !active(s, c)) continue;
    const st = specOf(c);
    if (st.restrict) out.push({ pos: i, st });
  }
  return out;
}

export function allowedSquares(s) {
  const p = s.player;
  let pool = freeSquares(s.board);
  const narrow = (f) => { const n = pool.filter(f); if (n.length) pool = n; };
  if (s.conds.includes('nocentre')) narrow((i) => i !== 4);
  if (p === 'X') {
    if (s.rules.includes('reserved')) narrow((i) => i !== 4);
    // Beside one of its stones: to block a diagonal, move or restrict to get there.
    if (s.rules.includes('clinch')) narrow((i) => s.board.some((c, j) => c && c.player === 'O' && adjacent(i, j)));
    if (s.dictate?.kind === 'column') narrow((i) => col(i) !== s.dictate.value);
  }
  if (s.mods[p].freeFirst && s.placements[p] === 0) return pool;
  const rs = restrictionsOn(s, p);
  if (!rs.length) return pool;
  const scores = pool.map((i) => rs.reduce((n, r) => n + (r.st.restrict(i, r.pos) ? 1 : 0), 0));
  const best = Math.max(...scores);
  return pool.filter((_, k) => scores[k] === best);
}

// ── Movement primitives ─────────────────────────────────────────────────────

function move(s, from, to) {
  s.board[to] = s.board[from];
  s.board[from] = null;
}

// Back into its owner's hand, Pebbles too.
function returnToHand(s, i) {
  const c = s.board[i];
  s.hands[c.player].push({ type: c.type });
  s.board[i] = null;
}

// Advance every stone one step along `cells`, wrapping from last to first.
// Stuck stones hold their squares and are simply stepped over: everything
// else still goes round, into the next square that is not stuck.
function stepAlong(s, cells) {
  const b = s.board;
  const free = cells.filter((i) => !isStuck(s, i));
  if (free.length < 2) return;
  const before = free.map((i) => b[i]);
  for (let k = 0; k < free.length; k++) b[free[(k + 1) % free.length]] = before[k];
}

// The squares a player's Nomads travel through, in reading order: the free
// ones and those holding a Nomad of theirs (a hushed one stays put). Empty if
// they have no Nomad that moves.
export function nomadSquares(s, p) {
  const mine = (c) => c && c.player === p && STONES[c.type].wanders && active(s, c);
  if (!s.board.some(mine)) return [];
  return [...Array(9).keys()].filter((i) => !s.board[i] || mine(s.board[i]));
}

function lineOrder(index, dir) {
  const horizontal = dir === 'left' || dir === 'right';
  const idx = horizontal ? rowSquares(index) : colSquares(index);
  return dir === 'right' || dir === 'down' ? idx : idx.slice().reverse();
}

// 2048: every line packs toward one side, stepping over stuck stones, which
// hold their squares. `holdId` is a stone that holds its square this time.
function slideAll(s, dir, holdId) {
  const b = s.board;
  const horizontal = dir === 'left' || dir === 'right';
  for (let i = 0; i < 3; i++) {
    const idx = horizontal ? rowSquares(i) : colSquares(i);
    const cells = (dir === 'right' || dir === 'down' ? idx.slice().reverse() : idx)
      .filter((c) => !isStuck(s, c) && !(holdId !== null && b[c]?.id === holdId));
    const stones = cells.map((c) => b[c]).filter(Boolean);
    cells.forEach((c, k) => { b[c] = stones[k] ?? null; });
  }
}

// ── State ───────────────────────────────────────────────────────────────────

// A stone for a hand: 'shift', or {type, once}.
// `once` is glass: played once, then gone.
const norm = (h) => {
  const o = typeof h === 'string' ? { type: h } : h;
  return { type: o.type, ...(o.once && { once: true }) };
};
// What a stone in hand is, for telling kinds apart: 'shift!' for a glass one.
export const handKey = (h) => h.type + (h.once ? '!' : '');
const selectOf = (h) => ({ stone: h.type, ...(h.once && { once: true }) });
const noMods = () => ({});

export function createGame({
  handX = [], handO = [], first = 'O',
  modsX = noMods(), modsO = noMods(), conds = [], rules = [], log = true,
}) {
  const g = {
    board: Array(9).fill(null),     // {player, type, id} | null
    hands: { X: handX.map(norm), O: handO.map(norm) },
    spent: { X: [], O: [] },        // one-shot stones each side has played from its own hand
    mods: { X: { ...modsX }, O: { ...modsO } },
    conds: [...conds],              // rules for both sides
    rules: [...rules],              // the boss's rules, for O
    first, player: first, phase: 'select',
    placements: { X: 0, O: 0 },
    lastPlaced: { X: null, O: null },
    lastSpecial: { X: null, O: null },
    forced: null,                   // {player, stone}: what must be played next
    dictate: null,                  // {kind, value}: the boss's word for your next turn
    extra: rules.includes('headstart') ? 1 : 0,   // turns the boss still plays twice
    half: false,                    // Double Time: the first of the turn's two stones is down
    selected: null, from: null,     // the stone taken, and whose hand it came from
    placedAt: null, placedId: null,
    over: false, winner: null, reason: null,
    turns: 0, nextId: 1,
    log: log ? [] : null,
  };
  settle(g);
  return g;
}

export function cloneState(s) {
  return {
    board: s.board.map((c) => (c ? { ...c } : null)),
    hands: { X: s.hands.X.map((h) => ({ ...h })), O: s.hands.O.map((h) => ({ ...h })) },
    spent: { X: [...s.spent.X], O: [...s.spent.O] },
    mods: s.mods,                   // never mutated during play
    conds: s.conds, rules: s.rules,
    first: s.first, player: s.player, phase: s.phase,
    placements: { ...s.placements },
    lastPlaced: { X: s.lastPlaced.X && { ...s.lastPlaced.X }, O: s.lastPlaced.O && { ...s.lastPlaced.O } },
    lastSpecial: { ...s.lastSpecial },
    forced: s.forced ? { ...s.forced } : null,
    dictate: s.dictate ? { ...s.dictate } : null,
    extra: s.extra, half: s.half,
    selected: s.selected ? { ...s.selected } : null, from: s.from,
    placedAt: s.placedAt, placedId: s.placedId,
    over: s.over, winner: s.winner, reason: s.reason,
    turns: s.turns, nextId: s.nextId, nomadDone: !!s.nomadDone,
    log: null,
  };
}

const note = (s, msg) => { if (s.log) s.log.push(msg); };

// ── Legal actions ───────────────────────────────────────────────────────────

function selectActions(s) {
  const p = s.player;
  const out = [];
  const seen = new Set();
  // A glass stone is a kind of its own in hand.
  for (const h of s.hands[p]) {
    const key = handKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: 'select', ...selectOf(h) });
  }
  // Open Hands: the other side's stones, Pebbles too, are yours to play.
  if (s.conds.includes('shared')) {
    const theirs = new Set();
    for (const h of s.hands[other(p)]) {
      const key = handKey(h);
      if (theirs.has(key)) continue;
      theirs.add(key);
      out.push({ type: 'select', from: other(p), ...selectOf(h) });
    }
  }
  if (s.forced?.player === p) {
    const f = out.filter((a) => a.stone === s.forced.stone);
    if (f.length) return f;
  }
  return out;
}

// The effect menu of the stone just placed, as it stands now.
function effectOptions(s) {
  const c = s.board[s.placedAt];
  if (!c) return [];
  const st = specOf(c);
  let opts = st.options ? st.options(s, s.placedAt, c) : [];
  // The Spy: the boss named the way your stones move this turn.
  if (c.player === 'X' && s.dictate?.kind === 'spy' && opts.some((o) => o.dir)) {
    const f = opts.filter((o) => o.dir === s.dictate.value);
    if (f.length) opts = f;
  }
  return opts;
}

// The boss's word on your next turn.
function dictateOptions(s) {
  const kind = RULES_DICTATING.find((r) => s.rules.includes(r));
  if (kind === 'tactics') return [...new Set(s.hands.X.map((h) => h.type))].map((value) => ({ type: 'dictate', kind, value }));
  if (kind === 'column') {
    const cols = new Set(freeSquares(s.board).map(col));
    return [...cols].map((value) => ({ type: 'dictate', kind, value }));
  }
  if (kind === 'spy') return DIRS.map((value) => ({ type: 'dictate', kind, value }));
  return [];
}
const RULES_DICTATING = Object.keys(RULES).filter((r) => RULES[r].dictate);

export function legalActions(s) {
  switch (s.phase) {
    case 'select': return selectActions(s);
    case 'place': return allowedSquares(s).map((pos) => ({ type: 'place', pos }));
    case 'effect': return effectOptions(s).map((o) => ({ type: 'effect', ...o }));
    case 'dictate': return dictateOptions(s);
    case 'nomad': return [{ type: 'nomad' }];
    default: return [];
  }
}

// ── Transitions ─────────────────────────────────────────────────────────────

function finish(s, winner, reason) {
  s.over = true;
  s.phase = 'over';
  s.winner = winner;
  s.reason = reason;
}

function endTurn(s) {
  const p = s.player;
  // Nomads first: a step of their own, before lines are counted.
  if (!s.nomadDone && nomadSquares(s, p).length > 1) { s.phase = 'nomad'; return; }
  s.nomadDone = false;
  if (s.forced?.player === p) s.forced = null;
  if (s.conds.includes('gravity')) { slideAll(s, 'down', null); note(s, 'cond:gravity'); }

  if (hasLine(s, p)) return finish(s, p, 'line');
  if (hasLine(s, other(p))) return finish(s, other(p), 'line');

  s.selected = null;
  s.from = null;
  s.placedAt = null;
  s.placedId = null;
  s.phase = 'select';

  // A filled board goes to whoever moved second. Stones that go back to hand
  // could in principle go round forever: forty turns counts as a full board.
  if (s.board.every(Boolean) || s.turns >= 40) return finish(s, s.rules.includes('patient') ? 'O' : other(s.first), 'full');

  // Double Time: every turn is two stones.
  if (s.rules.includes('double') && !s.half) { s.half = true; s.turns++; note(s, 'rule:double'); settle(s); return; }
  s.half = false;
  // The Head Start: the boss's first turn is two.
  if (p === 'O' && s.extra > 0) { s.extra--; s.turns++; note(s, 'rule:headstart'); settle(s); return; }
  // The boss's word lasts one whole turn of yours.
  if (p === 'X') s.dictate = null;

  // A word only when there is a choice to make.
  if (p === 'O' && dictateOptions(s).length > 1) { s.phase = 'dictate'; return; }
  passTurn(s);
}

function passTurn(s) {
  s.player = other(s.player);
  s.turns++;
  s.phase = 'select';
  settle(s);
}

// Stones run out, but nobody is ever stuck: a side whose own hand is empty
// finds a Pebble on its turn (under Open Hands it may still borrow instead).
function settle(s) {
  if (s.over || s.phase !== 'select' || s.hands[s.player].length) return;
  s.hands[s.player].push({ type: 'pebble' });
  note(s, `found:${s.player}`);
}

function afterEffect(s) {
  endTurn(s);
}

// `again`: a Parrot has just become another stone, which acts now.
function afterPlacement(s) {
  const p = s.player, pos = s.placedAt;
  const c = s.board[pos];
  // In line with an enemy Muffle, it does nothing.
  const dud = !active(s, c);
  if (dud && c.type !== 'pebble') note(s, 'silenced');
  s.lastPlaced[p] = { type: c.type };
  if (c.type !== 'pebble') s.lastSpecial[p] = c.type;
  if (dud || !specOf(c).apply) return endTurn(s);

  const opts = effectOptions(s);
  if (!opts.length) return endTurn(s);
  s.phase = 'effect';
  if (opts.length === 1) applyAction(s, { type: 'effect', ...opts[0] });
}

export function applyAction(s, a) {
  if (s.over) throw new Error('duel is over');
  const p = s.player;
  switch (a.type) {
    case 'select': {
      const owner = a.from ?? p;
      const hand = s.hands[owner];
      const k = hand.findIndex((h) => h.type === a.stone && !!h.once === !!a.once);
      if (k < 0) throw new Error(`${owner} holds no ${a.stone}`);
      s.selected = hand.splice(k, 1)[0];
      s.from = a.from ?? null;
      s.phase = 'place';
      break;
    }
    case 'place': {
      const stone = s.selected;
      if ((stone.once || STONES[stone.type].once) && !s.from) s.spent[p].push(stone.type);
      s.placedId = s.nextId++;
      s.board[a.pos] = { player: p, type: stone.type, id: s.placedId };
      s.placedAt = a.pos;
      s.placements[p]++;
      afterPlacement(s);
      break;
    }
    case 'effect': {
      const c = s.board[s.placedAt];
      if (specOf(c).apply(s, s.placedAt, a, c) === 'again') afterPlacement(s);
      else afterEffect(s);
      break;
    }
    case 'nomad': {
      stepAlong(s, nomadSquares(s, p));
      note(s, 'nomad');
      s.nomadDone = true;
      endTurn(s);
      break;
    }
    case 'dictate': {
      s.dictate = { kind: a.kind, value: a.value };
      if (a.kind === 'tactics') s.forced = { player: 'X', stone: a.value };
      note(s, `dictate:${a.kind}:${a.value}`);
      passTurn(s);
      break;
    }
    default: throw new Error(`unknown action ${a.type}`);
  }
  return s;
}

// A compact picture of the board, for tests and tools.
export function render(s) {
  const g = (c) => (c ? (c.player + c.type.slice(0, 3)) : ' .  ');
  let out = '';
  for (let r = 0; r < 3; r++) out += rowSquares(r).map((i) => g(s.board[i])).join(' ') + '\n';
  return out;
}
