// Pif-paf-poe duel engine, grown out of old/engine.js for the roguelike.
//
// A duel is tic-tac-toe on a 3x3 board. Both sides have as many plain Pebbles
// as they like, plus a few special stones that do something when placed --
// mostly move stones already on the board. You are X, the enemy is O, and the
// enemy always opens; a full board goes to you.
//
// Some duels carry a condition for both sides (gravity, no centre, a shared
// hand), and a boss plays only Pebbles but brings a rule of its own.
//
// The state is a plain mutable object: `applyAction` mutates it, `cloneState`
// branches it, and everything else is a pure function of it. The AI and the UI
// run the very same code, so what you see is what the enemy reasons about.
//
// A turn is select -> place -> effect -> trick -> check. Effects and tricks with
// a single possible outcome resolve on their own.

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
export const BLOCKS = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
export const RING = [0, 1, 2, 5, 8, 7, 6, 3];   // the outer ring, clockwise
const SYMMETRIC = [[0, 8], [1, 7], [2, 6], [3, 5]];
export const DIRS = ['up', 'down', 'left', 'right'];
const DELTA = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
  upleft: [-1, -1], upright: [-1, 1], downleft: [1, -1], downright: [1, 1],
};
const ORTHO = ['up', 'down', 'left', 'right'];
const DIAG = ['upleft', 'upright', 'downleft', 'downright'];
const ALL8 = Object.keys(DELTA);

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
//   apply(s, pos, action, cell)
//   restrict(square, stonePos, big, line) -> does this square satisfy it?
// `immovable` stones are walls for every movement effect, and are stepped over.
// An evolved stone (`evolvesTo` on its plain form) shares its plain form's
// hooks with `big` set: the hooks read big(cell) to do more.

export const STONES = {};
const def = (id, spec) => { STONES[id] = { id, ...spec }; };
const big = (cell) => !!STONES[cell.type]?.big;
// An evolved stone: the plain one's hooks, doing more.
function evolved(id, base, spec) {
  const b = STONES[base];
  b.evolvesTo = id;
  STONES[id] = { ...b, id, big: true, evolvesFrom: base, evolvesTo: undefined, ...spec };
}

def('pebble', {
  name: 'Pebble', rarity: 'starter', kind: 'plain',
  text: 'Does nothing. You always have another one.',
});

def('shift', {
  name: 'Shift', rarity: 'common', kind: 'move',
  text: 'Slide this stone\'s row or column one step. What falls off the end wraps around.',
  options(s, pos, cell) {
    const out = [];
    for (const dir of DIRS) {
      const horizontal = dir === 'left' || dir === 'right';
      if (big(cell)) for (let index = 0; index < 3; index++) out.push({ dir, index });
      else out.push({ dir, index: horizontal ? row(pos) : col(pos) });
    }
    return out;
  },
  apply(s, pos, a) { stepAlong(s, lineOrder(a.index, a.dir)); },
});
evolved('rail', 'shift', { name: 'Rail', rarity: 'uncommon', text: 'Slide any row or column one step, wrapping around.' });

def('rotate', {
  name: 'Rotate', rarity: 'common', kind: 'move',
  text: 'Turn a 2x2 block this stone is in one step clockwise.',
  options(s, pos, cell) {
    const out = [];
    for (const block of Object.keys(BLOCKS)) {
      if (!BLOCKS[block].includes(pos)) continue;
      out.push({ block, cw: true });
      if (big(cell)) out.push({ block, cw: false });
    }
    return out;
  },
  apply(s, pos, a) {
    const [tl, tr, bl, br] = BLOCKS[a.block];
    stepAlong(s, a.cw ? [tl, tr, br, bl] : [tl, bl, br, tr]);
  },
});
evolved('pivot', 'rotate', { name: 'Pivot', rarity: 'uncommon', text: 'Turn a 2x2 block this stone is in one step, either way.' });

