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
randomly, and the player who moves second brings Counterattacks.

On your turn, in order:

1. **Place** — choose a stone from your hand and place it on any free square. The only thing
   that narrows your choice is a Magnet or a Stinky the opponent has in force; no stone has a
   placement requirement of its own.
2. **Resolve** — if the stone you placed has an effect, resolve it now. Resolving is not
   optional. You may place a stone where its effect has nothing to do, and then it does
   nothing; you may not place it where the effect can happen and decline to take it.
3. **Counterattack** — if you moved second and still hold an unspent Counterattack, you may
   spend one now.
4. **Check** — if you have three in a row, **you win**; otherwise if your opponent has three
   in a row, **they win**.
5. Pass the turn.

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

Do not expect the tiebreak to even the game out on its own. Over the whole hand space the
first player takes 72.7% and only 9.3% of games reach a full board, so it decides about one
game in eleven. It leans the right way without being a fix. What evens the game is the
Counterattack, and what keeps hands honest is the space.

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

**Magnet** — the opponent must place their stones adjacent to this one.

**Stinky** — the mirror: the opponent must place their stones *not* adjacent to this one.

Both constrain only the opponent, never their owner, and if no free square satisfies the
restriction it does not apply that turn.

Neither wears off. A restriction holds until another Magnet or Stinky is placed — by either
player, so answering one with your own is how you get free of it — or until the stone itself
leaves the board. Only one restriction is ever in force, the one placed most recently, and it
works from wherever its stone has been moved to rather than from the square it was placed on.

Making the pull permanent rather than one-turn was worth about two points of the first-mover
advantage over the whole hand space, and it turned the Magnet from a stone you take one of
into one every good hand holds. Stinky exists so that it is not the only such stone.

## Spaces

A game is fought on a **space**, and a space switches one stone type off for both players. A
stone of that type is still placed, still occupies its square and still counts towards three
in a row — it simply has no effect. A switched-off Magnet or Stinky binds nobody; a
switched-off Mountain is an ordinary stone and moves like one. There is a space for each of
the six types, and a neutral space that switches nothing off.

Which space a game is fought on is a matter for the players, and outside these rules.

### What the spaces are for

They are the reason to hold a mixed hand. Measured over a population that keeps whatever wins
and discards whatever loses, on a single space the field collapses onto Shift and Magnet —
about 39% of every hand played each, with Rotate down to 4% — and the opening seat climbs to
**86%**, because the hands that survive are the ones that open best.

Put the same population on a circuit that draws a space per game and the collapse does not
happen. The field settles within ten points of even across all five of the stones it was
dealt, the commonest hand is one of each, and the opening seat takes **72%**.

A hand that cannot play on a vetoed space loses a game in six outright, and a hand tuned to
one stone loses more than that. The spaces buy hand diversity, and hand diversity is most of
what keeps the opening seat from running away.

The spaces do not fall evenly. Switching off the Magnet leaves the opener at 78%, since it
takes away the main brake on an opening run; switching off 2048 leaves the opener at 65%.

## Counterattack

Moving first is a large advantage, so the player who moves second brings **Counterattacks**.
They are not stones and are never placed: they are held for the whole game and change what
you may do. Counterattacks held by the player who moves *first* do nothing at all. How a
player acquires them is outside these rules.

**You may hold more than one, and you may spend one per game.** Which one you spend is decided
at the table with the board in front of you, not before it.

All of them are spent at the end of your turn, after the stone you placed has resolved and
before the check for three in a row, so any of them can finish a line.

**Overtake** — take the stone on the centre square, if your opponent owns it, off the board
and back into their hand. This is not a movement effect, so a Mountain is not safe from it.
The centre has a hole in it again and they have a stone back to place.

**Relocate** — move one of your stones to any free square. It resolves nothing on arrival.

**Mirror** — choose one of the four pairs of squares that mirror each other through the
centre — 0 and 8, 1 and 7, 2 and 6, or 3 and 5 — and exchange what stands on them. Two stones
trade places; a lone stone crosses to the empty square. Either player may own them.

**Mind Control** — name a stone in your opponent's hand. That is the stone they must play on
their next turn.

**Rehearse** — resolve the effect of one of your stones already on the board, from wherever it
now stands. A stone the space has switched off cannot be rehearsed.

### What each is worth

Against a field of hands that has converged on whatever wins, with every replying player
holding the same one, the opening seat takes:

