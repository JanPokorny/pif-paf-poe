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
import { assign, duelChance, loadHands, newRoster, swap, swapTarget } from './roster.js';
import {
  ADJACENT, LINES, LINES_AT, LINE_ZONES, N_SPACES, SPACES, SPACE_IDS, SPACE_ZONE,
  ZONES, ZONE_SPACES, claimable, setArena,
} from './arena.js';
import {
  CARD_WORTH, allocate, bestPicks, newCampaign, playRound, posValue,
  placementValue, resolve as pairOff, scoreAndClear, setPos, stakePerDuel,
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

// ── The arena and the round ─────────────────────────────────────────────────

{
  // Geometry. Zones tile the arena, so every space belongs to exactly one, and both
  // sizes are built by the same rule.
  setArena('small');
  check('spaces on the small arena', N_SPACES, 36);
  check('four zones of nine', ZONES.map((z) => ZONE_SPACES[z].length), [9, 9, 9, 9]);
  check('lines of three', LINES.length, 80);
  check('every space is on some line', SPACES.filter((s) => !LINES_AT[s.i].length), []);
  check('every space belongs to one zone',
    SPACES.filter((s) => !ZONE_SPACES[SPACE_ZONE[s.i]].includes(s.i)), []);

  // Adjacency is orthogonal and mutual.
  check('adjacency is mutual',
    SPACE_IDS.filter((i) => ADJACENT[i].some((j) => !ADJACENT[j].includes(i))), []);
  check('adjacency is not diagonal', SPACE_IDS.filter((i) => ADJACENT[i].some((j) =>
    Math.abs(SPACES[i].x - SPACES[j].x) + Math.abs(SPACES[i].y - SPACES[j].y) !== 1)), []);

  // A line of three can cross three zones, which is what lets one be built inside a
  // single round: it has to cross both boundaries, on different steps.
  check('some line crosses three zones', LINE_ZONES.filter((z) => z.length === 3).length > 0, true);
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  const anti = ['c5', 'd4', 'e3'].map(idx).sort((a, b) => a - b).join();
  check('c5-d4-e3 is one of them', LINE_ZONES[LINES.findIndex((l) =>
    l.slice().sort((a, b) => a - b).join() === anti)].length, 3);

  setArena('big');
  check('spaces on the big arena', N_SPACES, 81);
  check('nine zones of nine', ZONES.length, 9);
  check('lines of three', LINES.length, 224);
  setArena('small');
}

{
  // Taking a space. Each side's power is its unpaired players plus its won duels, and
  // the attack needs strictly more -- checked here against the rule as written.
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

  // Two ways of asking whether a player's own game mattered, and they disagree case by
  // case. Afterwards: would this one result, flipped, have flipped the space? Two
  // attackers against two defenders who both won is a space no single result would have
  // changed. Beforehand each of the four had an even chance of being the one who did.
  check('two against two needs both duels', winsNeeded(2, 2, 0), 2);
  check('and beforehand each of them has an even chance of deciding it',
    stakePerDuel(2, 2, 0, 0.5), 0.5);
  check('one against one always decides it', stakePerDuel(1, 1, 0, 0.5), 1);
  check('level numbers leave every duel with a real chance of deciding it',
    [2, 3, 4, 5, 6].map((n) => stakePerDuel(n, n, 0, 0.5).toFixed(3)),
    ['0.500', '0.500', '0.375', '0.375', '0.313']);
  check('a shut-out space puts nothing at stake', stakePerDuel(1, 1, 3, 0.5), 0);
  check('an overwhelmed space puts nothing at stake', stakePerDuel(9, 2, 0, 0.5), 0);

  const T = tailTable(0.5, 24);
  const chance = (a, d) => takeChance(a, Math.min(a, d), d - Math.min(a, d), T);

  check('an undefended space is taken by anyone', [1, 2, 5].map((a) => chance(a, 0)), [1, 1, 1]);
  check('twice the defenders and one more takes it outright',
    [0, 1, 2, 3, 5].map((d) => chance(2 * d + 1, d)), [1, 1, 1, 1, 1]);
  check('twice the attackers denies it outright',
    [1, 2, 3, 5].map((a) => chance(a, 2 * a)), [0, 0, 0, 0]);
  check('and so does anything more',
    [1, 2, 3].map((a) => chance(a, 2 * a + 3)), [0, 0, 0]);
  check('one against one is a coin flip', chance(1, 1), 0.5);
  // Level numbers are a coin flip when odd and better than that for the defence when
  // even, since the attack then needs a strict majority of an even number of duels.
  check('level numbers never favour the attack',
    [2, 3, 4, 5, 6, 7].map((n) => chance(n, n).toFixed(4)),
    ['0.2500', '0.5000', '0.3125', '0.5000', '0.3438', '0.5000']);

  const dominated = [];
  for (const p of [0.5, 0.6]) {
    const table = tailTable(p, 24);
    const at = (a, d) => takeChance(a, Math.min(a, d), d - Math.min(a, d), table);
    for (let a = 2; a <= 12; a++) for (let d = 0; d <= 12; d++) {
      if (at(a, d) < at(a - 1, d) - 1e-12) dominated.push([p, a, d]);
    }
  }
  check('another attacker never makes a space harder to take', dominated, []);
  const wrongWay = [];
  for (let a = 1; a <= 12; a++) for (let d = 0; d < 12; d++) {
    if (chance(a, d + 1) > chance(a, d) + 1e-12) wrongWay.push([a, d]);
  }
  check('another defender never makes a space easier to take', wrongWay, []);
}

{
  // Pairing, and the step a defender with nobody to fight has to take.
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  const alloc = (spec) => {
    const v = new Int32Array(N_SPACES);
    for (const [nm, n] of Object.entries(spec)) v[idx(nm)] = n;
    return v;
  };
  const total = (v) => SPACE_IDS.reduce((n, i) => n + v[i], 0);

  const stepped = pairOff(alloc({ c3: 1, e3: 4, c5: 2 }), alloc({ c3: 5, e3: 1, b5: 3 }));
  check('a space pairs off what stands on it',
    ['c3', 'e3'].map((nm) => stepped.pairs[idx(nm)]), [1, 1]);
  // b5's three spares reach c5, which has two unpaired attackers, and pair with both.
  check('spare defenders reach the attackers next door', stepped.pairs[idx('c5')], 2);
  check('and are no longer spare where they came from', stepped.spare[idx('b5')], 1);
  check('a defender still only fights once', total(stepped.pairs) <= 9, true);
  check('and only one attacker each',
    SPACE_IDS.every((i) => stepped.pairs[i] <= alloc({ c3: 1, e3: 4, c5: 2 })[i]), true);

  // The destination has to be one where the attackers hold the majority.
  const even = pairOff(alloc({ c5: 2 }), alloc({ c5: 2, b5: 4 }));
  check('no step onto a space the attackers do not outnumber', even.pairs[idx('c5')], 2);

  // Must means must, even where the defence would rather stand still.
  const forced = pairOff(alloc({ c5: 3 }), alloc({ b5: 3 }));
  check('a defender may not stand idle within reach of an unpaired attacker',
    forced.pairs[idx('c5')], 3);

  // One neighbour cannot cover two needy spaces beyond its own numbers.
  const shared = pairOff(alloc({ b5: 2, c4: 2 }), alloc({ b4: 3 }));
  check('spare defenders are not counted twice', total(shared.pairs), 3);
}

{
  // Scoring and clearing: n lines are worth n squared, and each one takes a zone with it.
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  const arena = (names, me = 1) => {
    const b = new Uint8Array(N_SPACES);
    for (const nm of names) b[idx(nm)] = me;
    return b;
  };

  // a1-b1-c1 sits inside one zone, so that zone is what it costs.
  const inside = arena(['a1', 'b1', 'c1']);
  inside[idx('b2')] = 2;
  const scored = scoreAndClear(inside, 1);
  check('a line scores a point', scored.points, 1);
  check('and clears one whole zone', scored.cleared, 9);
  check('taking its own symbols with it',
    ['a1', 'b1', 'c1'].map((nm) => inside[idx(nm)]), [0, 0, 0]);
  check('and the other side\'s in that zone', inside[idx('b2')], 0);

  // c1-d1-e1 crosses two zones, and the attack clears whichever costs it least and the
  // other team most: two enemy symbols in the right-hand zone settle it.
  const across = arena(['c1', 'd1', 'e1']);
  across[idx('e2')] = 2;
  across[idx('f2')] = 2;
  scoreAndClear(across, 1);
  check('a line across two zones clears only one of them',
    [across[idx('c1')], across[idx('d1')], across[idx('e2')]], [1, 0, 0]);

  check('two lines in a round are worth four',
    scoreAndClear(arena(['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3']), 1).points >= 4, true);
  check('a cross is two lines and so four points',
    scoreAndClear(arena(['b4', 'c4', 'd4', 'c3', 'c5']), 1).points, 4);
  check('two of a line is nothing', scoreAndClear(arena(['c3', 'd3']), 1).points, 0);

  // A line already standing is something normal play never shows posValue, because a line
  // is scored and cleared the moment it is made -- but a seeded opening could contain one,
  // and the lookup used to run off the end of the weights and poison everything with NaN.
  setPos([0.03, 0.12]);
  check('a standing line does not poison the valuation',
    Number.isFinite(posValue(arena(['a1', 'b1', 'c1']), 1, 2)), true);
  check('and it is worth more than two in a row',
    posValue(arena(['a1', 'b1', 'c1']), 1, 2) > posValue(arena(['a1', 'b1']), 1, 2), true);
}

{
  // Placing the marks: one space per zone, so a set can be marked in one round exactly
  // when no two of them share a zone.
  const idx = (nm) => SPACES.find((s) => s.name === nm).i;
  check('a line across three zones can be claimed at once',
    claimable(['e3', 'd4', 'c5'].map(idx)), true);
  check('three spaces of one zone cannot', claimable(['a1', 'b1', 'c1'].map(idx)), false);
  check('two spaces of different zones can', claimable(['a1', 'd1'].map(idx)), true);

  setPos([0.03, 0.12]);
  const marks = new Uint8Array(N_SPACES);
  const base = posValue(marks, 1, 2);
  const gain = new Float64Array(N_SPACES);
  for (const i of SPACE_IDS) gain[i] = placementValue(marks, 1, 2, [i], base);

  const taken = ['e3', 'd4', 'c5', 'a1', 'f6'].map(idx);
  const picks = bestPicks(marks, 1, 2, taken, gain, base).picks;
  check('the placement is legal', picks.length <= 4 && claimable(picks), true);

  // A line and nothing else on offer is taken whole, one space in each of its zones.
  const only = bestPicks(marks, 1, 2, ['e3', 'd4', 'c5'].map(idx), gain, base);
  check('a line on offer is claimed whole', only.picks.slice().sort((a, b) => a - b),
    ['e3', 'd4', 'c5'].map(idx).sort((a, b) => a - b));
  const placed = new Uint8Array(N_SPACES);
  for (const i of only.picks) placed[i] = 1;
  check('and scores', scoreAndClear(placed, 1).points, 1);

  check('nothing won, nothing placed', bestPicks(marks, 1, 2, [], gain, base).picks, []);
}

if (existsSync('results/hands-vetoes.json')) {
  // The round, played out. Every position a campaign passes through has to obey the
  // invariants, whatever the numbers.
  const pool = loadHands('results/hands-vetoes.json');
  const cfg = {
    size: 12, targets: 14, defence: 'plan', attack: 'plan', duels: 'coin', restart: 0,
    arena: 'small', horizon: 24, pool, pos: [0.03, 0.12], seed_marks: 4, seed_handicap: 2,
  };
  setArena('small');
  const tables = [null, tailTable(0.72, 13), tailTable(0.72, 13)];
  const rng = makeRng(31);
  const st = newCampaign(0, cfg, rng);
  const bad = [];
  for (let r = 0; r < 120; r++) {
    const before = st.marks.slice();
    const { A, D, shape: { pairs }, free } = allocate(st, cfg, rng, tables);
    if (free.length) {
      const sum = (X) => SPACE_IDS.reduce((n, i) => n + X[i], 0);
      if (sum(A) !== cfg.size) bad.push(`round ${r}: attackers not all placed`);
      if (sum(D) !== cfg.size) bad.push(`round ${r}: defenders not all placed`);
      if (SPACE_IDS.some((i) => A[i] && before[i])) bad.push(`round ${r}: attacked an occupied space`);
      if (SPACE_IDS.some((i) => pairs[i] > A[i])) bad.push(`round ${r}: more pairs than attackers`);
      if (sum(pairs) > cfg.size) bad.push(`round ${r}: more pairs than defenders`);
    }
    const { picks } = playRound(st, cfg, rng, tables, null);
    if (!claimable(picks)) bad.push(`round ${r}: illegal claim`);
    if (picks.some((i) => before[i])) bad.push(`round ${r}: marked an occupied space`);
    if (LINES.some((l) => st.marks[l[0]] && l.every((j) => st.marks[j] === st.marks[l[0]]))) {
      bad.push(`round ${r}: a line was left standing`);
    }
  }
  check('a hundred and twenty rounds hold the invariants', bad.slice(0, 4), []);
}

// ── Hands, and the points that buy them ─────────────────────────────────────

if (existsSync('results/hands-vetoes.json')) {
  const pool = loadHands('results/hands-vetoes.json');
  const rng = makeRng(4242);
  setArena('small');

  check('every hand of five is in the table', pool.hands.length, 252);
  check('a hand is one swap from itself and its neighbours',
    pool.neighbours.every((ns, i) => ns.includes(i)), true);
  check('a duel between equal hands is a coin flip', duelChance(0.4, 0.4), 0.5);
  check('and a better hand wins more often', duelChance(1, 0) > 0.5, true);

  // A swap is priced before it is paid for, and it never leaves a player worse off.
  check('a swap never prices itself negative',
    pool.hands.every((h, i) => swapTarget(pool, i).gain >= 0), true);
  check('the best hand on average cannot be improved on', swapTarget(pool, pool.top).to, pool.top);

  const roster = newRoster(12, pool, rng);
  check('a roster has one hand per player', roster.length, 12);
  const before = roster.map((h) => pool.mean[h]);
  for (let k = 0; k < roster.length; k++) swap(roster, k, pool);
  check('a chosen swap climbs for everyone',
    roster.every((h, k) => pool.mean[h] >= before[k]), true);

  // Dealing players out to spaces uses each of them once and no more.
  const counts = new Int32Array(N_SPACES);
  const order = SPACE_IDS.slice(0, 4);
  order.forEach((i, k) => { counts[i] = k + 1; });          // 1 + 2 + 3 + 4 = 10 of 12
  const dealt = assign(order, counts, roster, pool);
  const used = order.flatMap((i) => dealt.at.get(i) ?? []);
  check('every player is dealt out at most once',
    new Set([...used, ...dealt.idle]).size, roster.length);
  check('and the counts are honoured', order.map((i) => dealt.at.get(i).length), [1, 2, 3, 4]);
  check('with the rest standing idle', dealt.idle.length, 2);

  // The economy: every point earned is spent or banked, and cards are spent once, by
  // defenders only.
  const cfg = {
    size: 8, targets: 14, defence: 'plan', attack: 'plan', duels: 'coin', restart: 0,
    arena: 'small', horizon: 24, pool, pos: [0.03, 0.12], seed_marks: 4, seed_handicap: 2,
  };
  const st = newCampaign(0, cfg, makeRng(7));
  const tables = [null, tailTable(0.72, 9), tailTable(0.72, 9)];
  const tally = {
    rounds: 0, markHist: new Array(5).fill(0), lineHist: new Array(6).fill(0),
    teamPoints: [0, 0, 0], seatPoints: [0, 0], handMean: [0, 0, 0], handSpread: [0, 0, 0],
    handKinds: [0, 0, 0], halfContested: [0, 0], halfTaken: [0, 0], halfUsed: [0, 0],
    halfDuels: [0, 0],
  };
  for (const k of ['marks', 'points', 'value', 'cleared', 'lines', 'stalled', 'duels',
    'pivotal', 'stake', 'unpaired', 'idle', 'contested', 'taken', 'free', 'defended',
    'defendedTaken', 'forceA', 'forceD', 'wasted', 'reinforced', 'overestimate',
    'earned', 'swaps', 'cards', 'used', 'defDuels', 'bank', 'stock',
    'firstCard', 'firstRound', 'firstSwaps', 'usedWas', 'defWas']) tally[k] = 0;
  for (let r = 0; r < 24; r++) playRound(st, cfg, makeRng(1000 + r), tables, tally);

  const purses = st.pts.slice(1).flat();
  const bought = st.bought.slice(1).flat().reduce((a, b) => a + b, 0);
  check('a purse never goes negative', purses.every((n) => n >= 0), true);
  check('every point is earned, spent or banked',
    2 * (tally.swaps + tally.cards) + purses.reduce((a, b) => a + b, 0), tally.earned);
  check('the ladder is climbed', bought > 0 && bought === tally.swaps, true);
  check('cards are held as worths',
    st.cards.slice(1).flat(2).every((w) => CARD_WORTH.includes(w)), true);
  check('a card is spent once', tally.used <= tally.cards, true);
  check('and only ever by a defender', tally.used <= tally.defDuels, true);
}

console.log(failures ? `\n${failures} failing` : 'all checks pass');
if (failures) process.exit(1);
