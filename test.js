// Rules checks for the parts of engine.js that are easy to get subtly wrong:
// what a Mountain does to each movement effect, and what is and is not a legal
// choice. No dependencies; runs on Deno as-is.
//
//   node test.js

import {
  createGame, applyAction, legalActions, render, ALL_TYPES, STONE_TYPES, ITEMS, other, toMove,
} from './engine.js';
import { makeRng, randomAction } from './ai.js';

let failures = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) return;
  failures++;
  console.log(`FAIL ${name}\n  expected ${b}\n  actual   ${a}`);
}

// A board from nine cells, each 'Xsh' / 'Omo' / '.' -- player letter plus the
// two-letter type code. Ids are the index, so a cell is traceable after a move.
const CODES = {
  sh: 'shift', 20: '2048', ro: 'rotate',
  mo: 'mountain', mg: 'magnet', st: 'stinky',
};
function board(spec) {
  return spec.map((cell, i) =>
    cell === '.' ? null : { player: cell[0], type: CODES[cell.slice(1)], id: i });
}
// Read a board back in the same notation, so a failure prints something legible.
function show(b) {
  const code = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [v, k]));
  return b.map((c) => (c ? c.player + code[c.type] : '.'));
}

// A state mid-turn: `at` has just been placed and its effect is pending.
function pending(spec, { player = 'X', at, selected }) {
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: player });
  s.board = board(spec);
  s.player = player;
  s.placedAt = at;
  s.selected = selected;
  s.phase = 'effect';
  return s;
}

function resolve(spec, setup, action) {
  const s = pending(spec, setup);
  applyAction(s, { type: 'effect', ...action });
  return show(s.board);
}

// ── Shift ───────────────────────────────────────────────────────────────────

check('shift wraps with no Mountain in the line',
  resolve(['Xsh', 'Omg', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'shift' }, { direction: 'right' }),
  ['.', 'Xsh', 'Omg', '.', '.', '.', '.', '.', '.']);

check('a stone facing a Mountain stays, and so does the one queued behind it',
  resolve(['Xsh', 'Omo', 'Omg', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'shift' }, { direction: 'right' }),
  ['Xsh', 'Omo', 'Omg', '.', '.', '.', '.', '.', '.']);

check('a stone still wraps into free space on the far side of a Mountain',
  resolve(['.', 'Omo', 'Xsh', '.', '.', '.', '.', '.', '.'],
    { at: 2, selected: 'shift' }, { direction: 'right' }),
  ['Xsh', 'Omo', '.', '.', '.', '.', '.', '.', '.']);

check('the Mountain keeps its square while the rest of the column wraps',
  resolve(['.', '.', '.', 'Omo', '.', '.', 'Xsh', '.', '.'],
    { at: 6, selected: 'shift' }, { direction: 'down' }),
  ['Xsh', '.', '.', 'Omo', '.', '.', '.', '.', '.']);

// ── 2048 ────────────────────────────────────────────────────────────────────

