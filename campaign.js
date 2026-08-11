// The campaign: two teams, thirty-three spaces, and a duel on every pairing.
//
//   node campaign.js --sizes 10-30 --rounds 800 --reps 3 --both --out results/sizes.json
//   node campaign.js --pair defence --sizes 10,20,30 --rounds 500    # what defence is worth
//   node campaign.js --pair ortho --sizes 10,20,30 --rounds 500      # what the step is worth
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
  ADJACENT, BOARD_SPACES, CORNERS, LINES, LINE_CLEARS, N_SPACES, REGULAR,
  SPACES, SPACE_BOARDS, STAR, SUBBOARDS, render,
} from './board.js';
import { makeRng } from './ai.js';
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
export const setPos = ([one, two]) => { POS = [0, one, two]; };

// Positional value of a board to `me`, net of what the same board is worth to
// them. Zero-sum by construction, so the defence can use the attack's numbers.
function posValue(b, me, them) {
  let v = 0;
  for (const line of LINES) {
    let mine = 0, theirs = 0;
    for (const j of line) { if (b[j] === me) mine++; else if (b[j] === them) theirs++; }
    if (!theirs) v += POS[mine];
    if (!mine) v -= POS[theirs];
  }
  return v;
}

// Lines of `me` on the board, and everything a scored line takes with it.
function scoreAndClear(b, me) {
  let points = 0, cleared = null;
  LINES.forEach((line, li) => {
    if (line.every((j) => b[j] === me)) {
      points++;
      cleared ??= new Set();
      for (const j of LINE_CLEARS[li]) cleared.add(j);
    }
  });
  if (cleared) for (const j of cleared) b[j] = 0;
  return { points, cleared: cleared ? cleared.size : 0 };
}

// What placing this set of marks (or, for the empty set, flipping the star) is
// worth: the points it scores now plus the position it leaves, after the clear
// that scoring triggers. Scoring costs you the ground you scored from, so this
// is the number that has to decide it rather than the points alone.
function placementValue(marks, me, them, picks, base) {
  const b = marks.slice();
  if (picks.length) for (const i of picks) b[i] = me;
  else b[STAR] = me;
  const { points } = scoreAndClear(b, me);
  return points + posValue(b, me, them) - base;
}

// ── Pairing ────────────────────────────────────────────────────────────────
//
// On each space the defenders there pair off against the attackers there. Which
// attacker a defender takes is the defender's choice, and since every duel is
// the same coin it does not matter here; how many pair does.
//
// With `ortho` on, a defender left with nobody to fight steps to an orthogonally
// adjacent space where the attackers hold the majority and pairs there instead.
// That is not optional -- a defender may only stand idle if there is no unpaired
// attacker within reach -- so what it works out to is the largest number of
// extra pairings the adjacency allows, which is a max-flow from the spaces with
// spare defenders to the spaces with spare attackers.

