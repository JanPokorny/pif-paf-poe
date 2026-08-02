'use strict';
// Mechanical checks for the engine port and each skill.

const E = require('./engine');
const assert = require('assert');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ok  ' + name); }

function mk(skills, hands) {
  return E.initGameState(hands && hands.X || ['regular', 'regular', 'regular', 'regular', 'regular'],
    hands && hands.O || ['regular', 'regular', 'regular', 'regular', 'regular'], 'X', skills);
}
function put(s, pos, player, type) { s.board[pos] = { player, type, id: s.nextId++ }; }
function occ(s) { return s.board.map(c => c ? c.player + c.type[0] : '..').join(' '); }
function has(acts, pred) { return acts.some(pred); }

console.log('\nengine / baseline');

t('shift moves the placed stone\'s row with overflow', () => {
  const s = mk();
  put(s, 3, 'X', 'regular'); put(s, 4, 'O', 'regular');
  E.applyShift(s.board, 3, 'right');
  assert.strictEqual(s.board[5].player, 'O');
  assert.strictEqual(s.board[4].player, 'X');
  assert.strictEqual(s.board[3], null);
});

t('2048 slides everything to one side', () => {
  const s = mk();
  put(s, 2, 'X', 'regular'); put(s, 8, 'O', 'regular');
  E.apply2048(s.board, 'left');
  assert.strictEqual(s.board[0].player, 'X');
  assert.strictEqual(s.board[6].player, 'O');
});

t('rotate turns a 2x2 sub-square clockwise', () => {
  const s = mk();
  put(s, 0, 'X', 'regular');
  E.applyRotate(s.board, 'TL');
  assert.ok(s.board[1] && s.board[1].player === 'X'); // TL -> TR
});

t('three in a row ends the game', () => {
  const s = mk();
  put(s, 0, 'X', 'regular'); put(s, 1, 'X', 'regular');
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'regular' });
  E.doAction(s, { type: 'place', pos: 2 });
  assert.strictEqual(s.winner, 'X');
  assert.strictEqual(s.winReason, 'line');
});

t('repeating a board state loses', () => {
  const s = mk({ X: 'none', O: 'none' }, { X: ['rotate', 'rotate'], O: ['rotate', 'rotate'] });
  // X places rotate at 0 and rotates TL 4x over two turns -> identity is not reachable in one turn,
  // so instead check the mechanism directly: replay a hash already in history.
  s.history.add('XrgXrg..............|'.slice(0, 0) + E.hashState(s));
  put(s, 0, 'X', 'regular');
  s.board[0] = null;                 // back to the start position
  s.selectedStone = 'regular'; s.placedPos = 0;
  E.resolveTurn(s);
  assert.strictEqual(s.winReason, 'repeat');
  assert.strictEqual(s.winner, 'O');
});

t('magnet forces adjacency, stinky forbids it', () => {
  const s = mk();
  put(s, 4, 'X', 'magnet');
  s.restriction = { type: 'magnet', pos: 4, owner: 'X', uses: 1 };
  s.currentPlayer = 'O'; s.phase = 'place';
  let ps = E.getPlaceActions(s).map(a => a.pos).sort();
  assert.deepStrictEqual(ps, [1, 3, 5, 7]);
  s.restriction.type = 'stinky';
  ps = E.getPlaceActions(s).map(a => a.pos).sort();
  assert.deepStrictEqual(ps, [0, 2, 6, 8]);
});

t('restriction does not bind its own owner', () => {
  const s = mk();
  put(s, 4, 'X', 'magnet');
  s.restriction = { type: 'magnet', pos: 4, owner: 'X', uses: 1 };
  s.currentPlayer = 'X'; s.phase = 'place';
  assert.strictEqual(E.getPlaceActions(s).length, 8);
});

console.log('\nskill: whirlwind (rotate)');

t('ring rotation shifts all 8 outer cells one step', () => {
  const s = mk();
  put(s, 0, 'X', 'rotate'); put(s, 4, 'O', 'regular');
  E.applyRing(s.board, true);
  assert.strictEqual(s.board[1].type, 'rotate', 'ring stone moved 0 -> 1 clockwise');
  assert.strictEqual(s.board[4].player, 'O', 'centre untouched');
  assert.strictEqual(s.board[0], null);
});

t('ring rotation is offered only with the skill and only off-centre', () => {
  const s = mk({ X: 'whirlwind', O: 'none' });
  s.selectedStone = 'rotate'; s.placedPos = 0; s.phase = 'effect';
  assert.ok(has(E.getEffectActions(s), a => a.ring === 'cw'));
  assert.strictEqual(E.getEffectActions(s).length, 3, '1 sub-square + 2 ring dirs');
  s.placedPos = 4;
  assert.ok(!has(E.getEffectActions(s), a => a.ring));
  const b = mk({ X: 'none', O: 'none' });
  b.selectedStone = 'rotate'; b.placedPos = 0; b.phase = 'effect';
  assert.ok(!has(E.getEffectActions(b), a => a.ring));
});

