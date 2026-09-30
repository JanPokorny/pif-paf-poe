// Pif-paf-poe duel engine, grown out of old/engine.js for the roguelike.
//
// A duel is tic-tac-toe on a 3x3 board where most stones do something when they
// are placed, and what they do is move stones already on the board. You are X,
// the enemy is O. Either may open.
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
//   restrict(square, stonePos, plus) -> does this square satisfy it?
// `immovable` stones are walls for every movement effect.

export const STONES = {};
const def = (id, spec) => { STONES[id] = { id, ...spec }; };

def('pebble', {
  name: 'Pebble', rarity: 'starter', kind: 'plain',
  text: 'Does nothing. Never backfires.',
  plusText: 'Does nothing, and may be placed ignoring the enemy\'s restrictions.',
});

def('shift', {
  name: 'Shift', rarity: 'common', kind: 'move',
  text: 'Slide this stone\'s row or column one step. What falls off the end wraps around.',
  plusText: 'Slide any row or column one step, wrapping around.',
  options(s, pos, cell) {
    const out = [];
    for (const dir of DIRS) {
      const horizontal = dir === 'left' || dir === 'right';
      if (cell.plus) for (let index = 0; index < 3; index++) out.push({ dir, index });
      else out.push({ dir, index: horizontal ? row(pos) : col(pos) });
    }
    return out;
  },
  apply(s, pos, a) { stepAlong(s, lineOrder(a.index, a.dir)); },
});

def('rotate', {
  name: 'Rotate', rarity: 'common', kind: 'move',
  text: 'Turn a 2x2 block this stone is in one step clockwise.',
  plusText: 'Turn a 2x2 block this stone is in one step, either way.',
  options(s, pos, cell) {
    const out = [];
    for (const block of Object.keys(BLOCKS)) {
      if (!BLOCKS[block].includes(pos)) continue;
      out.push({ block, cw: true });
      if (cell.plus) out.push({ block, cw: false });
    }
    return out;
  },
  apply(s, pos, a) {
    const [tl, tr, bl, br] = BLOCKS[a.block];
    stepAlong(s, a.cw ? [tl, tr, br, bl] : [tl, bl, br, tr]);
  },
});

def('magnet', {
  name: 'Magnet', rarity: 'common', kind: 'restrict',
  text: 'The enemy must place next to it.',
  plusText: 'The enemy must place next to it, corners included.',
  restrict: (sq, m, plus) => near(plus)(sq, m),
});

def('stinky', {
  name: 'Stinky', rarity: 'common', kind: 'restrict',
  text: 'The enemy must not place next to it.',
  plusText: 'The enemy must not place next to it, corners included.',
  restrict: (sq, m, plus) => !near(plus)(sq, m),
});

def('mountain', {
  name: 'Mountain', rarity: 'common', kind: 'static', immovable: true,
  text: 'No stone ever moves it: effects happen around it. Tricks can still move it.',
  plusText: 'Nothing ever moves, returns, converts or swaps it — not even a trick.',
});

def('2048', {
  name: '2048', rarity: 'uncommon', kind: 'move',
  text: 'Every stone slides one way as far as it goes, as in the tile game.',
  plusText: 'Every other stone slides one way as far as it goes; this one holds its square.',
  options: () => DIRS.map((dir) => ({ dir })),
  apply(s, pos, a, cell) { slideAll(s, a.dir, cell.plus ? cell.id : null); },
});

def('bumper', {
  name: 'Bumper', rarity: 'uncommon', kind: 'move',
  text: 'Pushes each enemy stone beside it one step directly away. One pushed off the board goes back to their hand.',
  plusText: 'Pushes each enemy stone around it, corners included, one step away. Off the board means back to hand.',
  options: () => [{}],
  apply(s, pos, a, cell) {
    const moves = [];
    for (const dir of cell.plus ? ALL8 : ORTHO) {
      const n = step(pos, dir), beyond = step(pos, dir, 2);
      if (n < 0 || !s.board[n] || s.board[n].player === cell.player || isStuck(s, n)) continue;
      if (beyond < 0) { if (!isSealed(s, n)) moves.push([n, -1]); } else if (!s.board[beyond]) moves.push([n, beyond]);
    }
    for (const [from, to] of moves) if (to < 0) returnToHand(s, from); else move(s, from, to);
  },
});

