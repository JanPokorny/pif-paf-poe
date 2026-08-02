'use strict';
// MCTS agent, ported from index.html (iteration-budget variant) with a seeded RNG
// so tournament runs are reproducible.

const { cloneState, getLegalActions, doAction, check3, opp,
  applyShift, apply2048, applyRotate, applyRing } = require('./engine');

// Rollout policy. Pure-random rollouts blunder constantly, which makes every
// evaluation noise; this one only looks one ply ahead — take a line if one is
// there, never hand the opponent one — and is identical for both players, so it
// cannot favour a skill.
function previewBoard(s, a) {
  const b = s.board.slice();
  if (a.type === 'place') b[a.pos] = { player: s.currentPlayer, type: s.selectedStone, id: -1 };
  else if (a.type === 'effect') {
    const t = s.selectedStone, p = s.placedPos;
    if (t === 'shift') applyShift(b, p, a.direction, a.line);
    else if (t === '2048') apply2048(b, a.direction);
    else if (t === 'rotate') { if (a.ring) applyRing(b, a.ring === 'cw'); else applyRotate(b, a.subsquare); }
  } else return null;
  return b;
}

function policyAction(s, acts, rng) {
  if (s.phase !== 'place' && s.phase !== 'effect') return acts[(rng() * acts.length) | 0];
  const me = s.currentPlayer, other = opp(me);
  const wins = [], safe = [];
  for (const a of acts) {
    const b = previewBoard(s, a);
    if (!b) { safe.push(a); continue; }
    if (check3(b, me)) { wins.push(a); continue; }
    if (!check3(b, other)) safe.push(a);
  }
  const pool = wins.length ? wins : safe.length ? safe : acts;
  return pool[(rng() * pool.length) | 0];
}

// mulberry32
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Node {
  constructor(state, parent, action) {
    this.state = state; this.parent = parent; this.action = action;
    this.children = []; this.wins = 0; this.visits = 0; this._untried = null;
  }
  get untried() { if (!this._untried) this._untried = getLegalActions(this.state); return this._untried; }
  ucb1(C) { return this.wins / this.visits + C * Math.sqrt(Math.log(this.parent.visits) / this.visits); }
  bestChild(C = 1.41) {
    let best = null, bv = -Infinity;
    for (const ch of this.children) { const v = ch.visits === 0 ? Infinity : ch.ucb1(C); if (v > bv) { bv = v; best = ch; } }
    return best;
  }
}

function mctsCore(root, budget, rng, rolloutCap, smart) {
  for (let i = 0; i < budget; i++) {
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0 && node.state.phase !== 'gameOver') node = node.bestChild();
    if (node.untried.length > 0 && node.state.phase !== 'gameOver') {
      const idx = (rng() * node.untried.length) | 0;
      const a = node.untried.splice(idx, 1)[0];
      const cs = cloneState(node.state); doAction(cs, a);
      const ch = new Node(cs, node, a); node.children.push(ch); node = ch;
    }
    const sim = cloneState(node.state); let d = 0;
    while (sim.phase !== 'gameOver' && d < rolloutCap) {
      const acts = getLegalActions(sim); if (!acts.length) break;
      doAction(sim, smart ? policyAction(sim, acts, rng) : acts[(rng() * acts.length) | 0]); d++;
    }
    const w = sim.winner; let n = node;
    while (n) { n.visits++; if (w === n.state.currentPlayer) n.wins += 1; else if (!w) n.wins += 0.5; n = n.parent; }
  }
}

function mctsSearchIter(state, iterations, rng, opts) {
  const rolloutCap = (opts && opts.rolloutCap) || 150;
  const smart = !opts || opts.smart !== false;
  const root = new Node(cloneState(state), null, null);
  mctsCore(root, iterations, rng, rolloutCap, smart);
  let best = null, bv = -1;
  for (const ch of root.children) if (ch.visits > bv) { bv = ch.visits; best = ch; }
  return best ? best.action : getLegalActions(state)[0];
}

function randomAction(state, rng) {
  const acts = getLegalActions(state);
  return acts[(rng() * acts.length) | 0];
}

module.exports = { makeRng, mctsSearchIter, randomAction, policyAction, Node, mctsCore };
