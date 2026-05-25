#!/usr/bin/env python3
"""Pif-paf-poe evaluator: MCTS AI + autobattler tournament, CLI only.

Ports the game logic and MCTS from index.html so AI strength is comparable to
the in-browser AI. No interactive play; every run is fully driven by argparse.
"""

from __future__ import annotations

import argparse
import math
import random
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

TYPES = ["regular", "shift", "2048", "rotate", "magnet", "stinky", "chain"]
TYPE_CODE = {
    "regular": "rg",
    "shift": "sh",
    "2048": "20",
    "rotate": "ro",
    "magnet": "mg",
    "stinky": "sk",
    "chain": "ch",
}
TYPE_ICON = {
    "regular": "Reg",
    "shift": "Sh",
    "2048": "20",
    "rotate": "Ro",
    "magnet": "Mg",
    "stinky": "Sk",
    "chain": "Ch",
}
LINES = [
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6),
]
SUBSQUARES = {
    "TL": (0, 1, 3, 4),
    "TR": (1, 2, 4, 5),
    "BL": (3, 4, 6, 7),
    "BR": (4, 5, 7, 8),
}
MOVEMENT_TYPES = {"shift", "2048", "rotate"}
RESTRICTION_TYPES = {"magnet", "stinky"}
DIRECTIONS = ("up", "down", "left", "right")


def opp(p: str) -> str:
    return "O" if p == "X" else "X"


