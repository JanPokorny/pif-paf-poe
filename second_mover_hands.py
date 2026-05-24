"""Find which 5-stone hands have the best winrate as the SECOND mover.

There are C(7+5-1, 5) = 462 unique multisets. For each, play N games where
the candidate hand is the second mover (seat O) and the first mover's hand
is a fresh uniform-random sample. Tally the second-player win rate.

Outputs:
- Top/bottom hands by second-mover winrate.
- Aggregate by stone presence (does having stone X help?).
- Aggregate by stone count.
"""

import argparse
import itertools
import random
import time

from evaluator import TYPES, format_hand, make_agent, play_game, random_hand


def all_hands():
    return [list(h) for h in itertools.combinations_with_replacement(TYPES, 5)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games-per-hand", type=int, default=40,
                    help="games played as second mover vs random first-mover hand")
    ap.add_argument("--iters", type=int, default=60)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--top", type=int, default=15)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    agent = make_agent("mcts", args.iters, None, rng)
    hands = all_hands()
    total_target = len(hands) * args.games_per_hand
    print(f"enumerating {len(hands)} unique hands, {args.games_per_hand} games each "
          f"(target {total_target} games)")

    results = []  # (hand_tuple, wins_as_second, n)
    t0 = time.time()
    games_done = 0
    for hi, hand in enumerate(hands):
        wins = 0
        for _ in range(args.games_per_hand):
            opp = random_hand(rng)
            w, _, _, _ = play_game(opp, hand, "X", agent, agent)
            if w == "O":
                wins += 1
            games_done += 1
        results.append((tuple(hand), wins, args.games_per_hand))
        if (hi + 1) % 25 == 0:
            elapsed = time.time() - t0
            rate = games_done / elapsed
            eta = (total_target - games_done) / rate
            print(f"  hand {hi+1}/{len(hands)}  games {games_done}/{total_target}  "
                  f"{rate:.1f} g/s  eta {eta:.0f}s")

    avg_winrate = sum(w / n for _, w, n in results) / len(results)
    print(f"\nDone in {time.time()-t0:.1f}s. "
          f"Average second-mover win% across all hands: {100*avg_winrate:.1f}%")

    # Sort by win rate
    results.sort(key=lambda x: (x[1] / x[2], x[1]), reverse=True)

    n = args.games_per_hand
    # 95% CI per hand
    def ci(w):
        p = w / n
        se = (p * (1 - p) / n) ** 0.5
        return p, max(0.0, p - 1.96 * se), min(1.0, p + 1.96 * se)

    print(f"\nTop {args.top} hands by winrate AS SECOND mover (N={n} games each):")
    print(f"  {'win%':>6}  {'95% CI':>14}  {'W/N':>7}  hand")
    for hand, w, _ in results[:args.top]:
        p, lo, hi = ci(w)
        print(f"  {100*p:>5.1f}%  [{100*lo:>4.1f}, {100*hi:>4.1f}]  {w:>3}/{n}  {format_hand(list(hand))}")

    print(f"\nBottom {args.top} hands by winrate AS SECOND mover:")
    print(f"  {'win%':>6}  {'95% CI':>14}  {'W/N':>7}  hand")
    for hand, w, _ in results[-args.top:]:
        p, lo, hi = ci(w)
        print(f"  {100*p:>5.1f}%  [{100*lo:>4.1f}, {100*hi:>4.1f}]  {w:>3}/{n}  {format_hand(list(hand))}")

    print("\nMean second-mover winrate broken down by presence of stone:")
    print(f"  {'stone':>8}  {'with %':>8}  {'without %':>10}  {'Δ pp':>8}  {'hands with':>10}")
    for t in TYPES:
        with_t = [r for r in results if t in r[0]]
        without_t = [r for r in results if t not in r[0]]
        avg_with = sum(w / nn for _, w, nn in with_t) / len(with_t) if with_t else 0
        avg_without = sum(w / nn for _, w, nn in without_t) / len(without_t) if without_t else 0
        print(f"  {t:>8}  {100*avg_with:>7.1f}%  {100*avg_without:>9.1f}%  "
              f"{100*(avg_with-avg_without):>+7.2f}  {len(with_t):>10}")

    print("\nMean second-mover winrate by stone count in hand:")
    print(f"  {'stone':>8}  {'count=0':>8}  {'=1':>6}  {'=2':>6}  {'=3':>6}  {'=4':>6}  {'=5':>6}")
    for t in TYPES:
        row = [f"  {t:>8}"]
        for c in range(6):
            matching = [r for r in results if list(r[0]).count(t) == c]
            if matching:
                avg = sum(w / nn for _, w, nn in matching) / len(matching)
                row.append(f"  {100*avg:>5.1f}")
            else:
                row.append("    -  ")
        print("".join(row))

    # Save full ranking
    with open("hand_winrates.tsv", "w") as f:
        f.write("rank\twin_pct\twins\tgames\thand\n")
        for rk, (hand, w, nn) in enumerate(results, 1):
            f.write(f"{rk}\t{100*w/nn:.1f}\t{w}\t{nn}\t{','.join(hand)}\n")
    print(f"\nFull ranking written to hand_winrates.tsv ({len(results)} rows).")


if __name__ == "__main__":
    main()
