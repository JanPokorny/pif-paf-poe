"""Genetic algorithm: tournament selection on hand population.

Population: 462 hands, initialized as all unique 5-stone multisets.
Each generation:
  1. Tournament — random pairings, each hand plays ~K games (each game has a
     random first mover); fitness = win rate.
  2. Sort by fitness; bottom 10% eliminated, top 10% duplicated.
Convergence: number of unique hands drops below threshold, or G generations.

Also accumulates per-hand-TYPE first/second mover stats across every
generation, so the final report shows defensive vs aggressive value for
each surviving hand independent of how many individuals carried it.
"""

import argparse
import itertools
import random
import time
from collections import Counter, defaultdict

from evaluator import TYPES, VALID_RULES, format_hand, parse_rules, play_games_parallel, pool_for_rules


def all_hand_tuples(pool=None):
    pool = pool if pool is not None else [t for t in TYPES if t != "stinky_shift"]
    return [tuple(sorted(h)) for h in itertools.combinations_with_replacement(pool, 5)]


def _empty_stats():
    return {"games_first": 0, "wins_first": 0, "games_second": 0, "wins_second": 0}


def tournament(population, games_per_hand, iters, rng, rules, hand_stats, processes):
    n = len(population)
    wins = [0] * n
    games_played = [0] * n
    total = games_per_hand * n // 2
    # Pre-draw all pairings (deterministic from rng), then play in parallel.
    pairings = []  # (first_idx, second_idx)
    specs = []
    for _ in range(total):
        i, j = rng.sample(range(n), 2)
        if rng.random() < 0.5:
            first_idx, second_idx = i, j
        else:
            first_idx, second_idx = j, i
        pairings.append((first_idx, second_idx))
        specs.append((list(population[first_idx]), list(population[second_idx]),
                      "X", rules, "mcts", iters, None, rng.randrange(1 << 30)))
    results = play_games_parallel(specs, processes=processes)
    for (first_idx, second_idx), (w, *_rest) in zip(pairings, results):
        first_key = population[first_idx]
        second_key = population[second_idx]
        hand_stats[first_key]["games_first"] += 1
        hand_stats[second_key]["games_second"] += 1
        if w == "X":
            wins[first_idx] += 1
            hand_stats[first_key]["wins_first"] += 1
        else:
            wins[second_idx] += 1
            hand_stats[second_key]["wins_second"] += 1
        games_played[first_idx] += 1
        games_played[second_idx] += 1
    fitness = [wins[k] / max(1, games_played[k]) for k in range(n)]
    return fitness, wins, games_played


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games-per-hand", type=int, default=8)
    ap.add_argument("--generations", type=int, default=25)
    ap.add_argument("--elim-pct", type=float, default=10.0)
    ap.add_argument("--iters", type=int, default=40)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--diversity-threshold", type=int, default=5,
                    help="stop when number of unique hands drops to/below this")
    ap.add_argument("--snapshot-file", default=None)
    ap.add_argument("--rule", action="append", default=[],
                    help=f"rule variant (repeatable or comma-separated); valid: {','.join(sorted(VALID_RULES))}")
    ap.add_argument("--veto", action="append", default=[],
                    help="stone type(s) to exclude from the hand pool (repeatable or comma-separated)")
    ap.add_argument("--processes", type=int, default=None, help="worker processes (default: all cores)")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    veto = set()
    for v in args.veto:
        for part in v.split(","):
            part = part.strip()
            if part:
                if part not in TYPES:
                    raise SystemExit(f"unknown stone type {part!r}; valid: {','.join(TYPES)}")
                veto.add(part)
    pool = [t for t in pool_for_rules(rules) if t not in veto]
    population = all_hand_tuples(pool=pool)
    n = len(population)
    elim = max(1, int(n * args.elim_pct / 100))
    print(f"population={n}  elim/dup={elim}  games_per_hand={args.games_per_hand}  iters={args.iters}")
    if veto:
        print(f"veto: {','.join(sorted(veto))}  (pool: {','.join(pool)})")
    if rules:
        print(f"rules: {','.join(sorted(rules))}")
    print(f"initial unique={len(set(population))}")

    hand_stats = defaultdict(_empty_stats)
    snapshot_rows = []
    t0 = time.time()
    for gen in range(args.generations):
        gt = time.time()
        fitness, wins, games_played = tournament(
            population, args.games_per_hand, args.iters, rng, rules, hand_stats, args.processes
        )
        ranked = sorted(range(n), key=lambda k: (fitness[k], wins[k]), reverse=True)
        top_idx = ranked[:elim]
        bottom_idx = set(ranked[-elim:])
        new_pop = [population[k] for k in range(n) if k not in bottom_idx]
        new_pop.extend(population[k] for k in top_idx)
        assert len(new_pop) == n

        unique = len(set(new_pop))
        counts = Counter(new_pop)
        most = counts.most_common(5)
        top_hand_idx = top_idx[0]
        top_hand = population[top_hand_idx]
        top_wr = fitness[top_hand_idx]
        gt_d = time.time() - gt
        print(f"gen {gen+1:>3}: unique={unique:>4}  top_hand={format_hand(list(top_hand))} ({top_wr*100:.1f}%)  "
              f"  most-common[1]: {format_hand(list(most[0][0]))} x{most[0][1]}  ({gt_d:.1f}s)")
        if len(most) > 1:
            extras = "  ".join(f"{format_hand(list(h))} x{c}" for h, c in most[1:5])
            print(f"           top-5: {extras}")
        snapshot_rows.append((gen + 1, unique, most[0][1], "+".join(most[0][0]), top_wr))

        population = new_pop
        if unique <= args.diversity_threshold:
            print(f"\nConverged after gen {gen+1}: {unique} unique hands <= {args.diversity_threshold}.")
            break

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s ({elapsed/60:.1f} min)")

    # Top hands with first/second breakdown (lifetime stats across all generations)
    final_counts = Counter(population)
    print(f"\nFinal population (top 25 by count) with lifetime per-hand winrate:")
    header = (f"  {'count':>5}  {'%pop':>5}  {'as 1st':>14}  {'as 2nd':>14}  "
              f"{'combined':>9}  {'gap':>5}  {'games':>6}  hand")
    print(header)
    for hand, count in final_counts.most_common(25):
        s = hand_stats[hand]
        gf = s["games_first"]
        gs = s["games_second"]
        wf = s["wins_first"]
        ws = s["wins_second"]
        total = gf + gs
        first_wr = wf / gf if gf else 0
        second_wr = ws / gs if gs else 0
        combined_wr = (wf + ws) / max(1, total)
        gap = (first_wr - second_wr) * 100
        print(f"  {count:>4}x  {100*count/n:>4.1f}%  "
              f"{100*first_wr:>5.1f}% ({wf:>3}/{gf:>3})  "
              f"{100*second_wr:>5.1f}% ({ws:>3}/{gs:>3})  "
              f"{100*combined_wr:>7.1f}%  {gap:>+4.0f}  {total:>6}  "
              f"{format_hand(list(hand))}")

    # Best defenders (highest as-second winrate among hands with enough samples)
    print(f"\nTop 15 hands by as-second winrate (min 50 games as second, across all generations):")
    print(f"  {'as 2nd':>10}  {'as 1st':>10}  {'games_2nd':>9}  hand")
    by_second = []
    for hand, s in hand_stats.items():
        if s["games_second"] >= 50:
            wr2 = s["wins_second"] / s["games_second"]
            wr1 = s["wins_first"] / s["games_first"] if s["games_first"] else 0
            by_second.append((hand, wr2, wr1, s["games_second"]))
    by_second.sort(key=lambda x: -x[1])
    for hand, wr2, wr1, g2 in by_second[:15]:
        print(f"  {100*wr2:>8.1f}%  {100*wr1:>8.1f}%  {g2:>9}  {format_hand(list(hand))}")

    if args.snapshot_file:
        with open(args.snapshot_file, "w") as f:
            f.write("gen\tunique\ttop_count\ttop_hand\ttop_winrate\n")
            for row in snapshot_rows:
                f.write("\t".join(str(x) for x in row) + "\n")
        print(f"\nSnapshot written to {args.snapshot_file}")


if __name__ == "__main__":
    main()
