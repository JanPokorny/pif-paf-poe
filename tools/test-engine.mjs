// Unit tests for src/engine.js, checked against the player-facing text of every
// stone, trick, field rule and relic mod. Plain Node, no dependencies:
//
//   node tools/test-engine.mjs
//
// Exits non-zero if any test fails. Squares are 0..8 row-major:
//   0 1 2
//   3 4 5
//   6 7 8

import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, cloneState, allowedSquares, isStuck, isSealed,
  hasLine, render, STONES, STONE_TYPES, TRICKS, TRICK_TYPES, FIELDS,
} from '../src/engine.js';

// ── Harness ─────────────────────────────────────────────────────────────────

const failures = [];
const notes = [];
let passed = 0;
let section = '';

function group(name) { section = name; }
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`[${section}] ${name}\n      ${String(e.message).split('\n').join('\n      ')}`); }
}
// A soft check: the text is ambiguous, so a mismatch is reported but does not fail.
function note(name, fn) {
  try { fn(); } catch (e) { notes.push(`[${section}] ${name}\n      ${String(e.message).split('\n').join('\n      ')}`); }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const pebbles = (n = 6) => Array(n).fill('pebble');
function G(o = {}) { return createGame({ handX: pebbles(), handO: pebbles(), log: false, ...o }); }

// 'O shift+' / 'X pebble!' (! = stuck) -> parts
function parse(str) {
  let [player, t] = str.split(' ');
  const stuck = t.endsWith('!'); if (stuck) t = t.slice(0, -1);
  const plus = t.endsWith('+'); if (plus) t = t.slice(0, -1);
  assert.ok(STONES[t], `unknown stone ${t}`);
  return { player, type: t, plus, stuck };
}
// Lay stones by hand. A stone laid on square k gets id 100 + k.
function lay(s, spec) {
  for (const [k, str] of Object.entries(spec)) {
    const c = parse(str);
    const cell = { player: c.player, type: c.type, plus: c.plus, id: 100 + Number(k) };
    if (c.stuck) cell.stuck = true;
    s.board[Number(k)] = cell;
  }
  return s;
}
const ids = (s) => s.board.map((c) => (c ? c.id : 0));
function expectAt(s, map, msg = '') {
  const got = ids(s);
  for (const [k, id] of Object.entries(map)) {
    assert.equal(got[k], id, `${msg} square ${k}: expected id ${id}, got ${got[k]}\n${render(s)}ids ${JSON.stringify(got)}`);
  }
}
// Select + place a stone for the player to move (adding it to their hand if
// missing). Returns the id the placed stone gets.
function play(s, str, pos) {
  const { type, plus } = parse('_ ' + str);
  const hand = s.hands[s.player];
  if (!hand.some((h) => h.type === type && !!h.plus === plus)) hand.push({ type, plus });
  const id = s.nextId;
  applyAction(s, { type: 'select', stone: type, plus });
  applyAction(s, { type: 'place', pos });
  return id;
}
const matches = (a, partial) => Object.entries(partial).every(([k, v]) => a[k] === v);
function act(s, partial) {
  const legal = legalActions(s);
  const a = legal.find((x) => matches(x, partial));
  assert.ok(a, `no legal action matching ${JSON.stringify(partial)} in phase ${s.phase}; legal: ${JSON.stringify(legal)}`);
  applyAction(s, a);
  return a;
}
const eff = (s, partial = {}) => { assert.equal(s.phase, 'effect', 'expected effect phase'); return act(s, { type: 'effect', ...partial }); };
const trick = (s, use, partial = {}) => { assert.equal(s.phase, 'trick', 'expected trick phase'); return act(s, { type: 'trick', use, ...partial }); };
const effectOpts = (s) => (s.phase === 'effect' ? legalActions(s) : []);
const trickOpts = (s, use) => (s.phase === 'trick' ? legalActions(s).filter((a) => a.use === use) : []);
function turnPassedTo(s, p) {
  assert.equal(s.over, false, `game unexpectedly over (winner ${s.winner}, ${s.reason})\n${render(s)}`);
  assert.equal(s.player, p, `expected ${p} to move`);
  assert.equal(s.phase, 'select', `expected select phase, got ${s.phase}`);
}
const sameSet = (a, b, msg) => assert.deepEqual([...a].sort((x, y) => x - y), [...b].sort((x, y) => x - y), msg);
const handHas = (s, p, type, plus) => s.hands[p].some((h) => h.type === type && !!h.plus === !!plus);
const count = (s, p, type) => s.hands[p].filter((h) => h.type === type).length;

// ── Core rules ──────────────────────────────────────────────────────────────

group('core');

test('createGame starts empty in select phase with the opener to move', () => {
  const s = G({ first: 'O', handX: ['shift+', 'pebble'] });
  assert.equal(s.board.length, 9);
  assert.ok(s.board.every((c) => c === null));
  assert.equal(s.player, 'O'); assert.equal(s.phase, 'select'); assert.equal(s.over, false);
  assert.deepEqual(s.hands.X[0], { type: 'shift', plus: true });
  assert.deepEqual(s.hands.X[1], { type: 'pebble', plus: false });
});

test('select actions are de-duplicated by type and plus', () => {
  const s = G({ handX: ['pebble', 'pebble', 'pebble+', 'shift', 'shift'] });
  const a = legalActions(s);
  assert.equal(a.length, 3);
  assert.ok(a.every((x) => x.type === 'select'));
});

test('select takes the stone from hand; place puts it down with a fresh id', () => {
  const s = G();
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  assert.equal(s.phase, 'place'); assert.equal(s.hands.X.length, 5);
  sameSet(legalActions(s).map((a) => a.pos), [0, 1, 2, 3, 5, 6, 7, 8], 'nobody opens in the centre');
  applyAction(s, { type: 'place', pos: 0 });
  assert.deepEqual({ ...s.board[0] }, { player: 'X', type: 'pebble', plus: false, id: 1 });
  turnPassedTo(s, 'O');
  assert.equal(s.placements.X, 1);
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(legalActions(s).map((a) => a.pos), [1, 2, 3, 4, 5, 6, 7, 8], 'the reply may take the centre; occupied squares are not placeable');
});

test('selecting a stone you do not hold throws; acting after the end throws', () => {
  const s = G();
  assert.throws(() => applyAction(s, { type: 'select', stone: 'shift', plus: false }));
  lay(s, { 0: 'X pebble', 1: 'X pebble' });
  play(s, 'pebble', 2);
  assert.equal(s.over, true);
  assert.throws(() => applyAction(s, { type: 'select', stone: 'pebble', plus: false }));
  assert.deepEqual(legalActions(s), []);
});

test('three in a row wins (every line)', () => {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const [a, b, c] of lines) {
    const s = G();
    lay(s, { [a]: 'X pebble', [b]: 'X pebble' });
    play(s, 'pebble', c);
    assert.equal(s.over, true, `line ${a}${b}${c}`);
    assert.equal(s.winner, 'X'); assert.equal(s.reason, 'line'); assert.equal(s.phase, 'over');
  }
});

test('mover is checked first when both sides hold a line', () => {
  const s = G();
  lay(s, { 3: 'O pebble', 4: 'O pebble', 5: 'O pebble', 0: 'X pebble', 1: 'X pebble' });
  play(s, 'pebble', 2);
  assert.equal(s.winner, 'X');
});

test('a line only the opponent holds wins for the opponent', () => {
  const s = G();
  lay(s, { 3: 'O pebble', 4: 'O pebble', 5: 'O pebble' });
  play(s, 'pebble', 0);
  assert.equal(s.over, true); assert.equal(s.winner, 'O'); assert.equal(s.reason, 'line');
});

test('a line made by an effect wins for the mover', () => {
  const s = G();
  lay(s, { 0: 'X pebble', 1: 'X pebble', 5: 'O pebble', 6: 'X pebble' });
  play(s, 'frog', 8);   // 8 -> 2 over the O stone on 5 (the only leap), auto-resolved
  assert.equal(s.over, true); assert.equal(s.winner, 'X'); assert.equal(s.reason, 'line');
});

test('a line an effect makes only for the opponent wins for the opponent', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 1: 'O pebble', 5: 'O pebble' });
  const sw = play(s, 'swap', 2);   // neighbours 1 and 5, both O
  eff(s, { target: 5 });           // O stone from 5 lands on 2
  expectAt(s, { 2: 105, 5: sw });
  assert.equal(s.over, true); assert.equal(s.winner, 'O');
});

const DRAW = { 0: 'X pebble', 1: 'O pebble', 2: 'X pebble', 3: 'X pebble', 4: 'O pebble', 5: 'O pebble', 6: 'O pebble', 7: 'X pebble' };
test('a full board goes to the second player (X opened -> O)', () => {
  const s = G({ first: 'X' });
  lay(s, DRAW); play(s, 'pebble', 8);
  assert.equal(s.over, true); assert.equal(s.reason, 'full'); assert.equal(s.winner, 'O');
});
test('a full board goes to the second player (O opened -> X)', () => {
  const s = G({ first: 'O' });
  s.player = 'X';
  lay(s, DRAW); play(s, 'pebble', 8);
  assert.equal(s.reason, 'full'); assert.equal(s.winner, 'X');
});
test('a player out of stones: the duel goes to the second player', () => {
  const s = G({ first: 'X', handX: ['pebble', 'pebble'], handO: ['pebble'] });
  play(s, 'pebble', 0);           // O still holds one
  turnPassedTo(s, 'O');
  play(s, 'pebble', 4);           // O is now empty-handed, but it is X's turn
  turnPassedTo(s, 'X');
  play(s, 'pebble', 5);          // X places; O has nothing to play
  assert.equal(s.over, true); assert.equal(s.reason, 'empty'); assert.equal(s.winner, 'O');
});
test('out of stones with O having opened goes to X', () => {
  const s = G({ first: 'O', handX: ['pebble'], handO: ['pebble', 'pebble'] });
  play(s, 'pebble', 0);           // O
  play(s, 'pebble', 4);           // X, now empty
  play(s, 'pebble', 5);          // O places; X has nothing
  assert.equal(s.reason, 'empty'); assert.equal(s.winner, 'X');
});

test('forty turns end the duel as a full board would (second player)', () => {
  const s = G({ first: 'X' });
  s.turns = 39;
  play(s, 'pebble', 0);
  assert.equal(s.over, true); assert.equal(s.winner, 'O');
});
note('the forty-turn cap reports its reason as "full" (it "counts as one"), not "empty"', () => {
  const s = G({ first: 'X' });
  s.turns = 39;
  play(s, 'pebble', 0);
  assert.equal(s.reason, 'full', `reason is "${s.reason}" although no hand is empty`);
});

// ── Relic mods ──────────────────────────────────────────────────────────────

group('mods');

