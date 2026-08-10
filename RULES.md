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

Do not expect this to even the game out on its own. Measured over 2208 games between random
hands, each hand opening as often as it replies, the first player takes 73.6% and only 8.9%
of games reach a full board — the tiebreak decides about one game in eleven. It is a
simplification that leans the right way, not a fix, and the first-mover problem is currently
the largest open question about this game.

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

## Counterattack

Moving first is a large advantage in this game, so the player who moves second brings one
**Counterattack**. It is not a stone and is never placed: it is held for the whole game and
changes what you may do. A Counterattack held by the player who moves *first* does nothing at
all. How a player acquires one is outside these rules.

Four of them sharpen a stone you already hold:

**Super Shift** — your Shift may move any row or column, not only the one it was placed in.

**Super 2048** — your 2048 may run a second time, in a different direction of your choice.

**Super Rotate** — your Rotate may turn any of the four 2x2 sub-squares, or the whole outer
ring of eight squares, one step clockwise.

**Super Mountain** — when you place a Mountain, you may ignore an opponent's restriction.

Four stand on their own:

**Overtake** — once per game, at the end of your turn, return one of your opponent's stones
from the board to their hand. This is not a movement effect, so a Mountain is not safe from
it. The board has a hole in it again, and they have a stone back to place.

**Antipolar** — your opponent's restrictions are turned inside out: their Magnets repel you and
their Stinkies attract you, wherever a free square allows it.

**Mind Control** — once per game, at the end of your turn, name a stone in your opponent's
hand. That is the stone they must play on their next turn.

**Shortlist** — the same, naming two: they must play one of them, their choice.

**Veto** — the same, the other way round: name a stone they hold and they may not play it next
turn.

**Uno Reverse** — once per game, after your opponent resolves a Shift, a 2048 or a Rotate,
you may make it run the other way instead: the opposite direction for Shift and 2048,
anticlockwise for Rotate.

Five more were designed against the first-mover advantage rather than against a stone. Two buy
you a tempo, three take one off your opponent:

**Second Wind** — once per game, at the end of your turn, take another turn.

**Echo** — once per game, resolve the stone you have just placed a second time, choosing
again.

**Blind Spot** — once per game, at the end of your turn, name a free square. Your opponent may
not place there on their next turn, unless it is the only square left.

**Fizzle** — once per game, after your opponent chooses a movement effect, cancel it. The
stone stays where it was placed and nothing else moves.

**Anchor** — once per game, after your opponent chooses a Shift, a 2048 or a Rotate, the
effect runs as normal except that *your* stones do not move. They behave like Mountains for
that one effect, so stones blocked by them move as far as the space allows.

**Pin** — the same, for one stone: name a single stone of yours and only that one holds its
square.

Six more do something of yours instead of undoing something of theirs. All of them resolve at
the end of your turn, before the check for three in a row, so any of them can finish a line.

**Nudge** — once per game, slide one of your stones to an adjacent free square. It does not
resolve anything on arrival.

**Relocate** — the same, to any free square rather than an adjacent one.

**Rehearse** — once per game, resolve the effect of one of your stones already on the board,
from wherever it now stands.

**King of the Hill** — once per game, place a Mountain on a free square. It does not come out
of your hand.

**Exchange** — once per game, swap two stones standing on squares that mirror each other
through the centre: 0 and 8, 1 and 7, 2 and 6, or 3 and 5. Either player may own them.

**Rearrange** — once per game, rearrange your own stones among the squares they already stand
on. You keep the same squares; what changes is which stone is where, which is how a Magnet or a
Mountain ends up somewhere better.

And three more after that:

**Bipolar** — your opponent's Magnets push their owner as well as pulling you. On the turn
after they place a Magnet, they may not place adjacent to it, unless no other free square is
left.

**Encore** — once per game, after your opponent has resolved a Shift, a 2048 or a Rotate,
resolve the same kind of effect yourself: any row or column for Shift, any direction for 2048,
any sub-square for Rotate. It happens before the check for three in a row, so it can break up
a line your opponent has just made.

**Obstruction** — once per game, at the end of your turn, declare an obstruction. Your
opponent cannot win on their next turn: if they make three in a row, they lose instead.
