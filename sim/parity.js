'use strict';
// Parity check: with both players on skill 'none', the simulator must behave
// exactly like the game logic embedded in index.html. Loads the real script out
// of the HTML, steps both engines through identical random playthroughs and
// compares legal actions and resulting state at every single ply.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Sim = require('./engine');
const { makeRng } = require('./mcts');

function loadReference() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block in index.html');
  const code = m[1].replace(/renderSetup\(\);?\s*$/, '');
  // The reference only touches the DOM inside render functions, none of which
  // run here, so no document stub is needed.
  return new Function(code + '\n;return {initGameState,getLegalActions,doAction,hashState};')();
}

const Ref = loadReference();

function snap(s) {
  return {
    board: s.board.map(c => c ? c.player + ':' + c.type : '.').join('|'),
    hands: { X: [...s.hands.X].sort().join(','), O: [...s.hands.O].sort().join(',') },
    player: s.currentPlayer,
    phase: s.phase === 'gameOver' ? 'gameOver' : s.phase,
    restriction: s.restriction ? s.restriction.type + '@' + s.restriction.pos : null,
    winner: s.winner === undefined ? null : s.winner,
    chainEmpty: s.chainEmpty == null ? null : s.chainEmpty,
  };
}

// Compare action lists ignoring key order and the extra fields the sim carries.
function normActs(acts) {
  return acts.map(a => {
    const o = { type: a.type };
    for (const k of ['pos', 'stoneType', 'direction', 'subsquare']) if (a[k] !== undefined) o[k] = a[k];
    return JSON.stringify(o);
  });
}

const TYPES = Sim.TYPES;
let plies = 0, games = 0;
const N = parseInt(process.argv[2] || '400', 10);

for (let g = 0; g < N; g++) {
  const rng = makeRng(1000 + g);
  const hx = [], ho = [];
  for (let i = 0; i < 5; i++) { hx.push(TYPES[(rng() * TYPES.length) | 0]); ho.push(TYPES[(rng() * TYPES.length) | 0]); }
  const first = rng() < 0.5 ? 'X' : 'O';

  const a = Sim.initGameState(hx, ho, first, { X: 'none', O: 'none' });
  const b = Ref.initGameState(hx, ho, first);

  for (let step = 0; step < 400; step++) {
    const aa = Sim.getLegalActions(a), ba = Ref.getLegalActions(b);
    const an = normActs(aa), bn = normActs(ba);
    assert.deepStrictEqual(an, bn, `game ${g} step ${step}: legal actions diverge\nsim=${an}\nref=${bn}\n${JSON.stringify(snap(a))}`);
    if (a.phase === 'gameOver' || !aa.length || b.phase === 'gameOver' || !ba.length) break;
    const i = (rng() * aa.length) | 0;
    Sim.doAction(a, aa[i]);
    Ref.doAction(b, ba[i]);
    plies++;
    assert.deepStrictEqual(snap(a), snap(b), `game ${g} step ${step}: state diverges after ${JSON.stringify(aa[i])}`);
  }
  // Terminal agreement: the sim marks dead ends as gameOver/draw where the
  // reference simply runs out of legal actions, so compare the winner only.
  assert.strictEqual(a.winner || null, b.winner || null, `game ${g}: winner mismatch`);
  games++;
}

console.log(`parity ok: ${games} playthroughs, ${plies} plies identical to index.html`);
