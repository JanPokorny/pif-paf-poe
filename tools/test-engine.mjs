// Unit tests for src/engine.js, checked against the player-facing text of every
// stone, condition and boss rule. Plain Node, no dependencies:
//
//   node tools/test-engine.mjs
//
// Exits non-zero if any test fails. Squares are 0..8 row-major:
//   0 1 2
//   3 4 5
//   6 7 8

import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, cloneState, allowedSquares, isStuck,
  hasLine, render, STONES, STONE_TYPES, BASE_STONES, ONCE_STONES, CONDS, RULES, ELS,
} from '../src/engine.js';
import { chooseAction } from '../src/ai.js';

// ── Harness ─────────────────────────────────────────────────────────────────

const failures = [];
let passed = 0;
let section = '';

function group(name) { section = name; }
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`[${section}] ${name}\n      ${String(e.message).split('\n').join('\n      ')}`); }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// X opens unless told otherwise: most tests are about what X's stone does.
// Plenty of Pebbles each, unless a test says otherwise.
const PEBBLES = Array(9).fill('pebble');
function G(o = {}) { return createGame({ first: 'X', log: false, ...o, handX: [...(o.handX ?? []), ...(o.pebblesX ?? PEBBLES)], handO: [...(o.handO ?? []), ...(o.pebblesO ?? PEBBLES)] }); }

// 'O shift' / 'X pebble!' (! = stuck) -> parts
function parse(str) {
  let [player, t] = str.split(' ');
  const stuck = t.endsWith('!'); if (stuck) t = t.slice(0, -1);
  assert.ok(STONES[t], `unknown stone ${t}`);
  return { player, type: t, stuck };
}
// Lay stones by hand. A stone laid on square k gets id 100 + k.
function lay(s, spec) {
  for (const [k, str] of Object.entries(spec)) {
    const c = parse(str);
    const cell = { player: c.player, type: c.type, id: 100 + Number(k) };
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
function play(s, type, pos) {
  const hand = s.hands[s.player];
  if (!hand.some((h) => h.type === type)) hand.push({ type });
  const id = s.nextId;
  applyAction(s, { type: 'select', stone: type });
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
const eff = (s, partial = {}) => { assert.equal(s.phase, 'effect', `expected effect phase, got ${s.phase}`); return act(s, { type: 'effect', ...partial }); };
const effectOpts = (s) => (s.phase === 'effect' ? legalActions(s) : []);
function turnPassedTo(s, p) {
  assert.equal(s.over, false, `game unexpectedly over (winner ${s.winner}, ${s.reason})\n${render(s)}`);
  assert.equal(s.player, p, `expected ${p} to move`);
  assert.equal(s.phase, 'select', `expected select phase, got ${s.phase}`);
}
const sameSet = (a, b, msg) => assert.deepEqual([...a].sort((x, y) => x - y), [...b].sort((x, y) => x - y), msg);
const count = (s, p, type) => s.hands[p].filter((h) => h.type === type).length;
// The squares X may place a pebble on, with these stones laid.
function allowedFor(spec, o = {}) {
  const s = G(o);
  lay(s, spec);
  applyAction(s, { type: 'select', stone: 'pebble' });
  return allowedSquares(s);
}

// ── Core rules ──────────────────────────────────────────────────────────────

group('core');

test('the enemy opens by default', () => {
  const s = createGame({ log: false, handX: PEBBLES, handO: PEBBLES });
  assert.equal(s.first, 'O');
  assert.equal(s.player, 'O');
  assert.equal(s.phase, 'select');
  assert.ok(s.board.every((c) => c === null));
});
test('Pebbles are stones in the hand like any other, and run out', () => {
  const s = G({ handX: ['pebble', 'shift', 'pebble'], pebblesX: [] });
  assert.deepEqual(legalActions(s).map((a) => a.stone), ['pebble', 'shift']);
  play(s, 'pebble', 0); play(s, 'pebble', 8);
  play(s, 'pebble', 2); play(s, 'pebble', 6);
  assert.deepEqual(legalActions(s).map((a) => a.stone), ['shift']);
});
test('a side with no stones left finds a Pebble on its turn', () => {
  const s = G({ handX: ['pebble'], pebblesX: [], handO: ['pebble', 'pebble'], pebblesO: [] });
  play(s, 'pebble', 0);
  play(s, 'pebble', 8);
  assert.equal(s.player, 'X');   // X's turn, with an empty hand: it finds one
  assert.deepEqual(s.hands.X.map((x) => x.type), ['pebble']);
  play(s, 'pebble', 2);
  assert.equal(s.over, false);
});
test('Open Hands: an empty hand still finds a Pebble, and may borrow instead', () => {
  const s = G({ handX: ['pebble'], pebblesX: [], handO: ['shift', 'pebble'], pebblesO: [], conds: ['shared'] });
  play(s, 'pebble', 0);
  play(s, 'pebble', 8);
  assert.equal(s.player, 'X');
  assert.deepEqual(s.hands.X.map((x) => x.type), ['pebble']);
  assert.ok(legalActions(s).some((a) => a.stone === 'shift' && a.from === 'O'));
});
test('a special stone leaves the hand when placed', () => {
  const s = G({ handX: ['mountain', 'mountain'] });
  play(s, 'mountain', 0);
  assert.equal(count(s, 'X', 'mountain'), 1);
});
test('select actions are de-duplicated by type', () => {
  const s = G({ handX: ['shift', 'shift', 'rotate'] });
  assert.deepEqual(legalActions(s).map((a) => a.stone), ['shift', 'rotate', 'pebble']);
});
test('selecting a stone you do not hold throws; acting after the end throws', () => {
  const s = G();
  assert.throws(() => applyAction(s, { type: 'select', stone: 'shift' }));
  lay(s, { 0: 'X pebble', 1: 'X pebble' });
  play(s, 'pebble', 2);
  assert.equal(s.winner, 'X');
  assert.throws(() => applyAction(s, { type: 'select', stone: 'pebble' }));
});
test('three in a row wins (every line)', () => {
  for (const line of [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]) {
    const s = G();
    lay(s, { [line[0]]: 'X pebble', [line[1]]: 'X pebble' });
    play(s, 'pebble', line[2]);
    assert.equal(s.winner, 'X', `line ${line}`);
    assert.equal(s.reason, 'line');
  }
});
test('the mover is checked first when both sides hold a line', () => {
  const s = G();
  lay(s, { 0: 'X pebble', 1: 'X pebble', 3: 'O pebble', 4: 'O pebble', 5: 'O pebble' });
  play(s, 'pebble', 2);
  assert.equal(s.winner, 'X');
});
test('a line an effect makes only for the opponent wins for the opponent', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 1: 'O pebble', 5: 'O pebble' });
  // Shift right on row 1: O's 5 wraps round to 3 — no; use column 2 up: 5 -> 2.
  play(s, 'shift', 8);
  eff(s, { dir: 'up', index: 2 });
  assert.equal(s.winner, 'O');
});
test('a full board goes to the second player: you, when the enemy opened', () => {
  const s = createGame({ log: false, handX: PEBBLES, handO: PEBBLES });
  lay(s, { 0: 'O pebble', 1: 'X pebble', 2: 'O pebble', 3: 'O pebble', 4: 'X pebble', 5: 'O pebble', 6: 'X pebble', 7: 'O pebble' });
  s.player = 'X';
  play(s, 'pebble', 8);
  assert.equal(s.winner, 'X');
  assert.equal(s.reason, 'full');
});
test('forty turns end the duel as a full board would', () => {
  const s = createGame({ log: false, handX: PEBBLES, handO: PEBBLES });
  s.turns = 40;
  play(s, 'pebble', 0);
  assert.equal(s.over, true);
  assert.equal(s.winner, 'X');
});
test('there is no running out: the player to move always has a Pebble', () => {
  const s = createGame({ log: false, handX: PEBBLES, handO: PEBBLES });
  let n = 0;
  while (!s.over && n++ < 20) { const a = legalActions(s); assert.ok(a.length); applyAction(s, a[0]); }
  assert.ok(s.over);
});

