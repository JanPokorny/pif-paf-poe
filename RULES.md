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

Duels are fought inside a campaign. Two teams, **X** and **O**, contest a square field of 3x3
boards, and every contested space is settled by games of pif-paf-poe between attackers and
defenders.

**Pick the field by the headcount.** Four boards in a 2x2 -- a 6x6 field of 36 squares -- for
about twelve a side. Nine boards in a 3x3 -- a 9x9 field of 81 squares -- for about thirty. The
rules are the same either way, and the field is what makes the larger game work: one mark per
board per round means the attack has nine marks to win rather than four, so the work grows with
the players instead of staying where it was.

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
7. **Scoring.** Count the three-in-a-rows of the attacking team's symbol, counting them
   separately where they overlap: a cross is two, four in a row is two. **n of them in one round
   are worth n squared** -- one, four, nine, sixteen.
8. **Clearing.** For each line scored, **one** of the boards its three symbols stood on is
   cleared completely, both teams' symbols alike, and **the attack chooses which**.

A campaign runs to an agreed number of points. Because the score is squared, the number has to be
set against the field: about **22 points on the 2x2** and **70 on the 3x3** both give a campaign of
around twenty rounds.

### Why the score is squared and only one board clears

These two are chosen together, and the reasoning is under *What makes a campaign strategic*. In
short: squaring makes holding a position worth more than cashing it, which is what gives the
campaign a shape across rounds, and clearing one board rather than all of them keeps that from
turning into two enormous rounds and nothing else.

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

### Why there is no centre space

An earlier version of the field had a hole in the middle -- a square belonging to no board, which
no attack could be aimed at and no defender could stand on, and which changed hands only by the
attacking team declining every one of its marks for the round. It made for a line the other team
could not block, and under a squared score it was becoming a real weapon: four such lines cross
the middle, so one flip could take all four.

It is gone, and not because the numbers killed it. **A round in which your team attacks and has to
give up everything it won is not a round anybody wants to play.** The measurements agree it was
marginal anyway -- under a plain score the flip happened in well under one round in a hundred, and
a team that deliberately played for it lost -- but the reason it is out is the one at the table.

A square field has no hole, so nothing has to be done to remove it. If an attack wins nothing it
places nothing, and the round simply passes.

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

## What makes a campaign strategic

Two things you would want from a campaign pull in opposite directions, and this is the most useful
thing measured here.

**Careful placement pays most when the board is swept clean, and least when it is crowded.** A team
that prices a lone mark as groundwork, against one that prices only threats it can finish next
round, wins by:

| what clears | 2x2, twelve a side | 3x3, thirty a side | a mark survives |
|---|---|---|---|
| every board the line touched | **+520%** | +77% | 1.2-1.8 rounds |
| one board, attack picks | +115% | +21% | 1.7-2.7 rounds |
| the three squares only | +29% | +21% | 2.6-4.7 rounds |

So board memory and strategic depth are not the same thing and do not want the same rule. On a
swept board every mark has to be earned and placed exactly; on a crowded one threats turn up by
accident and planning is worth much less. Sweeping the board is what makes each round sharp, and
it is also what stops the campaign having any shape.

**A mark has to live long enough to build on.** At 1.2 rounds it is gone before its own team
attacks again, which is the whole of why the original rule left the campaign feeling like a run of
separate rounds. Two rounds is the minimum for anything to carry.

### So: squared scoring, and one board clears

| | attack scores | a mark survives | points from 3+ line rounds | attack falls short of every board | a defensive plan is worth |
|---|---|---|---|---|---|
| every board clears, plain score | 0.78 | 1.3 rounds | 27% | 39% of rounds | 59% of the scoring |
| **one board clears, squared** | **2.14** | **2.2 rounds** | **35%** | **40% of rounds** | **66% of the scoring** |
| line only clears, squared | 5.30 | 6.2 rounds | 87% | 61% of rounds | — |

At twelve a side on the 2x2. The middle row is the recommendation, and it is the middle row on
every measure at once:

- **Squaring buys the arc.** It makes holding a position worth more than spending it -- the best
  price for a two-in-a-row goes from 0.12 of a point to 0.35 -- so the attack starts refusing
  squares it won in order to keep its ground, which nothing else here makes it do. A mark lives
  2.2 rounds instead of 1.3.
- **Clearing one board keeps it honest.** Squaring on top of light clearing gives 87% of all points
  to a handful of enormous rounds; clearing a whole board stops the stockpiling, and the figure
  falls to 35%. It is also the rule under which the defence has the most influence of any tried --
  two thirds of the attack's scoring -- and the rule that lets the attack fall short of a board
  most often, which is the defence's work made visible.
- **And it adds a decision to the attack** that it did not have: which board to give up when it
  scores.

Neither of these fixes the individual duel. **The chance that a given player's own game decides
the square it is played on** runs about 53% at twelve a side and 26-33% at thirty, whatever the
rules, and it falls with team size on every setting. Counting the players left idle as well, that
is about 31% of a team at twelve a side and 15-21% at thirty. It is the price of a two-to-one
exchange rate: both sides can buy certainty, and rational teams do.

That figure is worth stating carefully, because there are two ways to ask the question and only one
of them is the one a player cares about.

- **Beforehand:** sitting down, what is the chance my result turns this square either way? It does
  exactly when the other duels on the square come to one short of what the attack needs.
- **Afterwards:** would my result, alone, flipped, have flipped the square?

They disagree case by case. Two attackers against two defenders who both win is a square that no
single result would have changed -- the attack needed both duels and got neither, so flipping one
still leaves it one short. Afterwards, none of those four decided it. Beforehand, each of them had
an even chance of being the one who did, because one duel going the other way would have put the
square on the last.

The one to quote is the first, and the two come to the same number in the aggregate -- measured at
58.1% against 57.7%, 45.4% against 45.2%, 32.7% against 32.2% across the sizes. They have to: the
chance a duel is decisive *is* the chance it turns out to have been decisive, so summing the one
and counting the other estimate the same thing. Level numbers on a square leave every duel on it
between a third and a half likely to decide it -- one against one is certain, two against two and
three against three are a half each, six against six is 31%.

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
- **It was also what nearly saved the centre space.** On a field with a hole, four lines cross it,
  so one flip could take all four for sixteen points; flips went from one round in two hundred to
  one in thirty, and pricing those threats highly turned from a half-point-a-round loss into a
  half-point gain. That is the strongest case the centre space ever made, and it is still not
  played, for the reason under *Why there is no centre space*.

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

## Hands that change hands

Everyone arrives with five stones drawn at random, and the rules let a player replace one. The
occasion for that is **standing on a square your side won** -- every attacker on a square the attack
took, and every defender on a square the defence held, whether they fought a duel or not.

How much a swap is worth was settled first. All 252 hands of five played a sample of each other and a
strength was fitted, so a duel is `sigmoid(mine - theirs)`. The hands span 3.50: the best beats the
worst 97% of the time and the median 75%, and **one chosen swap is worth 0.69**, which turns an even
duel into a 67% one.

Five occasions were measured, on the settled board and with both teams playing roles:

| occasion | swap offers a round | of those, change a hand | useful swaps a round | spread within a team | distinct hands | early luck decides the campaign | the worst player, by round 24 |
|---|---|---|---|---|---|---|---|
| after winning a duel | 5.8 | 65% | 3.8 | **0.58** | 85% | r = 0.24 | **-0.19** |
| after losing one | 5.7 | **67%** | 3.8 | 0.39 | 84% | r = 0.03 | 0.51 |
| after playing one | 11.3 | 54% | 6.2 | 0.35 | 75% | r = -0.05 | 0.78 |
| **on a square you won** | 11.8 | 53% | **6.3** | 0.31 | 73% | **r = -0.01** | **0.74** |
| after a round unpaired | 11.2 | 52% | 5.8 | 0.32 | 74% | r = 0.02 | 0.77 |
| by standing out | 4.0 | 50% | 2.0 | 0.23 | 90% | — | — |