test('hourglass: a full board goes to its holder whoever opened', () => {
  const s = G({ first: 'X', modsX: { hourglass: true } });
  lay(s, DRAW); play(s, 'pebble', 8);
  assert.equal(s.reason, 'full'); assert.equal(s.winner, 'X');
});
test('hourglass: running out of stones goes to its holder', () => {
  const s = G({ first: 'O', handX: ['pebble', 'pebble'], handO: ['pebble'], modsO: { hourglass: true } });
  play(s, 'pebble', 0);   // O empty now
  play(s, 'pebble', 4);   // X; O has nothing
  assert.equal(s.reason, 'empty'); assert.equal(s.winner, 'O');
});
test('hourglass on both sides cancels out (second player wins)', () => {
  const s = G({ first: 'X', modsX: { hourglass: true }, modsO: { hourglass: true } });
  lay(s, DRAW); play(s, 'pebble', 8);
  assert.equal(s.winner, 'O');
});

test('echo: the first stone that does something does it twice', () => {
  const s = G({ modsX: { echo: true } });
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });          // [S, O, _] -> [_, S, O]
  expectAt(s, { 0: 0, 1: id, 2: 101 });
  assert.equal(s.phase, 'effect', 'echo should offer the effect again');
  assert.equal(s.placedAt, 1, 'echo resolves from where the stone now stands');
  eff(s, { dir: 'right', index: 0 });          // [_, S, O] -> [O, _, S]
  expectAt(s, { 0: 101, 1: 0, 2: id });
  turnPassedTo(s, 'O');
  assert.equal(s.echo.X, false);
});
test('echo: only the first such stone; pebbles do not use it up', () => {
  const s = G({ modsX: { echo: true } });
  play(s, 'pebble', 8); play(s, 'pebble', 7);          // X pebble, O pebble
  assert.equal(s.echo.X, true, 'a pebble does nothing, so echo is not spent');
  lay(s, { 3: 'O pebble' });
  play(s, 'bumper', 4);                              // pushes 3? no room (beyond is off-board) -> nothing
  // Bumper at 4 cannot push anything, but it "resolved": echo is used on it.
  play(s, 'pebble', 6);                              // O
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  assert.notEqual(s.phase, 'effect', 'second effect stone must not echo');
  assert.equal(ids(s)[1], id);
});
test('echo belongs to its owner only', () => {
  const s = G({ modsO: { echo: true } });
  lay(s, { 1: 'O pebble' });
  play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  turnPassedTo(s, 'O');
});
test('echo repeats an auto-resolving effect on its own', () => {
  const s = G({ modsX: { echo: true } });
  lay(s, { 0: 'O pebble' });
  play(s, 'whirl+', 4);   // 4 options, not auto; use a single-option stone instead below
  eff(s, { turn: 1 });
  eff(s, { turn: 1 });
  expectAt(s, { 2: 100 });
  const t = G({ modsX: { echo: true } });
  lay(t, { 2: 'O pebble', 1: 'X pebble' });
  play(t, 'glue', 0);     // single option: glue; echo re-glues automatically
  turnPassedTo(t, 'O');
  assert.equal(t.echo.X, false);
});

test('freeFirst (Wings): first stone ignores restrictions, the second does not', () => {
  const s = G({ modsX: { freeFirst: true } });
  lay(s, { 0: 'O magnet' });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(s), [1, 2, 3, 4, 5, 6, 7, 8]);
  applyAction(s, { type: 'place', pos: 8 });
  play(s, 'pebble', 7);   // O
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(s), [1, 3]);
});

test('velvetRope: the enemy\'s first stone may not take the centre', () => {
  const s = G({ modsO: { velvetRope: true } });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(s), [0, 1, 2, 3, 5, 6, 7, 8]);
  applyAction(s, { type: 'place', pos: 0 });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });   // O: its own rope does not bind it
  sameSet(allowedSquares(s), [1, 2, 3, 4, 5, 6, 7, 8]);
  applyAction(s, { type: 'place', pos: 8 });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });   // X second stone: centre allowed
  assert.ok(allowedSquares(s).includes(4));
});
test('velvetRope composes with restrictions', () => {
  const s = G({ modsO: { velvetRope: true } });
  lay(s, { 1: 'O magnet' });   // magnet wants 0, 2, 4; rope removes 4
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(s), [0, 2]);
});

group('space (disabled) / homeTurf');

test('a disabled stone type does nothing when placed', () => {
  const s = G({ disabled: 'shift' });
  lay(s, { 1: 'O pebble' });
  play(s, 'shift', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 1: 101 });
});
test('homeTurf exempts its owner from the space', () => {
  const s = G({ disabled: 'shift', modsX: { homeTurf: true } });
  lay(s, { 1: 'O pebble' });
  play(s, 'shift', 0);
  assert.equal(s.phase, 'effect');
});
test('homeTurf does not exempt the other side', () => {
  const s = G({ disabled: 'shift', modsO: { homeTurf: true } });
  lay(s, { 1: 'O pebble' });
  play(s, 'shift', 0);
  turnPassedTo(s, 'O');
});
test('a disabled restriction stone does not restrict (unless its owner has homeTurf)', () => {
  const s = G({ disabled: 'magnet' });
  lay(s, { 0: 'O magnet' });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  assert.equal(allowedSquares(s).length, 8);
  const t = G({ disabled: 'magnet', modsO: { homeTurf: true } });
  lay(t, { 0: 'O magnet' });
  applyAction(t, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(t), [1, 3]);
});
test('a disabled Mountain is no wall', () => {
  const s = G({ disabled: 'mountain' });
  lay(s, { 1: 'O mountain' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 0: 0, 1: id, 2: 101 });
});
test('a disabled Mountain+ is not sealed', () => {
  const s = G({ disabled: 'mountain', tricksX: ['pluck'] });
  lay(s, { 4: 'O mountain+' });
  assert.equal(isSealed(s, 4), false);
  play(s, 'pebble', 0);
  assert.equal(trickOpts(s, 'pluck').length, 1);
});
test('a disabled Snare does not snare (homeTurf restores it)', () => {
  const s = G({ disabled: 'snare' });
  lay(s, { 0: 'O snare', 2: 'O pebble' });
  play(s, 'shift', 1);
  assert.equal(s.phase, 'effect');
  const t = G({ disabled: 'snare', modsO: { homeTurf: true } });
  lay(t, { 0: 'O snare', 2: 'O pebble' });
  play(t, 'shift', 1);
  turnPassedTo(t, 'O');
});
test('a disabled Guardian protects nobody (homeTurf restores it)', () => {
  const s = G({ disabled: 'guardian', first: 'O', tricksO: ['pluck'] });
  lay(s, { 4: 'X guardian', 1: 'X pebble' });
  play(s, 'pebble', 8);
  sameSet(trickOpts(s, 'pluck').map((a) => a.pos), [1, 4]);
  const t = G({ disabled: 'guardian', first: 'O', tricksO: ['pluck'], modsX: { homeTurf: true } });
  lay(t, { 4: 'X guardian', 1: 'X pebble' });
  play(t, 'pebble', 8);
  turnPassedTo(t, 'X');
});
test('a disabled Glue sticks nothing', () => {
  const s = G({ disabled: 'glue' });
  lay(s, { 1: 'O pebble' });
  play(s, 'glue', 0);
  assert.ok(!s.board[1].stuck && !s.board[0].stuck);
});
test('a disabled Parrot does not become a copy (its type is switched off)', () => {
  const s = G({ disabled: 'parrot', first: 'O' });
  play(s, 'shift', 8);                  // O shift on 8: row 2 / col 2 of an empty board
  if (s.phase === 'effect') eff(s, { dir: 'left', index: 2 });
  lay(s, { 1: 'O pebble' });
  const before = ids(s);
  play(s, 'parrot', 0);
  assert.notEqual(s.phase, 'effect', `switched-off Parrot copied the enemy stone and got an effect (type now ${s.board[0].type})`);
  assert.deepEqual(ids(s).filter((x, i) => i !== 0), before.filter((x, i) => i !== 0));
});
test('a disabled Pebble+ does not ignore restrictions', () => {
  const s = G({ disabled: 'pebble', handX: ['pebble+'] });
  lay(s, { 0: 'O magnet' });
  applyAction(s, { type: 'select', stone: 'pebble', plus: true });
  sameSet(allowedSquares(s), [1, 3], 'Pebble+ is switched off, so the magnet should bind it');
});

// ── Stones ──────────────────────────────────────────────────────────────────

group('pebble');

test('Pebble does nothing', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble' });
  play(s, 'pebble', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 1: 101, 3: 103 });
});
test('Pebble+ ignores the enemy\'s restrictions; a plain Pebble does not', () => {
  const s = G({ handX: ['pebble', 'pebble+'] });
  lay(s, { 0: 'O magnet', 8: 'O stinky+' });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(s), [1, 3]);
  s.hands.X.push(s.selected); s.selected = null; s.phase = 'select';
  applyAction(s, { type: 'select', stone: 'pebble', plus: true });
  sameSet(allowedSquares(s), [1, 2, 3, 4, 5, 6, 7]);
  applyAction(s, { type: 'place', pos: 7 });
  turnPassedTo(s, 'O');
});
test('Pebble+ ignores the velvet rope too', () => {
  const s = G({ handX: ['pebble+'], modsO: { velvetRope: true } });
  applyAction(s, { type: 'select', stone: 'pebble', plus: true });
  assert.ok(allowedSquares(s).includes(4));
});

group('shift');

