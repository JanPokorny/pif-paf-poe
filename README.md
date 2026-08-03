# Pif-paf-poe Game Rules

Pif-paf-poe is a board game for two players based on Tic-tac-toe. Like Tic-tac-toe, it is played by alternatingly placing Xs and Os ("stones") on a 3x3 grid, with the goal of having 3-in-a-row (orthogonally or diagonally). Unlike Tic-tac-toe, players arrive with a set of 5 stones each, where each stone can have a specific special effect on the board, either moving stones around after its placement, or restricting where the next stone can be placed. Also unlike Tic-tac-toe, the game continues even after filling the board.

Game progress:

- Each player starts with a set of 5 stones. How they obtain these is out of scope of these rules, think of it as a TCG: whatever arrives, arrives. Stone types can repeat in player's hand. Both players' hands may be different.
- Who starts is selected randomly.
- Each round, A being one whose turn it is, B being the other one:
    - If the board is full, A selects one of B's stones and returns it to B. If B placed a stone with a restriction effect in the preceding turn, and there are B's stones on the board whose return would allow fulfilling the restriciton, A must select only among these.
    - A selects one of their held stones and places it on the board. 
        - If the board has free spaces, A must place on a free space. If not, A must select one of B's stones and return it to their hand to make a space.
        - If B placed a stone with a restriction effect in the preceding turn, the restriction must be adhered to, unless it would lead to no valid placements left. Restriction cannot be circumvented by returning the restricting stone.
    - If the placed stone has a movement effect, A picks a direction and then executes the effect.
    - If the board state, including possible active restrictions from the just placed stone, matches one already seen in this game, B wins.
    - If 3-in-a-row is achieved by A, A wins.
    - If 3-in-a-row is achieved by B, B wins.
    - A<->B switch.

Possible stones:

- Regular: No effect.
- Movement:
    - Shift: Player picks an orthogonal direction. Full row or column with this stone is shifted with overflow in that direction.
    - 2048: Player picks an orthogonal direction. All stones on board move in that direction as far as free space allows.
    - Rotate: Player picks one of 2x2 board sub-squares this stone is part of. Those 4 places are then swapped clockwise.
    - Swap: Player selects a row or column this stone was not placed in. The row or column is swapped with the one this stone was placed in.
    - Chain: After placing, Chain moves to a player-selected adjacent empty space (mandatory if one exists). This vacates the original space. The player may then select any stone adjacent to the newly empty space and move it in, creating another empty space. This may be repeated from each new empty space. The chain may be stopped at any time; only the first move of Chain itself is mandatory. Stones already moved by Chain in this turn cannot be moved again.
- Restriction:
    - Magnet: Other player must place their next stone orthogonally adjacent to this one.
    - Stinky: Other player must NOT place their next stone orthogonally adjacent to this one.

## Skills (proposal)

A *skill* is a single passive modifier a player owns for the whole game, on top of their hand. Where a hand is "what you drew", a skill is "who you are". Most skills upgrade one stone type, so a skill is only worth as much as the hand it is paired with; two are hand-independent.

- Whirlwind (Rotate): instead of a 2x2 sub-square, Rotate may turn the whole 8-field outer ring one step clockwise or counter-clockwise. Not available if the Rotate stone was placed in the centre.
- Telekinesis (Shift): Shift may move any row or column, not only the one it was placed in.
- Relentless (Regular): after placing a Regular stone, if the player does not have an advantage on the board (strictly more own stones than the opponent's), they may immediately take another turn.
- Overload (2048): the 2048 stone resolves twice; the player picks both directions, which may be the same.
- Lingering (Magnet/Stinky): the restriction binds the opponent for their next *two* turns instead of one.
- Slither (Chain): the Chain stone moves and pulls diagonally as well as orthogonally.
- Anchor (any hand): the stone the player placed on their last turn may not be returned to hand by the opponent, unless it is the only stone the opponent could return.
- Scavenger (any hand): stones this player returns from a full board go to *their* hand instead of back to the owner.

See `sim/README.md` for a balance study of these.

## Base game balance (proposal)

Simulation of the base game (no skills) found a strict two-tier hierarchy with no
counters at all: Chain beats every other hand type, and swapping two cards in a hand for
Chains is worth about +37 percentage points. Two rule changes, and only in combination,
turn that hierarchy into a counter-triangle where no hand type beats the whole field:

- Persistent restrictions: every Magnet/Stinky a player has on the board keeps restricting
  the opponent's placement for as long as it stays there, rather than only the one played
  last turn. A placement must be adjacent to at least one enemy Magnet and adjacent to no
  enemy Stinky; if that leaves no legal placement the requirement is relaxed (Stinky first,
  then Magnet, then dropped) so a lock can never deadlock the game.
- Restriction fizzle: a movement stone placed while under an enemy restriction is still
  placed, but its effect does not resolve.
- Optional: Chain moves itself to the adjacent empty space but drags no further stones.

The resulting loop is Magnet > Chain/Rotate > Stinky > Magnet. Note that Magnet's value
depends sharply on how many you take even in the base game: one copy beats the Regular it
replaces 65-35, five copies lose to five Regulars 0-100, so any metagame price for it has
to be a curve rather than a flat number. Measurements, the fifteen
rule variants that did *not* work, and suggested price ordering are in `sim/BALANCE.md`.
Note that this does not address the first-mover advantage, which remains ~70% and is the
larger imbalance.

If the aim is to *simplify* rather than rebalance, `sim/BALANCE.md` also measures the game
with each stone deleted from the pool. Short version: cut **Shift** — it duplicates what
2048 does, it is bottom-tier under every measurement, and removing it is the single best
change for the first-mover advantage. Keep Magnet and Stinky despite their low win rates:
removing either makes the seat advantage measurably worse, because they are the only
brake on it. Do not cut 2048 — it is the counterweight to Chain, and removing it is the
only cut that makes outcomes depend *more* on the draw. Note also that **Swap** appears in
the rules above but is not implemented in `index.html`.
