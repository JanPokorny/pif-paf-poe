"""Measure first-player advantage over diverse random loadouts, with paired games.

For each random pair of hands (A, B), play two games:
  - Game 1: A as first (seat X), B as second (seat O)
  - Game 2: B as first (seat X), A as second (seat O)
Tally wins by *seat* (first vs second), not by hand. Hand-strength asymmetry
cancels across each pair, leaving the first-mover advantage.

Pass --rule to test rule variants (see evaluator.VALID_RULES).
"""

import argparse
import random
import time

from evaluator import (
    TYPES, VALID_RULES, parse_rules, play_games_parallel, random_hand, pool_for_rules,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=300, help="random hand pairs (each plays 2 games)")
    ap.add_argument("--iters", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=[],
                    help=f"rule variant (repeatable or comma-separated); valid: {','.join(sorted(VALID_RULES))}")
    ap.add_argument("--veto", action="append", default=[],
                    help="stone type(s) to exclude from the random-hand pool (repeatable or comma-separated)")
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

    # Build all game specs up front (hand generation stays sequential/deterministic).
    specs = []
    for p in range(args.pairs):
        ha = random_hand(rng, pool=pool)
        hb = random_hand(rng, pool=pool)
        for first_hand_is_a in (True, False):
            hx = ha if first_hand_is_a else hb
            ho = hb if first_hand_is_a else ha
            specs.append((hx, ho, "X", rules, "mcts", args.iters, None, rng.randrange(1 << 30)))

    t0 = time.time()
    results = play_games_parallel(specs, processes=args.processes)
    first_wins = sum(1 for w, *_ in results if w == "X")
    second_wins = len(results) - first_wins
    games = len(results)

    total = first_wins + second_wins
    print()
    if rules:
        print(f"rules: {','.join(sorted(rules))}")
    else:
        print("rules: (vanilla)")
    if veto:
        print(f"veto: {','.join(sorted(veto))}  (pool: {','.join(pool)})")
    print(f"games: {total}")
    print(f"first-player wins:  {first_wins}  ({100*first_wins/total:.1f}%)")
    print(f"second-player wins: {second_wins} ({100*second_wins/total:.1f}%)")
    # 95% CI on first-player share via normal approx
    p_hat = first_wins / total
    se = (p_hat * (1 - p_hat) / total) ** 0.5
    lo, hi = p_hat - 1.96 * se, p_hat + 1.96 * se
    print(f"95% CI on first-win share: {100*lo:.1f}% – {100*hi:.1f}%")
    print(f"elapsed: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