test('Shift offers its own row and column, each way', () => {
  const s = G();
  lay(s, { 7: 'O pebble' });
  play(s, 'shift', 4);
  const o = effectOpts(s);
  assert.equal(o.length, 4);
  for (const a of o) assert.equal(a.index, 1);
});
test('Shift right wraps the last stone to the front', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 2: 'O pebble' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 0: 102, 1: id, 2: 101 });
});
test('Shift left wraps the first stone to the back', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 2: 'O pebble' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'left', index: 0 });
  expectAt(s, { 0: 101, 1: 102, 2: id });
});
test('Shift up/down move the column, wrapping', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 7: 'X pebble' });
  const id = play(s, 'shift', 4);
  eff(s, { dir: 'up', index: 1 });
  expectAt(s, { 1: id, 4: 107, 7: 101 });
  const t = G();
  lay(t, { 1: 'O pebble', 7: 'X pebble' });
  const id2 = play(t, 'shift', 4);
  eff(t, { dir: 'down', index: 1 });
  expectAt(t, { 1: 107, 4: 101, 7: id2 });
});
test('Shift does not touch other rows', () => {
  const s = G();
  lay(s, { 3: 'O pebble', 6: 'O pebble' });
  play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 3: 103, 6: 106 });
});
test('Shift: a Mountain holds its square and the stones step over it', () => {
  const s = G();
  lay(s, { 1: 'O mountain' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });   // S skips the Mountain's square
  expectAt(s, { 0: 0, 1: 101, 2: id });
});
test('Shift: stones still wrap round the end past a Mountain elsewhere in the row', () => {
  const s = G();
  lay(s, { 1: 'O mountain' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'left', index: 0 });    // S falls off the left end, wraps to 2
  expectAt(s, { 0: 0, 1: 101, 2: id });
});
test('Shift: a stone steps into a square emptied ahead of it; Mountain at the end', () => {
  const s = G();
  lay(s, { 2: 'O mountain' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 0: 0, 1: id, 2: 102 });
});
test('Shift: nothing wraps into a Mountain; the rest go round it', () => {
  const s = G();
  lay(s, { 0: 'O mountain', 2: 'O pebble' });
  const id = play(s, 'shift', 1);
  eff(s, { dir: 'right', index: 0 });   // 2 wraps past the Mountain to 1
  expectAt(s, { 0: 100, 1: 102, 2: id });
});
test('Shift: a guarded enemy stone and a glued stone are walls too', () => {
  for (const wall of ['O guardian', 'O pebble!']) {
    const s = G();
    lay(s, { 1: wall });
    const id = play(s, 'shift', 0);
    eff(s, { dir: 'right', index: 0 });
    expectAt(s, { 0: 0, 1: 101, 2: id }, wall);
  }
});
test('Shift+ offers every row and column, each way', () => {
  const s = G();
  lay(s, { 8: 'O pebble' });
  play(s, 'shift+', 0);
  const o = effectOpts(s);
  assert.equal(o.length, 12);
});
test('Shift+ slides a row the stone is not in', () => {
  const s = G();
  lay(s, { 6: 'O pebble', 7: 'X pebble' });
  const id = play(s, 'shift+', 0);
  eff(s, { dir: 'right', index: 2 });
  expectAt(s, { 0: id, 6: 0, 7: 106, 8: 107 });
});
test('Shift+ slides a column the stone is not in, wrapping', () => {
  const s = G();
  lay(s, { 8: 'O pebble', 2: 'X pebble' });
  const id = play(s, 'shift+', 0);
  eff(s, { dir: 'down', index: 2 });
  expectAt(s, { 0: id, 2: 108, 5: 102, 8: 0 });
});

group('rotate');

test('Rotate in a corner has one block, one way: resolves on its own, clockwise', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'rotate', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 0: 0, 1: id, 4: 101 });
});
test('Rotate in the centre offers four blocks, all clockwise', () => {
  const s = G();
  lay(s, { 0: 'O pebble' });
  play(s, 'rotate', 4);
  const o = effectOpts(s);
  assert.equal(o.length, 4);
  assert.ok(o.every((a) => a.cw === true));
});
test('Rotate clockwise moves tl->tr->br->bl', () => {
  const s = G();
  lay(s, { 4: 'O pebble', 5: 'X pebble' });
  const id = play(s, 'rotate', 1);
  eff(s, { block: 'TR', cw: true });   // TR: 1 2 / 4 5 ; 1->2, 2->5, 5->4, 4->1
  expectAt(s, { 1: 104, 2: id, 4: 105, 5: 0 });
});
test('Rotate+ offers both ways; counter-clockwise moves tl->bl->br->tr', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'rotate+', 0);
  assert.equal(effectOpts(s).length, 2);
  eff(s, { block: 'TL', cw: false });
  expectAt(s, { 0: 101, 1: 0, 3: id, 4: 0 });
  const t = G();
  lay(t, { 0: 'O pebble' });
  play(t, 'rotate+', 4);
  assert.equal(effectOpts(t).length, 8);
});
test('Rotate respects a Mountain in the block', () => {
  const s = G();
  lay(s, { 4: 'O mountain', 3: 'O pebble' });
  const id = play(s, 'rotate', 0);   // cw 0->1, 1->4 (wall), 3->0
  expectAt(s, { 0: 103, 1: id, 3: 0, 4: 104 });
});

group('2048');

test('2048 offers four directions and every stone (itself too) slides all the way', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 2: 'X pebble' });
  const id = play(s, '2048', 4);
  assert.equal(effectOpts(s).length, 4);
  eff(s, { dir: 'right' });
  expectAt(s, { 0: 0, 1: 100, 2: 102, 4: 0, 5: id });
});
test('2048 down', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 2: 'X pebble' });
  const id = play(s, '2048', 4);
  eff(s, { dir: 'down' });
  expectAt(s, { 6: 100, 7: id, 8: 102, 0: 0, 2: 0, 4: 0 });
});
test('2048 packs up against a Mountain and on the far side of it', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 2: 'O mountain', 5: 'X pebble', 3: 'X mountain' });
  const id = play(s, '2048', 8);
  eff(s, { dir: 'right' });   // row0: O stops against the mountain at 2
  expectAt(s, { 0: 0, 1: 100, 2: 102, 3: 103, 5: 105, 8: id });
  const t = G();
  lay(t, { 0: 'O mountain', 2: 'O pebble', 5: 'X pebble', 3: 'X mountain' });
  play(t, '2048', 8);
  eff(t, { dir: 'left' });    // row0: stops at 1; row1: X from 5 packs to 4 against mountain at 3
  expectAt(t, { 0: 100, 1: 102, 2: 0, 3: 103, 4: 105, 5: 0 });
});
test('2048+ may hold its own square while everything else slides', () => {
  const s = G();
  lay(s, { 3: 'O pebble', 0: 'X pebble' });
  const id = play(s, '2048+', 4);
  assert.equal(effectOpts(s).length, 8, 'four ways, each with or without holding');
  eff(s, { dir: 'right', hold: true });
  expectAt(s, { 4: id, 3: 103, 5: 0, 0: 0, 2: 100 });
  const t = G();
  lay(t, { 3: 'O pebble' });
  const id2 = play(t, '2048', 4);
  eff(t, { dir: 'right' });
  expectAt(t, { 3: 0, 4: 103, 5: id2 }, 'plain 2048 moves itself');
});

group('bumper');

test('Bumper pushes each enemy stone beside it one step directly away', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 6: 'X pebble', 4: 'O pebble' });
  play(s, 'bumper', 0);   // single option: resolves on its own
  turnPassedTo(s, 'O');
  expectAt(s, { 1: 0, 2: 101, 3: 103, 6: 106, 4: 104, 8: 0 }, '3 is blocked by 6; 4 is a corner neighbour');
});
test('Bumper leaves your own stones be', () => {
  const s = G();
  lay(s, { 1: 'X pebble', 3: 'O pebble' });
  play(s, 'bumper', 0);
  expectAt(s, { 1: 101, 2: 0, 3: 0, 6: 103 });
});
test('Bumper: an enemy stone pushed off the board goes back to their hand', () => {
  const s = G();
  lay(s, { 4: 'O pebble', 0: 'O shift+', 2: 'O pebble' });
  const n = s.hands.O.length;
  play(s, 'bumper', 1);
  expectAt(s, { 4: 0, 7: 104, 0: 0, 2: 0 });
  assert.equal(s.hands.O.length, n + 2); assert.ok(handHas(s, 'O', 'shift', true));
});
test('Bumper in the centre pushes every enemy stone beside it off the board', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 5: 'X pebble', 0: 'O pebble' });
  const n = s.hands.O.length;
  play(s, 'bumper', 4);
  expectAt(s, { 1: 0, 3: 0, 5: 105, 0: 100 });
  assert.equal(s.hands.O.length, n + 2);
});
test('Bumper+ pushes enemy stones around it, corners included; yours stay', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 4: 'O pebble', 3: 'X pebble' });
  play(s, 'bumper+', 0);
  expectAt(s, { 1: 0, 2: 101, 4: 0, 8: 104, 3: 103, 6: 0 });
  const t = G();
  lay(t, { 0: 'O pebble', 8: 'O pebble', 3: 'X pebble' });
  const n = t.hands.O.length;
  play(t, 'bumper+', 4);
  expectAt(t, { 0: 0, 8: 0, 3: 103 });
  assert.equal(t.hands.O.length, n + 2, 'diagonal pushes off the board return too');
});
test('Bumper does not push stuck stones or Mountains, not even off the board', () => {
  const s = G();
  lay(s, { 1: 'O pebble!', 3: 'O mountain', 5: 'O mountain+' });
  play(s, 'bumper', 4);
  expectAt(s, { 1: 101, 3: 103, 5: 105 });
});

group('lasso');

test('Lasso pulls every stone two squares away in a straight line, diagonals too, one step closer — or one', () => {
  const s = G();
  lay(s, { 2: 'O pebble', 6: 'O pebble', 3: 'X pebble', 8: 'X pebble' });
  play(s, 'lasso', 0);
  assert.equal(effectOpts(s).length, 3, 'all, or either of the two it reaches');
  eff(s, {});
  turnPassedTo(s, 'O');
  expectAt(s, { 2: 0, 1: 102, 6: 106, 3: 103, 8: 0, 4: 108 });
});
test('Lasso+ hushes the enemy stones it pulls', () => {
  const s = G();
  lay(s, { 2: 'O pebble', 8: 'X pebble' });
  play(s, 'lasso+', 0);
  eff(s, {});
  assert.equal(s.board[1].hushed, true);
  assert.ok(!s.board[4].hushed, 'your own stone is not hushed');
});
test('Lasso+ pulls every one, or just one of them', () => {
  const s = G();
  lay(s, { 2: 'O pebble', 8: 'O pebble' });
  play(s, 'lasso+', 0);
  assert.equal(effectOpts(s).length, 3);
  eff(s, { target: 8 });
  expectAt(s, { 2: 102, 1: 0, 8: 0, 4: 108 });
  const t = G();
  lay(t, { 2: 'O pebble', 8: 'O pebble' });
  play(t, 'lasso+', 0);
  act(t, { type: 'effect', target: undefined });
  expectAt(t, { 2: 0, 1: 102, 8: 0, 4: 108 });
});
test('Lasso+ with a single pull resolves on its own', () => {
  const s = G();
  lay(s, { 2: 'O pebble' });
  play(s, 'lasso+', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 1: 102 });
});
test('Lasso does not pull stuck stones, nor through a stone in between', () => {
  const s = G();
  lay(s, { 2: 'O mountain', 6: 'O pebble!', 8: 'O pebble', 4: 'X pebble' });
  play(s, 'lasso', 0);
  expectAt(s, { 2: 102, 1: 0, 6: 106, 3: 0, 8: 108 });
});

group('swap');

