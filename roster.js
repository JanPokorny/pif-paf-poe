// Hands that change hands: a roster of players, each with five stones, and the four
// occasions on which the rules might let one of them swap a stone.
//
//   after winning a duel    the strong get stronger
//   after losing one        the weak catch up
//   after a round unpaired  whoever the other team did not engage
//   by standing out         a player skips the round at a training space to swap
//
// A hand is one number here -- the Bradley-Terry strength fitted by hands.js -- and a
// duel is sigmoid(mine - theirs). What matters for the campaign is not which stones a
// player holds but how far apart the two sides' hands drift, so the roster carries
// strengths and the swap table says what each hand can become.

import { readFileSync } from 'node:fs';

import { STONE_TYPES } from './engine.js';
import { allHands, duelChance, handKey } from './hands.js';

export const TRIGGERS = ['none', 'win', 'lose', 'unpaired', 'standout'];

// ── The swap table ─────────────────────────────────────────────────────────

// For each hand, the hands one replaced stone away from it. Built once.
export function loadHands(path = 'results/hands.json') {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const hands = data.hands ?? allHands();
  const byKey = new Map(hands.map((h, i) => [handKey(h), i]));
  const neighbours = hands.map((hand) => {
    const out = new Set();
    for (let k = 0; k < hand.length; k++) for (const t of STONE_TYPES) {
      const j = byKey.get(handKey([...hand.slice(0, k), t, ...hand.slice(k + 1)]));
      if (j !== undefined) out.add(j);
    }
    return [...out];
  });
  const strength = data.strength;
  // The best a hand can reach in one swap, and in any number of them -- the second is
  // the ceiling every one of these rules is walking towards.
  const bestSwap = neighbours.map((ns, i) =>
    ns.reduce((best, j) => (strength[j] > strength[best] ? j : best), i));
  const top = strength.reduce((b, s, i) => (s > strength[b] ? i : b), 0);
  return { hands, strength, neighbours, bestSwap, top, swapGain: data.swapGain };
}

// ── The roster ─────────────────────────────────────────────────────────────

// `pool` is the hand table. Every player starts on a hand drawn at random, which is
// the rule as stated: nobody is handed a good one.
export function newRoster(size, pool, rng) {
  return Array.from({ length: size }, () => (rng() * pool.hands.length) | 0);
}

export const rosterStrength = (roster, pool) => roster.map((h) => pool.strength[h]);

// A swap taken deliberately goes to the best hand one step away; a swap forced on a
// player replaces one stone at random, which can leave them worse off. Which of the
// two the rules hand out is a setting, because a chosen swap is a ratchet and a random
// one is a walk, and they do not behave alike.
export function swap(roster, k, pool, rng, kind) {
  if (kind === 'random') {
    const ns = pool.neighbours[roster[k]];
    roster[k] = ns[(rng() * ns.length) | 0];
  } else {
    roster[k] = pool.bestSwap[roster[k]];
  }
}

// ── Who fights whom ────────────────────────────────────────────────────────

// The allocation says how many players stand on each square; this says which ones. A
// captain sends their best to the squares that matter most, so both sides sort their
// players by hand and their squares by what is at stake, and deal the two together.
// Neither side sees the other's assignment, so this is not a counter-move -- it is
// each team spending its best players where it thinks the round will be decided.
export function assign(order, counts, roster, pool) {
  const players = roster
    .map((h, k) => k)
    .sort((a, b) => pool.strength[roster[b]] - pool.strength[roster[a]]);
  const at = new Map();
  let next = 0;
  for (const i of order) {
    const n = counts[i];
    if (!n) continue;
    at.set(i, players.slice(next, next + n));
    next += n;
  }
  return { at, idle: players.slice(next) };
}

export { duelChance };
