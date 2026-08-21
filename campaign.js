// The campaign: two teams, one arena, and a duel on every pairing.
//
//   node campaign.js --sizes 10-30 --rounds 800 --reps 3
//   node campaign.js --arenas small,big --sizes 12,30 --rounds 600
//   node campaign.js --economy --sizes 12 --rounds 720        # what a campaign leaves players
//   node campaign.js --economy --swap-cost 2,3,4 --card-cost 2,3,4   # what the prices should be
//   node campaign.js --pair defence --sizes 12 --rounds 500   # what a defensive plan is worth
//   node campaign.js --sizes 12 --defence oracle              # the defence's ceiling
//   node campaign.js --sizes 12 --rounds 200 --duels real     # every pairing played out
//   node campaign.js --sizes 12 --target 40 --campaigns 200   # how long a campaign runs
//   node campaign.js --teams --sizes 12 --short 1 --short-marks 0   # an uneven turnout, unpaid
//   node campaign.js --teams --sizes 12 --short 1 --short-marks 3,4,5 --target 40  # its price
//   node campaign.js --teams --sizes 12 --short 1 --bench --target 40   # or even the numbers
//   node campaign.js --report --out results/sizes.json
//
// A round is a Blotto game with a duel as its coin. The defence commits first and the
// attack answers it knowing everything, so the attack is never guessing and the defence
// can never bluff -- which is why both sides here play pure strategies and neither
// randomises. The defence picks the allocation whose best answer is worst; the attack
// plays that best answer. The one decision the defence makes after seeing the attack is
// the step, in `resolve`.
//
// Duels are settled from the hand table -- a Bradley-Terry strength per hand per veto,
// fitted by hands.js -- shifted by the attacker's edge, since the campaign's attacker is
// the duel's first player. `--duels real` plays every pairing out through engine.js
// instead, and exists to check that the table is not hiding anything.
//
// Rule variants are gone: this file plays the rules in RULES.md and nothing else. What
// remains switchable is who is playing them -- a defence or attack that scatters at
// random, and a defence that has already seen the attack -- which is how the numbers in
// adr/ were measured.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ADJACENT, HEIGHT, LINES, LINE_ZONES, N_SPACES, SIZES, SPACES, SPACE_IDS, SPACE_ZONE,
  VETO, WIDTH, ZONES, ZONE_SPACES, claimable, render, setArena,
} from './arena.js';
import { makeRng } from './ai.js';
import {
  assign, duelChance, loadHands, meanByVeto, newRoster, rosterStrength, strengthAt,
  swapTarget,
} from './roster.js';
import { arg, pad, pct, playGame } from './sim.js';

// ── What a position is worth ────────────────────────────────────────────────

// A line with two of my symbols and none of theirs is worth a lot, because the
// defence has no way to block it: defenders never place a symbol, so the only
// answer to a threat is to keep winning the fight for the space it needs. A
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
// The fourth entry is a line already complete, which normal play never shows this
// function -- a line is scored and cleared the moment it is made. A pre-seeded opening
// position can contain one, though, and without the entry the lookup is undefined and
// every value downstream becomes NaN. It is priced at a point, which is what it is worth.
let POS = [0, 0.03, 0.12, 1];

export const setPos = ([one, two]) => { POS = [0, one, two, 1]; };

// Positional value of an arena to `me`, net of what the same arena is worth to them.
// Zero-sum by construction, so the defence can use the attack's numbers.
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

// n lines in one round are worth n squared -- 1, 4, 9, 16 -- which turns the round from
// a question of whether you can score into one of how much you can hold and fire at
// once.
const SCORE = (n) => n * n;

// A scored line clears one of the zones its three symbols stood on, and the attack
// picks: the zone that costs it least and the other team most, counted in symbols.
function pickZone(b, li, me, them) {
  let best = null, bestGain = -Infinity;
  for (const zone of LINE_ZONES[li]) {
    let gain = 0;
    for (const j of ZONE_SPACES[zone]) gain += b[j] === them ? 1 : b[j] === me ? -1 : 0;
    if (gain > bestGain) { bestGain = gain; best = zone; }
  }
  return best;
}

// Lines of `me` on the arena, and the zone each one takes with it.
function scoreAndClear(b, me, them = 3 - me) {
  let lines = 0, cleared = null;
  LINES.forEach((line, li) => {
    if (!line.every((j) => b[j] === me)) return;
    lines++;
    for (const j of ZONE_SPACES[pickZone(b, li, me, them)]) (cleared ??= new Set()).add(j);
  });
  if (cleared) for (const j of cleared) b[j] = 0;
  return { lines, points: SCORE(lines), cleared: cleared ? cleared.size : 0 };
}

// What placing this set of marks is worth: the points it scores now plus the position
// it leaves, after the clear that scoring triggers. Scoring costs you the ground you
// scored from, so this is the number that has to decide it rather than the points alone.
function placementValue(marks, me, them, picks, base) {
  const b = marks.slice();
  for (const i of picks) b[i] = me;
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
//   none      -- stand there. A defender covers the space they are on.
//   forced    -- step to an orthogonally adjacent space where the attackers
//                outnumber the defenders, and pair with an attacker there. Not
//                optional: a defender may stand idle only when no unpaired
//                attacker is within reach, so it comes to the largest number of
//                extra pairings the adjacency allows -- a max-flow from the
//                spaces with spare defenders to the spaces with spare attackers.
//   optional  -- the same step, taken only where the defence wants it. Under this
//                scoring a step is not free: an unpaired defender counts towards
//                holding the space they stand on, so stepping away spends that to
//                buy a duel next door. It is also a second decision taken after
//                the attack is visible, which is the only information the defence
//                ever gets.
//
// Returns pairs and leftover defenders per space. Leftover attackers are always
// A[i] - pairs[i].

function resolve(A, D) {
  const pairs = new Int32Array(N_SPACES);
  const spare = new Int32Array(N_SPACES);
  for (const i of SPACE_IDS) {
    pairs[i] = Math.min(A[i], D[i]);
    spare[i] = D[i] - pairs[i];
  }

  // A defender with nobody to fight must step to an adjacent space where the attackers
  // outnumber the defenders. Who goes where is a matching, so it is a max flow: spare
  // defenders on one side, unanswered attackers on the other, an edge where they are
  // adjacent.
  const surplus = [], need = [];
  for (const i of SPACE_IDS) {
    if (spare[i] > 0) surplus.push(i);
    else if (A[i] > D[i]) need.push(i);
  }
  if (!surplus.length || !need.length) return { pairs, spare };

  const adjacency = surplus.map((i) => need
    .map((j, k) => (ADJACENT[i].includes(j) ? k : -1)).filter((k) => k >= 0));
  const flow = maxFlow(surplus.map((i) => spare[i]), need.map((i) => A[i] - D[i]), adjacency);
  need.forEach((j, k) => { pairs[j] += flow[k]; });
  distributeOut(surplus, need, adjacency, flow, spare);
  return { pairs, spare };
}

// The flow says how many defenders arrive at each needy space; this takes the
// matching number away from the spaces they came from.
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
// more takes a space outright, whatever the duels do; twice the attackers and the
// space cannot be taken at all, whatever the duels do. In between, the duels
// decide it. Nothing here is free: an extra attacker on a thick space is another
// duel to lose, and an extra defender is another body counted against the attack
// whether they find a fight or not.

// The fewest duels the attack has to win. Zero or less means the space falls
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

// The chance the attack takes a space, given the shape of the fight on it.
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

// The chance that one player's own duel decides the space, worked out before any of
// them are played. Their result matters exactly when the other duels on the space
// come to one short of what the attack needs: then this game turns it either way.
//
// This is the honest answer to "does my game matter", because it is the question as a
// player faces it -- sitting down not knowing how the others will go. The alternative
// is to ask afterwards whether that one result, alone, would have flipped the space,
// and the two disagree: two attackers against two defenders who both win is a space
// that no single result would have changed, so afterwards nobody decided it, while
// beforehand each of the four had an even chance of being the one who did.
function stakePerDuel(a, pairs, spare, p) {
  if (!a || !pairs) return 0;
  const w = winsNeeded(a, pairs, spare);
  if (w < 1 || w > pairs) return 0;              // the duels cannot change the result
  return CHOOSE(pairs - 1, w - 1) * Math.pow(p, w - 1) * Math.pow(1 - p, pairs - w);
}

// ── The attack ─────────────────────────────────────────────────────────────

// One mark per zone per round, so what an allocation is worth is, zone by zone, the best
// of the spaces it takes there.
function zoneBuckets(free, gain) {
  const of = Object.fromEntries(ZONES.map((z) => [z, []]));
  for (const i of free) of[SPACE_ZONE[i]].push(i);
  return ZONES.map((z) => of[z].sort((x, y) => gain[y] - gain[x])).filter((l) => l.length);
}

// One mark per zone is a real constraint but it is not four marks per round in
// four separate places: a line across the inner ring uses one space of three
// different zones, so it can be built whole in a single round. Those are the
// combinations worth going for, and a value that adds up single spaces cannot
// see them. So they are enumerated once per round -- a line with none of the
// opponent's symbols on it, whose empty spaces are all free and can be claimed
// for different zones -- and priced at what the whole set is worth over and
// above its best single space.
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
// it; then per zone, the expected best gain among the ones taken, plus what the
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

// What the attack should expect a space to look like when it gets there. Without
// the step it is exact. With it the attack assumes every spare defender next door
// arrives and every spare defender here stays, which cannot both happen, so it is
// the pessimistic reading rather than the true one -- the attack over-commits a
// little and the round itself is resolved by the real thing. `overestimate` in the
// output says how much that costs.
function estimate(A, D, free) {
  const pairs = new Int32Array(N_SPACES);
  const spare = new Int32Array(N_SPACES);
  const reach = (i) => {
    let d = D[i];
    for (const j of ADJACENT[i]) if (D[j] > A[j]) d += D[j] - A[j];
    return d;
  };
  const at = (i) => { pairs[i] = Math.min(A[i], reach(i)); spare[i] = Math.max(0, D[i] - A[i]); };
  for (const i of free) at(i);
  return { pairs, spare, at, reach };
}

// A space's value to the attack is a staircase in the force on it, and the treads
// are wide: against three defenders, four attackers and five attackers are the same
// space. So the search buys whole steps rather than one player at a time, and takes
// the step with the best value per player each time round. Twice the defenders and
// one more is the top of the staircase, and nothing above it buys anything.
const LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 19, 22, 25, 30];

