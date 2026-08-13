// The campaign: two teams, thirty-three spaces, and a duel on every pairing.
//
//   node campaign.js --sizes 10-30 --rounds 800 --reps 3 --steps none,forced,optional
//   node campaign.js --layouts pinwheel,square,touching --sizes 20 --rounds 900
//   node campaign.js --pair defence --sizes 10,20,30 --rounds 500    # what defence is worth
//   node campaign.js --pair step --sizes 10,20,30 --rounds 500       # what the step is worth
//   node campaign.js --sizes 20 --defence oracle --rounds 500        # the defence's ceiling
//   node campaign.js --sizes 20 --target 10 --campaigns 500 --skill 0.55
//   node campaign.js --sizes 12 --rounds 200 --duels real --iters 120
//   node campaign.js --report --out results/sizes.json
//
// Two questions are being asked here, and everything in the file is in service
// of them: how many players a team should have, and whether a defender with
// nobody to fight should be allowed to step to an adjacent space.
//
// A round is a Blotto game with a duel as its coin. The defence commits first
// and the attack answers it knowing everything, so the attack is never guessing
// and the defence can never bluff -- which is why both sides here play pure
// strategies and neither randomises. The defence picks the allocation whose best
// answer is worst; the attack plays that best answer.
//
// The duel itself is symmetric: both teams draw hands from the same pool and the
// seat is decided at the table, so an attacker beats a defender half the time
// and the metagame does not care which two people met. That is why the default
// is a coin at --p 0.5 rather than a game: it buys three orders of magnitude of
// rounds. `--duels real` plays every pairing out through engine.js instead, and
// exists to check that the coin is not hiding anything.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ADJACENT, BOARD_SPACES, CORNERS, LAYOUTS, LINES, LINE_BOARDS, LINE_CLEARS, LINE_HALO,
  N_SPACES, REGULAR, SPACES, SPACE_BOARDS, STAR, SUBBOARDS, claimable, render, setLayout,
} from './board.js';
import { makeRng } from './ai.js';
import {
  TRIGGERS, assign, duelChance, loadHands, newRoster, rosterStrength, swap,
} from './roster.js';
import { arg, pad, pct, playGame, randomHand } from './sim.js';

// ── What a position is worth ────────────────────────────────────────────────

// A line with two of my symbols and none of theirs is worth a lot, because the
// defence has no way to block it: defenders never place a symbol, so the only
// answer to a threat is to keep winning the fight for the square it needs. A
// line with one is worth a little. A completed line is worth a point, which is
// the unit everything else is priced in.
//
// These two numbers are a judgement, and a bad one distorts play: priced too high,
// a position is worth more than the point it would score, and the attack declines
// points to keep building. So they are not trusted. They are a setting per team --
// only the attacking team's weights are ever used in a round, since the defence is
// minimising the attack's valuation and not applying one of its own -- and the
// value that plays best is found by running the candidates against each other. A
// two-in-a-row at 0.45 loses to the same team at 0.12 by six points to one,
// because at 0.45 it declines a point in order to keep two marks standing. The
// pair below is what came out of that search; the surface around it is flat, and
// the conclusions were re-run at both ends of a wide range to be sure of it.
let POS = [0, 0.03, 0.12];

// A line through the star is not like the others. Its third square is the one no
// attack can ever be aimed at, so two of your symbols on it is a threat the other
// team cannot answer by marking the gap -- the only reply is to flip the star to
// their own symbol, which costs them every mark of a whole round. `STAR_W` scales
// what a position on such a line is worth; it is a setting because whether that
// premium is real is a question for measurement.
let STAR_W = 1;
export const setPos = ([one, two, star = 1]) => { POS = [0, one, two]; STAR_W = star; };

// Positional value of a board to `me`, net of what the same board is worth to
// them. Zero-sum by construction, so the defence can use the attack's numbers.
// Which lines run through the star, cached against the board they were built from
// so that switching layout does not leave them stale.
let starLines = null, starLinesOf = null;
function starLineFlags() {
  if (starLinesOf !== LINES) {
    starLinesOf = LINES;
    starLines = LINES.map((line) => line.includes(STAR));
  }
  return starLines;
}

function posValue(b, me, them) {
  const through = starLineFlags();
  let v = 0;
  for (let li = 0; li < LINES.length; li++) {
    const line = LINES[li];
    let mine = 0, theirs = 0;
    for (const j of line) { if (b[j] === me) mine++; else if (b[j] === them) theirs++; }
    const w = through[li] ? STAR_W : 1;
    if (!theirs) v += w * POS[mine];
    if (!mine) v -= w * POS[theirs];
  }
  return v;
}



// What a scored line takes with it. The original rule clears every board the three
// symbols stood on, which is between a fifth and three quarters of the board
// depending on the arrangement and leaves the campaign with almost no memory. So it
// is a setting:
//
//   boards  every board the line touched, whole, and the star if it was in the line
//   one     just one of those boards, and the attack picks which
//   halo    the three squares and everything touching them, edge or corner
//   line    the three squares and nothing else
//
// Every one of them takes at least one square of the line, which is what stops a
// scored line standing there and scoring again next round.
let CLEAR = 'boards';
let FILL = false;

// What n lines in one round are worth. `linear` is n, which is the rule as it
// stands. `square` is n squared -- 1, 4, 9, 16 -- which turns the round from a
// question of whether you can score into a question of how much you can hold back
// and fire at once. The four lines that cross the star share it, so a team holding
// the inner ring can take all four with one flip, and that is sixteen points.
let SCORE = (n) => n;
export const setRules = ({ clear = 'boards', fill = false, score = 'linear' }) => {
  CLEAR = clear;
  FILL = fill;
  // `triangle` -- 1, 3, 6, 10 -- is the middle ground: it rewards holding back
  // without letting one round carry a whole campaign the way squaring does.
  SCORE = score === 'square' ? (n) => n * n
    : score === 'triangle' ? (n) => (n * (n + 1)) / 2
      : (n) => n;
};

// For `one`, the board worth clearing is the one that costs the attack least and the
// other team most, counted in symbols.
function pickBoard(b, li, me, them) {
  let best = null, bestGain = -Infinity;
  for (const board of LINE_BOARDS[li]) {
    let gain = 0;
    for (const j of BOARD_SPACES[board]) gain += b[j] === them ? 1 : b[j] === me ? -1 : 0;
    if (gain > bestGain) { bestGain = gain; best = board; }
  }
  return best;
}

// Lines of `me` on the board, and everything they take with them.
function scoreAndClear(b, me, them = 3 - me) {
  let lines = 0, cleared = null;
  const add = (j) => { (cleared ??= new Set()).add(j); };
  LINES.forEach((line, li) => {
    if (!line.every((j) => b[j] === me)) return;
    lines++;
    if (CLEAR === 'line') { for (const j of line) add(j); return; }
    if (CLEAR === 'halo') { for (const j of LINE_HALO[li]) add(j); return; }
    if (CLEAR === 'one') {
      for (const j of line) if (j === STAR) add(j);
      for (const j of BOARD_SPACES[pickBoard(b, li, me, them)]) add(j);
      return;
    }
    for (const j of LINE_CLEARS[li]) add(j);
  });
  if (cleared) for (const j of cleared) b[j] = 0;
  return { lines, points: SCORE(lines), cleared: cleared ? cleared.size : 0 };
}

