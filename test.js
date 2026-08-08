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
  sw: 'swap', mo: 'mountain', mg: 'magnet', st: 'stinky',
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

// ── Swap ────────────────────────────────────────────────────────────────────

check('swap trades places with the enemy stone it names',
  resolve(['Xsw', 'Omg', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'swap' }, { target: 1 }),
  ['Omg', 'Xsw', '.', '.', '.', '.', '.', '.', '.']);

{
  // Placement is free, and the effect is compulsory wherever it can happen.
  const s = createGame({ handX: ['swap'], handO: ['mountain'], first: 'X' });
  s.board = board(['.', 'Omg', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: 'swap' });
  check('swap may be placed on any free square',
    legalActions(s).map((a) => a.pos), [0, 2, 3, 4, 5, 6, 7, 8]);

  const away = { ...s, board: s.board.slice(), hands: { X: [], O: ['mountain'] } };
  applyAction(away, { type: 'place', pos: 8 });
  check('swap placed away from the enemy resolves nothing and ends the turn',
    [away.phase, show(away.board)[8]], ['select', 'Xsw']);

  applyAction(s, { type: 'place', pos: 0 });
  check('swap placed beside an enemy stone must swap', s.phase, 'effect');
  check('and the only choice offered is that stone',
    legalActions(s), [{ type: 'effect', target: 1 }]);
}

{
  const s = pending(['Xsw', 'Omo', '.', 'Omg', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'swap' });
  check('an enemy Mountain is not a swap target',
    legalActions(s), [{ type: 'effect', target: 3 }]);
}

{
  const s = createGame({ handX: ['swap'], handO: ['mountain'], first: 'X' });
  s.board = board(['.', 'Omo', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: 'swap' });
  applyAction(s, { type: 'place', pos: 0 });
  check('a swap with only a Mountain beside it resolves nothing', s.phase, 'select');
}

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

check('the pool is six stones', STONE_TYPES,
  ['shift', '2048', 'rotate', 'swap', 'mountain', 'magnet']);

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
  const plain = held([...empty], { at: 0, selected: 'shift', item: null });
  const superb = held([...empty], { at: 0, selected: 'shift', item: 'super-shift' });
  check('shift normally moves only its own line', legalActions(plain).length, 4);
  check('Super Shift moves any row or column', legalActions(superb).length, 12);

  const s = held(['Osh', '.', '.', '.', '.', '.', 'Xmg', '.', '.'],
    { at: 0, selected: 'shift', item: 'super-shift' });
  applyAction(s, { type: 'effect', direction: 'right', index: 2 });
  check('and it reaches a line the stone is not in',
    show(s.board), ['Osh', '.', '.', '.', '.', '.', '.', 'Xmg', '.']);
}

{
  const plain = held([...empty], { at: 0, selected: 'rotate', item: null });
  const superb = held([...empty], { at: 0, selected: 'rotate', item: 'super-rotate' });
  check('rotate normally reaches only the squares it is in', legalActions(plain).length, 1);
  check('Super Rotate reaches all four squares and the ring', legalActions(superb).length, 5);

  const s = held(['Oro', 'Xmg', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'rotate', item: 'super-rotate' });
  applyAction(s, { type: 'effect', square: 'RING' });
  check('the ring turns the eight outer squares',
    show(s.board), ['.', 'Oro', 'Xmg', '.', '.', '.', '.', '.', '.']);
}

{
  const plain = held([...empty], { at: 0, selected: '2048', item: null });
  const superb = held([...empty], { at: 0, selected: '2048', item: 'super-2048' });
  check('2048 normally offers four directions', legalActions(plain).length, 4);
  check('Super 2048 adds every second direction', legalActions(superb).length, 16);

  const s = held(['O20', '.', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: '2048', item: 'super-2048' });
  applyAction(s, { type: 'effect', direction: 'right', second: 'down' });
  check('and both run, in order',
    show(s.board), ['.', '.', '.', '.', '.', '.', '.', '.', 'O20']);
}

{
  const plain = held(['Osw', '.', '.', '.', 'Xmg', '.', '.', '.', '.'],
    { at: 0, selected: 'swap', item: null });
  const superb = held(['Osw', '.', '.', '.', 'Xmg', '.', '.', '.', '.'],
    { at: 0, selected: 'swap', item: 'super-swap' });
  check('swap normally cannot reach a diagonal', legalActions(plain).length, 0);
  check('Super Swap can', legalActions(superb), [{ type: 'effect', target: 4 }]);
}

