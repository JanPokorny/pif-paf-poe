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

Duels are fought inside a campaign. Two teams, **X** and **O**, contest a board made of 3x3
boards, and every contested space is settled by games of pif-paf-poe between attackers and
defenders. Ten to twenty a side on four boards; **twenty and up wants nine boards in a 3x3**,
for the reasons under *The arrangement of the boards*.

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
is the **centre space**: it belongs to no board, no attack is ever aimed at it and no defender
ever stands on it, and it changes hands only by flipping. The four squares the boards do not
reach — a1, g1, a7, g7 — are not spaces yet.

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
   places knowing exactly where the defence has gone.
3. **Pairing.** On each square the defenders there pair off one to one against the attackers
   there, and a defender with a choice of attackers chooses. A defender left with nobody to
   fight **steps to an orthogonally adjacent square where the attackers outnumber the
   defenders** and pairs with an attacker there. A defender may stand idle only when there is
   no unpaired attacker on their square or on any square next to it.
4. **The duels.** Every pair plays a game of pif-paf-poe.
5. **Taking the squares.** On each square, each side's **power** is its unpaired players there
   plus the duels its players won there. The attack takes the square when its power is
   strictly higher. Level power holds for the defence.
6. **Placing the marks.** Each of the four boards may claim one of the squares its attack
   took, and mark it with the attacking team's symbol. A corner may be claimed for either of
   the two boards it belongs to. So at most four marks, and a board may decline.
7. **The flip.** If no mark at all was placed, the centre space becomes the attacking team's
   symbol, whether it was empty or the other team's.
8. **Scoring.** The attack scores a point for every three in a row of its symbol, counted
   separately where they overlap: a cross is two points and four in a row is two points. Then
   every board that a scored line stood on is cleared completely, both teams' symbols alike,
   and the centre space with them if the line ran through it.

A campaign runs to an agreed number of points. At ten points it lasts about twenty-six rounds,
since a team scores about three quarters of a point in each round it attacks.

### The price list

Everything either team decides in a round is decided against this table, which follows from
the way power is counted and needs no play to establish. The chance the attack takes a square,
at even duel odds:

| attackers | 0 def | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 100% | 50% | — | — | — | — | — | — | — |
| 2 | 100% | 50% | 25% | 25% | — | — | — | — | — |
| 3 | 100% | 100% | 75% | 50% | 13% | 13% | — | — | — |
| 4 | 100% | 100% | 75% | 50% | 31% | 31% | 6% | 6% | — |
| 5 | 100% | 100% | 100% | 88% | 69% | 50% | 19% | 19% | 3% |
| 7 | 100% | 100% | 100% | 100% | 94% | 81% | 66% | 50% | 23% |

A dash is nothing at all, not a long shot. Read off it:

- **Twice the defenders and one more takes a square outright**, whatever the duels do.
- **Twice the attackers denies it outright**, whatever the duels do. So the exchange rate is
  two to one in both directions, which is what makes both allocations worth making.
- **Level numbers never favour the attack.** Odd against odd is a coin flip; even against even
  is better than that for the defence, because a strict majority of an even number of duels is
  more than half of them.
- Every extra player helps their own side, always. There are no wasted bodies and no ranks of
  defenders standing idle behind a fight they are not allowed to join, because an unpaired
  defender counts towards holding the square just as an unpaired attacker counts towards
  taking it.

### Conceding the round to take the star

Phase 7 is not only what happens when an attack wins nothing. It is a play, and it is the
only way a symbol ever reaches d4.

A line through the star cannot be blocked. Its third square is the one no attack is ever aimed
at, so once you hold both ends -- d3 and d5, or c3 and e5, or either of the other two pairs --
the other team cannot answer by marking the gap the way they could answer any other
two-in-a-row. Their only reply is to spend a round of their own attack flipping the star to
their symbol, which costs them all four of their marks. And the four lines that cross at d4
share it, so a team holding several of the inner ring can score more than one point from a
single flip.

Measured: essentially every flip that happens is deliberate -- the attack had squares it could
have marked and declined them -- and a flip round scores 1.1 to 1.4 points against a normal
round's 0.75.