def('magnet', {
  name: 'Magnet', rarity: 'common', kind: 'restrict',
  text: 'The enemy must place next to it.',
  restrict: (sq, m) => adjacent(sq, m),
});
evolved('electromagnet', 'magnet', { name: 'Electromagnet', rarity: 'uncommon', heavy: true,
  text: 'The enemy must place next to it. It counts twice against other restrictions, and nothing moves it.' });

def('stinky', {
  name: 'Stinky', rarity: 'common', kind: 'restrict',
  text: 'The enemy must not place next to it.',
  restrict: (sq, m) => !adjacent(sq, m),
});
evolved('stench', 'stinky', { name: 'Stench', rarity: 'uncommon', heavy: true,
  text: 'The enemy must not place next to it. It counts twice against other restrictions, and nothing moves it.' });

def('mountain', {
  name: 'Mountain', rarity: 'common', kind: 'static', immovable: true,
  text: 'No stone ever moves it: moving stones step over it. Tricks can still move it.',
});

def('2048', {
  name: '2048', rarity: 'uncommon', kind: 'move',
  text: 'Every stone slides one way as far as it goes, as in the tile game.',
  options: (s, pos, cell) => DIRS.flatMap((dir) => (big(cell) ? [{ dir, hold: false }, { dir, hold: true }] : [{ dir }])),
  apply(s, pos, a, cell) { slideAll(s, a.dir, a.hold ? cell.id : null); },
});
evolved('4096', '2048', { name: '4096', rarity: 'rare', text: 'Every stone slides one way as far as it goes — or every other stone, while this one holds its square.' });

def('bumper', {
  name: 'Bumper', rarity: 'uncommon', kind: 'move',
  text: 'Pushes each enemy stone beside it one step directly away. One pushed off the board goes back to their hand.',
  // Blast: the straight neighbours, or the diagonal ones.
  options: (s, pos, cell) => (big(cell) ? [{ ring: 'ortho' }, { ring: 'diag' }] : [{}]),
  apply(s, pos, a, cell) {
    const moves = [];
    for (const dir of a.ring === 'diag' ? DIAG : ORTHO) {
      const n = step(pos, dir), beyond = step(pos, dir, 2);
      if (n < 0 || !s.board[n] || s.board[n].player === cell.player || isStuck(s, n)) continue;
      if (beyond < 0) moves.push([n, -1]); else if (!s.board[beyond]) moves.push([n, beyond]);
    }
    for (const [from, to] of moves) if (to < 0) returnToHand(s, from); else move(s, from, to);
  },
});
evolved('blast', 'bumper', { name: 'Blast', rarity: 'rare', text: 'Pushes each enemy stone beside it one step away — or each one diagonally off its corners. Off the board means back to hand.' });

def('lasso', {
  name: 'Lasso', rarity: 'common', kind: 'move',
  text: 'Pull a stone two squares away in a straight line, diagonals too, one step closer — or all of them.',
  options(s, pos) {
    const pulls = lassoPulls(s, pos);
    if (pulls.length < 2) return [{}];
    return [{}, ...pulls.map(([from]) => ({ target: from }))];
  },
  apply(s, pos, a) {
    for (const [from, to] of lassoPulls(s, pos)) if (a.target === undefined || a.target === from) move(s, from, to);
  },
});

function lassoPulls(s, pos) {
  const moves = [];
  for (const dir of ALL8) {
    const mid = step(pos, dir), far = step(pos, dir, 2);
    if (far < 0 || !s.board[far] || s.board[mid] || isStuck(s, far)) continue;
    moves.push([far, mid]);
  }
  return moves;
}

def('swap', {
  name: 'Swap', rarity: 'uncommon', kind: 'move',
  text: 'Trade places with a stone around it, corners included.',
  options(s, pos, cell) {
    if (isStuck(s, pos)) return [];
    const reach = big(cell)
      ? [...new Set([...neighbours(pos, true), ...LINES.filter((l) => l.includes(pos)).flat()])].filter((j) => j !== pos)
      : neighbours(pos, true);
    return reach.filter((j) => s.board[j] && !isStuck(s, j)).sort((x, y) => x - y).map((target) => ({ target }));
  },
  apply(s, pos, a) {
    const held = s.board[a.target];
    s.board[a.target] = s.board[pos];
    s.board[pos] = held;
  },
});
evolved('teleport', 'swap', { name: 'Teleport', rarity: 'rare', text: 'Trade places with a stone around it, or anywhere in its row, column or diagonal.' });

