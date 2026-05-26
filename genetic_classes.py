"""Genetic algorithm over (hand, class) genomes under the global Balancer rule.

Genome = a sorted 5-stone hand PLUS a class drawn from {none} + VALID_CLASSES.
The global rule regular_chain_any ("any after regular", aka Balancer) is always
on. Population starts as every (hand x class) combo and is culled/duplicated
each generation (bottom elim% removed, top elim% duplicated).

Tracks lifetime first/second-mover winrate per genome and an aggregate by
class, so we can see which classes thrive and which (hand, class) combos win.
"""

import argparse
import itertools
import random
import time
from collections import Counter, defaultdict

from evaluator import (
    TYPES, VALID_CLASSES, format_hand, parse_rules, play_games_parallel, pool_for_rules,
)

CLASS_OPTIONS = [None] + sorted(VALID_CLASSES)


def all_genomes(pool):
    hands = [tuple(sorted(h)) for h in itertools.combinations_with_replacement(pool, 5)]
    return [(h, c) for h in hands for c in CLASS_OPTIONS]


def _empty():
    return {"games_first": 0, "wins_first": 0, "games_second": 0, "wins_second": 0}


def genome_label(g):
    hand, cls = g
    return f"{format_hand(list(hand))}  [{cls or 'none'}]"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games-per-genome", type=int, default=4)
    ap.add_argument("--generations", type=int, default=22)
    ap.add_argument("--elim-pct", type=float, default=12.0)
    ap.add_argument("--iters", type=int, default=40)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=["regular_chain_any"],
                    help="global rule(s); default regular_chain_any (the Balancer rule)")
    ap.add_argument("--veto", action="append", default=[],
                    help="stone type(s) to exclude from the hand pool")
    ap.add_argument("--processes", type=int, default=None)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    veto = set()
    for v in args.veto:
        for part in v.split(","):
            part = part.strip()
            if part:
                veto.add(part)
    pool = [t for t in pool_for_rules(rules) if t not in veto]

    population = all_genomes(pool)
    n = len(population)
    elim = max(1, int(n * args.elim_pct / 100))
    print(f"population={n} ({len(set(g[0] for g in population))} hands x {len(CLASS_OPTIONS)} classes)  "
          f"elim/dup={elim}  games/genome={args.games_per_genome}  iters={args.iters}")
    print(f"rules: {','.join(sorted(rules)) if rules else '(none)'}")

    stats = defaultdict(_empty)
    t0 = time.time()
    for gen in range(args.generations):
        gt = time.time()
        total = args.games_per_genome * n // 2
        pairings = []
        specs = []
        for _ in range(total):
            i, j = rng.sample(range(n), 2)
            if rng.random() < 0.5:
                fi, si = i, j
            else:
                fi, si = j, i
            pairings.append((fi, si))
            hf, cf = population[fi]
            hs, cs = population[si]
            specs.append((list(hf), list(hs), "X", rules, "mcts", args.iters, None,
                          rng.randrange(1 << 30), {"X": cf, "O": cs}))
        results = play_games_parallel(specs, processes=args.processes)

        wins = [0] * n
        played = [0] * n
        for (fi, si), (w, *_rest) in zip(pairings, results):
            gf, gs = population[fi], population[si]
            stats[gf]["games_first"] += 1
            stats[gs]["games_second"] += 1
            if w == "X":
                wins[fi] += 1
                stats[gf]["wins_first"] += 1
            else:
                wins[si] += 1
                stats[gs]["wins_second"] += 1
            played[fi] += 1
            played[si] += 1
        fitness = [wins[k] / max(1, played[k]) for k in range(n)]

        ranked = sorted(range(n), key=lambda k: (fitness[k], wins[k]), reverse=True)
        top_idx = ranked[:elim]
        bottom = set(ranked[-elim:])
        new_pop = [population[k] for k in range(n) if k not in bottom]
        new_pop.extend(population[k] for k in top_idx)
        population = new_pop

        # Class composition of the surviving population
        cls_count = Counter(c for _, c in population)
        comp = "  ".join(f"{(c or 'none')[:5]}={cls_count.get(c,0)}" for c in CLASS_OPTIONS)
        uniq = len(set(population))
        print(f"gen {gen+1:>3}: unique={uniq:>4}  ({time.time()-gt:.0f}s)  classpop: {comp}")

    print(f"\nDone in {time.time()-t0:.1f}s ({(time.time()-t0)/60:.1f} min)")

    # Final population class composition
    final = Counter(c for _, c in population)
    tot = len(population)
    print(f"\nFinal population class share ({tot} individuals):")
    for c in sorted(CLASS_OPTIONS, key=lambda c: -final.get(c, 0)):
        print(f"  {(c or 'none'):14} {final.get(c,0):>5}  ({100*final.get(c,0)/tot:.1f}%)")

    # Lifetime winrate aggregated by class (across all generations)
    print(f"\nLifetime winrate by class (all generations):")
    print(f"  {'class':14} {'as 1st':>8} {'as 2nd':>8} {'combined':>9} {'games':>8}")
    by_class = defaultdict(lambda: [0, 0, 0, 0])  # wf, gf, ws, gs
    for (hand, cls), s in stats.items():
        b = by_class[cls]
        b[0] += s["wins_first"]; b[1] += s["games_first"]
        b[2] += s["wins_second"]; b[3] += s["games_second"]
    rows = []
    for c in CLASS_OPTIONS:
        wf, gf, ws, gs = by_class[c]
        tg = gf + gs
        if tg == 0:
            continue
        comb = (wf + ws) / tg
        rows.append((comb, c, wf, gf, ws, gs, tg))
    rows.sort(reverse=True)
    for comb, c, wf, gf, ws, gs, tg in rows:
        f1 = 100 * wf / gf if gf else 0
        f2 = 100 * ws / gs if gs else 0
        print(f"  {(c or 'none'):14} {f1:>7.1f}% {f2:>7.1f}% {100*comb:>8.1f}% {tg:>8}")

    # Top surviving (hand, class) genomes
    print(f"\nTop 25 surviving genomes by count, with lifetime winrate:")
    print(f"  {'cnt':>4} {'as1st':>6} {'as2nd':>6} {'comb':>6}  genome")
    for g, cnt in Counter(population).most_common(25):
        s = stats[g]
        gf, gs = s["games_first"], s["games_second"]
        f1 = 100 * s["wins_first"] / gf if gf else 0
        f2 = 100 * s["wins_second"] / gs if gs else 0
        comb = 100 * (s["wins_first"] + s["wins_second"]) / max(1, gf + gs)
        print(f"  {cnt:>4} {f1:>5.0f}% {f2:>5.0f}% {comb:>5.0f}%  {genome_label(g)}")


if __name__ == "__main__":
    main()