test('Swap with one neighbour resolves on its own', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'swap', 4);
  turnPassedTo(s, 'O');
  expectAt(s, { 1: id, 4: 101 });
});
test('Swap offers the movable stones around it, corners included', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'X pebble', 5: 'O mountain', 7: 'O pebble!', 0: 'O pebble' });
  play(s, 'swap', 4);
  sameSet(effectOpts(s).map((a) => a.target), [0, 1, 3]);
});
test('Swap trades with a corner neighbour', () => {
  const s = G();
  lay(s, { 0: 'O pebble' });
  const id = play(s, 'swap', 4);
  expectAt(s, { 0: id, 4: 100 });
});
test('Swap does not reach two squares away; Swap+ reaches its row, column or diagonal', () => {
  const s = G();
  lay(s, { 2: 'O pebble', 8: 'O pebble', 5: 'X pebble' });
  play(s, 'swap', 0);
  turnPassedTo(s, 'O');
  const t = G();
  lay(t, { 2: 'O pebble', 8: 'O pebble', 7: 'X pebble' });
  const id = play(t, 'swap+', 0);
  sameSet(effectOpts(t).map((a) => a.target), [2, 8]);
  eff(t, { target: 8 });
  expectAt(t, { 0: 108, 8: id });
});
test('Swap+ off the diagonals has only row and column', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 7: 'O pebble', 5: 'O pebble' });
  play(s, 'swap+', 1);
  sameSet(effectOpts(s).map((a) => a.target), [0, 7]);
});

group('whirl');

test('Whirl turns the ring one step either way; the centre stays', () => {
  const s = G();
  lay(s, { 0: 'O pebble' });
  const id = play(s, 'whirl', 4);
  assert.equal(effectOpts(s).length, 2);
  eff(s, { turn: 1 });
  expectAt(s, { 0: 0, 1: 100, 4: id });
  const t = G();
  lay(t, { 0: 'O pebble' });
  play(t, 'whirl', 4);
  eff(t, { turn: -1 });
  expectAt(t, { 0: 0, 3: 100 });
});
test('Whirl on the ring moves itself too', () => {
  const s = G();
  lay(s, { 8: 'O pebble' });
  const id = play(s, 'whirl', 1);
  eff(s, { turn: 1 });
  expectAt(s, { 1: 0, 2: id, 8: 0, 7: 108 });
});
test('Whirl+ turns one or two steps either way', () => {
  const s = G();
  lay(s, { 0: 'O pebble' });
  play(s, 'whirl+', 4);
  assert.equal(effectOpts(s).length, 4);
  eff(s, { turn: 2 });
  expectAt(s, { 0: 0, 2: 100 });
  const t = G();
  lay(t, { 0: 'O pebble' });
  play(t, 'whirl+', 4);
  eff(t, { turn: -2 });
  expectAt(t, { 0: 0, 6: 100 });
});
test('Whirl respects Mountains on the ring', () => {
  const s = G();
  lay(s, { 2: 'O mountain', 1: 'O pebble', 0: 'X pebble', 3: 'X pebble' });
  play(s, 'whirl', 4);
  eff(s, { turn: 1 });   // the ring turns, stepping over the Mountain on 2
  expectAt(s, { 0: 103, 1: 100, 2: 102, 3: 0, 5: 101 });
});

group('frog');

test('Frog leaps over an enemy stone beside it; the stone leapt over goes back to their hand', () => {
  const s = G();
  lay(s, { 1: 'O shift+', 3: 'O pebble', 6: 'X pebble' });
  const n = s.hands.O.length;
  const id = play(s, 'frog', 0);   // only 0 -> 2 is open: resolves on its own
  turnPassedTo(s, 'O');
  expectAt(s, { 0: 0, 2: id, 1: 0, 3: 103 });
  assert.equal(s.hands.O.length, n + 1); assert.ok(handHas(s, 'O', 'shift', true));
});
test('Frog leaping over your own stone leaves it there', () => {
  const s = G();
  lay(s, { 1: 'X pebble' });
  const n = s.hands.X.length;
  const id = play(s, 'frog', 0);
  expectAt(s, { 0: 0, 1: 101, 2: id });
  assert.equal(s.hands.X.length, n);
});
test('Frog offers every open leap; not diagonals', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 4: 'O pebble' });
  play(s, 'frog', 0);
  sameSet(effectOpts(s).map((a) => a.target), [2, 6]);
  eff(s, { target: 6 });
  expectAt(s, { 3: 0, 1: 101, 4: 104 });
});
test('Frog+ leaps diagonally too, and returns the stone leapt over', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 4: 'O pebble' });
  const id = play(s, 'frog+', 0);
  sameSet(effectOpts(s).map((a) => a.target), [2, 6, 8]);
  eff(s, { target: 8 });
  expectAt(s, { 0: 0, 8: id, 4: 0, 1: 101, 3: 103 });
});
test('Frog may leap over a Mountain; an enemy Mountain+ is not returned', () => {
  const s = G();
  lay(s, { 1: 'O mountain+' });
  const id = play(s, 'frog', 0);
  expectAt(s, { 2: id, 1: 101 });
  const t = G();
  lay(t, { 1: 'O mountain' });
  const id2 = play(t, 'frog', 0);
  expectAt(t, { 2: id2, 1: 0 });
  assert.ok(handHas(t, 'O', 'mountain', false));
});
test('Frog has no leap when nothing is beside it', () => {
  const s = G();
  play(s, 'frog', 0);
  turnPassedTo(s, 'O');
});

group('flip');

test('Flip mirrors the board left-right or top-bottom; it holds its own square', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 6: 'X pebble' });
  const id = play(s, 'flip', 0);
  assert.equal(effectOpts(s).length, 4);
  eff(s, { axis: 'h' });
  expectAt(s, { 0: id, 2: 0, 1: 101, 3: 0, 5: 103, 6: 0, 8: 106 });
  const t = G();
  lay(t, { 0: 'O pebble', 5: 'O pebble' });
  const id2 = play(t, 'flip', 1);
  eff(t, { axis: 'v' });
  expectAt(t, { 1: id2, 7: 0, 0: 0, 6: 100, 5: 105 });
});
test('Flip mirrors across either diagonal', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 2: 'X pebble' });
  const id = play(s, 'flip', 0);
  eff(s, { axis: 'd' });            // main diagonal 0-4-8: (r,c)->(c,r)
  expectAt(s, { 0: id, 1: 0, 3: 101, 2: 0, 6: 102 });
  const t = G();
  lay(t, { 1: 'O pebble', 8: 'X pebble', 3: 'O pebble' });
  const id2 = play(t, 'flip', 0);
  eff(t, { axis: 'a' });            // anti-diagonal 2-4-6: (r,c)->(2-c,2-r); 0<->8 held
  expectAt(t, { 0: id2, 8: 108, 1: 0, 5: 101, 3: 0, 7: 103 });
});
test('Flip+ mirrors only the enemy\'s stones; yours hold still', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 1: 'X pebble', 3: 'O pebble', 5: 'X pebble', 6: 'X pebble' });
  const id = play(s, 'flip+', 4);
  assert.equal(effectOpts(s).length, 8, 'four axes, all stones or only theirs');
  eff(s, { axis: 'h', only: true });
  expectAt(s, { 4: id, 0: 0, 2: 100, 1: 101, 3: 103, 5: 105, 6: 106, 8: 0 });
});
test('Flip leaves stuck stones (and their mirror square) where they are', () => {
  const s = G();
  lay(s, { 0: 'O pebble!', 2: 'O pebble', 3: 'O pebble', 6: 'X mountain', 8: 'O pebble' });
  const id = play(s, 'flip', 1);
  eff(s, { axis: 'h' });
  expectAt(s, { 1: id, 0: 100, 2: 102, 3: 0, 5: 103, 6: 106, 8: 108 });
});

group('restrictions (beacon, magnet, stinky)');

function allowedFor(spec, stone = 'pebble', o = {}) {
  const s = G(o);
  lay(s, spec);
  s.hands.X.push({ type: stone, plus: false });
  applyAction(s, { type: 'select', stone, plus: false });
  return allowedSquares(s);
}
test('Magnet: must place next to it', () => sameSet(allowedFor({ 0: 'O magnet' }), [1, 3]));
test('Magnet+: next to it, and it outweighs another restriction', () => {
  sameSet(allowedFor({ 0: 'O magnet+' }), [1, 3]);
  // A Magnet+ in one corner against a plain Magnet in the other: the heavy one wins.
  sameSet(allowedFor({ 0: 'O magnet+', 8: 'O magnet' }), [1, 3]);
});
test('Magnet+ is not moved by effects', () => {
  const s = G();
  lay(s, { 0: 'O magnet+' });
  play(s, 'shift', 1);
  eff(s, { dir: 'left', index: 0 });
  assert.equal(s.board[0]?.type, 'magnet');
});
test('Stinky: must not place next to it', () => sameSet(allowedFor({ 4: 'O stinky' }), [0, 2, 6, 8]));
test('Stinky+: corners included', () => sameSet(allowedFor({ 0: 'O stinky+' }), [2, 5, 6, 7, 8]));
test('Stinky+ in the centre leaves nothing to satisfy: anywhere goes', () => sameSet(allowedFor({ 4: 'O stinky+' }), [0, 1, 2, 3, 5, 6, 7, 8]));
test('Beacon: its row or column', () => sameSet(allowedFor({ 0: 'O beacon' }), [1, 2, 3, 6]));
test('Beacon: placing one picks its row or its column', () => {
  const s = G();
  play(s, 'beacon', 1);
  sameSet(effectOpts(s).map((o) => o.line), ['row', 'col']);
  eff(s, { line: 'col' });
  s.hands.O.push({ type: 'pebble', plus: false });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(allowedSquares(s), [4, 7]);
});
test('Beacon+: row or column, and it outweighs another restriction', () => sameSet(allowedFor({ 0: 'O beacon+', 8: 'O magnet' }), [1, 2, 3, 6]));
test('Beacon+ off the diagonals: only row and column', () => sameSet(allowedFor({ 1: 'O beacon+' }), [0, 2, 4, 7]));
test('Beacon+ in the centre: its row and column', () => sameSet(allowedFor({ 4: 'O beacon+' }), [1, 3, 5, 7]));
test('Restrictions compose: a square satisfying both wins', () => sameSet(allowedFor({ 0: 'O magnet', 2: 'O beacon' }), [1]));
test('Restrictions compose: if none satisfies all, satisfy as many as any square can', () =>
  sameSet(allowedFor({ 0: 'O magnet', 8: 'O beacon' }), [1, 2, 3, 5, 6, 7]));
test('Restrictions compose: magnet + stinky', () =>
  // magnet 4 wants 1,3,5,7; stinky 2 forbids 1,5
  sameSet(allowedFor({ 4: 'O magnet', 2: 'O stinky' }), [3, 7]));
test('Restrictions compose: three at once', () =>
  // magnet0 {1,3}; magnet8 {5,7}; beacon2 {1,5,8,0}->free {1,5}
  sameSet(allowedFor({ 0: 'O magnet', 8: 'O magnet', 2: 'O beacon' }), [1, 5]));
