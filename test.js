// Rules checks for the parts of engine.js that are easy to get subtly wrong:
// what a Mountain does to each movement effect, and what is and is not a legal
// choice. No dependencies; runs on Deno as-is.
//
//   node test.js

import {
  createGame, applyAction, legalActions, render, STONE_TYPES, other,
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
  sh: 'shift', 20: '2048', ro: 'rotate', sw: 'swap',
  mi: 'mimic', le: 'leech', mo: 'mountain', mg: 'magnet', sk: 'stinky',
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
  resolve(['Xsh', 'Osk', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'shift' }, { direction: 'right' }),
  ['.', 'Xsh', 'Osk', '.', '.', '.', '.', '.', '.']);

check('a stone facing a Mountain stays, and so does the one queued behind it',
  resolve(['Xsh', 'Omo', 'Osk', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'shift' }, { direction: 'right' }),
  ['Xsh', 'Omo', 'Osk', '.', '.', '.', '.', '.', '.']);

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
  resolve(['Xsh', '.', '.', '.', 'Osk', '.', '.', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['.', '.', 'Xsh', '.', '.', 'Osk', '.', '.', '.']);

check('nothing slides past a Mountain, and the far side packs on its own',
  resolve(['Xsh', 'Omo', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['Xsh', 'Omo', '.', '.', '.', '.', '.', '.', '.']);

check('a stone slides up to the Mountain and stops',
  resolve(['Xsh', '.', 'Omo', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['.', 'Xsh', 'Omo', '.', '.', '.', '.', '.', '.']);

check('every line resolves, not just the one the stone sits in',
  resolve(['Xsh', '.', '.', 'Osk', '.', '.', 'Xmo', '.', '.'],
    { at: 0, selected: '2048' }, { direction: 'right' }),
  ['.', '.', 'Xsh', '.', '.', 'Osk', 'Xmo', '.', '.']);

// ── Rotate ──────────────────────────────────────────────────────────────────

check('rotate turns the whole square with no Mountain in it',
  resolve(['Xro', 'Osk', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'rotate' }, { square: 'TL' }),
  ['.', 'Xro', '.', '.', 'Osk', '.', '.', '.', '.']);

check('a Mountain in the square blocks its follower and frees the rest',
  resolve(['Xro', 'Omo', '.', '.', 'Osk', '.', '.', '.', '.'],
    { at: 0, selected: 'rotate' }, { square: 'TL' }),
  ['Xro', 'Omo', '.', 'Osk', '.', '.', '.', '.', '.']);

// ── Swap ────────────────────────────────────────────────────────────────────

check('swap trades two lines',
  resolve(['Xsw', 'Osk', '.', '.', '.', '.', 'Xmg', '.', '.'],
    { at: 0, selected: 'swap' }, { axis: 'row', index: 2 }),
  ['Xmg', '.', '.', '.', '.', '.', 'Xsw', 'Osk', '.']);

check('a Mountain on either side of the trade keeps its square',
  resolve(['Xsw', 'Omo', '.', '.', '.', '.', 'Xmg', 'Xsk', '.'],
    { at: 0, selected: 'swap' }, { axis: 'row', index: 2 }),
  ['Xmg', 'Omo', '.', '.', '.', '.', 'Xsw', 'Xsk', '.']);

// ── Leech ───────────────────────────────────────────────────────────────────

check('leech trades places with the enemy stone it names',
  resolve(['Xle', 'Osk', '.', '.', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'leech' }, { target: 1 }),
  ['Osk', 'Xle', '.', '.', '.', '.', '.', '.', '.']);

{
  // Placement is free, and the effect is compulsory wherever it can happen.
  const s = createGame({ handX: ['leech'], handO: ['mountain'], first: 'X' });
  s.board = board(['.', 'Osk', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: 'leech' });
  check('leech may be placed on any free square',
    legalActions(s).map((a) => a.pos), [0, 2, 3, 4, 5, 6, 7, 8]);

  const away = { ...s, board: s.board.slice(), hands: { X: [], O: ['mountain'] } };
  applyAction(away, { type: 'place', pos: 8 });
  check('leech placed away from the enemy resolves nothing and ends the turn',
    [away.phase, show(away.board)[8]], ['select', 'Xle']);

  applyAction(s, { type: 'place', pos: 0 });
  check('leech placed beside an enemy stone must swap', s.phase, 'effect');
  check('and the only choice offered is that stone',
    legalActions(s), [{ type: 'effect', target: 1 }]);
}

{
  const s = pending(['Xle', 'Omo', '.', 'Osk', '.', '.', '.', '.', '.'],
    { at: 0, selected: 'leech' });
  check('an enemy Mountain is not a leech target',
    legalActions(s), [{ type: 'effect', target: 3 }]);
}

{
  const s = createGame({ handX: ['leech'], handO: ['mountain'], first: 'X' });
  s.board = board(['.', 'Omo', '.', '.', '.', '.', '.', '.', '.']);
  applyAction(s, { type: 'select', stone: 'leech' });
  applyAction(s, { type: 'place', pos: 0 });
  check('a leech with only a Mountain beside it resolves nothing', s.phase, 'select');
}

// ── Restrictions still bind ─────────────────────────────────────────────────

{
  const s = createGame({ handX: ['magnet'], handO: ['shift'], first: 'X' });
  applyAction(s, { type: 'select', stone: 'magnet' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('a Magnet still compels the opponent to place adjacent to it',
    legalActions(s).map((a) => a.pos), [1, 3, 5, 7]);
}

{
  const s = createGame({ handX: ['stinky'], handO: ['shift'], first: 'X' });
  applyAction(s, { type: 'select', stone: 'stinky' });
  applyAction(s, { type: 'place', pos: 4 });
  applyAction(s, { type: 'select', stone: 'shift' });
  check('a Stinky still forbids the squares beside it',
    legalActions(s).map((a) => a.pos), [0, 2, 6, 8]);
}

// ── A Mountain never removes a choice ───────────────────────────────────────

{
  const s = pending(['Xmo', 'Omo', 'Xmo', 'Omo', '.', 'Omo', 'Xmo', 'Omo', 'Xmo'],
    { at: 4, selected: 'shift' });
  check('shift keeps all four directions on a board full of Mountains',
    legalActions(s).length, 4);
}

// ── The pool, and a game that finishes ──────────────────────────────────────

check('Glue and Regular are gone', STONE_TYPES,
  ['shift', '2048', 'rotate', 'swap', 'mimic', 'leech', 'mountain', 'magnet', 'stinky']);

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

console.log(failures ? `\n${failures} failing` : 'all checks pass');
if (failures) process.exit(1);