t('ring rotation can complete a line the 2x2 rotate cannot', () => {
  // X on 0 and 3, rotate placed on 1. Ring CW feeds 3->0, 0->1, 1->2: top row.
  const setup = () => {
    const s = mk({ X: 'whirlwind', O: 'none' }, { X: ['rotate'], O: ['regular'] });
    put(s, 0, 'X', 'regular'); put(s, 3, 'X', 'regular');
    s.phase = 'select';
    E.doAction(s, { type: 'select', stoneType: 'rotate' });
    E.doAction(s, { type: 'place', pos: 1 });
    return s;
  };
  const ring = setup();
  E.doAction(ring, { type: 'effect', ring: 'cw' });
  assert.strictEqual(ring.winner, 'X');
  for (const sq of ['TL', 'TR']) {           // the 2x2 options available at pos 1
    const s = setup();
    E.doAction(s, { type: 'effect', subsquare: sq });
    assert.strictEqual(s.winner, null, sq + ' does not win');
  }
});

console.log('\nskill: telekinesis (shift)');

t('shift can target a foreign row/column', () => {
  const s = mk({ X: 'telekinesis', O: 'none' });
  s.selectedStone = 'shift'; s.placedPos = 0; s.phase = 'effect';
  const acts = E.getEffectActions(s);
  assert.strictEqual(acts.length, 12, '4 directions x 3 lines');
  assert.ok(has(acts, a => a.line && a.line.axis === 'row' && a.line.index === 2));
  const b = mk({ X: 'none', O: 'none' });
  b.selectedStone = 'shift'; b.placedPos = 0; b.phase = 'effect';
  assert.strictEqual(E.getEffectActions(b).length, 4);
});

t('foreign-line shift moves that line only', () => {
  const s = mk();
  put(s, 6, 'O', 'regular'); put(s, 0, 'X', 'shift');
  E.applyShift(s.board, 0, 'right', { axis: 'row', index: 2 });
  assert.strictEqual(s.board[7].player, 'O');
  assert.strictEqual(s.board[0].player, 'X', 'own row untouched');
});

console.log('\nskill: relentless (regular)');

t('extra turn offered only when behind or level on board', () => {
  const s = mk({ X: 'relentless', O: 'none' });
  put(s, 8, 'O', 'regular');
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'regular' });
  E.doAction(s, { type: 'place', pos: 0 });   // 1 vs 1 -> no advantage
  assert.strictEqual(s.phase, 'bonus');
  E.doAction(s, { type: 'bonusTake' });
  assert.strictEqual(s.currentPlayer, 'X');
  E.doAction(s, { type: 'select', stoneType: 'regular' });
  E.doAction(s, { type: 'place', pos: 3 });   // 2 vs 1 -> ahead, no offer
  assert.strictEqual(s.currentPlayer, 'O');
});

t('extra turn does not skip the win check', () => {
  const s = mk({ X: 'relentless', O: 'none' });
  put(s, 0, 'X', 'regular'); put(s, 1, 'X', 'regular');
  put(s, 6, 'O', 'regular'); put(s, 7, 'O', 'regular'); put(s, 8, 'O', 'regular');
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'regular' });
  E.doAction(s, { type: 'place', pos: 2 });
  assert.strictEqual(s.winner, 'X');
});

t('extra turn not offered for non-regular stones', () => {
  const s = mk({ X: 'relentless', O: 'none' }, { X: ['shift', 'regular'], O: ['regular'] });
  put(s, 8, 'O', 'regular');
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'shift' });
  E.doAction(s, { type: 'place', pos: 0 });
  assert.strictEqual(s.phase, 'effect');
  E.doAction(s, { type: 'effect', direction: 'right' });
  assert.strictEqual(s.currentPlayer, 'O');
});

console.log('\nskill: overload (2048)');

t('2048 resolves twice', () => {
  const s = mk({ X: 'overload', O: 'none' }, { X: ['2048'], O: ['regular'] });
  put(s, 2, 'O', 'regular');
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: '2048' });
  E.doAction(s, { type: 'place', pos: 0 });
  E.doAction(s, { type: 'effect', direction: 'down' });
  assert.strictEqual(s.phase, 'effect', 'second resolution pending');
  E.doAction(s, { type: 'effect', direction: 'left' });
  assert.strictEqual(s.currentPlayer, 'O');
  assert.strictEqual(s.board[6].player, 'X');
  assert.strictEqual(s.board[7].player, 'O', 'O fell to 8 then slid left to 7');
});

console.log('\nskill: lingering (magnet/stinky)');