// `force` is how many players the attack has to place, which is `cfg.size` unless the
// turnout was uneven -- see `teamSize`.
function attackPlan(marks, me, them, D, free, gain, buckets, combos, cfg, tail,
  force = cfg.size) {
  const A = new Int32Array(N_SPACES);
  const candidates = free.filter((i) => gain[i] > 0).sort((a, b) => gain[b] - gain[a]).slice(0, cfg.targets);
  const shape = estimate(A, D, free);

  // A change at i changes what its neighbours can expect too, since they can step.
  const repair = (i) => {
    shape.at(i);
    for (const j of ADJACENT[i]) shape.at(j);
  };

  let spent = 0, value = 0;
  for (;;) {
    let best = null, bestRatio = 1e-9;
    for (const i of candidates) {
      const from = A[i], ceiling = 2 * shape.reach(i) + 1;
      for (const a of LADDER) {
        if (a <= from || a - from > force - spent) continue;
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

  // Everyone has to stand somewhere, and an extra attacker on a space already past
  // the top of the staircase cannot spoil it. So the leftovers go there, or failing
  // that to the thinnest space.
  if (spent < force) {
    const safe = free.filter((i) => A[i] > 0 && A[i] > 2 * shape.reach(i));
    const dump = safe.length
      ? safe.sort((a, b) => gain[b] - gain[a])[0]
      : free.slice().sort((a, b) => (D[a] - D[b]) || (gain[b] - gain[a]))[0];
    A[dump] += force - spent;
  }
  return A;
}

// ── The defence ────────────────────────────────────────────────────────────

// The defence commits first and is then read, so there is nothing to gain from
// mixing: the best it can do is pick the allocation whose best answer is worst.
// The candidates are the shapes a team would actually try -- cover the n most
// dangerous spaces evenly, cover them in proportion to the danger, cover the
// worst few in each zone -- and the attack planner scores every one of them.
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
  // A few deep on the best spaces of every zone: the shape that answers a line
  // built out of one mark per zone in a single round.
  for (const per of [1, 2, 3]) {
    const spaces = buckets.flatMap((b) => b.slice(0, per));
    if (spaces.length) out.push(spread(spaces, spaces.map((i) => Math.max(0.01, gain[i]))));
  }

  // Shapes chosen to cover ground rather than to stand on it. Every other candidate
  // here ranks by danger, and the dangerous spaces are all in the middle, so they all
  // cluster; a defence that can step wants its neighbourhoods to tile the arena
  // instead. Greedy set cover over the free spaces, weighted by what each is worth to
  // the attack.
  {
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

// `force` is the defence's own strength, `against` the attack's: two numbers rather than
// one, because the two teams need not be the same size.
function defencePlan(marks, me, them, free, gain, buckets, combos, cfg, tail,
  force = cfg.size, against = cfg.size) {
  let best = null, bestValue = Infinity;
  for (const D of defenceCandidates(free, gain, buckets, force)) {
    const A = attackPlan(marks, me, them, D, free, gain, buckets, combos, cfg, tail, against);
    const v = planValue(A, resolve(A, D), buckets, gain, tail, combos);
    if (v < bestValue) { bestValue = v; best = D; }
  }
  return best;
}

function randomPlan(free, size, rng) {
  const D = new Int32Array(N_SPACES);
  for (let k = 0; k < size; k++) D[free[(rng() * free.length) | 0]]++;
  return D;
}

// A defence that has already seen the attack it is answering, and that the attack does
// not get to re-plan against. It is not a legal way to play -- the phases run the other
// way round -- and it is here as a ceiling on what the defensive phase could be worth.
// Twice the attackers on a space denies it outright, so it buys shutouts from the most
// dangerous space down until the players run out.
function oracleAnswer(A, free, gain, cfg, force = cfg.size) {
  const D = new Int32Array(N_SPACES);
  let left = force;
  for (const i of free.filter((j) => A[j]).sort((a, b) => gain[b] - gain[a])) {
    const take = Math.min(left, 2 * A[i]);
    D[i] = take; left -= take;
    if (!left) break;
  }
  if (left) D[free.slice().sort((a, b) => gain[b] - gain[a])[0]] += left;
  return D;
}

// ── Placing the marks ──────────────────────────────────────────────────────

// Each zone may claim one of the spaces its attack took, or none. Four of the best per
// zone is deep enough that the combination worth having is in the list, and the whole
// list is scored exactly -- including marks that only add up to a line together, which
// the planner's estimate misses.
function bestPicks(marks, me, them, taken, gain, base) {
  // -1 stands for "this zone claims nothing", since 0 is a real space.
  const buckets = ZONES
    .map((z) => taken.filter((i) => SPACE_ZONE[i] === z).sort((x, y) => gain[y] - gain[x]))
    .map((b) => [-1, ...b.slice(0, 4)]);

  const score = (choice) => {
    const set = [...new Set(choice.filter((i) => i >= 0))];
    return { set, value: placementValue(marks, me, them, set, base) };
  };
  let best = [], bestValue = placementValue(marks, me, them, [], base);
  const keep = ({ set, value }) => {
    if (set.length && value > bestValue) { bestValue = value; best = set; }
  };

  // Four zones is 625 combinations and worth enumerating; nine is two million and
  // is not. Above four, start from each zone's best claim and sweep: re-choose one
  // zone at a time against the others as they stand, until a pass changes nothing.
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

// How many players a team has, and how many it puts on the arena. Both are `cfg.size`
// unless the turnout was uneven: `cfg.short` is how many players team 1 is missing, which
// is the only asymmetry the campaign models. Everything downstream reads the force off
// `teamSize` rather than off `cfg.size`, so a round is planned, paired and resolved with
// the real numbers on both sides.
//
// `cfg.bench` is the other way to answer an uneven turnout: the fuller team sits players
// out until the two field the same number. It is not quite the same as being that size,
// because a benched player earns nothing that round while still counting when the team's
// earnings are read per head -- so the same income is spread over more players, and the
// fuller team's hands come up slightly slower. Who sits out is not modelled as a
// rotation: `assign` sends the strongest players to the spaces that matter and the
// weakest are the ones left over, which is what a captain would do anyway.
export const rosterSize = (cfg, team) => cfg.size - (team === 1 ? (cfg.short ?? 0) : 0);
export const teamSize = (cfg, team) => (cfg.bench
  ? cfg.size - (cfg.short ?? 0) : rosterSize(cfg, team));

// Which team attacks in round 0. Campaigns are normally run half from each seat, so that
// the seat cannot bias a total; `cfg.first_seat` pins it instead, which is what the rules
// need measuring once they say who attacks first -- 0 is team 1, the short one.
export const openingSeat = (cfg, n) => (cfg.first_seat == null ? n % 2 : cfg.first_seat);

// `first` is which team attacks in round 0. It matters: the team that attacks
// first is always the team with more marks on the arena when the other one scores,
// and a scored line clears whole zones, so attacking first means having more to
// lose to it. Campaigns are therefore run half from each seat.
export function newCampaign(first = 0, cfg = null, rng = null) {
  const st = { marks: new Uint8Array(N_SPACES), round: 0, first, points: [0, 0, 0] };

  // An empty arena makes a dull first round: every space is worth the same, so there is
  // nothing to choose between them and nothing to defend. Starting with marks already
  // down fixes that, and they are laid out in rotational pairs -- each of X's spaces
  // turned half a turn about the centre of the arena gives O one -- so that whatever the
  // opening position is worth, both teams have exactly the same of it.
  if (cfg.seed_marks) {
    const cx = (WIDTH - 1) / 2, cy = (HEIGHT - 1) / 2;
    const opposite = new Map();
    for (const s of SPACES) {
      const t = SPACES.find((o) => o.x === 2 * cx - s.x && o.y === 2 * cy - s.y);
      if (t && t.i !== s.i) opposite.set(s.i, t.i);
    }
    const free = SPACE_IDS.filter((i) => opposite.has(i));
    // No pair may complete a line. An opening position holding a three in a row would
    // hand its owner a point before anybody had played, and the rest of the campaign
    // assumes no line is ever left standing at the start of a round.
    const makesLine = (i, j) => {
      st.marks[i] = 1;
      st.marks[j] = 2;
      const bad = LINES.some((line) => {
        const first = st.marks[line[0]];
        return first && line.every((s) => st.marks[s] === first);
      });
      st.marks[i] = 0;
      st.marks[j] = 0;
      return bad;
    };
    // How many marks each team is supposed to end up with. The handicaps are all in
    // these two numbers: the team attacking in round one gives `seed_handicap` back, a
    // short team keeps `short_marks` extra a missing player, and `short_handicap` takes
    // that many off the fuller team instead. The rules print the pair as a table.
    const short = cfg.short ?? 0;
    // `mark_pair` states the two outright, first attacker then second, which is how the
    // rules print it; without it the pair is derived from the handicaps.
    const target = [0, cfg.seed_marks, cfg.seed_marks];
    if (cfg.mark_pair) {
      target[first + 1] = cfg.mark_pair[0];
      target[2 - first] = cfg.mark_pair[1];
    } else {
      target[first + 1] -= cfg.seed_handicap ?? 0;
      if (short) {
        target[1] += (cfg.short_marks ?? 0) * short;
        target[2] -= (cfg.short_handicap ?? 0) * short;
      }
    }
    // Both teams place the higher of the two, in rotational pairs, so whatever the
    // opening position is worth they start with exactly the same of it. Then whoever the
    // table gives fewer discards down to their number, and **chooses** which to drop --
    // which is worth something, so it is modelled rather than assumed away.
    const pairs = Math.max(target[1], target[2]);
    const placed = [];
    for (let n = 0; n < pairs; n++) {
      const options = free.filter((i) => !makesLine(i, opposite.get(i)));
      if (!options.length) break;
      const i = options[(rng() * options.length) | 0], j = opposite.get(i);
      st.marks[i] = 1;
      st.marks[j] = 2;
      placed.push([i, j]);
      const gone = new Set([i, j]);
      free.splice(0, free.length, ...free.filter((x) => !gone.has(x)));
    }
    // The discard, one mark at a time: of the marks it still holds, the team drops the
    // one it can most afford to lose -- the one whose loss costs its own position least,
    // which is what a team looking at the arena would do. Positional value is the
    // attack planner's own, so a discard is priced in the same currency as everything
    // the round does with it.
    setPos(cfg.pos);
    for (const team of [1, 2]) {
      const them = 3 - team;
      for (let n = placed.length - target[team]; n > 0; n--) {
        const mine = placed.map(([i, j]) => (team === 1 ? i : j)).filter((i) => st.marks[i] === team);
        if (!mine.length) break;
        let best = mine[0], bestValue = -Infinity;
        for (const i of mine) {
          st.marks[i] = 0;
          const v = posValue(st.marks, team, them);
          st.marks[i] = team;
          if (v > bestValue) { bestValue = v; best = i; }
        }
        st.marks[best] = 0;
      }
    }
  }
  // A team short of players can be paid for it in either of the two currencies the
  // campaign has: points on the scoreboard, which shorten its race, or upgrade points in
  // its players' pockets, which buy them better hands. Both are per missing player.
  st.points[1] += (cfg.head_start ?? 0) * (cfg.short ?? 0);

  // Every player starts on a hand drawn at random -- nobody is handed a good one -- and
  // buys their way up from there. `pts` is what each has earned and not yet spent,
  // `cards` the Counterattacks they carry, `bought` and `drawn` what they have bought.
  const n1 = rosterSize(cfg, 1), n2 = rosterSize(cfg, 2);
  st.roster = [null, newRoster(n1, cfg.pool, rng), newRoster(n2, cfg.pool, rng)];
  const each = (f) => [null, Array.from({ length: n1 }, f), Array.from({ length: n2 }, f)];
  st.pts = each(() => 0);
  const purse = (cfg.short_xp ?? 0) * (cfg.short ?? 0);
  if (purse) for (let k = 0; k < n1; k++) st.pts[1][k] = purse;
  st.cards = each(() => []);
  st.bought = each(() => 0);
  st.drawn = each(() => 0);
  return st;
}

// The attacker's edge, as a shift in strength rather than a probability, because that is
// how it composes with hands. If the campaign's attacker is also the duel's first player
// then the duel's own first-mover advantage becomes a standing attacker advantage: the
// base game gives the opening seat 72% with no Counterattack against it and about 57%
// with Mirror, so `edge` is where that lands. At 0.5 the seat is level, which is what a
// Counterattack was invented to buy.
export const edgeShift = (edge) => Math.log(edge / (1 - edge));

// ── Upgrade points ─────────────────────────────────────────────────────────
//
// Winning a space pays its winners upgrade points, and points buy two things: a stone
// replaced, which is permanent, or a Counterattack drawn at random, which is spent. The
// five cards are worth what the duel studies say they are, as shifts in the attacker's
// edge -- the opening seat takes 72% bare and 57% against a Mirror, and log(.72/.28) -
// log(.57/.43) is Mirror's 0.67. So a card subtracts its worth from `edge` for one duel,
// and only for a defender, since the campaign's attacker is the duel's first player.
export const CARD_WORTH = [1.23, 0.80, 0.67, 0.34, 0.03]; // Overtake .. Rehearse
const MEAN_CARD = CARD_WORTH.reduce((a, b) => a + b, 0) / CARD_WORTH.length;

// The prices. A round pays a point for standing on a space your side won and a point
// for winning your duel, so a player who does both takes two; a stone replaced costs
// three, and so does a Counterattack. The two prices are held level because pricing a
// card below a swap is what makes a player who spends on impulse starve their own hand
// ladder. `--swap-cost` and `--card-cost` move them, which is how they were chosen.
export const GRANT = 1;
export const SWAP_COST = 3;
export const CARD_COST = 3;
const swapCost = (cfg) => cfg.swapCost ?? SWAP_COST;
const cardCost = (cfg) => cfg.cardCost ?? CARD_COST;

// What a player thinks the next purchase is worth, in the strength that decides a duel.
// A swap applies to every duel they have left; a card to one, and only if they have a
// defending duel left to spend it in. That difference is the whole of the pricing, and
// it is what makes players finish their hand before they start buying cards.
function buys(st, cfg, team, k) {
  const left = Math.max(1, (cfg.horizon ?? 24) - st.round);
  const duels = left * PLAY_RATE;
  const { to, gain } = swapTarget(cfg.pool, st.roster[team][k]);
  return {
    to,
    swap: gain * duels,
    // Cards are used best-first, one a duel, so an extra one is worth an average draw
    // exactly while there are defending duels left to spend it in.
    card: st.cards[team][k].length < duels / 2 ? MEAN_CARD : 0,
  };
}

// Roughly what share of a team gets a duel in a round, which is how a player converts
// rounds left into duels left.
const PLAY_RATE = 0.6;

// A player works out which purchase is worth most per point and waits until they can
// afford that one, rather than spending on the other in the meantime.
function spend(st, cfg, team, k, rng, tally) {
  for (;;) {
    const purse = st.pts[team][k];
    const v = buys(st, cfg, team, k);
    const a = v.swap > 0 ? v.swap / swapCost(cfg) : -1;
    const b = v.card > 0 ? v.card / cardCost(cfg) : -1;
    if (a < 0 && b < 0) break;
    if (a >= b ? purse < swapCost(cfg) : purse < cardCost(cfg)) break;
    if (a >= b) {
      st.pts[team][k] -= swapCost(cfg);
      st.roster[team][k] = v.to;
      st.bought[team][k]++;
      if (tally) tally.swaps++;
    } else {
      st.pts[team][k] -= cardCost(cfg);
      st.cards[team][k].push(CARD_WORTH[(rng() * CARD_WORTH.length) | 0]);
      // When a player buys their first card, how far up the hand ladder are they? That
      // is the whole of "something to buy once you are happy with your hand".
      if (tally && !st.drawn[team][k]) {
        tally.firstCard++;
        tally.firstRound += st.round;
        tally.firstSwaps += st.bought[team][k];
      }
      st.drawn[team][k]++;
      if (tally) tally.cards++;
    }
  }
}

// The campaign's attacker is the duel's first player, and the opening seat takes 72% of
// games with nothing against it. A defender's Counterattack subtracts its own worth from
// this for one duel.
export const EDGE = 0.72;

// Whose round it is, what every free space is worth, and where both teams go.
// Separated out because it is the whole of the decision-making and the rest of
// the round is arithmetic.
export function allocate(st, cfg, rng, tables) {
  const me = ((st.round + st.first) % 2) + 1, them = 3 - me;

  // What each side has to place. The two differ when the turnout was uneven.
  const mine = teamSize(cfg, me), theirs = teamSize(cfg, them);

  // Both sides plan against the duel odds they can expect, which with hands in play is
  // their own average against the other side's rather than a flat half.
  const tail = cfg.pool && st.roster
    ? tailTable(expectedChance(st, cfg, me, them), Math.max(mine, theirs) + 1)
    : tables[me];
  const free = SPACE_IDS.filter((i) => !st.marks[i]);
  const base = posValue(st.marks, me, them);

  const gain = new Float64Array(N_SPACES);
  for (const i of free) gain[i] = placementValue(st.marks, me, them, [i], base);
  const buckets = zoneBuckets(free, gain);
  const combos = combinations(st.marks, me, them, free, gain, base);


  let A = new Int32Array(N_SPACES), D = new Int32Array(N_SPACES);
  let shape = { pairs: new Int32Array(N_SPACES), spare: new Int32Array(N_SPACES) };
  if (free.length && cfg.defence === 'oracle') {
    // The ceiling: the attack plans against the defence it expects, and then the defence
    // answers what it actually did.
    const expected = defencePlan(st.marks, me, them, free, gain, buckets, combos, cfg, tail,
      theirs, mine);
    A = attackPlan(st.marks, me, them, expected, free, gain, buckets, combos, cfg, tail, mine);
    D = oracleAnswer(A, free, gain, cfg, theirs);
    shape = resolve(A, D);
  } else if (free.length) {
    D = cfg.defence === 'random' ? randomPlan(free, theirs, rng)
      : defencePlan(st.marks, me, them, free, gain, buckets, combos, cfg, tail, theirs, mine);
    A = cfg.attack === 'random' ? randomPlan(free, mine, rng)
      : attackPlan(st.marks, me, them, D, free, gain, buckets, combos, cfg, tail, mine);
    shape = resolve(A, D);
  }
  // The attack plans against an upper bound on the defenders it will face; this
  // is how many pairings that bound over-predicts, and so how much force the
  // attack wastes by being careful. If it were large the plans would not be worth
  // much under the stepping rule.
  const guess = estimate(A, D, free);
  const predicted = free.reduce((n, i) => n + guess.pairs[i], 0);
  const actual = free.reduce((n, i) => n + shape.pairs[i], 0);
  return { me, them, free, base, gain, buckets, D, A, shape, overestimate: predicted - actual };
}

export function playRound(st, cfg, rng, tables, tally) {
  setPos(cfg.pos);
  const { me, them, free, base, gain, D, A, shape, overestimate } = allocate(st, cfg, rng, tables);
  const { pairs, spare } = shape;

  // The duels. Every pairing is the same coin unless we are playing them out.
  // With hands in play, which player stands where matters: each captain sends their
  // best to the spaces worth most, so both sides deal their players out in strength
  // order against their own ranking of the spaces.
  const order = free.slice().sort((x, y) => gain[y] - gain[x]);
  // What a duel on any space is worth as a coin, for the "did my game matter" figures:
  // the two teams draw from the same pool, so it is the attacker's edge.
  const p = expectedChance(st, cfg, me, them);
  const sides = {
    atk: assign(order, A, st.roster[me], cfg.pool),
    def: assign(order, D, st.roster[them], cfg.pool),
  };
  // Who won their duel, filed by team number, since winning one pays a point.
  const log = { won: [null, [], []] };

  const taken = [];
  let duels = 0, pivotal = 0, stake = 0;
  for (const i of free) {
    if (!A[i]) continue;
    const lost = fight(i, pairs[i], sides, st, me, them, cfg, rng, log, tally);
    duels += pairs[i];
    const won = pairs[i] - lost;
    const need = winsNeeded(A[i], pairs[i], spare[i]);
    if (won >= need) taken.push(i);
    stake += pairs[i] * stakePerDuel(A[i], pairs[i], spare[i], p);
    // A duel decided the space if turning it round would have turned the space
    // round: on the threshold every win was decisive, one short of it every loss
    // was. This is the number that says whether the game a player actually sat
    // down to play mattered.
    if (won === need) pivotal += won;
    else if (won === need - 1) pivotal += lost;
  }

  const { picks, value } = bestPicks(st.marks, me, them, taken, gain, base);
  for (const i of picks) st.marks[i] = me;
  const { lines, points, cleared } = scoreAndClear(st.marks, me, them);
  st.points[me] += points;

  // Who stood on a space their side won -- the attackers on a space the attack took,
  // the defenders on one it held -- paired or not. An unpaired attacker's presence is
  // already part of how a space is taken, so standing there is already a contribution.
  const winnersOn = () => {
    const took = new Set(taken);
    const out = [[], [], []];
    for (const i of free) {
      if (!A[i]) continue;
      const side = took.has(i) ? me : them;
      out[side].push(...((took.has(i) ? sides?.atk.at.get(i) : sides?.def.at.get(i)) ?? []));
    }
    return out;
  };

  // The round pays twice over: a point for standing on a space your side won, and a
  // point for winning your duel. Both lists hold a player at most once, so two is the
  // most a round can pay and it takes a fight to earn it. They then spend what they
  // have on whatever is worth most per point; nothing is handed out free.
  const winners = winnersOn();
  for (const team of [me, them]) {
    const paid = [...winners[team], ...log.won[team]];
    for (const k of paid) {
      st.pts[team][k] += GRANT;
      if (tally) tally.earned += GRANT;
    }
    for (const k of new Set(paid)) spend(st, cfg, team, k, rng, tally);
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
    // What the round was worth to the attack, points plus the position it left. Points
    // alone are too coarse to see a defence in: a defence that cannot stop a mark can
    // still steer it somewhere that is not building anything.
    tally.value += value;
    tally.cleared += cleared;
    tally.lines += lines;
    tally.lineHist[Math.min(lines, 5)]++;
    tally.stalled += free.length ? 0 : 1;
    tally.duels += duels;
    tally.pivotal += pivotal;
    tally.stake += stake;
    tally.unpaired += heldA - duels;
    tally.idle += teamSize(cfg, me) - duels;
    tally.free += free.length;
    tally.contested += free.filter((i) => A[i] > 0).length;
    tally.taken += taken.length;
    // The same, but only over spaces somebody actually defended. `contested` counts
    // every space the attack walked onto, and most of those are empty ones the defence
    // could not reach, so it flatters the attack badly. This is the fight.
    const fought = free.filter((i) => A[i] > 0 && pairs[i] > 0);
    tally.defended += fought.length;
    tally.defendedTaken += fought.filter((i) => taken.includes(i)).length;
    for (const i of fought) { tally.forceA += A[i]; tally.forceD += pairs[i] + spare[i]; }
    // Defenders standing where nobody came, which is what committing first costs.
    tally.wasted += free.reduce((n, i) => n + (A[i] ? 0 : D[i]), 0);
    // How many pairings the step created, over and above the ones on the space itself.
    tally.reinforced += duels - free.reduce((n, i) => n + Math.min(A[i], D[i]), 0);
    tally.overestimate += overestimate;
    // Contested spaces and cards spent, split at the middle of the campaign: as players
    // arm themselves the attacker's edge should come off.
    const half = st.round <= (cfg.horizon ?? 24) / 2 ? 0 : 1;
    tally.halfContested[half] += free.filter((i) => A[i] > 0).length;
    tally.halfTaken[half] += taken.length;
    tally.halfUsed[half] += tally.used - tally.usedWas;
    tally.halfDuels[half] += tally.defDuels - tally.defWas;
    tally.usedWas = tally.used;
    tally.defWas = tally.defDuels;
    // The bank, the stock and how far up the ladder the field has climbed, summed over
    // both teams so they divide by 2 * size the way the hand figures do.
    for (const team of [1, 2]) {
      tally.bank += st.pts[team].reduce((a, b) => a + b, 0);
      tally.stock += st.cards[team].reduce((a, c) => a + c.length, 0);
      // Where the two teams' hands have got to, and how far apart they are inside a
      // team -- the spread says whether the field is being pulled together or apart.
      const ss = rosterStrength(st.roster[team], cfg.pool);
      const mean = ss.reduce((a, b) => a + b, 0) / ss.length;
      tally.handMean[team] += mean;
      tally.handSpread[team] += Math.sqrt(ss.reduce((a, s2) => a + (s2 - mean) ** 2, 0) / ss.length);
      tally.handKinds[team] += new Set(st.roster[team]).size / ss.length;
    }
  }
  return { picks, points, duels };
}

// The duels on one space, attacker hands against defender hands. The defence chooses
// which attacker each of its players takes, so it pairs off the way that wins it the
// most games -- champion against champion, or its best against their weakest, whichever
// of the two comes out higher. Returns how many the attack lost, and files the winner
// of each duel under their team, since a duel won pays its winner a point.
function fight(i, pairs, sides, st, me, them, cfg, rng, log, tally = null) {
  const roster = st.roster;
  const v = VETO[i];
  const sa = (k) => strengthAt(cfg.pool, roster[me][k], v);
  const sd = (k) => strengthAt(cfg.pool, roster[them][k], v);
  const bonus = edgeShift(EDGE);
  const atk = (sides.atk.at.get(i) ?? []).slice(0, pairs).sort((x, y) => sa(y) - sa(x));
  const ranked = (sides.def.at.get(i) ?? []).slice(0, pairs).sort((x, y) => sd(y) - sd(x));
  const held = (line) => line.reduce((n, d, k) => n + (1 - duelChance(sa(atk[k]) + bonus, sd(d))), 0);
  const flipped = ranked.slice().reverse();
  const def = held(ranked) >= held(flipped) ? ranked : flipped;

  let lost = 0;
  for (let k = 0; k < def.length; k++) {
    // The hand table says a duel is sigmoid(mine - theirs). `--duels real` plays the two
    // hands out through engine.js on this space instead, to check that it does not.
    if (cfg.duels === 'real') {
      const r = playGame({
        opener: cfg.pool.hands[roster[me][atk[k]]],
        replier: cfg.pool.hands[roster[them][def[k]]],
        itemO: st.cards[them][def[k]].length ? cfg.item : null,
        rules: { disabled: v === 'neutral' ? null : v },
        seed: (rng() * 2 ** 31) | 0, iters: cfg.iters, i: 0, j: 0,
      });
      if (st.cards[them][def[k]].length) {
        st.cards[them][def[k]].pop();
        if (tally) tally.used++;
      }
      if (tally) tally.defDuels++;
      if (r.openerWon > 0.5) log.won[me].push(atk[k]);
      else { lost++; log.won[them].push(def[k]); }
      continue;
    }
    // The defender spends a Counterattack if they are carrying one. Presenting three
    // and using one comes to using the best they hold, since presenting costs nothing;
    // an unused card is only worth something if a later duel is left to spend it in,
    // and holding it back for a better duel is not a decision the round offers.
    let edge = bonus;
    {
      const stock = st.cards[them][def[k]];
      if (tally) tally.defDuels++;
      if (stock.length) {
        let b = 0;
        for (let j = 1; j < stock.length; j++) if (stock[j] > stock[b]) b = j;
        edge -= stock[b];
        stock.splice(b, 1);
        if (tally) tally.used++;
      }
    }
    if (rng() < duelChance(sa(atk[k]) + edge, sd(def[k]))) log.won[me].push(atk[k]);
    else { lost++; log.won[them].push(def[k]); }
  }
  return lost;
}

// Players standing on a space where their side brought more than could pair off. The
// assignment deals them out in order, so the ones past the pairing are the spare.
function unfought(side, counts, pairs, spare = null) {
  const out = [];
  for (const [i, players] of side.at) {
    const fought = spare ? Math.min(counts[i], pairs[i]) : pairs[i];
    for (let k = fought; k < players.length; k++) out.push(players[k]);
  }
  return out;
}

const newTally = (cfg) => ({
  ...cfg,
  // The report is assembled in another thread, which may be looking at a different
  // arena, so anything the shares are taken over has to travel with the tally.
  spaces: N_SPACES, zones: ZONES.length,
  rounds: 0, marks: 0, markHist: Array.from({ length: ZONES.length + 1 }, () => 0),
  points: 0, teamPoints: [0, 0, 0], seatPoints: [0, 0], value: 0, cleared: 0,
  lines: 0, lineHist: [0, 0, 0, 0, 0, 0], stalled: 0,
  duels: 0, pivotal: 0, stake: 0, unpaired: 0, idle: 0, free: 0,
  contested: 0, taken: 0, defended: 0, defendedTaken: 0, forceA: 0, forceD: 0, wasted: 0,
  reinforced: 0, overestimate: 0,
  // The economy: what was earned, what it bought, and what the cards did.
  earned: 0, swaps: 0, cards: 0, used: 0, defDuels: 0, bank: 0, stock: 0,
  firstCard: 0, firstRound: 0, firstSwaps: 0,
  halfContested: [0, 0], halfTaken: [0, 0], halfUsed: [0, 0], halfDuels: [0, 0],
  usedWas: 0, defWas: 0,
  // Where each campaign left its players, sampled at the end of every one.
  ends: 0, endSwaps: 0, endCards: 0, endBank: 0, endDone: 0, endNone: 0, endHand: 0,
  handMean: [0, 0, 0], handSpread: [0, 0, 0], handKinds: [0, 0, 0],
});

// What the attacking team should expect from a duel this round: its average hand
// against theirs. A team with better hands plans more boldly, which is most of how an
// advantage in hands turns into an advantage on the arena.
function expectedChance(st, cfg, me, them) {
  const mine = meanByVeto(st.roster[me], cfg.pool);
  const theirs = meanByVeto(st.roster[them], cfg.pool);
  // Averaged over the vetoes, since a round's spaces are spread across the arena, and
  // shifted by the attacker's edge, which both sides know about and plan around.
  const bonus = edgeShift(EDGE);
  const vs = cfg.pool.vetoes;
  const p = vs.reduce((a, v) => a + duelChance(mine[v] + bonus, theirs[v]), 0) / vs.length;
  return Math.min(0.95, Math.max(0.05, p));
}

// The take-table both sides start the round from, before their own hands refine it.
const tablesFor = (cfg) => [null, tailTable(EDGE, cfg.size + 1), tailTable(EDGE, cfg.size + 1)];

// Where a campaign leaves its players. The running averages say what the field looks
// like on a typical round; this says what a player walks out with, which is the figure
// a price has to be set against.
function snapshot(st, cfg, tally) {
  if (!tally) return;
  tally.ends++;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (2 * xs.length);
  for (const team of [1, 2]) {
    tally.endSwaps += mean(st.bought[team]);
    tally.endCards += mean(st.cards[team].map((c) => c.length));
    tally.endBank += mean(st.pts[team]);
    tally.endDone += mean(st.bought[team].map((n) => (n >= 3 ? 1 : 0)));
    tally.endNone += mean(st.bought[team].map((n) => (n === 0 ? 1 : 0)));
    tally.endHand += mean(rosterStrength(st.roster[team], cfg.pool));
  }
}

export function runConfig(cfg) {
  setArena(cfg.arena);
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const tally = newTally(cfg);
  let started = 0;
  let st = newCampaign(openingSeat(cfg, 0), cfg, rng);
  for (let r = 0; r < cfg.rounds; r++) {
    playRound(st, cfg, rng, tables, tally);
    // Long campaigns are one continuous arena; --restart chops them into
    // separate ones, so that the opening rounds are not under-sampled, and
    // alternates the opening seat so that it cannot bias the totals.
    if (cfg.restart && st.round % cfg.restart === 0) {
      snapshot(st, cfg, tally);
      st = newCampaign(openingSeat(cfg, ++started), cfg, rng);
    }
  }
  if (st.round % (cfg.restart || Infinity)) snapshot(st, cfg, tally);
  return tally;
}

// Campaigns played to a finish rather than for a fixed number of rounds: how long
// a campaign takes, and -- when the two teams are not equally good -- how often
// the better one wins it. A team only scores in the rounds it attacks, so a race
// to a target is a race over half the rounds each.
export function runCampaigns(cfg) {
  setArena(cfg.arena);
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const tally = { ...newTally(cfg), mode: 'campaigns', ran: 0, wonByX: 0, drawn: 0, length: 0 };
  for (let c = 0; c < cfg.campaigns; c++) {
    const st = newCampaign(openingSeat(cfg, c), cfg, rng);
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
// a change that concedes fewer marks also leaves a sparser arena, and a sparser
// arena scores at a different rate for reasons that have nothing to do with the
// change. So the variants are run against the same positions instead: every round
// of a reference campaign is handed to both, several times each, and what gets
// reported is the difference on the shared position. The reference campaign is
// advanced by the two variants alternately so that neither shapes the positions
// the other is measured on.

const PAIRS = {
  defence: (cfg) => [{ ...cfg, defence: 'plan' }, { ...cfg, defence: 'random' }],
  attack: (cfg) => [{ ...cfg, attack: 'plan' }, { ...cfg, attack: 'random' }],
};

function runPaired(cfg) {
  setArena(cfg.arena);
  const rng = makeRng(cfg.seed);
  const tables = tablesFor(cfg);
  const variants = PAIRS[cfg.pair](cfg);
  const tallies = variants.map((v) => newTally(v));
  let started = 0;
  let st = newCampaign(openingSeat(cfg, 0), cfg, rng);

  for (let r = 0; r < cfg.rounds; r++) {
    for (let s = 0; s < cfg.samples; s++) {
      const seed = (rng() * 2 ** 31) | 0;
      variants.forEach((v, k) => playRound(
        {
          marks: st.marks.slice(), round: st.round, first: st.first, points: [0, 0, 0],
          roster: st.roster.map((r2) => r2?.slice()),
          pts: st.pts.map((p) => p?.slice()),
          cards: st.cards.map((c) => c?.map((x) => x.slice())),
          bought: st.bought.map((b) => b?.slice()),
          drawn: st.drawn.map((b) => b?.slice()),
        },
        v, makeRng(seed), tables, tallies[k],
      ));
    }
    playRound(st, variants[r % variants.length], rng, tables, null);
    if (cfg.restart && st.round % cfg.restart === 0) {
      st = newCampaign(openingSeat(cfg, ++started), cfg, rng);
    }
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
    size: t.size, arena: t.arena, defence: t.defence, attack: t.attack, rounds: r,
    marks: per(t.marks, r),
    points: per(t.points, r),
    value: per(t.value, r),
    duels: per(t.duels, r),
    // The share of each team that gets a game. Every duel occupies one attacker and one
    // defender, so the attackers left unpaired and the defenders left idle are the same
    // number and this one figure covers both.
    playing: per(t.duels, r * t.size),
    // Of the duels played, the share that turned out to decide the space, and the share
    // that had a chance of deciding it at the time they were sat down to. The second is
    // the one to quote at a player.
    pivotal: per(t.pivotal, t.duels),
    atStake: per(t.stake, t.duels),
    // And the one that puts the two together: the share of a team who played a game
    // whose result decided something. A player left standing idle and a player whose
    // duel was already moot come to the same thing at the table.
    decisive: per(t.pivotal, r * t.size),
    atStakeShare: per(t.stake, r * t.size),
    // Every space the attack went to, then only the ones somebody defended. The first
    // counts the walkovers -- the defence cannot cover an arena -- so the second is the
    // one that answers "can the defence hold a space".
    contested: per(t.contested, r),
    takeRate: per(t.taken, t.contested),
    defended: per(t.defended, r),
    holdRate: per(t.defendedTaken, t.defended),
    odds: per(t.forceA, t.forceD),
    wasted: per(t.wasted, r * t.size),
    occupancy: 1 - per(t.free, r * t.spaces),
    cleared: per(t.cleared, r),
    lines: per(t.lines, r),
    // How many rounds a mark survives. Marks arrive at `marks` a round and the arena
    // carries `occupancy * spaces` of them, so by Little's law the ratio is the mean
    // life of one -- the plainest measure of whether anything carries between rounds.
    life: per((1 - per(t.free, r * t.spaces)) * t.spaces, per(t.marks, r)),
    // Of the rounds that scored at all, the share that took more than one line, and the
    // share of all points that came from rounds taking three or more. The second says
    // how far the squared score concentrates a campaign into a few rounds.
    multi: per(t.lineHist.slice(2).reduce((a, b) => a + b, 0),
      t.lineHist.slice(1).reduce((a, b) => a + b, 0)),
    lumpy: (() => {
      const worth = t.lineHist.map((c, k) => c * k * k);
      const all = worth.reduce((a, b) => a + b, 0);
      return all ? worth.slice(3).reduce((a, b) => a + b, 0) / all : 0;
    })(),
    stalled: per(t.stalled, r),
    reinforced: per(t.reinforced, r),
    overestimate: per(t.overestimate, r),
    // Hands: where the field has got to, how far apart it is inside a team, and how
    // many distinct hands survive.
    handMean: per(t.handMean[1] + t.handMean[2], 2 * r),
    handSpread: per(t.handSpread[1] + t.handSpread[2], 2 * r),
    handKinds: per(t.handKinds[1] + t.handKinds[2], 2 * r),
    // The economy, all per player: what a round pays, what a campaign leaves them
    // holding, and how much of the defence's grip the cards buy back.
    earn: per(t.earned, r * 2 * t.size),
    swapsBought: per(t.swaps, r * 2 * t.size) * (t.horizon ?? 24),
    cardsBought: per(t.cards, r * 2 * t.size) * (t.horizon ?? 24),
    cardDuels: per(t.used, t.defDuels),
    endSwaps: per(t.endSwaps, t.ends),
    endCards: per(t.endCards, t.ends),
    endDone: per(t.endDone, t.ends),
    endNone: per(t.endNone, t.ends),
    endHand: per(t.endHand, t.ends),
    bank: per(t.endBank, t.ends),
    firstAt: per(t.firstRound, t.firstCard),
    firstAfter: per(t.firstSwaps, t.firstCard),
    takeEarly: per(t.halfTaken[0], t.halfContested[0]),
    takeLate: per(t.halfTaken[1], t.halfContested[1]),
    cardsEarly: per(t.halfUsed[0], t.halfDuels[0]),
    cardsLate: per(t.halfUsed[1], t.halfDuels[1]),
    zones: t.zones,
    swapCost: t.swapCost ?? SWAP_COST,
    cardCost: t.cardCost ?? CARD_COST,
    // The share of rounds where every zone claimed a space, and where two or more came
    // away with nothing: the two ends that say whether the defence is denying anything.
    allMarks: per(t.markHist[t.zones], r),
    shortBy2: per(t.markHist.slice(0, Math.max(1, t.zones - 1)).reduce((a, b) => a + b, 0), r),
    ran: t.mode === 'campaigns' ? t.ran : 0,
    wonByX: per(t.wonByX, t.ran),
    drawn: per(t.drawn, t.ran),
    length: per(t.length, t.ran),
    pointsFirst: per(t.seatPoints[0], r / 2),
    pointsSecond: per(t.seatPoints[1], r / 2),
    // Per team rather than per seat, which is the axis an uneven turnout runs along:
    // team 1 is the short one, and each team attacks half the rounds.
    short: t.short ?? 0,
    bench: !!t.bench,
    firstSeat: t.first_seat ?? null,
    seedHandicap: t.seed_handicap ?? 0,
    markPair: t.mark_pair ? t.mark_pair.join('/') : '',
    shortHandicap: t.short_handicap ?? 0,
    shortMarks: t.short_marks ?? 0,
    headStart: t.head_start ?? 0,
    shortXp: t.short_xp ?? 0,
    pointsShort: per(t.teamPoints[1], r / 2),
    pointsFull: per(t.teamPoints[2], r / 2),
  };
}

// Sum the repeats of each (size, stepping rule) back into one tally.
function group(tallies) {
  const byKey = new Map();
  for (const t of tallies) {
    const k = `${t.size}|${t.arena}|${t.defence}|${t.attack}|${t.swapCost}|${t.cardCost}`
      + `|${t.short ?? 0}|${t.bench ? 'b' : ''}|${t.first_seat ?? 'a'}|${t.seed_handicap ?? 0}`
      + `|${t.mark_pair ? t.mark_pair.join('/') : ''}`
      + `|${t.short_handicap ?? 0}|${t.short_marks ?? 0}`
      + `|${t.head_start ?? 0}|${t.short_xp ?? 0}`;
    if (!byKey.has(k)) { byKey.set(k, { ...t }); continue; }
    const into = byKey.get(k);
    for (const [f, v] of Object.entries(t)) {
      const constant = ['size', 'seed', 'rep', 'rounds', 'spaces', 'zones', 'horizon',
        'swapCost', 'cardCost', 'short', 'short_handicap', 'short_marks', 'head_start',
        'short_xp', 'first_seat', 'seed_handicap', 'mark_pair'];
      if (constant.includes(f)) continue;
      if (typeof v === 'number' && typeof into[f] === 'number') into[f] += v;
      else if (Array.isArray(v) && Array.isArray(into[f])) into[f] = into[f].map((x, i) => x + v[i]);
    }
    into.rounds += t.rounds;
  }
  return [...byKey.values()];
}

// Two tables. The round: what the attack gets, how many players it takes to get it, and
// what the arena holds afterwards.
function report(rows) {
  const campaigns = rows.some((r) => r.ran);
  const head = ['size', 'arena', 'marks', 'pts/r', 'duels', 'play%', 'stake%', 'decis%',
    'occ%', 'life', 'multi%', 'take%', 'def/r', 'deftake%', 'odds', 'waste%',
    ...(campaigns ? ['X win%', 'draw%', 'length'] : ['mk/max', 'allmk%', 'short%'])];
  console.log(head.map((h) => pad(h, h.length > 5 ? 9 : 7)).join(''));
  for (const r of rows) {
    console.log([
      pad(r.size, 7), pad(r.arena, 7),
      pad(r.marks.toFixed(2), 7), pad(r.points.toFixed(2), 7), pad(r.duels.toFixed(1), 7),
      pad(pct(r.playing), 7), pad(pct(r.atStake), 9), pad(pct(r.decisive), 9),
      pad(pct(r.occupancy), 7), pad(r.life.toFixed(1), 7), pad(pct(r.multi), 9),
      pad(pct(r.takeRate), 7), pad(r.defended.toFixed(1), 7), pad(pct(r.holdRate), 9),
      pad(r.odds.toFixed(2), 7), pad(pct(r.wasted), 9),
      ...(campaigns
        ? [pad(pct(r.wonByX), 9), pad(pct(r.drawn), 9), pad(r.length.toFixed(1), 9)]
        : [pad(`${r.marks.toFixed(1)}/${r.zones}`, 9), pad(pct(r.allMarks), 9),
          pad(pct(r.shortBy2), 9)]),
    ].join(''));
  }
}

// And the economy: what a player earns and what a campaign leaves them holding, all per
// player, plus the two halves that show the cards coming off the attacker's edge.
function reportEconomy(rows) {
  const head = ['size', 'arena', 'swap$', 'card$', 'earn/r', 'swaps', 'done3%', 'never%',
    'hand', 'bank', 'cards', 'card@r', 'after', 'card%1st', 'card%2nd', 'take%1st',
    'take%2nd'];
  console.log(head.map((h) => pad(h, h.length > 5 ? 10 : 7)).join(''));
  for (const r of rows) {
    console.log([
      pad(r.size, 7), pad(r.arena, 7), pad(r.swapCost, 7), pad(r.cardCost, 7),
      pad(r.earn.toFixed(2), 10),
      pad(r.endSwaps.toFixed(2), 7), pad(pct(r.endDone), 10), pad(pct(r.endNone), 10),
      pad(r.endHand.toFixed(2), 7), pad(r.bank.toFixed(2), 7),
      pad(r.cardsBought.toFixed(2), 7), pad(r.firstAt.toFixed(1), 10),
      pad(r.firstAfter.toFixed(2), 7), pad(pct(r.cardsEarly), 10), pad(pct(r.cardsLate), 10),
      pad(pct(r.takeEarly), 10), pad(pct(r.takeLate), 10),
    ].join(''));
  }
}

// An uneven turnout: what the two teams score per attacking round when one of them is
// short, and what a handicap in opening marks does to the gap. `gap` is the fuller team's
// advantage, so a handicap that levels the game brings it to zero.
function reportTeams(rows) {
  const head = ['size', 'arena', 'short', 'first', 'marks', 'seat$', 'give', 'keep', 'xp',
    'head', 'short/r', 'full/r', 'gap', 'mk/r', 'take%', 'play%', 'X win%', 'length'];
  console.log(head.map((h) => pad(h, h.length > 5 ? 9 : 7)).join(''));
  for (const r of rows) {
    const gap = r.pointsFull - r.pointsShort;
    console.log([
      pad(r.size, 7), pad(r.arena, 7), pad(r.short, 7),
      pad(r.firstSeat == null ? 'alt' : ['X', 'O'][r.firstSeat], 7),
      pad(r.markPair || (r.bench ? 'bench' : '-'), 7), pad(r.seedHandicap, 7),
      pad(r.shortHandicap, 7), pad(r.shortMarks, 7), pad(r.shortXp, 7), pad(r.headStart, 7),
      pad(r.pointsShort.toFixed(3), 9), pad(r.pointsFull.toFixed(3), 9),
      pad((gap >= 0 ? '+' : '') + gap.toFixed(3), 9),
      pad(r.marks.toFixed(2), 7), pad(pct(r.takeRate), 7), pad(pct(r.playing), 7),
      pad(r.ran ? pct(r.wonByX) : '-', 9), pad(r.ran ? r.length.toFixed(1) : '-', 9),
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

// The position weights the attack plans with, calibrated by playing candidates against
// each other: what a lone mark is worth and what two in a row are worth, as fractions of
// a point. They differ by arena -- 81 spaces leave room to build something the next round
// can still use, 36 do not -- and they are the AI's valuation rather than a rule.
const WEIGHTS = { small: [0.03, 0.12], big: [0.05, 0.20] };

// The opening position, and both handicaps in it. Pairs are drawn rotationally and then
// the team the table gives fewer discards its own down to that number, choosing which --
// so these three constants come to the table the rules print, opening marks for the team
// attacking in round one against the other team's:
//
//                              6x6      9x9
//   even teams                 0 / 5    3 / 9
//   first team a player short  5 / 5    5 / 9
//
// A discard is chosen rather than random, which costs a mark most of its bite: the team
// keeps whatever lines up. That is why the first attacker on the 6x6 gives back all five.
const SEED_PAIRS = { small: 5, big: 9 };
const HANDICAP = { small: 5, big: 6 };
// And when the turnout is uneven, the short team takes round one and keeps extra marks of
// its own on top -- all five of them on the 6x6, two of the nine on the 9x9, where round
// one covers most of a missing body by itself. `--short-handicap`, which takes marks off
// the fuller team instead, is the other direction and buys about half as much a mark; it
// is kept because the record measured both.
const SHORT_MARKS = { small: 5, big: 2 };
const SHORT_HANDICAP = 0;

async function main() {
  const opts = {
    sizes: sizes(arg('sizes', arg('size', '12'))),
    arenas: arg('arenas', arg('arena', 'small')).split(','),
    rounds: parseInt(arg('rounds', '600'), 10),
    restart: parseInt(arg('restart', '24'), 10),   // rounds to a campaign
    seed: parseInt(arg('seed', '20260811'), 10),
    reps: parseInt(arg('reps', '1'), 10),          // independent runs per size, summed
    target: parseInt(arg('target', '0'), 10),      // points that finish a campaign
    campaigns: parseInt(arg('campaigns', '400'), 10),
    cap: parseInt(arg('cap', '4000'), 10),         // a campaign that will not finish
    targets: parseInt(arg('targets', '14'), 10),   // spaces the attack plans over
    // Baselines, not rules: a defence or attack that scatters at random says what the
    // planning is worth, and a defence that has already seen the attack is the ceiling.
    defence: arg('defence', 'plan'),               // plan | random | oracle
    attack: arg('attack', 'plan'),                 // plan | random
    pair: arg('pair', null),                       // defence | attack, on shared positions
    samples: parseInt(arg('samples', '6'), 10),    // resolutions of each shared position
    duels: arg('duels', 'coin'),                   // coin | real, played through engine.js
    item: arg('item', 'mirror'),
    iters: parseInt(arg('iters', '120'), 10),
    handsFile: arg('hands-file', 'results/hands-vetoes.json'),
    horizon: parseInt(arg('horizon', '24'), 10),   // how long the players think it runs
    // Prices take a list, so one run can sweep them: --swap-cost 2,3 --card-cost 2,3
    swapCosts: sizes(arg('swap-cost', String(SWAP_COST))),
    cardCosts: sizes(arg('card-cost', String(CARD_COST))),
    // An uneven turnout: how many players team 1 is missing, and how many opening marks
    // team 2 gives back for each of them. Both take lists, so one run can sweep them.
    shorts: sizes(arg('short', '0')),
    shortHandicaps: sizes(arg('short-handicap', String(SHORT_HANDICAP))),   // off the fuller team
    bench: process.argv.includes('--bench'),        // the fuller team sits players out
    // Who attacks first: alternating, or pinned to one team. The rules pin it to the
    // short team, so that is the seat the handicap has to be priced in.
    // Who attacks in round one. Campaigns are normally run half from each seat so that the
    // seat cannot bias a total; the rules give it to the short team, so an uneven turnout
    // pins it to X unless told otherwise.
    first: arg('first', null),                     // alternate | x | o
    // What the first attacker gives back. A list sweeps it, which is what repricing the
    // seat needs once the rules stop alternating it.
    handicaps: arg('seed-handicap', null) === null ? [] : sizes(arg('seed-handicap', '0')),
    // Mark pairs stated outright, as the rules table does: --marks 2/4,1/4 sweeps two rows.
    markPairs: (arg('marks', null) ?? '').split(',').filter(Boolean)
      .map((pair) => pair.split('/').map(Number)),
    // Extra opening marks for the short team. Left unset it is the rule's own number for
    // the arena, which differs between the two; given a list it sweeps, which is how that
    // number was found.
    shortMarkses: arg('short-marks', null) === null ? [] : sizes(arg('short-marks', '0')),
    headStarts: sizes(arg('head-start', '0')),      // points the short team starts on
    shortXps: sizes(arg('short-xp', '0')),          // upgrade points its players start with
    teams: process.argv.includes('--teams'),     // report the uneven-turnout table
    economy: process.argv.includes('--economy'),   // report the economy table instead
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    out: arg('out', null),
  };

  if (process.argv.includes('--report')) {
    const saved = JSON.parse(readFileSync(opts.out, 'utf8'));
    if (saved.opts.pair) reportPaired(saved.rows);
    else if (saved.opts.teams) reportTeams(saved.rows);
    else if (saved.opts.economy) reportEconomy(saved.rows);
    else report(saved.rows);
    return;
  }

  // Allocating a whole number of players over a whole number of spaces is lumpy, and one
  // run of one size can land on a shape its neighbours do not share, so --reps runs each
  // size from several seeds and sums them. The hand table is loaded once and shared.
  const pool = loadHands(opts.handsFile);

  const prices = opts.swapCosts.flatMap((swapCost) =>
    opts.cardCosts.map((cardCost) => ({ swapCost, cardCost })));
  // The turnout, as the pair the round is played with: how short team 1 is and what team
  // 2 gives back for it. A full turnout owes nothing, so the handicaps collapse to one.
  const seats = (arena) => (opts.markPairs.length
    ? opts.markPairs.map((mark_pair) => ({ mark_pair, seed_handicap: 0 }))
    : (opts.handicaps.length ? opts.handicaps : [HANDICAP[arena] ?? HANDICAP.small])
      .map((seed_handicap) => ({ seed_handicap, mark_pair: undefined })));
  const turnouts = (arena) => opts.shorts.flatMap((short) => (short
    ? opts.shortHandicaps.flatMap((h) => (opts.shortMarkses.length
      ? opts.shortMarkses : [SHORT_MARKS[arena] ?? SHORT_MARKS.small]).flatMap((m) =>
      opts.headStarts.flatMap((head) => opts.shortXps.map((xp) => ({
        short, short_handicap: h, short_marks: m, head_start: head, short_xp: xp,
      })))))
    : [{ short, short_handicap: 0, short_marks: 0, head_start: 0, short_xp: 0 }]));

  const configs = opts.arenas.flatMap((arena, ai) =>
    opts.sizes.flatMap((size, k) => prices.flatMap((price) =>
      turnouts(arena).flatMap((turnout) => seats(arena).flatMap((seat) =>
      Array.from({ length: opts.reps }, (_, rep) => ({
        ...opts, ...price, ...turnout, ...seat, arena, size, rep, pool,
        first_seat: { x: 0, o: 1 }[opts.first ?? (turnout.short ? 'x' : 'alternate')] ?? null,
        pos: WEIGHTS[arena] ?? WEIGHTS.small,
        seed_marks: SEED_PAIRS[arena] ?? SEED_PAIRS.small,
        ...seat,
        sizes: undefined, arenas: undefined, swapCosts: undefined, cardCosts: undefined,
        shorts: undefined, shortHandicaps: undefined, shortMarkses: undefined,
        headStarts: undefined, shortXps: undefined, handicaps: undefined,
        markPairs: undefined,
        // The same seed across prices, so a price is read against the same rounds.
        seed: opts.seed + 1000 * k + 97 * rep + 13 * ai,
      })))))));

  const started = Date.now();
  const tallies = opts.workers > 1 && configs.length > 1
    ? await runConfigs(configs, opts.workers) : configs.map(dispatch);

  const rows = opts.pair
    ? group(tallies.map((p) => p[0])).map(row)
      .map((a, i) => [a, group(tallies.map((p) => p[1])).map(row)[i]])
      .sort((a, b) => a[0].size - b[0].size)
    : group(tallies).map(row)
      .sort((a, b) => a.arena.localeCompare(b.arena) || (a.size - b.size)
        || (a.short - b.short) || (a.shortHandicap - b.shortHandicap)
        || (a.shortMarks - b.shortMarks)
        || (a.headStart - b.headStart) || (a.shortXp - b.shortXp)
        || (a.swapCost - b.swapCost) || (a.cardCost - b.cardCost));
  if (opts.pair) reportPaired(rows);
  else if (opts.teams) reportTeams(rows);
  else if (opts.economy) reportEconomy(rows);
  else report(rows);
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
  combinations, attackPlan, defencePlan, zoneBuckets, LADDER,
};

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