{
  // X's Magnet at the centre pulls O to its neighbours.
  const s = createGame({ handX: ['magnet'], handO: ['mountain', 'shift'], first: 'X', itemO: 'super-mountain' });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'mountain' });
  check('Super Mountain ignores the Magnet when placing a Mountain',
    legalActions(s).map((a) => a.pos), [0, 1, 2, 3, 5, 6, 7, 8]);

  const t = createGame({ handX: ['magnet'], handO: ['mountain', 'shift'], first: 'X', itemO: 'super-mountain' });
  applyAction(t, { type: 'select', stone: 'magnet' });
  applyAction(t, { type: 'place', pos: 4 });
  applyAction(t, { type: 'select', stone: 'shift' });
  check('but not when placing anything else',
    legalActions(t).map((a) => a.pos), [1, 3, 5, 7]);
}

{
  // A Magnet binds until something replaces it, from wherever the Magnet has got
  // to by then rather than from where it was placed.
  const s = createGame({
    handX: ['shift', 'shift', 'shift'], handO: ['magnet', 'shift'], first: 'X',
  });
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'effect', direction: 'right', index: 0 });

  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 6 });

  applyAction(s, { type: 'select', stone: 'shift' });
  check('a Magnet binds the turn after it lands',
    legalActions(s).map((a) => a.pos), [3, 7]);
  applyAction(s, { type: 'place', pos: 3 });
  applyAction(s, { type: 'effect', direction: 'right', index: 1 });

  // O shifts the bottom row left, carrying its own Magnet from 6 round to 8.
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 8 });
  applyAction(s, { type: 'effect', direction: 'left', index: 2 });
  check('the Magnet rode the shift to the far corner', show(s.board)[8], 'Omg');

  applyAction(s, { type: 'select', stone: 'shift' });
  check('and it is still binding, pulling from where the Magnet is now',
    legalActions(s).map((a) => a.pos), [5]);
}