// The other half of the light-clearing variant: the symbol that fills a board
// sweeps the other team's symbols out of it. With a line only taking three squares
// the boards fill up, and this is what empties them again -- as a reward rather than
// a reset, since it leaves your own symbols standing.
function fillBonus(b, me, them, picks) {
  if (!FILL || !picks.length) return 0;
  const filled = new Set(picks.flatMap((i) => SPACE_BOARDS[i]));
  let swept = 0;
  for (const board of filled) {
    const cells = BOARD_SPACES[board];
    if (!cells.every((j) => b[j])) continue;
    for (const j of cells) if (b[j] === them) { b[j] = 0; swept++; }
  }
  return swept;
}

// What placing this set of marks (or, for the empty set, flipping the star) is
// worth: the points it scores now plus the position it leaves, after the clear
// that scoring triggers. Scoring costs you the ground you scored from, so this
// is the number that has to decide it rather than the points alone.
function placementValue(marks, me, them, picks, base) {
  const b = marks.slice();
  if (picks.length) for (const i of picks) b[i] = me;
  else if (STAR >= 0) b[STAR] = me;
  fillBonus(b, me, them, picks);
  const { points } = scoreAndClear(b, me, them);
  return points + posValue(b, me, them) - base;
}

// ── Pairing ────────────────────────────────────────────────────────────────
//
// On each space the defenders there pair off against the attackers there. Which
// attacker a defender takes is the defender's choice, and since every duel is the
// same coin it does not matter here; how many pair does, and so does how many are
// left over on each side, because leftovers now count towards the result.
//
// `step` says what a defender with nobody to fight may do:
//
//   none      -- stand there. A defender covers the square they are on.
//   forced    -- step to an orthogonally adjacent square where the attackers
//                outnumber the defenders, and pair with an attacker there. Not
//                optional: a defender may stand idle only when no unpaired
//                attacker is within reach, so it comes to the largest number of
//                extra pairings the adjacency allows -- a max-flow from the
//                squares with spare defenders to the squares with spare attackers.
//   optional  -- the same step, taken only where the defence wants it. Under this
//                scoring a step is not free: an unpaired defender counts towards
//                holding the square they stand on, so stepping away spends that to
//                buy a duel next door. It is also a second decision taken after
//                the attack is visible, which is the only information the defence
//                ever gets.
//
// Returns pairs and leftover defenders per square. Leftover attackers are always
// A[i] - pairs[i].

function resolve(A, D, step, value = null, tail = null) {
  const pairs = new Int32Array(N_SPACES);
  const spare = new Int32Array(N_SPACES);
  for (const i of REGULAR) {
    pairs[i] = Math.min(A[i], D[i]);
    spare[i] = D[i] - pairs[i];
  }
  if (step === 'none') return { pairs, spare };

  const surplus = [], need = [];
  for (const i of REGULAR) {
    if (spare[i] > 0) surplus.push(i);
    else if (A[i] > D[i]) need.push(i);        // the attackers' majority
  }
  if (!surplus.length || !need.length) return { pairs, spare };

  const adjacency = surplus.map((i) => need
    .map((j, k) => (ADJACENT[i].includes(j) ? k : -1)).filter((k) => k >= 0));

  if (step === 'forced') {
    const flow = maxFlow(surplus.map((i) => spare[i]), need.map((i) => A[i] - D[i]), adjacency);
    need.forEach((j, k) => { pairs[j] += flow[k]; });
    distributeOut(surplus, need, adjacency, flow, spare);
    return { pairs, spare };
  }

  // optional: take the step that most improves the defence's expected holding, and
  // keep taking them while one helps. Greedy, because each step is worth what it is
  // worth on its own square and its neighbour and nowhere else.
  const held = (i) => 1 - takeChance(A[i], pairs[i], spare[i], tail);
  for (;;) {
    let best = null, bestGain = 1e-9;
    for (let k = 0; k < surplus.length; k++) {
      const i = surplus[k];
      if (!spare[i]) continue;
      for (const ti of adjacency[k]) {
        const j = need[ti];
        if (pairs[j] >= A[j]) continue;         // nobody left there to fight
        const before = value[i] * held(i) + value[j] * held(j);
        spare[i]--; pairs[j]++;
        const gain = value[i] * held(i) + value[j] * held(j) - before;
        spare[i]++; pairs[j]--;
        if (gain > bestGain) { bestGain = gain; best = [i, j]; }
      }
    }
    if (!best) break;
    spare[best[0]]--; pairs[best[1]]++;
  }
  return { pairs, spare };
}

// The flow says how many defenders arrive at each needy square; this takes the
// matching number away from the squares they came from.
function distributeOut(surplus, need, adjacency, flow, spare) {
  const arriving = need.map((_, k) => flow[k]);
  for (let k = 0; k < surplus.length; k++) {
    for (const ti of adjacency[k]) {
      const send = Math.min(spare[surplus[k]], arriving[ti]);
      spare[surplus[k]] -= send;
      arriving[ti] -= send;
    }
  }
}

// Edmonds-Karp on the three-layer graph the pairing rule describes. Small
// enough -- at most 32 spaces a side and at most one unit of flow per player --
// that the simple version is the right one.
function maxFlow(left, right, edges) {
  const L = left.length, R = right.length, n = L + R + 2, src = n - 2, snk = n - 1;
  const cap = Array.from({ length: n }, () => new Int32Array(n));
  left.forEach((c, i) => { cap[src][i] = c; });
  right.forEach((c, j) => { cap[L + j][snk] = c; });
  edges.forEach((js, i) => js.forEach((j) => { cap[i][L + j] = 1e9; }));

  for (;;) {
    const from = new Int32Array(n).fill(-1);
    from[src] = src;
    const queue = [src];
    for (let q = 0; q < queue.length && from[snk] < 0; q++) {
      const u = queue[q];
      for (let v = 0; v < n; v++) if (from[v] < 0 && cap[u][v] > 0) { from[v] = u; queue.push(v); }
    }
    if (from[snk] < 0) break;
    let add = Infinity;
    for (let v = snk; v !== src; v = from[v]) add = Math.min(add, cap[from[v]][v]);
    for (let v = snk; v !== src; v = from[v]) { cap[from[v]][v] -= add; cap[v][from[v]] += add; }
  }
  return right.map((c, j) => c - cap[L + j][snk]);
}

// ── Taking a space ─────────────────────────────────────────────────────────
//
// Each side's power on a space is its unpaired players there plus the duels its
// players won there, and the attack takes the space when its power is strictly
// higher. So with A attackers, P of them paired, S defenders left spare and W
// duels won by the attack:
//
//   attack  A - P + W        defence  S + P - W        take iff 2W > S + 2P - A
//
// which is symmetric in a way the phase order is not. Twice the defenders and one
// more takes a square outright, whatever the duels do; twice the attackers and the
// square cannot be taken at all, whatever the duels do. In between, the duels
// decide it. Nothing here is free: an extra attacker on a thick square is another
// duel to lose, and an extra defender is another body counted against the attack
// whether they find a fight or not.

// The fewest duels the attack has to win. Zero or less means the square falls
// however they go; more than P means it cannot fall.
const winsNeeded = (a, pairs, spare) => Math.max(0, Math.floor((spare + 2 * pairs - a) / 2) + 1);

// tail[k][w]: the chance of at least w wins out of k duels.
function tailTable(p, max) {
  const table = [];
  for (let k = 0; k <= max; k++) {
    const row = new Float64Array(max + 2);
    // P(exactly l wins), accumulated from the top down.
    const exact = [];
    let term = Math.pow(1 - p, k);
    for (let l = 0; l <= k; l++) { exact.push(term); term *= (p / (1 - p)) * (k - l) / (l + 1); }
    let acc = 0;
    for (let w = k; w >= 0; w--) { acc += exact[w]; row[w] = Math.min(1, acc); }
    table.push(row);
  }
  return table;
}

