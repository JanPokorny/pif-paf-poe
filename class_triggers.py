"""Measure how often each class ability actually fires in top-level matches.

For each class we play games where player A has the class and B has none
(A plays both seats, paired). Stepping through every decision we count, per
class, both OPPORTUNITY (ability was relevant) and ACTIVATION (it genuinely
changed what happened vs a classless player), using counterfactuals where
needed. Games use the global Balancer rule (regular_chain_any) and strong
MCTS to approximate top-level play.
"""

import argparse
import multiprocessing as mp
import random
import time
from collections import Counter

from evaluator import (
    RESTRICTION_TYPES, CORNERS, make_agent, init_game_state, get_legal_actions,
    do_action, apply_effect, opp, adj, _on_line, check3,
)


def _board_key(board):
    return tuple((c.player, c.type) if c else None for c in board)


def instrument_game(spec):
    cls, a_is_first, hx, ho, iters, seed, rules = spec
    classes = {"X": cls, "O": None} if a_is_first else {"X": None, "O": cls}
    rng = random.Random(seed)
    agent = make_agent("mcts", iters, None, rng)
    s = init_game_state(hx, ho, "X", rules=rules, classes=classes)
    ev = Counter()
    moves = 0
    while s.phase != "gameOver" and moves < 600:
        acts = get_legal_actions(s)
        if not acts:
            break
        cp = s.current_player
        cc = s.classes.get(cp)
        a = agent(s)
        atype = a.get("type")

        # ctrl_shift: shift played, and whether a remote line was used
        if cc == "ctrl_shift" and atype == "effect" and "line" in a:
            ev["ctrl_shift_shift"] += 1
            if not _on_line(s.placed_pos, a["line"], a["direction"]):
                ev["ctrl_shift_remote"] += 1

        # polarized: placing/removing where the opponent's magnet would forbid it
        if cc == "polarized" and atype in ("place", "remove") and s.restriction and s.restriction.type == "magnet":
            ev["polarized_facing_magnet"] += 1
            if not adj(a["pos"], s.restriction.pos):
                ev["polarized_ignore"] += 1

        # set_in_stone: opponent (of cp) is protected and cp applies an effect
        if atype == "effect":
            prot = opp(cp)
            if s.classes.get(prot) == "set_in_stone":
                ev["setstone_opp_effect"] += 1
                t = s.clone(); t.classes = dict(t.classes); t.classes[prot] = None
                apply_effect(t, a)            # how it WOULD look unprotected
                u = s.clone(); apply_effect(u, a)  # how it looks protected
                if _board_key(t.board) != _board_key(u.board):
                    ev["setstone_veto"] += 1

        # restriction created BY cp's class (count at the placing moment)
        if cc == "oops_stinky" and atype == "place" and s.selected_stone not in RESTRICTION_TYPES:
            ev["oops_created"] += 1
        if cc == "stench" and atype == "place" and s.selected_stone == "stinky":
            ev["stench_created"] += 1

        # restriction BINDING on cp (set by opponent's class), measured at place/remove
        if atype in ("place", "remove") and s.restriction:
            r = s.restriction
            setter_class = s.classes.get(opp(cp))
            if atype == "place":
                allcells = [i for i in range(9) if not s.board[i]]
            else:
                allcells = [i for i in range(9) if s.board[i] and s.board[i].player == opp(cp)]
            legal = {p["pos"] for p in acts}
            blocked = [i for i in allcells if i not in legal]
            if blocked:
                if setter_class == "stench" and r.variant == "stench":
                    ev["stench_bind"] += 1
                elif setter_class == "oops_stinky" and r.type == "stinky" and r.variant is None:
                    st = s.board[r.pos]
                    if not (st and st.type == "stinky"):  # oops-induced, not a played stinky
                        ev["oops_bind"] += 1

        do_action(s, a)

        if s.phase == "gameOver" and s.winner:
            if (s.classes.get(s.winner) == "corny" and not check3(s.board, s.winner)
                    and all(s.board[c] and s.board[c].player == s.winner for c in CORNERS)):
                ev["corny_win"] += 1
        moves += 1

    a_won = (s.winner == "X") == a_is_first
    return cls, dict(ev), a_won


# Which event keys to report per class: (opportunity_key, activation_key)
REPORT = {
    "oops_stinky":  [("oops_created", "stinkies created/game"), ("oops_bind", "turns it constrained opp/game")],
    "ctrl_shift":   [("ctrl_shift_shift", "shifts played/game"), ("ctrl_shift_remote", "remote-line shifts/game")],
    "polarized":    [("polarized_facing_magnet", "faced opp magnet/game"), ("polarized_ignore", "magnet ignored/game")],
    "stench":       [("stench_created", "stenches created/game"), ("stench_bind", "turns it constrained opp/game")],
    "set_in_stone": [("setstone_opp_effect", "opp effects while protected/game"), ("setstone_veto", "moves vetoed/game")],
    "corny":        [("corny_win", "corner-wins/game")],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games-per-class", type=int, default=300)
    ap.add_argument("--iters", type=int, default=160)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--rule", action="append", default=["regular_chain_any"])
    ap.add_argument("--processes", type=int, default=None)
    args = ap.parse_args()

    from evaluator import parse_rules, random_hand, pool_for_rules, VALID_CLASSES
    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    pool = pool_for_rules(rules)
    classes = sorted(VALID_CLASSES)

    specs = []
    for cls in classes:
        for g in range(args.games_per_class):
            hx = random_hand(rng, pool=pool)
            ho = random_hand(rng, pool=pool)
            specs.append((cls, g % 2 == 0, hx, ho, args.iters, rng.randrange(1 << 30), rules))

    t0 = time.time()
    procs = args.processes or mp.cpu_count()
    with mp.Pool(procs) as pool_:
        results = pool_.map(instrument_game, specs, chunksize=max(1, len(specs)//(procs*8)))

    agg = {c: Counter() for c in classes}
    games = {c: 0 for c in classes}
    wins = {c: 0 for c in classes}
    for cls, ev, a_won in results:
        agg[cls].update(ev)
        games[cls] += 1
        wins[cls] += 1 if a_won else 0

    print(f"\nTop-level trigger rates ({args.games_per_class} games/class, iters={args.iters}, "
          f"rule={','.join(sorted(rules))}, class vs none)\n")
    print(f"{'class':13} {'winrate':>8}   activation metrics (per game, and % of games with >=1)")
    for c in classes:
        n = games[c]
        wr = 100 * wins[c] / n
        line = f"{c:13} {wr:>7.1f}%   "
        parts = []
        for key, label in REPORT[c]:
            total = agg[c].get(key, 0)
            # need per-game ">=1" count: recompute from results
            ge1 = sum(1 for cc, ev, _ in results if cc == c and ev.get(key, 0) > 0)
            parts.append(f"{label}: {total/n:.2f}  ({100*ge1/n:.0f}% of games)")
        print(line + "\n              ".join(parts))
    print(f"\nelapsed: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