def('whirl', {
  name: 'Whirl', rarity: 'uncommon', kind: 'move',
  text: 'The eight outer squares turn one step, either way. The centre stays.',
  options: (s, pos, cell) => (big(cell)
    ? [{ turn: 1 }, { turn: -1 }, { turn: 2 }, { turn: -2 }]
    : [{ turn: 1 }, { turn: -1 }]),
  apply(s, pos, a) {
    const order = a.turn > 0 ? RING : RING.slice().reverse();
    for (let k = 0; k < Math.abs(a.turn); k++) stepAlong(s, order);
  },
});
evolved('cyclone', 'whirl', { name: 'Cyclone', rarity: 'rare', text: 'The eight outer squares turn one or two steps, either way.' });

def('frog', {
  name: 'Frog', rarity: 'uncommon', kind: 'move',
  text: 'Leaps over a stone beside it into the empty square beyond. An enemy stone leapt over goes back to their hand.',
  options(s, pos, cell) {
    const out = [];
    if (isStuck(s, pos)) return out;
    for (const dir of big(cell) ? ALL8 : ORTHO) {
      const n = step(pos, dir), beyond = step(pos, dir, 2);
      if (beyond >= 0 && s.board[n] && !s.board[beyond]) out.push({ target: beyond });
    }
    return out;
  },
  apply(s, pos, a, cell) {
    const mid = at((row(pos) + row(a.target)) / 2, (col(pos) + col(a.target)) / 2);
    move(s, pos, a.target);
    const jumped = s.board[mid];
    if (jumped && jumped.player !== cell.player) returnToHand(s, mid);
  },
});
evolved('kangaroo', 'frog', { name: 'Kangaroo', rarity: 'rare', text: 'Leaps like a Frog, diagonals too. An enemy stone leapt over goes back to their hand.' });

def('beacon', {
  name: 'Beacon', rarity: 'uncommon', kind: 'restrict',
  text: 'Pick its row or its column: the enemy must place there.',
  options(s, pos, cell) {
    const out = [{ line: 'row' }, { line: 'col' }];
    if (big(cell) && pos % 4 === 0) out.push({ line: 'd' });
    if (big(cell) && [2, 4, 6].includes(pos)) out.push({ line: 'a' });
    return out;
  },
  apply(s, pos, a) { s.board[pos].line = a.line; },
  restrict: (sq, m, b, line) => {
    if (line === 'row') return row(sq) === row(m);
    if (line === 'col') return col(sq) === col(m);
    if (line === 'd') return sq % 4 === 0;
    if (line === 'a') return [2, 4, 6].includes(sq);
    return row(sq) === row(m) || col(sq) === col(m);
  },
});
evolved('lighthouse', 'beacon', { name: 'Lighthouse', rarity: 'rare',
  text: 'Pick its row, its column or its diagonal: the enemy must place there.' });

def('flip', {
  name: 'Flip', rarity: 'uncommon', kind: 'move',
  text: 'Mirror the board across an axis or diagonal. This stone holds its square.',
  options: (s, pos, cell) => ['h', 'v', 'd', 'a'].flatMap((axis) => (big(cell) ? [{ axis, only: false }, { axis, only: true }] : [{ axis }])),
  apply(s, pos, a, cell) { mirror(s, a.axis, (i) => isStuck(s, i) || (cell && (i === pos || (a.only && s.board[i]?.player === cell.player)))); },
});
evolved('kaleidoscope', 'flip', { name: 'Kaleidoscope', rarity: 'rare', text: 'Mirror the board across an axis or diagonal — all of it, or only the enemy\'s stones while yours hold still.' });

