# Pif-paf-poe

Tic-tac-toe with stones that do things, fought as duels inside a campaign between two teams.

This file is the rules. `adr/` holds what was tried, what it measured and why each rule is the
one it is; `git log` holds the numbers behind that.

# The duel

Each player brings a hand of five stones and places one a turn on a 3x3 grid. Three in a row —
orthogonally or diagonally — wins.

## Board

Squares are numbered 0-8, left to right then top to bottom:

```
0 1 2
3 4 5
6 7 8
```

*Adjacent* always means orthogonally adjacent — sharing an edge, not a corner.

## Turn order

Hands may contain repeats and the two hands may differ. Who moves first is decided at the table
— in a campaign it is always the attacker — and the player who moves **second** may spend a
Counterattack.

On your turn, in order:

1. **Place** — choose a stone from your hand and place it on any free square. The only thing
   that narrows your choice is a Magnet or a Stinky the opponent has in force.
2. **Resolve** — if the stone has an effect, resolve it now. Resolving is not optional. You may
   place a stone where its effect has nothing to do; you may not place it where the effect can
   happen and decline to take it.
3. **Counterattack** — if you moved second and hold one, you may spend one now.
4. **Check** — if you have three in a row, **you win**; otherwise if your opponent has three in
   a row, **they win**.
5. Pass the turn.

Stones are never removed, so the ninth placement fills the grid. **If the board is full and
nobody has three in a row, the player who moved second wins.** Same if the player to move has
no stones left. There are no draws.

## Stones

**Shift** — choose an orthogonal direction. The row (left/right) or column (up/down) containing
this stone shifts one step that way, and whatever falls off the end wraps to the other end.

**2048** — choose an orthogonal direction. Every stone on the board slides that way as far as
the free space allows, exactly like the tile game.

**Rotate** — choose one of the 2x2 sub-squares this stone belongs to. Those four squares rotate
one step clockwise.

**Mountain** — does nothing when placed, and no effect ever moves it. It blocks rather than
vetoes: everything else still moves as far as the space allows.

- **2048** — stones cannot slide past it; each stretch of the line packs on its own.
- **Shift** — a stone whose destination is the Mountain stays, and so does anything queued
  behind it. Nothing wraps through a Mountain.
- **Rotate** — the Mountain holds its corner; the others each advance one step if the corner
  ahead is free or is freed.

Every direction and square stays on the menu regardless. An effect that moves nothing is still
a legal thing to do.

**Magnet** — the opponent must place their stones adjacent to this one.

**Stinky** — the mirror: the opponent must place their stones *not* adjacent to this one.

Both constrain only the opponent, never their owner, and if no free square satisfies the
restriction it does not apply that turn. Neither wears off: a restriction holds until another
Magnet or Stinky is placed by either player, or until the stone leaves the board. **Only one
restriction is ever in force**, the most recent, and it works from wherever its stone now
stands.

## Spaces

A duel is fought on a **space**, and a space switches one stone type off for both players. A
stone of that type is still placed, still occupies its square and still counts towards three in
a row — it simply has no effect. A switched-off Magnet or Stinky binds nobody; a switched-off
Mountain moves like an ordinary stone. There is a space for each of the six types, and a
neutral space that switches nothing off.

## Counterattack

Counterattacks are not stones and are never placed. **Only the player who moves second may
spend one**; held by the player who moves first they do nothing.

**Hold as many as you like, present up to three at the start of the game, spend at most one.**
Which one you spend is decided with the board in front of you. An unspent Counterattack is
kept; only a spent one is discarded.

All of them are spent at the end of your turn, after your stone has resolved and before the
check for three in a row, so any of them can finish a line.

**Overtake** — take the stone on the centre square, if your opponent owns it, off the board and
back into their hand. Not a movement effect, so a Mountain is not safe from it.

**Relocate** — move one of your stones to any free square. It resolves nothing on arrival.

**Mirror** — choose one of the four pairs of squares that mirror each other through the centre
— 0 and 8, 1 and 7, 2 and 6, or 3 and 5 — and exchange what stands on them. Either player may
own them.

