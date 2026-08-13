// Rules checks for the parts of engine.js that are easy to get subtly wrong:
// what a Mountain does to each movement effect, and what is and is not a legal
// choice. No dependencies; runs on Deno as-is.
//
//   node test.js

import {
  createGame, applyAction, legalActions, render, STONE_TYPES, ITEMS, other, toMove,
} from './engine.js';
import { existsSync } from 'node:fs';

import { makeRng, randomAction } from './ai.js';
import { assign, duelChance, loadHands, newRoster, swap } from './roster.js';
import {
  ADJACENT, BOARD_SPACES, CORNERS, LINES, LINES_AT, LINE_CLEARS, N_SPACES, REGULAR,
  SPACES, SPACE_BOARDS, STAR, SUBBOARDS, claimable, setLayout,
} from './board.js';
import {
  allocate, bestPicks, newCampaign, playRound, posValue,
  placementValue, resolve as pairOff, scoreAndClear, setPos, setRules, stakePerDuel,
  tailTable, takeChance, winsNeeded,
} from './campaign.js';

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

check('the pool is six stones', STONE_TYPES,
  ['shift', '2048', 'rotate', 'mountain', 'magnet', 'stinky']);

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
        () => STONE_TYPES[(rng() * STONE_TYPES.length) | 0]);
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

// ── The campaign board and round ────────────────────────────────────────────

{
  // Geometry. Four boards of nine sharing one square with each neighbour, and a
  // hole in the middle that belongs to nobody.
  check('regular spaces', REGULAR.length, 32);
  check('spaces in total', N_SPACES, 33);
  check('the star belongs to no board', SPACE_BOARDS[STAR], []);
  check('nine squares to a board', SUBBOARDS.map((b) => BOARD_SPACES[b].length), [9, 9, 9, 9]);
  check('four shared squares', CORNERS.length, 4);
  check('a shared square belongs to two boards', CORNERS.map((i) => SPACE_BOARDS[i].length), [2, 2, 2, 2]);
  check('every other square to one board',
    REGULAR.filter((i) => SPACE_BOARDS[i].length !== 1).sort((a, b) => a - b), CORNERS);
  check('every square is on some line', SPACES.filter((s) => !LINES_AT[s.i].length), []);
  check('lines of three', LINES.length, 68);
  check('lines through the star', LINES_AT[STAR].length, 8);

  // Adjacency is orthogonal, mutual, and never touches the star.
  const asymmetric = REGULAR.filter((i) => ADJACENT[i].some((j) => !ADJACENT[j].includes(i)));
  check('adjacency is mutual', asymmetric, []);
  check('nothing is adjacent to the star', REGULAR.filter((i) => ADJACENT[i].includes(STAR)), []);
  check('the star is adjacent to nothing', ADJACENT[STAR], []);
  const diagonal = REGULAR.filter((i) => ADJACENT[i].some((j) =>
    Math.abs(SPACES[i].x - SPACES[j].x) + Math.abs(SPACES[i].y - SPACES[j].y) !== 1));
  check('adjacency is not diagonal', diagonal, []);

  // A scored line clears the boards its symbols stood on, and the star with them
  // if it was one of the three.
  const cross = LINES.findIndex((l) => l.includes(STAR));
  check('a line through the star clears the star', LINE_CLEARS[cross].includes(STAR), true);
  check('a line inside one board clears nine squares and no more',
    LINE_CLEARS[LINES.findIndex((l) => l.every((j) => j !== STAR
      && SPACE_BOARDS[j].length === 1 && SPACE_BOARDS[j][0] === SPACE_BOARDS[l[0]][0]))].length, 9);
}

