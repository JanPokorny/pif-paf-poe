"""One-off: measure first-player advantage over diverse random loadouts.

For each random pair of hands (A, B), play two games:
  - Game 1: A as first, B as second
  - Game 2: B as first, A as second
Tally wins by *seat* (first vs second), not by hand. Hand-strength asymmetry
cancels across the pair, leaving the first-mover advantage.
"""

import argparse
import random
import time

from evaluator import (
    make_agent, play_game, random_hand, format_hand,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=300, help="random hand pairs (each plays 2 games)")
    ap.add_argument("--iters", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    agent = make_agent("mcts", args.iters, None, rng)

    first_wins = 0
    second_wins = 0
    draws = 0
    games = 0
    by_first_player_letter = {"X": {"first": 0, "second": 0, "draw": 0},
                              "O": {"first": 0, "second": 0, "draw": 0}}

    t0 = time.time()
    for p in range(args.pairs):
        ha = random_hand(rng)
        hb = random_hand(rng)
        for first_hand_is_a in (True, False):
            # The first mover is always seated as X here (so "first" == X).
            hx = ha if first_hand_is_a else hb
            ho = hb if first_hand_is_a else ha
            w, _, _ = play_game(hx, ho, "X", agent, agent)
            games += 1
            if w == "X":
                first_wins += 1
                by_first_player_letter["X"]["first"] += 1
            elif w == "O":
                second_wins += 1
                by_first_player_letter["X"]["second"] += 1
            else:
                draws += 1
                by_first_player_letter["X"]["draw"] += 1
        if (p + 1) % 25 == 0:
            elapsed = time.time() - t0
            rate = games / elapsed
            print(f"  pair {p+1}/{args.pairs}  games {games}  first {first_wins}  second {second_wins}  draws {draws}  ({rate:.1f} g/s)")

    total = first_wins + second_wins + draws
    decisive = first_wins + second_wins
    print()
    print(f"games: {total}")
    print(f"first-player wins:  {first_wins}  ({100*first_wins/total:.1f}%)")
    print(f"second-player wins: {second_wins} ({100*second_wins/total:.1f}%)")
    print(f"draws:              {draws}  ({100*draws/total:.1f}%)")
    if decisive:
        print(f"first win share of decisive games: {100*first_wins/decisive:.1f}%")
    # 95% CI on first-player share of decisive games via normal approx
    if decisive:
        p_hat = first_wins / decisive
        se = (p_hat * (1 - p_hat) / decisive) ** 0.5
        lo, hi = p_hat - 1.96 * se, p_hat + 1.96 * se
        print(f"95% CI on first-win share (decisive): {100*lo:.1f}% – {100*hi:.1f}%")
    print(f"elapsed: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