function mirror(s, axis, holds) {
  const pairs = {
    h: [[0, 2], [3, 5], [6, 8]], v: [[0, 6], [1, 7], [2, 8]],
    d: [[1, 3], [2, 6], [5, 7]], a: [[0, 8], [1, 5], [3, 7]],
  }[axis];
  for (const [x, y] of pairs) {
    if (holds(x) || holds(y)) continue;
    const held = s.board[x];
    s.board[x] = s.board[y];
    s.board[y] = held;
  }
}

def('firecracker', {
  name: 'Firecracker', rarity: 'rare', kind: 'move',
  text: 'Blows a stone around it, corners included, back into its owner\'s hand — and burns itself up.',
  options(s, pos, cell) {
    const out = neighbours(pos, true).filter((j) => s.board[j]).map((target) => ({ target }));
    const volley = neighbours(pos, false).filter((j) => s.board[j] && s.board[j].player !== cell.player);
    if (big(cell) && volley.length > 1) out.push({});
    return out;
  },
  apply(s, pos, a, cell) {
    if (a.target !== undefined) returnToHand(s, a.target);
    else for (const j of neighbours(pos, false)) if (s.board[j] && s.board[j].player !== cell.player) returnToHand(s, j);
    s.board[pos] = null;
  },
});
evolved('bomb', 'firecracker', { name: 'Bomb', rarity: 'rare', text: 'Blows a stone around it back into its owner\'s hand — or every enemy stone beside it at once — and burns itself up.' });

def('turncoat', {
  name: 'Turncoat', rarity: 'rare', kind: 'move',
  text: 'Trades sides with an enemy stone beside it: that one becomes yours, this one theirs.',
  options(s, pos, cell) {
    return neighbours(pos, false).filter((j) => s.board[j] && s.board[j].player !== cell.player).map((target) => ({ target }));
  },
  apply(s, pos, a) {
    const mine = s.board[pos], theirs = s.board[a.target];
    [mine.player, theirs.player] = [theirs.player, mine.player];
  },
});

def('parrot', {
  name: 'Parrot', rarity: 'rare', kind: 'copy',
  text: 'Becomes a copy of the last special stone the enemy placed, and does what it does.',
});

def('twin', {
  name: 'Twin', rarity: 'rare', kind: 'move',
  text: 'A Pebble lands on the square facing this one through the centre, if both that square and the centre are empty.',
  options(s, pos) {
    const j = 8 - pos;
    return j !== pos && !s.board[j] && !s.board[4] ? [{ target: j }] : [];
  },
  apply(s, pos, a, cell) {
    s.board[a.target] = { player: cell.player, type: 'pebble', id: s.nextId++ };
    s.placements[cell.player]++;
  },
});

def('magpie', {
  name: 'Magpie', rarity: 'rare', kind: 'curse',
  text: 'Steals a special stone of your choice from the enemy\'s hand into yours.',
  options(s, pos, cell) {
    return [...new Set(s.hands[other(cell.player)].map((h) => h.type))].map((stone) => ({ stone }));
  },
  apply(s, pos, a, cell) {
    const hand = s.hands[other(cell.player)];
    const [taken] = hand.splice(hand.findIndex((h) => h.type === a.stone), 1);
    s.hands[cell.player].push({ type: taken.type });
  },
});

export const STONE_TYPES = Object.keys(STONES);
// Stones you can find: everything but the Pebble and the evolved forms.
export const BASE_STONES = STONE_TYPES.filter((t) => t !== 'pebble' && !STONES[t].evolvesFrom);

// ── Tricks ──────────────────────────────────────────────────────────────────
//
// Tricks are spent at the end of your own turn, after your stone has resolved
// and before the check for three in a row, so any of them can finish a line.