def('lasso', {
  name: 'Lasso', rarity: 'common', kind: 'move',
  text: 'Every stone two squares away in a straight line, diagonals too, is pulled one step closer.',
  plusText: 'Pull every stone two squares away one step closer — or pick just one of them.',
  options(s, pos, cell) {
    const pulls = lassoPulls(s, pos);
    if (!cell.plus || pulls.length < 2) return [{}];
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
  plusText: 'Trade places with any stone in its row, column or diagonal.',
  options(s, pos, cell) {
    if (isStuck(s, pos)) return [];
    const reach = cell.plus
      ? [...new Set(LINES.filter((l) => l.includes(pos)).flat())].filter((j) => j !== pos)
      : neighbours(pos, true);
    return reach
      .filter((j) => s.board[j] && !isStuck(s, j) && !isSealed(s, j))
      .sort((x, y) => x - y)
      .map((target) => ({ target }));
  },
  apply(s, pos, a) {
    const held = s.board[a.target];
    s.board[a.target] = s.board[pos];
    s.board[pos] = held;
  },
});

def('whirl', {
  name: 'Whirl', rarity: 'uncommon', kind: 'move',
  text: 'The eight outer squares turn one step, either way. The centre stays.',
  plusText: 'The eight outer squares turn one or two steps, either way.',
  options: (s, pos, cell) => (cell.plus
    ? [{ turn: 1 }, { turn: -1 }, { turn: 2 }, { turn: -2 }]
    : [{ turn: 1 }, { turn: -1 }]),
  apply(s, pos, a) {
    const order = a.turn > 0 ? RING : RING.slice().reverse();
    for (let k = 0; k < Math.abs(a.turn); k++) stepAlong(s, order);
  },
});

def('frog', {
  name: 'Frog', rarity: 'uncommon', kind: 'move',
  text: 'Leaps over a stone beside it into the empty square beyond. An enemy stone leapt over goes back to their hand.',
  plusText: 'Leaps like a Frog, diagonals too. An enemy stone leapt over goes back to their hand.',
  options(s, pos, cell) {
    const out = [];
    if (isStuck(s, pos)) return out;
    for (const dir of cell.plus ? ALL8 : ORTHO) {
      const n = step(pos, dir), beyond = step(pos, dir, 2);
      if (beyond >= 0 && s.board[n] && !s.board[beyond]) out.push({ target: beyond });
    }
    return out;
  },
  apply(s, pos, a, cell) {
    const mid = at((row(pos) + row(a.target)) / 2, (col(pos) + col(a.target)) / 2);
    move(s, pos, a.target);
    const jumped = s.board[mid];
    if (jumped && jumped.player !== cell.player && !isSealed(s, mid)) returnToHand(s, mid);
  },
});

def('beacon', {
  name: 'Beacon', rarity: 'uncommon', kind: 'restrict',
  text: 'The enemy must place in its row or column.',
  plusText: 'The enemy must place in its row, column or diagonal.',
  restrict: (sq, m, plus) => row(sq) === row(m) || col(sq) === col(m)
    || (plus && LINES.slice(6).some((l) => l.includes(sq) && l.includes(m))),
});

def('flip', {
  name: 'Flip', rarity: 'uncommon', kind: 'move',
  text: 'Mirror the board across an axis or diagonal. This stone holds its square.',
  plusText: 'Mirror only the enemy\'s stones across an axis or diagonal. Yours hold still.',
  options: () => [{ axis: 'h' }, { axis: 'v' }, { axis: 'd' }, { axis: 'a' }],
  apply(s, pos, a, cell) {
    const pairs = {
      h: [[0, 2], [3, 5], [6, 8]], v: [[0, 6], [1, 7], [2, 8]],
      d: [[1, 3], [2, 6], [5, 7]], a: [[0, 8], [1, 5], [3, 7]],
    }[a.axis];
    const holds = (i) => isStuck(s, i) || (cell && (i === pos || (cell.plus && s.board[i]?.player === cell.player)));
    for (const [x, y] of pairs) {
      if (holds(x) || holds(y)) continue;
      const held = s.board[x];
      s.board[x] = s.board[y];
      s.board[y] = held;
    }
  },
});

def('snare', {
  name: 'Snare', rarity: 'uncommon', kind: 'trap',
  text: 'An enemy stone placed next to it does nothing, ever — no effect, no restriction.',
  plusText: 'An enemy stone placed next to it, corners included, does nothing, ever.',
});

def('hush', {
  name: 'Hush', rarity: 'uncommon', kind: 'curse',
  text: 'The enemy\'s next stone does nothing, ever — no effect, no restriction.',
  plusText: 'The enemy\'s next two stones do nothing, ever.',
  options: () => [{}],
  apply(s, pos, a, cell) {
    const foe = other(cell.player);
    s.silenced[foe] = Math.max(s.silenced[foe], cell.plus ? 2 : 1);
  },
});

def('glue', {
  name: 'Glue', rarity: 'uncommon', kind: 'static',
  text: 'This stone and the stones beside it are stuck: nothing will move them again.',
  plusText: 'This stone and every stone around it, corners included, are stuck.',
  options: () => [{}],
  apply(s, pos, a, cell) {
    s.board[pos].stuck = true;
    for (const j of neighbours(pos, cell.plus)) if (s.board[j] && !guarded(s, j) && !isSealed(s, j)) s.board[j].stuck = true;
  },
});

def('firecracker', {
  name: 'Firecracker', rarity: 'rare', kind: 'move',
  text: 'Blows a stone around it, corners included, back into its owner\'s hand — and burns itself up.',
  plusText: 'Blows every enemy stone beside it back into their hand — and burns itself up.',
  options(s, pos, cell) {
    const hit = neighbours(pos, !cell.plus).filter((j) => s.board[j] && !isSealed(s, j));
    if (cell.plus) return hit.some((j) => s.board[j].player !== cell.player) ? [{}] : [];
    return hit.map((target) => ({ target }));
  },
  apply(s, pos, a, cell) {
    if (a.target !== undefined) returnToHand(s, a.target);
    else for (const j of neighbours(pos, false)) if (s.board[j] && s.board[j].player !== cell.player && !isSealed(s, j)) returnToHand(s, j);
    s.board[pos] = null;
  },
});

def('turncoat', {
  name: 'Turncoat', rarity: 'rare', kind: 'move',
  text: 'Trades sides with an enemy stone beside it: that one becomes yours, this one theirs.',
  plusText: 'Trades sides with an enemy stone around it, corners included.',
  options(s, pos, cell) {
    return neighbours(pos, cell.plus)
      .filter((j) => s.board[j] && s.board[j].player !== cell.player && !isSealed(s, j))
      .map((target) => ({ target }));
  },
  apply(s, pos, a) {
    const mine = s.board[pos], theirs = s.board[a.target];
    [mine.player, theirs.player] = [theirs.player, mine.player];
  },
});

def('parrot', {
  name: 'Parrot', rarity: 'rare', kind: 'copy',
  text: 'Becomes a copy of the last stone the enemy placed, and does what it does.',
  plusText: 'Becomes an upgraded copy of the last stone the enemy placed.',
});

def('twin', {
  name: 'Twin', rarity: 'rare', kind: 'move',
  text: 'If you hold a Pebble, it lands on the square facing this one through the centre, if that is empty.',
  plusText: 'If you hold a Pebble, it lands facing this one through the centre, or on any empty square beside it.',
  options(s, pos, cell) {
    const hand = s.hands[cell.player];
    if (!hand.some((h) => h.type === 'pebble')) return [];
    const out = [];
    for (let j = 0; j < 9; j++) {
      if (!s.board[j] && (j === 8 - pos || (cell.plus && adjacent(j, pos)))) out.push({ target: j });
    }
    return out;
  },
  apply(s, pos, a, cell) {
    const hand = s.hands[cell.player];
    // Spend the plain Pebble first; a Pebble+ is worth keeping for its placement.
    let k = hand.findIndex((h) => h.type === 'pebble' && !h.plus);
    if (k < 0) k = hand.findIndex((h) => h.type === 'pebble');
    const [peb] = hand.splice(k, 1);
    s.board[a.target] = { player: cell.player, type: 'pebble', plus: peb.plus, id: s.nextId++ };
    s.placements[cell.player]++;
  },
});

def('guardian', {
  name: 'Guardian', rarity: 'rare', kind: 'static',
  text: 'It and your stones beside it are safe from the enemy: their stones and tricks cannot move, return, swap or convert them.',
  plusText: 'It and your stones around it, corners included, are safe from anything the enemy does.',
});

export const STONE_TYPES = Object.keys(STONES);

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
      return c && c.player !== p && !isSealed(s, 4) ? [{ pos: 4 }] : [];
    },
    apply(s, p, a) { returnToHand(s, a.pos); },
  },
  relocate: {
    name: 'Relocate', rarity: 'common',
    text: 'Move one of your stones to any empty square.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) {
        if (s.board[i]?.player !== p || isSealed(s, i) || s.board[i].stuck) continue;
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
      const held = (i) => isSealed(s, i) || !!s.board[i]?.stuck;
      return SYMMETRIC.filter(([a, b]) => (s.board[a] || s.board[b])
        && !held(a) && !held(b)).map(([a, b]) => ({ a, b }));
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
    text: 'Name a stone in the enemy\'s hand. That is what they must play next.',
    options(s, p) {
      return [...new Set(s.hands[other(p)].map((h) => h.type))].map((stone) => ({ stone }));
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
    text: 'Glue one of your stones in place: nothing will move it again.',
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
      for (let i = 0; i < 9; i++) if (s.board[i] && s.board[i].player !== p && !isSealed(s, i)) out.push({ pos: i });
      return out;
    },
    apply(s, p, a) { returnToHand(s, a.pos); },
  },
  bribe: {
    name: 'Bribe', rarity: 'rare',
    text: 'An enemy stone off the centre becomes yours.',
    options(s, p) {
      const out = [];
      for (let i = 0; i < 9; i++) {
        if (i !== 4 && s.board[i] && s.board[i].player !== p && !isSealed(s, i)) out.push({ pos: i });
      }
      return out;
    },
    apply(s, p, a) { s.board[a.pos].player = p; },
  },
  reinforce: {
    name: 'Reinforce', rarity: 'common',
    text: 'Put a Pebble+ into your hand.',
    options: () => [{}],
    apply(s, p) { s.hands[p].push({ type: 'pebble', plus: true }); },
  },
};
export const TRICK_TYPES = Object.keys(TRICKS);