test('Your own restriction stones do not restrict you', () => sameSet(allowedFor({ 0: 'X magnet' }), [1, 2, 3, 4, 5, 6, 7, 8]));
test('An occupied satisfying square does not count', () => sameSet(allowedFor({ 0: 'O magnet', 1: 'X pebble', 3: 'X pebble' }), [2, 4, 5, 6, 7, 8]));
test('Restrictions constrain the place actions offered', () => {
  const s = G();
  lay(s, { 0: 'O magnet' });
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  sameSet(legalActions(s).map((a) => a.pos), [1, 3]);
});

group('mountain');

test('Mountain is never moved by stone effects', () => {
  const cases = [['bumper', 0], ['lasso', 7], ['swap', 0], ['rotate', 0], ['whirl', 4], ['flip', 0], ['2048', 8], ['shift', 0], ['frog', 2]];
  for (const [stone, pos] of cases) {
    const s = G();
    lay(s, { 1: 'X mountain' });
    play(s, stone, pos);
    let guard = 0;
    while (s.phase === 'effect' && guard++ < 5) {
      for (const a of legalActions(s)) {   // every option must leave it put
        const c = cloneState(s); applyAction(c, a);
        assert.equal(ids(c)[1], 101, `${stone} ${JSON.stringify(a)} moved the Mountain\n${render(c)}`);
      }
      applyAction(s, legalActions(s)[0]);
    }
    assert.equal(ids(s)[1], 101, `${stone} moved the Mountain\n${render(s)}`);
  }
});
test('Mountain+ is sealed against every trick', () => {
  const s = G({ tricksX: ['overtake', 'relocate', 'mirror', 'nudge', 'pluck', 'bribe', 'anchor'] });
  lay(s, { 4: 'O mountain+', 8: 'X mountain+' });
  play(s, 'pebble', 1);
  const o = legalActions(s);
  assert.ok(!o.some((a) => a.use === 'overtake'), 'overtake');
  assert.ok(!o.some((a) => a.use === 'pluck' && a.pos === 4), 'pluck');
  assert.ok(!o.some((a) => a.use === 'bribe'), 'bribe');
  assert.ok(!o.some((a) => a.use === 'relocate' && a.from === 8), 'relocate');
  assert.ok(!o.some((a) => a.use === 'mirror' && (a.a === 0 || a.b === 8)), 'mirror');
  assert.ok(!o.some((a) => a.use === 'nudge' && (a.from === 4 || a.from === 8)), 'nudge');
  assert.ok(!o.some((a) => a.use === 'anchor' && a.pos === 8), 'anchor');
});
test('Mountain+ is not returned, converted or swapped by stones', () => {
  for (const stone of ['firecracker', 'turncoat', 'swap', 'swap+', 'firecracker+', 'turncoat+']) {
    const s = G();
    lay(s, { 1: 'O mountain+' });
    play(s, stone, 0);
    turnPassedTo(s, 'O');
    assert.equal(s.board[1].id, 101); assert.equal(s.board[1].player, 'O', stone);
  }
});
test('Plain Mountain may be returned by a Firecracker or converted by a Turncoat', () => {
  const s = G();
  lay(s, { 1: 'O mountain' });
  play(s, 'firecracker', 0);
  assert.equal(s.board[1], null);
  assert.ok(handHas(s, 'O', 'mountain', false));
  const t = G();
  lay(t, { 1: 'O mountain' });
  play(t, 'turncoat', 0);
  assert.equal(t.board[1].player, 'X');
});

group('snare');

test('Snare: an enemy stone placed next to it does nothing', () => {
  const s = G();
  lay(s, { 0: 'O snare', 2: 'O pebble' });
  play(s, 'shift', 1);
  turnPassedTo(s, 'O');
  expectAt(s, { 2: 102 });
});
test('Snare does not reach diagonals; Snare+ does', () => {
  const s = G();
  lay(s, { 0: 'O snare', 5: 'O pebble' });
  play(s, 'shift', 4);
  assert.equal(s.phase, 'effect');
  const t = G();
  lay(t, { 0: 'O snare+', 5: 'O pebble' });
  play(t, 'shift', 4);
  turnPassedTo(t, 'O');
});
test('Snare does not trap its own side', () => {
  const s = G();
  lay(s, { 0: 'X snare', 2: 'O pebble' });
  play(s, 'shift', 1);
  assert.equal(s.phase, 'effect');
});

group('hush');

test('Hush: the enemy\'s next stone does nothing; the one after works', () => {
  const s = G();
  play(s, 'hush', 8);
  assert.equal(s.silenced.O, 1);
  turnPassedTo(s, 'O');
  lay(s, { 1: 'X pebble' });
  play(s, 'shift', 0);
  turnPassedTo(s, 'X');
  expectAt(s, { 1: 101 });
  assert.equal(s.silenced.O, 0);
  play(s, 'pebble', 6);
  play(s, 'shift', 5);
  assert.equal(s.phase, 'effect');
});
test('Hush+: the enemy\'s next two stones do nothing', () => {
  const s = G();
  play(s, 'hush+', 8);
  assert.equal(s.silenced.O, 2);
  lay(s, { 1: 'X pebble' });
  play(s, 'shift', 0);   // O silenced
  turnPassedTo(s, 'X');
  expectAt(s, { 1: 101 });
  play(s, 'pebble', 6);
  play(s, 'shift', 5);   // O silenced
  turnPassedTo(s, 'X');
  play(s, 'pebble', 2);
  play(s, 'shift', 3);   // works
  assert.equal(s.phase, 'effect');
});
test('Hush silences the enemy, not yourself', () => {
  const s = G();
  play(s, 'hush', 8);
  assert.equal(s.silenced.X, 0);
});

group('glue');

test('Glue sticks itself and the stones beside it, not diagonals', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 4: 'X pebble', 8: 'O pebble' });
  play(s, 'glue', 5);   // 5: neighbours 2, 4, 8
  assert.ok(s.board[5].stuck, 'glue itself');
  assert.ok(s.board[4].stuck && s.board[8].stuck, 'neighbours');
  assert.ok(!s.board[1].stuck, '1 is not beside 5');
  assert.ok(isStuck(s, 4));
});
test('Glue+ may stick only your own stones, corners included', () => {
  const s = G();
  lay(s, { 0: 'X pebble', 1: 'O pebble', 8: 'X pebble' });
  play(s, 'glue+', 4);
  assert.equal(effectOpts(s).length, 2);
  eff(s, { only: true });
  assert.ok(s.board[0].stuck && s.board[8].stuck && s.board[4].stuck);
  assert.ok(!s.board[1].stuck, 'the enemy stone beside it stays free');
});
test('Glued stones are not moved again', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  play(s, 'glue', 0);
  const id = play(s, 'shift', 2);   // O shift on 2: row 0 = [G!, O!, S]
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 1: 101, 2: id });
  assert.equal(s.board[0].type, 'glue');
  assert.equal(s.board[1].id, 101);
});

group('firecracker');

test('Firecracker blows a stone around it back into its owner\'s hand and burns itself up', () => {
  const s = G();
  lay(s, { 1: 'O shift+' });
  const n = s.hands.O.length, nx = s.hands.X.length;
  play(s, 'firecracker', 4);   // single target: resolves on its own
  turnPassedTo(s, 'O');
  assert.equal(s.board[1], null);
  assert.equal(s.board[4], null, 'the Firecracker itself is gone');
  assert.equal(s.hands.O.length, n + 1);
  assert.ok(handHas(s, 'O', 'shift', true), 'returns with its plus');
  assert.equal(s.hands.X.length, nx, 'burnt, not returned to X\'s hand');
  assert.ok(!handHas(s, 'X', 'firecracker', false));
});
test('Firecracker offers every stone around it, corners included, yours too', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'X swap', 0: 'O pebble' });
  play(s, 'firecracker', 4);
  sameSet(effectOpts(s).map((a) => a.target), [0, 1, 3]);
  eff(s, { target: 3 });
  assert.equal(s.board[3], null); assert.equal(s.board[4], null);
  expectAt(s, { 0: 100, 1: 101 });
  assert.ok(handHas(s, 'X', 'swap', false));
});
test('Firecracker with nothing around it does nothing and stays', () => {
  const s = G();
  lay(s, { 8: 'O pebble' });
  const id = play(s, 'firecracker', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 0: id, 8: 108 });
});
test('Firecracker+ blows every enemy stone beside it back, leaves yours and corners, burns up', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble+', 5: 'X pebble', 0: 'O pebble' });
  const n = s.hands.O.length;
  play(s, 'firecracker+', 4);
  assert.ok(effectOpts(s).some((o) => o.target === undefined), 'offers the volley');
  assert.ok(effectOpts(s).some((o) => o.target === 0), 'or any single stone around it');
  applyAction(s, effectOpts(s).find((o) => o.target === undefined));
  turnPassedTo(s, 'O');
  expectAt(s, { 1: 0, 3: 0, 4: 0, 5: 105, 0: 100 });
  assert.equal(s.hands.O.length, n + 2); assert.ok(handHas(s, 'O', 'pebble', true));
});
test('Firecracker+ beside only your own stones does nothing', () => {
  const s = G();
  lay(s, { 1: 'X pebble', 0: 'O pebble' });
  const id = play(s, 'firecracker+', 4);
  expectAt(s, { 1: 101, 4: id, 0: 100 });
});

group('turncoat');

test('Turncoat trades sides with an enemy stone beside it', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'X pebble', 0: 'O pebble' });
  const id = play(s, 'turncoat', 4);   // only enemy neighbour: 1 -> resolves on its own
  assert.equal(s.board[1].player, 'X'); assert.equal(s.board[1].id, 101);
  assert.equal(s.board[4].player, 'O'); assert.equal(s.board[4].id, id);
  assert.equal(s.board[3].player, 'X'); assert.equal(s.board[0].player, 'O');
});
test('Turncoat+ reaches corners', () => {
  const s = G();
  lay(s, { 0: 'O pebble' });
  play(s, 'turncoat+', 4);
  assert.equal(s.board[0].player, 'X'); assert.equal(s.board[4].player, 'O');
});
test('Turncoat can complete a line', () => {
  const s = G();
  lay(s, { 0: 'X pebble', 1: 'O pebble', 2: 'X pebble' });
  play(s, 'turncoat', 4);
  assert.equal(s.winner, 'X');
});

group('parrot');