// The chance the attack takes a square, given the shape of the fight on it.
function takeChance(a, pairs, spare, tail) {
  if (!a) return 0;
  const w = winsNeeded(a, pairs, spare);
  return w > pairs ? 0 : tail[pairs][w];
}

// Binomial coefficients, small enough to keep whole.
const CHOOSE = (() => {
  const rows = [[1]];
  for (let n = 1; n <= 64; n++) {
    const prev = rows[n - 1], row = [1];
    for (let k = 1; k < n; k++) row.push(prev[k - 1] + prev[k]);
    row.push(1);
    rows.push(row);
  }
  return (n, k) => (k < 0 || k > n ? 0 : rows[n][k]);
})();

// The chance that one player's own duel decides the square, worked out before any of
// them are played. Their result matters exactly when the other duels on the square
// come to one short of what the attack needs: then this game turns it either way.
//
// This is the honest answer to "does my game matter", because it is the question as a
// player faces it -- sitting down not knowing how the others will go. The alternative
// is to ask afterwards whether that one result, alone, would have flipped the square,
// and the two disagree: two attackers against two defenders who both win is a square
// that no single result would have changed, so afterwards nobody decided it, while
// beforehand each of the four had an even chance of being the one who did.
function stakePerDuel(a, pairs, spare, p) {
  if (!a || !pairs) return 0;
  const w = winsNeeded(a, pairs, spare);
  if (w < 1 || w > pairs) return 0;              // the duels cannot change the result
  return CHOOSE(pairs - 1, w - 1) * Math.pow(p, w - 1) * Math.pow(1 - p, pairs - w);
}

// ── The attack ─────────────────────────────────────────────────────────────

// One mark per board per round, so what an allocation is worth is, board by
// board, the best of the spaces it takes there. Corners belong to two boards and
// can be claimed for either, but only once, so each is booked to the board that
// has least else to offer.
function boardBuckets(free, gain) {
  const of = Object.fromEntries(SUBBOARDS.map((b) => [b, []]));
  const corner = new Map();
  for (const i of free) {
    if (SPACE_BOARDS[i].length > 1) corner.set(i, SPACE_BOARDS[i]);
    else of[SPACE_BOARDS[i][0]].push(i);
  }
  for (const [i, boards] of corner) {
    const best = (b) => Math.max(0, ...of[b].map((j) => gain[j]));
    of[boards[0]].length && of[boards[1]].length
      ? of[best(boards[0]) <= best(boards[1]) ? boards[0] : boards[1]].push(i)
      : of[of[boards[0]].length ? boards[1] : boards[0]].push(i);
  }
  return SUBBOARDS.map((b) => of[b].sort((x, y) => gain[y] - gain[x])).filter((l) => l.length);
}

// One mark per board is a real constraint but it is not four marks per round in
// four separate places: a line across the inner ring uses one square of three
// different boards, so it can be built whole in a single round. Those are the
// combinations worth going for, and a value that adds up single squares cannot
// see them. So they are enumerated once per round -- a line with none of the
// opponent's symbols on it, whose empty squares are all free and can be claimed
// for different boards -- and priced at what the whole set is worth over and
// above its best single square.
function combinations(marks, me, them, free, gain, base) {
  const isFree = new Uint8Array(N_SPACES);
  for (const i of free) isFree[i] = 1;
  const out = [];
  for (const line of LINES) {
    if (line.some((j) => marks[j] === them)) continue;
    const gaps = line.filter((j) => marks[j] !== me);
    if (gaps.length < 2 || !gaps.every((j) => isFree[j]) || !claimable(gaps)) continue;
    const surplus = placementValue(marks, me, them, gaps, base) - Math.max(...gaps.map((j) => gain[j]));
    if (surplus > 0.01) out.push({ gaps, surplus });
  }
  return out.sort((a, b) => b.surplus - a.surplus).slice(0, 12);
}

// Expected value of an allocation: independently per space, the chance of taking
// it; then per board, the expected best gain among the ones taken, plus what the
// combinations add when a whole set comes off.
function planValue(A, shape, buckets, gain, tail, combos) {
  const chance = (i) => takeChance(A[i], shape.pairs[i], shape.spare[i], tail);
  let v = 0;
  for (const bucket of buckets) {
    let miss = 1;
    for (const i of bucket) {
      if (!A[i]) continue;
      const q = chance(i);
      v += gain[i] * q * miss;
      miss *= 1 - q;
      if (miss < 1e-4) break;
    }
  }
  for (const { gaps, surplus } of combos) {
    let all = surplus;
    for (const j of gaps) all *= A[j] ? chance(j) : 0;
    v += all;
  }
  return v;
}

// What the attack should expect a square to look like when it gets there. Without
// the step it is exact. With it the attack assumes every spare defender next door
// arrives and every spare defender here stays, which cannot both happen, so it is
// the pessimistic reading rather than the true one -- the attack over-commits a
// little and the round itself is resolved by the real thing. `overestimate` in the
// output says how much that costs.
function estimate(A, D, free, cfg) {
  const pairs = new Int32Array(N_SPACES);
  const spare = new Int32Array(N_SPACES);
  const reach = (i) => {
    let d = D[i];
    if (cfg.step !== 'none') for (const j of ADJACENT[i]) if (D[j] > A[j]) d += D[j] - A[j];
    return d;
  };
  const at = (i) => { pairs[i] = Math.min(A[i], reach(i)); spare[i] = Math.max(0, D[i] - A[i]); };
  for (const i of free) at(i);
  return { pairs, spare, at, reach };
}

// A square's value to the attack is a staircase in the force on it, and the treads
// are wide: against three defenders, four attackers and five attackers are the same
// square. So the search buys whole steps rather than one player at a time, and takes
// the step with the best value per player each time round. Twice the defenders and
// one more is the top of the staircase, and nothing above it buys anything.
const LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 19, 22, 25, 30];

function attackPlan(marks, me, them, D, free, gain, buckets, combos, cfg, tail) {
  const A = new Int32Array(N_SPACES);
  const candidates = free.filter((i) => gain[i] > 0).sort((a, b) => gain[b] - gain[a]).slice(0, cfg.targets);
  const shape = estimate(A, D, free, cfg);

  // A change at i changes what its neighbours can expect too, once stepping is on.
  const repair = (i) => {
    shape.at(i);
    if (cfg.step !== 'none') for (const j of ADJACENT[i]) shape.at(j);
  };

  let spent = 0, value = 0;
  for (;;) {
    let best = null, bestRatio = 1e-9;
    for (const i of candidates) {
      const from = A[i], ceiling = 2 * shape.reach(i) + 1;
      for (const a of LADDER) {
        if (a <= from || a - from > cfg.size - spent) continue;
        A[i] = a; repair(i);
        const ratio = (planValue(A, shape, buckets, gain, tail, combos) - value) / (a - from);
        if (ratio > bestRatio) { bestRatio = ratio; best = { i, a }; }
        if (a >= ceiling) break;
      }
      A[i] = from; repair(i);
    }
    if (!best) break;
    spent += best.a - A[best.i];
    A[best.i] = best.a; repair(best.i);
    value = planValue(A, shape, buckets, gain, tail, combos);
  }

  // Everyone has to stand somewhere, and an extra attacker on a square already past
  // the top of the staircase cannot spoil it. So the leftovers go there, or failing
  // that to the thinnest square.
  if (spent < cfg.size) {
    const safe = free.filter((i) => A[i] > 0 && A[i] > 2 * shape.reach(i));
    const dump = safe.length
      ? safe.sort((a, b) => gain[b] - gain[a])[0]
      : free.slice().sort((a, b) => (D[a] - D[b]) || (gain[b] - gain[a]))[0];
    A[dump] += cfg.size - spent;
  }
  return A;
}