// ── Relic mods ──────────────────────────────────────────────────────────────

group('mods');

test('Echo: the first stone that does something does it twice', () => {
  const s = G({ modsX: { echo: true } });
  lay(s, { 1: 'O pebble' });
  play(s, 'shift', 0);   // row 0: X shift at 0, O at 1
  eff(s, { dir: 'right', index: 0 });
  assert.equal(s.phase, 'effect', 'echo asks again');
  eff(s, { dir: 'right', index: 0 });
  assert.equal(s.board[2]?.id, s.board[2]?.id);
  assert.equal(s.board[2].player, 'X');
  assert.equal(s.board[0].player, 'O');
  assert.equal(s.echo.X, false);
});
test('Echo belongs to its owner only', () => {
  const s = G({ modsO: { echo: true } });
  play(s, 'shift', 0);
  eff(s, { dir: 'right', index: 0 });
  turnPassedTo(s, 'O');
});
test('Wings: your first stone ignores the enemy\'s restrictions', () => {
  sameSet(allowedFor({ 0: 'O magnet' }, { modsX: { freeFirst: true } }), [1, 2, 3, 4, 5, 6, 7, 8]);
  const s = G({ modsX: { freeFirst: true } });
  lay(s, { 0: 'O magnet' });
  play(s, 'pebble', 8);
  play(s, 'pebble', 6);
  applyAction(s, { type: 'select', stone: 'pebble' });
  sameSet(allowedSquares(s), [1, 3]);
});

// ── Stones ──────────────────────────────────────────────────────────────────

group('stones');