It is also rare, well under one round in a hundred, and **a team that plays for it does worse**.
Priced at three times an ordinary threat a position on a star line costs 0.09 points a round;
at five times it costs 0.41, because the team starts turning down marks it should have taken.
Take the flip when the board offers it. Do not build towards it.

### Why a line costs you the ground it stood on

Because otherwise the middle of the board fills up and stays filled. Clearing is what keeps
the campaign moving, and pricing it against the scorer is what makes a point a decision:
three of the four boards go with a line across the inner ring, which is most of what you had
built. Roughly one round in six scores, and the board settles at about a seventh full.

### Why the attack moves second

So that the defence has to be a real allocation rather than a guess. It also means the attack
can never be bluffed: there is nothing to be gained by hiding a defence, because it will be
read before it is answered. What the defence gets back is the step in phase 3, which it makes
*after* seeing the attack — the one piece of information it ever gets in the right order.

## How many players

Ten to twenty a side. Twelve if you want the sharpest game, twenty if you want more people in
the room; past twenty it goes on working but the individual games stop mattering much.

The board asks for four marks a round however many people you bring, so players past that buy
the attack certainty rather than buying anybody a game. With the stepping rule:

| a side | plays a duel | of those, decides it | decided something | rounds conceding all 4 | attack scores |
|---|---|---|---|---|---|
| 10 | 58% | 66% | **38%** | 63% | 0.71 |
| 12 | 59% | 55% | 32% | 61% | 0.71 |
| 14 | 61% | 51% | 31% | 65% | 0.72 |
| 17 | 63% | 47% | 29% | 66% | 0.75 |
| 20 | 65% | 43% | **28%** | 67% | 0.75 |
| 24 | 65% | 37% | 25% | 72% | 0.79 |
| 30 | 66% | 32% | **21%** | 77% | 0.80 |

"Decided something" is the share of a team who played a duel *that decided the square it was
played on*, counting a player whose duel was already moot alongside a player left standing
idle, because they come to the same thing at the table. It halves across the range. What a
deliberate defence is worth over a scattered one falls with size too, from 0.74 points an
attacking round at ten a side to 0.48 at thirty.

Nothing improves as the teams grow. But the fall is gentle in the middle of the range and
steep only at the ends, which is why twenty is still a good game and thirty is a thinner one.
Thirty a side would want about ten boards to contest rather than four.

## What a defender with nobody to fight may do

**Step, and it does not matter whether the rule says may or must.**

Allow the step. Without it a defender covers the square they are standing on and nothing else,
and with at most thirty defenders on thirty-two squares the attack has free squares to walk
into: the share of contested squares it takes goes from 74% with the step to 89–94% without,
and the share of a team whose game decided anything falls by half or more.

| a side | | plays a duel | decided something | takes contested squares | a plan is worth |
|---|---|---|---|---|---|
| 10 | no step | 38% | 17% | 89% | 0.56 |
| 10 | step | 58% | 38% | 74% | 0.74 |
| 20 | no step | 49% | 12% | 90% | 0.50 |
| 20 | step | 65% | 28% | 73% | 0.55 |
| 30 | no step | 52% | 7% | 94% | 0.46 |
| 30 | step | 66% | 21% | 75% | 0.48 |

"A plan is worth" is the difference in points per attacking round between a defence that
allocates deliberately and one that scatters at random, measured on the same positions.

**May or must makes no measurable difference.** Under this scoring the step is not free — an
unpaired defender counts towards holding the square they are standing on, so stepping away
spends that to buy a duel next door — so it is a real choice, and a defence allowed to decline
it was measured against one compelled to take it: 0.700 points against 0.701, 3.46 marks
against 3.46, at every team size, on shared positions. The defence wants the step nearly
always. Write it as **must**, because it settles at the table without an argument, and lose
nothing.

## What the defence can and cannot do

It cannot stop the marks. It concedes between 3.5 and 3.8 of four at every team size, because
the attack needs one square per board out of the six or seven free ones there, and one attacker
takes an undefended square. Thirty-two squares cannot be covered.

