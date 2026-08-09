// Pif-paf-poe rules engine. See RULES.md. No dependencies; runs on Deno as-is.
//
// The state machine is a small mutable object. `applyAction` mutates in place,
// which is what a search wants; use `cloneState` to branch. Everything else is a
// pure function of the state.
//
//   import { createGame, legalActions, applyAction } from './engine.js';
//
//   const g = createGame({ handX: [...], handO: [...], first: 'X', itemO: 'overtake' });
//   while (!g.over) applyAction(g, pickOne(legalActions(g)));
//   g.winner;  // 'X' | 'O'
//
// Most turns are select -> place -> resolve. A Counterattack can add three more
// decision points: `reverse`, where the player who is NOT to move answers the
// movement effect just chosen, `encore`, where that player borrows the effect
// once it has run, and `counter`, where the player to move spends an end-of-turn
// item. `toMove` is who chooses now; it is not always `player`.

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const SUBSQUARES = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
// The eight outer squares, clockwise from the top left. Super Rotate turns these.
const RING = [0, 1, 2, 5, 8, 7, 6, 3];
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const STONE_TYPES = [
  'shift', '2048', 'rotate',   // movement
  'mountain',                  // static
  'magnet',                    // restriction
];

// Under evaluation, and not part of the pool: a hand may hold one and the engine
// plays it, but nothing that enumerates the hand space deals it unless asked.
export const EXTRA_TYPES = ['stinky'];
export const ALL_TYPES = [...STONE_TYPES, ...EXTRA_TYPES];

// The two stones that constrain where the opponent may place.
const RESTRICTION_TYPES = ['magnet', 'stinky'];

// Stones that resolve something after being placed.
const EFFECT_TYPES = ['shift', '2048', 'rotate'];
// What Uno Reverse can answer: the effects that have an opposite.
const MOVEMENT_TYPES = ['shift', '2048', 'rotate'];

// A Counterattack is held by one player and only works when that player moves
// second. Four sharpen a stone they hold; four stand on their own.
// Super Magnet used to be here. It made one player's Magnet permanent, which is
// now simply what a Magnet does, so it had nothing left to grant. Super Swap
// went with the Swap stone.
export const ITEMS = [
  'super-shift', 'super-2048', 'super-rotate', 'super-mountain',
  'overtake', 'antipolar', 'mind-control', 'uno-reverse',
  // Aimed at the seat gap rather than at a stone: three buy a tempo, three deny one.
  'second-wind', 'echo', 'blind-spot', 'fizzle', 'anchor',
  // A Magnet that pushes its owner, a borrowed movement effect, a banned win.
  'bipolar', 'encore', 'obstruction',
];
// Items that interrupt the opponent's resolution, and what each can answer.
const INTERRUPTS = {
  'uno-reverse': ['shift', '2048', 'rotate'],
  fizzle: ['shift', '2048', 'rotate'],
  anchor: ['shift', '2048', 'rotate'],
};