test('every stone has a name and text', () => {
  for (const t of STONE_TYPES) assert.ok(STONES[t].name && STONES[t].text, t);
});
test('BASE_STONES are the findable ones: everything but the Pebble', () => {
  assert.deepEqual(BASE_STONES, STONE_TYPES.filter((t) => t !== 'pebble'));
});
test('Shift offers its own row and column, each way', () => {
  const s = G();
  play(s, 'shift', 4);
  const o = effectOpts(s).map((a) => `${a.dir}${a.index}`).sort();
  assert.deepEqual(o, ['down1', 'left1', 'right1', 'up1']);
});
test('Shift right wraps the last stone to the front', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 2: 'O pebble' });
  const id = play(s, 'shift', 1);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 0: 102, 1: 100, 2: id });
});
test('Shift steps over a Mountain: it holds its square, the rest go round', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 1: 'O mountain' });
  const id = play(s, 'shift', 2);
  eff(s, { dir: 'right', index: 0 });
  expectAt(s, { 0: id, 1: 101, 2: 100 });
});
test('Rotate in a corner has one block, one way: it resolves on its own', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'rotate', 0);
  turnPassedTo(s, 'O');
  expectAt(s, { 1: id, 4: 101 });
});
test('Rotate moves all four squares, clockwise', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 4: 'O pebble' });
  const id = play(s, 'rotate', 0);
  expectAt(s, { 0: 103, 1: id, 4: 101, 3: 104 });
});
test('Rotate steps over a Mountain in the block', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 4: 'O mountain' });
  const id = play(s, 'rotate', 0);
  // tl -> tr -> (br held) -> bl -> tl
  expectAt(s, { 1: id, 4: 104, 3: 101, 0: 0 });
});
test('2048 slides everything one way as far as it goes, stepping over Mountains', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 1: 'O mountain', 6: 'O pebble' });
  const id = play(s, '2048', 2);
  eff(s, { dir: 'left' });
  // row 0: the Mountain holds 1; 0 already packed left; the 2048 at 2 cannot pass... it packs to the nearest free square beyond
  expectAt(s, { 0: 100, 1: 101, 2: id, 6: 106 });
  const t = G();
  lay(t, { 0: 'O mountain', 2: 'O pebble' });
  play(t, '2048', 5);
  eff(t, { dir: 'left' });
  expectAt(t, { 0: 100, 1: 102 });
});
test('Bumper pushes each enemy stone beside it one step away, or off the edge', () => {
  const s = G();
  lay(s, { 4: 'O shift', 0: 'O pebble', 2: 'X pebble' });
  play(s, 'bumper', 1);
  expectAt(s, { 7: 104, 4: 0, 0: 0, 2: 102 });   // 0 goes off the edge; your own 2 stays
});
test('Bumper: a stone with an occupied square behind it stays', () => {
  const s = G();
  lay(s, { 4: 'O shift', 7: 'O pebble' });
  play(s, 'bumper', 1);
  expectAt(s, { 4: 104, 7: 107 });
});
test('Bumper does not push a Mountain', () => {
  const s = G();
  lay(s, { 1: 'O mountain' });
  play(s, 'bumper', 4);
  expectAt(s, { 1: 101 });
});
test('Lasso pulls any enemy stone onto an empty square beside it', () => {
  const s = G();
  lay(s, { 6: 'O pebble', 5: 'O pebble', 0: 'X pebble' });
  play(s, 'lasso', 2);   // beside 2: 1 (empty) and 5 (already beside, stays); one choice, made on its own
  expectAt(s, { 1: 106, 5: 105, 0: 100 });
});
test('Swap trades with a stone around it, corners included — not further', () => {
  const s = G();
  lay(s, { 7: 'O pebble' });
  play(s, 'swap', 1);
  turnPassedTo(s, 'O');   // nothing around it: no effect
  const t = G();
  lay(t, { 0: 'O pebble' });
  const id = play(t, 'swap', 4);
  expectAt(t, { 4: 100, 0: id });
});
test('Whirl turns the ring; the centre stays', () => {
  const s = G();
  lay(s, { 4: 'O pebble', 0: 'O pebble' });
  play(s, 'whirl', 8);
  eff(s, { turn: 1 });
  expectAt(s, { 1: 100, 4: 104 });
});
test('Frog leaps over a stone; an enemy stone leapt over is knocked off the board', () => {
  const s = G();
  lay(s, { 4: 'O swap' });
  const id = play(s, 'frog', 1);
  expectAt(s, { 7: id, 4: 0, 1: 0 });
  assert.equal(count(s, 'O', 'swap'), 0);
});
test('Frog does not leap diagonally', () => {
  const s = G();
  lay(s, { 4: 'O pebble' });
  play(s, 'frog', 0);
  turnPassedTo(s, 'O');
});
test('Flip mirrors the board; it holds its own square', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 3: 'O mountain', 5: 'O pebble' });
  const id = play(s, 'flip', 4);
  eff(s, { axis: 'h' });
  expectAt(s, { 2: 100, 3: 103, 5: 105, 4: id });
});
test('Magnet: the enemy must place next to it', () => sameSet(allowedFor({ 0: 'O magnet' }), [1, 3]));
test('Stinky: must not place next to it', () => sameSet(allowedFor({ 4: 'O stinky' }), [0, 2, 6, 8]));
test('Beacon: pick its row or its column', () => {
  const s = G();
  play(s, 'beacon', 1);
  sameSet(effectOpts(s).map((o) => o.line), ['row', 'col']);
  eff(s, { line: 'col' });
  applyAction(s, { type: 'select', stone: 'pebble' });
  sameSet(allowedSquares(s), [4, 7]);
});
test('Restrictions compose: satisfy as many as any square can', () => {
  sameSet(allowedFor({ 0: 'O magnet', 2: 'O beacon' }), [1]);
  sameSet(allowedFor({ 0: 'O magnet', 8: 'O magnet' }), [1, 3, 5, 7]);
  sameSet(allowedFor({ 4: 'O magnet', 2: 'O stinky' }), [3, 7]);
});
test('Your own restriction stones do not restrict you', () => sameSet(allowedFor({ 0: 'X magnet' }), [1, 2, 3, 4, 5, 6, 7, 8]));
test('Mountain is never moved by stone effects', () => {
  const s = G();
  lay(s, { 0: 'O mountain' });
  play(s, 'shift', 1);
  eff(s, { dir: 'left', index: 0 });
  expectAt(s, { 0: 100 });
});
test('Firecracker blows a stone back into its owner\'s hand and stays', () => {
  const s = G();
  lay(s, { 0: 'O shift', 8: 'O pebble' });
  const id = play(s, 'firecracker', 4);
  eff(s, { target: 0 });
  expectAt(s, { 0: 0, 4: id, 8: 108 });
  assert.equal(s.board[4].type, 'firecracker');
  assert.equal(count(s, 'O', 'shift'), 1);
});
test('Turncoat trades sides with an enemy stone beside it', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  play(s, 'turncoat', 4);
  assert.equal(s.board[1].player, 'X');
  assert.equal(s.board[4].player, 'O');
});
test('Parrot becomes the enemy\'s last special stone', () => {
  const s = G();
  play(s, 'pebble', 8);
  lay(s, { 0: 'O pebble' });
  play(s, 'shift', 2);
  eff(s, { dir: 'down', index: 2 });
  const id = play(s, 'parrot', 4);
  assert.equal(s.board.find((c) => c?.id === id)?.type ?? s.board[4]?.type, 'shift');
});
test('Parrot with nothing to copy stays a Parrot', () => {
  const s = G();
  play(s, 'parrot', 4);
  assert.equal(s.board[4].type, 'parrot');
});
test('Twin drops a Pebble on the square facing it, whatever holds the centre', () => {
  const s = G();
  lay(s, { 4: 'O pebble' });
  play(s, 'twin', 0);
  assert.equal(s.board[8]?.type, 'pebble');
  assert.equal(s.board[8]?.player, 'X');
  const t = G();
  lay(t, { 8: 'O pebble' });
  play(t, 'twin', 0);
  assert.equal(t.board[8].player, 'O');
});
test('Magpie steals a special stone from the enemy\'s hand', () => {
  const s = G({ handO: ['shift', 'rotate'] });
  play(s, 'magpie', 4);
  eff(s, { stone: 'rotate' });
  assert.equal(count(s, 'X', 'rotate'), 1);
  assert.equal(count(s, 'O', 'rotate'), 0);
  assert.equal(count(s, 'O', 'shift'), 1);
  assert.ok(!legalActions(G({ handX: ['magpie'] })).some((a) => a.stone === 'pebble' && a.type === 'effect'));
});
test('A Pebble sent back goes back into its owner\'s hand', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  play(s, 'firecracker', 4);   // one target: it goes off on its own
  assert.equal(s.board[1], null);
  assert.equal(count(s, 'O', 'pebble'), 10);
});