export const TRICKS = {
  overtake: {
    name: 'Overtake', rarity: 'common',
    text: 'If the enemy holds the centre, that stone goes back to their hand.',
    options(s, p) {
      const c = s.board[4];
      return c && c.player !== p ? [{ pos: 4 }] : [];
    },
    apply(s, p, a) { returnToHand(s, a.pos); },
  },
  relocate: {
    name: 'Relocate', rarity: 'common',
    text: 'Move one of your stones to any empty square.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) {
        if (s.board[i]?.player !== p || s.board[i].stuck) continue;
        for (let to = 0; to < 9; to++) if (!s.board[to]) out.push({ from: i, to });
      }
      return out;
    },
    apply(s, p, a) { move(s, a.from, a.to); },
  },
  mirror: {
    name: 'Mirror', rarity: 'common',
    text: 'Swap what stands on two squares facing each other through the centre.',
    options(s) {
      const held = (i) => !!s.board[i]?.stuck;
      return SYMMETRIC.filter(([a, b]) => (s.board[a] || s.board[b]) && !held(a) && !held(b)).map(([a, b]) => ({ a, b }));
    },
    apply(s, p, t) {
      const held = s.board[t.a];
      s.board[t.a] = s.board[t.b];
      s.board[t.b] = held;
    },
  },
  nudge: {
    name: 'Nudge', rarity: 'common',
    text: 'Move any stone one step into an empty square beside it.',
    options(s) {
      const out = [];
      for (let i = 0; i < 9; i++) {
        if (!s.board[i] || isStuck(s, i)) continue;
        for (let to = 0; to < 9; to++) if (!s.board[to] && adjacent(i, to)) out.push({ from: i, to });
      }
      return out;
    },
    apply(s, p, a) { move(s, a.from, a.to); },
  },
  'mind-control': {
    name: 'Mind Control', rarity: 'uncommon',
    text: 'Name a stone for the enemy — one of theirs, or a Pebble. That is what they must play next.',
    options(s, p) {
      return ['pebble', ...new Set(s.hands[other(p)].map((h) => h.type))].map((stone) => ({ stone }));
    },
    apply(s, p, a) { s.forced = { player: other(p), stone: a.stone }; },
  },
  rehearse: {
    name: 'Rehearse', rarity: 'uncommon',
    text: 'One of your stones on the board does its thing again, from where it stands.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) {
        const c = s.board[i];
        if (c?.player !== p || !active(s, c)) continue;
        const st = STONES[c.type];
        if (!st.apply || st.id === 'twin') continue;
        for (const o of st.options(s, i, c)) out.push({ pos: i, ...o });
      }
      return out;
    },
    apply(s, p, a) {
      const c = s.board[a.pos];
      STONES[c.type].apply(s, a.pos, a, c);
    },
  },
  muffle: {
    name: 'Muffle', rarity: 'common',
    text: 'The enemy\'s next stone does nothing.',
    options: (s, p) => (s.silenced[other(p)] ? [] : [{}]),
    apply(s, p) { s.silenced[other(p)] = 1; },
  },
  anchor: {
    name: 'Anchor', rarity: 'common',
    text: 'Fix one of your stones in place: nothing will move it again.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) if (s.board[i]?.player === p && !isStuck(s, i)) out.push({ pos: i });
      return out;
    },
    apply(s, p, a) { s.board[a.pos].stuck = true; },
  },
  pluck: {
    name: 'Pluck', rarity: 'rare',
    text: 'Any enemy stone goes back to their hand.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) if (s.board[i] && s.board[i].player !== p) out.push({ pos: i });
      return out;
    },
    apply(s, p, a) { returnToHand(s, a.pos); },
  },
  bribe: {
    name: 'Bribe', rarity: 'rare',
    text: 'An enemy stone off the centre becomes yours.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) if (i !== 4 && s.board[i] && s.board[i].player !== p) out.push({ pos: i });
      return out;
    },
    apply(s, p, a) { s.board[a.pos].player = p; },
  },
  reinforce: {
    name: 'Encore', rarity: 'common',
    text: 'The last special stone you played comes back into your hand.',
    options: (s, p) => (s.lastSpecial[p] ? [{}] : []),
    apply(s, p) { s.hands[p].push({ type: s.lastSpecial[p] }); s.lastSpecial[p] = null; },
  },
};
export const TRICK_TYPES = Object.keys(TRICKS);

// ── Conditions: a duel's rule for both sides ────────────────────────────────