// ── Field rules: what a boss does to the board after each of its turns ──────

export const FIELDS = {
  gravity: { name: 'Gravity', text: 'After each of its turns, every stone falls as far down as it can.' },
  carousel: { name: 'Carousel', text: 'After each of its turns, the outer ring turns one step clockwise.' },
  tide: { name: 'Tide', text: 'After each of its turns, the middle row slides one step right, wrapping.' },
  quake: { name: 'Quake', text: 'After each of its turns, the board mirrors left to right. Mountains and stuck stones hold.' },
};

function applyField(s, field) {
  if (field === 'gravity') slideAll(s, 'down', null);
  else if (field === 'carousel') stepAlong(s, RING);
  else if (field === 'tide') stepAlong(s, lineOrder(1, 'right'));
  else if (field === 'quake') STONES.flip.apply(s, 4, { axis: 'h' });
}

// ── Queries ─────────────────────────────────────────────────────────────────

// Is this stone's own type working here? A space switches one type off for both
// players, unless its owner brought Home Turf.
export function active(s, cell) {
  if (cell.hushed) return false;
  return cell.type !== s.disabled || !!s.mods[cell.player].homeTurf;
}

// Stuck stones are walls to every movement effect: Mountains, anything Glued
// or Anchored, and a Guardian's charges against the enemy.
export function isStuck(s, i) {
  const c = s.board[i];
  if (!c) return false;
  if (c.stuck) return true;
  if (guarded(s, i)) return true;
  if (!active(s, c)) return false;
  return !!STONES[c.type].immovable;
}

