// Hands that change hands: a roster of players, each with five stones, and the four
// occasions on which the rules might let one of them swap a stone.
//
//   after winning a duel    the strong get stronger
//   after losing one        the weak catch up, and anyone can farm by throwing
//   after playing one       win or lose, so nothing is worth throwing and nobody is left behind
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

export const TRIGGERS = ['none', 'win', 'lose', 'fought', 'unpaired', 'standout'];

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

// ── Roles ──────────────────────────────────────────────────────────────────
//
// A team that coordinates does not have each player guess where they will be sent: it
// tells them. Every player is given a veto to specialise in, the swaps they earn go
// towards it, and the assignment sends them to squares carrying it. That closes the
// loop `cover` left open -- a hand only worth having on one kind of square is worth
// having if somebody guarantees you will be standing on one.
//
// How many specialists each veto deserves is not a seventh each. It is the share of the
// duels that actually get fought on that veto, which the two teams learn by playing:
// `demand` is a decaying count of duels by veto, so the roster follows the board the
// round is really being decided on.
export function newDemand(pool) {
  return Object.fromEntries(pool.vetoes.map((v) => [v, 1]));
}

export function noteDemand(demand, veto, n, decay = 0.9) {
  for (const v of Object.keys(demand)) demand[v] *= decay;
  demand[veto] = (demand[veto] ?? 0) + n;
}

// Hand each player a veto. Quotas come from demand; who fills them is decided by who is
// already closest to being that specialist, strongest veto first, so roles stay stable
// while hands improve towards them.
export function assignRoles(roster, pool, demand) {
  const total = pool.vetoes.reduce((a, v) => a + (demand[v] ?? 0), 0) || 1;
  const want = pool.vetoes
    .map((v) => ({ v, share: (demand[v] ?? 0) / total }))
    .sort((a, b) => b.share - a.share);

  const quota = want.map(({ v, share }) => ({ v, n: Math.floor(share * roster.length) }));
  let left = roster.length - quota.reduce((a, q) => a + q.n, 0);
  for (let k = 0; left > 0; k = (k + 1) % quota.length) { quota[k].n++; left--; }

  const roles = new Array(roster.length).fill(pool.vetoes[0]);
  const free = new Set(roster.map((h, k) => k));
  for (const { v, n } of quota) {
    const ranked = [...free].sort((a, b) => strengthAt(pool, roster[b], v) - strengthAt(pool, roster[a], v));
    for (const k of ranked.slice(0, n)) { roles[k] = v; free.delete(k); }
  }
  return roles;
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
//   role   the hand that is best on the veto this player has been given to specialise
//          in -- the team having decided in advance where they will be standing
// Returns true if the hand actually changed. A swap handed to a player already holding
// the best hand for their role does nothing, and how often that happens is one of the
// things that separates the occasions.
export function swap(roster, k, pool, rng, kind, aim = 'mean', role = null) {
  const was = roster[k];
  if (kind === 'random') {
    const ns = pool.neighbours[was];
    roster[k] = ns[(rng() * ns.length) | 0];
    return roster[k] !== was;
  }
  if (aim === 'role' && role) {
    const col = pool.at[role] ?? pool.at.neutral;
    roster[k] = pool.neighbours[was].reduce((b, j) => (col[j] > col[b] ? j : b), was);
    return roster[k] !== was;
  }
  if (aim !== 'cover') {
    roster[k] = pool.bestSwap[aim === 'spec' ? 'spec' : 'mean'][was];
    return roster[k] !== was;
  }

  const depth = Math.max(1, Math.round(roster.length / pool.vetoes.length));
  let bestHand = was, bestScore = coverage(roster, pool, depth);
  for (const j of pool.neighbours[was]) {
    roster[k] = j;
    const score = coverage(roster, pool, depth);
    if (score > bestScore) { bestScore = score; bestHand = j; }
  }
  roster[k] = bestHand;
  return bestHand !== was;
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
//   role  the same, but a player whose given veto matches the square goes ahead of a
//         stronger player whose does not, which is what makes a role worth training for
export function assign(order, counts, roster, pool, veto = null, coordinate = 'off', roles = null) {
  const at = new Map();
  const free = new Set(roster.map((h, k) => k));
  const byMean = (a, b) => pool.mean[roster[b]] - pool.mean[roster[a]];

  for (const i of order) {
    const n = counts[i];
    if (!n) continue;
    const v = veto ? veto[i] : null;
    let rank = byMean;
    if (v && coordinate === 'on') {
      rank = (a, b) => strengthAt(pool, roster[b], v) - strengthAt(pool, roster[a], v);
    } else if (v && coordinate === 'role' && roles) {
      rank = (a, b) => ((roles[b] === v) - (roles[a] === v))
        || (strengthAt(pool, roster[b], v) - strengthAt(pool, roster[a], v));
    }
    const taken = [...free].sort(rank).slice(0, n);
    for (const k of taken) free.delete(k);
    at.set(i, taken);
  }
  return { at, idle: [...free].sort(byMean) };
}

export { duelChance };