function afterOPlays(stone, pos, o = {}) {
  const s = G({ first: 'O', ...o });
  play(s, stone, pos);
  while (s.phase === 'effect') applyAction(s, legalActions(s)[0]);
  turnPassedTo(s, 'X');
  return s;
}
test('Parrot becomes a copy of the enemy\'s last stone and does what it does', () => {
  const s = afterOPlays('bumper', 7);
  lay(s, { 1: 'O pebble', 4: 'O pebble' });
  play(s, 'parrot', 2);
  assert.equal(s.board[2].type, 'bumper'); assert.equal(s.board[2].plus, false);
  expectAt(s, { 1: 0, 0: 101, 4: 104, 6: 0 });
});
test('Parrot+ becomes an upgraded copy', () => {
  const s = afterOPlays('bumper', 7);
  lay(s, { 1: 'O pebble', 4: 'O pebble' });
  play(s, 'parrot+', 2);
  assert.equal(s.board[2].type, 'bumper'); assert.equal(s.board[2].plus, true);
  expectAt(s, { 1: 0, 0: 101, 4: 0, 6: 104 }, 'Bumper+ reaches the corner neighbour');
});
test('Parrot copies a plus stone as plus', () => {
  const s = afterOPlays('glue+', 8);
  lay(s, { 1: 'O pebble', 4: 'O pebble' });
  play(s, 'parrot', 0);
  assert.equal(s.board[0].type, 'glue'); assert.equal(s.board[0].plus, true);
  assert.equal(effectOpts(s).length, 2, 'the copy offers Glue+\'s choice');
});
test('Parrot copies restriction stones too', () => {
  const s = afterOPlays('magnet', 8);
  play(s, 'parrot', 0);
  assert.equal(s.board[0].type, 'magnet');
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });   // O now bound by X's magnet
  sameSet(allowedSquares(s), [1, 3]);
});
test('Parrot with nothing to copy stays a Parrot and does nothing', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  play(s, 'parrot', 0);
  assert.equal(s.board[0].type, 'parrot');
  turnPassedTo(s, 'O');
});
test('Parrot copies the last stone the ENEMY placed, not your own', () => {
  const s = afterOPlays('pebble', 8);
  play(s, 'bumper', 6); play(s, 'pebble', 7);   // X bumper, O pebble
  play(s, 'parrot', 0);
  assert.equal(s.board[0].type, 'pebble');
});

group('twin');

test('Twin: a Pebble from hand lands on the square facing it through the centre', () => {
  const s = G({ handX: ['twin', 'pebble', 'pebble+', 'shift'] });
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'twin', 0);   // single square: resolves on its own
  turnPassedTo(s, 'O');
  assert.equal(s.board[0].id, id);
  assert.deepEqual([s.board[8].player, s.board[8].type, s.board[8].plus], ['X', 'pebble', false]);
  assert.ok(handHas(s, 'X', 'pebble', true) && !handHas(s, 'X', 'pebble', false), 'plain Pebble is spent first');
  assert.equal(s.placements.X, 2);
  assert.notEqual(s.board[8].id, id);
});
test('Twin: nothing if the facing square is taken (or it is the centre)', () => {
  const s = G({ handX: ['twin', 'pebble', 'shift'] });
  lay(s, { 7: 'O pebble' });
  play(s, 'twin', 1);
  turnPassedTo(s, 'O');
  assert.equal(s.board.filter(Boolean).length, 2);
  const t = G({ handX: ['twin', 'pebble', 'shift'] });
  play(t, 'twin', 4);
  turnPassedTo(t, 'O');
  assert.equal(t.board.filter(Boolean).length, 1);
});
test('Twin+: facing square or any empty square beside it', () => {
  const s = G({ handX: ['twin+', 'pebble', 'shift'] });
  lay(s, { 1: 'O pebble' });
  play(s, 'twin+', 0);
  sameSet(effectOpts(s).map((a) => a.target), [3, 8]);
  eff(s, { target: 3 });
  assert.equal(s.board[3].type, 'pebble'); assert.equal(s.board[3].player, 'X');
  const t = G({ handX: ['twin+', 'pebble', 'shift'] });
  play(t, 'twin+', 4);
  sameSet(effectOpts(t).map((a) => a.target), [1, 3, 5, 7]);
});
test('Twin without a Pebble does nothing', () => {
  const s = G({ handX: ['twin', 'shift'] });
  play(s, 'twin', 0);
  turnPassedTo(s, 'O');
  assert.equal(s.board.filter(Boolean).length, 1);
});
test('Twin spends a Pebble+ if that is all it has', () => {
  const s = G({ handX: ['twin', 'pebble+', 'shift'] });
  play(s, 'twin', 2);
  assert.equal(s.board[6].plus, true);
  assert.ok(!s.hands.X.some((h) => h.type === 'pebble'));
});
test('Twin can complete a line with its Pebble', () => {
  const s = G({ handX: ['twin', 'pebble'] });
  lay(s, { 4: 'X pebble' });
  play(s, 'twin', 0);
  assert.equal(s.winner, 'X');
});

group('guardian');

// X's Guardian on 4 guards itself and X's stones beside it (1, 3, 5, 7).
function guardedGame(o = {}, plus = false) {
  const s = G({ first: 'O', ...o });
  lay(s, { 4: plus ? 'X guardian+' : 'X guardian', 1: 'X pebble', 0: 'X pebble', 8: 'O pebble' });
  return s;
}
test('Guardian: enemy stones cannot return its charges (corners not covered)', () => {
  const s = guardedGame();
  play(s, 'firecracker', 3);    // around 3: 0, 1, 4 hold X stones; only 0 is unguarded
  assert.equal(s.board[0], null);
  expectAt(s, { 1: 101, 4: 104 });
});
test('Guardian+: corners included', () => {
  const s = guardedGame({}, true);
  play(s, 'firecracker', 3);
  turnPassedTo(s, 'X');
  expectAt(s, { 0: 100, 1: 101, 4: 104 });
});
test('Guardian: enemy stones cannot move its charges (they are walls)', () => {
  const s = guardedGame();
  const id = play(s, '2048', 2);    // down: col 0 X falls 0 -> 6; col 1 guarded 1, 4 hold; col 2 packs
  eff(s, { dir: 'down' });
  expectAt(s, { 0: 0, 6: 100, 1: 101, 4: 104, 8: 108, 5: id });
  const t = guardedGame();
  play(t, 'bumper+', 2);            // would push the Guardian 4 -> 6
  expectAt(t, { 1: 101, 4: 104, 6: 0 });
  const v = guardedGame();
  play(v, 'swap', 2);               // around 2: 1 and 4, both guarded
  turnPassedTo(v, 'X');
  expectAt(v, { 1: 101, 4: 104 });
});
test('Guardian: enemy stones cannot convert its charges', () => {
  const s = guardedGame();
  play(s, 'turncoat', 2);   // beside 2: 1 (guarded), 5 empty
  turnPassedTo(s, 'X');
  assert.equal(s.board[1].player, 'X');
});
test('Guardian: an enemy Frog leaps its charge but cannot return it', () => {
  const t = G({ first: 'O' });
  lay(t, { 4: 'X guardian', 1: 'X pebble' });
  const id = play(t, 'frog', 2);   // over 1 into 0
  expectAt(t, { 0: id, 1: 101, 2: 0 });
});
test('Guardian: enemy tricks cannot touch its charges', () => {
  const s = guardedGame({ tricksO: ['pluck', 'bribe', 'overtake', 'mirror', 'nudge'] });
  play(s, 'pebble', 6);
  const o = legalActions(s);
  assert.ok(!o.some((a) => a.use === 'overtake'), 'overtake');
  sameSet(o.filter((a) => a.use === 'pluck').map((a) => a.pos), [0], 'pluck');
  sameSet(o.filter((a) => a.use === 'bribe').map((a) => a.pos), [0], 'bribe');
  assert.ok(!o.some((a) => a.use === 'mirror' && [1, 7].includes(a.a)), 'mirror');
  assert.ok(!o.some((a) => a.use === 'nudge' && [1, 4].includes(a.from)), 'nudge');
});
test('Guardian does not stop its owner moving its own stones', () => {
  const s = G();
  lay(s, { 4: 'X guardian', 1: 'X pebble' });
  const id = play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 0: 0, 1: id, 2: 101 });
});
test('Guardian protects only its owner\'s stones', () => {
  const s = G({ first: 'O' });
  lay(s, { 4: 'X guardian', 1: 'O pebble' });
  play(s, 'firecracker', 2);   // O firecracker blows O's own stone on 1: not X's to protect
  assert.equal(s.board[1], null);
});
test('Guardian+: safe from anything the enemy does (an enemy Glue does not stick it)', () => {
  const s = guardedGame({}, true);
  play(s, 'glue+', 2);
  assert.ok(!s.board[1].stuck && !s.board[4].stuck, 'enemy Glue stuck a Guardian+ charge');
});

// ── Tricks ──────────────────────────────────────────────────────────────────

group('trick flow');

test('tricks come after the stone; pass ends the turn', () => {
  const s = G({ tricksX: ['reinforce'] });
  play(s, 'pebble', 0);
  assert.equal(s.phase, 'trick');
  const o = legalActions(s);
  assert.deepEqual(o.map((a) => a.use), ['pass', 'reinforce']);
  trick(s, 'pass');
  turnPassedTo(s, 'O');
  assert.deepEqual(s.tricks.X, ['reinforce']); assert.equal(s.uses.X, 1);
});
test('no trick phase when no trick has an option', () => {
  const s = G({ tricksX: ['overtake'] });
  play(s, 'pebble', 0);
  turnPassedTo(s, 'O');
});
test('one use a duel by default: a spent trick is gone and no more tricks after', () => {
  const s = G({ tricksX: ['reinforce', 'muffle'] });
  play(s, 'pebble', 0);
  trick(s, 'reinforce');
  turnPassedTo(s, 'O');
  assert.deepEqual(s.tricks.X, ['muffle']); assert.equal(s.uses.X, 0);
  play(s, 'pebble', 8);
  play(s, 'pebble', 1);
  turnPassedTo(s, 'O');   // no trick phase: out of uses
});
test('with two uses, two tricks in one turn (even the same trick twice)', () => {
  const s = G({ tricksX: ['reinforce', 'reinforce', 'muffle'], usesX: 2 });
  play(s, 'pebble', 0);
  assert.equal(legalActions(s).filter((a) => a.use === 'reinforce').length, 1, 'trick options de-duplicated');
  trick(s, 'reinforce');
  assert.equal(s.phase, 'trick'); assert.equal(s.player, 'X');
  trick(s, 'reinforce');
  turnPassedTo(s, 'O');
  assert.equal(count(s, 'X', 'pebble'), 5 + 2);
  assert.deepEqual(s.tricks.X, ['muffle']);
});
test('with two uses they may also be spread over two turns', () => {
  const s = G({ tricksX: ['reinforce', 'muffle'], usesX: 2 });
  play(s, 'pebble', 0);
  trick(s, 'reinforce');
  trick(s, 'pass');
  play(s, 'pebble', 8);
  play(s, 'pebble', 1);
  assert.equal(s.phase, 'trick');
  trick(s, 'muffle');
  turnPassedTo(s, 'O');
});
test('a trick that makes your line wins, and ends the turn at once', () => {
  const s = G({ tricksX: ['relocate', 'reinforce'], usesX: 2 });
  lay(s, { 0: 'X pebble', 1: 'X pebble' });
  play(s, 'pebble', 8);
  trick(s, 'relocate', { from: 8, to: 2 });
  assert.equal(s.over, true); assert.equal(s.winner, 'X');
});
test('a trick that gives the opponent a line loses', () => {
  const s = G({ tricksX: ['mirror'] });
  lay(s, { 0: 'O pebble', 1: 'O pebble', 6: 'O pebble' });
  play(s, 'pebble', 8);
  trick(s, 'mirror', { a: 2, b: 6 });
  assert.equal(s.winner, 'O');
});

