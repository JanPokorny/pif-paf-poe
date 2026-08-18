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
// A turn is select -> place -> resolve, and a Counterattack can add one more
// decision point: `counter`, where the player whose turn is ending spends an
// end-of-turn item, before the check for three in a row.

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const SUBSQUARES = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
// Squares that map onto each other through the centre. What Mirror trades.
const SYMMETRIC = [[0, 8], [1, 7], [2, 6], [3, 5]];
const DIRECTIONS = ['up', 'down', 'left', 'right'];

export const STONE_TYPES = [
  'shift', '2048', 'rotate',   // movement
  'mountain',                  // static
  'magnet', 'stinky',          // restriction, one pulling and one pushing
];

// The two stones that constrain where the opponent may place.
const RESTRICTION_TYPES = ['magnet', 'stinky'];

// Stones that resolve something after being placed.
const EFFECT_TYPES = ['shift', '2048', 'rotate'];

// The Counterattacks the player moving second picks from. They may hold more than
// one but spend only one in a game, so holding two is a choice made in play with
// the board in front of you rather than before it. Twenty-odd others were built
// and measured on the way to these five; adr/ and git history hold what each of
// them was worth.
export const ITEMS = [
  'overtake',           // takes the centre stone back off the board
  'relocate',           // moves a stone of yours anywhere
  'mirror',             // trades a pair of squares through the centre
  'mind-control',       // names the stone they must play
  'rehearse',           // resolves a stone of yours already on the board
];

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
  // The space being fought on switches one stone type off for both players: it
  // still occupies its square and still counts towards a line, but it has no
  // effect, no restriction and, for a Mountain, no immovability.
  disabled = null,
  // The rules as they stand put every restriction stone on the board in force at
  // once. This puts one back to the older rule -- only the most recently placed
  // binds -- for studies that compare the two.
  oneRestriction = false,
}) {
  if (disabled !== null && !STONE_TYPES.includes(disabled)) {
    throw new Error(`unknown stone type: ${disabled}`);
  }
  for (const t of [...handX, ...handO]) {
    if (!STONE_TYPES.includes(t)) throw new Error(`unknown stone type: ${t}`);
  }
  // One Counterattack or several: a lone name is the same as a set of one.
  const held = (i) => (i === null ? [] : [].concat(i));
  for (const i of [...held(itemX), ...held(itemO)]) {
    if (!ITEMS.includes(i)) throw new Error(`unknown item: ${i}`);
  }
  return {
    board: Array(9).fill(null),      // {player, type, id} | null
    hands: { X: [...handX], O: [...handO] },
    items: { X: held(itemX), O: held(itemO) },   // live only for the second player
    spent: { X: false, O: false },   // one of them has been spent, and that is the lot
    first,                           // who opened; the other one wins a filled board
    player: first,                   // whose turn it is
    phase: 'select',                 // select | place | effect | counter | over
    disabled,                        // the stone type this space switches off
    oneRestriction,                  // a rules variant, off under the rules as they stand
    restriction: null,               // {id, owner, kind}: the variant's single live restriction
    forced: null,                    // {player, stones}: what Mind Control named, next turn
    selected: null,                  // stone type taken from hand, awaiting placement
    placedAt: null,                  // where it was placed, awaiting its effect
    placedId: null,                  // and which stone it is, since it may move again
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
    items: { X: [...s.items.X], O: [...s.items.O] },
    spent: { ...s.spent },
    first: s.first,
    player: s.player,
    phase: s.phase,
    disabled: s.disabled,
    oneRestriction: s.oneRestriction,
    restriction: s.restriction ? { ...s.restriction } : null,
    forced: s.forced ? { ...s.forced } : null,
    selected: s.selected,
    placedAt: s.placedAt,
    placedId: s.placedId,
    over: s.over,
    winner: s.winner,
    reason: s.reason,
    turns: s.turns,
    nextId: s.nextId,
  };
}

// Whoever is choosing right now. Nothing interrupts a turn any more, so this is
// always the player whose turn it is -- the search still asks through this, since
// it is what makes the rollout credit correct if that ever stops being true.
export function toMove(s) { return s.player; }

// What this player may spend, which is nothing at all for whoever opened.
export function itemsOf(s, player) {
  return player === s.first ? [] : s.items[player];
}

// ── Immobility ──────────────────────────────────────────────────────────────

// A Mountain is never moved by an effect. It does not cancel the effect: it
// stands still and everything else moves as far as the space allows, so a
// Mountain reads as a wall on the board rather than as a veto on the menu.
export function isStuck(board, i, disabled) {
  return board[i]?.type === 'mountain' && disabled !== 'mountain';
}

// ── Effects ─────────────────────────────────────────────────────────────────