Twelve a side; a swap is worth 0.69, so a player at 0.78 has gained about one stone over a player who
started at zero and never improved.

### Why on a square you won

- **It rewards the contribution the rules already count.** An unpaired attacker's presence is part of
  how a square is taken -- that is what the power rule says -- so the player who walked alone onto an
  empty square and handed their team a free mark has done the most efficient thing on the board.
  Rewarding only the players who fought a duel gives that player nothing, and whether anybody fought
  was the *other* team's decision, not theirs.
- **Nothing is worth throwing.** Rewarding the loser of a duel is the obvious way to keep the back of
  the field moving, and in a live game it pays a player to lose on purpose: a stone is worth 0.69 and
  the square they threw costs their team rather than them. Tying the reward to the square's result
  instead of the duel's removes the incentive.
- **Nobody spends the evening on the hand they walked in with.** Under *after winning a duel* the
  unluckiest player on each team finishes at **-0.19**, below where an average random hand starts:
  they lost early, never earned a swap, and watched their team improve around them. Here the worst-off
  finishes at **+0.74**, and how a player's first six rounds went tells you nothing about where they
  end up (r = -0.01 against 0.24).
- **It is a team result, so it rewards coordinating.** Winning a square is what the round is about,
  and this is the only occasion whose reward follows it.

What it costs: a flatter team. The spread of hands within a team settles at 0.31 rather than the 0.58
that rewarding duel winners gives, so no star duellists emerge, and the field holds 73% distinct hands
rather than 85%. **Take *after winning a duel* instead if a hierarchy of champions is wanted** -- it is
the only occasion that produces one -- and accept that one player a side will finish the campaign no
better than they began.

The three rejected. **After playing a duel** measures almost identically but rewards being engaged,
which is the other team's choice rather than the player's, and gives nothing to the lone attacker who
took an empty square. **After a round unpaired** has the same problem in mirror image: its swaps go to
whoever the other team happened not to engage. **Standing out** -- skipping the round at a training
space -- produces the fewest useful swaps of any occasion, costs eleven points of participation every
round, and a team that declines to use it is beaten four to one, which makes it a compulsory opening
move with a trap attached rather than a decision.

### Two things that hold whichever occasion is chosen

**The swap has to be chosen, not rolled.** Replacing a stone with a random one flattens all of this:
after twenty-four rounds of rewarding every winner the field's average strength is -0.15 where it
started at -0.01, the spread has not moved, and essentially nobody is on a good hand. A random
replacement is a walk, not a ladder.

**Tell players which square they are training for.** A swap aimed at the veto a player has been given
to specialise in keeps 75-85% of a team's hands distinct for a whole campaign; a swap aimed at being
good on average walks the whole field onto one hand -- 86% of a team holding the same five stones by
round sixty. The vetoes are what make the first possible, and the team saying who goes where is what
makes it worth doing.

## The opening position

**Start with about a fifth of the squares already marked, half of them each: four X and four O on the
6x6, nine and nine on the 9x9.**

An empty board makes a dull first round. Every square is worth the same, so there is nothing to choose
between them and nothing worth defending -- the two sides shuffle into position and the round decides
nothing. Measured as how far the most valuable free square stands above the median one, which is the
size of the choice in front of a captain:

| squares seeded, each side | round 1 | round 2 | round 3 | round 4 | first point falls at round |
|---|---|---|---|---|---|
| none | 0.30 | 0.60 | 1.14 | 1.92 | 3.6 |
| 2 | 0.71 | 0.93 | 1.26 | 2.18 | 3.1 |
| **4** | **0.96** | 1.31 | 1.33 | 1.97 | **2.7** |
| 6 | 1.15 | 1.77 | 1.28 | 1.71 | 2.0 |
| 8 | 1.45 | 1.83 | 1.23 | 1.63 | 1.6 |