// ── One-shot stones ─────────────────────────────────────────────────────────

group('one-shot stones');

test('one-shot stones are marked once and counted as spent when played from your hand', () => {
  assert.ok(ONCE_STONES.length >= 8);
  for (const t of ONCE_STONES) assert.ok(STONES[t].once && STONES[t].text, t);
  const s = G({ handX: ['nudge', 'nudge'] });
  lay(s, { 8: 'O pebble' });
  play(s, 'nudge', 0);
  eff(s, { from: 8, to: 7 });
  assert.deepEqual(s.spent.X, ['nudge']);
  assert.equal(count(s, 'X', 'nudge'), 1);
});
test('a one-shot stone that makes your line wins', () => {
  const s = G({ handX: ['nudge'] });
  lay(s, { 0: 'X pebble', 1: 'X pebble', 5: 'X pebble' });
  play(s, 'nudge', 8);
  eff(s, { from: 5, to: 2 });
  assert.equal(s.winner, 'X');
});
test('Rewind sends the enemy\'s newest stone back', () => {
  const s = G({ handX: ['overtake'] });
  lay(s, { 4: 'O shift' });
  s.nextId = 200;   // stones placed from here on are newer than the laid ones
  play(s, 'pebble', 0);
  play(s, 'rotate', 8);
  // (it turns itself from 8 to 7, the Shift from 4 to 5)
  play(s, 'overtake', 2);
  assert.equal(s.board.filter((c) => c?.type === 'rotate').length, 0);
  assert.equal(count(s, 'O', 'rotate'), 1);
});
test('Relocate moves one of your stones anywhere, itself too', () => {
  const s = G({ handX: ['relocate'] });
  lay(s, { 1: 'O pebble' });
  play(s, 'relocate', 0);
  eff(s, { from: 0, to: 8 });
  assert.equal(s.board[8].type, 'relocate');
});
test('Mind Control names the enemy\'s next stone, a Pebble included', () => {
  const s = G({ handX: ['mind-control'], handO: ['shift'] });
  play(s, 'mind-control', 0);
  eff(s, { stone: 'pebble' });
  assert.deepEqual(legalActions(s).map((a) => a.stone), ['pebble']);
});
test('Mind Control: the enemy AI plays the stone it was named', () => {
  for (const name of ['pebble', 'shift', 'rotate']) {
    const s = G({ handX: ['mind-control'], handO: ['shift', 'rotate', 'magnet'] });
    play(s, 'mind-control', 0);
    eff(s, { stone: name });
    assert.equal(s.player, 'O');
    assert.equal(chooseAction(s, { iters: 200, seed: 7 }).stone, name);
  }
});
test('Muffle: a Pebble does not use it up', () => {
  const s = G({ handX: ['muffle'] });
  play(s, 'muffle', 8);
  play(s, 'pebble', 0);
  assert.equal(s.silenced.O, 1);
});
test('Muffle: the enemy\'s next stone does nothing', () => {
  const s = G({ handX: ['muffle'] });
  lay(s, { 1: 'X pebble' });
  play(s, 'muffle', 8);
  play(s, 'bumper', 4);
  expectAt(s, { 1: 101 });
  assert.ok(s.board[4].hushed);
});
test('Pluck and Bribe', () => {
  const s = G({ handX: ['pluck'] });
  lay(s, { 4: 'O shift', 2: 'O pebble' });
  play(s, 'pluck', 0);
  eff(s, { target: 4 });
  assert.equal(s.board[4], null);
  const t = G({ handX: ['bribe'] });
  lay(t, { 4: 'O pebble', 2: 'O shift', 3: 'O pebble', 6: 'O pebble' });
  play(t, 'bribe', 1);   // beside it: 4 (a Pebble), 2 (not a Pebble); 0 is empty
  assert.equal(t.board[4].player, 'X');
  assert.equal(t.board[2].player, 'O');
});
test('Rehearse becomes a copy of your last special stone', () => {
  const s = G({ handX: ['rehearse', 'firecracker'] });
  lay(s, { 0: 'O pebble', 8: 'O shift' });
  play(s, 'firecracker', 1);   // one target: 0 goes back
  play(s, 'pebble', 3);   // the enemy's turn
  play(s, 'rehearse', 7);   // a Firecracker again
  eff(s, { target: 8 });
  assert.equal(s.board[8], null);
  assert.equal(s.board[7].type, 'firecracker');
  const t = G({ handX: ['rehearse'] });
  play(t, 'rehearse', 4);   // nothing placed yet: it stays itself
  assert.equal(t.board[4].type, 'rehearse');
});
test('Mind Control: the stone named does nothing', () => {
  const s = G({ handX: ['mind-control'], handO: ['bumper'] });
  lay(s, { 1: 'X pebble' });
  play(s, 'mind-control', 8);
  eff(s, { stone: 'bumper' });
  play(s, 'bumper', 4);
  expectAt(s, { 1: 101 });
  assert.ok(s.board[4].hushed);
});
test('Mountain goes anywhere, whatever the restrictions; Mirror and Relocate cannot move it', () => {
  const s = G({ handX: ['mountain'] });
  lay(s, { 0: 'O magnet' });
  applyAction(s, { type: 'select', stone: 'mountain' });
  assert.equal(allowedSquares(s).length, 8);
  applyAction(s, { type: 'place', pos: 8 });
  const t = G({ handX: ['mirror'] });
  lay(t, { 0: 'X mountain', 1: 'O pebble' });
  play(t, 'mirror', 4);
  assert.ok(!legalActions(t).some((a) => a.a === 0 || a.b === 0));
});

