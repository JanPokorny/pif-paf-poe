"""Sweep: veto each stone type in turn and report effect on turn-distribution
and first-player win rate, plus a vanilla baseline.

For each veto choice, runs `--pairs` random paired games (each pair plays
both A-first and B-first to cancel hand-strength bias), tallies the
terminating-turn × winner-side distribution, and prints a compact comparison
table at the end.
"""

import argparse
import random
import time
from collections import defaultdict

from evaluator import (
    TYPES, make_agent, play_game, random_hand,
)


def run(pairs, iters, seed, pool, rng):
    agent = make_agent("mcts", iters, None, rng)
    per_turn = defaultdict(lambda: {"first": 0, "second": 0})
    first_total = 0
    second_total = 0
    for _ in range(pairs):
        ha = random_hand(rng, pool)
        hb = random_hand(rng, pool)
        for first_hand_is_a in (True, False):
            hx = ha if first_hand_is_a else hb
            ho = hb if first_hand_is_a else ha
            w, _, _, turns = play_game(hx, ho, "X", agent, agent)
            side = "first" if w == "X" else "second"
            per_turn[turns][side] += 1
            if side == "first":
                first_total += 1
            else:
                second_total += 1
    return per_turn, first_total, second_total


def fmt_pct(n, total):
    return f"{100 * n / total:.1f}%" if total else "  -  "


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=250)
    ap.add_argument("--iters", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()

    sweeps = [("(none)", TYPES)] + [(t, [x for x in TYPES if x != t]) for t in TYPES]

    summary = []  # (label, first%, end5%, end6%, end7%, end8plus%, total)
    detail = {}   # label -> per_turn dict

    t0 = time.time()
    for label, pool in sweeps:
        rng = random.Random(args.seed)  # same seed per veto for reproducibility/cross-comparability
        sub_t0 = time.time()
        per_turn, first_total, second_total = run(args.pairs, args.iters, args.seed, pool, rng)
        total = first_total + second_total
        # Distribution by terminating turn
        end5 = sum(per_turn[t]["first"] + per_turn[t]["second"] for t in per_turn if t == 5)
        end6 = sum(per_turn[t]["first"] + per_turn[t]["second"] for t in per_turn if t == 6)
        end7 = sum(per_turn[t]["first"] + per_turn[t]["second"] for t in per_turn if t == 7)
        end8plus = sum(per_turn[t]["first"] + per_turn[t]["second"] for t in per_turn if t >= 8)
        summary.append((label, first_total, second_total, end5, end6, end7, end8plus, total))
        detail[label] = per_turn
        print(f"  veto={label:<10} done in {time.time()-sub_t0:.1f}s  "
              f"first={first_total}/{total} ({100*first_total/total:.1f}%)", flush=True)

    print()
    print(f"All sweeps done in {time.time()-t0:.1f}s")
    print()
    print(f"{'veto':<10} {'games':>5}  {'first%':>7}  {'end@5':>6} {'end@6':>6} {'end@7':>6} {'end@8+':>6}")
    print(f"{'-'*10} {'-'*5}  {'-'*7}  {'-'*6} {'-'*6} {'-'*6} {'-'*6}")
    for label, ftot, _stot, e5, e6, e7, e8p, total in summary:
        print(f"{label:<10} {total:>5}  {fmt_pct(ftot,total):>7}  "
              f"{fmt_pct(e5,total):>6} {fmt_pct(e6,total):>6} {fmt_pct(e7,total):>6} {fmt_pct(e8p,total):>6}")

    print()
    # Per-veto turn × winner-side breakdown
    for label, _ftot, _stot, _e5, _e6, _e7, _e8p, total in summary:
        per_turn = detail[label]
        print(f"\n--- veto={label}  ({total} games) ---")
        print(f"{'turn':>4}  {'mover':>6}  {'first':>6}  {'second':>6}  {'total':>6}  {'%first':>7}")
        for t in sorted(per_turn.keys()):
            c = per_turn[t]
            f, s = c["first"], c["second"]
            sub = f + s
            mover = "first" if t % 2 == 1 else "second"
            print(f"{t:>4}  {mover:>6}  {f:>6}  {s:>6}  {sub:>6}  {fmt_pct(f, sub):>7}")


if __name__ == "__main__":
    main()