group('tricks');

test('Overtake: an enemy centre stone goes back to their hand', () => {
  const s = G({ tricksX: ['overtake'] });
  lay(s, { 4: 'O shift' });
  play(s, 'pebble', 0);
  trick(s, 'overtake');
  assert.equal(s.board[4], null); assert.ok(handHas(s, 'O', 'shift', false));
});
test('Overtake: not your own centre stone', () => {
  const s = G({ tricksX: ['overtake'] });
  lay(s, { 4: 'X shift' });
  play(s, 'pebble', 0);
  turnPassedTo(s, 'O');
});
test('Relocate: move one of your stones to any empty square', () => {
  const s = G({ tricksX: ['relocate'] });
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'pebble', 0);
  const o = trickOpts(s, 'relocate');
  assert.equal(o.length, 7);
  assert.ok(o.every((a) => a.from === 0));
  trick(s, 'relocate', { from: 0, to: 8 });
  expectAt(s, { 0: 0, 8: id, 1: 101 });
});
test('Mirror: swap two squares facing each other through the centre', () => {
  const s = G({ tricksX: ['mirror'] });
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'pebble', 0);
  const o = trickOpts(s, 'mirror');
  sameSet(o.map((a) => a.a), [0, 1]);
  trick(s, 'mirror', { a: 1, b: 7 });
  expectAt(s, { 1: 0, 7: 101, 0: id });
});
test('Nudge: any stone one step into an empty square beside it', () => {
  const s = G({ tricksX: ['nudge'] });
  lay(s, { 4: 'O pebble', 1: 'O mountain' });
  play(s, 'pebble', 0);
  const o = trickOpts(s, 'nudge');
  assert.ok(o.every((a) => a.from !== 1), 'mountain not nudged');
  sameSet(o.filter((a) => a.from === 4).map((a) => a.to), [3, 5, 7]);
  sameSet(o.filter((a) => a.from === 0).map((a) => a.to), [3]);
  trick(s, 'nudge', { from: 4, to: 7 });
  expectAt(s, { 4: 0, 7: 104 });
});
test('Mind Control: the enemy must play the named stone next', () => {
  const s = G({ tricksX: ['mind-control'], handO: ['pebble', 'shift', 'shift+', 'bumper'] });
  play(s, 'pebble', 0);
  sameSet(trickOpts(s, 'mind-control').map((a) => a.stone).map((x) => ({ pebble: 0, shift: 1, bumper: 2 })[x]), [0, 1, 2]);
  trick(s, 'mind-control', { stone: 'shift' });
  turnPassedTo(s, 'O');
  const sel = legalActions(s);
  assert.equal(sel.length, 2);
  assert.ok(sel.every((a) => a.stone === 'shift'));
  play(s, 'shift+', 8);
  while (s.phase === 'effect') applyAction(s, legalActions(s)[0]);
  play(s, 'pebble', s.board[7] ? 6 : 7);
  // O's next turn is free again
  assert.equal(s.forced, null);
  assert.equal(legalActions(s).length, 3);
});
test('Rehearse: one of your stones does its thing again from where it stands', () => {
  const s = G({ tricksX: ['rehearse'] });
  lay(s, { 3: 'X shift', 4: 'O pebble' });
  play(s, 'pebble', 8);
  const o = trickOpts(s, 'rehearse');
  assert.ok(o.length === 4 && o.every((a) => a.pos === 3));
  trick(s, 'rehearse', { pos: 3, dir: 'right', index: 1 });
  expectAt(s, { 3: 0, 4: 103, 5: 104 });
});
test('Rehearse: not enemy stones, not stones without an effect, not switched-off stones', () => {
  const s = G({ tricksX: ['rehearse'], disabled: 'bumper' });
  lay(s, { 3: 'O shift', 4: 'X magnet', 1: 'X bumper' });
  play(s, 'pebble', 8);
  turnPassedTo(s, 'O');
});
test('Muffle: the enemy\'s next stone does nothing', () => {
  const s = G({ tricksX: ['muffle'] });
  play(s, 'pebble', 8);
  trick(s, 'muffle');
  assert.equal(s.silenced.O, 1);
  lay(s, { 1: 'X pebble' });
  play(s, 'shift', 0);
  turnPassedTo(s, 'X');
  expectAt(s, { 1: 101 });
});
test('Anchor: glue one of your stones; nothing moves it again', () => {
  const s = G({ tricksX: ['anchor'] });
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'pebble', 2);
  sameSet(trickOpts(s, 'anchor').map((a) => a.pos), [2]);
  trick(s, 'anchor', { pos: 2 });
  assert.ok(s.board[2].stuck);
  play(s, 'shift', 0);   // O: row0 [S, O, X!]
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 2: id });
});
test('Pluck: any enemy stone goes back to their hand', () => {
  const s = G({ tricksX: ['pluck'] });
  lay(s, { 5: 'O glue+', 3: 'X pebble' });
  play(s, 'pebble', 8);
  sameSet(trickOpts(s, 'pluck').map((a) => a.pos), [5]);
  trick(s, 'pluck', { pos: 5 });
  assert.equal(s.board[5], null); assert.ok(handHas(s, 'O', 'glue', true));
});
test('Bribe: an enemy stone off the centre becomes yours', () => {
  const s = G({ tricksX: ['bribe'] });
  lay(s, { 5: 'O pebble', 4: 'O pebble' });
  play(s, 'pebble', 8);
  sameSet(trickOpts(s, 'bribe').map((a) => a.pos), [5]);
  trick(s, 'bribe', { pos: 5 });
  assert.equal(s.board[5].player, 'X'); assert.equal(s.board[5].id, 105);
});
test('Reinforce: put a Pebble+ into your hand', () => {
  const s = G({ tricksX: ['reinforce'], handX: ['pebble', 'shift'] });
  play(s, 'pebble', 8);
  trick(s, 'reinforce');
  assert.ok(handHas(s, 'X', 'pebble', true));
});

group('auto-resolve');

test('effects with a single option resolve on their own', () => {
  for (const [stone, pos, spec] of [
    ['bumper', 0, { 1: 'O pebble' }], ['lasso', 0, { 2: 'O pebble' }], ['hush', 0, {}], ['glue', 0, {}],
    ['rotate', 8, { 5: 'O pebble' }], ['swap', 0, { 1: 'O pebble' }], ['firecracker', 0, { 1: 'O pebble' }],
    ['turncoat', 0, { 1: 'O pebble' }], ['frog', 0, { 1: 'O pebble' }],
  ]) {
    const s = G({ handX: ['twin', 'pebble', 'pebble'] });
    lay(s, spec);
    play(s, stone, pos);
    assert.notEqual(s.phase, 'effect', `${stone} waited for a choice`);
  }
});
test('effects with several options wait for a choice', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble' });
  play(s, 'swap', 0);
  assert.equal(s.phase, 'effect'); assert.equal(legalActions(s).length, 2);
});

// ── Fields ──────────────────────────────────────────────────────────────────

group('fields');

test('every field has text', () => {
  for (const f of ['gravity', 'carousel', 'tide', 'quake']) assert.ok(FIELDS[f]?.text);
});
test('Gravity: after each of its turns every stone falls as far as it can', () => {
  const s = G({ field: 'gravity', first: 'O' });
  lay(s, { 1: 'X pebble', 3: 'X mountain', 2: 'X pebble', 8: 'O pebble' });
  const id = play(s, 'pebble', 0);
  turnPassedTo(s, 'X');
  expectAt(s, { 0: id, 3: 103, 1: 0, 7: 101, 2: 0, 5: 102, 8: 108 });
});
test('Gravity does not act after the other side\'s turns', () => {
  const s = G({ field: 'gravity' });
  const id = play(s, 'pebble', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 0: id });
});
test('Carousel: the outer ring turns one step clockwise', () => {
  const s = G({ field: 'carousel', first: 'O' });
  lay(s, { 4: 'X pebble', 3: 'X pebble' });
  const id = play(s, 'pebble', 2);
  expectAt(s, { 2: 0, 5: id, 3: 0, 0: 103, 4: 104 });
});
test('Tide: the middle row slides one step right, wrapping', () => {
  const s = G({ field: 'tide', first: 'O' });
  lay(s, { 3: 'X pebble', 1: 'X pebble' });
  const id = play(s, 'pebble', 5);
  expectAt(s, { 3: id, 4: 103, 5: 0, 1: 101 });
});
test('Quake: the board mirrors left to right', () => {
  const s = G({ field: 'quake', first: 'O' });
  lay(s, { 3: 'X pebble', 1: 'X pebble' });
  const id = play(s, 'pebble', 0);
  expectAt(s, { 0: 0, 2: id, 3: 0, 5: 103, 1: 101 });
});
test('Fields respect Mountains and glue', () => {
  const s = G({ field: 'carousel', first: 'O' });
  lay(s, { 1: 'X mountain', 5: 'X pebble!' });
  const id = play(s, 'pebble', 0);   // 0 steps over the Mountain on 1 to 2
  expectAt(s, { 0: 0, 1: 101, 2: id, 5: 105 });
});
test('a line the field makes counts (for whoever gets it)', () => {
  const s = G({ field: 'carousel', first: 'O' });
  lay(s, { 3: 'X pebble', 0: 'X pebble', 1: 'X pebble' });
  play(s, 'pebble', 8);
  assert.equal(s.over, true); assert.equal(s.winner, 'X');
});

// ── Places the engine's behaviour contradicts a text (hard) ─────────────────

group('stuck vs. tricks and rehearse');