// ── Conditions ──────────────────────────────────────────────────────────────

group('conditions');

test('every condition has a name and text', () => { for (const c of Object.values(CONDS)) assert.ok(c.name && c.text); });
test('Gravity: after every turn, every stone falls; Mountains hold', () => {
  const s = G({ conds: ['gravity'] });
  lay(s, { 7: 'O mountain' });
  play(s, 'pebble', 0);
  expectAt(s, { 0: 0, 6: s.board[6]?.id });
  assert.equal(s.board[6]?.player, 'X');
  play(s, 'pebble', 1);   // O, above the Mountain: falls past it? No — it lands on it
  assert.equal(s.board[4]?.player, 'O');
  expectAt(s, { 7: 107 });
});
test('Gravity acts after the enemy\'s turns too', () => {
  const s = createGame({ conds: ['gravity'], log: false, handX: PEBBLES, handO: PEBBLES });
  play(s, 'pebble', 2);
  assert.equal(s.board[8]?.player, 'O');
});
test('Hollow: nobody may place on the centre', () => {
  sameSet(allowedFor({}, { conds: ['nocentre'] }), [0, 1, 2, 3, 5, 6, 7, 8]);
  const s = createGame({ conds: ['nocentre'], log: false, handX: PEBBLES, handO: PEBBLES });
  applyAction(s, { type: 'select', stone: 'pebble' });
  assert.ok(!allowedSquares(s).includes(4));
});
test('Open Hands: play the other side\'s special stone as your own', () => {
  const s = G({ conds: ['shared'], handO: ['shift'] });
  const a = legalActions(s).find((x) => x.stone === 'shift');
  assert.equal(a.from, 'O');
  applyAction(s, a);
  applyAction(s, { type: 'place', pos: 4 });
  assert.equal(s.board[4].player, 'X');
  assert.equal(count(s, 'O', 'shift'), 0);
});
test('Open Hands: the other side\'s Pebbles are on offer too', () => {
  const s = G({ conds: ['shared'], handX: ['shift'], pebblesX: [], handO: ['pebble', 'pebble'], pebblesO: [] });
  const a = legalActions(s).find((x) => x.stone === 'pebble' && x.from === 'O');
  assert.ok(a);
  applyAction(s, a);
  applyAction(s, { type: 'place', pos: 4 });
  assert.equal(s.board[4].player, 'X');
  assert.equal(count(s, 'O', 'pebble'), 1);
});
test('without Open Hands the other side\'s stones are not on offer', () => {
  const s = G({ handO: ['shift'] });
  assert.ok(!legalActions(s).some((a) => a.stone === 'shift'));
});