On the 6x6. Four pairs put the first round where the *third* round of an empty board sits, and bring
the first point forward by a round, while leaving the position still building through the opening. Six
or eight pairs make the first round hotter than the fourth round of an empty board and then the curve
sags -- the board is full enough that lines clear before anything accumulates.

The 9x9 wants the same fifth: nine pairs take its first round from 0.15 to 1.27, again about where its
third round would otherwise be, and fourteen or eighteen front-load the opening and flatten what
follows.

Two requirements on where they go.

**In rotational pairs, minus two for whoever attacks first.** For every square X starts on, O starts on
the one half a turn about the centre of the board away from it -- and then the team attacking in round
one gives two of theirs back. So the first attacker opens on **two** marks against the other side's
four.

That is not a nicety. The team that attacks first has the tempo, and measured as points per attacking
round it is worth **+0.64** to them on a level opening -- about a quarter of the scoring rate. Seeding
makes it worse rather than better, because there is now a position to exploit and the first attacker
gets first use of it: the same gap on an empty board is +0.45. Handing back two marks brings it to
**+0.10, plus or minus 0.14** -- level within the noise of these runs. One mark back leaves +0.41, which
is not enough.

**No three in a row.** A seeded line would hand its owner a point before anybody had played. Draw the
pairs one at a time and reject any that completes a line for either side.

## Upgrade points

Winning a square pays. **Each of your players standing on a square your side won takes one upgrade
point** -- the same players the stone swap already goes to. Points buy two things:

| | cost |
|---|---|
| replace one stone in your hand | **2 points** |
| a random Counterattack, single use | **2 points** |

A player holds as many Counterattacks as they like, presents up to three at the start of a duel, and
may use one of them during it. An unused card is kept; only a used one is discarded.

### Where those numbers come from

A player earns **about half a point a round**, which is twelve over a campaign of twenty-four rounds,
and fights about fifteen duels in that time. So twelve points is the budget, and the question is what
it should buy.

Both purchases can be priced in the same unit, the strength that decides a duel. **A swap is permanent
and a Counterattack is spent**, which is the whole of why they price differently.

Successive swaps, climbing towards the best hand for the square you have been told to hold:

| swap | 1st | 2nd | 3rd | 4th | 5th |
|---|---|---|---|---|---|
| worth | **1.02** | 0.36 | 0.16 | 0.05 | 0.01 |

Three swaps take a player 96% of the way there, which is why "happy with your hand" arrives so quickly.

Counterattacks, drawn at random from the five, valued by where they leave the seat that holds them:

| | Overtake | Relocate | Mirror | Mind Control | Rehearse |
|---|---|---|---|---|---|
| worth | 1.23 | 0.80 | 0.67 | 0.34 | 0.03 |

Holding one is worth **0.62** -- the average, since it is a random draw. Holding two and using the
better is 0.90, holding three is 1.05. So the second card adds 0.29 and the third 0.15, and a fourth
adds nothing to a duel because it cannot be presented: it is stock for the next one.

Now the durability. A swap applies to every duel a player has left -- about fifteen at the start and
seven by the halfway point -- while a Counterattack applies to one. At the halfway point a third swap is
worth 0.16 x 7 = 1.1 against a first Counterattack's 0.62, and a fourth swap is worth 0.05 x 7 = 0.35
against it. **So at equal prices the order comes out by itself: swap, swap, swap, then cards.** No
tuning is needed to make a player finish their hand before they start buying Counterattacks; the shape
of the two curves does it.

Two points a purchase then puts twelve exactly where it should: **three swaps and three cards**, which
is precisely the number a player is allowed to present. A player who has been through a campaign holds
a full hand and a choice of three.

### Two things to know before setting the prices differently

**A Counterattack only works for the defender.** A Counterattack held by the player who moves first
does nothing, and the campaign's attacker is the duel's first player -- so a card is a defensive
purchase, held until the round your team defends. That is not a problem, since a card is kept until
used, but it means a player buying one is buying it for half their duels.

**Draw them at random, or reprice.** Overtake is worth forty times Rehearse. A player who could choose
would always take Overtake at 1.23, which would need a price nearer four to be honest. The random draw
is what makes one flat price defensible.