// ── The defence ────────────────────────────────────────────────────────────

// The defence commits first and is then read, so there is nothing to gain from
// mixing: the best it can do is pick the allocation whose best answer is worst.
// The candidates are the shapes a team would actually try -- cover the n most
// dangerous squares evenly, cover them in proportion to the danger, cover the
// worst few in each board -- and the attack planner scores every one of them.
function defenceCandidates(free, gain, buckets, size, step) {
  const ranked = free.slice().sort((a, b) => gain[b] - gain[a]);
  const out = [];

  const spread = (spaces, weights) => {
    const D = new Int32Array(N_SPACES);
    if (!spaces.length) return D;
    const total = weights.reduce((a, b) => a + b, 0);
    let left = size;
    spaces.forEach((i, k) => {
      const share = Math.min(left, Math.round(size * weights[k] / total));
      D[i] = share; left -= share;
    });
    for (let k = 0; left > 0; k = (k + 1) % spaces.length) { D[spaces[k]]++; left--; }
    return D;
  };

  for (const m of [2, 3, 4, 5, 6, 8, 10, 12, 16, 24]) {
    const spaces = ranked.slice(0, m);
    if (!spaces.length) continue;
    out.push(spread(spaces, spaces.map(() => 1)));
    if (m === 6 || m === 10) out.push(spread(spaces, spaces.map((i) => Math.max(0.01, gain[i]))));
  }
  // A few deep on the best squares of every board: the shape that answers a line
  // built out of one mark per board in a single round.
  for (const per of [1, 2, 3]) {
    const spaces = buckets.flatMap((b) => b.slice(0, per));
    if (spaces.length) out.push(spread(spaces, spaces.map((i) => Math.max(0.01, gain[i]))));
  }

  // And, for the stepping rule, shapes chosen to cover ground rather than to stand
  // on it. Every other candidate here ranks by danger, and the dangerous squares are
  // all in the middle, so they all cluster; a defence that can step wants its
  // neighbourhoods to tile the board instead. Greedy set cover over the free squares,
  // weighted by what each is worth to the attack.
  if (step !== 'none') {
    const covers = (i) => [i, ...ADJACENT[i].filter((j) => free.includes(j))];
    for (const posts of [4, 6, 8, 10]) {
      const chosen = [], covered = new Set();
      while (chosen.length < posts) {
        let best = -1, bestGain = -1;
        for (const i of ranked) {
          if (chosen.includes(i)) continue;
          const fresh = covers(i).reduce((v, j) => v + (covered.has(j) ? 0 : Math.max(0.01, gain[j])), 0);
          if (fresh > bestGain) { bestGain = fresh; best = i; }
        }
        if (best < 0) break;
        chosen.push(best);
        for (const j of covers(best)) covered.add(j);
      }
      if (chosen.length) out.push(spread(chosen, chosen.map(() => 1)));
    }
  }
  return out;
}

function defencePlan(marks, me, them, free, gain, buckets, combos, cfg, tail) {
  let best = null, bestValue = Infinity;
  for (const D of defenceCandidates(free, gain, buckets, cfg.size, cfg.step)) {
    const A = attackPlan(marks, me, them, D, free, gain, buckets, combos, cfg, tail);
    const v = planValue(A, resolve(A, D, cfg.step, gain, tail), buckets, gain, tail, combos);
    if (v < bestValue) { bestValue = v; best = D; }
  }
  return best;
}

function randomPlan(free, size, rng) {
  const D = new Int32Array(N_SPACES);
  for (let k = 0; k < size; k++) D[free[(rng() * free.length) | 0]]++;
  return D;
}

// A defence that has already seen the attack it is answering, and that the attack
// then does not get to re-plan against. It is not a legal way to play -- the order
// of the phases is the other way round -- and it is here as a ceiling. Twice the
// attackers on a square denies it outright, so it buys shutouts from the most
// dangerous square down until the players run out.
function oraclePlan(marks, me, them, free, gain, buckets, combos, cfg, tail) {
  const A = attackPlan(marks, me, them, new Int32Array(N_SPACES), free, gain, buckets, combos, cfg, tail);
  const D = new Int32Array(N_SPACES);
  let left = cfg.size;
  for (const i of free.filter((i) => A[i]).sort((a, b) => gain[b] - gain[a])) {
    const take = Math.min(left, 2 * A[i]);
    D[i] = take; left -= take;
    if (!left) break;
  }
  if (left) D[free.sort((a, b) => gain[b] - gain[a])[0]] += left;
  return D;
}

// ── Placing the marks ──────────────────────────────────────────────────────

// Each board may claim one of the spaces its attack took, or none, and if no
// board claims anything the star flips instead. Three of the best per board is
// deep enough that the combination worth having is in the list, and the whole
// list is scored exactly -- including the marks that only add up to a line
// together, which the planner's estimate misses.
function bestPicks(marks, me, them, taken, gain, base) {
  // -1 stands for "this board claims nothing", since 0 is a real square.
  const buckets = SUBBOARDS
    .map((b) => taken.filter((i) => SPACE_BOARDS[i].includes(b)).sort((x, y) => gain[y] - gain[x]))
    .map((b) => [-1, ...b.slice(0, 4)]);

  const score = (choice) => {
    const set = [...new Set(choice.filter((i) => i >= 0))];
    return { set, value: placementValue(marks, me, them, set, base) };
  };
  // Placing nothing is always on the menu, and on a board with a hole it is the flip.
  let best = [], bestValue = placementValue(marks, me, them, [], base);
  const keep = ({ set, value }) => {
    if (set.length && value > bestValue) { bestValue = value; best = set; }
  };

  // Four boards is 625 combinations and worth enumerating; nine is two million and
  // is not. Above four, start from each board's best claim and sweep: re-choose one
  // board at a time against the others as they stand, until a pass changes nothing.
  // Every candidate is still scored exactly, so what the sweep can miss is only a
  // combination no single change reaches.
  if (buckets.length <= 4) {
    const walk = (k, choice) => {
      if (k === buckets.length) return keep(score(choice));
      for (const i of buckets[k]) walk(k + 1, [...choice, i]);
    };
    walk(0, []);
    return { picks: best, value: bestValue };
  }

  const choice = buckets.map((b) => b[1] ?? -1);
  let current = score(choice);
  keep(current);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let k = 0; k < buckets.length; k++) {
      const was = choice[k];
      for (const i of buckets[k]) {
        if (i === was) continue;
        choice[k] = i;
        const next = score(choice);
        if (next.value > current.value + 1e-12) { current = next; moved = true; keep(next); }
        else choice[k] = was;
      }
    }
    if (!moved) break;
  }
  return { picks: best, value: bestValue };
}

// ── A round ────────────────────────────────────────────────────────────────

// `first` is which team attacks in round 0. It matters: the team that attacks
// first is always the team with more marks on the board when the other one scores,
// and a scored line clears whole boards, so attacking first means having more to
// lose to it. Campaigns are therefore run half from each seat.
export function newCampaign(first = 0, cfg = null, rng = null) {
  const st = { marks: new Uint8Array(N_SPACES), round: 0, first, points: [0, 0, 0] };
  // Every player starts on a hand drawn at random -- nobody is handed a good one --
  // and from there the trigger rule decides who gets to change theirs.
  if (cfg?.pool) st.roster = [null, newRoster(cfg.size, cfg.pool, rng), newRoster(cfg.size, cfg.pool, rng)];
  return st;
}

// `skill` is the chance a player of team X beats a player of team O in a duel,
// whichever of them is attacking. At a half the two teams are the same and the
// campaign is symmetric; above it, X is the better team and the question becomes
// how reliably being better turns into winning.
export const skillOf = (cfg, me) => (me === 1 ? cfg.skill : 1 - cfg.skill);