// ── Boss rules ──────────────────────────────────────────────────────────────

group('boss rules');

// Boss duels: the boss (O) opens and plays only Pebbles.
const B = (rules, o = {}) => createGame({ rules, log: false, ...o, handX: [...(o.handX ?? []), ...PEBBLES], handO: [...(o.handO ?? []), ...PEBBLES] });

test('every rule has a name and text', () => { for (const r of Object.values(RULES)) assert.ok(r.name && r.text); });
test('Tactics: after its turn the boss names your stone', () => {
  const s = B(['tactics'], { handX: ['shift', 'rotate'] });
  play(s, 'pebble', 4);
  assert.equal(s.phase, 'dictate');
  assert.equal(s.player, 'O');
  assert.deepEqual(legalActions(s).map((a) => a.value).sort(), ['pebble', 'rotate', 'shift']);
  act(s, { type: 'dictate', value: 'rotate' });
  turnPassedTo(s, 'X');
  assert.deepEqual(legalActions(s).map((a) => a.stone), ['rotate']);
});
test('Head Start: the boss plays twice on its first turn only', () => {
  const s = B(['headstart']);
  play(s, 'pebble', 4);
  turnPassedTo(s, 'O');
  play(s, 'pebble', 0);
  turnPassedTo(s, 'X');
  play(s, 'pebble', 8);
  turnPassedTo(s, 'O');
  play(s, 'pebble', 2);
  turnPassedTo(s, 'X');
});
test('Elbow: an L of three wins, and rows do not', () => {
  assert.equal(ELS.length, 16);
  const s = B(['elko']);
  lay(s, { 0: 'O pebble', 1: 'O pebble' });
  play(s, 'pebble', 3);
  assert.equal(s.winner, 'O');
  const t = G({ rules: ['elko'] });
  lay(t, { 0: 'X pebble', 1: 'X pebble' });
  play(t, 'pebble', 2);
  assert.equal(t.over, false, 'a row is no win under the Elbow');
  const u = G({ rules: ['elko'] });
  lay(u, { 0: 'X pebble', 1: 'X pebble' });
  play(u, 'pebble', 4);
  assert.equal(u.winner, 'X', 'you win with an L too');
});
test('Double Time: two stones a turn, for both sides, the boss first', () => {
  const s = B(['double']);
  play(s, 'pebble', 0);
  turnPassedTo(s, 'O');
  play(s, 'pebble', 8);
  turnPassedTo(s, 'X');
  play(s, 'pebble', 4);
  turnPassedTo(s, 'X');
  play(s, 'pebble', 2);
  turnPassedTo(s, 'O');
});
test('Double Time: a line on the first stone ends it at once', () => {
  const s = B(['double']);
  lay(s, { 0: 'O pebble', 1: 'O pebble' });
  play(s, 'pebble', 2);
  assert.equal(s.winner, 'O');
});
test('Double Time: the boss\'s word lasts both of your stones', () => {
  const s = B(['double', 'column']);
  play(s, 'pebble', 4);
  play(s, 'pebble', 8);
  act(s, { type: 'dictate', value: 0 });
  play(s, 'pebble', 1);
  assert.equal(s.dictate?.value, 0);
  applyAction(s, { type: 'select', stone: 'pebble' });
  assert.ok(allowedSquares(s).every((i) => i % 3 !== 0));
});
test('Clinch: you must place next to a boss stone', () => {
  sameSet(allowedFor({ 0: 'O pebble' }, { rules: ['clinch'] }), [1, 3, 4]);
  sameSet(allowedFor({}, { rules: ['clinch'] }), [0, 1, 2, 3, 4, 5, 6, 7, 8], 'no boss stone: anywhere');
});
test('Clinch does not bind the boss', () => {
  const s = B(['clinch']);
  lay(s, { 0: 'X pebble' });
  applyAction(s, { type: 'select', stone: 'pebble' });
  assert.equal(allowedSquares(s).length, 8);
});
test('Column: the boss closes a column for your next turn', () => {
  const s = B(['column']);
  play(s, 'pebble', 4);
  assert.equal(s.phase, 'dictate');
  act(s, { type: 'dictate', value: 0 });
  applyAction(s, { type: 'select', stone: 'pebble' });
  sameSet(allowedSquares(s), [1, 2, 5, 7, 8]);
  applyAction(s, { type: 'place', pos: 2 });
  assert.equal(s.dictate, null, 'the word lasts one turn');
});
test('Spy: the boss names the direction your stone moves', () => {
  const s = B(['spy'], { handX: ['2048'] });
  play(s, 'pebble', 4);
  act(s, { type: 'dictate', value: 'up' });
  const id = play(s, '2048', 6);   // one way left to go: it slides at once
  expectAt(s, { 0: id, 1: s.board[1]?.id });
  assert.equal(s.board[1]?.player, 'O');
  turnPassedTo(s, 'O');
});
test('Reserved: you may not take the centre; the boss may', () => {
  sameSet(allowedFor({}, { rules: ['reserved'] }), [0, 1, 2, 3, 5, 6, 7, 8]);
  const s = B(['reserved']);
  applyAction(s, { type: 'select', stone: 'pebble' });
  assert.ok(allowedSquares(s).includes(4));
});
test('Patience: a full board goes to the boss', () => {
  const s = B(['patient']);
  lay(s, { 0: 'O pebble', 1: 'X pebble', 2: 'O pebble', 3: 'O pebble', 4: 'X pebble', 5: 'O pebble', 6: 'X pebble', 7: 'O pebble' });
  s.player = 'X';
  play(s, 'pebble', 8);
  assert.equal(s.winner, 'O');
});
test('a rule with nothing to choose leaves the boss\'s turn plain', () => {
  const s = B(['tactics']);   // you hold only Pebbles: nothing to name
  play(s, 'pebble', 4);
  turnPassedTo(s, 'X');
});

