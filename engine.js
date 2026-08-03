// Pif-paf-poe rules engine. See RULES.md. No dependencies; runs on Deno as-is.
//
// The state machine is a small mutable object. `applyAction` mutates in place,
// which is what a search wants; use `cloneState` to branch. Everything else is a
// pure function of the state.
//
//   import { createGame, legalActions, applyAction } from './engine.js';
//
//   const g = createGame({ handX: [...], handO: [...], first: 'X' });
//   while (!g.over) applyAction(g, pickOne(legalActions(g)));
//   g.winner;  // 'X' | 'O' | null (draw)

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const SUBSQUARES = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
const DIRECTIONS = ['up', 'down', 'left', 'right'];

export const STONE_TYPES = [
  'regular',
  'shift', '2048', 'rotate', 'swap',   // movement
  'mimic', 'leech',                    // reactive
  'glue', 'mountain',                  // static
  'magnet', 'stinky',                  // restriction
];

// Stones that resolve something after being placed. Mimic only does if it finds
// an effect to borrow, Leech only if it landed next to an enemy stone.
const EFFECT_TYPES = ['shift', '2048', 'rotate', 'swap', 'leech', 'mimic'];
// What Mimic can borrow. It is not in the list itself, so copies never chain.
const MIMIC_COPIES = ['shift', '2048', 'rotate', 'swap', 'leech'];
const RESTRICTION_TYPES = ['magnet', 'stinky'];

const TYPE_CODE = {
  regular: 'rg', shift: 'sh', '2048': '20', rotate: 'ro', swap: 'sw',
  mimic: 'mi', leech: 'le', glue: 'gl', mountain: 'mo', magnet: 'mg', stinky: 'sk',
};

// ── Geometry ────────────────────────────────────────────────────────────────

export function other(player) { return player === 'X' ? 'O' : 'X'; }
const row = (i) => (i / 3) | 0;
const col = (i) => i % 3;

export function adjacent(a, b) {
  return Math.abs(row(a) - row(b)) + Math.abs(col(a) - col(b)) === 1;
}

const rowSquares = (r) => [r * 3, r * 3 + 1, r * 3 + 2];
const colSquares = (c) => [c, c + 3, c + 6];

export function hasLine(board, player) {
  return LINES.some(([a, b, c]) =>
    board[a]?.player === player && board[b]?.player === player && board[c]?.player === player);
}

function isFull(board) { return board.every((cell) => cell !== null); }
function freeSquares(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (!board[i]) out.push(i);
  return out;
}

// ── State ───────────────────────────────────────────────────────────────────

export function createGame({ handX, handO, first = 'X' }) {
  for (const t of [...handX, ...handO]) {
    if (!STONE_TYPES.includes(t)) throw new Error(`unknown stone type: ${t}`);
  }
  const state = {
    board: Array(9).fill(null),      // {player, type, id} | null
    hands: { X: [...handX], O: [...handO] },
    player: first,                   // whose turn it is
    phase: 'select',                 // 'return' | 'select' | 'place' | 'effect' | 'over'
    restriction: null,               // {type, pos, owner} imposed on the other player
    lastPlaced: { X: null, O: null },// stone type each player placed last turn (Mimic)
    selected: null,                  // stone type taken from hand, awaiting placement
    placedAt: null,                  // where it was placed, awaiting its effect
    borrowed: null,                  // effect a Mimic is resolving this turn
    seen: new Set(),                 // positions already reached, for the repetition rule
    over: false,
    winner: null,
    reason: null,                    // 'line' | 'repetition' | 'stuck' | 'nostones'
    turns: 0,
    nextId: 1,
  };
  state.seen.add(positionKey(state));
  return state;
}

export function cloneState(s) {
  return {
    board: s.board.map((c) => (c ? { player: c.player, type: c.type, id: c.id } : null)),
    hands: { X: [...s.hands.X], O: [...s.hands.O] },
    player: s.player,
    phase: s.phase,
    restriction: s.restriction ? { ...s.restriction } : null,
    lastPlaced: { ...s.lastPlaced },
    selected: s.selected,
    placedAt: s.placedAt,
    borrowed: s.borrowed,
    seen: new Set(s.seen),
    over: s.over,
    winner: s.winner,
    reason: s.reason,
    turns: s.turns,
    nextId: s.nextId,
  };
}

// Board contents + active restriction + what was played last turn. Mimic reads
// the last-placed types, so two positions that differ only there are genuinely
// different positions.
export function positionKey(s) {
  let key = '';
  for (let i = 0; i < 9; i++) {
    const c = s.board[i];
    key += c ? c.player + TYPE_CODE[c.type] : '..';
  }
  key += '|';
  if (s.restriction) key += `${s.restriction.type[0]}${s.restriction.pos}${s.restriction.owner}`;
  key += `|${s.lastPlaced.X ?? '-'}/${s.lastPlaced.O ?? '-'}`;
  return key;
}

