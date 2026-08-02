# Base game balance (no skills)

Measuring the stones themselves: is any hand type obviously the best, and does the
"beats" relation form a hierarchy or a rock-paper-scissors web?

```
node sim/hands.js --games 300 --iters 500                      # five-copy hands
node sim/hands.js --set swap2 --games 240 --iters 450          # two copies in a mixed shell
node sim/hands.js --rules '{"chainPulls":0}' ...               # one rule variant, full matrix
node sim/sweep.js --round3 --set swap2 --games 160 --iters 400 # compare rule variants
```

## Method

Hand archetypes play a round robin; every pair plays both seatings, so the matrix is
antisymmetric around 50% and the first-mover advantage cannot masquerade as hand
strength. Mirror matchups (the same archetype on both sides) measure the first-mover
advantage for that hand. Two archetype sets:

- `mono` — five copies of one stone, plus `mixed` (regular/shift/2048/rotate/chain) and
  `control` (regular/magnet/stinky/shift/rotate). Isolates a stone, but nobody plays
  five Magnets.
- `swap2` — two copies of the stone in an identical shell (`regular`, `shift`, `rotate`).
  Hands differ by exactly two cards, which is what a real deck decision looks like, and
  it is the marginal value a metagame price should key off.

Three numbers summarise a rule set:

- **spread** — best archetype's score minus worst. Large spread means dead hand types.
- **cycles** — of the archetype triples, how many form a > b > c > a. A strict hierarchy
  scores 0; rock-paper-scissors scores high.
- **first-mover edge** — mean and worst-case win rate of whoever moves first in a mirror
  match. 50% is fair; 100% means the coin toss decides the game.

## Baseline: the game as it stands

**Five-copy hands** (300 games/pair, 500 iterations/move, 13500 games):

| archetype | score | beats | mirror: 1st player wins |
| --- | --- | --- | --- |
| mixed | 82.5% | 8/8 | 90.3% |
| chain | 74.5% | 6/8 | 96.7% |
| rotate | 73.8% | 7/8 | 72.7% |
| control | 67.0% | 5/8 | 58.0% |
| 2048 | 53.5% | 2/8 | 98.0% |
| regular | 34.0% | 3/8 | 92.0% |
| shift | 26.5% | 1/8 | 79.3% |
| stinky | 20.8% | 2/8 | 0.3% |
| magnet | 17.3% | 1/8 | 48.7% |

spread **65.2pp** · cycles **2/84** · first-mover edge **70.7% mean, 98.0% worst**

**Two-copy hands** — the realistic version, and the one to design against
(240 games/pair, 450 iterations/move):

| archetype | score | beats | mirror: 1st player wins |
| --- | --- | --- | --- |
| chain | 71.8% | 6/6 | 93.8% |
| rotate | 67.3% | 5/6 | 90.8% |
| 2048 | 64.4% | 4/6 | 90.8% |
| magnet | 39.2% | 2/6 | 63.7% |
| stinky | 37.3% | 3/6 | 58.3% |
| regular | 35.0% | 1/6 | 60.8% |
| shift | 35.0% | 0/6 | 68.8% |

spread **36.8pp** · cycles **0/35** · first-mover edge **75.3% mean, 93.8% worst**

### Diagnosis

The game has **two tiers and no cycles at all**. Swapping two cards in a hand for Chains
is worth about +37 percentage points, and the ordering is a perfect hierarchy — every
archetype beats everything below it and loses to everything above.

The tier line is not "special vs plain". It is **can this stone complete a line by moving
stones that are already on the board**. Chain, Rotate and 2048 can, so they win from
positions where the opponent has nothing to block: a placement threat has exactly one
blocking square, but a movement threat has none, because the winning stone is already on
the board. Shift can technically do it too, but shifting a line cyclically preserves that
line's contents, so it is much weaker at it — and it sits in the bottom tier with the
stones that cannot do it at all.

Two smaller pathologies show up in the five-copy numbers:

- **Magnet is a trap card.** A Magnet hand loses 100-0 to a plain Regular hand. "The
  opponent must place next to this stone" points them at your newest stone, which is
  exactly where your line is forming, so Magnet mostly helps the opponent block you.
- **Stinky inverts the seat.** In an all-Stinky mirror the *second* player wins 99.7%.
  It is the only thing in the game that punishes moving first.

## What does not work

Sixteen rule variants were tried against the five-copy set (140 games/pair, 350
iterations, `sim/sweep.js --round1`, `--round2`). None improved on the baseline:

| rules | top archetype | spread | cycles | 1st edge |
| --- | --- | --- | --- | --- |
| *base* | *mixed 79.9%* | *62.9pp* | *3/84* | *71.3%* |
| deferred effect win | mixed 86.9% | 67.6pp | 0/84 | 70.5% |
| restriction fizzle | mixed 77.8% | 75.6pp | 1/84 | 72.0% |
| chain: 1 pull | mixed 81.2% | 64.2pp | 3/84 | 69.8% |
| no centre opening | mixed 82.6% | 65.2pp | 3/84 | 81.7% |
| persistent restrictions | mixed 79.8% | 66.0pp | 3/84 | 77.4% |
| persistent + fizzle | control 81.8% | 72.3pp | 1/84 | 76.8% |
| fizzle + deferred + chain1 | mixed 86.2% | 84.0pp | 0/84 | 68.6% |

Rule sets tested: `effectWin:false` (a line made by an effect gives the opponent one turn
to break it), `restrictionFizzle` (a movement stone played under a restriction does not
resolve its effect), `persistentRestriction` (every Magnet/Stinky on the board keeps
restricting, not just the last one played), `chainPulls` (cap on how far Chain drags),
`openCentre:false`, and their combinations.