// ── The run's hand ──────────────────────────────────────────────────────────

group('run');
const RUN = await import('../src/run.js');
test('stones cost energy; a stone found joins the last hand if the energy pays for it', () => {
  const run = RUN.newRun({ seed: 1 });   // 1 energy, nothing in the pouch
  const hand = () => RUN.defaultHand(run).map((u) => run.pouch.find((x) => x.uid === u).type).sort();
  assert.deepEqual(RUN.playerHand(run, RUN.defaultHand(run)).map((x) => x.type), ['pebble', 'pebble', 'pebble', 'pebble']);
  run.lastHand = RUN.defaultHand(run);
  RUN.gainStone(run, { type: 'shift' });   // common: 1
  assert.deepEqual(hand(), ['shift']);
  RUN.gainStone(run, { type: 'rotate' });   // no energy left for it
  assert.deepEqual(hand(), ['shift']);
  run.energy = 4;
  RUN.gainStone(run, { type: 'beacon' });   // rare: 3, and 3 are left
  assert.deepEqual(hand(), ['beacon', 'shift']);
  assert.equal(RUN.handCost(run, RUN.defaultHand(run)), 4);
  assert.deepEqual(RUN.playerHand(run, RUN.defaultHand(run)).map((x) => x.type).sort(), ['beacon', 'pebble', 'pebble', 'shift']);
});

// ── cloneState ──────────────────────────────────────────────────────────────

group('cloneState');

function sharedRefs(a, b, path = 's', out = [], skip = new Set(['mods', 'log', 'conds', 'rules'])) {
  if (a === null || typeof a !== 'object') return out;
  if (a === b) { out.push(path); return out; }
  for (const k of Object.keys(a)) {
    if (path === 's' && skip.has(k)) continue;
    if (b && typeof b === 'object') sharedRefs(a[k], b[k], `${path}.${k}`, out, skip);
  }
  return out;
}
const snap = (s) => JSON.stringify({ ...s, log: null });