What it can do is make the marks worthless, and it is very good at it. Against a defence that
scatters at random the attack scores about 1.02–1.21 points an attacking round; against one
that allocates deliberately, 0.34–0.75. A good defence roughly halves the attack's scoring
without denying it a single mark, by conceding the squares that are not building anything and
pricing the ones that are.

So the defensive phase is about steering rather than blocking, and the numbers say it is worth
playing carefully: at ten a side, defensive allocation is worth about as much per round as the
whole difference between ten a side and thirty.

## The arrangement of the boards

Four 3x3 boards can be arranged in a plain 2x2 -- a 6x6 square, 36 squares, nothing shared and
no hole -- and it plays a little better than the pinwheel. **Nine boards in a 3x3, an 81-square
board, plays better than either, and it is the arrangement for twenty a side and up.**

The thing the pinwheel looked like it was for is the line built inside a single round, which
needs three squares claimable for three different boards. It is not: the plain 2x2 has just as
many, on the diagonals either side of the centre, where a line crosses the vertical and the
horizontal boundary on different steps.

At twenty a side, with the original clearing rule:

| arrangement | boards | squares | lines | one-round lines | marks won | claims every board | decided something |
|---|---|---|---|---|---|---|---|
| pinwheel, as drawn | 4 | 32 + star | 68 | 4 | 3.6 of 4 | 68% | 28% |
| plain 2x2, 6x6 | 4 | 36 | 80 | 4 | 3.6 of 4 | 64% | **31%** |
| overlapping a row and column, 5x5 | 4 | 25 | 48 | 20 | 3.6 of 4 | 71% | 30% |
| pinwheel pulled in one step | 4 | 30 | 60 | 11 | 3.6 of 4 | 65% | 29% |
| **nine boards in a 3x3, 9x9** | **9** | **81** | **224** | **16** | **4.9 of 9** | **0.0%** | 28% |

### Why nine boards rather than four

On any four-board arrangement the attack takes about nine marks in ten and claims all four
boards in about two rounds in three. The defence's work is real but invisible: it steers the
marks onto squares that are not building anything rather than keeping the attack out.

On nine boards the attack claims **4.9 of 9**, it has **never once** claimed all nine, and it is
short by two boards or more in essentially every round. The defence keeps it out of four boards
a round, and a defensive plan is worth 0.8 marks a round against 0.13 on the 2x2 -- which is the
same defence doing the same work, made visible.

Two more things follow. Which boards to attack becomes a decision, where on four boards the
answer is always "all of them". And the share the attack takes barely moves with the team size --
52% of the boards at twelve a side, 54% at thirty -- where on four boards going from twelve to
thirty pushes it from 65% of rounds claiming everything to 76%. Nine boards is the arrangement
that scales.

What it does not fix is the individual duel. The share of a team whose game decided its square
still falls with team size on every arrangement, from about 39% at twelve a side to about 20% at
thirty. Nine boards makes the *team's* decisions matter more, not each player's.

## What a scored line takes with it

The original rule -- every board the line touched -- clears between a fifth and three quarters
of the whole board, and leaves it about an eighth full at any moment. Three variants were
measured against it, at twelve, twenty and thirty a side on both the pinwheel and the 3x3:

| what clears | board stays | attack scores | a defensive plan is worth | share of the attack's scoring |
|---|---|---|---|---|
| every board the line touched | 12-15% full | 0.72-1.24 | 0.54-0.84 | 48-65% |
| the line and everything touching it | 10-16% full | 0.77-1.13 | — | — |
| one of those boards, attack picks | 16-21% full | 1.05-2.99 | **0.79-1.20** | 22-58% |
| the three squares and nothing else | **27-35% full** | 1.53-2.48 | 0.63-1.37 | 29-42% |

**One board, and the attack picks which, is the best of the three.** It doubles what a defensive
plan is worth in points a round over the original rule, it gives the attack a real decision it
did not have, and it leaves the board half again as full. The cost is that scoring speeds up by
about half, so a campaign wants a higher target.

**Clearing the line and what touches it is not a change.** On these arrangements a line's
neighbourhood is 13 to 15 squares and the boards it would have cleared are 10 to 16, so the two
rules clear almost the same ground and measure the same on everything. It only becomes a real
change on an arrangement whose boards overlap heavily, where a board is most of the whole.