check('2048 still slides everything that has room',
  resolve(['Xsh', '.', '.', '.', 'Omg', '.', '.', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['.', '.', 'Xsh', '.', '.', 'Omg', '.', '.', '.']);

check('nothing slides past a Mountain, and the far side packs on its own',
  resolve(['Xsh', 'Omo', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['Xsh', 'Omo', '.', '.', '.', '.', '.', '.', '.']);

check('a stone slides up to the Mountain and stops',
  resolve(['Xsh', '.', 'Omo', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['.', 'Xsh', 'Omo', '.', '.', '.', '.', '.', '.']);

check('every line resolves, not just the one the stone sits in',
  resolve(['Xsh', '.', '.', 'Omg', '.', '.', 'Xmo', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['.', '.', 'Xsh', '.', '.', 'Omg', 'Xmo', '.', '.']);

// ── Rotate ──────────────────────────────────────────────────────────────────

check('rotate turns the whole square with no Mountain in it',
  resolve(['Xro', 'Omg', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'rotate' }, { square: 'TL' }),
  ['.', 'Xro', '.', '.', 'Omg', '.', '.', '.', '.']);

check('a Mountain in the square blocks its follower and frees the rest',
  resolve(['Xro', 'Omo', '.', '.', 'Omg', '.', '.', '.', '.'],
    { at: 0, selected: 'rotate' }, { square: 'TL' }),
  ['Xro', 'Omo', '.', 'Omg', '.', '.', '.', '.', '.']);

// ── The Magnet still binds ──────────────────────────────────────────────────

{
  const s = createGame({ handX: ['magnet'], handO: ['shift'], first: 'X' });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('a Magnet still compels the opponent to place adjacent to it',
    legalActions(s).map((a) => a.pos), [1, 3, 5, 7]);
}

// ── A Mountain never removes a choice ───────────────────────────────────────

{
  const s = pending(['Xmo', 'Omo', 'Xmo', 'Omo', '.', 'Omo', 'Xmo', 'Omo', 'Xmo'],
    { at: 4, selected: 'shift' });
  check('shift keeps all four directions on a board full of Mountains',
    legalActions(s).length, 4);
}

// ── The pool, and a game that finishes ──────────────────────────────────────

check('the pool is five stones', STONE_TYPES,
  ['shift', '2048', 'rotate', 'mountain', 'magnet']);

{
  const rng = makeRng(11);
  let games = 0;
  for (let g = 0; g < 200; g++) {
    const hand = () => Array.from({ length: 5 },
      () => STONE_TYPES[(rng() * STONE_TYPES.length) | 0]);
    const s = createGame({ handX: hand(), handO: hand(), first: rng() < 0.5 ? 'X' : 'O' });
    let plies = 0;
    while (!s.over) {
      const action = randomAction(s, rng);
      if (!action) break;
      applyAction(s, action);
      if (++plies > 100) break;
    }
    if (s.over && (s.winner === 'X' || s.winner === 'O')) games++;
  }
  check('200 random games all reach a winner', games, 200);
}


// ── Counterattack ───────────────────────────────────────────────────────────

// O replies, so O is the one a Counterattack works for.
function held(spec, { at, selected, item, player = 'O' }) {
  const s = createGame({
    handX: ['shift'], handO: ['shift'], first: 'X',
    itemX: player === 'X' ? item : null, itemO: player === 'O' ? item : null,
  });
  s.board = board(spec);
  s.player = player;
  s.placedAt = at;
  s.selected = selected;
  s.phase = 'effect';
  return s;
}
const empty = ['.', '.', '.', '.', '.', '.', '.', '.', '.'];

{
  // An item is inert in the hands of whoever opened the game.
  const opener = createGame({
    handX: ['shift', 'shift'], handO: ['shift'], first: 'X', itemX: 'relocate',
  });
  opener.board = board(['Xsh', '.', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(opener, { type: 'select', stone: 'shift' });
  applyAction(opener, { type: 'place', pos: 4 });
  applyAction(opener, { type: 'effect', direction: 'right', index: 1 });
  check('a Counterattack is inert for whoever opened', opener.phase, 'select');
}

{
  // Overtake reaches the centre and nothing else.
  const s = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'overtake' });
  s.board = board(['Xsh', '.', '.', '.', 'Xmg', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  check('Overtake offers the centre alone',
    legalActions(s).filter((a) => a.use === 'overtake').map((a) => a.pos), [4]);
  applyAction(s, { type: 'counter', use: 'overtake', pos: 4 });
  check('and hands that stone back to its owner',
    [show(s.board)[4], s.hands.X.filter((t) => t === 'magnet').length], ['.', 1]);
  check('Overtake is once per game', s.spent.O, true);
}

{
  // With the centre empty, or held by the holder, there is nothing to take.
  const away = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'overtake' });
  away.board = board(['Xsh', '.', '.', '.', '.', '.', '.', '.', '.']);
  away.player = 'O';
  applyAction(away, { type: 'select', stone: 'mountain' });
  applyAction(away, { type: 'place', pos: 8 });
  check('an empty centre leaves Overtake nothing to do', away.phase, 'select');

  const mine = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'overtake' });
  mine.board = board(['Xsh', '.', '.', '.', 'Omg', '.', '.', '.', '.']);
  mine.player = 'O';
  applyAction(mine, { type: 'select', stone: 'mountain' });
  applyAction(mine, { type: 'place', pos: 8 });
  check('and a stone of the holder\'s own is not a target', mine.phase, 'select');
}

{
  // Mirror trades a pair of squares that mirror each other through the centre.
  const s = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'mirror' });
  s.board = board(['Xsh', '.', 'Omg', '.', '.', '.', 'Xmo', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  check('Mirror offers each pair with a stone on either square',
    legalActions(s).filter((a) => a.use === 'mirror').map((a) => [a.a, a.b]),
    [[0, 8], [2, 6]]);
  applyAction(s, { type: 'counter', use: 'mirror', a: 2, b: 6 });
  check('and they trade places, whoever owns them',
    [show(s.board)[2], show(s.board)[6]], ['Xmo', 'Omg']);
  check('Mirror is once per game', s.spent.O, true);
}

{
  // A lone stone crosses to the empty square on the far side.
  const s = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'mirror' });
  s.board = board(['.', '.', 'Omg', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'counter', use: 'mirror', a: 2, b: 6 });
  check('a lone stone crosses to the empty mirror square',
    [show(s.board)[2], show(s.board)[6]], ['.', 'Omg']);
}

// ── The other three picks ───────────────────────────────────────────────────

{
  const ending = (item, hand = ['mountain']) => {
    const s = createGame({
      handX: ['shift', 'mountain', 'magnet'], handO: hand, first: 'X', itemO: item,
    });
    s.board = board(['Xsh', '.', '.', '.', 'Omg', '.', '.', '.', '.']);
    s.player = 'O';
    applyAction(s, { type: 'select', stone: hand[0] });
    applyAction(s, { type: 'place', pos: 8 });
    return s;
  };

  const relocate = ending('relocate');
  check('Relocate reaches every free square from every stone of yours',
    legalActions(relocate).filter((a) => a.use === 'relocate').length, 12);
  applyAction(relocate, { type: 'counter', use: 'relocate', from: 4, to: 2 });
  check('and the stone moves without resolving anything',
    [show(relocate.board)[4], show(relocate.board)[2]], ['.', 'Omg']);

  const mind = ending('mind-control');
  applyAction(mind, { type: 'counter', use: 'mind-control', stones: ['mountain'] });
  check('Mind Control leaves only the stone it names',
    legalActions(mind).map((a) => a.stone), ['mountain']);
}

{
  // Rehearse resolves a stone already on the board, from where it now stands.
  const s = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'rehearse' });
  s.board = board(['Osh', '.', '.', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 4 });
  check('Rehearse offers the older stone\'s own effect menu',
    legalActions(s).filter((a) => a.use === 'rehearse').length, 4);
  applyAction(s, { type: 'counter', use: 'rehearse', pos: 0, direction: 'right', index: 0 });
  check('and it runs from that stone\'s square',
    show(s.board), ['.', 'Osh', '.', '.', 'Omo', '.', '.', '.', '.']);
}

// ── A space that switches a stone type off ──────────────────────────────────

{
  // On a Shift space, a Shift is an ordinary stone: it is placed and that is all.
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', disabled: 'shift' });
  s.board = board(['.', 'Omg', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 0 });
  check('a switched-off Shift resolves nothing and ends the turn',
    [s.phase, show(s.board)], ['select', ['Xsh', 'Omg', '.', '.', '.', '.', '.', '.', '.']]);
}

{
  // On a Magnet space, a Magnet binds nobody.
  const s = createGame({ handX: ['magnet'], handO: ['shift'], first: 'X', disabled: 'magnet' });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('a switched-off Magnet leaves every square open',
    legalActions(s).map((a) => a.pos), [0, 1, 2, 3, 5, 6, 7, 8]);
}

{
  // On a Mountain space, a Mountain is no longer a wall: it moves like anything.
  const wall = pending(['Xsh', 'Omo', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'shift' });
  applyAction(wall, { type: 'effect', direction: 'right' });
  check('a Mountain normally blocks the line', show(wall.board).slice(0, 3), ['Xsh', 'Omo', '.']);

  const off = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', disabled: 'mountain' });
  off.board = board(['.', 'Omo', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(off, { type: 'select', stone: 'shift' });
  applyAction(off, { type: 'place', pos: 0 });
  applyAction(off, { type: 'effect', direction: 'right' });
  check('and on its own space it shifts along with everything else',
    show(off.board).slice(0, 3), ['.', 'Xsh', 'Omo']);
}

{
  // It still counts towards a line -- only the effect is gone.
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', disabled: 'shift' });
  s.board = board(['Xsh', 'Xsh', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 2 });
  check('three switched-off stones in a row still win',
    [s.over, s.winner, s.reason], [true, 'X', 'line']);
}

// ── Holding more than one ───────────────────────────────────────────────────

{
  // Two Counterattacks held, one spent: both are on the menu until one goes.
  const s = createGame({
    handX: ['shift'], handO: ['mountain'], first: 'X', itemO: ['mirror', 'relocate'],
  });
  s.board = board(['Xsh', '.', '.', '.', 'Omg', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  const uses = new Set(legalActions(s).map((a) => a.use));
  check('both held items offer their choices', [...uses].sort(), ['mirror', 'pass', 'relocate']);
  applyAction(s, { type: 'counter', use: 'relocate', from: 4, to: 2 });
  check('and spending either one spends the game\'s only use', s.spent.O, true);
}

{
  // A lone name still works, and still means a set of one.
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', itemO: 'mirror' });
  check('one item reads as a set of one', s.items.O, ['mirror']);
}

{
  // Every item, played out at random, has to reach a legal finish.
  const rng = makeRng(29);
  const stuck = [];
  for (const item of ITEMS) {
    for (let g = 0; g < 40; g++) {
      const hand = () => Array.from({ length: 5 },
        () => ALL_TYPES[(rng() * ALL_TYPES.length) | 0]);
      // Every space too, since a switched-off stone changes what resolves.
      const spaces = [null, ...STONE_TYPES];
      const s = createGame({
        handX: hand(), handO: hand(), first: rng() < 0.5 ? 'X' : 'O', itemO: item,
        disabled: spaces[(rng() * spaces.length) | 0],
      });
      if (g === 0) {
        // And once with the whole list held at the same time.
        const all = createGame({ handX: hand(), handO: hand(), first: 'X', itemO: ITEMS });
        let p = 0;
        while (!all.over && p++ < 200) applyAction(all, randomAction(all, rng));
        if (!all.over) stuck.push('all five held');
      }
      let plies = 0;
      while (!s.over && plies++ < 200) applyAction(s, randomAction(s, rng));
      if (!s.over || !['X', 'O'].includes(s.winner)) stuck.push(item);
    }
  }
  check('every Counterattack plays out to a winner', [...new Set(stuck)], []);
}

console.log(failures ? `\n${failures} failing` : 'all checks pass');
if (failures) process.exit(1);