// Whose round it is, what every free square is worth, and where both teams go.
// Separated out because it is the whole of the decision-making and the rest of
// the round is arithmetic.
export function allocate(st, cfg, rng, tables) {
  const me = ((st.round + st.first) % 2) + 1, them = 3 - me;

  // Standing out: a team may send players to a training space instead of the board,
  // giving up what they would have done this round to come back with a better hand.
  // Both teams do it, attacking or defending. Who goes is the players with the worst
  // hands -- there is no reason to take your best off the board.
  // Each team may send a different share, so that the question "how many is it worth
  // standing out?" can be settled by the two rates playing each other.
  let size = cfg.size;
  if (cfg.trigger === 'standout' && st.roster) {
    const rate = (team) => (Array.isArray(cfg.standout) ? cfg.standout[team] : cfg.standout);
    const out = (team) => Math.min(Math.round(cfg.size * rate(team)), cfg.size - 1);
    st.standout = [null, [], []];
    for (const team of [me, them]) {
      st.standout[team] = st.roster[team].map((h, k) => k)
        .sort((a, b) => cfg.pool.strength[st.roster[team][a]] - cfg.pool.strength[st.roster[team][b]])
        .slice(0, out(team));
    }
    size = cfg.size - out(me);
  }

  // Both sides plan against the duel odds they can expect, which with hands in play is
  // their own average against the other side's rather than a flat half.
  const tail = cfg.pool && st.roster
    ? tailTable(expectedChance(st, cfg, me, them), size + 1)
    : tables[me];
  const free = REGULAR.filter((i) => !st.marks[i]);
  const base = posValue(st.marks, me, them);

  const gain = new Float64Array(N_SPACES);
  for (const i of free) gain[i] = placementValue(st.marks, me, them, [i], base);
  const buckets = boardBuckets(free, gain);
  const combos = combinations(st.marks, me, them, free, gain, base);

  // Standing out takes players off the board, so the planners budget `size` rather
  // than the whole team.
  const plan = size === cfg.size ? cfg : { ...cfg, size };

  const DEFENCES = {
    random: () => randomPlan(free, size, rng),
    oracle: () => oraclePlan(st.marks, me, them, free, gain, buckets, combos, plan, tail),
    plan: () => defencePlan(st.marks, me, them, free, gain, buckets, combos, plan, tail),
  };

  let A = new Int32Array(N_SPACES), D = new Int32Array(N_SPACES);
  let shape = { pairs: new Int32Array(N_SPACES), spare: new Int32Array(N_SPACES) };
  if (free.length) {
    D = (DEFENCES[cfg.defence] ?? DEFENCES.plan)();
    A = cfg.attack === 'random' ? randomPlan(free, size, rng)
      : attackPlan(st.marks, me, them, D, free, gain, buckets, combos, plan, tail);
    shape = resolve(A, D, plan.step, gain, tail);
  }
  // The attack plans against an upper bound on the defenders it will face; this
  // is how many pairings that bound over-predicts, and so how much force the
  // attack wastes by being careful. If it were large the plans would not be worth
  // much under the stepping rule.
  const guess = estimate(A, D, free, plan);
  const predicted = free.reduce((n, i) => n + guess.pairs[i], 0);
  const actual = free.reduce((n, i) => n + shape.pairs[i], 0);
  return { me, them, free, base, gain, buckets, D, A, shape, size, overestimate: predicted - actual };
}

export function playRound(st, cfg, rng, tables, tally) {
  setPos(cfg.pos[((st.round + st.first) % 2) + 1]);
  const { me, them, free, base, gain, D, A, shape, size, overestimate } = allocate(st, cfg, rng, tables);
  const { pairs, spare } = shape;
  const p = skillOf(cfg, me);

  // The duels. Every pairing is the same coin unless we are playing them out.
  // With hands in play, which player stands where matters: each captain sends their
  // best to the squares worth most, so both sides deal their players out in strength
  // order against their own ranking of the squares.
  const order = free.slice().sort((x, y) => gain[y] - gain[x]);
  const sides = cfg.pool && st.roster
    ? { atk: assign(order, A, st.roster[me], cfg.pool), def: assign(order, D, st.roster[them], cfg.pool) }
    : null;
  // Filed by team number, so [1] is X and [2] is O whichever of them is attacking.
  const log = { won: [null, [], []], lost: [null, [], []] };

  const taken = [];
  let duels = 0, pivotal = 0, stake = 0;
  for (const i of free) {
    if (!A[i]) continue;
    let lost = 0;
    if (sides) lost = fight(i, pairs[i], sides, st.roster, me, them, cfg, rng, log);
    else for (let k = 0; k < pairs[i]; k++) if (!duel(cfg, rng, p)) lost++;
    duels += pairs[i];
    const won = pairs[i] - lost;
    const need = winsNeeded(A[i], pairs[i], spare[i]);
    if (won >= need) taken.push(i);
    stake += pairs[i] * stakePerDuel(A[i], pairs[i], spare[i], p);
    // A duel decided the square if turning it round would have turned the square
    // round: on the threshold every win was decisive, one short of it every loss
    // was. This is the number that says whether the game a player actually sat
    // down to play mattered.
    if (won === need) pivotal += won;
    else if (won === need - 1) pivotal += lost;
  }

  const { picks, value } = bestPicks(st.marks, me, them, taken, gain, base);
  if (picks.length) for (const i of picks) st.marks[i] = me;
  else if (STAR >= 0) st.marks[STAR] = me;

  // Placing nothing is a choice, not only what is left when nothing was won: the
  // star is the one square no attack can be aimed at, so a line needing it can only
  // ever be finished by declining a whole round's marks. Worth counting separately
  // from a round that simply took nothing.
  const flipped = !picks.length;
  const declined = flipped && taken.length > 0;
  const swept = fillBonus(st.marks, me, them, picks);
  const { lines, points, cleared } = scoreAndClear(st.marks, me, them);
  st.points[me] += points;

  // The trigger rule. Every one of these hands out the same thing -- one stone
  // replaced -- and differs only in who gets it, which is the whole question.
  let swaps = 0;
  if (st.roster && cfg.trigger !== 'none') {
    const give = (team, who) => {
      for (const k of who) { swap(st.roster[team], k, cfg.pool, rng, cfg.swap); swaps++; }
    };
    if (cfg.trigger === 'win') { give(me, log.won[1]); give(them, log.won[2]); }
    else if (cfg.trigger === 'lose') { give(me, log.lost[1]); give(them, log.lost[2]); }
    else if (cfg.trigger === 'unpaired') {
      // Whoever the other side did not engage: attackers with nobody to fight, and
      // defenders left standing. Neither team chose these players; the other team's
      // allocation did.
      give(me, sides ? sides.atk.idle.concat(unfought(sides.atk, A, pairs)) : []);
      give(them, sides ? sides.def.idle.concat(unfought(sides.def, D, pairs, spare)) : []);
    } else if (cfg.trigger === 'standout') {
      give(me, st.standout?.[me] ?? []);
      give(them, st.standout?.[them] ?? []);
    }
  }
  st.round++;

  if (tally) {
    const heldA = free.reduce((n, i) => n + A[i], 0);
    tally.rounds++;
    tally.marks += picks.length;
    tally.markHist[picks.length]++;
    tally.points += points;
    tally.teamPoints[me] += points;
    tally.seatPoints[me === st.first + 1 ? 0 : 1] += points;
    // What the round was worth to the attack, points plus the position it left.
    // Points alone are too coarse to see a defence in: a defence that cannot stop
    // a mark can still steer it somewhere that is not building anything.
    tally.value += value;
    tally.cleared += cleared;
    tally.lines += lines;
    tally.lineHist[Math.min(lines, 5)]++;
    tally.swept += swept;
    tally.stalled += free.length ? 0 : 1;
    tally.duels += duels;
    tally.pivotal += pivotal;
    tally.stake += stake;
    tally.unpaired += heldA - duels;
    tally.idle += size - duels;
    tally.contested += free.filter((i) => A[i] > 0).length;
    tally.taken += taken.length;
    tally.free += free.length;
    tally.flips += flipped ? 1 : 0;
    tally.declined += declined ? 1 : 0;
    tally.flipPoints += flipped ? points : 0;
    tally.starHeld += STAR >= 0 && st.marks[STAR] ? 1 : 0;
    tally.reinforced += cfg.step === 'none' ? 0
      : duels - free.reduce((n, i) => n + Math.min(A[i], D[i]), 0);
    tally.overestimate += overestimate;
    tally.swaps += swaps;
    if (st.roster) {
      // Where the two teams' hands have got to, and how far apart they are inside a
      // team -- the spread is what says whether a rule is pulling the field together
      // or driving it apart.
      for (const team of [1, 2]) {
        const ss = rosterStrength(st.roster[team], cfg.pool);
        const mean = ss.reduce((a, b) => a + b, 0) / ss.length;
        tally.handMean[team] += mean;
        tally.handSpread[team] += Math.sqrt(ss.reduce((a, s2) => a + (s2 - mean) ** 2, 0) / ss.length);
        tally.atTop[team] += ss.filter((s2) => s2 >= cfg.pool.strength[cfg.pool.top] - 1e-9).length / ss.length;
        tally.handKinds[team] += new Set(st.roster[team]).size / ss.length;
      }
    }
  }
  return { picks, points, duels, flipped };
}