function pairing(A, D, ortho) {
  const pairs = new Int32Array(N_SPACES);
  for (const i of REGULAR) pairs[i] = Math.min(A[i], D[i]);
  if (!ortho) return pairs;

  const surplus = [], need = [];
  for (const i of REGULAR) {
    if (D[i] > A[i]) surplus.push(i);
    else if (A[i] > D[i]) need.push(i);   // the attackers' majority
  }
  if (!surplus.length || !need.length) return pairs;

  const flow = maxFlow(
    surplus.map((i) => D[i] - A[i]),
    need.map((i) => A[i] - D[i]),
    surplus.map((i) => need.map((j, k) => (ADJACENT[i].includes(j) ? k : -1)).filter((k) => k >= 0)),
  );
  need.forEach((j, k) => { pairs[j] += flow[k]; });
  return pairs;
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
// The attackers take a space when their won duels plus their unpaired players
// come to more than half of the attackers standing there. Which is to say: when
// fewer than half of the attackers on the space lost a duel. Piling on is
// therefore free against an undefended space and against a thin one, and dear
// against a thick one, because every extra attacker who has someone to fight is
// another chance to lose.

const takeThreshold = (a) => Math.ceil(a / 2) - 1;   // losses may not exceed this

// takeP[a][k]: the chance a attackers with k of them paired hold the space.
function takeTable(p, max) {
  const q = 1 - p;
  const table = [];
  for (let a = 0; a <= max; a++) {
    const row = new Float64Array(max + 1);
    const limit = takeThreshold(a);
    for (let k = 0; k <= max; k++) {
      let acc = 0, term = Math.pow(p, k);          // no losses
      for (let l = 0; l <= Math.min(k, limit); l++) {
        acc += term;
        term *= (q / p) * (k - l) / (l + 1);
      }
      row[k] = a === 0 ? 0 : Math.min(1, acc);
    }
    table.push(row);
  }
  return table;
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

// Can these squares be claimed for different boards? A corner belongs to two, so
// it is a small matching; three squares at most, so it is done by trying them.
function claimable(spaces, used = []) {
  if (!spaces.length) return true;
  return SPACE_BOARDS[spaces[0]].some((b) =>
    !used.includes(b) && claimable(spaces.slice(1), [...used, b]));
}

// Expected value of an allocation: independently per space, the chance of taking
// it; then per board, the expected best gain among the ones taken, plus what the
// combinations add when a whole set comes off.
function planValue(A, pairs, buckets, gain, takeP, combos) {
  let v = 0;
  for (const bucket of buckets) {
    let miss = 1;
    for (const i of bucket) {
      if (!A[i]) continue;
      const q = takeP[A[i]][pairs[i]];
      v += gain[i] * q * miss;
      miss *= 1 - q;
      if (miss < 1e-4) break;
    }
  }
  for (const { gaps, surplus } of combos) {
    let all = surplus;
    for (const j of gaps) all *= A[j] ? takeP[A[j]][pairs[j]] : 0;
    v += all;
  }
  return v;
}

// How many defenders the attack should expect to face on a space: the ones
// standing there, plus -- with the stepping rule -- every spare defender next
// door. That over-counts when two needy spaces share a neighbour, which makes it
// the pessimistic estimate rather than the wrong one; the round itself is
// resolved by the exact flow.
function facing(A, D, i, ortho) {
  if (!ortho) return D[i];
  let d = D[i];
  for (const j of ADJACENT[i]) if (D[j] > A[j]) d += D[j] - A[j];
  return d;
}

// An even number of attackers is never worth more than one fewer. Both need the
// same number of losses to stay under half the force, and the even one has one
// more duel to lose it in, so the useful force levels on a space are the odd
// numbers -- one, three, five -- up to 2d+1, which is where the space is taken
// no matter how the duels go. That is what makes the value of a space a staircase
// in the force on it, with the flat treads that defeat a one-at-a-time greedy:
// against a single defender the second attacker buys nothing and the third buys
// certainty. So the search buys whole steps, and takes the one with the best
// value per player each time round.
// The odd numbers, thinning out where the difference between neighbouring steps
// stops mattering. Ten rungs is enough to describe any force a team of thirty can
// bring, and the search is over candidates times rungs.
const LADDER = [1, 3, 5, 7, 9, 11, 13, 17, 21, 25, 29];

function attackPlan(marks, me, them, D, free, gain, buckets, combos, cfg, takeP) {
  const A = new Int32Array(N_SPACES);
  const pairs = new Int32Array(N_SPACES);
  const candidates = free.filter((i) => gain[i] > 0).sort((a, b) => gain[b] - gain[a]).slice(0, cfg.targets);

  // Under the stepping rule what a space faces depends on the force next door,
  // so a change at i is repaired at i and at everything adjacent to it.
  const repair = (i) => {
    pairs[i] = Math.min(A[i], facing(A, D, i, cfg.ortho));
    if (cfg.ortho) for (const j of ADJACENT[i]) pairs[j] = Math.min(A[j], facing(A, D, j, cfg.ortho));
  };
  for (const i of free) repair(i);

  let spent = 0, value = 0;
  for (;;) {
    let best = null, bestRatio = 1e-9;
    for (const i of candidates) {
      const from = A[i], ceiling = 2 * facing(A, D, i, cfg.ortho) + 1;
      for (const a of LADDER) {
        if (a <= from || a - from > cfg.size - spent) continue;
        A[i] = a; repair(i);
        const ratio = (planValue(A, pairs, buckets, gain, takeP, combos) - value) / (a - from);
        if (ratio > bestRatio) { bestRatio = ratio; best = { i, a }; }
        if (a >= ceiling) break;                            // nothing above this buys anything
      }
      A[i] = from; repair(i);
    }
    if (!best) break;
    spent += best.a - A[best.i];
    A[best.i] = best.a; repair(best.i);
    value = planValue(A, pairs, buckets, gain, takeP, combos);
  }

  // Everyone has to stand somewhere, and an extra attacker on a space that is
  // already certain cannot spoil it -- the threshold rises as fast as the duels
  // do. So the leftovers go there, or failing that to the thinnest space.
  if (spent < cfg.size) {
    const safe = free.filter((i) => A[i] > 0 && A[i] >= 2 * facing(A, D, i, cfg.ortho) + 1);
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
function defenceCandidates(free, gain, buckets, size) {
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
  return out;
}

function defencePlan(marks, me, them, free, gain, buckets, combos, cfg, takeP) {
  let best = null, bestValue = Infinity;
  for (const D of defenceCandidates(free, gain, buckets, cfg.size)) {
    const A = attackPlan(marks, me, them, D, free, gain, buckets, combos, cfg, takeP);
    const v = planValue(A, pairing(A, D, cfg.ortho), buckets, gain, takeP, combos);
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
// then does not get to re-plan against. It is not a legal way to play -- the
// order of the phases is the other way round -- and it is here as a ceiling: a
// space is best denied by matching its attackers one for one, so this is very
// close to the most any allocation of this many defenders could do. If the
// attack still gets its marks against this, no defence was ever going to stop it.
function oraclePlan(marks, me, them, free, gain, buckets, combos, cfg, takeP) {
  const A = attackPlan(marks, me, them, new Int32Array(N_SPACES), free, gain, buckets, combos, cfg, takeP);
  const D = new Int32Array(N_SPACES);
  let left = cfg.size;
  for (const i of free.filter((i) => A[i]).sort((a, b) => gain[b] - gain[a])) {
    const take = Math.min(left, A[i]);
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
  const buckets = SUBBOARDS
    .map((b) => taken.filter((i) => SPACE_BOARDS[i].includes(b)).sort((x, y) => gain[y] - gain[x]))
    .map((b) => [0, ...b.slice(0, 4)]);
  let best = [], bestValue = placementValue(marks, me, them, [], base);   // flip the star

  const walk = (k, picks) => {
    if (k === buckets.length) {
      if (!picks.length) return;
      const set = [...new Set(picks)];
      const v = placementValue(marks, me, them, set, base);
      if (v > bestValue) { bestValue = v; best = set; }
      return;
    }
    for (const i of buckets[k]) walk(k + 1, i ? [...picks, i] : picks);
  };
  walk(0, []);
  return { picks: best, value: bestValue };
}

// ── A round ────────────────────────────────────────────────────────────────

// `first` is which team attacks in round 0. It matters: the team that attacks
// first is always the team with more marks on the board when the other one scores,
// and a scored line clears whole boards, so attacking first means having more to
// lose to it. Campaigns are therefore run half from each seat.
export function newCampaign(first = 0) {
  return { marks: new Uint8Array(N_SPACES), round: 0, first, points: [0, 0, 0] };
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
  const takeP = tables[me];
  const free = REGULAR.filter((i) => !st.marks[i]);
  const base = posValue(st.marks, me, them);

  const gain = new Float64Array(N_SPACES);
  for (const i of free) gain[i] = placementValue(st.marks, me, them, [i], base);
  const buckets = boardBuckets(free, gain);
  const combos = combinations(st.marks, me, them, free, gain, base);

  const DEFENCES = {
    random: () => randomPlan(free, cfg.size, rng),
    oracle: () => oraclePlan(st.marks, me, them, free, gain, buckets, combos, cfg, takeP),
    plan: () => defencePlan(st.marks, me, them, free, gain, buckets, combos, cfg, takeP),
  };

  let A = new Int32Array(N_SPACES), D = new Int32Array(N_SPACES), pairs = D;
  if (free.length) {
    D = (DEFENCES[cfg.defence] ?? DEFENCES.plan)();
    A = cfg.attack === 'random' ? randomPlan(free, cfg.size, rng)
      : attackPlan(st.marks, me, them, D, free, gain, buckets, combos, cfg, takeP);
    pairs = pairing(A, D, cfg.ortho);
  }
  // The attack plans against an upper bound on the defenders it will face; this
  // is how many pairings that bound over-predicts, and so how much force the
  // attack wastes by being careful. If it were large the plans would not be worth
  // much under the stepping rule.
  const predicted = free.reduce((n, i) => n + Math.min(A[i], facing(A, D, i, cfg.ortho)), 0);
  const actual = free.reduce((n, i) => n + pairs[i], 0);
  return { me, them, free, base, gain, buckets, D, A, pairs, overestimate: predicted - actual };
}

export function playRound(st, cfg, rng, tables, tally) {
  setPos(cfg.pos[((st.round + st.first) % 2) + 1]);
  const { me, them, free, base, gain, D, A, pairs, overestimate } = allocate(st, cfg, rng, tables);
  const p = skillOf(cfg, me);

  // The duels. Every pairing is the same coin unless we are playing them out.
  const taken = [];
  let duels = 0, pivotal = 0;
  for (const i of free) {
    if (!A[i]) continue;
    let lost = 0;
    for (let k = 0; k < pairs[i]; k++) if (!duel(cfg, rng, p)) lost++;
    duels += pairs[i];
    const limit = takeThreshold(A[i]);
    if (lost <= limit) taken.push(i);
    // A duel decided the space if turning it round would have turned the space
    // round: with the losses one shy of the limit every win was decisive, and with
    // them one over it every loss was. This is the number that says whether the
    // game a player actually sat down to play mattered.
    if (lost === limit) pivotal += pairs[i] - lost;
    else if (lost === limit + 1) pivotal += lost;
  }

  const { picks, value } = bestPicks(st.marks, me, them, taken, gain, base);
  if (picks.length) for (const i of picks) st.marks[i] = me;
  else st.marks[STAR] = me;

  const flipped = !picks.length;
  const { points, cleared } = scoreAndClear(st.marks, me);
  st.points[me] += points;
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
    tally.duels += duels;
    tally.pivotal += pivotal;
    tally.unpaired += heldA - duels;
    tally.idle += cfg.size - duels;
    tally.contested += free.filter((i) => A[i] > 0).length;
    tally.taken += taken.length;
    tally.free += free.length;
    tally.flips += picks.length ? 0 : 1;
    tally.reinforced += cfg.ortho
      ? duels - free.reduce((n, i) => n + Math.min(A[i], D[i]), 0) : 0;
    tally.overestimate += overestimate;
  }
  return { picks, points, duels, flipped };
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
  ...cfg, rounds: 0, marks: 0, markHist: [0, 0, 0, 0, 0], points: 0, teamPoints: [0, 0, 0], seatPoints: [0, 0], value: 0, cleared: 0,
  duels: 0, pivotal: 0, unpaired: 0, idle: 0, contested: 0, taken: 0, free: 0, flips: 0,
  reinforced: 0, overestimate: 0,
});

// One take-table per team, since the two only differ when one team is better.
const tablesFor = (cfg) => [null, takeTable(skillOf(cfg, 1), cfg.size + 1), takeTable(skillOf(cfg, 2), cfg.size + 1)];

export function runConfig(cfg) {
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const tally = newTally(cfg);
  let started = 0;
  let st = newCampaign(0);
  for (let r = 0; r < cfg.rounds; r++) {
    playRound(st, cfg, rng, tables, tally);
    // Long campaigns are one continuous board; --restart chops them into
    // separate ones, so that the opening rounds are not under-sampled, and
    // alternates the opening seat so that it cannot bias the totals.
    if (cfg.restart && st.round % cfg.restart === 0) st = newCampaign(++started % 2);
  }
  return tally;
}

// Campaigns played to a finish rather than for a fixed number of rounds: how long
// a campaign takes, and -- when the two teams are not equally good -- how often
// the better one wins it. A team only scores in the rounds it attacks, so a race
// to a target is a race over half the rounds each.
export function runCampaigns(cfg) {
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const tally = { ...newTally(cfg), mode: 'campaigns', ran: 0, wonByX: 0, drawn: 0, length: 0 };
  for (let c = 0; c < cfg.campaigns; c++) {
    const st = newCampaign(c % 2);
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
  ortho: (cfg) => [{ ...cfg, ortho: true }, { ...cfg, ortho: false }],
};

function runPaired(cfg) {
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const variants = PAIRS[cfg.pair](cfg);
  const tallies = variants.map((v) => newTally(v));
  let started = 0;
  let st = newCampaign(0);

  for (let r = 0; r < cfg.rounds; r++) {
    for (let s = 0; s < cfg.samples; s++) {
      const seed = (rng() * 2 ** 31) | 0;
      variants.forEach((v, k) => playRound(
        { marks: st.marks.slice(), round: st.round, first: st.first, points: [0, 0, 0] },
        v, makeRng(seed), tables, tallies[k],
      ));
    }
    playRound(st, variants[r % variants.length], rng, tables, null);
    if (cfg.restart && st.round % cfg.restart === 0) st = newCampaign(++started % 2);
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
    size: t.size, ortho: t.ortho, defence: t.defence, attack: t.attack, p: t.p,
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
    pivotal: per(t.pivotal, t.duels),
    // And the one that puts the two together: the share of a team who played a
    // game whose result decided something. A player who is left standing idle and
    // a player whose duel was already moot come to the same thing at the table.
    decisive: per(t.pivotal, r * t.size),
    contested: per(t.contested, r),
    takeRate: per(t.taken, t.contested),
    occupancy: 1 - per(t.free, r * REGULAR.length),
    cleared: per(t.cleared, r),
    reinforced: per(t.reinforced, r),
    overestimate: per(t.overestimate, r),
    markHist: t.markHist.map((n) => per(n, r)),
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
    const k = `${t.size}|${t.ortho}|${t.defence}`;
    if (!byKey.has(k)) { byKey.set(k, { ...t }); continue; }
    const into = byKey.get(k);
    for (const [f, v] of Object.entries(t)) {
      if (typeof v === 'number' && typeof into[f] === 'number' && !['size', 'p', 'skill', 'seed', 'rep', 'rounds'].includes(f)) into[f] += v;
      else if (Array.isArray(v) && Array.isArray(into[f])) into[f] = into[f].map((x, i) => x + v[i]);
    }
    into.rounds += t.rounds;
  }
  return [...byKey.values()];
}

function report(rows) {
  const campaigns = rows.some((r) => r.ran);
  const head = ['size', 'orth', 'def', 'marks', 'pts/r', 'duels', 'play%', 'pivot%', 'decis%', 'take%', 'occ%',
    ...(campaigns ? ['X win%', 'draw%', 'length'] : ['0mk%', '1mk%', '2mk%', '3mk%', '4mk%'])];
  console.log(head.map((h) => pad(h, h.length > 5 ? 8 : 6)).join(''));
  for (const r of rows) {
    console.log([
      pad(r.size, 6), pad(r.ortho ? 'yes' : 'no', 6), pad(r.defence.slice(0, 4), 6),
      pad(r.marks.toFixed(2), 6), pad(r.points.toFixed(3), 6),
      pad(r.duels.toFixed(1), 6), pct(r.playing) + ' ', pct(r.pivotal) + '  ',
      pct(r.decisive ?? (r.duels * r.pivotal) / r.size) + '  ',
      pct(r.takeRate) + ' ', pct(r.occupancy) + ' ',
      ...(campaigns
        ? [pad(pct(r.wonByX), 8), pad(pct(r.drawn), 8), pad(r.length.toFixed(1), 8)]
        : r.markHist.map((x) => pct(x) + ' ')),
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
      arg('posA', '0.03,0.12').split(',').map(Number),
      (arg('posB', null) ?? arg('posA', '0.03,0.12')).split(',').map(Number)],
    skill: parseFloat(arg('skill', '0.5')),      // X's chance in a duel against O
    target: parseInt(arg('target', '0'), 10),    // points that finish a campaign
    campaigns: parseInt(arg('campaigns', '400'), 10),
    cap: parseInt(arg('cap', '4000'), 10),       // a campaign that will not finish
    targets: parseInt(arg('targets', '14'), 10),
    defence: arg('defence', 'plan'),
    attack: arg('attack', 'plan'),
    duels: arg('duels', 'coin'),
    pair: arg('pair', null),                     // defence | attack | ortho
    samples: parseInt(arg('samples', '6'), 10),  // resolutions of each shared position
    item: arg('item', 'mirror'),
    iters: parseInt(arg('iters', '120'), 10),
    seed: parseInt(arg('seed', '20260811'), 10),
    reps: parseInt(arg('reps', '1'), 10),   // independent runs per size, summed
    both: process.argv.includes('--both'),
    ortho: process.argv.includes('--ortho'),
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
  const orthos = opts.both ? [false, true] : [opts.ortho];
  const configs = orthos.flatMap((ortho) => opts.sizes.flatMap((size, k) =>
    Array.from({ length: opts.reps }, (_, rep) => ({
      ...opts, size, ortho, rep, sizes: undefined,
      seed: opts.seed + 1000 * k + 97 * rep + (ortho ? 7 : 0),
    }))));

  const started = Date.now();
  const tallies = opts.workers > 1 && configs.length > 1
    ? await runConfigs(configs, opts.workers) : configs.map(dispatch);

  const rows = opts.pair
    ? group(tallies.map((p) => p[0])).map(row)
      .map((a, i) => [a, group(tallies.map((p) => p[1])).map(row)[i]])
      .sort((a, b) => a[0].size - b[0].size)
    : group(tallies).map(row).sort((a, b) => (a.ortho - b.ortho) || (a.size - b.size));
  opts.pair ? reportPaired(rows) : report(rows);
  console.log(`\n${configs.length} configs, ${opts.rounds} rounds each, ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ opts, rows }, null, 2));
    console.log(`wrote ${opts.out}`);
  }
}

export {
  takeTable, takeThreshold, pairing, posValue, scoreAndClear, placementValue, bestPicks,
  combinations, claimable, attackPlan, defencePlan, boardBuckets, render, LADDER,
};

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
