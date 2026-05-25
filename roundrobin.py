"""Round-robin between the top 20 surviving hands from the GA.

For every ordered pair (i, j), plays N games with hand i as first mover and j
as second. Reports:
  - 20×20 first-player-win-rate matrix
  - Per-hand ranking (overall, as first, as second, gap)
  - Self-play (i = j): isolates pure first-player advantage between identical
    optimized hands
  - Aggregate first-player share across all games
"""

import argparse
import random
import time

from evaluator import format_hand, make_agent, play_game


# Top 20 surviving hands from genetic.py run (seed=2026, 25 gens, K=8 games/hand)
TOP_HANDS = [
    ("regular", "shift", "2048", "rotate", "chain"),
    ("2048", "regular", "rotate", "chain", "chain"),
    ("chain", "magnet", "rotate", "rotate", "shift"),
    ("2048", "2048", "magnet", "rotate", "stinky"),
    ("chain", "regular", "rotate", "rotate", "rotate"),
    ("magnet", "rotate", "rotate", "rotate", "rotate"),
    ("2048", "2048", "chain", "rotate", "shift"),
    ("2048", "chain", "chain", "rotate", "shift"),
    ("2048", "2048", "chain", "chain", "stinky"),
    ("2048", "chain", "chain", "chain", "rotate"),
    ("2048", "chain", "magnet", "regular", "rotate"),
    ("2048", "2048", "2048", "rotate", "rotate"),
    ("2048", "regular", "rotate", "rotate", "stinky"),
    ("2048", "chain", "rotate", "shift", "stinky"),
    ("2048", "magnet", "rotate", "rotate", "rotate"),
    ("chain", "chain", "magnet", "rotate", "stinky"),
    ("chain", "chain", "chain", "regular", "rotate"),
    ("chain", "magnet", "regular", "rotate", "shift"),
    ("2048", "chain", "regular", "rotate", "rotate"),
    ("2048", "2048", "magnet", "rotate", "rotate"),
]


def short(hand) -> str:
    abbrev = {"regular": "Rg", "shift": "Sh", "2048": "20", "rotate": "Ro",
              "magnet": "Mg", "stinky": "Sk", "chain": "Ch"}
    return "".join(abbrev[s] for s in hand)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games-per-ordered-pair", type=int, default=80)
    ap.add_argument("--iters", type=int, default=40)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    agent = make_agent("mcts", args.iters, None, rng)

    n = len(TOP_HANDS)
    M_first_wins = [[0] * n for _ in range(n)]
    M_games = [[0] * n for _ in range(n)]
    first_total = second_total = 0

    target = n * n * args.games_per_ordered_pair
    print(f"round-robin: {n} hands, {args.games_per_ordered_pair} games per ordered pair, "
          f"iters={args.iters}, target {target} games")
    t0 = time.time()
    done = 0
    pair = 0
    for i in range(n):
        for j in range(n):
            pair += 1
            hi = list(TOP_HANDS[i])
            hj = list(TOP_HANDS[j])
            for _ in range(args.games_per_ordered_pair):
                w, _, _, _ = play_game(hi, hj, "X", agent, agent)
                if w == "X":
                    M_first_wins[i][j] += 1
                    first_total += 1
                else:
                    second_total += 1
                M_games[i][j] += 1
                done += 1
            if pair % 40 == 0 or pair == n * n:
                elapsed = time.time() - t0
                rate = done / elapsed
                eta = (target - done) / rate if rate > 0 else 0
                print(f"  pair {pair}/{n*n}  games {done}/{target}  {rate:.1f} g/s  eta {eta:.0f}s")

    elapsed = time.time() - t0
    total = first_total + second_total
    print(f"\nDone in {elapsed:.1f}s ({elapsed/60:.1f} min)")

    # First-player advantage across all games
    print()
    print(f"FIRST-PLAYER ADVANTAGE among optimized hands:")
    print(f"  first  wins: {first_total:>6} ({100*first_total/total:.1f}%)")
    print(f"  second wins: {second_total:>6} ({100*second_total/total:.1f}%)")
    se = (0.25 / total) ** 0.5
    p = first_total / total
    print(f"  95% CI on first-win share: {100*(p-1.96*se):.1f}% – {100*(p+1.96*se):.1f}%")

    # Self-play: pure first-player effect with identical optimized hands
    self_first = sum(M_first_wins[i][i] for i in range(n))
    self_total = sum(M_games[i][i] for i in range(n))
    print()
    print(f"SELF-PLAY (same hand on both sides) — isolates first-player effect:")
    print(f"  first wins: {self_first}/{self_total} = {100*self_first/self_total:.1f}%")
    se_sp = (0.25 / self_total) ** 0.5
    p_sp = self_first / self_total
    print(f"  95% CI: {100*(p_sp-1.96*se_sp):.1f}% – {100*(p_sp+1.96*se_sp):.1f}%")

    # Per-hand stats (excluding self-play, since same hand vs itself doesn't rank)
    print()
    print(f"Per-hand ranking (excluding self-play):")
    print(f"  {'#':>3}  {'overall':>7}  {'as first':>8}  {'as second':>9}  {'1st-2nd gap':>11}  hand")
    stats = []
    for i in range(n):
        wf = sum(M_first_wins[i][j] for j in range(n) if j != i)
        gf = sum(M_games[i][j] for j in range(n) if j != i)
        ws = sum(M_games[j][i] - M_first_wins[j][i] for j in range(n) if j != i)
        gs = sum(M_games[j][i] for j in range(n) if j != i)
        tw, tg = wf + ws, gf + gs
        stats.append((i, tw, tg, wf, gf, ws, gs))
    stats.sort(key=lambda x: -x[1] / x[2])
    for rank, (i, tw, tg, wf, gf, ws, gs) in enumerate(stats, 1):
        wr = 100 * tw / tg
        wfr = 100 * wf / gf
        wsr = 100 * ws / gs
        gap = wfr - wsr
        print(f"  {rank:>3}  {wr:>6.1f}%  {wfr:>7.1f}%  {wsr:>8.1f}%  {gap:>+10.1f}  {format_hand(list(TOP_HANDS[i]))}")

    # Compact 20×20 win% matrix
    print()
    print(f"First-player win% matrix [row=first, col=second]:")
    print(f"  {'idx':>3}  {'hand':>11}  | " + " ".join(f"{j:>3}" for j in range(n)))
    print(f"  {'':>3}  {'':>11}  | " + "-" * (4 * n))
    for i in range(n):
        row = f"  {i:>3}  {short(TOP_HANDS[i]):>11}  | "
        for j in range(n):
            if M_games[i][j] > 0:
                pct = 100 * M_first_wins[i][j] / M_games[i][j]
                row += f"{int(round(pct)):>3} "
            else:
                row += "  - "
        print(row)

    # Save matrix
    with open("roundrobin_matrix.tsv", "w") as f:
        f.write("i\tj\thand_i\thand_j\tgames\tfirst_wins\tfirst_pct\n")
        for i in range(n):
            for j in range(n):
                if M_games[i][j] > 0:
                    pct = 100 * M_first_wins[i][j] / M_games[i][j]
                    f.write(f"{i}\t{j}\t{format_hand(list(TOP_HANDS[i]))}\t"
                            f"{format_hand(list(TOP_HANDS[j]))}\t{M_games[i][j]}\t"
                            f"{M_first_wins[i][j]}\t{pct:.1f}\n")
    print("\nMatrix saved to roundrobin_matrix.tsv")


if __name__ == "__main__":
    main()