| pick | opening seat | |
|---|---|---|
| Overtake | 42.8% | hands the game to the reply |
| Relocate | 53.5% | |
| Mirror | 56.8% | over two runs, which gave 53.8% and 59.9% |
| Mind Control | 64.6% | barely moves it |
| Rehearse | 71.4% | barely moves it |
| nothing at all | 86.1% | |

Relocate and Mirror leave the opener a little ahead, which is the intended lean.

Holding a second Counterattack is worth about five points to the replying seat, and a third is
worth nothing measurable. One use per game is the binding constraint: the second is there so
that something is always applicable. Holding one, the item goes unspent in half of all games;
holding two, in almost none.

Two things follow for whoever assembles the picks. A menu is balanced at its **strongest**
member rather than its average — given a free choice, players converge on the best item and
the rest go extinct — so this list balances near Overtake's 42.8% rather than near Mirror's
56.8%. And every figure here was measured with one item on everybody, so the numbers describe
the item, not the menu.

### Twenty-one that did not survive

Every version of this list was measured rather than argued about. What it turned up:

- **Subtracting from the opponent's move is worth tens of points; adding to your own options
  is worth a few.** Cancelling an effect outright was worth +43pp to the replying seat.
  Resolving your own stone twice was worth −1.3pp.
- **Naming what the opponent must play, or must not play, is worth nothing.** A hand of five
  stones with one type barred still has four other placements.
- **Repositioning your own stones is nearly nothing.** Mirror is the exception, and the
  difference is that it also moves theirs.

`adr/` records the decisions and `git log` the numbers behind them.

# The campaign

Duels are fought inside a campaign. Two teams, **X** and **O**, of ten to thirteen players
each contest a board of thirty-three spaces, and every contested space is settled by a game
of pif-paf-poe between one attacker and one defender.

## The campaign board

Four 3x3 boards, one for each compass direction, each sitting one step off centre in its own
direction. Neighbouring boards share exactly one square, so four nines make thirty-two
squares rather than thirty-six, and the four they leave in the middle make a hole:

```
      a  b  c  d  e  f  g
   1  .  .  N  N  N  .  .
   2  .  .  N  N  N  .  .
   3  W  W  nw N  ne E  E
   4  W  W  W  *  E  E  E
   5  W  W  ws S  es E  E
   6  .  .  S  S  S  .  .
   7  .  .  S  S  S  .  .
```

The four lowercase squares are the **corners**, each belonging to two boards. The star at d4
is the **centre space**: it belongs to no board, no attack is ever aimed at it and no
defender ever stands on it, and it changes hands only by flipping. The four squares the
boards do not reach — a1, g1, a7, g7 — are not spaces yet.

Three in a row anywhere on this board scores, in any of the four directions, and it does not
matter which boards the three squares belong to. There are sixty-eight such lines. The eight
squares of the inner ring lie on ten lines each, the star on eight, and the ends of the four
arms on three, so the middle of the board is worth several times what the outside is.

## The round

One team attacks and the other defends, and they change over every round.

1. **The defence takes positions.** Each defender stands on one of the thirty-two regular
   squares. More than one may stand on the same square.
2. **The attack takes positions.** Each attacker stands on one of the thirty-two regular
   squares that has no symbol on it. More than one may stand on the same square. The attack
   places knowing where the defence has gone.
3. **Pairing.** On each square the defenders there pair off one to one against the attackers
   there, and a defender with a choice of attackers chooses. A defender left with nobody to
   fight **steps to an orthogonally adjacent square where the attackers outnumber the
   defenders** and pairs with an attacker there. A defender may stand idle only when there is
   no unpaired attacker on their square or on any square next to it.
4. **The duels.** Every pair plays a game of pif-paf-poe.
5. **Taking the squares.** The attack takes a square when its won duels plus its unpaired
   players there come to more than half of the attackers standing there.
6. **Placing the marks.** Each of the four boards may claim one of the squares its attack
   took, and mark it with the attacking team's symbol. A corner may be claimed for either of
   the two boards it belongs to. So at most four marks, and a board may decline.
7. **The flip.** If no mark at all was placed, the centre space becomes the attacking team's
   symbol, whether it was empty or the other team's.
8. **Scoring.** The attack scores a point for every three in a row of its symbol, counted
   separately where they overlap: a cross is two points and four in a row is two points. Then
   every board that a scored line stood on is cleared completely, both teams' symbols alike,
   and the centre space with them if the line ran through it.

A campaign runs to an agreed number of points. At ten points it lasts about twenty-two
rounds, since a team scores a little under a point in each round it attacks.

### Why a line costs you the ground it stood on

