// Hands that change hands: a roster of players, each with five stones, and the four
// occasions on which the rules might let one of them swap a stone.
//
//   after winning a duel    the strong get stronger
//   after losing one        the weak catch up
//   after a round unpaired  whoever the other team did not engage
//   by standing out         a player skips the round at a training space to swap
//
// A hand is a row of numbers here -- one Bradley-Terry strength per veto, fitted by
// `hands.js --vetoes` -- and a duel on a square is settled by the column belonging to
// that square's veto. That is the whole of what the board's stone vetoes change, and it
// changes two things: a hand can no longer be simply good, and where a player stands
// starts to matter as much as who they are.

import { readFileSync } from 'node:fs';

import { STONE_TYPES } from './engine.js';
import { allHands, duelChance, handKey } from './hands.js';

export const TRIGGERS = ['none', 'win', 'lose', 'unpaired', 'standout'];

// ── The swap table ─────────────────────────────────────────────────────────

// For each hand, the hands one replaced stone away from it. Built once.
export function loadHands(path = 'results/hands.json', aim = 'mean') {
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

  // One table per veto if the file has them, otherwise the single column, repeated --
  // so a run without vetoes behaves exactly as it did.
  const vetoes = data.vetoes ?? ['neutral'];
  const at = data.table ?? { neutral: data.strength };
  const mean = hands.map((h, i) => vetoes.reduce((a, v) => a + at[v][i], 0) / vetoes.length);

  const best = hands.map((h, i) => Math.max(...vetoes.map((v) => at[v][i])));
  const bestBy = (score) => neighbours.map((ns, i) =>
    ns.reduce((b, j) => (score[j] > score[b] ? j : b), i));
  // Three things a swapping player might be aiming at, kept side by side because which
  // one a team plays is the question the vetoes raise.
  const bestSwap = { mean: bestBy(mean), spec: bestBy(best) };
  const top = mean.reduce((b, s, i) => (s > mean[b] ? i : b), 0);

  // How far a hand swings between its best and worst square: the size of the question
  // "who goes where".
  const swing = hands.map((h, i) => {
    const vs = vetoes.map((v) => at[v][i]);
    return Math.max(...vs) - Math.min(...vs);
  });
  return {
    hands, vetoes, at, mean, best, strength: mean, neighbours, bestSwap, top,
    swapGain: data.swapGain, swing, meanSwing: swing.reduce((a, b) => a + b, 0) / swing.length,
  };
}

// A hand's strength on a square with this veto.
export const strengthAt = (pool, hand, veto) => (pool.at[veto] ?? pool.at.neutral)[hand];

// ── The roster ─────────────────────────────────────────────────────────────

// `pool` is the hand table. Every player starts on a hand drawn at random, which is
// the rule as stated: nobody is handed a good one.
export function newRoster(size, pool, rng) {
  return Array.from({ length: size }, () => (rng() * pool.hands.length) | 0);
}

export const rosterStrength = (roster, pool) => roster.map((h) => pool.mean[h]);

// The team's average strength on each kind of square, which is what the other side has
// to expect from it wherever they meet.
export function meanByVeto(roster, pool) {
  const out = {};
  for (const v of pool.vetoes) {
    out[v] = roster.reduce((a, h) => a + strengthAt(pool, h, v), 0) / roster.length;
  }
  return out;
}

// What a team is worth across the whole board: for each veto, the strength of the few
// players it would actually send to squares carrying that veto. Summed over the vetoes,
// this is the thing a coordinating team is trying to raise, and it is not the same as
// raising everybody's average -- a seventh copy of the best all-rounder adds nothing to
// a veto where somebody better is already going.
export function coverage(roster, pool, depth) {
  let total = 0;
  for (const v of pool.vetoes) {
    const ss = roster.map((h) => strengthAt(pool, h, v)).sort((a, b) => b - a);
    for (let k = 0; k < depth && k < ss.length; k++) total += ss[k];
  }
  return total;
}

// A swap taken deliberately climbs; a swap forced on a player replaces one stone at
// random and can leave them worse off. What "climbs" means is the open question the
// vetoes raise:
//
//   mean   the best hand on average across the vetoes -- what a player picks who does
//          not know where they will be sent, and the choice that walks the whole field
//          onto one hand
//   spec   the hand that is best somewhere, whatever it is worth elsewhere
//   cover  the hand that most improves what the team is worth across the board, which
//          is the only one of the three that ever declines an upgrade because somebody
//          else already covers that ground
export function swap(roster, k, pool, rng, kind, aim = 'mean') {
  if (kind === 'random') {
    const ns = pool.neighbours[roster[k]];
    roster[k] = ns[(rng() * ns.length) | 0];
    return;
  }
  if (aim !== 'cover') { roster[k] = pool.bestSwap[aim === 'spec' ? 'spec' : 'mean'][roster[k]]; return; }

  const depth = Math.max(1, Math.round(roster.length / pool.vetoes.length));
  const was = roster[k];
  let bestHand = was, bestScore = coverage(roster, pool, depth);
  for (const j of pool.neighbours[was]) {
    roster[k] = j;
    const score = coverage(roster, pool, depth);
    if (score > bestScore) { bestScore = score; bestHand = j; }
  }
  roster[k] = bestHand;
}

// ── Who fights whom ────────────────────────────────────────────────────────

// The allocation says how many players stand on each square; this says which ones. A
// captain sends their best to the squares that matter most, so both sides sort their
// players by hand and their squares by what is at stake, and deal the two together.
// Neither side sees the other's assignment, so this is not a counter-move -- it is
// each team spending its best players where it thinks the round will be decided.
// `coordinate` decides how hard the captain thinks about it:
//
//   off   deal the best hands to the squares that matter most and ignore the vetoes,
//         which is what a team does before it notices the vetoes exist
//   on    fill the squares that matter most first, and send to each of them whoever
//         is strongest *on that square's veto* -- so a player who is only good where
//         Magnets are switched off gets sent there
export function assign(order, counts, roster, pool, veto = null, coordinate = 'off') {
  const at = new Map();
  const free = new Set(roster.map((h, k) => k));
  const byMean = (a, b) => pool.mean[roster[b]] - pool.mean[roster[a]];

  for (const i of order) {
    const n = counts[i];
    if (!n) continue;
    const pool2 = [...free];
    const rank = coordinate === 'on' && veto
      ? (a, b) => strengthAt(pool, roster[b], veto[i]) - strengthAt(pool, roster[a], veto[i])
      : byMean;
    const taken = pool2.sort(rank).slice(0, n);
    for (const k of taken) free.delete(k);
    at.set(i, taken);
  }
  return { at, idle: [...free].sort(byMean) };
}

export { duelChance };