{
  // Taking a space. Each side's power is its unpaired players plus its won duels,
  // and the attack needs strictly more -- checked here against the rule as written.
  const asWritten = (a, d, pairs, spare, won) =>
    (a - pairs) + won > spare + (pairs - won);
  const mismatch = [];
  for (let a = 1; a <= 10; a++) for (let d = 0; d <= 10; d++) {
    const pairs = Math.min(a, d), spare = d - pairs;
    for (let won = 0; won <= pairs; won++) {
      if (asWritten(a, d, pairs, spare, won) !== (won >= winsNeeded(a, pairs, spare))) {
        mismatch.push([a, d, won]);
      }
    }
  }
  check('the threshold is the rule as written', mismatch, []);

  // Two ways of asking whether a player's own game mattered, and they disagree.
  // Afterwards: would this one result, flipped, have flipped the square? Two
  // attackers against two defenders who both won is a square no single result would
  // have changed -- the attack needed both duels and got neither -- so afterwards
  // nobody decided it. Beforehand each of the four had an even chance of being the
  // one who did, because one duel going the other way puts the square on the last.
  check('two against two needs both duels', winsNeeded(2, 2, 0), 2);
  check('and beforehand each of them has an even chance of deciding it',
    stakePerDuel(2, 2, 0, 0.5), 0.5);
  check('one against one always decides it', stakePerDuel(1, 1, 0, 0.5), 1);
  // Level numbers keep every duel worth between a third and a half of the square.
  check('level numbers leave every duel with a real chance of deciding it',
    [2, 3, 4, 5, 6].map((n) => stakePerDuel(n, n, 0, 0.5).toFixed(3)),
    ['0.500', '0.500', '0.375', '0.375', '0.313']);
  // Nobody has a stake where the numbers already settled it.
  check('a shut-out square puts nothing at stake', stakePerDuel(1, 1, 3, 0.5), 0);
  check('an overwhelmed square puts nothing at stake', stakePerDuel(9, 2, 0, 0.5), 0);

  const T = tailTable(0.5, 24);
  const chance = (a, d) => takeChance(a, Math.min(a, d), d - Math.min(a, d), T);

  check('an undefended square is taken by anyone', [1, 2, 5].map((a) => chance(a, 0)), [1, 1, 1]);
  check('twice the defenders and one more takes it outright',
    [0, 1, 2, 3, 5].map((d) => chance(2 * d + 1, d)), [1, 1, 1, 1, 1]);
  check('twice the attackers denies it outright',
    [1, 2, 3, 5].map((a) => chance(a, 2 * a)), [0, 0, 0, 0]);
  check('and so does anything more',
    [1, 2, 3].map((a) => chance(a, 2 * a + 3)), [0, 0, 0]);
  check('one against one is a coin flip', chance(1, 1), 0.5);
  // Level numbers are a coin flip when they are odd and better than that for the
  // defence when they are even, since the attack then needs a strict majority of an
  // even number of duels.
  check('level numbers never favour the attack',
    [2, 3, 4, 5, 6, 7].map((n) => chance(n, n).toFixed(4)),
    ['0.2500', '0.5000', '0.3125', '0.5000', '0.3438', '0.5000']);

  // Both of these were true under the old rule and are not under this one; they are
  // checked so that a change back would be noticed.
  const dominated = [];
  for (const p of [0.5, 0.6]) {
    const table = tailTable(p, 24);
    const at = (a, d) => takeChance(a, Math.min(a, d), d - Math.min(a, d), table);
    for (let a = 2; a <= 12; a++) for (let d = 0; d <= 12; d++) {
      if (at(a, d) < at(a - 1, d) - 1e-12) dominated.push([p, a, d]);
    }
  }
  check('another attacker never makes a square harder to take', dominated, []);
  const helpless = [];
  for (let d = 1; d <= 8; d++) if (chance(1, d) >= chance(1, d + 1) && chance(1, d) === chance(1, 1) && d > 1) helpless.push(d);
  check('massing defenders against one attacker is not futile', helpless, []);

  // Monotone in the defence as well, which is what makes the price list a price list.
  const wrongWay = [];
  for (let a = 1; a <= 12; a++) for (let d = 0; d < 12; d++) {
    if (chance(a, d + 1) > chance(a, d) + 1e-12) wrongWay.push([a, d]);
  }
  check('another defender never makes a square easier to take', wrongWay, []);
}