// ── Immobility ──────────────────────────────────────────────────────────────

export function isStuck(board, i) {
  const cell = board[i];
  if (!cell) return false;
  if (cell.type === 'mountain' || cell.type === 'glue') return true;
  for (let j = 0; j < 9; j++) {
    if (board[j]?.type === 'glue' && adjacent(i, j)) return true;
  }
  return false;
}

function anyStuck(board) {
  for (let i = 0; i < 9; i++) if (isStuck(board, i)) return true;
  return false;
}

// Effects permute the board's references, so "did this stone move" is an identity
// check. Stuckness is judged before the effect.
function wouldMoveStuck(s, action) {
  if (!anyStuck(s.board)) return false;
  const after = s.board.slice();
  resolveOnto(after, effectType(s), s.placedAt, action);
  for (let i = 0; i < 9; i++) {
    if (isStuck(s.board, i) && after[i] !== s.board[i]) return true;
  }
  return false;
}

// ── Effects ─────────────────────────────────────────────────────────────────

function applyShift(board, pos, dir) {
  const horizontal = dir === 'left' || dir === 'right';
  const idx = horizontal ? rowSquares(row(pos)) : colSquares(col(pos));
  const before = idx.map((i) => board[i]);
  const step = dir === 'right' || dir === 'down' ? 2 : 1;
  for (let i = 0; i < 3; i++) board[idx[i]] = before[(i + step) % 3];
}

function apply2048(board, dir) {
  const horizontal = dir === 'left' || dir === 'right';
  const toFarEnd = dir === 'right' || dir === 'down';
  for (let i = 0; i < 3; i++) {
    const idx = horizontal ? rowSquares(i) : colSquares(i);
    const stones = idx.map((j) => board[j]).filter((c) => c !== null);
    const packed = Array(3).fill(null);
    for (let j = 0; j < stones.length; j++) {
      packed[toFarEnd ? 3 - stones.length + j : j] = stones[j];
    }
    for (let j = 0; j < 3; j++) board[idx[j]] = packed[j];
  }
}

function applyRotate(board, square) {
  const [tl, tr, bl, br] = SUBSQUARES[square];
  const before = [board[tl], board[tr], board[bl], board[br]];
  board[tr] = before[0];
  board[br] = before[1];
  board[tl] = before[2];
  board[bl] = before[3];
}

function applySwap(board, pos, axis, index) {
  const own = axis === 'row' ? rowSquares(row(pos)) : colSquares(col(pos));
  const target = axis === 'row' ? rowSquares(index) : colSquares(index);
  for (let i = 0; i < 3; i++) {
    const tmp = board[own[i]];
    board[own[i]] = board[target[i]];
    board[target[i]] = tmp;
  }
}

function applyLeech(board, pos, target) {
  const tmp = board[target];
  board[target] = board[pos];
  board[pos] = tmp;
}

// The single place an effect is resolved, shared by the real move, the
// immobility veto and any lookahead, so they cannot disagree.
function resolveOnto(board, type, pos, action) {
  switch (type) {
    case 'shift': return applyShift(board, pos, action.direction);
    case '2048': return apply2048(board, action.direction);
    case 'rotate': return applyRotate(board, action.square);
    case 'swap': return applySwap(board, pos, action.axis, action.index);
    case 'leech': return applyLeech(board, pos, action.target);
  }
}

// The effect being resolved this turn: Mimic borrows, everything else uses its own.
function effectType(s) { return s.borrowed ?? s.selected; }

// ── Legal actions ───────────────────────────────────────────────────────────

function returnActions(s) {
  const opponent = other(s.player);
  const mine = [];
  for (let i = 0; i < 9; i++) if (s.board[i]?.player === opponent) mine.push(i);

  // A restriction the opponent placed on us still binds; if freeing one of their
  // squares would let us satisfy it, we must free one of those.
  const r = s.restriction;
  if (r && r.owner === opponent) {
    const notTheCause = mine.filter((i) => i !== r.pos);
    const helpful = notTheCause.filter((i) =>
      r.type === 'magnet' ? adjacent(i, r.pos) : !adjacent(i, r.pos));
    const pool = helpful.length ? helpful : notTheCause.length ? notTheCause : mine;
    return pool.map((pos) => ({ type: 'return', pos }));
  }
  return mine.map((pos) => ({ type: 'return', pos }));
}

function selectActions(s) {
  return [...new Set(s.hands[s.player])].map((stone) => ({ type: 'select', stone }));
}

