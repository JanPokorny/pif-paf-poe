// The enemy: Monte Carlo tree search over the engine's own action list, grown
// out of old/ai.js. A turn is searched as separate plies (select, place,
// effect, trick), so it picks a stone knowing what it will do with it.
//
//   chooseAction(state, { iterations, rng, blunder })
//
// `iterations` is the main difficulty dial; `blunder` is the chance a weak
// enemy simply plays something at random that does not lose on the spot.

import { cloneState, legalActions, applyAction, hasLine, other } from './engine.js';

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, rng) => list[(rng() * list.length) | 0];

function peek(s, action) {
  const after = cloneState(s);
  applyAction(after, action);
  return after;
}

// Rollout policy: take a line when one is there, avoid handing one over, and
// keep a trick unless spending it wins on the spot. Both sides play it.
export function policyAction(s, actions, rng) {
  if (s.phase === 'select') return pick(actions, rng);
  const me = s.player;
  const winning = [], safe = [];
  for (const a of actions) {
    const after = peek(s, a);
    if (after.over) {
      if (after.winner === me) winning.push(a);
      continue;
    }
    if (hasLine(after, me)) winning.push(a);
    else if (!hasLine(after, other(me))) safe.push(a);
  }
  if (winning.length) return pick(winning, rng);
  if (s.phase === 'trick') return actions[0];   // pass
  if (safe.length) return pick(safe, rng);
  return pick(actions, rng);
}

function rollout(start, rng, cap = 60) {
  const s = cloneState(start);
  for (let i = 0; i < cap && !s.over; i++) {
    const actions = legalActions(s);
    if (!actions.length) break;
    applyAction(s, policyAction(s, actions, rng));
  }
  return s.winner;
}

class Node {
  constructor(state, parent, action) {
    this.state = state;
    this.parent = parent;
    this.action = action;
    this.children = [];
    this.untried = null;
    this.visits = 0;
    this.score = 0;
  }
  get unexplored() {
    this.untried ??= this.state.over ? [] : legalActions(this.state);
    return this.untried;
  }
  best(c) {
    let chosen = null, bestValue = -Infinity;
    const lv = Math.log(this.visits);
    for (const ch of this.children) {
      const v = ch.score / ch.visits + c * Math.sqrt(lv / ch.visits);
      if (v > bestValue) { bestValue = v; chosen = ch; }
    }
    return chosen;
  }
}

export function chooseAction(state, opts = {}) {
  const { iterations = 400, rng = Math.random, exploration = 1.2, blunder = 0 } = opts;
  const actions = legalActions(state);
  if (actions.length <= 1) return actions[0] ?? null;

  // A careless enemy sometimes plays at random -- but never walks into a loss
  // it could see, and never passes up a win in hand.
  if (blunder > 0 && rng() < blunder) {
    const me = state.player;
    const wins = [], ok = [];
    for (const a of actions) {
      const after = peek(state, a);
      if ((after.over && after.winner === me) || hasLine(after, me)) wins.push(a);
      else if (!(after.over && after.winner !== me)) ok.push(a);
    }
    if (wins.length) return wins[0];
    if (state.phase === 'trick') return actions[0];
    if (ok.length) return pick(ok, rng);
  }

  const root = new Node(cloneState(state), null, null);
  for (let i = 0; i < iterations; i++) {
    let node = root;
    while (!node.unexplored.length && node.children.length && !node.state.over) node = node.best(exploration);
    if (node.unexplored.length && !node.state.over) {
      const a = node.unexplored.splice((rng() * node.unexplored.length) | 0, 1)[0];
      const next = cloneState(node.state);
      applyAction(next, a);
      const child = new Node(next, node, a);
      node.children.push(child);
      node = child;
    }
    const winner = node.state.over ? node.state.winner : rollout(node.state, rng);
    for (let n = node; n; n = n.parent) {
      n.visits++;
      if (!n.parent) continue;
      const chooser = n.parent.state.player;
      if (winner === chooser) n.score += 1;
      else if (winner === null) n.score += 0.5;
    }
  }
  let chosen = null, most = -1;
  for (const ch of root.children) if (ch.visits > most) { most = ch.visits; chosen = ch; }
  return chosen ? chosen.action : actions[0];
}