{
  // Pairing, and what a defender with nobody to fight may do.
  const alloc = (spec) => {
    const v = new Int32Array(N_SPACES);
    for (const [nm, n] of Object.entries(spec)) v[SPACES.find((s) => s.name === nm).i] = n;
    return v;
  };
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  const total = (v) => REGULAR.reduce((n, i) => n + v[i], 0);
  const flat = new Float64Array(N_SPACES).fill(1);
  const T = tailTable(0.5, 24);

  const A = alloc({ c3: 1, e3: 4, c5: 2 }), D = alloc({ c3: 5, e3: 1, b5: 3 });

  const plain = pairOff(A, D, 'none');
  check('without the step, a square pairs off what stands on it',
    ['c3', 'e3', 'c5', 'b5'].map((nm) => plain.pairs[idx(nm)]), [1, 1, 0, 0]);
  check('and the rest are spare where they stand',
    ['c3', 'e3', 'c5', 'b5'].map((nm) => plain.spare[idx(nm)]), [4, 0, 0, 3]);

  const stepped = pairOff(A, D, 'forced', flat, T);
  // b5's three spares reach c5, which has two unpaired attackers, and pair with both.
  check('with the step, spare defenders reach the attackers next door', stepped.pairs[idx('c5')], 2);
  check('and are no longer spare where they came from', stepped.spare[idx('b5')], 1);
  check('a defender still only fights once', total(stepped.pairs) <= total(D), true);
  check('and only one attacker each', REGULAR.every((i) => stepped.pairs[i] <= A[i]), true);

  // The destination has to be one where the attackers hold the majority.
  const even = pairOff(alloc({ c5: 2 }), alloc({ c5: 2, b5: 4 }), 'forced', flat, T);
  check('no step onto a square the attackers do not outnumber', even.pairs[idx('c5')], 2);

  // Forced means forced, even where the defence would rather stand still.
  const forced = pairOff(alloc({ c5: 3 }), alloc({ b5: 3 }), 'forced', flat, T);
  check('a defender may not stand idle within reach of an unpaired attacker', forced.pairs[idx('c5')], 3);

  // One neighbour cannot cover two needy squares beyond its own numbers.
  const shared = pairOff(alloc({ b5: 2, c4: 2 }), alloc({ b4: 3 }), 'forced', flat, T);
  check('spare defenders are not counted twice', total(shared.pairs), 3);

  // Optional means the defence declines a step that would lose it a square. Four
  // spare defenders on b5 hold b5 against nothing; sending them to c5 to face three
  // attackers is a fight they do not need, and stepping is worth nothing at b5.
  const choice = pairOff(alloc({ c5: 3 }), alloc({ b5: 4 }), 'optional', flat, T);
  check('an optional step is only taken where it helps', choice.pairs[idx('c5')] <= 3, true);
  const kept = choice.spare[idx('b5')] + choice.pairs[idx('c5')];
  check('and every defender is still accounted for', kept, 4);
}

{
  setRules({ clear: 'boards' });
  // Scoring and clearing.
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  const board = (names, me = 1) => {
    const b = new Uint8Array(N_SPACES);
    for (const nm of names) b[idx(nm)] = me;
    return b;
  };
  // c3-d3-e3 runs across the top of the middle: two shared corners and one square
  // of the north board, so it is three boards' worth of clearing.
  const line = board(['c3', 'd3', 'e3']);
  line[idx('a4')] = 2;
  const scored = scoreAndClear(line, 1);
  check('a line scores a point', scored.points, 1);
  check('and clears the boards it stood on', ['c3', 'd3', 'e3'].map((nm) => line[idx(nm)]), [0, 0, 0]);
  check('including the other side\'s symbols in them', line[idx('a4')], 0);

  check('four in a row is two points', scoreAndClear(board(['b4', 'c4', 'd4', 'e4']), 1).points, 2);
  check('a cross is two points', scoreAndClear(board(['c3', 'd3', 'e3', 'd2', 'd4']), 1).points, 2);
  check('two of a line is nothing', scoreAndClear(board(['c3', 'd3']), 1).points, 0);
}

{
  // Placing the marks: one square per board, and a shared corner may be claimed
  // for either of the two boards it belongs to -- which is what lets a line be
  // built out of a single round.
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  const legal = (picks) => picks.length <= 4 && claimable(picks);
  check('a line across three boards can be claimed at once', claimable(['c3', 'd3', 'e3'].map(idx)), true);
  check('three squares of one board cannot', claimable(['c1', 'd1', 'e1'].map(idx)), false);
  check('two shared corners of the same board can, one each', claimable(['c3', 'e3'].map(idx)), true);

  setPos([0.03, 0.12]);
  const marks = new Uint8Array(N_SPACES);
  const base = posValue(marks, 1, 2);
  const gain = new Float64Array(N_SPACES);
  for (const i of REGULAR) gain[i] = placementValue(marks, 1, 2, [i], base);
  const taken = ['c3', 'd3', 'e3', 'c5', 'd5', 'e5', 'b4', 'f4'].map(idx);
  check('the placement is legal', legal(bestPicks(marks, 1, 2, taken, gain, base).picks), true);

  // A line and nothing else on offer is taken, one square claimed for each of the
  // three boards involved.
  const only = bestPicks(marks, 1, 2, ['c3', 'd3', 'e3'].map(idx), gain, base);
  check('a line on offer is claimed whole', only.picks.slice().sort((a, b) => a - b),
    ['c3', 'd3', 'e3'].map(idx).sort((a, b) => a - b));
  const placed = new Uint8Array(N_SPACES);
  for (const i of only.picks) placed[i] = 1;
  check('and scores', scoreAndClear(placed, 1).points, 1);

  // Nothing taken means nothing to place, which is what flips the star.
  check('nothing won, nothing placed', bestPicks(marks, 1, 2, [], gain, base).picks, []);
}