function placeActions(s) {
  let free = freeSquares(s.board);

  const r = s.restriction;
  if (r && r.owner === other(s.player)) {
    const allowed = free.filter((i) =>
      r.type === 'magnet' ? adjacent(i, r.pos) : !adjacent(i, r.pos));
    if (allowed.length) free = allowed;
  }

  // Leech wants to land next to an enemy stone. The opponent's restriction
  // outranks that, and the requirement relaxes rather than blocking the stone.
  if (s.selected === 'leech') {
    const opponent = other(s.player);
    const beside = free.filter((i) =>
      s.board.some((c, j) => c?.player === opponent && adjacent(i, j)));
    if (beside.length) free = beside;
  }

  return free.map((pos) => ({ type: 'place', pos }));
}

function effectActions(s) {
  const type = effectType(s);
  const pos = s.placedAt;
  let out = [];

  if (type === 'shift' || type === '2048') {
    out = DIRECTIONS.map((direction) => ({ type: 'effect', direction }));
  } else if (type === 'rotate') {
    out = Object.keys(SUBSQUARES)
      .filter((k) => SUBSQUARES[k].includes(pos))
      .map((square) => ({ type: 'effect', square }));
  } else if (type === 'swap') {
    for (let i = 0; i < 3; i++) {
      if (i !== row(pos)) out.push({ type: 'effect', axis: 'row', index: i });
      if (i !== col(pos)) out.push({ type: 'effect', axis: 'col', index: i });
    }
  } else if (type === 'leech') {
    const opponent = other(s.player);
    for (let i = 0; i < 9; i++) {
      if (s.board[i]?.player === opponent && adjacent(i, pos)) {
        out.push({ type: 'effect', target: i });
      }
    }
  }

  return out.filter((a) => !wouldMoveStuck(s, a));
}

export function legalActions(s) {
  switch (s.phase) {
    case 'return': return returnActions(s);
    case 'select': return selectActions(s);
    case 'place': return placeActions(s);
    case 'effect': return effectActions(s);
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

// Restriction bookkeeping and the three terminal checks, in the order RULES.md
// gives them. Returns true if the game ended.
function endTurn(s) {
  const player = s.player;
  s.lastPlaced[player] = s.selected;

  if (RESTRICTION_TYPES.includes(s.selected)) {
    s.restriction = { type: s.selected, pos: s.placedAt, owner: player };
  } else if (s.restriction?.owner === other(player)) {
    s.restriction = null;   // it bound us for this turn and is now spent
  }

  const key = positionKey(s);
  if (s.seen.has(key)) { finish(s, other(player), 'repetition'); return true; }
  s.seen.add(key);

  if (hasLine(s.board, player)) { finish(s, player, 'line'); return true; }
  if (hasLine(s.board, other(player))) { finish(s, other(player), 'line'); return true; }

  s.player = other(player);
  s.turns++;
  s.selected = null;
  s.placedAt = null;
  s.borrowed = null;
  s.phase = isFull(s.board) ? 'return' : 'select';

  // Nothing legal to do is a draw rather than a loss.
  if (s.phase === 'return' && !returnActions(s).length) { finish(s, null, 'stuck'); return true; }
  if (s.phase === 'select' && !s.hands[s.player].length) { finish(s, null, 'nostones'); return true; }
  return false;
}

function afterPlacement(s) {
  s.borrowed = null;

  if (s.selected === 'mimic') {
    const copied = s.lastPlaced[other(s.player)];
    if (!copied || !MIMIC_COPIES.includes(copied)) { endTurn(s); return; }
    s.borrowed = copied;
  }

  if (!EFFECT_TYPES.includes(effectType(s))) { endTurn(s); return; }

  // Every option vetoed by a stuck stone, or a Leech with nothing to grab: the
  // stone is placed and resolves nothing.
  s.phase = 'effect';
  if (!effectActions(s).length) endTurn(s);
}

export function applyAction(s, action) {
  if (s.over) throw new Error('game is over');

  switch (action.type) {
    case 'return': {
      const stone = s.board[action.pos];
      s.board[action.pos] = null;
      s.hands[stone.player].push(stone.type);
      s.phase = 'select';
      break;
    }
    case 'select': {
      const hand = s.hands[s.player];
      const at = hand.indexOf(action.stone);
      if (at < 0) throw new Error(`${s.player} does not hold a ${action.stone}`);
      hand.splice(at, 1);
      s.selected = action.stone;
      s.phase = 'place';
      break;
    }
    case 'place': {
      s.board[action.pos] = { player: s.player, type: s.selected, id: s.nextId++ };
      s.placedAt = action.pos;
      afterPlacement(s);
      break;
    }
    case 'effect': {
      resolveOnto(s.board, effectType(s), s.placedAt, action);
      endTurn(s);
      break;
    }
    default:
      throw new Error(`unknown action: ${action.type}`);
  }
  return s;
}

// Convenience for tools and tests: a compact picture of the board.
export function render(s) {
  const glyph = (c) => (c ? c.player + TYPE_CODE[c.type] : ' . ');
  let out = '';
  for (let r = 0; r < 3; r++) {
    out += rowSquares(r).map((i) => glyph(s.board[i])).join(' ') + '\n';
  }
  return out;
}