The instructive failure is **deferring effect wins**, which made the spread *worse*
(67.6pp) and wiped out the remaining cycles. Giving the defender a turn to break a line
sounds like it should help the weak hands, but the only way to break a line is to move a
stone — and only the top tier can do that. Every rule that adds a defensive window hands
that window to the stones that were already winning.

That is the trap in this game's design space: **movement stones are simultaneously the
best offence and the only defence**. Any change that makes defence matter more amplifies
them.

## What does work

Two changes, and **only in combination**, break the hierarchy:

- **Persistent restrictions** — every Magnet/Stinky the opponent has on the board keeps
  restricting your placement for as long as it stays there, instead of only the one they
  played last turn. Placement must satisfy "next to some enemy Magnet, next to no enemy
  Stinky"; if that leaves nowhere to play the filter relaxes step by step, so a lock can
  never deadlock the game.
- **Restriction fizzle** — a movement stone played while you are under an enemy
  restriction is still placed, but its effect does not resolve.

Either one alone changes nothing (0 cycles, chain still beats the entire field). Together
they give the denial stones a way to attack the thing that was dominating, and the order
collapses (200 games/pair, 400 iterations, two-copy hands):

| rules | top archetype | spread | cycles | unbeaten | 1st edge |
| --- | --- | --- | --- | --- | --- |
| *base* | *chain 70.2%* | *34.8pp* | *0/35* | **1** | *73.6%* |
| chain0 | rotate 69.3% | 34.9pp | 0/35 | 1 | 72.0% |
| chain0 + fizzle | chain 66.8% | 34.9pp | 0/35 | 1 | 74.8% |
| chain0 + persistent | rotate 67.1% | 34.8pp | 0/35 | 1 | 75.0% |
| persistent + fizzle | magnet 70.2% | 44.7pp | 2/35 | **0** | 74.6% |
| **chain0 + persistent + fizzle** | **magnet 70.7%** | 45.3pp | **3/35** | **0** | 73.1% |

`unbeaten` counts archetypes that lose to nothing at all — the sharpest test of "is
anything obviously OP". In the base game it is 1: Chain beats every other hand. Under the
recommended rules it is 0: every hand type has something that beats it.

### The recommended rule set, verified

`chainPulls: 0` (Chain moves itself but drags nothing), `persistentRestriction`, `fizzle`
— 260 games/pair at 650 iterations/move, two-copy hands:

|  | magnet | chain | rotate | stinky | 2048 | shift | regular |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **magnet** | – | 53.8 | 65.8 | **47.3** | 94.2 | 89.2 | 90.0 |
| **chain** | **46.2** | – | 53.1 | 76.2 | 50.0 | 77.3 | 85.4 |
| **rotate** | **34.2** | **46.9** | – | 61.2 | 50.8 | 86.9 | 86.5 |
| **stinky** | 52.7 | **23.8** | **38.8** | – | 71.5 | 69.2 | 70.4 |
| **2048** | **5.8** | 50.0 | **49.2** | **28.5** | – | 71.5 | 80.4 |
| **shift** | **10.8** | **22.7** | **13.1** | **30.8** | **28.5** | – | 51.5 |
| **regular** | **10.0** | **14.6** | **13.5** | **29.6** | **19.6** | **48.5** | – |

overall: magnet 73.4 · chain 64.7 · rotate 61.1 · stinky 54.4 · 2048 47.6 · shift 26.2 ·
regular 22.6 — spread 50.8pp, **2 cycles, 0 unbeaten archetypes**

The loop is a genuine counter-triangle:

**Magnet beats Chain and Rotate** (53.8 / 65.8) — a movement hand under a standing
restriction is a hand of blanks. **Chain and Rotate beat Stinky** (76.2 / 61.2) — Stinky
pushes the opponent away but never builds anything. **Stinky beats Magnet** (52.7) —
Magnet's own restriction drags the opponent right next to the Magnet player's newest
stone, and Stinky is the hand that most wants to be pushed around.

### What this costs

Regular (22.6%) and Shift (26.2%) fall further. A plain hand has no answer to a board
lock, and Shift is the weakest movement stone to begin with. Under your "price it in the
metagame" plan those are the two cheap commons — but Regular losing 10-90 to Magnet is
past the point where a price fixes it, so Shift and Regular are the next things that need
a buff, not a discount.

### Suggested price ordering

Marginal value of putting two copies of a stone in an otherwise identical hand — this is
the number a cost should track:

| stone | base game | under recommended rules |
| --- | --- | --- |
| chain | 71.8% | 64.7% |
| rotate | 67.3% | 61.1% |
| 2048 | 64.4% | 47.6% |
| magnet | 39.2% | **73.4%** |
| stinky | 37.3% | 54.4% |
| regular | 35.0% | 22.6% |
| shift | 35.0% | 26.2% |

## Still unsolved: moving first

Nothing tried here touched the biggest imbalance in the game. Whoever moves first still
wins **70% on average and 95% with a 2048-heavy hand**, and that number does not respond
to search budget (100 → 4000 iterations/move changes it by noise), to any of the 24 rule
variants, or to hand size. Games end in ~5 turns, which is barely enough for the second
player to do anything.

If this matters, the fix is not a stone tweak — it is a structural one: a pie rule
(second player may swap sides after the first stone), or a compensation stone for the
second player, or something that lengthens the game enough for a comeback to exist. Note
that the earlier Relentless skill did exactly the latter and overshot to 87%, so the
correct compensation is smaller than one free stone.
