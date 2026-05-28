"""Measure deterrence: does the opponent change behavior when our class is on?

For each class we compare the OPPONENT's action stats between two games on
the SAME (hands, seed): one with X holding the class, one with X classless.
If the opponent (O) plays differently in the class-on game, that's
deterrence even when the class never visibly "fires".

Metrics per class:
- set_in_stone: O's rate of playing movement stones (shift/2048/rotate/chain)
- polarized:    O's rate of playing magnet
- corny:        O's corner-cells held at game end

The matched-pair design controls for hand RNG and per-game seed; per-decision
MCTS noise is the only residual.
"""

import argparse
import multiprocessing as mp
import random
import time
from collections import Counter

from evaluator import (
    MOVEMENT_TYPES, CORNERS, make_agent, init_game_state, get_legal_actions,
    do_action, opp,
)


def play_and_count(spec):
    hx, ho, classes, iters, seed, rules = spec
    rng = random.Random(seed)
    agent = make_agent("mcts", iters, None, rng)
    s = init_game_state(hx, ho, "X", rules=rules, classes=classes)
    counts = {"O_movement": 0, "O_chain": 0, "O_magnet": 0, "O_total_placements": 0,
              "O_effects_applied": 0}
    moves = 0
    while s.phase != "gameOver" and moves < 600:
        acts = get_legal_actions(s)
        if not acts:
            break
        cp = s.current_player
        a = agent(s)
        if cp == "O" and a.get("type") == "place":
            counts["O_total_placements"] += 1
            ss = s.selected_stone
            if ss in MOVEMENT_TYPES:
                counts["O_movement"] += 1
            elif ss == "chain":
                counts["O_chain"] += 1
            elif ss == "magnet":
                counts["O_magnet"] += 1
        if cp == "O" and a.get("type") == "effect":
            counts["O_effects_applied"] += 1
        do_action(s, a)
        moves += 1
    # Final O corners
    counts["O_corners_end"] = sum(1 for c in CORNERS if s.board[c] and s.board[c].player == "O")
    counts["O_won"] = 1 if s.winner == "O" else 0
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", type=int, default=400)
    ap.add_argument("--iters", type=int, default=160)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=["regular_chain_any"])
    ap.add_argument("--processes", type=int, default=None)
    args = ap.parse_args()

    from evaluator import parse_rules, random_hand, pool_for_rules
    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    pool = pool_for_rules(rules)

    classes_under_test = ["corny", "set_in_stone", "polarized"]

    # Build matched-pair specs: for each (ha, hb, seed) and each class,
    # play one game with X=class and one with X=none.
    specs = []
    tags = []  # (class, "on" or "off")
    for _ in range(args.pairs):
        ha = random_hand(rng, pool=pool)
        hb = random_hand(rng, pool=pool)
        s_seed = rng.randrange(1 << 30)
        for cls in classes_under_test:
            for label in ("on", "off"):
                classes = {"X": cls if label == "on" else None, "O": None}
                specs.append((ha, hb, classes, args.iters, s_seed, rules))
                tags.append((cls, label))

    t0 = time.time()
    procs = args.processes or mp.cpu_count()
    with mp.Pool(procs) as pool_:
        results = pool_.map(play_and_count, specs, chunksize=max(1, len(specs)//(procs*8)))

    # Aggregate by class and label
    agg = {(c, l): Counter() for c in classes_under_test for l in ("on", "off")}
    n = {(c, l): 0 for c in classes_under_test for l in ("on", "off")}
    for tag, counts in zip(tags, results):
        for k, v in counts.items():
            agg[tag][k] += v
        n[tag] += 1

    print(f"\nDeterrence test ({args.pairs} matched pairs/class, iters={args.iters}, "
          f"rule={','.join(sorted(rules))})")
    print(f"X holds the class (or 'off' = none); O is always classless.\n")

    print(f"{'class':14} {'metric':28} {'on':>10} {'off':>10} {'Δ (on-off)':>12}")
    for c in classes_under_test:
        on, off = agg[(c, 'on')], agg[(c, 'off')]
        non, noff = n[(c, 'on')], n[(c, 'off')]
        def avg(d, k, count): return d.get(k, 0) / count if count else 0
        # Common metrics
        metrics = [
            ("O movement stones/game", "O_movement"),
            ("O chain stones/game",    "O_chain"),
            ("O magnet stones/game",   "O_magnet"),
            ("O total placements",     "O_total_placements"),
            ("O effects applied/game", "O_effects_applied"),
            ("O corners held at end",  "O_corners_end"),
            ("O winrate",              "O_won"),
        ]
        for label, key in metrics:
            a_on = avg(on, key, non)
            a_off = avg(off, key, noff)
            diff = a_on - a_off
            marker = ""
            # Standard error on the paired diff (use independent SE as a rough guide)
            # We have ~400 pairs; with binomial-ish counts SE ~ sigma/sqrt(N).
            print(f"{c:14} {label:28} {a_on:>10.3f} {a_off:>10.3f} {diff:>+12.3f}{marker}")
        print()

    print(f"elapsed: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
