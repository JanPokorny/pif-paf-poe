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

Everyone arrives with five stones drawn at random, and the rules can let a player replace one.
Four occasions were measured for handing that out, all giving the same thing so that only the
recipient differs: **after winning a duel**, **after losing one**, **after a round spent unpaired**,
and **by standing out** -- skipping the round at a training space instead of taking the field.

How much a swap is worth had to be settled first. All 252 hands of five played a sample of each
other on a circuit of spaces, and a strength was fitted to the results, so a duel is
`sigmoid(mine - theirs)`. The hands span 3.50 of strength: the best beats the worst 97% of the
time and the median 75%. **One chosen swap is worth 0.69**, which turns an even duel into a 67%
one. It is a large reward, and a rule that hands it out often will decide more than the board does.

### After winning a duel

**The best of the four.** It is the only one that spreads a team out rather than levelling it --
the spread of hands inside a team goes to 0.72 against 0.60 for hands that never change -- and the
only one still moving at the end of a twenty-four round campaign, with the field's mean strength
climbing 0.25, 0.59, 0.87 at rounds two, eight and twenty-four. It gives a team a hierarchy: a few
duellists worth sending where the round will be decided, which is a thing to have and to lose.

It does not run away, which was the reason to suspect it. Both teams win about half the duels
every round, so both collect about the same number of swaps and the advantage stays *inside* a
team rather than between them. An early lead predicts the final result slightly *less* well than
with no hand rule at all -- r = 0.60 against 0.67.

### After losing a duel

Workable, and the one to take if keeping the back of the field interested matters more than
anything else. It lifts the average hand fastest of the two duel rules (1.05 by round twenty-four
against 0.87) because the players with most to gain are the ones gaining, and it pulls a team
together: the spread falls 0.70 → 0.18 and the gap between the two teams' averages 0.18 → 0.07.

The cost is that it erases itself. By round twenty everybody holds much the same hand, and from
there the rule is bookkeeping.

### After a round spent unpaired

**Reject this one.** At twelve a side it hands out eleven swaps a round where the others hand out
four to six, because a third of a team is unpaired in any round. The field tops out by **round
eight** -- mean 1.10, spread 0.10, and both frozen for every round after -- so the mechanic is over
before the campaign is half done.

It is also the only one nobody chooses. Which of your players go unrewarded is settled by the other
team's allocation, not by anything either team decided.

### By standing out

The most appealing of the four written down, and the worst in play.

The rate does have a genuine best value -- about a fifth of the team -- and the sweep around it is
the shape a real decision has: sending a third or two fifths instead costs 0.05 to 0.14 points a
round. But a team that declines to use it at all is **beaten four to one**, 1.05 points a round
against 4.33. So it is not a decision, it is a compulsory opening move with a trap attached: the
band where the choice matters is worth a tenth of a point and the penalty for missing the idea
altogether is worth three.

It also costs the thing hardest to get back. Twenty percent of a team standing out drops the share
of players who get a game from 59% to 48%, every round, for the whole campaign.

### Two things that hold whichever occasion is chosen

**The swap has to be chosen, not rolled.** Replacing a stone with a random one instead of a chosen
one flattens all of this completely: after twenty-four rounds of rewarding every winner, the
field's average strength is −0.15 where it started at −0.01, the spread has not moved off 0.61, and
essentially nobody is on a top hand. A random replacement is a walk, not a ladder, and the whole
mechanic becomes paperwork.

**A chosen swap is a ratchet, and a ratchet needs a stop.** Every occasion measured drives the
field towards one hand and then stops mattering -- round eight for unpaired, twelve to sixteen for
standing out, twenty for losing, and somewhere past twenty-four for winning. Drawing a space per
duel does not prevent it; the strength table above was fitted on exactly that circuit and the field
converges anyway. If hands are to keep changing for a whole campaign, the reward wants to be
something that cannot inflate the field -- **trading stones with a teammate** rather than drawing a
better one, say, which is zero-sum inside a team and so has no ceiling to reach.

**So: after winning a duel, with the stone chosen.** It is the slowest to converge, the only one
that makes a team uneven in an interesting way, and it does not hand the campaign to whoever got
lucky first.

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

### It does not stop hands converging

This was the other hope for it and it does not happen. A player choosing a swap does not know which
square they will be sent to, so the sensible choice is the hand with the best average across the
vetoes -- and everybody's best average is the same hand. Twelve a side, rewarding winners:

| round | 6 | 12 | 24 | 36 | 48 | 60 |
|---|---|---|---|---|---|---|
| distinct hands of twelve | 9.1 | 6.6 | 4.0 | 3.1 | 2.6 | 2.4 |
| share of the team on the commonest | 27% | 48% | 72% | 79% | 84% | 86% |

Which is the same course it ran without any vetoes at all. Worse, **holding a diverse team is
punished.** A team that spends its swaps covering the board -- and it does work, holding 10.7 of
twelve hands distinct for as long as you like -- is beaten by **0.95 points a round** by a team that
simply makes everyone as good as possible on average.

The reason is worth understanding before trying to fix it. **The attack chooses which squares are
contested**, so neither side knows in advance which vetoes the round will turn on. A specialist is
strong on one square in seven and weak on the rest; a good all-rounder is adequate everywhere, and
adequate everywhere is what you want when you cannot pick the ground. Specialisation is fragile
exactly because the board is chosen by somebody else.

So take the vetoes for the coordination, which is large and real, and do not expect them to keep
hands apart. If hands should stay varied the reward is the place to change -- something that cannot
inflate the whole field, like trading stones with a teammate.

**One variant worth trying, not yet measured.** Give the veto to the *board* rather than the square:
nine boards, one veto each. Then attacking a board means facing a known veto, a specialist can be
planned for, and the thing that makes specialisation fragile -- not knowing which ground you will
fight on -- is gone. It would cost some of the coordination the square-by-square pattern buys, since
every square in a board would ask for the same hand.

The Counterattack's part in the campaign is not settled yet.