test('cloneState shares no mutable object with the original', () => {
  const s = G({ handX: ['mind-control'], handO: ['shift'], rules: ['column'] });
  lay(s, { 0: 'X pebble!', 1: 'O shift' });
  play(s, 'mind-control', 8);
  eff(s, { stone: 'pebble' });
  s.selected = { type: 'pebble' };
  s.dictate = { kind: 'column', value: 1 };
  const c = cloneState(s);
  assert.deepEqual(sharedRefs(c, s), []);
});
test('mutating a clone leaves the original alone', () => {
  const s = G({ handX: ['shift', 'nudge'] });
  lay(s, { 0: 'X pebble!', 1: 'O shift' });
  play(s, 'pebble', 8);
  const before = snap(s);
  const c = cloneState(s);
  c.board[0].player = 'O'; c.board[0].stuck = false; c.board[1] = null;
  c.hands.X.pop(); c.spent.X.push('pluck');
  c.silenced.X = 3; c.placements.O = 7; c.echo.X = true; c.lastSpecial.O = 'rotate';
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

const PHASES = new Set(['select', 'place', 'effect', 'dictate', 'over']);
const fuzzFails = new Map();
let fuzzSteps = 0, maxLen = 0;
const wins = { X: 0, O: 0 }, reasons = {};
function fuzzFail(key, detail) {
  const f = fuzzFails.get(key);
  if (f) f.count++; else fuzzFails.set(key, { count: 1, detail });
}
function invariants(s, where) {
  if (s.board.length !== 9) fuzzFail('board length is 9', where);
  const bids = s.board.filter(Boolean).map((c) => c.id);
  if (new Set(bids).size !== bids.length) fuzzFail('no stone id duplicated on the board', where + '\n' + render(s));
  if (!PHASES.has(s.phase)) fuzzFail('phase is valid', `${where} phase=${s.phase}`);
  if (s.over !== (s.phase === 'over')) fuzzFail('over <=> phase over', where);
  if (s.over && !['X', 'O'].includes(s.winner)) fuzzFail('a finished duel has a winner', where);
  for (const c of s.board) if (c && (!STONES[c.type] || !['X', 'O'].includes(c.player))) fuzzFail('cells are well-formed', where + ' ' + JSON.stringify(c));
  if (s.phase === 'dictate' && s.player !== 'O') fuzzFail('only the boss dictates', where);
  if (!s.over && legalActions(s).length === 0) fuzzFail('legalActions non-empty unless over', `${where} phase=${s.phase}\n${render(s)}`);
}

const GAMES = 20000;
const r = rng32(12345);
const pick = (a) => a[(r() * a.length) | 0];
const SPECIALS = STONE_TYPES.filter((t) => t !== 'pebble');
const COND_KEYS = Object.keys(CONDS), RULE_KEYS = Object.keys(RULES);
for (let g = 0; g < GAMES; g++) {
  const hand = () => Array.from({ length: (r() * 5) | 0 }, () => pick(SPECIALS));
  const mods = () => ({ echo: r() < 0.2, freeFirst: r() < 0.2 });
  const boss = r() < 0.4;
  const cfg = {
    handX: [...hand(), ...Array(4).fill('pebble')], handO: [...(boss ? [] : hand()), ...Array(5).fill('pebble')], first: r() < 0.8 ? 'O' : 'X',
    modsX: mods(), modsO: mods(),
    conds: !boss && r() < 0.5 ? [pick(COND_KEYS)] : [],
    rules: boss ? [...new Set([pick(RULE_KEYS), ...(r() < 0.4 ? [pick(RULE_KEYS)] : [])])] : [],
    log: false,
  };
  const s = createGame(cfg);
  let n = 0;
  const where = () => `game ${g} action ${n} cfg=${JSON.stringify(cfg)}`;
  invariants(s, where());
  while (!s.over) {
    const legal = legalActions(s);
    if (!legal.length) break;
    if (n % 3 === 0) {
      const before = snap(s);
      const c = cloneState(s);
      const shared = sharedRefs(c, s);
      if (shared.length) fuzzFail('cloneState shares no mutable objects', `${where()} shared: ${shared.join(', ')}`);
      for (let k = 0; k < 4 && !c.over; k++) {
        const la = legalActions(c);
        if (!la.length) break;
        applyAction(c, la[(r() * la.length) | 0]);
      }
      c.board.forEach((x) => { if (x) { x.player = 'X'; x.stuck = true; } });
      c.hands.X.push({ type: 'shift' }); c.hands.O.length = 0;
      c.spent.X.push('nudge'); c.silenced.O = 5;
      if (snap(s) !== before) fuzzFail('mutating a clone leaves the original alone', where());
    }
    const a = legal[(r() * legal.length) | 0];
    try { applyAction(s, a); } catch (e) { fuzzFail('legal actions never throw', `${where()} ${JSON.stringify(a)}: ${e.message}`); break; }
    n++; fuzzSteps++;
    invariants(s, where());
    if (n > 300) { fuzzFail('duel ends within 300 actions', where() + '\n' + render(s)); break; }
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
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log('  x ' + f);
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
