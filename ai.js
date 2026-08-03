// Automatic player for Pif-paf-poe. Deno, no dependencies.
//
//   import { chooseAction, makeRng } from './ai.js';
//
//   const action = chooseAction(game, { iterations: 800, rng: makeRng(1) });
//
// Monte Carlo tree search over the engine's action list. The whole turn is
// searched as separate plies (select, place, resolve), so the search picks a
// stone knowing what it will do with it.

import { cloneState, legalActions, applyAction, hasLine, other } from './engine.js';

// mulberry32: small, fast, seedable, so a game can be replayed exactly.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, rng) { return list[(rng() * list.length) | 0]; }

// Board that would result from a placement or an effect, cheaply: the engine's
// own transitions are avoided here because rollouts only need the line check.
function peek(s, action) {
  const after = cloneState(s);
  try {
    applyAction(after, action);
  } catch {
    return null;
  }
  return after;
}

// Rollout policy. Uniformly random play blunders so constantly that every
// evaluation turns into noise; this looks one ply ahead — take a line if one is
// available, otherwise avoid handing the opponent one — and is the same for both
// sides, so it cannot favour either.
export function policyAction(s, actions, rng) {
  if (s.phase !== 'place' && s.phase !== 'effect') return pick(actions, rng);

  const me = s.player;
  const winning = [];
  const safe = [];
  for (const action of actions) {
    const after = peek(s, action);
    if (!after) continue;
    if (hasLine(after.board, me)) winning.push(action);
    else if (!hasLine(after.board, other(me))) safe.push(action);
  }
  if (winning.length) return pick(winning, rng);
  if (safe.length) return pick(safe, rng);
  return pick(actions, rng);
}

function rollout(start, rng, cap) {
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

  // UCB1. `score` is counted from the point of view of the player to move in
  // this node's parent, which is who chose the action leading here.
  ucb1(c) {
    return this.score / this.visits + c * Math.sqrt(Math.log(this.parent.visits) / this.visits);
  }

  best(c) {
    let chosen = null;
    let bestValue = -Infinity;
    for (const child of this.children) {
      const value = child.visits === 0 ? Infinity : child.ucb1(c);
      if (value > bestValue) { bestValue = value; chosen = child; }
    }
    return chosen;
  }
}

export function chooseAction(state, options = {}) {
  const {
    iterations = 800,
    rng = makeRng(1),
    exploration = 1.41,
    rolloutCap = 150,
  } = options;

  const actions = legalActions(state);
  if (actions.length <= 1) return actions[0] ?? null;

  const root = new Node(cloneState(state), null, null);

  for (let i = 0; i < iterations; i++) {
    let node = root;

    // Select down the tree while everything here has been tried at least once.
    while (!node.unexplored.length && node.children.length && !node.state.over) {
      node = node.best(exploration);
    }

    // Expand one untried action.
    if (node.unexplored.length && !node.state.over) {
      const action = node.unexplored.splice((rng() * node.unexplored.length) | 0, 1)[0];
      const next = cloneState(node.state);
      applyAction(next, action);
      const child = new Node(next, node, action);
      node.children.push(child);
      node = child;
    }

    const winner = rollout(node.state, rng, rolloutCap);

    // A node's score is credited from the perspective of whoever was to move in
    // its parent; a draw is worth half to both.
    for (let n = node; n; n = n.parent) {
      n.visits++;
      const chooser = n.parent ? n.parent.state.player : null;
      if (chooser === null) continue;
      if (winner === chooser) n.score += 1;
      else if (winner === null) n.score += 0.5;
    }
  }

  let chosen = null;
  let mostVisits = -1;
  for (const child of root.children) {
    if (child.visits > mostVisits) { mostVisits = child.visits; chosen = child; }
  }
  return chosen ? chosen.action : actions[0];
}

export function randomAction(state, rng) {
  const actions = legalActions(state);
  return actions.length ? pick(actions, rng) : null;
}