// The duels on one square, attacker hands against defender hands. The defence chooses
// which attacker each of its players takes, so it pairs off the way that wins it the
// most games -- champion against champion, or its best against their weakest, whichever
// of the two comes out higher. Returns how many the attack lost, and files each player
// under won or lost for whichever trigger rule is in force.
function fight(i, pairs, sides, roster, me, them, cfg, rng, log) {
  const sa = (k) => cfg.pool.strength[roster[me][k]];
  const sd = (k) => cfg.pool.strength[roster[them][k]];
  const atk = (sides.atk.at.get(i) ?? []).slice(0, pairs).sort((x, y) => sa(y) - sa(x));
  const ranked = (sides.def.at.get(i) ?? []).slice(0, pairs).sort((x, y) => sd(y) - sd(x));
  const held = (line) => line.reduce((n, d, k) => n + (1 - duelChance(sa(atk[k]), sd(d))), 0);
  const flipped = ranked.slice().reverse();
  const def = held(ranked) >= held(flipped) ? ranked : flipped;

  let lost = 0;
  for (let k = 0; k < def.length; k++) {
    if (rng() < duelChance(sa(atk[k]), sd(def[k]))) {
      log.won[1].push(atk[k]);
      log.lost[2].push(def[k]);
    } else {
      lost++;
      log.won[2].push(def[k]);
      log.lost[1].push(atk[k]);
    }
  }
  return lost;
}

// Players standing on a square where their side brought more than could pair off. The
// assignment deals them out in order, so the ones past the pairing are the spare.
function unfought(side, counts, pairs, spare = null) {
  const out = [];
  for (const [i, players] of side.at) {
    const fought = spare ? Math.min(counts[i], pairs[i]) : pairs[i];
    for (let k = fought; k < players.length; k++) out.push(players[k]);
  }
  return out;
}

// A duel: true if the attacker won it. The coin is the default because the two
// teams are drawn from the same pool and the seat is decided at the table, so
// the attacker's share is a half by symmetry and no allocation can change it.
function duel(cfg, rng, p) {
  if (cfg.duels !== 'real') return rng() < p;
  const hands = [randomHand(rng), randomHand(rng)];
  const attackerOpens = rng() < 0.5;
  const r = playGame({
    opener: attackerOpens ? hands[0] : hands[1],
    replier: attackerOpens ? hands[1] : hands[0],
    itemO: cfg.item, seed: (rng() * 2 ** 31) | 0, iters: cfg.iters, i: 0, j: 1,
  });
  return (attackerOpens ? r.openerWon : 1 - r.openerWon) > 0.5;
}

const newTally = (cfg) => ({
  ...cfg,
  // The report is assembled in another thread, which may be looking at a different
  // board, so anything the shares are taken over has to travel with the tally.
  spaces: REGULAR.length, boards: SUBBOARDS.length,
  rounds: 0, marks: 0, markHist: Array.from({ length: SUBBOARDS.length + 1 }, () => 0), points: 0, teamPoints: [0, 0, 0], seatPoints: [0, 0], value: 0, cleared: 0, swept: 0, stalled: 0, lines: 0, lineHist: [0, 0, 0, 0, 0, 0],
  duels: 0, pivotal: 0, stake: 0, unpaired: 0, idle: 0, contested: 0, taken: 0, free: 0,
  flips: 0, declined: 0, flipPoints: 0, starHeld: 0, reinforced: 0, overestimate: 0,
  swaps: 0, handMean: [0, 0, 0], handSpread: [0, 0, 0], atTop: [0, 0, 0], handKinds: [0, 0, 0],
});

// What the attacking team should expect from a duel this round: its average hand
// against theirs. A team with better hands plans more boldly, which is most of how an
// advantage in hands turns into an advantage on the board.
function expectedChance(st, cfg, me, them) {
  const mean = (team) => st.roster[team]
    .reduce((n, h) => n + cfg.pool.strength[h], 0) / st.roster[team].length;
  return Math.min(0.95, Math.max(0.05, duelChance(mean(me), mean(them))));
}

// One take-table per team, since the two only differ when one team is better.
const tablesFor = (cfg) => [null, tailTable(skillOf(cfg, 1), cfg.size + 1), tailTable(skillOf(cfg, 2), cfg.size + 1)];

export function runConfig(cfg) {
  setLayout(cfg.layout);
  setRules(cfg);
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const tally = newTally(cfg);
  let started = 0;
  let st = newCampaign(0, cfg, rng);
  for (let r = 0; r < cfg.rounds; r++) {
    playRound(st, cfg, rng, tables, tally);
    // Long campaigns are one continuous board; --restart chops them into
    // separate ones, so that the opening rounds are not under-sampled, and
    // alternates the opening seat so that it cannot bias the totals.
    if (cfg.restart && st.round % cfg.restart === 0) st = newCampaign(++started % 2, cfg, rng);
  }
  return tally;
}

// Campaigns played to a finish rather than for a fixed number of rounds: how long
// a campaign takes, and -- when the two teams are not equally good -- how often
// the better one wins it. A team only scores in the rounds it attacks, so a race
// to a target is a race over half the rounds each.
export function runCampaigns(cfg) {
  setLayout(cfg.layout);
  setRules(cfg);
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const tally = { ...newTally(cfg), mode: 'campaigns', ran: 0, wonByX: 0, drawn: 0, length: 0 };
  for (let c = 0; c < cfg.campaigns; c++) {
    const st = newCampaign(c % 2, cfg, rng);
    while (Math.max(st.points[1], st.points[2]) < cfg.target && st.round < cfg.cap) {
      playRound(st, cfg, rng, tables, tally);
    }
    tally.ran++;
    tally.length += st.round;
    if (st.points[1] > st.points[2]) tally.wonByX++;
    else if (st.points[1] === st.points[2]) tally.drawn++;
  }
  return tally;
}