**Clearing only the line is the one rule that gives the campaign a memory** -- 27-35% full
against 12-15% -- and it is the one to take if building across rounds is the point. It doubles
or triples the scoring rate, so the target has to go up with it, and it is the variant where the
defence has the least relative influence.

## What several lines in one round are worth

Counting n lines as n points is the rule as it stands. Counting them as **n squared** -- 1, 4, 9,
16 -- changes what a good team is trying to do more than any other variant measured here, and it
does it by changing the answer to a question the attack asks every round: cash in now, or hold?

The evidence that it changes strategy rather than just inflating the score is that it moves the
price of a position. Measured by playing candidate valuations against each other, the best price
for a two-in-a-row is about **0.12 of a point under linear scoring and 0.30 to 0.45 under
squared** -- three to four times higher. A team valuing position at 0.45 loses six points to one
under linear scoring, because it declines points it should take; under squared scoring the same
valuation wins. Above about 0.7 it collapses again, so the incentive to hoard is strong but not
unbounded.

At twenty a side, with the stepping rule and each scoring rule given its own best valuation:

| scoring | what clears | marks won | points | lines | board stays | rounds taking 2+ lines | points from 3+ line rounds | claims every board | flips |
|---|---|---|---|---|---|---|---|---|---|
| linear | every board | 3.6 | 0.76 | 0.76 | 15% | 38% | 18% | 68% | 0.7% |
| **squared** | **every board** | **3.6** | **1.33** | **0.66** | **19%** | **54%** | **36%** | **69%** | 0.3% |
| linear | the line only | 3.8 | 1.59 | 1.58 | 27% | 70% | 56% | 80% | 0.5% |
| triangular (1,3,6) | the line only | 3.5 | 3.67 | 1.54 | 43% | 91% | 87% | 63% | 2.3% |
| squared | the line only | 3.1 | 5.50 | 1.45 | **51%** | **96%** | **86%** | **46%** | 3.0% |

What the rule buys:

- **The attack starts refusing marks to keep its position.** With light clearing it takes 3.1 of
  four rather than 3.8, and claims every board in 46% of rounds rather than 80%. It is holding
  ground instead of spending it, which is the first variant here under which the attack ever
  turns down a square it won.
- **The board fills up.** 51% full against 27%, and 19% against 15% under the original clearing.
  This is the fix for a campaign that did not remember anything.
- **Scoring rounds become detonations.** 96% of them take two lines or more.
- **The star becomes a weapon.** Four lines cross d4, so one flip can take all four -- sixteen
  points. Flips go from one round in two hundred to one in thirty, and a team that deliberately
  prices star threats above ordinary ones now gains half a point a round where under linear
  scoring it lost half a point. The advice under *Conceding the round to take the star* reverses:
  under squared scoring, build towards it.

What it costs: **the campaign concentrates into a handful of rounds.** With light clearing, 86% of
all points come from rounds taking three lines or more, so two or three detonations decide the
whole thing and everything else is preparation. That lumpiness is mostly the clearing rule rather
than the curve -- triangular scoring is just as lumpy at 87% -- so the two rules have to be chosen
together:

- **Squared with the original clearing** is the balanced pair: the hoarding incentive is there, the
  board holds half again as much, and 36% of points come from the big rounds rather than 86%.
- **Squared with line-only clearing** is a full positional game and a very swingy one.

Either way the totals inflate -- 1.8x with the original clearing, 3.5x with light clearing -- so
the target score has to be rescaled with the rule.

### The subboard-filling bonus does not fire

Sweeping the other team's symbols out of a board when your symbol fills it was measured with
line-clearing, on every arrangement, at every team size, and at the highest occupancy any of
them reach. It sweeps between 0.00 and 0.08 symbols a round. It never happens.

The reason is that light clearing does not make the board full, it makes it a third full: three
or four marks go down each round and a scored line takes three away, and the two balance at
around a third. A nine-square board needs all nine, and at a third full that is not something
that occurs. If the bonus is wanted, it needs a trigger that can actually be reached -- a
majority of a board rather than all of it.

The Counterattack's part in the campaign is not settled yet.
