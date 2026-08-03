# Pif-paf-poe

A two-player board game based on tic-tac-toe. Stones are placed on a 3x3 grid and the goal is
three in a row, orthogonally or diagonally. Unlike tic-tac-toe, each player arrives with a
hand of five stones, most of which do something when placed. A game lasts at most nine
placements, and if the board fills with nobody in a line, the player who moved *second* wins.

## Board

Squares are numbered 0-8, left to right then top to bottom:

```
0 1 2
3 4 5
6 7 8
```

*Adjacent* always means orthogonally adjacent — sharing an edge, not a corner.

## Turn order

Each player has a hand of five stones. Hands may contain repeats and the two hands may
differ; how a player acquires a hand is outside these rules. Who moves first is decided
randomly.

On your turn, in order:

1. **Place** — choose a stone from your hand and place it on a free square, obeying any
   restriction the opponent has on you (see below).
2. **Resolve** — if the stone you placed has an effect, resolve it now.
3. **Check** — if you have three in a row, **you win**; otherwise if your opponent has three
   in a row, **they win**.
4. Pass the turn.

Stones are never removed from the board, so each turn adds exactly one and the ninth placement
fills the grid. **If the board is full and nobody has three in a row, the player who moved
second wins.** Same if the player to move has no stones left.

There are no draws.

### Why it ends this way

Moving first is a real advantage in this game — you reach three stones first — so the second
player gets the tie. It also means the first player has a deadline: the board fills on *their*
fifth stone, so they must have a line by then or they lose.

The board filling on the ninth placement is also why the second player only ever places four
of their five stones. They still hold five, so the one left behind is a choice they make by
playing the others.

Do not expect this to even the game out on its own. Measured over mirror matches, it moves the
first player from 67.5% to 65.3% and decides about one game in seven — most games end in a
line well before the ninth stone. It is a simplification that happens to lean the right way,
not a fix.

## Restrictions

A Magnet or a Stinky placed by your opponent on their last turn constrains where you may
place:

- **Magnet** — you must place adjacent to it.
- **Stinky** — you must not place adjacent to it.

If no free square satisfies the restriction, it does not apply this turn. A restriction only
constrains the opponent, never its owner, and it lasts one turn.

## Immobility

A stone may be *stuck*: Mountain is always stuck, and Glue makes itself and its neighbours
stuck. A stuck stone cannot be moved by any effect. Concretely:

- You may not choose an effect that would move a stuck stone.
- If that leaves no legal choice, the stone is still placed but resolves nothing.

## Stones

**Regular** — no effect.

### Movement

**Shift** — choose an orthogonal direction. The row (for left/right) or column (for up/down)
containing this stone shifts one step that way, and whatever falls off the end wraps around to
the other end.

**2048** — choose an orthogonal direction. Every stone on the board slides that way as far as
the free space allows, exactly like the tile game.

**Rotate** — choose one of the 2x2 sub-squares this stone belongs to. Those four squares
rotate one step clockwise.

**Swap** — choose a row or a column that this stone was *not* placed in. That line trades
contents with the stone's own line: pick a row and it swaps with the stone's row, pick a
column and it swaps with the stone's column.

### Reactive

**Mimic** — resolves the movement effect of the stone your opponent placed on their last turn,
with you choosing the direction or target. If they placed a stone with no movement effect, or
this is the first move of the game, Mimic does nothing. Mimic cannot copy a Mimic.

**Leech** — must be placed adjacent to an enemy stone. It then trades places with one enemy
stone it is adjacent to, your choice. If no free square is adjacent to an enemy stone, Leech
may be placed anywhere and does nothing.

### Static

**Glue** — this stone and every stone adjacent to it are stuck.

**Mountain** — this stone is stuck.

### Restriction

**Magnet** — the opponent must place their next stone adjacent to this one.

**Stinky** — the opponent must not place their next stone adjacent to this one.

## Notes on the stone list

**Chain** was cut. It moved itself to an adjacent empty square and then dragged a chain of
further stones along, and it beat every other kind of hand by a wide margin.

Earlier versions of this repository contain a simulation harness and a balance study of the
stones, the first-mover advantage and a proposal for per-player "skills"; see the git history.
Two of its findings are worth carrying forward:

- The strongest stones are the ones that can complete a line by moving stones that are already
  on the board, because a movement threat has no blocking square.
- Whoever moves first wins far more often than they should. The cause is tempo, so handicaps
  aimed at the opening square or at material do not touch it.