export const CONDS = {
  gravity: { name: 'Gravity', text: 'After every turn, every stone falls as far down as it can. Mountains hold, and are stepped over.' },
  nocentre: { name: 'Hollow', text: 'Nobody may place on the centre square.' },
  shared: { name: 'Open Hands', text: 'Either side may play a special stone from the other\'s hand; it counts as the player\'s own.' },
};

// ── Boss rules: a boss plays only Pebbles, but brings one of these ───────────

export const RULES = {
  tactics: { name: 'Tactics', text: 'Before each of your turns, the boss picks which stone you must play.', dictate: true },
  headstart: { name: 'Head Start', text: 'The boss plays twice on its first turn.' },
  elko: { name: 'Elbow', text: 'Rows do not count: whoever makes an L of three — a 2×2 block missing one square — wins.' },
  clinch: { name: 'Clinch', text: 'You must place next to one of the boss\'s stones, if you can.' },
  column: { name: 'Column', text: 'Before each of your turns, the boss closes a column: you may not place in it.', dictate: true },
  spy: { name: 'Spy', text: 'Before each of your turns, the boss picks the direction your stones must move.', dictate: true },
  patient: { name: 'Patience', text: 'A full board goes to the boss.' },
  reserved: { name: 'Reserved', text: 'You may not place on the centre square. The boss may.' },
};

// Winning shapes: lines of three, or under the Elbow, L-shapes of three.
export const ELS = Object.values(BLOCKS).flatMap((b) => b.map((skip) => b.filter((x) => x !== skip)));
const shapesOf = (s) => (s.rules.includes('elko') ? ELS : LINES);

// ── Queries ─────────────────────────────────────────────────────────────────

// A stone does its thing unless something has hushed it.
export function active(s, cell) { return !cell.hushed; }

// Stuck stones are walls to every movement effect -- Mountains, Electromagnets,
// Lighthouses and anything anchored -- and moving stones step over them.
export function isStuck(s, i) {
  const c = s.board[i];
  if (!c) return false;
  if (c.stuck) return true;
  if (!active(s, c)) return false;
  return !!STONES[c.type].immovable || !!STONES[c.type].heavy;
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
    const st = STONES[c.type];
    if (st.restrict) out.push({ pos: i, st, big: big(c), line: c.line, w: st.heavy ? 2 : 1 });
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
    if (s.rules.includes('clinch')) narrow((i) => s.board.some((c, j) => c && c.player === 'O' && adjacent(i, j)));
    if (s.dictate?.kind === 'column') narrow((i) => col(i) !== s.dictate.value);
  }
  if (s.mods[p].freeFirst && s.placements[p] === 0) return pool;
  const rs = restrictionsOn(s, p);
  if (!rs.length) return pool;
  const scores = pool.map((i) => rs.reduce((n, r) => n + (r.st.restrict(i, r.pos, r.big, r.line) ? r.w : 0), 0));
  const best = Math.max(...scores);
  return pool.filter((_, k) => scores[k] === best);
}

// ── Movement primitives ─────────────────────────────────────────────────────

function move(s, from, to) {
  s.board[to] = s.board[from];
  s.board[from] = null;
}