**Mind Control** — name a stone in your opponent's hand. That is the stone they must play next
turn.

**Rehearse** — resolve the effect of one of your stones already on the board, from wherever it
now stands. A stone the space has switched off cannot be rehearsed.

# The campaign

Two teams, **X** and **O**, contest a field of 3x3 boards. Every contested square is settled by
duels between attackers and defenders.

## The field

**Pick it by the headcount.** Four boards in a 2x2 — a 6x6 field of 36 squares — for about
twelve a side. Nine boards in a 3x3 — a 9x9 field of 81 squares — for about thirty. The rules
are the same either way.

Three in a row anywhere on the field scores, in any of the four directions, whichever boards
the three squares belong to.

## Stone vetoes

**Every square switches one stone type off** for the duels fought on it, exactly as a space
does. It is printed on the board, so both teams can plan around it. Six types and a neutral
square make seven, laid out stepping one across and three down:

```
   -  S  2  R  M  M          - neutral   S shift   2 2048
   R  M  M  S  -  S          R rotate    M mountain
   S  -  S  2  R  M          M magnet    S stinky
   2  R  M  M  S  -
   M  S  -  S  2  R          no line of three repeats a veto
   S  2  R  M  M  S
```

The 9x9 continues the same pattern.

## Setting up

- **Hands.** Every player draws five stones at random.
- **The opening position.** Seed about a fifth of the squares, half to each side: **four each
  on the 6x6, nine each on the 9x9**. They go in rotational pairs — for every square X starts
  on, O starts on the one half a turn about the centre away from it — and **no seeded three in
  a row**: draw the pairs one at a time and reject any that completes a line.
- **The first attacker gives back two.** The team attacking in round one removes two of its own
  seeded marks, so it opens on two against four (or seven against nine).
- **The target.** Agree a score to run to: **22 points on the 6x6, 70 on the 9x9**, both about
  twenty rounds.

## The round

One team attacks and the other defends, and they change over every round.

1. **The defence takes positions.** Each defender stands on any square. More than one may stand
   on the same square.
2. **The attack takes positions.** Each attacker stands on any square with no symbol on it,
   knowing exactly where the defence has gone. More than one may stand on the same square.
3. **Pairing.** On each square the defenders pair off one to one against the attackers there,
   and a defender with a choice of attackers chooses. A defender left with nobody to fight
   **steps to an orthogonally adjacent square where the attackers outnumber the defenders** and
   pairs with an attacker there. A defender may stand idle only when there is no unpaired
   attacker on their square or on any square next to it.
4. **The duels.** Every pair plays a duel, on the square's veto, with the **attacker moving
   first**.
5. **Taking the squares.** On each square, each side's **power** is its unpaired players there
   plus the duels its players won there. The attack takes the square when its power is strictly
   higher. Level power holds for the defence.
6. **Placing the marks.** Each board may claim one of the squares its attack took and mark it
   with the attacking team's symbol. So at most one mark per board, and a board may decline.
7. **Scoring.** Count the attacking team's three-in-a-rows, counting them separately where they
   overlap — a cross is two, four in a row is two. **n of them in one round are worth n
   squared**: 1, 4, 9, 16.
8. **Clearing.** For each line scored, **one** of the boards its three symbols stood on is
   cleared completely, both teams' symbols alike, and **the attack chooses which**.
9. **Paying.** Every player standing on a square their side won — the attackers on a square the
   attack took, the defenders on one it held, paired or not — takes **one upgrade point**.

## Upgrade points

Points are spent between rounds, on either of two things:

| | cost |
|---|---|
| **replace one stone** in your hand, chosen | **2 points** |
| **a Counterattack**, drawn at random, single use | **2 points** |

Nothing else is bought with them and they never expire. A campaign pays a player about twelve.

Counterattacks bought this way are held under the duel's rule — as many as you like, present up
to three, spend at most one, unspent ones kept. In a campaign the attacker moves first, so a
Counterattack is only ever spent in a round your team is **defending**.
