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
   thing that narrows your choice is a Magnet the opponent has in force; no stone has a
   placement requirement of its own.
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

Do not expect this to even the game out on its own. Over the whole hand space — all 126 hands,
every ordered pair, both seats — the first player takes 72.7% and only 9.3% of games reach a
full board, so the tiebreak decides about one game in eleven. It leans the right way without
being a fix. What does even the game is the Counterattack the second player brings.

## Stones

**Shift** — choose an orthogonal direction. The row (for left/right) or column (for up/down)
containing this stone shifts one step that way, and whatever falls off the end wraps around to
the other end.

**2048** — choose an orthogonal direction. Every stone on the board slides that way as far as
the free space allows, exactly like the tile game.

**Rotate** — choose one of the 2x2 sub-squares this stone belongs to. Those four squares
rotate one step clockwise.

**Mountain** — does nothing when placed, and no effect ever moves it afterwards. It does not
cancel effects, though: it stands still and everything else moves as far as the space allows,
so it is a wall on the board rather than a veto on your choice.

- **2048** — stones still slide, they just cannot slide past a Mountain. Each stretch of the
  line on either side of it packs on its own.
- **Shift** — the line still moves one step, except that a stone whose destination is the
  Mountain stays where it is, and so does anything queued behind it. A Mountain also breaks
  the wrap-around: nothing travels through it to reach the other end.
- **Rotate** — the same, around the four squares: the Mountain holds its corner, and the
  other stones each advance one step if the corner ahead of them is free or is freed.

Every direction and square stays on the menu regardless. An effect that turns out to move
nothing is still a legal thing to do.

**Magnet** — the opponent must place their stones adjacent to this one. If no free square is
adjacent to it, the restriction does not apply that turn. It constrains only the opponent,
never its owner.

A Magnet does not wear off. It holds until another Magnet is placed — by either player, so
answering one with your own is how you get free of it — or until the Magnet itself leaves the
board. It pulls from wherever it has been moved to, not from the square it was placed on, and
only one Magnet is ever in force: the one placed most recently.

Measured over the whole hand space, making the pull permanent rather than one-turn moved the
opening seat from 71.7% to 69.8% and turned the Magnet from a stone you take one of into one
every good hand holds. It is the one change so far that has closed part of the first-mover gap
by a rule rather than by an item.

### Stinky, under evaluation

**Stinky** is the Magnet's mirror — the opponent must place their stones *not* adjacent to it —
and it is in the engine but not in the pool: hands are dealt from the five stones above, and a
study deals a Stinky in explicitly. A Stinky and a Magnet share the single restriction slot, so
either one replaces the other.

## Spaces

A game is fought on a **space**, and a space switches one stone type off for both players. A
stone of that type is still placed, still occupies its square and still counts towards three in
a row — it simply has no effect. A switched-off Magnet binds nobody; a switched-off Mountain is
an ordinary stone and moves like one. There is a space for each of the five types, and a neutral
space that switches nothing off.

Which space a game is fought on is a matter for the players, and outside these rules.

### What the spaces are for

They are the reason to hold a mixed hand. Measured over a population of hands that keeps whatever
wins and discards whatever loses, on a single space the field collapses onto Shift and Magnet —
38.5% and 39.2% of every hand played, with Rotate down to 3.6% — and the opening seat climbs to
**86.1%**, because the hands that survive are the ones that open best.

Put the same population on a circuit that draws a space per game and the collapse does not
happen. The field settles at Shift 24.8%, Magnet 22.5%, 2048 19.2%, Mountain 18.0%, Rotate 15.5%
— within ten points of even across all five — and the commonest hand is one of each, held by
55.8% of the population. The opening seat takes **72.1%**, fourteen points less than on a single
space.

A hand that cannot play on a vetoed space is a hand that loses a game in six, and a hand tuned to
one stone loses more than that. The spaces buy hand diversity, and hand diversity is most of what
keeps the opening seat from running away.

The spaces do not fall evenly, though. Over the same run: the Magnet space gives the opener
77.7%, the 2048 space 65.3%. Switching off the Magnet takes away the main thing that slows an
opening run; switching off 2048 costs the opener more than it costs the reply.

## Counterattack

Moving first is a large advantage in this game, so the player who moves second brings one
**Counterattack**. It is not a stone and is never placed: it is held for the whole game and
changes what you may do. A Counterattack held by the player who moves *first* does nothing at
all. How a player acquires one is outside these rules.

There are five to pick from. All of them are spent once per game, at the end of your turn and
before the check for three in a row, so any of them can finish a line.

**Overtake** — take the stone on the centre square, if your opponent owns it, off the board and
back into their hand. This is not a movement effect, so a Mountain is not safe from it. The
centre has a hole in it again and they have a stone back to place.

**Relocate** — move one of your stones to any free square. It resolves nothing on arrival.

**Mind Control** — name a stone in your opponent's hand. That is the stone they must play on
their next turn.

**Rehearse** — resolve the effect of one of your stones already on the board, from wherever it
now stands. A stone the space has switched off cannot be rehearsed.

**Mirror** — choose one of the four pairs of squares that mirror each other through the centre —
0 and 8, 1 and 7, 2 and 6, or 3 and 5 — and exchange what stands on them. Two stones trade
places; a lone stone crosses to the empty square. Either player may own them.

### What each pick is worth

Against a field of hands that has converged on whatever wins, with every replying player holding
the same one, the opening seat takes:

| pick | opening seat | |
|---|---|---|
| Overtake | 42.8% | hands the game to the reply |
| Relocate | 53.5% | |
| Mirror | 56.8% | pooled over two runs, which gave 53.8% and 59.9% |
| Mind Control | 64.6% | barely moves it |
| Rehearse | 71.4% | barely moves it |

Relocate and Mirror are the two that leave the opener a little ahead, which is the intended
lean. Overtake overshoots and the other two do too little.

Note what that means for a free pick: a population given the whole list to choose from converges
on the strongest item and abandons the rest, so a menu is balanced at its best member, not its
average. With this list that is Overtake, and the game would settle near its 42.8% rather than
near Mirror's 56.8%. Either the picks get levelled up to Overtake's strength, or Overtake comes
down to theirs.

### Twenty-two that did not survive

Every version of this list has been measured rather than argued about, first as the swing an
item gives the replying seat against a random field, then as where it leaves the seat once a
population of hands has converged on what wins. What that turned up, in short:

- **Subtracting from the opponent's move is worth tens of points; adding to your own options is
  worth a few.** Cancelling an effect outright was worth +43pp to the replying seat. Resolving
  your own stone twice, or rearranging stones you already have, was worth nothing at all.
- **Naming what the opponent must play, or must not play, is worth nothing.** A hand of five
  stones with one type barred still has four other placements.
- **A free choice of Counterattack balances the game at the strongest item on the list**, not
  the average one: given the whole list to choose from, a population converges on the best one
  and everything else goes extinct. Either the list is flat or there is one item.

git history and `results/` hold the numbers for all of them.