// ── Paired study ───────────────────────────────────────────────────────────
//
// Two variants measured across independent campaigns are hard to compare, because
// a change that concedes fewer marks also leaves a sparser board, and a sparser
// board scores at a different rate for reasons that have nothing to do with the
// change. So the variants are run against the same positions instead: every round
// of a reference campaign is handed to both, several times each, and what gets
// reported is the difference on the shared position. The reference campaign is
// advanced by the two variants alternately so that neither shapes the positions
// the other is measured on.

const PAIRS = {
  defence: (cfg) => [{ ...cfg, defence: 'plan' }, { ...cfg, defence: 'random' }],
  attack: (cfg) => [{ ...cfg, attack: 'plan' }, { ...cfg, attack: 'random' }],
  step: (cfg) => [{ ...cfg, step: 'forced' }, { ...cfg, step: 'none' }],
  optional: (cfg) => [{ ...cfg, step: 'optional' }, { ...cfg, step: 'none' }],
  forced: (cfg) => [{ ...cfg, step: 'optional' }, { ...cfg, step: 'forced' }],
};

function runPaired(cfg) {
  setLayout(cfg.layout);
  setRules(cfg);
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const variants = PAIRS[cfg.pair](cfg);
  const tallies = variants.map((v) => newTally(v));
  let started = 0;
  let st = newCampaign(0, cfg, rng);

  for (let r = 0; r < cfg.rounds; r++) {
    for (let s = 0; s < cfg.samples; s++) {
      const seed = (rng() * 2 ** 31) | 0;
      variants.forEach((v, k) => playRound(
        {
          marks: st.marks.slice(), round: st.round, first: st.first, points: [0, 0, 0],
          roster: st.roster?.map((r2) => r2?.slice()),
        },
        v, makeRng(seed), tables, tallies[k],
      ));
    }
    playRound(st, variants[r % variants.length], rng, tables, null);
    if (cfg.restart && st.round % cfg.restart === 0) st = newCampaign(++started % 2, cfg, rng);
  }
  return tallies;
}

function reportPaired(pairs) {
  const trio = (x, y, places) => {
    const d = x - y;
    return [x.toFixed(places), y.toFixed(places), (d >= 0 ? '+' : '') + d.toFixed(places)]
      .map((s) => pad(s, places + 5)).join('');
  };
  console.log(pad('size', 6) + ['marks', 'points', 'value', 'play%']
    .map((h, i) => pad(h, i === 3 ? 14 : i === 1 ? 24 : 21)).join(''));
  for (const [a, b] of pairs) {
    console.log(pad(a.size, 6) + trio(a.marks, b.marks, 2) + trio(a.points, b.points, 3)
      + trio(a.value, b.value, 2) + pct(a.playing) + ' ' + pct(b.playing));
  }
}

// ── Workers ────────────────────────────────────────────────────────────────

const dispatch = (c) => (c.pair ? runPaired(c) : c.target ? runCampaigns(c) : runConfig(c));

if (!isMainThread && workerData?.kind === 'campaign') {
  parentPort.postMessage(workerData.configs.map(dispatch));
}

function runConfigs(configs, workers) {
  const chunks = Array.from({ length: Math.min(workers, configs.length) }, () => []);
  configs.forEach((c, i) => chunks[i % chunks.length].push(c));
  return Promise.all(chunks.map((configs) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'campaign', configs } });
    w.on('message', resolve);
    w.on('error', reject);
  }))).then((r) => r.flat());
}

// ── Reporting ──────────────────────────────────────────────────────────────

const per = (x, n) => (n ? x / n : 0);

function row(t) {
  const r = t.rounds;
  return {
    size: t.size, step: t.step, layout: t.layout, clear: t.clear, fill: t.fill, score: t.score,
    defence: t.defence, attack: t.attack, skill: t.skill,
    rounds: r,
    marks: per(t.marks, r),
    points: per(t.points, r),
    value: per(t.value, r),
    flips: per(t.flips, r),
    duels: per(t.duels, r),
    // The share of each team that gets a game. Every duel occupies one attacker
    // and one defender, so the attackers left unpaired and the defenders left
    // idle are the same number and this one figure covers both.
    playing: per(t.duels, r * t.size),
    // Of the duels played, the share that decided the space they were played on.
    // Of the duels played, the share that turned out to decide the square, and the
    // share that had a chance of deciding it at the time they were sat down to. The
    // second is the one to quote at a player.
    pivotal: per(t.pivotal, t.duels),
    atStake: per(t.stake, t.duels),
    // And the one that puts the two together: the share of a team who played a
    // game whose result decided something. A player who is left standing idle and
    // a player whose duel was already moot come to the same thing at the table.
    decisive: per(t.pivotal, r * t.size),
    atStakeShare: per(t.stake, r * t.size),
    contested: per(t.contested, r),
    takeRate: per(t.taken, t.contested),
    occupancy: 1 - per(t.free, r * t.spaces),
    cleared: per(t.cleared, r),
    lines: per(t.lines, r),
    // How many rounds a mark survives. Marks arrive at `marks` a round and the board
    // carries `occupancy * spaces` of them, so by Little's law the ratio is the mean
    // life of one. It is the plainest measure of whether anything carries between
    // rounds: at one, a mark is gone before its team attacks again.
    life: per((1 - per(t.free, r * t.spaces)) * t.spaces, per(t.marks, r)),
    // Of the rounds that scored at all, the share that took more than one line --
    // which is the whole of what a squared score is trying to encourage.
    multi: per(t.lineHist.slice(2).reduce((a, b) => a + b, 0),
      t.lineHist.slice(1).reduce((a, b) => a + b, 0)),
    // How lumpy the scoring is: the share of all points that came from the rounds
    // taking three lines or more. A squared score concentrates a campaign into a few
    // rounds, and this is the number that says how few.
    lumpy: (() => {
      const worth = t.lineHist.map((c, k) => c
        * (t.score === 'square' ? k * k : t.score === 'triangle' ? (k * (k + 1)) / 2 : k));
      const all = worth.reduce((a, b) => a + b, 0);
      return all ? worth.slice(3).reduce((a, b) => a + b, 0) / all : 0;
    })(),
    swept: per(t.swept, r),
    stalled: per(t.stalled, r),
    flipRate: per(t.flips, r),
    declineRate: per(t.declined, r),
    flipPoints: per(t.flipPoints, t.flips),
    starHeld: per(t.starHeld, r),
    swaps: per(t.swaps, r),
    handMean: per(t.handMean[1] + t.handMean[2], 2 * r),
    handSpread: per(t.handSpread[1] + t.handSpread[2], 2 * r),
    atTop: per(t.atTop[1] + t.atTop[2], 2 * r),
    handKinds: per(t.handKinds[1] + t.handKinds[2], 2 * r),
    trigger: t.trigger, swapKind: t.swap,
    standout: Array.isArray(t.standout) ? t.standout.slice(1).join('/') : t.standout,
    reinforced: per(t.reinforced, r),
    overestimate: per(t.overestimate, r),
    boards: t.boards,
    // The share of rounds where every board claimed a square, and where two or more
    // came away with nothing. With four boards and with nine, those are the two ends
    // that say whether the defence is denying anything.
    allMarks: per(t.markHist[t.boards], r),
    shortBy2: per(t.markHist.slice(0, Math.max(1, t.boards - 1)).reduce((a, b) => a + b, 0), r),
    ran: t.mode === 'campaigns' ? t.ran : 0,
    wonByX: per(t.wonByX, t.ran),
    drawn: per(t.drawn, t.ran),
    length: per(t.length, t.ran),
    pointsX: per(t.teamPoints[1], r),
    pointsO: per(t.teamPoints[2], r),
    pointsFirst: per(t.seatPoints[0], r / 2),
    pointsSecond: per(t.seatPoints[1], r / 2),
  };
}