// Back into its owner's hand -- or, for a Pebble, simply off the board.
function returnToHand(s, i) {
  const c = s.board[i];
  if (c.type !== 'pebble') s.hands[c.player].push({ type: c.type });
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

const norm = (h) => ({ type: typeof h === 'string' ? h : h.type });
const noMods = () => ({});

export function createGame({
  handX = [], handO = [], first = 'O',
  tricksX = [], tricksO = [], usesX = 1, usesO = 1,
  modsX = noMods(), modsO = noMods(), conds = [], rules = [], log = true,
}) {
  return {
    board: Array(9).fill(null),     // {player, type, id, stuck?, line?, hushed?} | null
    hands: { X: handX.map(norm).filter((h) => h.type !== 'pebble'), O: handO.map(norm).filter((h) => h.type !== 'pebble') },
    tricks: { X: [...tricksX], O: [...tricksO] },
    uses: { X: usesX, O: usesO },   // tricks each side may still spend this duel
    mods: { X: { ...modsX }, O: { ...modsO } },
    conds: [...conds],              // rules for both sides
    rules: [...rules],              // the boss's rules, for O
    first, player: first, phase: 'select',
    silenced: { X: 0, O: 0 },       // how many of their next stones do nothing
    placements: { X: 0, O: 0 },
    lastPlaced: { X: null, O: null },
    lastSpecial: { X: null, O: null },
    echo: { X: !!modsX.echo, O: !!modsO.echo },
    forced: null,                   // {player, stone}: what must be played next
    dictate: null,                  // {kind, value}: the boss's word for your next turn
    extra: rules.includes('headstart') ? 1 : 0,   // turns the boss still plays twice
    selected: null, from: null,     // the stone taken, and whose hand it came from
    placedAt: null, placedId: null,
    repeat: false,                  // the effect phase runs again (Echo)
    over: false, winner: null, reason: null,
    turns: 0, nextId: 1,
    log: log ? [] : null,
  };
}

export function cloneState(s) {
  return {
    board: s.board.map((c) => (c ? { ...c } : null)),
    hands: { X: s.hands.X.map((h) => ({ ...h })), O: s.hands.O.map((h) => ({ ...h })) },
    tricks: { X: [...s.tricks.X], O: [...s.tricks.O] },
    uses: { ...s.uses },
    mods: s.mods,                   // never mutated during play
    conds: s.conds, rules: s.rules,
    first: s.first, player: s.player, phase: s.phase,
    silenced: { ...s.silenced },
    placements: { ...s.placements },
    lastPlaced: { X: s.lastPlaced.X && { ...s.lastPlaced.X }, O: s.lastPlaced.O && { ...s.lastPlaced.O } },
    lastSpecial: { ...s.lastSpecial },
    echo: { ...s.echo },
    forced: s.forced ? { ...s.forced } : null,
    dictate: s.dictate ? { ...s.dictate } : null,
    extra: s.extra,
    selected: s.selected ? { ...s.selected } : null, from: s.from,
    placedAt: s.placedAt, placedId: s.placedId,
    repeat: s.repeat,
    over: s.over, winner: s.winner, reason: s.reason,
    turns: s.turns, nextId: s.nextId,
    log: null,
  };
}

const note = (s, msg) => { if (s.log) s.log.push(msg); };

// ── Legal actions ───────────────────────────────────────────────────────────

function selectActions(s) {
  const p = s.player;
  const out = [{ type: 'select', stone: 'pebble' }];
  const seen = new Set();
  for (const h of s.hands[p]) {
    if (seen.has(h.type)) continue;
    seen.add(h.type);
    out.push({ type: 'select', stone: h.type });
  }
  // Open Hands: the other side's specials are yours to play too.
  if (s.conds.includes('shared')) {
    const theirs = new Set();
    for (const h of s.hands[other(p)]) {
      if (theirs.has(h.type)) continue;
      theirs.add(h.type);
      out.push({ type: 'select', stone: h.type, from: other(p) });
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
  const st = STONES[c.type];
  let opts = st.options ? st.options(s, s.placedAt, c) : [];
  // The Spy: the boss named the way your stones move this turn.
  if (c.player === 'X' && s.dictate?.kind === 'spy' && opts.some((o) => o.dir)) {
    const f = opts.filter((o) => o.dir === s.dictate.value);
    if (f.length) opts = f;
  }
  return opts;
}

function trickOptions(s) {
  const p = s.player;
  const out = [];
  if (s.uses[p] <= 0) return out;
  const seen = new Set();
  s.tricks[p].forEach((name) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const o of TRICKS[name].options(s, p)) out.push({ type: 'trick', use: name, ...o });
  });
  return out;
}

// The boss's word on your next turn.
function dictateOptions(s) {
  const kind = RULES_DICTATING.find((r) => s.rules.includes(r));
  if (kind === 'tactics') return ['pebble', ...new Set(s.hands.X.map((h) => h.type))].map((value) => ({ type: 'dictate', kind, value }));
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
    case 'trick': {
      const t = trickOptions(s);
      return t.length ? [{ type: 'trick', use: 'pass' }, ...t] : [];
    }
    case 'dictate': return dictateOptions(s);
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
  if (s.forced?.player === p) s.forced = null;
  if (p === 'X') s.dictate = null;
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

  // The Head Start: the boss's first turn is two.
  if (p === 'O' && s.extra > 0) { s.extra--; s.turns++; note(s, 'rule:headstart'); return; }

  if (p === 'O' && dictateOptions(s).length) { s.phase = 'dictate'; return; }
  passTurn(s);
}

function passTurn(s) {
  s.player = other(s.player);
  s.turns++;
  s.phase = 'select';
}

function toTrickPhase(s) {
  s.phase = 'trick';
  if (!trickOptions(s).length) endTurn(s);
}

function afterEffect(s) {
  const c = s.board.find((x) => x?.id === s.placedId);
  // Echo Chamber: the first stone of the duel that resolved something does it
  // again, from wherever it now stands.
  if (!s.repeat && s.echo[s.player] && c && STONES[c.type].apply) {
    s.echo[s.player] = false;
    s.placedAt = s.board.indexOf(c);
    s.repeat = true;
    if (effectOptions(s).length) {
      note(s, 'echo');
      s.phase = 'effect';
      const opts = effectOptions(s);
      if (opts.length === 1) return applyAction(s, { type: 'effect', ...opts[0] });
      return;
    }
  }
  s.repeat = false;
  toTrickPhase(s);
}

function afterPlacement(s) {
  const p = s.player, pos = s.placedAt;
  const c = s.board[pos];
  let dud = false;
  // Muffled, a stone does nothing at all for as long as it stands.
  if (s.silenced[p] > 0 && c.type !== 'pebble') {
    s.silenced[p]--;
    dud = true;
    c.hushed = true;
    note(s, 'silenced');
  }
  s.lastPlaced[p] = { type: c.type };
  if (c.type !== 'pebble') s.lastSpecial[p] = c.type;
  if (dud || !STONES[c.type].apply) return toTrickPhase(s);

  const opts = effectOptions(s);
  if (!opts.length) return toTrickPhase(s);
  s.phase = 'effect';
  if (opts.length === 1) applyAction(s, { type: 'effect', ...opts[0] });
}

export function applyAction(s, a) {
  if (s.over) throw new Error('duel is over');
  const p = s.player;
  switch (a.type) {
    case 'select': {
      if (a.stone === 'pebble') {
        s.selected = { type: 'pebble' };
      } else {
        const owner = a.from ?? p;
        const hand = s.hands[owner];
        const k = hand.findIndex((h) => h.type === a.stone);
        if (k < 0) throw new Error(`${owner} holds no ${a.stone}`);
        s.selected = hand.splice(k, 1)[0];
      }
      s.from = a.from ?? null;
      s.phase = 'place';
      break;
    }
    case 'place': {
      let stone = s.selected;
      // A Parrot turns into what the enemy last placed, before it does anything.
      if (stone.type === 'parrot') {
        const last = s.lastSpecial[other(p)];
        if (last && last !== 'parrot') {
          stone = { type: last };
          note(s, `parrot:${stone.type}`);
        }
      }
      s.placedId = s.nextId++;
      s.board[a.pos] = { player: p, type: stone.type, id: s.placedId };
      s.placedAt = a.pos;
      s.placements[p]++;
      afterPlacement(s);
      break;
    }
    case 'effect': {
      const c = s.board[s.placedAt];
      STONES[c.type].apply(s, s.placedAt, a, c);
      afterEffect(s);
      break;
    }
    case 'trick': {
      if (a.use !== 'pass') {
        const k = s.tricks[p].indexOf(a.use);
        s.tricks[p].splice(k, 1);
        s.uses[p]--;
        TRICKS[a.use].apply(s, p, a);
        note(s, `trick:${a.use}`);
        // More than one trick a turn is allowed if you have the uses for it.
        if (s.uses[p] > 0 && trickOptions(s).length && !hasLine(s, p)) { s.phase = 'trick'; break; }
      }
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