test('Glue: a glued stone is not moved by Relocate', () => {
  const s = G({ tricksX: ['relocate'] });
  lay(s, { 0: 'X pebble!' });
  play(s, 'pebble', 8);
  assert.ok(!trickOpts(s, 'relocate').some((a) => a.from === 0), 'Relocate offers to move a glued stone');
});
test('Anchor: an anchored stone is not moved by Relocate later', () => {
  const s = G({ tricksX: ['anchor', 'relocate'], usesX: 2 });
  play(s, 'pebble', 0);
  trick(s, 'anchor', { pos: 0 });
  assert.ok(!trickOpts(s, 'relocate').some((a) => a.from === 0), 'Relocate offers to move the anchored stone');
});
test('Glue: a glued stone is not moved by Mirror', () => {
  const s = G({ tricksX: ['mirror'] });
  lay(s, { 0: 'O pebble!' });
  play(s, 'pebble', 3);
  assert.ok(!trickOpts(s, 'mirror').some((a) => a.a === 0 || a.b === 0), 'Mirror offers to swap a glued stone');
});
test('Glue: a glued Swap rehearsed does not move itself', () => {
  const s = G({ tricksX: ['rehearse'] });
  lay(s, { 4: 'X swap!', 1: 'O pebble' });
  play(s, 'pebble', 8);
  assert.ok(!trickOpts(s, 'rehearse').some((a) => a.pos === 4), 'Rehearse lets a glued Swap trade places');
});
test('Glue: a glued Frog rehearsed does not leap', () => {
  const s = G({ tricksX: ['rehearse'] });
  lay(s, { 0: 'X frog!', 1: 'O pebble' });
  play(s, 'pebble', 8);
  assert.ok(!trickOpts(s, 'rehearse').some((a) => a.pos === 0), 'Rehearse lets a glued Frog leap');
});

// ── Ambiguous texts (reported as notes, not failures) ───────────────────────

group('notes');

note('Echo: a Firecracker is the first stone that does something, but burns up, and the echo is kept for a later stone', () => {
  const s = G({ modsX: { echo: true } });
  lay(s, { 1: 'O pebble' });
  play(s, 'firecracker', 0);
  assert.equal(s.echo.X, false, 'echo still unspent after the Firecracker did something');
});
note('Guardian (plain) names only enemy stones and tricks, yet a boss field cannot move its charges either', () => {
  const s = G({ field: 'gravity', first: 'O' });
  lay(s, { 1: 'X guardian', 4: 'X pebble' });
  play(s, 'pebble', 8);
  assert.equal(ids(s)[4], 0, `gravity left the guarded X stone on 4\n${render(s)}`);
});
note('Mountain "nothing ever moves it" vs Relocate/Mirror moving a plain Mountain (Mountain+ says "not even a trick")', () => {
  const s = G({ tricksX: ['relocate'] });
  lay(s, { 0: 'X mountain' });
  play(s, 'pebble', 8);
  assert.ok(!trickOpts(s, 'relocate').some((a) => a.from === 0), 'Relocate can move a plain Mountain');
});
note('Hush "next stone does nothing": is it spent on a stone without an effect?', () => {
  const s = G();
  play(s, 'hush', 8);
  play(s, 'magnet', 0);   // O's next stone
  assert.equal(s.silenced.O, 0, 'silence not spent on the Magnet, carries over to a later stone');
});
note('Hushed/snared restriction stones still restrict', () => {
  const s = G();
  lay(s, { 1: 'X snare' });
  play(s, 'pebble', 8);
  play(s, 'magnet', 0);   // O magnet placed next to X's snare: "does nothing"
  applyAction(s, { type: 'select', stone: 'pebble', plus: false });
  assert.equal(allowedSquares(s).length, 6, `a snared Magnet still binds X to ${JSON.stringify(allowedSquares(s))}`);
});
note('Rehearse excludes Twin although "does its thing again" covers it', () => {
  const s = G({ tricksX: ['rehearse'], handX: ['pebble', 'pebble'] });
  lay(s, { 4: 'X twin' });
  play(s, 'pebble', 8);
  assert.ok(trickOpts(s, 'rehearse').length > 0, 'no Rehearse options for a Twin with a Pebble in hand');
});
note('Firecracker on a Parrot-copy returns the copied type, not a Parrot', () => {
  const s = afterOPlays('bumper+', 8);
  play(s, 'parrot', 0);
  play(s, 'firecracker', 1);   // O
  if (s.phase === 'effect') eff(s, { target: 0 });
  assert.ok(handHas(s, 'X', 'parrot', false), `X got back ${JSON.stringify(s.hands.X.at(-1))}`);
});

// ── cloneState ──────────────────────────────────────────────────────────────

group('cloneState');

function sharedRefs(a, b, path = 's', out = [], skip = new Set(['mods', 'log'])) {
  if (a === null || typeof a !== 'object') return out;
  if (a === b) { out.push(path); return out; }
  for (const k of Object.keys(a)) {
    if (path === 's' && skip.has(k)) continue;
    if (b && typeof b === 'object') sharedRefs(a[k], b[k], `${path}.${k}`, out, skip);
  }
  return out;
}
const snap = (s) => JSON.stringify({ ...s, log: null });

test('cloneState shares no mutable object with the original (mods excepted, by design)', () => {
  const s = G({ tricksX: ['mind-control'] });
  lay(s, { 0: 'X pebble!', 1: 'O shift' });
  play(s, 'bumper', 8);
  trick(s, 'mind-control', { stone: 'pebble' });
  play(s, 'pebble', 6);
  s.selected = { type: 'pebble', plus: false };
  const c = cloneState(s);
  assert.deepEqual(sharedRefs(c, s), []);
});
test('mutating a clone leaves the original alone', () => {
  const s = G({ tricksX: ['mind-control'] });
  lay(s, { 0: 'X pebble!', 1: 'O shift' });
  play(s, 'pebble', 8);
  const before = snap(s);
  const c = cloneState(s);
  c.board[0].player = 'O'; c.board[0].stuck = false; c.board[1] = null;
  c.hands.X[0].plus = true; c.hands.O.pop(); c.tricks.X.push('pluck'); c.uses.X = 9;
  c.silenced.X = 3; c.placements.O = 7; c.echo.X = true;
  applyAction(c, legalActions(c)[0]);
  assert.equal(snap(s), before);
});

// ── Fuzz ────────────────────────────────────────────────────────────────────

group('fuzz');

function rng32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHASES = new Set(['select', 'place', 'effect', 'trick', 'over']);
const fuzzFails = new Map();
let fuzzSteps = 0, maxLen = 0;
const wins = { X: 0, O: 0 }, reasons = {};
function fuzzFail(key, detail) {
  const f = fuzzFails.get(key);
  if (f) f.count++; else fuzzFails.set(key, { count: 1, detail });
}
function invariants(s, where) {
  if (s.board.length !== 9) fuzzFail('board length is 9', where);
  const ids = s.board.filter(Boolean).map((c) => c.id);
  if (new Set(ids).size !== ids.length) fuzzFail('no stone id duplicated on the board', where + '\n' + render(s));
  if (!PHASES.has(s.phase)) fuzzFail('phase is valid', `${where} phase=${s.phase}`);
  if (s.over !== (s.phase === 'over')) fuzzFail('over <=> phase over', where);
  if (s.over && !['X', 'O'].includes(s.winner)) fuzzFail('a finished duel has a winner', where);
  for (const c of s.board) if (c && (!STONES[c.type] || !['X', 'O'].includes(c.player))) fuzzFail('cells are well-formed', where + ' ' + JSON.stringify(c));
  if (!s.over && legalActions(s).length === 0) fuzzFail('legalActions non-empty unless over', `${where} phase=${s.phase}\n${render(s)}`);
}

const GAMES = 20000;
const r = rng32(12345);
const pick = (a) => a[(r() * a.length) | 0];
const FIELD_KEYS = [null, ...Object.keys(FIELDS)];
for (let g = 0; g < GAMES; g++) {
  const hand = () => Array.from({ length: 3 + ((r() * 4) | 0) }, () => ({ type: pick(STONE_TYPES), plus: r() < 0.4 }));
  const tricks = () => Array.from({ length: (r() * 4) | 0 }, () => pick(TRICK_TYPES));
  const mods = () => ({ echo: r() < 0.2, homeTurf: r() < 0.2, freeFirst: r() < 0.2, hourglass: r() < 0.2, velvetRope: r() < 0.2 });
  const cfg = {
    handX: hand(), handO: hand(), first: r() < 0.5 ? 'X' : 'O',
    tricksX: tricks(), tricksO: tricks(), usesX: 1 + ((r() * 2) | 0), usesO: 1 + ((r() * 2) | 0),
    modsX: mods(), modsO: mods(), field: pick(FIELD_KEYS),
    disabled: r() < 0.3 ? pick(STONE_TYPES) : null, log: false,
  };
  const s = createGame(cfg);
  let n = 0;
  const where = () => `game ${g} action ${n} cfg=${JSON.stringify(cfg)}`;
  invariants(s, where());
  while (!s.over) {
    const legal = legalActions(s);
    if (!legal.length) break;
    // cloneState independence: play the clone forward and scribble on it
    if (n % 3 === 0) {
      const before = snap(s);
      const c = cloneState(s);
      const shared = sharedRefs(c, s).filter((p) => !p.startsWith('s.lastPlaced.'));
      if (shared.length) fuzzFail('cloneState shares no mutable objects (mods excepted)', `${where()} shared: ${shared.join(', ')}`);
      for (let k = 0; k < 4 && !c.over; k++) {
        const la = legalActions(c);
        if (!la.length) break;
        applyAction(c, la[(r() * la.length) | 0]);
      }
      c.board.forEach((x) => { if (x) { x.player = 'X'; x.stuck = true; } });
      c.hands.X.push({ type: 'pebble', plus: true }); c.hands.O.length = 0;
      c.lastPlaced.X = { type: 'pebble', plus: true };
      c.tricks.X.length = 0; c.silenced.O = 5;
      if (snap(s) !== before) fuzzFail('mutating a clone leaves the original alone', where());
    }
    const a = legal[(r() * legal.length) | 0];
    try { applyAction(s, a); } catch (e) { fuzzFail('legal actions never throw', `${where()} ${JSON.stringify(a)}: ${e.message}`); break; }
    n++; fuzzSteps++;
    invariants(s, where());
    if (n > 90) { fuzzFail('duel ends within 90 actions', where() + '\n' + render(s)); break; }
  }
  maxLen = Math.max(maxLen, n);
  if (s.over) { wins[s.winner]++; reasons[s.reason] = (reasons[s.reason] || 0) + 1; }
}
test(`fuzz: ${GAMES} random duels keep every invariant`, () => {
  if (fuzzFails.size) {
    throw new Error([...fuzzFails].map(([k, v]) => `${k}: ${v.count} violation(s); first: ${v.detail}`).join('\n'));
  }
});

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`fuzz: ${GAMES} duels, ${fuzzSteps} actions, longest ${maxLen}, wins ${JSON.stringify(wins)}, reasons ${JSON.stringify(reasons)}`);
if (notes.length) {
  console.log(`\n${notes.length} note(s) (ambiguous text, not counted as failures):`);
  for (const n of notes) console.log('  ~ ' + n);
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log('  x ' + f);
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
