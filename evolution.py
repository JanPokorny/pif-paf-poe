"""Evolutionary tournament — 20 players adapt their hands via mutation.

Setup:
- N players initialized with uniform random hands.
- Each round: pick two distinct players uniformly, play one game (first mover
  also chosen uniformly).
- Each player remembers their last 3 outcomes.
- On 3 losses in a row, the player replaces one random slot in their hand
  with a uniform random stone type, then clears their memory.

Reports population stone composition periodically; shows final hands ranked by
wins.
"""

import argparse
import random
import time
from collections import Counter, deque

from evaluator import TYPES, format_hand, make_agent, play_game, random_hand


class Player:
    def __init__(self, hand, pid):
        self.hand = list(hand)
        self.pid = pid
        self.history = deque(maxlen=3)
        self.wins = 0
        self.losses = 0
        self.mutations = 0

    def record(self, won):
        self.history.append("W" if won else "L")
        if won:
            self.wins += 1
        else:
            self.losses += 1

    def should_mutate(self):
        return len(self.history) == 3 and all(x == "L" for x in self.history)

    def mutate(self, rng):
        idx = rng.randrange(5)
        old = self.hand[idx]
        new_type = rng.choice(TYPES)
        self.hand[idx] = new_type
        self.history.clear()
        self.mutations += 1
        return idx, old, new_type


def stone_dist(players):
    counter = Counter()
    for p in players:
        for s in p.hand:
            counter[s] += 1
    total = sum(counter.values())
    return {t: 100 * counter.get(t, 0) / total for t in TYPES}


def fmt_dist(d):
    return "  ".join(f"{t[:4]:>4}={d[t]:>4.1f}" for t in TYPES)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--population", type=int, default=20)
    ap.add_argument("--games", type=int, default=200)
    ap.add_argument("--iters", type=int, default=50)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--report-every", type=int, default=50)
    ap.add_argument("--verbose-mutations", action="store_true")
    ap.add_argument("--snapshot-file", default=None,
                    help="TSV file: game_no, stone, count (long format), for plotting")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    agent = make_agent("mcts", args.iters, None, rng)

    players = [Player(random_hand(rng), i) for i in range(args.population)]
    print(f"population={args.population}  games={args.games}  iters={args.iters}  seed={args.seed}")
    print(f"  init: {fmt_dist(stone_dist(players))}")

    snapshot_rows = []
    if args.snapshot_file:
        d = stone_dist(players)
        for t in TYPES:
            snapshot_rows.append((0, t, d[t]))

    t0 = time.time()
    mutations_total = 0
    for g in range(args.games):
        i, j = rng.sample(range(args.population), 2)
        pi, pj = players[i], players[j]
        first = rng.choice(("X", "O"))
        w, _, _, _ = play_game(pi.hand, pj.hand, first, agent, agent)
        pi_won = (w == "X")
        pi.record(pi_won)
        pj.record(not pi_won)
        for p in (pi, pj):
            if p.should_mutate():
                idx, old, new = p.mutate(rng)
                mutations_total += 1
                if args.verbose_mutations:
                    print(f"  game {g+1}: p{p.pid} mutate slot {idx}: {old} -> {new}")
        if (g + 1) % args.report_every == 0:
            d = stone_dist(players)
            elapsed = time.time() - t0
            print(f"  g={g+1:>5}  mut={mutations_total:>4}  {elapsed:>5.1f}s  {fmt_dist(d)}")
            if args.snapshot_file:
                for t in TYPES:
                    snapshot_rows.append((g + 1, t, d[t]))

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s ({args.games/elapsed:.1f} g/s). total mutations: {mutations_total}")
    print(f"  final: {fmt_dist(stone_dist(players))}")

    # Final player hands sorted by wins
    print("\nFinal player hands (sorted by wins):")
    for p in sorted(players, key=lambda p: -p.wins):
        wr = 100 * p.wins / max(1, p.wins + p.losses)
        print(f"  p{p.pid:>2}  W={p.wins:>3}  L={p.losses:>3}  win%={wr:>4.1f}  mut={p.mutations:>2}  {format_hand(p.hand)}")

    if args.snapshot_file:
        with open(args.snapshot_file, "w") as f:
            f.write("game\tstone\tpct\n")
            for game_no, t, pct in snapshot_rows:
                f.write(f"{game_no}\t{t}\t{pct:.2f}\n")
        print(f"\nSnapshot data written to {args.snapshot_file} ({len(snapshot_rows)} rows)")


if __name__ == "__main__":
    main()