And one thing that falls out on its own: cards bought late get spent late, so the second half of a
campaign has a Counterattack in most defending duels and the attacker's edge drifts back towards even.
The economy is its own brake on the pace -- the campaign starts fast and tightens as the players arm
themselves.

### What is measured here and what is not

The swap ladder is measured, from the fitted hand table. The Counterattack values are measured, from the
duel studies that priced each of the five. The earning rate is measured, from the campaign. **The
ordering and the prices are derived from those three rather than played out** -- the spending itself is
not simulated, so treat two-and-two as a well-grounded starting point rather than a settled figure, and
watch whether players in practice stop swapping after three.

## Stone vetoes

**Every square switches off one type of stone** for the duels fought on it. The stone is still
placed, still occupies the square and still counts towards a line -- it simply does nothing. Six
types and a neutral square make seven, laid out stepping one across and three down:

```
   -  S  2  R  M  M          - neutral   S shift   2 2048
   R  M  M  S  -  S          R rotate    M mountain
   S  -  S  2  R  M          M magnet    S stinky
   2  R  M  M  S  -
   M  S  -  S  2  R          no line of three repeats a veto,
   S  2  R  M  M  S          and each type gets five or six squares
```

On the 9x9 the same pattern gives every type eleven or twelve squares and again no line of three
with a veto repeated in it.

### It makes who goes where the biggest decision in the round

A strength was fitted for every hand against every veto, seven ladders rather than one. They are
close to being different games:

- **every veto has a different best hand.** Four 2048s and a Stinky is the best hand where Shift is
  switched off; four Shifts and a Magnet where 2048 is; three Rotates and two 2048s where the
  Mountain is.
- **the ladders barely agree.** Across the twenty-one pairs of vetoes the strengths correlate 0.489
  on average, and one pair at **-0.05** -- knowing a hand is strong on one square tells you nothing
  at all about another.
- **a hand swings 1.92 of strength between its best square and its worst**, where a whole stone
  swapped is worth 0.69. **Where a player stands is worth about three stones.**

Measured in play, a team that sends each player to the square whose veto suits their hand beats one
that simply sends its best hands where the most is at stake by **+0.94 points an attacking round**
against a scoring rate of about 2.4 -- near enough forty per cent, and the largest single effect of
any rule in this document. At thirty a side it is worth the same again. So the veto does what it was
added for: the round now has a real second question after "where do we go", which is "who goes
there", and getting it wrong costs more than losing the allocation.

### It does not stop hands converging, and the reason is the stone pool

This was the other hope for the vetoes and it does not happen. The field still walks onto one hand.
Twelve a side, rewarding winners:

| round | 6 | 12 | 24 | 36 | 48 | 60 |
|---|---|---|---|---|---|---|
| distinct hands of twelve | 9.1 | 6.6 | 4.0 | 3.1 | 2.6 | 2.4 |
| share of the team on the commonest | 27% | 48% | 72% | 79% | 84% | 86% |

Which is the same course it ran with no vetoes at all.

It is not for want of coordination. A team can decide in advance who goes where, and that was
measured properly: every player given a veto to specialise in, the quotas set by which vetoes the
duels are actually being fought on, the swaps they earn spent on their own veto, and the assignment
sending a role-holder to their square ahead of a stronger player without the role. **A team playing
that way is beaten by about 37% of the scoring rate** by one that simply makes everybody as good as
possible on average -- 0.89 points a round at twelve a side, 2.6 at thirty.

The reason is the pool of stones, not the board. Here is the best all-rounder, `shi shi 204 204 sti`,
against the best hand for each veto:

| veto | best hand there | its strength | the all-rounder | gap | all-rounder's rank |
|---|---|---|---|---|---|
| shift | 204 204 204 204 sti | 2.34 | 1.58 | 0.76 | 21 of 252 |
| 2048 | shi shi shi shi mag | 1.93 | 1.23 | 0.70 | 22 of 252 |
| rotate | shi shi 204 mou mag | 1.94 | 1.55 | 0.39 | 8 of 252 |
| mountain | 204 204 rot rot rot | 1.75 | 0.90 | 0.86 | 33 of 252 |
| magnet | shi shi 204 204 sti | 1.44 | 1.44 | 0.00 | **1 of 252** |
| stinky | shi 204 204 rot mag | 1.73 | 1.31 | 0.43 | 14 of 252 |
| neutral | shi shi 204 204 mag | 1.42 | 1.06 | 0.36 | 12 of 252 |

**There is a hand that is good everywhere.** It is never worse than thirty-third of 252 on any
square, and on one square it is the best hand there is. Specialising therefore buys at most 0.50 of
strength on your own square and costs 0.64 on every other -- so a specialist has to be standing on
their own veto more than about 56% of the time merely to break even, and that is before counting the
rounds spent part-way to a specialist hand, paying the cost without yet collecting the gain.

Coordination cannot deliver that. Under the pattern above a role-holder is on their own veto **45%**
of the duels they fight at twelve a side and 52% at thirty, because the attack chooses which squares
are contested and it chooses them for the lines they make, not for their vetoes.

**Giving each board a single veto helps and is not enough.** Then attacking a board means committing
to one kind of hand, and a role-holder is on their own veto 57% of the time rather than 52% -- the
gap against generalists narrows from 2.6 to 1.9 points a round at thirty a side, but does not close.

So: **take the vetoes for the coordination, which is the largest effect in this document, and do not
expect them to keep hands apart.** If varied hands are wanted, the thing to change is the stone pool
-- no hand should be able to sit in the top fifteen under every veto -- or the reward, so that it
cannot inflate the whole field: trading stones with a teammate is zero-sum inside a team and has no
best hand to converge on.

## The Counterattack in a campaign

The Counterattack was invented to level the duel: the opening seat takes 72% of games with nothing
against it, and holding a Mirror or a Relocate brings that to about 57%. In a campaign it does something
else entirely, and the reason is that **the campaign's attacker is the duel's first player.**

That makes the duel's first-mover advantage into a standing attacker advantage -- and a standing
attacker advantage is not unfair, because the two teams attack in alternate rounds and get exactly as
much of it as each other. What it is instead is a **pacing dial**. Setting the attacker's chance in an
even-handed duel to `edge`:

| the attacker's chance | Counterattack | the attack takes | your game decides its square | points a round | a mark survives |
|---|---|---|---|---|---|
| 50% | one that levels the seat | 84% of contested squares | 51% | 2.46 | 2.0 rounds |
| **57%** | **Mirror or Relocate** | **87%** | **50%** | **2.76** | 1.9 rounds |
| 65% | a weak one | 89% | 48% | 2.92 | 1.8 rounds |
| 72% | none at all | **92%** | **45%** | 2.94 | 1.8 rounds |

**So it is right that the advantage helps the campaign along** -- dropping the Counterattack entirely
runs the campaign 20% faster and puts more marks down. But it is bought from the defence, and the
defence is the phase that took the most work to make matter. At 72% the defence holds one contested
square in twelve; at 50% it holds one in six.

**Keep the Counterattack, and keep it weak.** Mirror or Relocate, at about 57%, takes 12% of the pace
increase and gives up almost nothing: the defence still holds 87% -- one square in eight -- and the
chance a player's own game decides its square is 50% against 51%. Going the rest of the way to 72% buys
another 6% of pace for eight points of the defence's grip and six of the duel's decisiveness, which is
a poor trade.

What has changed is what the Counterattack is *for*. It is no longer there to make the duel fair, since
alternating roles do that by themselves. It is there to stop the attacker's edge running away with the
defensive phase, and the number to tune it against is not "is the duel even" but "does the defence still
hold enough squares to be worth playing".

One consequence for the opening: a larger attacker edge needs a slightly larger handicap. At 72% the
first attacker giving back two marks leaves +0.15 and giving back three leaves +0.09, though the
difference between them is inside the noise, so two is enough at any setting on this list.
