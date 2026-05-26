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

TYPES = ["regular", "shift", "2048", "rotate", "magnet", "stinky", "chain", "stinky_shift"]
TYPE_CODE = {
    "regular": "rg",
    "shift": "sh",
    "2048": "20",
    "rotate": "ro",
    "magnet": "mg",
    "stinky": "sk",
    "chain": "ch",
    "stinky_shift": "ss",
}
TYPE_ICON = {
    "regular": "Reg",
    "shift": "Sh",
    "2048": "20",
    "rotate": "Ro",
    "magnet": "Mg",
    "stinky": "Sk",
    "chain": "Ch",
    "stinky_shift": "SS",
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
MOVEMENT_TYPES = {"shift", "2048", "rotate", "stinky_shift"}
RESTRICTION_TYPES = {"magnet", "stinky", "stinky_shift"}
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
    variant: Optional[str] = None  # e.g. "stench" → restricts whole row+column instead of adjacency


def same_row_col(a: int, b: int) -> bool:
    return a // 3 == b // 3 or a % 3 == b % 3


CORNERS = (0, 2, 6, 8)

VALID_CLASSES = frozenset({
    "balancer",      # any-after-regular bonus (per-player version of regular_chain_any)
    "oops_stinky",   # every stone this player places also leaves a stinky restriction
    "ctrl_shift",    # this player's shift may shift ANY row/column, not just the placed one
    "polarized",     # this player may ignore the opponent's magnet restriction
    "stench",        # this player's stinky restricts the whole row+column, not just adjacency
    "set_in_stone",  # this player's regular stones can't be moved by the opponent (effect skipped)
    "corny",         # this player also wins by owning all four corners
})


VALID_RULES = frozenset({
    "second_pick_first",   # second player picks first player's opening stone
    "opener_regular",      # first player's opening stone has no effect/restriction
    "no_center_first",     # first player may not open on the center
    "opener_no_movement",  # first player may not open with shift/2048/rotate/chain
    "regular_chain",       # after placing regular, if stone counts are equal, may place another regular
    "regular_chain_safe",  # same as regular_chain, but the bonus stone may not complete a 3-in-a-row
    "regular_chain_any",   # same trigger as regular_chain, but the bonus stone may be any from hand
    "any_chain_any",       # bonus triggers on ANY stone placement (not just regular) when counts equal
    "merge_stinky_shift",  # random hands draw from {regular, 2048, rotate, magnet, chain, stinky_shift} (no shift/stinky)
    "second_free_stone",   # second player places a free regular before turn 1
    "first_smaller_hand",  # first player drops one stone from their hand at game start
    "second_picks_first_full",  # P2 picks P1's first-turn stone type AND placement (effects skipped)
    "p2_double_first_p1_picks", # P2 may play a second stone on T2; P1 picks which from P2's hand and where
    "second_free_stone_corner", # like second_free_stone but P2's free regular must go in a corner
    "second_free_stone_edge",   # like second_free_stone but P2's free regular must go on an edge (non-corner, non-center)
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
    bonus_used: bool = False
    classes: dict = field(default_factory=lambda: {"X": None, "O": None})

    def clone(self) -> "State":
        return State(
            board=[c.clone() if c else None for c in self.board],
            hands={"X": list(self.hands["X"]), "O": list(self.hands["O"])},
            current_player=self.current_player,
            restriction=Restriction(self.restriction.type, self.restriction.pos, self.restriction.variant) if self.restriction else None,
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
            bonus_used=self.bonus_used,
            classes=self.classes,
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
        if s.restriction.variant:
            parts.append(s.restriction.variant[0])
    return "".join(parts)


def _restriction_ok_cells(s: State, free):
    """Filter candidate cells by the active restriction, honoring the current
    player's class (polarized ignores magnet; stench restriction covers row+col)."""
    r = s.restriction
    if not r:
        return free
    cp_class = s.classes.get(s.current_player)
    if r.type == "magnet":
        if cp_class == "polarized":
            return free  # may ignore opponent's magnet
        return [i for i in free if adj(i, r.pos)]
    # stinky / stinky_shift
    if r.variant == "stench":
        return [i for i in free if not same_row_col(i, r.pos)]
    return [i for i in free if not adj(i, r.pos)]


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

def apply_shift(board, pos: int, direction: str) -> int:
    """Apply shift; return the new position of the stone originally at `pos`."""
    r, c = pos // 3, pos % 3
    if direction in ("left", "right"):
        idx = [r * 3, r * 3 + 1, r * 3 + 2]
    else:
        idx = [c, c + 3, c + 6]
    pos_in_row = idx.index(pos)
    v = [board[i] for i in idx]
    shift = 2 if direction in ("right", "down") else 1
    for i in range(3):
        board[idx[i]] = v[(i + shift) % 3]
    # board[idx[i]] = v[(i + shift) % 3]  ⇒  v[k] ends up at idx[(k - shift) % 3]
    return idx[(pos_in_row - shift) % 3]


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
    # Ctrl+Shift may target a different line than the placed stone's.
    p = action.get("line", state.placed_pos)
    new_board = [c.clone() if c else None for c in state.board]
    new_placed = state.placed_pos
    if t == "shift":
        moved_to = apply_shift(new_board, p, action["direction"])
        if action.get("line") is None:
            new_placed = moved_to
    elif t == "stinky_shift":
        # Shift moves the stinky_shift stone; track its new position for the
        # subsequent stinky restriction (only if it was on the shifted line).
        if action.get("line") is None or _on_line(state.placed_pos, p, action["direction"]):
            new_placed = apply_shift(new_board, p, action["direction"])
        else:
            apply_shift(new_board, p, action["direction"])
    elif t == "2048":
        apply_2048(new_board, action["direction"])
    elif t == "rotate":
        apply_rotate(new_board, action["subsquare"])
    else:
        return
    # Set in stone: opponent's movement may not displace this player's regulars.
    prot = opp(state.current_player)
    if state.classes.get(prot) == "set_in_stone":
        before = {i for i, c in enumerate(state.board) if c and c.player == prot and c.type == "regular"}
        after = {i for i, c in enumerate(new_board) if c and c.player == prot and c.type == "regular"}
        if before != after:
            return  # effect skipped entirely; board unchanged
    state.board[:] = new_board
    state.placed_pos = new_placed


def _on_line(pos: int, line_pos: int, direction: str) -> bool:
    if pos is None:
        return False
    if direction in ("left", "right"):
        return pos // 3 == line_pos // 3
    return pos % 3 == line_pos % 3


# ── Legal actions ──

def get_remove_actions(s: State):
    o = opp(s.current_player)
    cands = [i for i in range(9) if s.board[i] and s.board[i].player == o]
    if s.restriction:
        no_r = [i for i in cands if i != s.restriction.pos]
        ful = _restriction_ok_cells(s, no_r)
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
        ok = _restriction_ok_cells(s, free)
        if ok:
            free = ok
    return [{"type": "place", "pos": p} for p in free]


def get_effect_actions(s: State):
    t = s.selected_stone
    p = s.placed_pos
    if t == "shift" and s.classes.get(s.current_player) == "ctrl_shift":
        # Ctrl+Shift: shift ANY row (left/right) or column (up/down).
        acts = []
        for r in range(3):
            for d in ("left", "right"):
                acts.append({"type": "effect", "direction": d, "line": r * 3})
        for c in range(3):
            for d in ("up", "down"):
                acts.append({"type": "effect", "direction": d, "line": c})
        return acts
    if t in ("shift", "2048", "stinky_shift"):
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
        # Set in stone: a protected player's regulars can't be pulled by the opponent.
        prot = opp(s.current_player)
        protect = s.classes.get(prot) == "set_in_stone"
        acts = [{"type": "chainPass"}]
        for i in range(9):
            if s.board[i] and adj(i, s.chain_empty) and i not in s.chain_moved:
                if protect and s.board[i].player == prot and s.board[i].type == "regular":
                    continue
                acts.append({"type": "chainPull", "pos": i})
        return acts
    if s.phase == "regular_bonus":
        return get_regular_bonus_actions(s)
    if s.phase == "regular_chain_select":
        return get_regular_chain_select_actions(s)
    if s.phase == "pregame_place":
        if "second_free_stone_corner" in s.rules:
            cells = (0, 2, 6, 8)
        elif "second_free_stone_edge" in s.rules:
            cells = (1, 3, 5, 7)
        else:
            cells = range(9)
        return [{"type": "pregame_place", "pos": i} for i in cells if not s.board[i]]
    if s.phase == "second_picks_first_full":
        # P2 (current_player) picks both stone type and position for P1's first move.
        first_player = opp(s.current_player)
        acts = []
        seen = set()
        for t in s.hands[first_player]:
            if t in seen:
                continue
            seen.add(t)
            for i in range(9):
                if s.board[i] is None:
                    acts.append({"type": "second_picks_first_full", "stoneType": t, "pos": i})
        return acts
    if s.phase == "p2_double_choice":
        return [{"type": "p2_double_choice_skip"}, {"type": "p2_double_choice_use"}]
    if s.phase == "p1_picks_p2_double":
        # P1 (current_player) picks a stone from P2's hand and where to place it for P2.
        p2 = opp(s.current_player)
        acts = []
        seen = set()
        for t in s.hands[p2]:
            if t in seen:
                continue
            seen.add(t)
            for i in range(9):
                if s.board[i] is None:
                    acts.append({"type": "p1_picks_p2_double", "stoneType": t, "pos": i})
        return acts
    return []


def get_regular_chain_select_actions(s: State):
    acts = [{"type": "regular_chain_pass"}]
    seen = []
    for t in s.hands[s.current_player]:
        if t not in seen:
            seen.append(t)
    for t in seen:
        acts.append({"type": "regular_chain_select", "stoneType": t})
    return acts


def get_regular_bonus_actions(s: State):
    acts = [{"type": "regular_bonus_pass"}]
    free = [i for i in range(9) if not s.board[i]]
    if s.restriction:
        ok = _restriction_ok_cells(s, free)
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

def _has_won(s: State, player: str) -> bool:
    if check3(s.board, player):
        return True
    if s.classes.get(player) == "corny" and all(
        s.board[c] and s.board[c].player == player for c in CORNERS
    ):
        return True
    return False


def end_turn(s: State) -> None:
    s.turn_count += 1
    cp = s.current_player
    opener_pass = "opener_regular" in s.rules and s.is_opening_turn
    if opener_pass:
        s.restriction = None
    elif s.selected_stone in RESTRICTION_TYPES:
        variant = "stench" if (s.classes.get(cp) == "stench"
                               and s.selected_stone in ("stinky", "stinky_shift")) else None
        s.restriction = Restriction(s.selected_stone, s.placed_pos, variant)
    elif s.classes.get(cp) == "oops_stinky" and s.placed_pos is not None:
        # Every non-restriction stone this player places also leaves a stinky.
        variant = "stench" if False else None  # one class per player; no stench stacking
        s.restriction = Restriction("stinky", s.placed_pos, variant)
    else:
        s.restriction = None
    h = hash_state(s)
    if h in s.history:
        s.winner = opp(s.current_player)
        s.phase = "gameOver"
        s.win_reason = "repeat"
        return
    s.history.add(h)
    if _has_won(s, s.current_player):
        s.winner = s.current_player
        s.phase = "gameOver"
        s.win_reason = "line"
        return
    other = opp(s.current_player)
    if _has_won(s, other):
        s.winner = other
        s.phase = "gameOver"
        s.win_reason = "line"
        return
    # any_chain_any trigger: bonus on any stone placement, before switching player.
    if "any_chain_any" in s.rules and not s.bonus_used:
        cp = s.current_player
        cp_count = sum(1 for c in s.board if c and c.player == cp)
        op_count = sum(1 for c in s.board if c and c.player == other)
        if cp_count == op_count and s.hands[cp]:
            s.phase = "regular_chain_select"
            s.bonus_used = True
            return
    # p2_double_first_p1_picks trigger: at the end of P2's first turn (T2),
    # offer P2 the option to play a second stone (where P1 picks). bonus_used
    # is reused to prevent re-trigger within the same turn chain.
    if (
        "p2_double_first_p1_picks" in s.rules
        and s.turn_count == 2
        and not s.bonus_used
        and s.hands[s.current_player]
    ):
        s.phase = "p2_double_choice"
        s.bonus_used = True
        s.selected_stone = None
        s.placed_pos = None
        return
    s.current_player = other
    s.selected_stone = None
    s.placed_pos = None
    s.bonus_used = False
    s.phase = "remove" if board_full(s.board) else "select"
    if s.phase == "select" and not s.hands[s.current_player]:
        # Can't place — no stones in hand and board isn't full. Current player loses.
        s.winner = opp(s.current_player)
        s.phase = "gameOver"
        s.win_reason = "out_of_stones"


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
        cp = s.current_player
        is_balancer = s.classes.get(cp) == "balancer"
        if (
            s.selected_stone == "regular" and not s.bonus_used and (
                "regular_chain" in s.rules or "regular_chain_safe" in s.rules
                or "regular_chain_any" in s.rules or is_balancer
            )
        ):
            op = opp(cp)
            cp_count = sum(1 for c in s.board if c and c.player == cp)
            op_count = sum(1 for c in s.board if c and c.player == op)
            if cp_count == op_count:
                if "regular_chain_any" in s.rules or is_balancer:
                    if s.hands[cp]:
                        s.phase = "regular_chain_select"
                        s.bonus_used = True
                        return
                elif "regular" in s.hands[cp]:
                    s.phase = "regular_bonus"
                    s.bonus_used = True
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
    elif t == "regular_chain_pass":
        end_turn(s)
    elif t == "regular_chain_select":
        s.hands[s.current_player].remove(a["stoneType"])
        s.selected_stone = a["stoneType"]
        s.phase = "place"
    elif t == "pregame_place":
        # Second player places a free regular (not from hand) before the first
        # player's turn 1.
        s.board[a["pos"]] = Stone(s.current_player, "regular")
        s.current_player = opp(s.current_player)
        s.phase = "select"
        s.history.add(hash_state(s))
    elif t == "second_picks_first_full":
        # P2 (current_player) chose (stoneType, pos) for P1's first move.
        # Run as if P1 placed a regular at that cell (no effect, no restriction).
        first_player = opp(s.current_player)
        s.hands[first_player].remove(a["stoneType"])
        s.board[a["pos"]] = Stone(first_player, a["stoneType"])
        s.placed_pos = a["pos"]
        s.selected_stone = "regular"  # so end_turn skips restriction and effects
        s.current_player = first_player  # so end_turn checks win from P1's view
        end_turn(s)
    elif t == "p2_double_choice_skip":
        # P2 declines the bonus. Mirror the player switch that end_turn would have done.
        s.current_player = opp(s.current_player)
        s.selected_stone = None
        s.placed_pos = None
        s.phase = "remove" if board_full(s.board) else "select"
    elif t == "p2_double_choice_use":
        # Hand off to P1 to pick a stone + position from P2's hand.
        s.current_player = opp(s.current_player)
        s.phase = "p1_picks_p2_double"
    elif t == "p1_picks_p2_double":
        # P1 picks a stone from P2's hand and where to put it for P2 (regular-like).
        p2 = opp(s.current_player)
        s.hands[p2].remove(a["stoneType"])
        s.board[a["pos"]] = Stone(p2, a["stoneType"])
        s.placed_pos = a["pos"]
        s.selected_stone = "regular"  # skip effects/restriction
        s.current_player = p2  # end_turn evaluates from P2's perspective
        end_turn(s)


def init_game_state(hands_x, hands_o, first_player: str, rules=frozenset(), rng=None, classes=None) -> State:
    rules = frozenset(rules)
    hx = list(hands_x)
    ho = list(hands_o)
    if "first_smaller_hand" in rules:
        # Drop one stone from the FIRST player's hand. Deterministic drop of the
        # alphabetically-first stone keeps tests reproducible without an rng.
        first_hand = hx if first_player == "X" else ho
        if first_hand:
            drop = sorted(first_hand)[0]
            first_hand.remove(drop)
    cls = {"X": None, "O": None}
    if classes:
        cls.update(classes)
    s = State(
        board=[None] * 9,
        hands={"X": hx, "O": ho},
        current_player=first_player,
        rules=rules,
        classes=cls,
    )
    if "second_free_stone" in rules or "second_free_stone_corner" in rules or "second_free_stone_edge" in rules:
        # The other player goes BEFORE the first player to place a free regular.
        # After their placement, current_player flips back to first_player.
        s.current_player = opp(first_player)
        s.phase = "pregame_place"
    if "second_picks_first_full" in rules:
        # The other player picks (stone type, position) for the first player's
        # very first move. After this action, end_turn flips to the second player.
        s.current_player = opp(first_player)
        s.phase = "second_picks_first_full"
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
    classes=None,
):
    s = init_game_state(hands_x, hands_o, first_player, rules=rules, classes=classes)
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
# Parallel batch runner
# ═══════════════════════════════════════
#
# Games are independent, so batches (FPA sweeps, GA tournament rounds,
# round-robins) parallelize cleanly across cores. Each spec is fully
# self-contained — the worker builds its own rng + agents from the spec's
# seed — so results are reproducible given the seed list but NOT bit-identical
# to the old single-shared-rng sequential runs (statistically equivalent).
#
# A spec is a tuple:
#   (hands_x, hands_o, first_player, rules, agent_spec, iters, time_ms, seed)
# optionally with a trailing classes dict:
#   (..., seed, classes)

def _play_one_spec(spec):
    if len(spec) == 9:
        hands_x, hands_o, first, rules, agent_spec, iters, time_ms, seed, classes = spec
    else:
        hands_x, hands_o, first, rules, agent_spec, iters, time_ms, seed = spec
        classes = None
    rng = random.Random(seed)
    agent = make_agent(agent_spec, iters, time_ms, rng)
    return play_game(hands_x, hands_o, first, agent, agent, rules=rules, classes=classes)


def play_games_parallel(specs, processes=None):
    """Run a list of game specs, returning [(winner, reason, moves, turns), ...]
    in the same order. Falls back to sequential for tiny batches or processes<=1."""
    import multiprocessing as mp
    if processes is None:
        processes = mp.cpu_count()
    if processes <= 1 or len(specs) < 4:
        return [_play_one_spec(s) for s in specs]
    chunk = max(1, len(specs) // (processes * 8))
    with mp.Pool(processes) as pool:
        return pool.map(_play_one_spec, specs, chunksize=chunk)


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
    if t == "regular_chain_select":
        return f"regular_chain_select {a['stoneType']}"
    if t == "regular_chain_pass":
        return "regular_chain_pass"
    if t == "pregame_place":
        return f"pregame_place@{a['pos']}"
    if t == "second_picks_first_full":
        return f"second_picks_first_full {a['stoneType']}@{a['pos']}"
    if t == "p2_double_choice_skip":
        return "p2_double_choice_skip"
    if t == "p2_double_choice_use":
        return "p2_double_choice_use"
    if t == "p1_picks_p2_double":
        return f"p1_picks_p2_double {a['stoneType']}@{a['pos']}"
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


def random_hand(rng: random.Random, pool=None, rules=frozenset()):
    if pool is None:
        pool = pool_for_rules(rules)
    return [rng.choice(pool) for _ in range(5)]


def pool_for_rules(rules):
    """Default stone pool for random hand generation given active rules."""
    if "merge_stinky_shift" in rules:
        return [t for t in TYPES if t not in ("shift", "stinky")]
    # Vanilla: original 7 types only (stinky_shift only appears under the rule)
    return [t for t in TYPES if t != "stinky_shift"]


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