// Sum the repeats of each (size, stepping rule) back into one tally.
function group(tallies) {
  const byKey = new Map();
  for (const t of tallies) {
    const k = `${t.size}|${t.step}|${t.layout}|${t.clear}|${t.score}|${t.trigger}|${t.defence}`;
    if (!byKey.has(k)) { byKey.set(k, { ...t }); continue; }
    const into = byKey.get(k);
    for (const [f, v] of Object.entries(t)) {
      const constant = ['size', 'p', 'skill', 'seed', 'rep', 'rounds', 'spaces', 'boards'];
      if (typeof v === 'number' && typeof into[f] === 'number' && !constant.includes(f)) into[f] += v;
      else if (Array.isArray(v) && Array.isArray(into[f])) into[f] = into[f].map((x, i) => x + v[i]);
    }
    into.rounds += t.rounds;
  }
  return [...byKey.values()];
}

function report(rows) {
  const campaigns = rows.some((r) => r.ran);
  const head = campaigns
    ? ['size', 'trigger', 'marks', 'pts/r', 'duels', 'play%', 'stake%', 'decis%', 'occ%',
      'life', 'swaps', 'hand', 'spread', 'attop%', 'kinds%', 'X win%', 'draw%', 'length']
    : ['size', 'trigger', 'marks', 'pts/r', 'duels', 'play%', 'stake%', 'decis%', 'occ%',
      'life', 'swaps', 'hand', 'spread', 'attop%', 'kinds%', 'mk/max', 'allmk%', 'short%'];
  console.log(head.map((h) => pad(h, h.length > 5 ? 8 : 6)).join(''));
  for (const r of rows) {
    console.log([
      pad(r.size, 6), pad((r.trigger ?? 'off') + (r.trigger === 'standout' ? `:${r.standout}` : ''), 9),
      pad(r.marks.toFixed(2), 6), pad(r.points.toFixed(3), 6),
      pad(r.duels.toFixed(1), 6), pct(r.playing) + ' ',
      pct(r.atStake) + '  ',
      pct(r.decisive ?? (r.duels * r.pivotal) / r.size) + '  ',
      pct(r.occupancy) + ' ', pad(r.life.toFixed(1), 6),
      pad(r.swaps.toFixed(1), 6), pad(r.handMean.toFixed(2), 6), pad(r.handSpread.toFixed(2), 6),
      pct(r.atTop) + '  ', pct(r.handKinds) + '  ',
      ...(campaigns
        ? [pad(pct(r.wonByX), 8), pad(pct(r.drawn), 8), pad(r.length.toFixed(1), 8)]
        : [pad(`${r.marks.toFixed(1)}/${r.boards}`, 8), pad(pct(r.allMarks), 8), pad(pct(r.shortBy2), 8)]),
    ].join(''));
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

function sizes(spec) {
  return spec.split(',').flatMap((part) => {
    const [a, b, step] = part.split(/[-:]/).map(Number);
    if (b === undefined) return [a];
    const out = [];
    for (let n = a; n <= b; n += step || 1) out.push(n);
    return out;
  });
}

async function main() {
  const opts = {
    sizes: sizes(arg('sizes', arg('size', '10-30'))),
    rounds: parseInt(arg('rounds', '600'), 10),
    restart: parseInt(arg('restart', '60'), 10),
    // [ , X's weights, O's weights ]; --posB pits a candidate against the default.
    pos: [null,
      arg('posA', '0.03,0.12,1').split(',').map(Number),
      (arg('posB', null) ?? arg('posA', '0.03,0.12,1')).split(',').map(Number)],
    skill: parseFloat(arg('skill', '0.5')),      // X's chance in a duel against O
    target: parseInt(arg('target', '0'), 10),    // points that finish a campaign
    campaigns: parseInt(arg('campaigns', '400'), 10),
    cap: parseInt(arg('cap', '4000'), 10),       // a campaign that will not finish
    targets: parseInt(arg('targets', '14'), 10),
    defence: arg('defence', 'plan'),
    attack: arg('attack', 'plan'),
    duels: arg('duels', 'coin'),
    pair: arg('pair', null),          // defence | attack | step | optional | forced
    samples: parseInt(arg('samples', '6'), 10),  // resolutions of each shared position
    item: arg('item', 'mirror'),
    iters: parseInt(arg('iters', '120'), 10),
    seed: parseInt(arg('seed', '20260811'), 10),
    reps: parseInt(arg('reps', '1'), 10),   // independent runs per size, summed
    layouts: arg('layouts', arg('layout', 'pinwheel')).split(','),
    scores: arg('scores', arg('score', 'linear')).split(','),
    triggers: arg('triggers', arg('trigger', 'none')).split(','),
    swap: arg('swap', 'choose'),                  // choose | random
    standout: parseFloat(arg('standout', '0.2')), // share of a team sent to train
    handsFile: arg('hands-file', 'results/hands.json'),
    clears: arg('clears', arg('clear', 'boards')).split(','),
    fill: process.argv.includes('--fill'),
    steps: arg('steps', arg('step', 'forced')).split(','),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    out: arg('out', null),
  };

  if (process.argv.includes('--report')) {
    const saved = JSON.parse(readFileSync(opts.out, 'utf8'));
    saved.opts.pair ? reportPaired(saved.rows) : report(saved.rows);
    return;
  }

  // Allocating a whole number of players over a whole number of squares is lumpy,
  // and one run of one size can land on a shape that is not typical of its
  // neighbours. --reps runs each size from several seeds and sums them.
  // The hand table is loaded once and shared; without a trigger there are no hands at
  // all and the duel is the coin it has been all along.
  const pool = opts.triggers.some((t) => t !== 'off') ? loadHands(opts.handsFile) : null;

  const configs = opts.triggers.flatMap((trigger, ti) => opts.scores.flatMap((score, xi) => opts.clears.flatMap((clear, ci) =>
    opts.layouts.flatMap((layout, li) => opts.steps.flatMap((step, si) =>
      opts.sizes.flatMap((size, k) => Array.from({ length: opts.reps }, (_, rep) => ({
        ...opts, size, step, layout, clear, score, trigger, rep,
        pool: trigger === 'off' ? null : pool,
        sizes: undefined, steps: undefined, layouts: undefined, clears: undefined,
        scores: undefined, triggers: undefined,
        seed: opts.seed + 1000 * k + 97 * rep + 7 * si + 13 * li + 31 * ci + 53 * xi + 71 * ti,
      }))))))));

  const started = Date.now();
  const tallies = opts.workers > 1 && configs.length > 1
    ? await runConfigs(configs, opts.workers) : configs.map(dispatch);

  const rows = opts.pair
    ? group(tallies.map((p) => p[0])).map(row)
      .map((a, i) => [a, group(tallies.map((p) => p[1])).map(row)[i]])
      .sort((a, b) => a[0].size - b[0].size)
    : group(tallies).map(row).sort((a, b) => a.layout.localeCompare(b.layout)
      || a.clear.localeCompare(b.clear) || a.score.localeCompare(b.score)
      || String(a.trigger).localeCompare(String(b.trigger)) || (a.size - b.size));
  opts.pair ? reportPaired(rows) : report(rows);
  console.log(`\n${configs.length} configs, ${opts.rounds} rounds each, ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ opts, rows }, null, 2));
    console.log(`wrote ${opts.out}`);
  }
}

export {
  tailTable, winsNeeded, takeChance, stakePerDuel, resolve, posValue, scoreAndClear,
  placementValue, bestPicks,
  fillBonus,
  combinations, attackPlan, defencePlan, boardBuckets, LADDER,
};

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