// Is this stone under a Guardian of its owner's, against whoever is moving?
export function guarded(s, i) {
  const c = s.board[i];
  if (!c || c.player === s.player) return false;
  for (let j = 0; j < 9; j++) {
    const g = s.board[j];
    if (g && g.type === 'guardian' && g.player === c.player && active(s, g) && (j === i || near(g.plus)(j, i))) return true;
  }
  return false;
}

// A Mountain+ refuses more than movement: returns, conversions and tricks too.
export function isSealed(s, i) {
  const c = s.board[i];
  return !!c && ((c.type === 'mountain' && c.plus && active(s, c)) || guarded(s, i));
}

// Does `player` hold a line?
export function hasLine(s, player) {
  const b = s.board;
  const mine = (i) => b[i] && b[i].player === player;
  return LINES.some(([x, y, z]) => mine(x) && mine(y) && mine(z));
}
export function winningLine(s, player) {
  const b = s.board;
  const mine = (i) => b[i] && b[i].player === player;
  return LINES.find(([x, y, z]) => mine(x) && mine(y) && mine(z)) ?? null;
}

const freeSquares = (b) => { const o = []; for (let i = 0; i < 9; i++) if (!b[i]) o.push(i); return o; };

// Every restriction the opponent has on the board pulls at once, and you must
// place where you satisfy as many of them as any square can.
export function restrictionsOn(s, player) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const c = s.board[i];
    if (!c || c.player === player || !active(s, c)) continue;
    if (STONES[c.type].restrict) out.push({ pos: i, st: STONES[c.type], plus: c.plus });
  }
  return out;
}