Because otherwise the middle of the board fills up and stays filled. Clearing is what keeps
the campaign moving, and pricing it against the scorer is what makes a point a decision:
three of the four boards go with a line across the inner ring, which is most of what you had
built. Roughly one round in eight scores, and the board settles at about an eighth full.

### Why the attack moves second

So that the defence has to be a real allocation rather than a guess. It also means the
attack can never be bluffed, which is the thing to know about the phase order: there is
nothing to be gained by hiding a defence, because it will be read before it is answered.

## How many players

Ten to thirteen a side, which is about three players per board.

The board asks for four marks a round however many people you bring, so players past that
buy the attack certainty rather than buying anybody a game. What that costs is measurable.
The share of a team who plays a duel *that decides the square it is played on* — counting a
player whose duel was already moot alongside a player left standing idle, because they come
to the same thing at the table — runs:

| a side | plays a duel | of those, decides it | so, decided something |
|---|---|---|---|
| 10 | 65% | 83% | **54%** |
| 12 | 69% | 80% | **55%** |
| 14 | 67% | 72% | 48% |
| 17 | 67% | 66% | 44% |
| 20 | 65% | 59% | 38% |
| 24 | 62% | 52% | 33% |
| 30 | 62% | 48% | **30%** |

At twelve a side more than half the team plays a game that mattered. At thirty a side under
a third does, and 83% of rounds hand the attack all four marks against 65% at twelve. Nothing
improves as the teams grow: the attack's share of the marks rises, the defence's plan is
worth less, and the duels that get played are more often decided before they start.

Nor is it about the numbers being small. It is about the numbers against the board. Thirty a
side would want about ten boards to contest rather than four; on this board it is three
players per board that keeps the round live.

## What a defender with nobody to fight may do

Allow the step. It is worth about twice as much as it costs to explain.

Without it, the defence covers whatever squares it is standing on and nothing else, and with
at most thirty defenders on thirty-two squares that leaves the attack free squares to walk
into. The step turns one defender into cover for their own square and the four next to it,
and it is the difference between a defence and a formality:

| a side | | plays a duel | decided something | rounds conceding all four marks | a plan is worth |
|---|---|---|---|---|---|
| 10 | no step | 47% | 33% | 76% | 0.40 |
| 10 | step | 65% | 54% | 62% | 0.44 |
| 20 | no step | 46% | 18% | 85% | 0.23 |
| 20 | step | 65% | 38% | 77% | 0.31 |
| 30 | no step | 49% | 13% | 91% | 0.09 |
| 30 | step | 62% | 30% | 83% | 0.20 |

"A plan is worth" is points per attacking round: the difference between a defence that
allocates deliberately and one that scatters at random, measured on the same positions. At
thirty a side, without the step, a deliberate defence saves under a tenth of a point a round
— which is to say the phase may as well not be played. With the step it saves twice that, and
two thirds of each team gets a game instead of half.

The step is also the only thing that makes standing two deep on a square mean anything, for
the reason in the next section.

## What the defence cannot do

**Stop the marks.** It concedes between three and a half and four marks out of four at every
team size and under every rule tried here, and this is not a matter of playing better. A
defence that has already seen the attack it is answering, and that the attack is not allowed
to re-plan against, still concedes 3.84 of four.

The reason is in the way a square is taken, and it is arithmetic rather than a measurement.
A defender fights one attacker. So a lone attacker on a square faces exactly one duel
whatever else is standing there, and takes the square by winning it — **one attacker takes
any square, against any number of defenders, exactly as often as they win a duel.** Piling
defenders onto a square past the first buys nothing at all against a single attacker, and
even matching an attack of three or five or seven one for one still concedes the square half
the time. The chance the attack takes a square:

| attackers | 0 def | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | 100% | 50% | 50% | 50% | 50% | 50% |
| 2 | 100% | 50% | 25% | 25% | 25% | 25% |
| 3 | 100% | 100% | 75% | 50% | 50% | 50% |
| 5 | 100% | 100% | 100% | 88% | 69% | 50% |
| 7 | 100% | 100% | 100% | 100% | 94% | 81% |

Two things fall out of it that a team will find on its own. **Twice the defenders plus one
takes a square outright**, which is the price list the attack allocates against. And **an even
number of attackers is never worth more than one fewer** — the same number of losses is
allowed either way, and the even force has one more duel to lose it in — so forces come in
odd numbers, and two attackers on a defended square is strictly worse than one.

So the defence's job on this board is not denial. It is to make the attack pay for the
squares that are worth having, and to turn free captures into duels — which is the whole of
what the step adds, and most of why the number of players matters.

The Counterattack's part in the campaign is not settled yet.