const TYPE_CODE = {
  shift: 'sh', '2048': '20', rotate: 'ro',
  mountain: 'mo', magnet: 'mg', stinky: 'st',
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

export function createGame({
  handX, handO, first = 'X', itemX = null, itemO = null,
  // The rules as they stand hold a restriction until it is replaced. These put
  // one back to lasting a single turn, for studies that compare the two.
  oneTurnMagnet = false, oneTurnStinky = false,
}) {
  for (const t of [...handX, ...handO]) {
    if (!ALL_TYPES.includes(t)) throw new Error(`unknown stone type: ${t}`);
  }
  for (const i of [itemX, itemO]) {
    if (i !== null && !ITEMS.includes(i)) throw new Error(`unknown item: ${i}`);
  }
  return {
    board: Array(9).fill(null),      // {player, type, id} | null
    hands: { X: [...handX], O: [...handO] },
    items: { X: itemX, O: itemO },   // Counterattack, live only for the second player
    spent: { X: false, O: false },   // a once-per-game item has been used
    first,                           // who opened; the other one wins a filled board
    player: first,                   // whose turn it is
    actor: null,                     // who chooses now, when that is not `player`
    phase: 'select',                 // select | place | effect | reverse | counter | over
    oneTurnMagnet,                   // rules variants, both off under the rules as they stand
    oneTurnStinky,
    restriction: null,               // {id, owner, kind, sticky}: a Magnet or Stinky on the other player
    forced: null,                    // {player, stone}: Mind Control on their next turn
    forbidden: null,                 // {player, pos}: Blind Spot on their next turn
    repel: null,                     // {player, id}: Bipolar on their next turn
    blocked: null,                   // {player}: Obstruction on their next turn
    selected: null,                  // stone type taken from hand, awaiting placement
    placedAt: null,                  // where it was placed, awaiting its effect
    pending: null,                   // effect chosen, awaiting a possible Uno Reverse
    over: false,
    winner: null,
    reason: null,                    // 'line' | 'full'
    turns: 0,
    nextId: 1,
  };
}

export function cloneState(s) {
  return {
    board: s.board.map((c) => (c ? { player: c.player, type: c.type, id: c.id } : null)),
    hands: { X: [...s.hands.X], O: [...s.hands.O] },
    items: { ...s.items },
    spent: { ...s.spent },
    first: s.first,
    player: s.player,
    actor: s.actor,
    phase: s.phase,
    oneTurnMagnet: s.oneTurnMagnet,
    oneTurnStinky: s.oneTurnStinky,
    restriction: s.restriction ? { ...s.restriction } : null,
    forced: s.forced ? { ...s.forced } : null,
    forbidden: s.forbidden ? { ...s.forbidden } : null,
    repel: s.repel ? { ...s.repel } : null,
    blocked: s.blocked ? { ...s.blocked } : null,
    selected: s.selected,
    placedAt: s.placedAt,
    pending: s.pending ? { ...s.pending } : null,
    over: s.over,
    winner: s.winner,
    reason: s.reason,
    turns: s.turns,
    nextId: s.nextId,
  };
}

// Whoever is choosing right now. Every phase but `reverse` is the player whose
// turn it is; `reverse` hands the choice to the other player for one decision.
export function toMove(s) { return s.actor ?? s.player; }

// A Counterattack is inert in the hands of whoever opened the game.
export function itemOf(s, player) {
  return player === s.first ? null : s.items[player];
}

// ── Immobility ──────────────────────────────────────────────────────────────

// A Mountain is never moved by an effect. It does not cancel the effect: it
// stands still and everything else moves as far as the space allows, so a
// Mountain reads as a wall on the board rather than as a veto on the menu.
export function isStuck(board, i, frozen) {
  return board[i]?.type === 'mountain' || (!!frozen && board[i]?.player === frozen);
}

// ── Effects ─────────────────────────────────────────────────────────────────

// Advance every stone one step along `cells`, which lists the squares in the
// order stones travel and wraps from the last back to the first. With no
// Mountain in the way this is the plain cyclic shift. A Mountain breaks the
// cycle into strips: inside a strip a stone advances if the square ahead is
// empty or is emptied by the stone ahead of it, and the stone facing the
// Mountain stays put along with anything queued behind it.
function stepAlong(board, cells, frozen) {
  const n = cells.length;
  const wall = cells.map((i) => isStuck(board, i, frozen));

  if (!wall.some(Boolean)) {
    const before = cells.map((i) => board[i]);
    for (let k = 0; k < n; k++) board[cells[(k + 1) % n]] = before[k];
    return;
  }

  for (let w = 0; w < n; w++) {
    if (!wall[w]) continue;
    const strip = [];
    for (let k = 1; k < n && !wall[(w + k) % n]; k++) strip.push(cells[(w + k) % n]);
    // From the far end backwards, so a stone can follow the one ahead of it.
    for (let k = strip.length - 1; k > 0; k--) {
      if (!board[strip[k]] && board[strip[k - 1]]) {
        board[strip[k]] = board[strip[k - 1]];
        board[strip[k - 1]] = null;
      }
    }
  }
}

// The travel order of one row or column under a direction: each square hands
// its stone to the next one listed. `index` picks which row or column.
function lineOrder(index, dir) {
  const horizontal = dir === 'left' || dir === 'right';
  const idx = horizontal ? rowSquares(index) : colSquares(index);
  return dir === 'right' || dir === 'down' ? idx : idx.slice().reverse();
}

function applyShift(board, dir, index, frozen) {
  stepAlong(board, lineOrder(index, dir), frozen);
}

// Pack `cells` toward cells[0], which is the end the stones are sliding to.
function packToward(board, cells) {
  const stones = cells.map((i) => board[i]).filter(Boolean);
  cells.forEach((i, k) => { board[i] = stones[k] ?? null; });
}

function apply2048(board, dir, frozen) {
  const horizontal = dir === 'left' || dir === 'right';
  for (let i = 0; i < 3; i++) {
    const idx = horizontal ? rowSquares(i) : colSquares(i);
    // Destination end first, then Mountains cut the line into segments that
    // each pack on their own -- nothing slides past a Mountain.
    const cells = dir === 'right' || dir === 'down' ? idx.slice().reverse() : idx;
    let segment = [];
    for (const c of cells) {
      if (isStuck(board, c, frozen)) { packToward(board, segment); segment = []; } else segment.push(c);
    }
    packToward(board, segment);
  }
}

function applyRotate(board, square, ccw, frozen) {
  const [tl, tr, bl, br] = square === 'RING' ? [] : SUBSQUARES[square];
  const cycle = square === 'RING' ? RING.slice() : [tl, tr, br, bl];
  stepAlong(board, ccw ? cycle.reverse() : cycle, frozen);
}

// An effect answered by Uno Reverse runs the other way: the opposite direction
// for Shift and 2048, anticlockwise for Rotate.
function mirrored(action) {
  return {
    ...action,
    direction: action.direction ? OPPOSITE[action.direction] : undefined,
    second: action.second ? OPPOSITE[action.second] : undefined,
    ccw: !action.ccw,
  };
}

// The single place an effect is resolved, shared by the real move and any
// lookahead, so the two cannot disagree.
function resolveOnto(board, type, pos, action, frozen) {
  switch (type) {
    case 'shift': {
      // Without Super Shift the line is the one the stone sits in.
      const horizontal = action.direction === 'left' || action.direction === 'right';
      const index = action.index ?? (horizontal ? row(pos) : col(pos));
      return applyShift(board, action.direction, index, frozen);
    }
    case '2048': {
      apply2048(board, action.direction, frozen);
      if (action.second) apply2048(board, action.second, frozen);   // Super 2048
      return;
    }
    case 'rotate': return applyRotate(board, action.square, action.ccw, frozen);
  }
}

// ── Legal actions ───────────────────────────────────────────────────────────

function selectActions(s) {
  let hand = [...new Set(s.hands[s.player])];
  // Mind Control named the stone for this turn.
  if (s.forced?.player === s.player && hand.includes(s.forced.stone)) hand = [s.forced.stone];
  return hand.map((stone) => ({ type: 'select', stone }));
}

function placeActions(s) {
  let free = freeSquares(s.board);
  const p = s.player;
  const item = itemOf(s, p);
  const r = s.restriction;

  // A Magnet the opponent owns pulls you next to it and a Stinky pushes you off
  // it -- unless you are placing a Mountain and hold Super Mountain, or
  // Antipolar has turned the one into the other. A restriction that no free
  // square can satisfy does not apply.
  const at = r && r.owner === other(p) ? restrictionSquare(s, r) : -1;
  if (at >= 0 && !(item === 'super-mountain' && s.selected === 'mountain')) {
    const pull = (r.kind === 'magnet') !== (item === 'antipolar');
    const allowed = free.filter((i) => adjacent(i, at) === pull);
    if (allowed.length) free = allowed;
  }

  // Bipolar: a Magnet does not only pull the other player in, it pushes its own
  // owner off its neighbours on the turn after it lands.
  if (s.repel?.player === p) {
    const own = s.board.findIndex((c) => c?.id === s.repel.id);
    const allowed = own < 0 ? free : free.filter((i) => !adjacent(i, own));
    if (allowed.length) free = allowed;
  }

  // Blind Spot closes one square, unless that would leave nowhere to play.
  if (s.forbidden?.player === p) {
    const allowed = free.filter((i) => i !== s.forbidden.pos);
    if (allowed.length) free = allowed;
  }

  return free.map((pos) => ({ type: 'place', pos }));
}

// The restriction follows the Magnet itself, not the square it landed on: a
// Magnet that gets shifted keeps pulling from wherever it ends up, and one that
// leaves the board stops pulling at all.
function restrictionSquare(s, r) {
  return s.board.findIndex((c) => c?.id === r.id);
}

function effectActions(s) {
  const type = s.selected;
  const pos = s.placedAt;
  const item = itemOf(s, s.player);
  const out = [];

  if (type === 'shift') {
    // Super Shift picks the line as well as the direction.
    for (const direction of DIRECTIONS) {
      const horizontal = direction === 'left' || direction === 'right';
      const own = horizontal ? row(pos) : col(pos);
      const lines = item === 'super-shift' ? [0, 1, 2] : [own];
      for (const index of lines) out.push({ type: 'effect', direction, index });
    }
  } else if (type === '2048') {
    for (const direction of DIRECTIONS) {
      out.push({ type: 'effect', direction });
      // Super 2048 may run a second time, in a different direction.
      if (item === 'super-2048') {
        for (const second of DIRECTIONS) {
          if (second !== direction) out.push({ type: 'effect', direction, second });
        }
      }
    }
  } else if (type === 'rotate') {
    // Super Rotate reaches any sub-square, and the outer ring.
    const squares = item === 'super-rotate'
      ? [...Object.keys(SUBSQUARES), 'RING']
      : Object.keys(SUBSQUARES).filter((k) => SUBSQUARES[k].includes(pos));
    for (const square of squares) out.push({ type: 'effect', square });
  }

  return out;
}

// The other player answers the effect just chosen, once per game. `use: 'none'`
// always sits on the menu -- the interrupt is an option, not a duty.
function reverseActions(s) {
  return [{ type: 'reverse', use: 'none' }, { type: 'reverse', use: itemOf(s, toMove(s)) }];
}

// Encore borrows the movement effect the opponent has just resolved and runs the
// same kind again, anywhere on the board and in any direction.
function encoreActions(s) {
  const out = [{ type: 'encore', use: 'none' }];
  if (s.selected === 'shift') {
    for (const direction of DIRECTIONS) {
      for (const index of [0, 1, 2]) out.push({ type: 'encore', direction, index });
    }
  } else if (s.selected === '2048') {
    for (const direction of DIRECTIONS) out.push({ type: 'encore', direction });
  } else if (s.selected === 'rotate') {
    for (const square of Object.keys(SUBSQUARES)) out.push({ type: 'encore', square });
  }
  return out;
}

// End-of-turn items, spent by the player whose turn is ending.
function counterActions(s) {
  const p = s.player;
  const out = [{ type: 'counter', use: 'pass' }];
  if (s.spent[p]) return out;

  const item = itemOf(s, p);
  if (item === 'overtake') {
    for (let i = 0; i < 9; i++) {
      if (s.board[i]?.player === other(p)) out.push({ type: 'counter', use: 'overtake', pos: i });
    }
  } else if (item === 'mind-control') {
    for (const stone of new Set(s.hands[other(p)])) {
      out.push({ type: 'counter', use: 'mind-control', stone });
    }
  } else if (item === 'blind-spot') {
    for (const pos of freeSquares(s.board)) out.push({ type: 'counter', use: 'blind-spot', pos });
  } else if (item === 'second-wind' && s.hands[p].length) {
    out.push({ type: 'counter', use: 'second-wind' });
  } else if (item === 'echo' && effectActions(s).length) {
    out.push({ type: 'counter', use: 'echo' });
  } else if (item === 'obstruction') {
    out.push({ type: 'counter', use: 'obstruction' });
  }
  return out;
}

export function legalActions(s) {
  switch (s.phase) {
    case 'select': return selectActions(s);
    case 'place': return placeActions(s);
    case 'effect': return effectActions(s);
    case 'reverse': return reverseActions(s);
    case 'encore': return encoreActions(s);
    case 'counter': return counterActions(s);
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

// Restriction bookkeeping and the terminal checks, in the order RULES.md gives
// them. Returns true if the game ended.
function endTurn(s, keepTurn = false) {
  const player = s.player;

  // Bipolar's push covered the turn that is ending and is now spent.
  if (s.repel?.player === player) s.repel = null;

  if (RESTRICTION_TYPES.includes(s.selected)) {
    s.restriction = {
      id: s.board[s.placedAt].id, owner: player, kind: s.selected,
      // A restriction holds until another one replaces it or its stone leaves
      // the board, unless a study has asked for the one-turn version.
      sticky: !(s.selected === 'magnet' ? s.oneTurnMagnet : s.oneTurnStinky),
    };
    if (s.selected === 'magnet' && itemOf(s, other(player)) === 'bipolar') {
      s.repel = { player, id: s.board[s.placedAt].id };
    }
  } else if (s.restriction?.owner === other(player) && !s.restriction.sticky) {
    s.restriction = null;   // it bound us for this turn and is now spent
  }
  // A Magnet that has left the board -- taken by Overtake -- stops binding.
  if (s.restriction && restrictionSquare(s, s.restriction) < 0) s.restriction = null;
  if (s.forced?.player === player) s.forced = null;         // Mind Control is spent
  if (s.forbidden?.player === player) s.forbidden = null;   // Blind Spot is spent

  // Obstruction: the player it names cannot win this turn. A line of theirs
  // loses on the spot instead of winning; either way the holder takes the game.
  const banned = s.blocked?.player === player;
  if (hasLine(s.board, player)) {
    finish(s, banned ? other(player) : player, 'line');
    return true;
  }
  if (hasLine(s.board, other(player))) { finish(s, other(player), 'line'); return true; }
  if (banned) s.blocked = null;   // it covered this turn and is now spent

  s.player = keepTurn ? player : other(player);   // Second Wind holds the turn
  s.actor = null;
  s.turns++;
  s.selected = null;
  s.placedAt = null;
  s.pending = null;
  s.phase = 'select';

  // Out of room, or out of stones: the game is over and the player who did not
  // open takes it. Overtake can hand a stone back, so the board is not strictly
  // filling every turn, but it can only do that once and the game still ends.
  if (isFull(s.board) || !s.hands[s.player].length) {
    finish(s, other(s.first), 'full');
    return true;
  }
  return false;
}

// After the effect is settled: the mover may still have an end-of-turn item.
function afterEffect(s) {
  const p = s.player;
  const item = itemOf(s, p);
  if (!s.spent[p] && item && ['overtake', 'mind-control', 'blind-spot',
    'second-wind', 'echo', 'obstruction'].includes(item)) {
    s.phase = 'counter';
    s.actor = null;
    if (counterActions(s).length > 1) return;   // something to choose
  }
  endTurn(s);
}

function afterPlacement(s) {
  if (!EFFECT_TYPES.includes(s.selected)) { afterEffect(s); return; }

  // A Swap with nothing to take: the stone is placed and resolves nothing.
  s.phase = 'effect';
  if (!effectActions(s).length) afterEffect(s);
}

// Uno Reverse is held by the player who is not moving, and answers exactly the
// movement effects that have an opposite.
function interruptAvailable(s) {
  const foe = other(s.player);
  const item = itemOf(s, foe);
  return !!item && !s.spent[foe] && (INTERRUPTS[item]?.includes(s.selected) ?? false);
}

// Encore answers a movement effect once the effect has run, so the choice is
// made knowing what the board looks like afterwards.
function encoreAvailable(s) {
  const foe = other(s.player);
  return itemOf(s, foe) === 'encore' && !s.spent[foe] && MOVEMENT_TYPES.includes(s.selected);
}

// Once an effect has settled, the other player may still borrow it.
function afterResolution(s) {
  if (encoreAvailable(s)) {
    s.phase = 'encore';
    s.actor = other(s.player);
    return;
  }
  afterEffect(s);
}

export function applyAction(s, action) {
  if (s.over) throw new Error('game is over');

  switch (action.type) {
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
      if (interruptAvailable(s)) {
        s.pending = action;
        s.phase = 'reverse';
        s.actor = other(s.player);   // the other player answers
        break;
      }
      resolveOnto(s.board, s.selected, s.placedAt, action);
      afterResolution(s);
      break;
    }
    case 'reverse': {
      const holder = toMove(s);
      if (action.use !== 'none') s.spent[holder] = true;
      if (action.use !== 'fizzle') {
        // Uno Reverse runs it backwards; Anchor runs it with the holder's own
        // stones nailed down; Fizzle means it does not run at all.
        resolveOnto(s.board, s.selected, s.placedAt,
          action.use === 'uno-reverse' ? mirrored(s.pending) : s.pending,
          action.use === 'anchor' ? holder : null);
      }
      s.pending = null;
      s.actor = null;
      afterResolution(s);
      break;
    }
    case 'encore': {
      const holder = toMove(s);
      if (action.use !== 'none') {
        s.spent[holder] = true;
        resolveOnto(s.board, s.selected, s.placedAt, action);
      }
      s.actor = null;
      afterEffect(s);
      break;
    }
    case 'counter': {
      const p = s.player;
      if (action.use === 'overtake') {
        const cell = s.board[action.pos];
        s.hands[cell.player].push(cell.type);
        s.board[action.pos] = null;
        s.spent[p] = true;
      } else if (action.use === 'mind-control') {
        s.forced = { player: other(p), stone: action.stone };
        s.spent[p] = true;
      } else if (action.use === 'blind-spot') {
        s.forbidden = { player: other(p), pos: action.pos };
        s.spent[p] = true;
      } else if (action.use === 'second-wind') {
        s.spent[p] = true;
        endTurn(s, true);   // the turn passes back to the same player
        break;
      } else if (action.use === 'obstruction') {
        s.blocked = { player: other(p) };
        s.spent[p] = true;
      } else if (action.use === 'echo') {
        // Resolve the stone a second time, choosing again.
        s.spent[p] = true;
        s.phase = 'effect';
        break;
      }
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