t('restriction binds the opponent for two of their turns', () => {
  const s = mk({ X: 'lingering', O: 'none' }, { X: ['magnet', 'regular'], O: ['regular', 'regular'] });
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'magnet' });
  E.doAction(s, { type: 'place', pos: 4 });
  assert.strictEqual(s.restriction.uses, 2);
  E.doAction(s, { type: 'select', stoneType: 'regular' });   // O, bound
  assert.deepStrictEqual(E.getPlaceActions(s).map(a => a.pos).sort(), [1, 3, 5, 7]);
  E.doAction(s, { type: 'place', pos: 1 });
  assert.ok(s.restriction && s.restriction.uses === 1, 'survives into X\'s turn');
  E.doAction(s, { type: 'select', stoneType: 'regular' });   // X, unbound
  assert.strictEqual(E.getPlaceActions(s).length, 7);
  E.doAction(s, { type: 'place', pos: 0 });
  E.doAction(s, { type: 'select', stoneType: 'regular' });   // O, bound again
  assert.deepStrictEqual(E.getPlaceActions(s).map(a => a.pos).sort(), [3, 5, 7]);
  E.doAction(s, { type: 'place', pos: 3 });
  assert.strictEqual(s.restriction, null, 'expires after two opponent turns');
});

t('without the skill the restriction expires after one turn', () => {
  const s = mk({ X: 'none', O: 'none' }, { X: ['magnet'], O: ['regular'] });
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'magnet' });
  E.doAction(s, { type: 'place', pos: 4 });
  assert.strictEqual(s.restriction.uses, 1);
  E.doAction(s, { type: 'select', stoneType: 'regular' });
  E.doAction(s, { type: 'place', pos: 1 });
  assert.strictEqual(s.restriction, null);
});

console.log('\nskill: slither (chain)');

t('chain may step and pull diagonally', () => {
  const s = mk({ X: 'slither', O: 'none' }, { X: ['chain'], O: ['regular'] });
  put(s, 1, 'O', 'regular');
  s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'chain' });
  E.doAction(s, { type: 'place', pos: 0 });
  assert.ok(has(E.getLegalActions(s), a => a.pos === 4), 'diagonal step available');
  E.doAction(s, { type: 'chainMove', pos: 4 });
  assert.ok(has(E.getLegalActions(s), a => a.type === 'chainPull' && a.pos === 1));
  const b = mk({ X: 'none', O: 'none' }, { X: ['chain'], O: ['regular'] });
  b.phase = 'select';
  E.doAction(b, { type: 'select', stoneType: 'chain' });
  E.doAction(b, { type: 'place', pos: 0 });
  assert.ok(!has(E.getLegalActions(b), a => a.pos === 4), 'no diagonal without the skill');
});

console.log('\nskill: anchor');

// A line-free full board: X on 0,1,5,6,7 and O on 2,3,4,8.
const FULL_X = [0, 1, 5, 6, 7], FULL_O = [2, 3, 4, 8];
function fillExcept(s, skip) {
  for (const i of FULL_X) if (i !== skip) put(s, i, 'X', 'regular');
  for (const i of FULL_O) if (i !== skip) put(s, i, 'O', 'regular');
}

t('opponent cannot return the anchored stone from a full board', () => {
  const s = mk({ X: 'anchor', O: 'none' }, { X: ['regular'], O: ['regular'] });
  fillExcept(s, 7);
  s.currentPlayer = 'X'; s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'regular' });
  E.doAction(s, { type: 'place', pos: 7 });   // board now full, 7 is anchored
  assert.strictEqual(s.phase, 'remove');
  const rem = E.getRemoveActions(s).map(a => a.pos);
  assert.ok(!rem.includes(7), 'anchored stone protected');
  assert.deepStrictEqual(rem.sort(), [0, 1, 5, 6]);
});

t('anchor protection follows the stone through a shift', () => {
  const s = mk({ X: 'anchor', O: 'none' }, { X: ['shift'], O: ['regular'] });
  fillExcept(s, 0);
  s.currentPlayer = 'X'; s.phase = 'select';
  E.doAction(s, { type: 'select', stoneType: 'shift' });
  E.doAction(s, { type: 'place', pos: 0 });
  E.doAction(s, { type: 'effect', direction: 'right' });  // placed stone 0 -> 1
  const prot = E.findById(s.board, s.anchored.X);
  assert.strictEqual(prot, 1);
  assert.ok(!E.getRemoveActions(s).map(a => a.pos).includes(1));
});

console.log('\nskill: scavenger');

t('returned stones join the remover\'s hand', () => {
  const s = mk({ X: 'scavenger', O: 'none' }, { X: ['regular'], O: ['chain'] });
  for (let i = 0; i < 9; i++) put(s, i, i === 0 ? 'O' : 'X', 'stinky');
  s.currentPlayer = 'X'; s.phase = 'remove';
  E.doAction(s, { type: 'remove', pos: 0 });
  assert.deepStrictEqual(s.hands.X.sort(), ['regular', 'stinky']);
  assert.deepStrictEqual(s.hands.O, ['chain'], 'owner does not get it back');
});

console.log('\n' + passed + ' checks passed\n');
