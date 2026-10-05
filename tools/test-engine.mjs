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
  render, STONES, STONE_TYPES, BASE_STONES, ONCE_STONES, CONDS, RULES, ELS,
} from '../src/engine.js';

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
  const held = hand.find((h) => h.type === type);
  const id = s.nextId;
  applyAction(s, { type: 'select', stone: type, ...(held.once && { once: true }) });
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
test('Waltz in a corner has one block, either way', () => {
  const s = G();
  lay(s, { 1: 'O pebble' });
  const id = play(s, 'rotate', 0);
  sameSet(effectOpts(s).map((o) => o.cw), [true, false]);
  eff(s, { cw: true });
  expectAt(s, { 1: id, 4: 101 });
});
test('Waltz moves all four squares, clockwise', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 3: 'O pebble', 4: 'O pebble' });
  const id = play(s, 'rotate', 0);
  eff(s, { cw: true });
  expectAt(s, { 0: 103, 1: id, 4: 101, 3: 104 });
});
test('Waltz steps over a Mountain in the block', () => {
  const s = G();
  lay(s, { 1: 'O pebble', 4: 'O mountain' });
  const id = play(s, 'rotate', 0);
  eff(s, { cw: true });
  // tl -> tr -> (br held) -> bl -> tl
  expectAt(s, { 1: id, 4: 104, 3: 101, 0: 0 });
});
test('Gravity: every stone slides the way you pick, stepping over Mountains', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 3: 'O mountain', 1: 'O pebble' });
  const id = play(s, 'gravity', 2);
  assert.equal(effectOpts(s).length, 4);
  eff(s, { dir: 'down' });
  // column 0: the Mountain holds 3, the Pebble above it falls past to 6; column 1 to 7; the Gravity to 8.
  expectAt(s, { 6: 100, 3: 103, 7: 101, 8: id });
  const t = G();
  lay(t, { 0: 'O mountain', 2: 'O pebble' });
  play(t, 'gravity', 5);
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
test('Lasso pulls any stone, yours too, next to it', () => {
  const s = G();
  lay(s, { 6: 'O pebble', 5: 'O pebble', 0: 'X pebble' });
  play(s, 'lasso', 2);   // beside 2: 1 (empty) and 5 (already beside, stays)
  sameSet(effectOpts(s).map((o) => `${o.from}>${o.to}`), ['0>1', '6>1']);
  eff(s, { from: 6, to: 1 });
  expectAt(s, { 1: 106, 5: 105, 0: 100 });
});
test('Swap trades places with any stone on the board', () => {
  const s = G();
  lay(s, { 8: 'O pebble', 7: 'O pebble' });
  const id = play(s, 'swap', 0);
  sameSet(effectOpts(s).map((o) => o.target), [7, 8]);
  eff(s, { target: 8 });
  expectAt(s, { 0: 108, 8: id });
});
test('Frog leaps over a stone; the enemy stone leapt goes back to their hand, a Pebble of yours in its place', () => {
  const s = G();
  lay(s, { 1: 'O shift' });
  play(s, 'frog', 0);   // one leap to make: at once
  assert.equal(s.board[2].type, 'frog');
  assert.deepEqual([s.board[1].player, s.board[1].type], ['X', 'pebble']);
  assert.equal(count(s, 'O', 'shift'), 1);
});
test('Frog does not leap diagonally', () => {
  const s = G();
  lay(s, { 4: 'O pebble' });
  play(s, 'frog', 0);
  turnPassedTo(s, 'O');
});
test('Bonfire turns the outer ring one step, the way you pick; a Mountain holds', () => {
  const s = G();
  lay(s, { 0: 'O pebble', 2: 'O mountain', 3: 'O shift' });
  const id = play(s, 'bonfire', 4);   // in the centre: not in the ring
  sameSet(effectOpts(s).map((o) => o.spin), [1, -1]);
  eff(s, { spin: 1 });   // clockwise 0 → 1 → (2 holds) → 5 …, 3 → 0
  expectAt(s, { 1: 100, 2: 102, 0: 103, 4: id });
  const t = G();
  lay(t, { 1: 'O pebble' });
  const tid = play(t, 'bonfire', 0);   // in the ring itself: it goes round too
  eff(t, { spin: -1 });
  expectAt(t, { 0: 101, 3: tid });
});
test('Magnet: the enemy must place next to it', () => sameSet(allowedFor({ 0: 'O magnet' }), [1, 3]));
test('Stinky: must not place next to it', () => sameSet(allowedFor({ 4: 'O stinky' }), [0, 2, 6, 8]));
test('Restrictions compose: satisfy as many as any square can', () => {
  sameSet(allowedFor({ 0: 'O magnet', 2: 'O magnet' }), [1]);
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
test('Firecracker blows a stone in its row or column back into its owner\'s hand and stays', () => {
  const s = G();
  lay(s, { 1: 'O shift', 0: 'O pebble' });
  const id = play(s, 'firecracker', 4);   // only 1 is in line with it; the corner 0 is not
  expectAt(s, { 1: 0, 4: id, 0: 100 });
  assert.equal(s.board[4].type, 'firecracker');
  assert.equal(count(s, 'O', 'shift'), 1);
  const t = G();
  lay(t, { 0: 'O pebble', 8: 'O pebble', 6: 'O pebble' });
  play(t, 'firecracker', 2);
  sameSet(effectOpts(t).map((o) => o.target), [0, 8]);
});
test('Parrot copies any stone on the board, either side\'s, and it acts', () => {
  const s = G({ handX: ['parrot'] });
  lay(s, { 0: 'O firecracker', 8: 'X shift', 2: 'O pebble' });
  play(s, 'parrot', 1);
  sameSet(effectOpts(s).map((o) => o.target), [0, 8]);   // one per kind, Pebbles left out
  eff(s, { target: 0 });   // a Firecracker now, in line with 0, 2, 4 and 7
  assert.equal(s.board[1].type, 'firecracker');
  eff(s, { target: 2 });
  assert.equal(s.board[2], null);
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
test('Magpie steals a stone from the enemy\'s hand, a Pebble too', () => {
  const s = G({ handO: ['shift', 'rotate'] });
  play(s, 'magpie', 4);
  eff(s, { stone: 'rotate' });
  assert.equal(count(s, 'X', 'rotate'), 1);
  assert.equal(count(s, 'O', 'rotate'), 0);
  assert.equal(count(s, 'O', 'shift'), 1);
  const p = G({ handO: ['pebble', 'pebble'] });
  const pebbles = count(p, 'O', 'pebble');
  play(p, 'magpie', 4);   // only Pebbles to take: taken at once
  assert.equal(count(p, 'O', 'pebble'), pebbles - 1);
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
  assert.ok(ONCE_STONES.length >= 3);
  for (const t of ONCE_STONES) assert.ok(STONES[t].once && STONES[t].text, t);
  const s = G({ handX: ['relocate', 'relocate'] });
  lay(s, { 8: 'X pebble' });
  play(s, 'relocate', 0);
  eff(s, { from: 8, to: 7 });
  assert.deepEqual(s.spent.X, ['relocate']);
  assert.equal(count(s, 'X', 'relocate'), 1);
});
test('a glass stone is a kind of its own in hand, beside the same stone that lasts', () => {
  const s = G({ handX: ['shift', { type: 'shift', once: true }] });
  const shifts = legalActions(s).filter((x) => x.stone === 'shift');
  assert.equal(shifts.length, 2);
  applyAction(s, shifts.find((x) => x.once));
  applyAction(s, { type: 'place', pos: 0 });
  assert.deepEqual(s.spent.X, ['shift']);
});
test('Open Hands: your one-shot played by the enemy is not spent from your pouch', () => {
  const s = G({ conds: ['shared'], handX: ['muffle', { type: 'swap', once: true }], first: 'O' });
  s.player = 'O';
  for (const stone of ['muffle', 'swap']) {
    if (s.player !== 'O') play(s, 'pebble', s.board.findIndex((c) => !c));   // your turn back: a Pebble
    const a = legalActions(s).find((x) => x.from === 'X' && x.stone === stone);
    applyAction(s, a);
    applyAction(s, { type: 'place', pos: legalActions(s)[0].pos });
    while (!s.over && s.phase === 'effect') applyAction(s, legalActions(s)[0]);
  }
  assert.deepEqual(s.spent.X, []);
  assert.deepEqual(s.spent.O, []);
});
test('Open Hands: a glass stone of theirs can be borrowed', () => {
  const s = G({ conds: ['shared'], handO: [{ type: 'swap', once: true }] });
  const a = legalActions(s).find((x) => x.from === 'O' && x.stone === 'swap');
  assert.ok(a && a.once);
  applyAction(s, a);
  assert.equal(s.selected.type, 'swap');
});
test('a glass stone is spent as itself, the lasting stone of its kind stays', () => {
  const s = G({ handX: [{ type: 'shift', once: true }, 'shift'] });
  applyAction(s, { type: 'select', stone: 'shift', once: true });
  applyAction(s, { type: 'place', pos: 0 });
  eff(s, { dir: 'right', index: 0 });
  assert.deepEqual(s.spent.X, ['shift']);
  assert.equal(count(s, 'X', 'shift'), 1);
});
test('a one-shot stone that makes your line wins', () => {
  const s = G({ handX: ['relocate'] });
  lay(s, { 0: 'X pebble', 1: 'X pebble', 5: 'X pebble' });
  play(s, 'relocate', 8);
  eff(s, { from: 5, to: 2 });
  assert.equal(s.winner, 'X');
});
test('Relocate moves one of your stones anywhere, itself too', () => {
  const s = G({ handX: ['relocate'] });
  lay(s, { 1: 'O pebble' });
  play(s, 'relocate', 0);
  eff(s, { from: 0, to: 8 });
  assert.equal(s.board[8].type, 'relocate');
});
test('Mind Control: an enemy stone beside it becomes yours', () => {
  const s = G({ handX: ['mind-control'] });
  lay(s, { 1: 'O magnet', 0: 'O pebble' });
  play(s, 'mind-control', 4);   // beside: 1, not the corner 0: at once
  assert.equal(s.board[1].player, 'X');
  assert.equal(s.board[0].player, 'O');
  assert.equal(s.board[4], null);   // the Mind Control itself is gone
  assert.equal(s.player, 'O');
  applyAction(s, { type: 'select', stone: 'pebble' });
  sameSet(allowedSquares(s), [2, 4]);   // the Magnet is yours now: they must place beside it
});
test('Mind Control that makes your line wins', () => {
  const s = G({ handX: ['mind-control'] });
  lay(s, { 0: 'X pebble', 1: 'O pebble', 2: 'X pebble' });
  play(s, 'mind-control', 4);
  assert.equal(s.winner, 'X');
});
test('Muffle: enemy stones beside it lose their restriction and their wall', () => {
  const s = G({ handX: ['muffle'] });
  lay(s, { 1: 'O magnet', 5: 'O mountain' });
  play(s, 'muffle', 2);
  assert.ok(!isStuck(s, 5));
  play(s, 'pebble', 8);
  applyAction(s, { type: 'select', stone: 'pebble' });
  sameSet(allowedSquares(s), [0, 3, 4, 6, 7]);
});
test('Muffle: an enemy stone placed beside it does nothing', () => {
  const s = G({ handX: ['muffle'] });
  lay(s, { 1: 'X pebble' });
  play(s, 'muffle', 8);
  play(s, 'bumper', 4);
  expectAt(s, { 1: 0 });   // not beside the Muffle: it acts
  const t = G({ handX: ['muffle'] });
  lay(t, { 4: 'X pebble' });
  play(t, 'muffle', 0);
  play(t, 'bumper', 1);
  expectAt(t, { 4: 104 });   // beside the Muffle: nothing happens
  turnPassedTo(t, 'X');
});
test('Hammer smashes a stone beside it for good; Snatch takes one into your hand; Seed grows your Mountain', () => {
  const s = G({ handX: ['hammer'] });
  lay(s, { 1: 'O shift' });
  play(s, 'hammer', 4);
  assert.equal(s.board[1], null);
  assert.equal(count(s, 'O', 'shift'), 0);
  const t = G({ handX: ['snatch'] });
  lay(t, { 1: 'O swap' });
  play(t, 'snatch', 4);
  assert.equal(t.board[1], null);
  assert.equal(count(t, 'X', 'swap'), 1);
  const u = G({ handX: ['seed'] });
  lay(u, { 1: 'O pebble', 3: 'O pebble', 5: 'O pebble' });
  play(u, 'seed', 4);   // one empty square beside it: at once
  assert.deepEqual([u.board[7].player, u.board[7].type], ['X', 'mountain']);
});
test('Nomads: after each of the boss\'s turns all its Pebbles step on to the next free square; lines count after', () => {
  const s = G({ rules: ['nomads'], first: 'O' });
  lay(s, { 1: 'X pebble' });
  const id = play(s, 'pebble', 0);
  expectAt(s, { 0: 0, 2: id });   // 1 is yours: on to 2
  assert.equal(s.board[2].type, 'pebble');
  play(s, 'pebble', 5);   // your turn: they stay
  expectAt(s, { 2: id });
  const id2 = play(s, 'pebble', 6);
  expectAt(s, { 3: id, 7: id2 });   // both step on together
});
test('Drift: after each of your turns all your stones step on; the boss\'s stay; Mountains hold', () => {
  const s = G({ rules: ['drift'] });
  lay(s, { 1: 'O pebble', 3: 'X mountain' });
  const id = play(s, 'pebble', 0);
  expectAt(s, { 2: id, 1: 101, 3: 103 });
  // Two in a row made by placing, then drifted apart, do not win.
  const t = G({ rules: ['drift'] });
  lay(t, { 0: 'X pebble', 1: 'X pebble' });
  play(t, 'pebble', 2);
  assert.ok(!t.over);
});
test('Mountain obeys restrictions; Relocate cannot move a Mountain', () => {
  const s = G({ handX: ['mountain'] });
  lay(s, { 0: 'O magnet' });
  applyAction(s, { type: 'select', stone: 'mountain' });
  sameSet(allowedSquares(s), [1, 3]);
  const t = G({ handX: ['relocate'] });
  lay(t, { 0: 'X mountain', 1: 'X pebble' });
  play(t, 'relocate', 4);
  assert.ok(!legalActions(t).some((a) => a.from === 0));
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
  sameSet(allowedFor({ 0: 'O pebble' }, { rules: ['clinch'] }), [1, 3]);
  sameSet(allowedFor({ 0: 'O pebble', 4: 'O pebble' }, { rules: ['clinch'] }), [1, 3, 5, 7], 'the diagonal 0-4-8 cannot be blocked by placing');
  sameSet(allowedFor({ 0: 'O pebble', 1: 'X pebble', 3: 'X pebble' }, { rules: ['clinch'] }), [2, 4, 5, 6, 7, 8], 'nowhere beside it: anywhere');
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
  const s = B(['spy'], { handX: ['gravity'] });
  play(s, 'pebble', 4);
  act(s, { type: 'dictate', value: 'up' });
  const id = play(s, 'gravity', 6);   // one way left to go: it slides at once
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
test('a stone costs its tier\'s energy; glass 1; no 1-energy stone comes in glass', () => {
  assert.equal(RUN.costOf({ type: 'swap' }), 2);
  assert.equal(RUN.costOf({ type: 'swap', once: true }), 1);
  assert.equal(RUN.costOf({ type: 'firecracker', once: true }), 1);
  assert.equal(RUN.costOf({ type: 'relocate' }), 1);
  assert.equal(RUN.costOf({ type: 'mind-control' }), 1);
  const run = RUN.newRun({ seed: 9 });
  for (let i = 0; i < 300; i++) {
    const g = RUN.randomOnce(run);
    assert.ok(STONES[g.type].once || RUN.COST[STONES[g.type].rarity] > 1, g.type);
  }
});
test('the pouch holds 6 stones; glass ones do not count', () => {
  const run = RUN.newRun({ seed: 4 });
  run.pouch = [];
  for (let i = 0; i < 6; i++) RUN.gainStone(run, { type: 'shift' });
  assert.ok(!RUN.hasRoom(run, { type: 'swap' }));
  assert.ok(RUN.hasRoom(run, { type: 'swap', once: true }));
  assert.ok(RUN.hasRoom(run, { type: 'relocate' }));
  for (let i = 0; i < 20; i++) RUN.gainStone(run, { type: 'muffle' });
  assert.equal(RUN.overfull(run), null);
  const extra = RUN.gainStone(run, { type: 'frog' });
  assert.equal(RUN.overfull(run), 'stones');
  RUN.dropStone(run, extra.uid);
  assert.equal(RUN.overfull(run), null);
});
test('a draw counts as won, and costs a heart', () => {
  const run = RUN.newRun({ seed: 5 });
  run.map = RUN.makeMap(run);
  run.pending = { kind: 'duel', duel: RUN.prepareDuel(run, 'pip', { tier: 'normal' }) };
  const hearts = run.hearts;
  assert.equal(RUN.duelWon(run, true).kind, 'reward');
  assert.equal(run.hearts, hearts - 1);
});
test('merchants barter: a stone is worth its energy, one more if liked; every kind turns up', () => {
  const run = RUN.newRun({ seed: 3 });
  run.pouch = [];
  const swap = RUN.gainStone(run, { type: 'swap' }), glass = RUN.gainStone(run, { type: 'firecracker', once: true });
  const m = { likes: 'movers' };
  assert.equal(RUN.worth(m, swap), 3);   // 2, liked
  assert.equal(RUN.worth(m, glass), 1);  // glass is small change; a glass mover is not a mover here
  assert.equal(RUN.worth({ likes: 'glass' }, glass), 2);
  assert.ok(RUN.canPay(run, m, 4) && !RUN.canPay(run, m, 5));
  assert.ok(RUN.canPay(run, m, 99, 'swap') && !RUN.canPay(run, m, 1, 'magnet'));
  RUN.pay(run, [swap.uid]);
  assert.deepEqual(run.pouch.map((x) => x.uid), [glass.uid]);
  const seen = new Set();
  for (let seed = 1; seed < 200; seed++) {
    const r = RUN.newRun({ seed });
    const shop = RUN.makeShop(r);
    seen.add(shop.type);
    assert.ok(shop.wares.length > 0, shop.type);
    for (const w of shop.wares) assert.ok(w.only || w.price >= 1, `${shop.type} ${w.kind}`);
  }
  assert.equal(seen.size, RUN.MERCHANT_TYPES.length);
  assert.equal(run.gold, undefined);
});
test('the Quarryman\'s trick: the next X goes on a rock in reach, and breaks it', () => {
  const run = RUN.newRun({ seed: 5 });
  const rocks = RUN.rocksInReach(run.map);
  if (!rocks.length) return;
  run.map.breaker = true;
  assert.deepEqual(RUN.reachable(run).sort(), rocks.sort());
  RUN.enterNode(run, rocks[0]);
  assert.equal(run.map.cells[rocks[0]].mark, 'X');
  assert.ok(!run.map.breaker);
  assert.ok(!RUN.reachable(run).some((k) => run.map.cells[k]?.kind === 'rock'));
});
test('a run starts with a Shift, and 3 energy', () => {
  const run = RUN.newRun({ seed: 1 });
  assert.deepEqual(run.pouch.map((x) => x.type), ['shift']);
  assert.equal(RUN.energyOf(run), 3);
  assert.equal(RUN.defaultHand(run).length, 1);
  assert.ok(!Object.values(RUN.makeMap(run).cells).some((c) => c.kind === 'gift'));
});
test('stones cost energy; a stone found joins the last hand if the energy pays for it', () => {
  const run = RUN.newRun({ seed: 1 });
  run.pouch = []; run.energy = 1;   // 1 energy, nothing in the pouch
  const hand = () => RUN.defaultHand(run).map((u) => run.pouch.find((x) => x.uid === u).type).sort();
  assert.deepEqual(RUN.playerHand(run, RUN.defaultHand(run)).map((x) => x.type), ['pebble', 'pebble', 'pebble', 'pebble']);
  run.lastHand = RUN.defaultHand(run);
  RUN.gainStone(run, { type: 'rotate' });   // common: 1
  assert.deepEqual(hand(), ['rotate']);
  RUN.gainStone(run, { type: 'mountain' });   // no energy left for it
  assert.deepEqual(hand(), ['rotate']);
  run.energy = 4;
  RUN.gainStone(run, { type: 'firecracker' });   // rare: 3, and 3 are left
  assert.deepEqual(hand(), ['firecracker', 'rotate']);
  assert.equal(RUN.handCost(run, RUN.defaultHand(run)), 4);
  assert.deepEqual(RUN.playerHand(run, RUN.defaultHand(run)).map((x) => x.type).sort(), ['firecracker', 'pebble', 'pebble', 'rotate']);
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
  play(s, 'mind-control', 4);
  s.selected = { type: 'pebble' };
  s.dictate = { kind: 'column', value: 1 };
  const c = cloneState(s);
  assert.deepEqual(sharedRefs(c, s), []);
});
test('mutating a clone leaves the original alone', () => {
  const s = G({ handX: ['shift', 'relocate'] });
  lay(s, { 0: 'X pebble!', 1: 'O shift' });
  play(s, 'pebble', 8);
  const before = snap(s);
  const c = cloneState(s);
  c.board[0].player = 'O'; c.board[0].stuck = false; c.board[1] = null;
  c.hands.X.pop(); c.spent.X.push('relocate');
  c.placements.O = 7; c.lastSpecial.O = 'rotate';
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
  const mods = () => ({ freeFirst: r() < 0.2 });
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
      c.spent.X.push('relocate');
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
