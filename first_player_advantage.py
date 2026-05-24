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
    VALID_RULES, make_agent, parse_rules, play_game, random_hand,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=300, help="random hand pairs (each plays 2 games)")
    ap.add_argument("--iters", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=[],
                    help=f"rule variant (repeatable or comma-separated); valid: {','.join(sorted(VALID_RULES))}")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    agent = make_agent("mcts", args.iters, None, rng)

    first_wins = 0
    second_wins = 0
    games = 0

    t0 = time.time()
    for p in range(args.pairs):
        ha = random_hand(rng)
        hb = random_hand(rng)
        for first_hand_is_a in (True, False):
            hx = ha if first_hand_is_a else hb
            ho = hb if first_hand_is_a else ha
            w, _, _ = play_game(hx, ho, "X", agent, agent, rules=rules)
            games += 1
            if w == "X":
                first_wins += 1
            else:
                second_wins += 1
        if (p + 1) % 25 == 0:
            elapsed = time.time() - t0
            rate = games / elapsed
            print(f"  pair {p+1}/{args.pairs}  games {games}  first {first_wins}  second {second_wins}  ({rate:.1f} g/s)")

    total = first_wins + second_wins
    print()
    if rules:
        print(f"rules: {','.join(sorted(rules))}")
    else:
        print("rules: (vanilla)")
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