def adj(a: int, b: int) -> bool:
    return abs(a // 3 - b // 3) + abs(a % 3 - b % 3) == 1


@dataclass
class Stone:
    player: str
    type: str

    def clone(self) -> "Stone":
        return Stone(self.player, self.type)


@dataclass
class Restriction:
    type: str
    pos: int


VALID_RULES = frozenset({
    "second_pick_first",   # second player picks first player's opening stone
    "opener_regular",      # first player's opening stone has no effect/restriction
    "no_center_first",     # first player may not open on the center
    "opener_no_movement",  # first player may not open with shift/2048/rotate/chain
    "regular_chain",       # after placing regular, if stone counts are equal, may place another regular
    "regular_chain_safe",  # same as regular_chain, but the bonus stone may not complete a 3-in-a-row
})


@dataclass
class State:
    board: list  # type: ignore[type-arg]  # list[Optional[Stone]]
    hands: dict
    current_player: str
    restriction: Optional[Restriction] = None
    history: set = field(default_factory=set)
    phase: str = "select"
    selected_stone: Optional[str] = None
    placed_pos: Optional[int] = None
    winner: Optional[str] = None
    win_reason: Optional[str] = None
    chain_empty: Optional[int] = None
    chain_moved: Optional[set] = None
    rules: frozenset = field(default_factory=frozenset)
    turn_count: int = 0

    def clone(self) -> "State":
        return State(
            board=[c.clone() if c else None for c in self.board],
            hands={"X": list(self.hands["X"]), "O": list(self.hands["O"])},
            current_player=self.current_player,
            restriction=Restriction(self.restriction.type, self.restriction.pos) if self.restriction else None,
            history=set(self.history),
            phase=self.phase,
            selected_stone=self.selected_stone,
            placed_pos=self.placed_pos,
            winner=self.winner,
            win_reason=self.win_reason,
            chain_empty=self.chain_empty,
            chain_moved=set(self.chain_moved) if self.chain_moved is not None else None,
            rules=self.rules,
            turn_count=self.turn_count,
        )

    @property
    def is_opening_turn(self) -> bool:
        # True throughout the very first turn (history holds only the initial state hash).
        return len(self.history) == 1


def hash_state(s: State) -> str:
    parts = []
    for cell in s.board:
        if cell:
            parts.append(cell.player + TYPE_CODE[cell.type])
        else:
            parts.append("..")
    parts.append("|")
    if s.restriction:
        parts.append(s.restriction.type[0] + str(s.restriction.pos))
    return "".join(parts)


def board_full(board) -> bool:
    return all(c is not None for c in board)


def check3(board, p: str) -> bool:
    for a, b, c in LINES:
        if board[a] and board[a].player == p and board[b] and board[b].player == p and board[c] and board[c].player == p:
            return True
    return False


def subsquares_for(pos: int):
    return [k for k, cells in SUBSQUARES.items() if pos in cells]


# ── Effects ──

def apply_shift(board, pos: int, direction: str) -> None:
    r, c = pos // 3, pos % 3
    if direction in ("left", "right"):
        idx = [r * 3, r * 3 + 1, r * 3 + 2]
    else:
        idx = [c, c + 3, c + 6]
    v = [board[i] for i in idx]
    shift = 2 if direction in ("right", "down") else 1
    for i in range(3):
        board[idx[i]] = v[(i + shift) % 3]


def apply_2048(board, direction: str) -> None:
    horiz = direction in ("left", "right")
    to_end = direction in ("right", "down")
    for i in range(3):
        idx = [i * 3, i * 3 + 1, i * 3 + 2] if horiz else [i, i + 3, i + 6]
        stones = [board[j] for j in idx if board[j] is not None]
        res = [None] * 3
        if to_end:
            for j in range(len(stones)):
                res[3 - len(stones) + j] = stones[j]
        else:
            for j in range(len(stones)):
                res[j] = stones[j]
        for j in range(3):
            board[idx[j]] = res[j]


def apply_rotate(board, sq: str) -> None:
    tl, tr, bl, br = SUBSQUARES[sq]
    s = [board[tl], board[tr], board[bl], board[br]]
    # Clockwise: TL <- BL, TR <- TL, BR <- TR, BL <- BR
    board[tl] = s[2]
    board[tr] = s[0]
    board[br] = s[1]
    board[bl] = s[3]


def apply_effect(state: State, action: dict) -> None:
    t = state.selected_stone
    p = state.placed_pos
    if t == "shift":
        apply_shift(state.board, p, action["direction"])
    elif t == "2048":
        apply_2048(state.board, action["direction"])
    elif t == "rotate":
        apply_rotate(state.board, action["subsquare"])


# ── Legal actions ──

def get_remove_actions(s: State):
    o = opp(s.current_player)
    cands = [i for i in range(9) if s.board[i] and s.board[i].player == o]
    if s.restriction:
        no_r = [i for i in cands if i != s.restriction.pos]
        if s.restriction.type == "magnet":
            ful = [i for i in no_r if adj(i, s.restriction.pos)]
        else:
            ful = [i for i in no_r if not adj(i, s.restriction.pos)]
        pool = ful if ful else (no_r if no_r else cands)
        return [{"type": "remove", "pos": p} for p in pool]
    return [{"type": "remove", "pos": p} for p in cands]


def get_select_actions(s: State):
    seen = []
    hand = s.hands[s.current_player]
    if "opener_no_movement" in s.rules and s.is_opening_turn:
        allowed = [t for t in hand if t not in MOVEMENT_TYPES and t != "chain"]
        if allowed:
            hand = allowed
    for t in hand:
        if t not in seen:
            seen.append(t)
    return [{"type": "select", "stoneType": t} for t in seen]


def get_place_actions(s: State):
    free = [i for i in range(9) if not s.board[i]]
    if "no_center_first" in s.rules and s.is_opening_turn:
        filtered = [i for i in free if i != 4]
        if filtered:
            free = filtered
    if s.restriction:
        if s.restriction.type == "magnet":
            ok = [i for i in free if adj(i, s.restriction.pos)]
        else:
            ok = [i for i in free if not adj(i, s.restriction.pos)]
        if ok:
            free = ok
    return [{"type": "place", "pos": p} for p in free]


def get_effect_actions(s: State):
    t = s.selected_stone
    p = s.placed_pos
    if t == "shift" or t == "2048":
        return [{"type": "effect", "direction": d} for d in DIRECTIONS]
    if t == "rotate":
        return [{"type": "effect", "subsquare": sq} for sq in subsquares_for(p)]
    return []


def get_legal_actions(s: State):
    if s.phase == "remove":
        return get_remove_actions(s)
    if s.phase == "select":
        return get_select_actions(s)
    if s.phase == "place":
        return get_place_actions(s)
    if s.phase == "effect":
        return get_effect_actions(s)
    if s.phase == "chainMove":
        return [{"type": "chainMove", "pos": i} for i in range(9)
                if not s.board[i] and adj(i, s.placed_pos)]
    if s.phase == "chainPull":
        acts = [{"type": "chainPass"}]
        for i in range(9):
            if s.board[i] and adj(i, s.chain_empty) and i not in s.chain_moved:
                acts.append({"type": "chainPull", "pos": i})
        return acts
    if s.phase == "regular_bonus":
        return get_regular_bonus_actions(s)
    return []


def get_regular_bonus_actions(s: State):
    acts = [{"type": "regular_bonus_pass"}]
    free = [i for i in range(9) if not s.board[i]]
    if s.restriction:
        if s.restriction.type == "magnet":
            ok = [i for i in free if adj(i, s.restriction.pos)]
        else:
            ok = [i for i in free if not adj(i, s.restriction.pos)]
        if ok:
            free = ok
    if "regular_chain_safe" in s.rules:
        cp = s.current_player
        safe = []
        for pos in free:
            s.board[pos] = Stone(cp, "regular")
            completes = check3(s.board, cp)
            s.board[pos] = None
            if not completes:
                safe.append(pos)
        free = safe
    return acts + [{"type": "regular_bonus_place", "pos": p} for p in free]


# ── State transitions ──

def end_turn(s: State) -> None:
    s.turn_count += 1
    opener_pass = "opener_regular" in s.rules and s.is_opening_turn
    if not opener_pass and s.selected_stone in RESTRICTION_TYPES:
        s.restriction = Restriction(s.selected_stone, s.placed_pos)
    else:
        s.restriction = None
    h = hash_state(s)
    if h in s.history:
        s.winner = opp(s.current_player)
        s.phase = "gameOver"
        s.win_reason = "repeat"
        return
    s.history.add(h)
    if check3(s.board, s.current_player):
        s.winner = s.current_player
        s.phase = "gameOver"
        s.win_reason = "line"
        return
    other = opp(s.current_player)
    if check3(s.board, other):
        s.winner = other
        s.phase = "gameOver"
        s.win_reason = "line"
        return
    s.current_player = other
    s.selected_stone = None
    s.placed_pos = None
    s.phase = "remove" if board_full(s.board) else "select"


def do_action(s: State, a: dict) -> None:
    t = a["type"]
    if t == "remove":
        st = s.board[a["pos"]]
        s.board[a["pos"]] = None
        s.hands[st.player].append(st.type)
        s.phase = "select"
    elif t == "select":
        s.hands[s.current_player].remove(a["stoneType"])
        s.selected_stone = a["stoneType"]
        s.phase = "place"
    elif t == "place":
        s.board[a["pos"]] = Stone(s.current_player, s.selected_stone)
        s.placed_pos = a["pos"]
        if "opener_regular" in s.rules and s.is_opening_turn:
            end_turn(s)
            return
        if s.selected_stone == "regular" and (
            "regular_chain" in s.rules or "regular_chain_safe" in s.rules
        ):
            cp = s.current_player
            op = opp(cp)
            cp_count = sum(1 for c in s.board if c and c.player == cp)
            op_count = sum(1 for c in s.board if c and c.player == op)
            if cp_count == op_count and "regular" in s.hands[cp]:
                s.phase = "regular_bonus"
                return
        if s.selected_stone == "chain":
            has = any(not s.board[i] and adj(i, a["pos"]) for i in range(9))
            if has:
                s.phase = "chainMove"
                s.chain_moved = set()
            else:
                end_turn(s)
        elif s.selected_stone in MOVEMENT_TYPES:
            s.phase = "effect"
        else:
            end_turn(s)
    elif t == "effect":
        apply_effect(s, a)
        end_turn(s)
    elif t == "chainMove":
        s.board[a["pos"]] = s.board[s.placed_pos]
        s.board[s.placed_pos] = None
        s.chain_empty = s.placed_pos
        s.chain_moved.add(a["pos"])
        s.phase = "chainPull"
    elif t == "chainPass":
        s.chain_empty = None
        s.chain_moved = None
        end_turn(s)
    elif t == "chainPull":
        s.board[s.chain_empty] = s.board[a["pos"]]
        s.board[a["pos"]] = None
        s.chain_moved.add(s.chain_empty)
        s.chain_empty = a["pos"]
    elif t == "regular_bonus_pass":
        end_turn(s)
    elif t == "regular_bonus_place":
        s.hands[s.current_player].remove("regular")
        s.board[a["pos"]] = Stone(s.current_player, "regular")
        s.placed_pos = a["pos"]
        end_turn(s)


def init_game_state(hands_x, hands_o, first_player: str, rules=frozenset()) -> State:
    s = State(
        board=[None] * 9,
        hands={"X": list(hands_x), "O": list(hands_o)},
        current_player=first_player,
        rules=frozenset(rules),
    )
    s.history.add(hash_state(s))
    return s


# Preference order for second-player-forces-opener: most-wasted on empty board first.
# regular and the movement/chain types all degenerate to "place anywhere" on turn 1.
# stinky/magnet actually give first player a useful restriction, so we avoid forcing them.
_OPENER_FORCE_PREF = ("regular", "shift", "2048", "rotate", "chain", "stinky", "magnet")


def second_pick_opening(first_hand) -> str:
    for t in _OPENER_FORCE_PREF:
        if t in first_hand:
            return t
    return first_hand[0]


# ═══════════════════════════════════════
# MCTS
# ═══════════════════════════════════════

class MCTSNode:
    __slots__ = ("state", "parent", "action", "children", "wins", "visits", "_untried")

    def __init__(self, state: State, parent: Optional["MCTSNode"], action: Optional[dict]):
        self.state = state
        self.parent = parent
        self.action = action
        self.children: list = []
        self.wins = 0.0
        self.visits = 0
        self._untried: Optional[list] = None

    @property
    def untried(self):
        if self._untried is None:
            self._untried = get_legal_actions(self.state)
        return self._untried

    def ucb1(self, c: float) -> float:
        return self.wins / self.visits + c * math.sqrt(math.log(self.parent.visits) / self.visits)

    def best_child(self, c: float = 1.41) -> "MCTSNode":
        best = None
        bv = -math.inf
        for ch in self.children:
            v = math.inf if ch.visits == 0 else ch.ucb1(c)
            if v > bv:
                bv = v
                best = ch
        return best  # type: ignore[return-value]


def mcts_core(root: MCTSNode, budget: int, rng: random.Random, rollout_cap: int = 150) -> None:
    for _ in range(budget):
        node = root
        # Selection
        while not node.untried and node.children and node.state.phase != "gameOver":
            node = node.best_child()
        # Expansion
        if node.untried and node.state.phase != "gameOver":
            idx = rng.randrange(len(node.untried))
            a = node.untried.pop(idx)
            cs = node.state.clone()
            do_action(cs, a)
            ch = MCTSNode(cs, node, a)
            node.children.append(ch)
            node = ch
        # Rollout
        sim = node.state.clone()
        d = 0
        while sim.phase != "gameOver" and d < rollout_cap:
            acts = get_legal_actions(sim)
            if not acts:
                break
            do_action(sim, acts[rng.randrange(len(acts))])
            d += 1
        # Backprop (perspective: each node tracks rewards for its own currentPlayer)
        w = sim.winner
        n = node
        while n is not None:
            n.visits += 1
            if w == n.state.current_player:
                n.wins += 1.0
            elif w is None:
                n.wins += 0.5
            n = n.parent


def mcts_best_action(root: MCTSNode, state: State) -> dict:
    best = None
    bv = -1
    for ch in root.children:
        if ch.visits > bv:
            bv = ch.visits
            best = ch
    return best.action if best else get_legal_actions(state)[0]


def mcts_search_iter(state: State, iterations: int, rng: random.Random) -> dict:
    root = MCTSNode(state.clone(), None, None)
    mcts_core(root, iterations, rng)
    return mcts_best_action(root, state)


def mcts_search_time(state: State, time_ms: int, rng: random.Random, chunk: int = 20) -> dict:
    root = MCTSNode(state.clone(), None, None)
    deadline = time.time() + time_ms / 1000.0
    while time.time() < deadline:
        mcts_core(root, chunk, rng)
    return mcts_best_action(root, state)


# ═══════════════════════════════════════
# Agents
# ═══════════════════════════════════════

def make_agent(spec: str, iters: int, time_ms: Optional[int], rng: random.Random):
    """spec: 'mcts' | 'random' | 'first'."""
    if spec == "random":
        def agent(state: State) -> dict:
            acts = get_legal_actions(state)
            return acts[rng.randrange(len(acts))]
        return agent
    if spec == "first":
        def agent(state: State) -> dict:
            return get_legal_actions(state)[0]
        return agent
    if spec == "mcts":
        def agent(state: State) -> dict:
            acts = get_legal_actions(state)
            if len(acts) == 1:
                return acts[0]
            if time_ms is not None:
                return mcts_search_time(state, time_ms, rng)
            return mcts_search_iter(state, iters, rng)
        return agent
    raise SystemExit(f"unknown agent: {spec!r}")


# ═══════════════════════════════════════
# Game runner
# ═══════════════════════════════════════

def play_game(
    hands_x,
    hands_o,
    first_player: str,
    agent_x,
    agent_o,
    max_actions: int = 600,
    verbose: bool = False,
    rules=frozenset(),
):
    s = init_game_state(hands_x, hands_o, first_player, rules=rules)
    moves = 0
    if verbose:
        print_state(s)
    if "second_pick_first" in s.rules:
        forced = second_pick_opening(s.hands[first_player])
        if verbose:
            print(f"  [rule second_pick_first] forcing opener: {forced}")
        do_action(s, {"type": "select", "stoneType": forced})
        moves += 1
    while s.phase != "gameOver" and moves < max_actions:
        acts = get_legal_actions(s)
        if not acts:
            raise RuntimeError(f"no legal actions in phase {s.phase!r} but game not over")
        agent = agent_x if s.current_player == "X" else agent_o
        a = agent(s)
        if verbose:
            print(f"  {s.current_player} [{s.phase}] -> {format_action(a)}")
        do_action(s, a)
        moves += 1
    if s.winner is None:
        raise RuntimeError(f"game did not terminate within {max_actions} actions")
    if verbose:
        print_state(s)
        print(f"result: winner={s.winner} reason={s.win_reason} actions={moves} turns={s.turn_count}")
    return s.winner, s.win_reason, moves, s.turn_count


# ═══════════════════════════════════════
# Formatting / parsing
# ═══════════════════════════════════════

def parse_hand(text: str):
    if not text:
        raise SystemExit("empty hand")
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if len(parts) != 5:
        raise SystemExit(f"hand must have 5 stones, got {len(parts)}: {text!r}")
    for p in parts:
        if p not in TYPES:
            raise SystemExit(f"unknown stone type {p!r}; valid: {','.join(TYPES)}")
    return parts


def format_hand(hand) -> str:
    counts = {}
    for t in hand:
        counts[t] = counts.get(t, 0) + 1
    return " ".join(f"{t}x{counts[t]}" if counts[t] > 1 else t for t in TYPES if counts.get(t))


def format_action(a: dict) -> str:
    t = a["type"]
    if t == "select":
        return f"select {a['stoneType']}"
    if t == "place":
        return f"place@{a['pos']}"
    if t == "remove":
        return f"remove@{a['pos']}"
    if t == "effect":
        return f"effect {a.get('direction') or a.get('subsquare')}"
    if t == "chainMove":
        return f"chainMove@{a['pos']}"
    if t == "chainPull":
        return f"chainPull@{a['pos']}"
    if t == "chainPass":
        return "chainPass"
    if t == "regular_bonus_place":
        return f"regular_bonus_place@{a['pos']}"
    if t == "regular_bonus_pass":
        return "regular_bonus_pass"
    return str(a)


def print_state(s: State) -> None:
    rows = []
    for r in range(3):
        cells = []
        for c in range(3):
            cell = s.board[r * 3 + c]
            if cell:
                cells.append(f"{cell.player}:{TYPE_ICON[cell.type]:<3}")
            else:
                cells.append(" .   ")
        rows.append(" | ".join(cells))
    sep = "-" * len(rows[0])
    print(("\n" + sep + "\n").join(rows))
    print(f"turn={s.current_player} phase={s.phase} hands X={format_hand(s.hands['X'])} | O={format_hand(s.hands['O'])}"
          + (f"  restriction={s.restriction.type}@{s.restriction.pos}" if s.restriction else ""))


def random_hand(rng: random.Random, pool=None):
    pool = pool if pool is not None else TYPES
    return [rng.choice(pool) for _ in range(5)]


# ═══════════════════════════════════════
# Subcommands
# ═══════════════════════════════════════

def parse_rules(args_rules) -> frozenset:
    rules = set()
    for r in args_rules or ():
        for part in r.split(","):
            part = part.strip()
            if not part:
                continue
            if part not in VALID_RULES:
                raise SystemExit(f"unknown rule {part!r}; valid: {','.join(sorted(VALID_RULES))}")
            rules.add(part)
    return frozenset(rules)


def cmd_play(args) -> int:
    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    hands_x = parse_hand(args.hands_x) if args.hands_x else random_hand(rng)
    hands_o = parse_hand(args.hands_o) if args.hands_o else random_hand(rng)
    agent_x = make_agent(args.agent_x, args.iters, args.time_ms, rng)
    agent_o = make_agent(args.agent_o, args.iters, args.time_ms, rng)
    games = args.games
    wins = {"X": 0, "O": 0}
    reasons = {}
    for g in range(games):
        if args.first == "R":
            fp = rng.choice(("X", "O"))
        else:
            fp = args.first
        if args.verbose:
            print(f"\n=== game {g + 1}/{games}  X={format_hand(hands_x)}  O={format_hand(hands_o)}  first={fp}"
                  + (f"  rules={','.join(sorted(rules))}" if rules else "") + " ===")
        w, reason, moves, turns = play_game(
            hands_x, hands_o, fp, agent_x, agent_o,
            max_actions=args.max_actions, verbose=args.verbose, rules=rules,
        )
        wins[w] += 1
        reasons[reason] = reasons.get(reason, 0) + 1
        if not args.verbose:
            print(f"game {g + 1}: winner={w} reason={reason} turns={turns} actions={moves}")
    total = wins["X"] + wins["O"]
    print()
    if rules:
        print(f"rules: {','.join(sorted(rules))}")
    print(f"X hand: {format_hand(hands_x)}")
    print(f"O hand: {format_hand(hands_o)}")
    print(f"games: {total}  X={wins['X']}  O={wins['O']}")
    if total:
        print(f"X win%: {100 * wins['X'] / total:.1f}   O win%: {100 * wins['O'] / total:.1f}")
    if reasons:
        print(f"end reasons: {dict(reasons)}")
    return 0


def cmd_tournament(args) -> int:
    rng = random.Random(args.seed)
    rules = parse_rules(args.rule)
    seen = set()
    loadouts = []
    tries = 0
    while len(loadouts) < args.num_loadouts and tries < args.num_loadouts * 50:
        h = sorted(random_hand(rng))
        k = ",".join(h)
        if k not in seen:
            seen.add(k)
            loadouts.append(h)
        tries += 1
    if len(loadouts) < 2:
        raise SystemExit("need at least 2 loadouts")
    n = len(loadouts)
    results = [{"wins": 0, "losses": 0} for _ in range(n)]
    agent = make_agent(args.agent, args.iters, args.time_ms, rng)
    total_games = n * (n - 1) // 2 * args.games_per_pair
    played = 0
    t0 = time.time()
    print(f"running tournament: {n} loadouts, {args.games_per_pair} games/pair, {total_games} total games"
          + (f"  rules={','.join(sorted(rules))}" if rules else ""))
    for i in range(n):
        for j in range(i + 1, n):
            for g in range(args.games_per_pair):
                i_is_x = g % 2 == 0
                hx = loadouts[i] if i_is_x else loadouts[j]
                ho = loadouts[j] if i_is_x else loadouts[i]
                first = "X" if g < args.games_per_pair / 2 else "O"
                w, _, _, _ = play_game(hx, ho, first, agent, agent,
                                       max_actions=args.max_actions, rules=rules)
                i_won = (i_is_x and w == "X") or (not i_is_x and w == "O")
                if i_won:
                    results[i]["wins"] += 1
                    results[j]["losses"] += 1
                else:
                    results[j]["wins"] += 1
                    results[i]["losses"] += 1
                played += 1
                if args.progress and (played % max(1, total_games // 20) == 0 or played == total_games):
                    elapsed = time.time() - t0
                    rate = played / elapsed if elapsed > 0 else 0
                    print(f"  {played}/{total_games} ({100 * played / total_games:.0f}%)  {rate:.1f} g/s", file=sys.stderr)
    ranked = []
    for i, ld in enumerate(loadouts):
        r = results[i]
        total = r["wins"] + r["losses"]
        pct = 100 * r["wins"] / total if total else 0
        ranked.append((i, ld, r["wins"], r["losses"], pct))
    ranked.sort(key=lambda x: (-x[4], -x[2]))
    print()
    print(f"{'#':>3}  {'W':>4} {'L':>4} {'Win%':>6}  loadout")
    for rank, (_i, ld, w, l, pct) in enumerate(ranked, 1):
        print(f"{rank:>3}  {w:>4} {l:>4} {pct:>5.1f}%  {format_hand(ld)}")
    print(f"\ntotal time: {time.time() - t0:.1f}s")
    return 0


# ═══════════════════════════════════════
# CLI
# ═══════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="evaluator.py",
        description="Pif-paf-poe evaluator: MCTS AI + autobattler tournament.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pp = sub.add_parser("play", help="play one or more games between two AI agents")
    pp.add_argument("--hands-x", help="comma-separated 5 stones for X (default: random)")
    pp.add_argument("--hands-o", help="comma-separated 5 stones for O (default: random)")
    pp.add_argument("--first", choices=("X", "O", "R"), default="R", help="who moves first (R=random)")
    pp.add_argument("--agent-x", default="mcts", choices=("mcts", "random", "first"))
    pp.add_argument("--agent-o", default="mcts", choices=("mcts", "random", "first"))
    pp.add_argument("--iters", type=int, default=100, help="MCTS iterations per move")
    pp.add_argument("--time-ms", type=int, default=None, help="if set, MCTS runs by time budget instead of iterations")
    pp.add_argument("--games", type=int, default=1, help="number of games to play")
    pp.add_argument("--max-actions", type=int, default=600, help="safety cap on total actions per game")
    pp.add_argument("--seed", type=int, default=None)
    pp.add_argument("--verbose", action="store_true", help="print every action and board snapshots")
    pp.add_argument("--rule", action="append", default=[],
                    help=f"rule variant (repeatable or comma-separated); valid: {','.join(sorted(VALID_RULES))}")
    pp.set_defaults(func=cmd_play)

    pt = sub.add_parser("tournament", help="autobattler: round-robin between random loadouts")
    pt.add_argument("--num-loadouts", type=int, default=10)
    pt.add_argument("--games-per-pair", type=int, default=4)
    pt.add_argument("--agent", default="mcts", choices=("mcts", "random", "first"))
    pt.add_argument("--iters", type=int, default=100)
    pt.add_argument("--time-ms", type=int, default=None)
    pt.add_argument("--max-actions", type=int, default=600)
    pt.add_argument("--seed", type=int, default=None)
    pt.add_argument("--progress", action="store_true", help="print progress to stderr")
    pt.add_argument("--rule", action="append", default=[],
                    help=f"rule variant (repeatable or comma-separated); valid: {','.join(sorted(VALID_RULES))}")
    pt.set_defaults(func=cmd_tournament)

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
