"""Class matchup evaluator.

Two players A and B each carry a Class (or none). They play paired games
swapping seats so seat advantage cancels, letting us read each class's
standalone power and the residual first/second-mover split.

  Game 1: A = X (first),  B = O (second)
  Game 2: B = X (first),  A = O (second)

Use --rule to also apply global rules (so e.g. you can compare a class to
its global-rule equivalent).
"""

import argparse
import random
import time

from evaluator import (
    VALID_CLASSES, VALID_RULES, parse_rules, play_games_parallel, random_hand, pool_for_rules,
)


def parse_class(name):
    if name in (None, "", "none"):
        return None
    if name not in VALID_CLASSES:
        raise SystemExit(f"unknown class {name!r}; valid: {','.join(sorted(VALID_CLASSES))}, none")
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--class-a", default="none", help=f"player A class ({','.join(sorted(VALID_CLASSES))},none)")
    ap.add_argument("--class-b", default="none", help="player B class")
    ap.add_argument("--pairs", type=int, default=500, help="random hand pairs (each plays 2 games, seats swapped)")
    ap.add_argument("--iters", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=[],
                    help=f"global rule(s); valid: {','.join(sorted(VALID_RULES))}")
    ap.add_argument("--processes", type=int, default=None)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    class_a = parse_class(args.class_a)
    class_b = parse_class(args.class_b)
    pool = pool_for_rules(rules)

    # Build specs. Track per game who (A/B) is the first mover.
    specs = []
    first_is_a = []  # True if the X (first) seat is player A in this game
    for _ in range(args.pairs):
        ha = random_hand(rng, pool=pool)
        hb = random_hand(rng, pool=pool)
        # Game 1: A first
        specs.append((ha, hb, "X", rules, "mcts", args.iters, None, rng.randrange(1 << 30),
                      {"X": class_a, "O": class_b}))
        first_is_a.append(True)
        # Game 2: B first
        specs.append((hb, ha, "X", rules, "mcts", args.iters, None, rng.randrange(1 << 30),
                      {"X": class_b, "O": class_a}))
        first_is_a.append(False)

    t0 = time.time()
    results = play_games_parallel(specs, processes=args.processes)

    a_wins = b_wins = 0
    first_wins = second_wins = 0
    for (w, *_), fa in zip(results, first_is_a):
        first_won = (w == "X")
        if first_won:
            first_wins += 1
        else:
            second_wins += 1
        # Map seat winner to player A/B
        if (first_won and fa) or (not first_won and not fa):
            a_wins += 1
        else:
            b_wins += 1

    total = a_wins + b_wins
    label_a = class_a or "none"
    label_b = class_b or "none"

    def ci(x):
        p = x / total
        se = (p * (1 - p) / total) ** 0.5
        return 100 * p, 100 * (p - 1.96 * se), 100 * (p + 1.96 * se)

    print()
    if rules:
        print(f"rules: {','.join(sorted(rules))}")
    print(f"matchup: A={label_a}  vs  B={label_b}   ({total} games, {args.pairs} pairs)")
    pa, loa, hia = ci(a_wins)
    pb, lob, hib = ci(b_wins)
    print(f"  A ({label_a:13}) wins: {a_wins:5}  {pa:5.1f}%  [{loa:.1f}, {hia:.1f}]")
    print(f"  B ({label_b:13}) wins: {b_wins:5}  {pb:5.1f}%  [{lob:.1f}, {hib:.1f}]")
    pf, lof, hif = ci(first_wins)
    print(f"  first-mover wins: {first_wins:5}  {pf:5.1f}%  [{lof:.1f}, {hif:.1f}]   (seat split)")
    print(f"elapsed: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