export function allowedSquares(s, stone = s.selected) {
  const free = freeSquares(s.board);
  const p = s.player;
  if (stone && stone.type === 'pebble' && stone.plus && active(s, { ...stone, player: p })) return free;
  if (s.mods[p].freeFirst && s.placements[p] === 0) return free;
  const rs = restrictionsOn(s, p);
  let pool = free;
  // Velvet Rope: the first enemy stone of a duel may not take the centre.
  if (s.mods[other(p)].velvetRope && s.placements[p] === 0 && pool.length > 1) {
    pool = pool.filter((i) => i !== 4);
  }
  if (!rs.length) return pool;
  const scores = pool.map((i) => rs.reduce((n, r) => n + (r.st.restrict(i, r.pos, r.plus) ? 1 : 0), 0));
  const best = Math.max(...scores);
  return pool.filter((_, k) => scores[k] === best);
}

// ── Movement primitives ─────────────────────────────────────────────────────

function move(s, from, to) {
  s.board[to] = s.board[from];
  s.board[from] = null;
}

function returnToHand(s, i) {
  const c = s.board[i];
  s.hands[c.player].push({ type: c.type, plus: c.plus });
  s.board[i] = null;
}

// Advance every stone one step along `cells`, wrapping from last to first. With
// a stuck stone in the way the cycle breaks into strips: inside a strip a stone
// advances if the square ahead is empty or emptied by the stone ahead of it.
function stepAlong(s, cells) {
  const b = s.board, n = cells.length;
  const wall = cells.map((i) => isStuck(s, i));
  if (!wall.some(Boolean)) {
    const before = cells.map((i) => b[i]);
    for (let k = 0; k < n; k++) b[cells[(k + 1) % n]] = before[k];
    return;
  }
  for (let w = 0; w < n; w++) {
    if (!wall[w]) continue;
    const strip = [];
    for (let k = 1; k < n && !wall[(w + k) % n]; k++) strip.push(cells[(w + k) % n]);
    for (let k = strip.length - 1; k > 0; k--) {
      if (!b[strip[k]] && b[strip[k - 1]]) { b[strip[k]] = b[strip[k - 1]]; b[strip[k - 1]] = null; }
    }
  }
}