{
  // The round, played out. Every position a campaign passes through has to obey
  // the invariants, whatever the numbers.
  const cfg = {
    size: 12, skill: 0.5, targets: 14, defence: 'plan', attack: 'plan',
    duels: 'coin', restart: 0, step: 'optional', layout: 'pinwheel', clear: 'boards', fill: false, pos: [null, [0.03, 0.12], [0.03, 0.12]],
  };
  const tables = [null, tailTable(0.5, 13), tailTable(0.5, 13)];
  const rng = makeRng(31);
  const st = newCampaign(0);
  const bad = [];
  for (let r = 0; r < 120; r++) {
    const before = st.marks.slice();
    const me = ((st.round + st.first) % 2) + 1;
    const { A, D, shape: { pairs }, free } = allocate(st, cfg, rng, tables);
    if (free.length) {
      if (REGULAR.reduce((n, i) => n + A[i], 0) !== cfg.size) bad.push(`round ${r}: attackers not all placed`);
      if (REGULAR.reduce((n, i) => n + D[i], 0) !== cfg.size) bad.push(`round ${r}: defenders not all placed`);
      if (REGULAR.some((i) => A[i] && before[i])) bad.push(`round ${r}: attacked an occupied space`);
      if (REGULAR.some((i) => pairs[i] > A[i])) bad.push(`round ${r}: more pairs than attackers`);
      if (REGULAR.reduce((n, i) => n + pairs[i], 0) > cfg.size) bad.push(`round ${r}: more pairs than defenders`);
      if (A[STAR] || D[STAR]) bad.push(`round ${r}: someone stood on the star`);
    }
    const { picks, flipped, points } = playRound(st, cfg, rng, tables, null);
    if (!claimable(picks)) bad.push(`round ${r}: illegal claim`);
    if (picks.some((i) => before[i])) bad.push(`round ${r}: marked an occupied space`);
    // A flip can complete a line through the star, and then the score clears it
    // again, so the star only has to be the attacker's if nothing scored.
    if (flipped && !points && st.marks[STAR] !== me) bad.push(`round ${r}: star did not flip`);
    if (flipped !== !picks.length) bad.push(`round ${r}: flipped with marks placed`);
    if (picks.length && LINES.some((l) => l.every((j) => st.marks[j] && st.marks[j] === st.marks[l[0]])
      && !l.some((j) => st.marks[j] === 0))) bad.push(`round ${r}: a line was left standing`);
  }
  check('a hundred and twenty rounds hold the invariants', bad.slice(0, 4), []);
}

// ── Hands that change hands ─────────────────────────────────────────────────

if (existsSync('results/hands.json')) {
  const pool = loadHands('results/hands.json');
  const rng = makeRng(4242);

  check('every hand of five is in the table', pool.hands.length, 252);
  check('a hand is one swap from itself and its neighbours',
    pool.neighbours.every((ns, i) => ns.includes(i)), true);
  check('a chosen swap never leaves a player worse off',
    pool.bestSwap.every((j, i) => pool.strength[j] >= pool.strength[i]), true);
  check('the best hand cannot be improved', pool.bestSwap[pool.top], pool.top);
  check('a duel between equal hands is a coin flip', duelChance(0.4, 0.4), 0.5);
  check('and a better hand wins more often', duelChance(1, 0) > 0.5, true);

  // A roster keeps its size, and a chosen swap only ever climbs.
  const roster = newRoster(12, pool, rng);
  check('a roster has one hand per player', roster.length, 12);
  const before = roster.map((h) => pool.strength[h]);
  for (let k = 0; k < roster.length; k++) swap(roster, k, pool, rng, 'choose');
  check('a chosen swap climbs for everyone',
    roster.every((h, k) => pool.strength[h] >= before[k]), true);
  check('and the roster is still the same size', roster.length, 12);

  // Dealing players out to squares uses each of them once and no more.
  const counts = new Int32Array(N_SPACES);
  const order = REGULAR.slice(0, 4);
  order.forEach((i, k) => { counts[i] = k + 1; });          // 1 + 2 + 3 + 4 = 10 of 12
  const dealt = assign(order, counts, roster, pool);
  const used = order.flatMap((i) => dealt.at.get(i) ?? []);
  check('every player is dealt out at most once',
    new Set([...used, ...dealt.idle]).size, roster.length);
  check('and the counts are honoured', order.map((i) => dealt.at.get(i).length), [1, 2, 3, 4]);
  check('with the rest standing idle', dealt.idle.length, 2);
  // The best hands go where the most is at stake, which is the first square in `order`.
  check('the best player goes to the first square',
    dealt.at.get(order[0])[0],
    roster.map((h, k) => k).sort((a, b) => pool.strength[roster[b]] - pool.strength[roster[a]])[0]);
}

console.log(failures ? `\n${failures} failing` : 'all checks pass');
if (failures) process.exit(1);
