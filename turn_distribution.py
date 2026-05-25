"""Tabulate game outcomes by terminating turn number and winner (first vs second).

Each random hand pair plays two games swapping which side moves first, so
hand-strength asymmetry cancels.

Turn numbering: turn 1 = first player's 1st turn, turn 2 = second player's 1st
turn, turn 3 = first player's 2nd turn, ... Odd turns belong to the first
player; the player who *just* completed the terminating turn either wins
(line) or loses (repeat).
"""

import argparse
import random
import time
from collections import defaultdict

from evaluator import (
    VALID_RULES, make_agent, parse_rules, play_game, random_hand,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=300)
    ap.add_argument("--iters", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=[],
                    help=f"rule variant (repeatable or comma-separated); valid: {','.join(sorted(VALID_RULES))}")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    agent = make_agent("mcts", args.iters, None, rng)

    # cells[turn][winner_side] = count;  winner_side ∈ {"first","second"}
    cells = defaultdict(lambda: {"first": 0, "second": 0})
    # also break down by reason
    cells_by_reason = defaultdict(lambda: {"first_line": 0, "second_line": 0,
                                            "first_repeat": 0, "second_repeat": 0})
    total = 0

    t0 = time.time()
    for p in range(args.pairs):
        ha = random_hand(rng, rules=rules)
        hb = random_hand(rng, rules=rules)
        for first_hand_is_a in (True, False):
            hx = ha if first_hand_is_a else hb
            ho = hb if first_hand_is_a else ha
            w, reason, _, turns = play_game(hx, ho, "X", agent, agent, rules=rules)
            # first player is always seated as X here
            side = "first" if w == "X" else "second"
            cells[turns][side] += 1
            key = side + ("_line" if reason == "line" else "_repeat")
            cells_by_reason[turns][key] += 1
            total += 1
        if (p + 1) % 50 == 0:
            elapsed = time.time() - t0
            print(f"  pair {p+1}/{args.pairs}  games {total}  ({total/elapsed:.1f} g/s)")

    print()
    print(f"rules: {','.join(sorted(rules)) if rules else '(vanilla)'}    games: {total}")
    print()

    turn_keys = sorted(cells.keys())
    print(f"{'turn':>4}  {'mover':>6}  {'first wins':>10}  {'second wins':>11}  {'total':>6}  {'%first':>7}  reasons (F_line / S_line / F_rep / S_rep)")
    cum_first = 0
    cum_second = 0
    for t in turn_keys:
        c = cells[t]
        first, second = c["first"], c["second"]
        sub = first + second
        mover = "first" if t % 2 == 1 else "second"
        pct_first = 100 * first / sub if sub else 0
        r = cells_by_reason[t]
        cum_first += first
        cum_second += second
        print(f"{t:>4}  {mover:>6}  {first:>10}  {second:>11}  {sub:>6}  {pct_first:>6.1f}%  "
              f"{r['first_line']:>3} / {r['second_line']:>3} / {r['first_repeat']:>3} / {r['second_repeat']:>3}")
    print()
    print(f"totals: first {cum_first} ({100*cum_first/total:.1f}%)   second {cum_second} ({100*cum_second/total:.1f}%)")

    # Aggregated by reason
    print()
    print("by termination reason:")
    line_first = sum(cells_by_reason[t]["first_line"] for t in turn_keys)
    line_second = sum(cells_by_reason[t]["second_line"] for t in turn_keys)
    rep_first = sum(cells_by_reason[t]["first_repeat"] for t in turn_keys)
    rep_second = sum(cells_by_reason[t]["second_repeat"] for t in turn_keys)
    print(f"  line:   first wins {line_first:>4}  second wins {line_second:>4}  (total {line_first+line_second})")
    print(f"  repeat: first wins {rep_first:>4}  second wins {rep_second:>4}  (total {rep_first+rep_second})")
    print(f"elapsed: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