function lineOrder(index, dir) {
  const horizontal = dir === 'left' || dir === 'right';
  const idx = horizontal ? rowSquares(index) : colSquares(index);
  return dir === 'right' || dir === 'down' ? idx : idx.slice().reverse();
}

// 2048: every line packs toward one side; walls cut a line into segments that
// each pack on their own. `holdId` is a stone that acts as a wall this time.
function slideAll(s, dir, holdId) {
  const b = s.board;
  const horizontal = dir === 'left' || dir === 'right';
  for (let i = 0; i < 3; i++) {
    const idx = horizontal ? rowSquares(i) : colSquares(i);
    const cells = dir === 'right' || dir === 'down' ? idx.slice().reverse() : idx;
    let seg = [];
    const pack = () => {
      const stones = seg.map((c) => b[c]).filter(Boolean);
      seg.forEach((c, k) => { b[c] = stones[k] ?? null; });
      seg = [];
    };
    for (const c of cells) {
      if (isStuck(s, c) || (holdId !== null && b[c]?.id === holdId)) pack(); else seg.push(c);
    }
    pack();
  }
}

// ── State ───────────────────────────────────────────────────────────────────

const norm = (h) => (typeof h === 'string' ? { type: h.replace(/\+$/, ''), plus: h.endsWith('+') } : { ...h });
const noMods = () => ({});

export function createGame({
  handX, handO, first = 'X', disabled = null,
  tricksX = [], tricksO = [], usesX = 1, usesO = 1,
  modsX = noMods(), modsO = noMods(), field = null, log = true,
}) {
  const s = {
    board: Array(9).fill(null),     // {player, type, plus, id, stuck?} | null
    hands: { X: handX.map(norm), O: handO.map(norm) },
    tricks: { X: [...tricksX], O: [...tricksO] },
    uses: { X: usesX, O: usesO },   // tricks each side may still spend this duel
    mods: { X: { ...modsX }, O: { ...modsO } },
    field,                          // O's field rule, if O is a boss
    disabled,                       // the stone type this space switches off
    first, player: first, phase: 'select',
    silenced: { X: 0, O: 0 },       // how many of their next stones do nothing
    placements: { X: 0, O: 0 },
    lastPlaced: { X: null, O: null },
    echo: { X: !!modsX.echo, O: !!modsO.echo },
    forced: null,                   // {player, stone}: Mind Control's demand
    selected: null,                 // {type, plus} taken from hand
    placedAt: null, placedId: null,
    repeat: false,                  // the effect phase runs again (Echo)
    over: false, winner: null, reason: null,
    turns: 0, nextId: 1,
    log: log ? [] : null,
  };
  return s;
}

