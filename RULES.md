# Pif-paf-poe

A two-player board game based on tic-tac-toe. Stones are placed on a 3x3 grid and the goal is
three in a row, orthogonally or diagonally. Unlike tic-tac-toe, each player arrives with a
hand of five stones, each of which does something when placed. A game lasts at most nine
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

1. **Place** — choose a stone from your hand and place it on any free square. The only
   thing that narrows your choice is a restriction the opponent has on you (see below);
   no stone has a placement requirement of its own.
2. **Resolve** — if the stone you placed has an effect, resolve it now. Resolving is not
   optional. You may place a stone where its effect has nothing to do, and then it does
   nothing; you may not place it where the effect can happen and decline to take it.
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

Do not expect this to even the game out on its own. Measured over 2208 games between random
hands, each hand opening as often as it replies, the first player takes 73.6% and only 8.9%
of games reach a full board — the tiebreak decides about one game in eleven. It is a
simplification that leans the right way, not a fix, and the first-mover problem is currently
the largest open question about this game.

## Restrictions

A Magnet placed by your opponent on their last turn constrains where you may place: you must
place adjacent to it.

If no free square is adjacent to it, the restriction does not apply this turn. It only
constrains the opponent, never its owner, and it lasts one turn.

## Immobility

A Mountain cannot be moved by any effect. It does not cancel the effect — it stands still
and everything else moves as far as the space allows. A Mountain is a wall on the board,
not a veto on your choice:

- **2048** — stones still slide, they just cannot slide past a Mountain. Each stretch of
  the line on either side of a Mountain packs on its own.
- **Shift** — the line still moves one step, except that a stone whose destination is the
  Mountain stays where it is, and so does anything queued behind it. A Mountain also
  breaks the wrap-around: nothing travels through it to reach the other end.
- **Rotate** — the same, around the four squares: the Mountain holds its corner, and the
  other stones each advance one step if the corner ahead of them is free or is freed.
- **Leech** — a Mountain cannot be taken, so it is never a valid target.

Every direction and square stays on the menu regardless. An effect that turns out to move
nothing is still a legal thing to do.

## Stones

### Movement

**Shift** — choose an orthogonal direction. The row (for left/right) or column (for up/down)
containing this stone shifts one step that way, and whatever falls off the end wraps around to
the other end.

**2048** — choose an orthogonal direction. Every stone on the board slides that way as far as
the free space allows, exactly like the tile game.

**Rotate** — choose one of the 2x2 sub-squares this stone belongs to. Those four squares
rotate one step clockwise.

### Reactive

**Leech** — if it lands adjacent to an enemy stone, it trades places with one of them, your
choice. Otherwise it does nothing.

### Static

**Mountain** — this stone is never moved by an effect.

### Restriction

**Magnet** — the opponent must place their next stone adjacent to this one.