{
  const s = createGame({ handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'overtake' });
  s.board = board(['Xsh', '.', '.', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  check('Overtake asks at the end of the turn', s.phase, 'counter');
  applyAction(s, { type: 'counter', use: 'overtake', pos: 0 });
  check('and hands the stone back to its owner',
    [show(s.board)[0], s.hands.X.filter((t) => t === 'shift').length], ['.', 2]);
  check('Overtake is once per game', s.spent.O, true);
}

{
  const s = createGame({ handX: ['magnet'], handO: ['shift'], first: 'X', itemO: 'antipolar' });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('Antipolar turns the Magnet inside out',
    legalActions(s).map((a) => a.pos), [0, 2, 6, 8]);
}

{
  const s = createGame({
    handX: ['shift', 'mountain'], handO: ['mountain'], first: 'X', itemO: 'mind-control',
  });
  s.board = board(['Xsh', '.', '.', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  applyAction(s, { type: 'counter', use: 'mind-control', stone: 'mountain' });
  check('Mind Control names the stone the opponent must play',
    legalActions(s), [{ type: 'select', stone: 'mountain' }]);
}

{
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', itemO: 'uno-reverse' });
  s.board = board(['.', '.', '.', '.', '.', '.', '.', '.', 'Xmg']);
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'effect', direction: 'right' });
  check('Uno Reverse interrupts, and it is the other player choosing',
    [s.phase, toMove(s)], ['reverse', 'O']);
  applyAction(s, { type: 'reverse', use: 'uno-reverse' });
  check('reversed, the shift runs the other way',
    show(s.board), ['.', '.', 'Xsh', '.', '.', '.', '.', '.', 'Xmg']);
  check('Uno Reverse is once per game', s.spent.O, true);
}

{
  const s = held([...empty], { at: 0, selected: 'shift', item: 'super-shift', player: 'X' });
  check('a Counterattack is inert for whoever opened', legalActions(s).length, 4);
}

// ── The seat-gap Counterattacks ─────────────────────────────────────────────

{
  const s = createGame({
    handX: ['shift'], handO: ['mountain', 'mountain'], first: 'X', itemO: 'second-wind',
  });
  s.board = board(['Xsh', '.', '.', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  applyAction(s, { type: 'counter', use: 'second-wind' });
  check('Second Wind keeps the turn instead of passing it',
    [s.phase, s.player], ['select', 'O']);
}

{
  // O's Shift would run right; Fizzle stops it happening at all.
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', itemO: 'fizzle' });
  s.board = board(['.', '.', '.', '.', '.', '.', '.', '.', 'Omg']);
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'effect', direction: 'right' });
  check('Fizzle interrupts, and the other player chooses', [s.phase, toMove(s)], ['reverse', 'O']);
  applyAction(s, { type: 'reverse', use: 'fizzle' });
  check('the effect simply does not happen',
    show(s.board), ['Xsh', '.', '.', '.', '.', '.', '.', '.', 'Omg']);
  check('Fizzle is once per game', s.spent.O, true);
}

{
  // X sweeps the top row right. Anchor nails O's stone down; X's still moves.
  const s = createGame({ handX: ['2048'], handO: ['shift'], first: 'X', itemO: 'anchor' });
  s.board = board(['Omg', '.', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: '2048' });
  applyAction(s, { type: 'place', pos: 3 });
  applyAction(s, { type: 'effect', direction: 'right' });
  applyAction(s, { type: 'reverse', use: 'anchor' });
  check('Anchor holds the holder\'s stones while everything else slides',
    show(s.board), ['Omg', '.', '.', '.', '.', 'X20', '.', '.', '.']);
}

{
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', itemO: 'echo' });
  s.board = board(['.', '.', '.', '.', '.', '.', '.', '.', 'Xmg']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'effect', direction: 'right' });
  check('Echo is offered once the effect has resolved', s.phase, 'counter');
  applyAction(s, { type: 'counter', use: 'echo' });
  check('and it puts the same stone back on the effect menu', s.phase, 'effect');
  applyAction(s, { type: 'effect', direction: 'right' });
  check('so the shift runs twice in one turn',
    show(s.board), ['.', '.', 'Osh', '.', '.', '.', '.', '.', 'Xmg']);
}

{
  const s = createGame({
    handX: ['shift'], handO: ['mountain'], first: 'X', itemO: 'blind-spot',
  });
  s.board = board(['Xsh', '.', '.', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  applyAction(s, { type: 'counter', use: 'blind-spot', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('Blind Spot closes one square for the opponent',
    legalActions(s).map((a) => a.pos), [1, 2, 3, 5, 6, 7]);
}

{
  // X's Magnet pulls O in as usual; with Bipolar it also pushes X off its own
  // neighbours on X's next turn.
  const s = createGame({
    handX: ['magnet', 'shift'], handO: ['shift', 'shift'], first: 'X', itemO: 'bipolar',
  });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('the Magnet still pulls the other player in',
    legalActions(s).map((a) => a.pos), [1, 3, 5, 7]);
  applyAction(s, { type: 'place', pos: 1 });
  applyAction(s, { type: 'effect', direction: 'right', index: 0 });

  applyAction(s, { type: 'select', stone: 'shift' });
  check('Bipolar pushes the Magnet\'s owner off its neighbours',
    legalActions(s).map((a) => a.pos), [0, 6, 8]);
}

{
  // O borrows X's shift and runs it on a line of O's own choosing.
  const s = createGame({ handX: ['shift'], handO: ['shift'], first: 'X', itemO: 'encore' });
  s.board = board(['.', '.', '.', '.', '.', '.', 'Omg', '.', '.']);
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'effect', direction: 'right' });
  check('Encore asks after the effect has run, and the other player chooses',
    [s.phase, toMove(s), show(s.board)[1]], ['encore', 'O', 'Xsh']);
  check('and it offers every line and direction of that same effect',
    legalActions(s).length, 13);
  applyAction(s, { type: 'encore', direction: 'right', index: 2 });
  check('the borrowed shift moves a line the opponent never touched',
    show(s.board), ['.', 'Xsh', '.', '.', '.', '.', '.', 'Omg', '.']);
  check('Encore is once per game', s.spent.O, true);
}

{
  // X is one square from a line; Obstruction turns that line into a loss.
  const s = createGame({
    handX: ['mountain'], handO: ['mountain'], first: 'X', itemO: 'obstruction',
  });
  s.board = board(['Xmo', 'Xmo', '.', '.', '.', '.', '.', '.', '.']);
  s.player = 'O';
  applyAction(s, { type: 'select', stone: 'mountain' });
  applyAction(s, { type: 'place', pos: 8 });
  check('Obstruction is declared at the end of the turn', s.phase, 'counter');
  applyAction(s, { type: 'counter', use: 'obstruction' });
  check('and it is once per game', s.spent.O, true);

  applyAction(s, { type: 'select', stone: 'mountain' });
  check('the opponent may still complete the line', legalActions(s).some((a) => a.pos === 2), true);
  applyAction(s, { type: 'place', pos: 2 });
  check('but three in a row loses it for them',
    [s.over, s.winner, s.reason], [true, 'O', 'line']);
}

// ── Stinky, and the one-turn variants ──────────────────────────────────────

{
  // A Stinky is the Magnet's mirror: the opponent must place away from it.
  const s = createGame({ handX: ['stinky'], handO: ['shift'], first: 'X' });
  applyAction(s, { type: 'select', stone: 'stinky' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('a Stinky pushes the opponent off its neighbours',
    legalActions(s).map((a) => a.pos), [0, 2, 6, 8]);
}

{
  // And Antipolar turns that inside out, the same way it does a Magnet.
  const s = createGame({ handX: ['stinky'], handO: ['shift'], first: 'X', itemO: 'antipolar' });
  applyAction(s, { type: 'select', stone: 'stinky' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('Antipolar turns a Stinky into a Magnet',
    legalActions(s).map((a) => a.pos), [1, 3, 5, 7]);
}

{
  // Two turns on: the Stinky is still in force, and only a replacement clears it.
  const s = createGame({
    handX: ['stinky', 'shift'], handO: ['shift', 'shift'], first: 'X',
  });
  applyAction(s, { type: 'select', stone: 'stinky' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 8 });
  applyAction(s, { type: 'effect', direction: 'right', index: 2 });
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'effect', direction: 'right', index: 1 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('a Stinky is still pushing two turns later',
    legalActions(s).map((a) => a.pos).includes(1), false);
}

{
  const one = createGame({
    handX: ['stinky', 'shift'], handO: ['shift', 'shift'], first: 'X', oneTurnStinky: true,
  });
  applyAction(one, { type: 'select', stone: 'stinky' });
  applyAction(one, { type: 'place', pos: 0 });
  applyAction(one, { type: 'select', stone: 'shift' });
  applyAction(one, { type: 'place', pos: 8 });
  applyAction(one, { type: 'effect', direction: 'right', index: 2 });
  applyAction(one, { type: 'select', stone: 'shift' });
  applyAction(one, { type: 'place', pos: 4 });
  applyAction(one, { type: 'effect', direction: 'right', index: 1 });
  applyAction(one, { type: 'select', stone: 'shift' });
  check('under the one-turn variant it has already let go',
    legalActions(one).map((a) => a.pos).includes(1), true);
}

{
  const s = createGame({
    handX: ['magnet', 'shift'], handO: ['shift', 'shift'], first: 'X', oneTurnMagnet: true,
  });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 1 });
  applyAction(s, { type: 'effect', direction: 'right', index: 0 });
  applyAction(s, { type: 'select', stone: 'shift' });
  applyAction(s, { type: 'place', pos: 6 });
  applyAction(s, { type: 'effect', direction: 'up', index: 0 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('and the one-turn Magnet lets go too', legalActions(s).length, 6);
}

{
  // A restriction stone of the other kind replaces the one in force.
  const s = createGame({
    handX: ['magnet', 'shift'], handO: ['stinky', 'shift'], first: 'X',
  });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'select', stone: 'stinky' });
  check('a Magnet holds the opponent while they answer it',
    legalActions(s).map((a) => a.pos), [1, 3]);
  applyAction(s, { type: 'place', pos: 1 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('and their Stinky takes over the restriction',
    legalActions(s).map((a) => a.pos), [3, 5, 6, 7, 8]);
}

{
  // Every item, played out at random, has to reach a legal finish.
  const rng = makeRng(29);
  const stuck = [];
  for (const item of ITEMS) {
    for (let g = 0; g < 40; g++) {
      const hand = () => Array.from({ length: 5 },
        () => ALL_TYPES[(rng() * ALL_TYPES.length) | 0]);
      const s = createGame({
        handX: hand(), handO: hand(), first: rng() < 0.5 ? 'X' : 'O', itemO: item,
      });
      let plies = 0;
      while (!s.over && plies++ < 200) applyAction(s, randomAction(s, rng));
      if (!s.over || !['X', 'O'].includes(s.winner)) stuck.push(item);
    }
  }
  check('every Counterattack plays out to a winner', [...new Set(stuck)], []);
}

console.log(failures ? `\n${failures} failing` : 'all checks pass');
if (failures) process.exit(1);