export function cloneState(s) {
  return {
    board: s.board.map((c) => (c ? { ...c } : null)),
    hands: { X: s.hands.X.map((h) => ({ ...h })), O: s.hands.O.map((h) => ({ ...h })) },
    tricks: { X: [...s.tricks.X], O: [...s.tricks.O] },
    uses: { ...s.uses },
    mods: s.mods,                   // never mutated during play
    field: s.field, disabled: s.disabled,
    first: s.first, player: s.player, phase: s.phase,
    silenced: { ...s.silenced },
    placements: { ...s.placements },
    lastPlaced: { X: s.lastPlaced.X && { ...s.lastPlaced.X }, O: s.lastPlaced.O && { ...s.lastPlaced.O } },
    echo: { ...s.echo },
    forced: s.forced ? { ...s.forced } : null,
    selected: s.selected ? { ...s.selected } : null,
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
  const seen = new Set(), out = [];
  let hand = s.hands[s.player];
  if (s.forced?.player === s.player && hand.some((h) => h.type === s.forced.stone)) {
    hand = hand.filter((h) => h.type === s.forced.stone);
  }
  for (const h of hand) {
    const key = h.type + (h.plus ? '+' : '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: 'select', stone: h.type, plus: h.plus });
  }
  return out;
}

// The effect menu of the stone just placed, as it stands now.
function effectOptions(s) {
  const c = s.board[s.placedAt];
  if (!c) return [];
  const st = STONES[c.type];
  return st.options ? st.options(s, s.placedAt, c) : [];
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

export function legalActions(s) {
  switch (s.phase) {
    case 'select': return selectActions(s);
    case 'place': return allowedSquares(s).map((pos) => ({ type: 'place', pos }));
    case 'effect': return effectOptions(s).map((o) => ({ type: 'effect', ...o }));
    case 'trick': {
      const t = trickOptions(s);
      return t.length ? [{ type: 'trick', use: 'pass' }, ...t] : [];
    }
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
  if (p === 'O' && s.field) { applyField(s, s.field); note(s, `field:${s.field}`); }

  if (hasLine(s, p)) return finish(s, p, 'line');
  if (hasLine(s, other(p))) return finish(s, other(p), 'line');

  s.player = other(p);
  s.turns++;
  s.selected = null;
  s.placedAt = null;
  s.placedId = null;
  s.phase = 'select';

  const full = s.board.every(Boolean);
  // Stones that return to hand could in principle go round forever: forty
  // turns is a full board's worth four times over, and counts as one.
  if (full || !s.hands[s.player].length || s.turns >= 40) {
    // A filled board, or a player with nothing to play, goes to whoever moved
    // second -- unless exactly one side carries the Hourglass.
    const hx = !!s.mods.X.hourglass, ho = !!s.mods.O.hourglass;
    const winner = hx !== ho ? (hx ? 'X' : 'O') : other(s.first);
    finish(s, winner, full || s.turns >= 40 ? 'full' : 'empty');
  }
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
  if (!active(s, c)) { dud = true; note(s, 'disabled'); }
  // Hushed or snared, a stone does nothing at all -- for as long as it stands:
  // no effect, no restriction, no immovability.
  if (!dud && s.silenced[p] > 0) {
    s.silenced[p]--;
    dud = true;
    c.hushed = true;
    note(s, 'silenced');
  }
  if (!dud && c.type !== 'pebble') {
    for (let j = 0; j < 9; j++) {
      const t = s.board[j];
      if (t && t !== c && t.type === 'snare' && t.player !== p && active(s, t) && near(t.plus)(j, pos)) {
        dud = true;
        c.hushed = true;
        note(s, 'snared');
        break;
      }
    }
  }
  s.lastPlaced[p] = { type: c.type, plus: c.plus };
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
      const hand = s.hands[p];
      const k = hand.findIndex((h) => h.type === a.stone && !!h.plus === !!a.plus);
      if (k < 0) throw new Error(`${p} holds no ${a.stone}${a.plus ? '+' : ''}`);
      s.selected = hand.splice(k, 1)[0];
      s.phase = 'place';
      break;
    }
    case 'place': {
      let stone = s.selected;
      // A Parrot turns into what the enemy placed last, before it does anything.
      if (stone.type === 'parrot' && active(s, { ...stone, player: p })) {
        const last = s.lastPlaced[other(p)];
        if (last && last.type !== 'parrot') {
          stone = { type: last.type, plus: last.plus || stone.plus };
          note(s, `parrot:${stone.type}`);
        }
      }
      s.placedId = s.nextId++;
      s.board[a.pos] = { player: p, type: stone.type, plus: stone.plus, id: s.placedId };
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
    default: throw new Error(`unknown action ${a.type}`);
  }
  return s;
}

// A compact picture of the board, for tests and tools.
export function render(s) {
  const g = (c) => (c ? (c.player + c.type.slice(0, 2) + (c.plus ? '+' : ' ')) : ' .  ');
  let out = '';
  for (let r = 0; r < 3; r++) out += rowSquares(r).map((i) => g(s.board[i])).join(' ') + '\n';
  return out;
}