// Advance every stone one step along `cells`, which lists the squares in the
// order stones travel and wraps from the last back to the first. With no
// Mountain in the way this is the plain cyclic shift. A Mountain breaks the
// cycle into strips: inside a strip a stone advances if the square ahead is
// empty or is emptied by the stone ahead of it, and the stone facing the
// Mountain stays put along with anything queued behind it.
function stepAlong(board, cells, disabled) {
  const n = cells.length;
  const wall = cells.map((i) => isStuck(board, i, disabled));

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

function applyShift(board, dir, index, disabled) {
  stepAlong(board, lineOrder(index, dir), disabled);
}

// Pack `cells` toward cells[0], which is the end the stones are sliding to.
function packToward(board, cells) {
  const stones = cells.map((i) => board[i]).filter(Boolean);
  cells.forEach((i, k) => { board[i] = stones[k] ?? null; });
}

function apply2048(board, dir, disabled) {
  const horizontal = dir === 'left' || dir === 'right';
  for (let i = 0; i < 3; i++) {
    const idx = horizontal ? rowSquares(i) : colSquares(i);
    // Destination end first, then Mountains cut the line into segments that
    // each pack on their own -- nothing slides past a Mountain.
    const cells = dir === 'right' || dir === 'down' ? idx.slice().reverse() : idx;
    let segment = [];
    for (const c of cells) {
      if (isStuck(board, c, disabled)) { packToward(board, segment); segment = []; } else segment.push(c);
    }
    packToward(board, segment);
  }
}

function applyRotate(board, square, disabled) {
  const [tl, tr, bl, br] = SUBSQUARES[square];
  stepAlong(board, [tl, tr, br, bl], disabled);
}

// The single place an effect is resolved, shared by the real move and any
// lookahead, so the two cannot disagree.
function resolveOnto(board, type, pos, action, disabled) {
  switch (type) {
    case 'shift': {
      const horizontal = action.direction === 'left' || action.direction === 'right';
      const index = action.index ?? (horizontal ? row(pos) : col(pos));
      return applyShift(board, action.direction, index, disabled);
    }
    case '2048': return apply2048(board, action.direction, disabled);
    case 'rotate': return applyRotate(board, action.square, disabled);
  }
}

// What a stone does here, which is nothing at all if this space switched it off.
function resolves(s, type) { return EFFECT_TYPES.includes(type) && type !== s.disabled; }

// ── Legal actions ───────────────────────────────────────────────────────────

function selectActions(s) {
  let hand = [...new Set(s.hands[s.player])];
  // Mind Control named the stone to play. A demand the hand cannot meet does not
  // apply.
  if (s.forced?.player === s.player) {
    const left = hand.filter((t) => s.forced.stones.includes(t));
    if (left.length) hand = left;
  }
  return hand.map((stone) => ({ type: 'select', stone }));
}

// Where the opponent's restriction stones stand right now. They bind from
// wherever they have ended up rather than from where they landed, so one that
// gets shifted keeps working and one taken off the board stops.
function restrictionsOn(s, player) {
  const magnets = [], stinkies = [];
  for (let i = 0; i < 9; i++) {
    const c = s.board[i];
    if (!c || c.player === player || c.type === s.disabled) continue;
    if (c.type === 'magnet') magnets.push(i);
    else if (c.type === 'stinky') stinkies.push(i);
  }
  return { magnets, stinkies };
}

// The squares this player may place on: every restriction the opponent has on
// the board is in force at once. A Magnet pulls you next to it -- next to any
// one of them is enough -- and a Stinky pushes you off it, every one of them,
// and what is left is the intersection. If that comes out empty, because the
// two disagree or because a Magnet is walled in, the whole free board is open.
export function allowedSquares(s, free = freeSquares(s.board)) {
  if (s.oneRestriction) return soleRestrictionSquares(s, free);
  const { magnets, stinkies } = restrictionsOn(s, s.player);
  if (!magnets.length && !stinkies.length) return free;
  const allowed = free.filter((i) =>
    (!magnets.length || magnets.some((m) => adjacent(i, m))) &&
    !stinkies.some((t) => adjacent(i, t)));
  return allowed.length ? allowed : free;
}

// The older rule, kept for the study that replaced it: only the most recently
// placed restriction stone binds, and one no free square can satisfy lapses.
function soleRestrictionSquares(s, free) {
  const r = s.restriction;
  const at = r && r.owner === other(s.player)
    ? s.board.findIndex((c) => c?.id === r.id) : -1;
  if (at < 0) return free;
  const allowed = free.filter((i) => adjacent(i, at) === (r.kind === 'magnet'));
  return allowed.length ? allowed : free;
}

function placeActions(s) {
  return allowedSquares(s).map((pos) => ({ type: 'place', pos }));
}

// The effect menu for a stone of `type` sitting on `pos`. Usually that is the
// stone just placed, but Rehearse asks the same question about an older one.
function effectOptions(s, type, pos) {
  const out = [];

  if (type === 'shift') {
    for (const direction of DIRECTIONS) {
      const horizontal = direction === 'left' || direction === 'right';
      out.push({ direction, index: horizontal ? row(pos) : col(pos) });
    }
  } else if (type === '2048') {
    for (const direction of DIRECTIONS) out.push({ direction });
  } else if (type === 'rotate') {
    for (const square of Object.keys(SUBSQUARES).filter((k) => SUBSQUARES[k].includes(pos))) {
      out.push({ square });
    }
  }

  return out;
}

function effectActions(s) {
  return effectOptions(s, s.selected, s.placedAt).map((o) => ({ type: 'effect', ...o }));
}

// End-of-turn items, spent by the player whose turn is ending. Every one of them
// resolves before the check for three in a row, so any of them can finish a line.
function counterActions(s) {
  const p = s.player;
  const out = [{ type: 'counter', use: 'pass' }];
  if (s.spent[p]) return out;

  // Every Counterattack held offers its own choices, and spending any one of them
  // spends the turn's chance and the game's.
  for (const item of itemsOf(s, p)) addCounterActions(s, p, item, out);
  return out;
}

function addCounterActions(s, p, item, out) {
  if (item === 'overtake') {
    // Only the centre, which is the square worth taking and the one they had to
    // commit to first.
    if (s.board[4] && s.board[4].player === other(p)) {
      out.push({ type: 'counter', use: 'overtake', pos: 4 });
    }
  } else if (item === 'mirror') {
    for (const [a, b] of SYMMETRIC) {
      if (s.board[a] || s.board[b]) out.push({ type: 'counter', use: 'mirror', a, b });
    }
  } else if (item === 'relocate') {
    const free = freeSquares(s.board);
    for (let i = 0; i < 9; i++) {
      if (s.board[i]?.player !== p) continue;
      for (const to of free) out.push({ type: 'counter', use: 'relocate', from: i, to });
    }
  } else if (item === 'rehearse') {
    for (let i = 0; i < 9; i++) {
      const cell = s.board[i];
      if (cell?.player !== p || !resolves(s, cell.type)) continue;
      for (const o of effectOptions(s, cell.type, i)) {
        out.push({ type: 'counter', use: 'rehearse', pos: i, ...o });
      }
    }
  } else if (item === 'mind-control') {
    for (const stone of new Set(s.hands[other(p)])) {
      out.push({ type: 'counter', use: item, stones: [stone] });
    }
  }
  return out;
}

export function legalActions(s) {
  switch (s.phase) {
    case 'select': return selectActions(s);
    case 'place': return placeActions(s);
    case 'effect': return effectActions(s);
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
function endTurn(s) {
  const player = s.player;

  // Restriction stones bind straight off the board, so under the rules as they
  // stand there is nothing to record. The variant tracks the latest one: the
  // stone placed this turn may have moved since -- by its own effect, or by an
  // item -- so it is found by id rather than by the square it landed on.
  if (s.oneRestriction) {
    const placed = s.board.findIndex((c) => c?.id === s.placedId);
    if (RESTRICTION_TYPES.includes(s.selected) && s.selected !== s.disabled && placed >= 0) {
      s.restriction = { id: s.placedId, owner: player, kind: s.selected };
    }
    if (s.restriction && !s.board.some((c) => c?.id === s.restriction.id)) s.restriction = null;
  }
  if (s.forced?.player === player) s.forced = null;   // it covered this turn

  if (hasLine(s.board, player)) { finish(s, player, 'line'); return true; }
  if (hasLine(s.board, other(player))) { finish(s, other(player), 'line'); return true; }

  s.player = other(player);
  s.turns++;
  s.selected = null;
  s.placedAt = null;
  s.placedId = null;
  s.phase = 'select';

  // Out of room, or out of stones: the game is over and the player who did not
  // open takes it. Overtake hands a stone back, so the board is not strictly
  // filling every turn, but that happens once at most and the game still ends.
  if (isFull(s.board) || !s.hands[s.player].length) {
    finish(s, other(s.first), 'full');
    return true;
  }
  return false;
}

// After the effect is settled: the mover may still have an end-of-turn item.
function afterEffect(s) {
  const p = s.player;
  if (!s.spent[p] && itemsOf(s, p).length) {
    s.phase = 'counter';
    if (counterActions(s).length > 1) return;   // something to choose
  }
  endTurn(s);
}

function afterPlacement(s) {
  if (!resolves(s, s.selected)) { afterEffect(s); return; }

  // A stone whose menu is empty is placed and resolves nothing.
  s.phase = 'effect';
  if (!effectActions(s).length) afterEffect(s);
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
      s.placedId = s.nextId++;
      s.board[action.pos] = { player: s.player, type: s.selected, id: s.placedId };
      s.placedAt = action.pos;
      afterPlacement(s);
      break;
    }
    case 'effect': {
      resolveOnto(s.board, s.selected, s.placedAt, action, s.disabled);
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
      } else if (action.use === 'mirror') {
        const held = s.board[action.a];
        s.board[action.a] = s.board[action.b];
        s.board[action.b] = held;
        s.spent[p] = true;
      } else if (action.use === 'relocate') {
        s.board[action.to] = s.board[action.from];
        s.board[action.from] = null;
        s.spent[p] = true;
      } else if (action.use === 'rehearse') {
        resolveOnto(s.board, s.board[action.pos].type, action.pos, action, s.disabled);
        s.spent[p] = true;
      } else if (action.use === 'mind-control') {
        s.forced = { player: other(p), stones: action.stones };
        s.spent[p] = true;
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
