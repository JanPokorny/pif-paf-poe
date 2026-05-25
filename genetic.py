"""Genetic algorithm: tournament selection on hand population.

Population: 462 hands, initialized as all unique 5-stone multisets.
Each generation:
  1. Tournament — random pairings, each hand plays ~K games (each game has a
     random first mover); fitness = win rate.
  2. Sort by fitness; bottom 10% eliminated, top 10% duplicated.
Convergence: number of unique hands drops below threshold, or G generations.
"""

import argparse
import itertools
import random
import time
from collections import Counter

from evaluator import TYPES, format_hand, make_agent, play_game


def all_hand_tuples():
    return [tuple(sorted(h)) for h in itertools.combinations_with_replacement(TYPES, 5)]


def tournament(population, games_per_hand, agent, rng):
    n = len(population)
    wins = [0] * n
    games_played = [0] * n
    total = games_per_hand * n // 2
    for _ in range(total):
        i, j = rng.sample(range(n), 2)
        hi, hj = list(population[i]), list(population[j])
        if rng.random() < 0.5:
            w, _, _, _ = play_game(hi, hj, "X", agent, agent)
            winner_idx = i if w == "X" else j
        else:
            w, _, _, _ = play_game(hj, hi, "X", agent, agent)
            winner_idx = j if w == "X" else i
        wins[winner_idx] += 1
        games_played[i] += 1
        games_played[j] += 1
    fitness = [wins[k] / max(1, games_played[k]) for k in range(n)]
    return fitness, wins, games_played


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games-per-hand", type=int, default=6)
    ap.add_argument("--generations", type=int, default=25)
    ap.add_argument("--elim-pct", type=float, default=10.0)
    ap.add_argument("--iters", type=int, default=50)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--diversity-threshold", type=int, default=5,
                    help="stop when number of unique hands drops to/below this")
    ap.add_argument("--snapshot-file", default=None)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    agent = make_agent("mcts", args.iters, None, rng)

    population = all_hand_tuples()
    n = len(population)
    elim = max(1, int(n * args.elim_pct / 100))
    print(f"population={n}  elim/dup={elim}  games_per_hand={args.games_per_hand}  iters={args.iters}")
    print(f"initial unique={len(set(population))}")

    snapshot_rows = []  # gen, unique, top_count, top_hand, top_wr
    t0 = time.time()
    for gen in range(args.generations):
        gt = time.time()
        fitness, wins, games_played = tournament(population, args.games_per_hand, agent, rng)
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
    print("\nFinal population (top 25 by count):")
    for hand, count in Counter(population).most_common(25):
        print(f"  {count:>4}x  ({100*count/n:>5.1f}%)  {format_hand(list(hand))}")

    if args.snapshot_file:
        with open(args.snapshot_file, "w") as f:
            f.write("gen\tunique\ttop_count\ttop_hand\ttop_winrate\n")
            for row in snapshot_rows:
                f.write("\t".join(str(x) for x in row) + "\n")
        print(f"\nSnapshot written to {args.snapshot_file}")


if __name__ == "__main__":
    main()
