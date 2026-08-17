// The players: a roster of hands, what a swap is worth to one of them, and who gets sent
// where.
//
// A hand is a row of numbers here -- one Bradley-Terry strength per veto, fitted by
// `hands.js --vetoes` -- and a duel on a space is settled by the column belonging to that
// space's veto. That is the whole of what the arena's stone vetoes change, and it changes
// two things: a hand can no longer be simply good, and where a player stands starts to
// matter as much as who they are.

import { readFileSync } from 'node:fs';

import { VETO } from './arena.js';
import { STONE_TYPES } from './engine.js';
import { allHands, duelChance, handKey } from './hands.js';

// ── The hand table ─────────────────────────────────────────────────────────

// One strength per hand per veto, plus the hands each hand is one replaced stone away
// from, which is what a swap chooses between. Built once and shared.
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

  const { vetoes, table: at } = data;
  if (!vetoes || !at) throw new Error(`${path} has no per-veto table; run hands.js --vetoes`);
  // A player swapping does not know which veto they will be standing on, so what they
  // climb is the average across the vetoes.
  const mean = hands.map((h, i) => vetoes.reduce((a, v) => a + at[v][i], 0) / vetoes.length);
  const top = mean.reduce((b, s, i) => (s > mean[b] ? i : b), 0);
  return { hands, vetoes, at, mean, neighbours, top };
}

// A hand's strength on a space with this veto.
export const strengthAt = (pool, hand, veto) => (pool.at[veto] ?? pool.at.neutral)[hand];

// ── The roster ─────────────────────────────────────────────────────────────

// Every player starts on a hand drawn at random, which is the rule as stated: nobody is
// handed a good one.
export function newRoster(size, pool, rng) {
  return Array.from({ length: size }, () => (rng() * pool.hands.length) | 0);
}

export const rosterStrength = (roster, pool) => roster.map((h) => pool.mean[h]);

// The team's average strength on each kind of space, which is what the other side has to
// expect from it wherever they meet.
export function meanByVeto(roster, pool) {
  const out = {};
  for (const v of pool.vetoes) {
    out[v] = roster.reduce((a, h) => a + strengthAt(pool, h, v), 0) / roster.length;
  }
  return out;
}

// ── Swapping a stone ───────────────────────────────────────────────────────

// Where one chosen swap would take this hand, and what it would gain. Split from `swap`
// because a player buying one has to price it before paying for it. A swap is chosen, not
// rolled: a random replacement is a walk rather than a ladder.
export function swapTarget(pool, hand) {
  const to = pool.neighbours[hand].reduce((b, j) => (pool.mean[j] > pool.mean[b] ? j : b), hand);
  return { to, gain: pool.mean[to] - pool.mean[hand] };
}

// Returns true if the hand actually changed: a swap is wasted on a player already holding
// the best hand a single replacement can reach.
export function swap(roster, k, pool) {
  const was = roster[k];
  roster[k] = swapTarget(pool, was).to;
  return roster[k] !== was;
}

// ── Who fights whom ────────────────────────────────────────────────────────

// The allocation says how many players stand on each space; this says which ones. A
// captain fills the spaces that matter most first and sends to each of them whoever is
// strongest *on that space's veto* -- so a player who is only good where Magnets are
// switched off gets sent there. Neither side sees the other's assignment, so this is not
// a counter-move: it is each team spending its best players where it thinks the round
// will be decided.
export function assign(order, counts, roster, pool) {
  const at = new Map();
  const free = new Set(roster.map((h, k) => k));
  const byMean = (a, b) => pool.mean[roster[b]] - pool.mean[roster[a]];

  for (const i of order) {
    const n = counts[i];
    if (!n) continue;
    const v = VETO[i];
    const taken = [...free]
      .sort((a, b) => strengthAt(pool, roster[b], v) - strengthAt(pool, roster[a], v))
      .slice(0, n);
    for (const k of taken) free.delete(k);
    at.set(i, taken);
  }
  return { at, idle: [...free].sort(byMean) };
}

export { duelChance };
