# Base game balance (no skills)

Measuring the stones themselves: is any hand type obviously the best, and does the
"beats" relation form a hierarchy or a rock-paper-scissors web?

```
node sim/hands.js --games 300 --iters 500                      # five-copy hands
node sim/hands.js --set swap1 --games 240 --iters 450          # one copy in a plain hand
node sim/hands.js --set swap2 --games 240 --iters 450          # two copies in a mixed shell
node sim/loadouts.js --loadouts 60 --opponents 14              # random hands, fitted stone values
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
- `swap1` / `swap2` — one or two copies of the stone in an identical shell (`swap1` fills
  with Regulars, `swap2` with `regular`/`shift`/`rotate`). Hands differ by one or two
  cards, which is what a real deck decision looks like, and it is the marginal value a
  metagame price should key off. Comparing the two exposes how a stone stacks.

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

- **Magnet does not stack.** The first copy is a real upgrade; the fifth is a disaster.
  Head-to-head against the same hand holding Regulars instead, Magnet scores **65.4%
  with one copy, 50.4% with two, and 0.0% with five**. Each Magnet points the opponent
  at your newest stone, which is exactly where your line is forming — one of those is a
  useful lure, three in a row is a guided tour of your position. Do not read the
  five-copy number as "Magnet is bad"; read it as "Magnet has strongly negative
  self-synergy", which is a different and much more interesting card.
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

At 260 games per pair the leg that closes the triangle (Stinky over Magnet, 52.7%) sits
inside its own confidence interval — 260 games is not enough to distinguish it from a coin
flip, and both cycles in the table depend on that one cell. Re-measured at 2600 games per
pair, all three legs are significant and the triangle stands (`results/cycle-edge.txt`):

| edge | rate | Wilson 95% | n |
|---|---|---|---|
| magnet > rotate | 61.4% | [59.5, 63.3] | 2600 |
| rotate > stinky | 63.1% | [61.2, 64.9] | 2600 |
| stinky > magnet | 55.4% | [53.5, 57.3] | 2600 |

The cycle also survives deleting Chain from the pool: Rotate already shares Chain's node,
so recomputing the matrix without the Chain archetype leaves the Magnet > Rotate > Stinky >
Magnet triangle intact and unbeaten archetypes at 0. (No new games were needed for that
check — the swap2 shell contains no Chain, so `chainPulls` never applies to any pair not
involving the Chain archetype itself.)

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


## Does a stone's value depend on how many you take?

Yes, and for Magnet it dominates everything else. Head-to-head against the identical
hand holding Regulars in place of the Magnets:

| copies of Magnet | vs the Regular version | Magnet's score vs the field |
| --- | --- | --- |
| 1 (in an all-Regular hand) | **65.4%** | 37.6% |
| 2 (in a mixed shell) | 50.4% | 39.2% |
| 5 (mono hand) | **0.0%** | 17.3% |

One Magnet is worth more than one Regular by a wide margin. Five Magnets lose every
single game to five Regulars. Any per-stone price has to be a curve, not a number, or
players will correctly buy exactly one.

The one-copy set (`--set swap1`, 240 games/pair) also reorders the top: **2048 79.9% >
rotate 76.4% > chain 51.7%** > shift 46.1% > magnet 37.6% > stinky 30.9% > regular 27.5%.
Chain is the best stone to stack and only the third best to hold one of; 2048 is the
reverse. Game length nearly doubles too (7.0 turns, against 4.7 for two-copy hands),
because a hand that is mostly Regulars cannot end things quickly.

## Random loadouts: what the in-game autobattler is showing you

60 random five-stone hands, each against 14 random rivals in both seatings, 3360 games
(`sim/loadouts.js`). Fitted value is a least-squares fit of loadout score on stone
counts, scaled to what five copies would be worth:

| stone | in top 25% of hands | base rate | mean score with >=1 | fitted value per 5 copies |
| --- | --- | --- | --- | --- |
| chain | 80.0% | 48.3% | 58.0% | **+49.2pp** |
| 2048 | 53.3% | 50.0% | 55.2% | +33.6pp |
| rotate | 66.7% | 50.0% | 57.0% | +30.3pp |
| shift | 46.7% | 56.7% | 49.9% | -12.8pp |
| magnet | 46.7% | 60.0% | 46.8% | -32.0pp |
| regular | 26.7% | 45.0% | 45.9% | -32.1pp |
| stinky | 53.3% | 68.3% | 46.8% | -36.1pp |

**Magnet shows up in plenty of strong hands** — three of the top six here — which is
exactly the impression the autobattler leaderboard gives. It is a base-rate illusion:
Magnet is in 60% of random hands, and it appears in only 46.7% of the top quartile, so
it is actually *under*-represented among winners. The top hands containing it
(`2048 chain magnet rotate stinky`, `2048 magnet magnet rotate rotate`) are carried by
their Chains, Rotates and 2048s. Compare Chain: 48.3% base rate, 80.0% of the top
quartile.

Two things make this easy to misread in-game. The autobattler's default settings play
about 36 games per loadout, which is a standard error of roughly 8 percentage points —
wide enough for any stone to top the table by luck. And with seven stone types in five
slots, most types appear in about half of all hands, so "the top hands use it" is the
null result, not a finding.

## Which stones could be cut?

A stone's own win rate is the wrong criterion — deleting one changes the balance of
everything left. So: regenerate the whole random-loadout tournament with that stone
removed from the pool and see what the remaining game looks like
(`sim/loadouts.js --pool ...`, 48 hands x 12 opponents, 2592 games per pool).

Two numbers, and they pull in opposite directions:

- **sd / p90-p10** — how much the *draw* decides the game. Lower is better.
- **first** — the first-mover edge in mirror matches. Lower is better.

| removed | sd | p90-p10 | first-mover | verdict |
| --- | --- | --- | --- | --- |
| *nothing (all 7)* | *17.3* | *55.2* | *83.0%* | |
| **shift** | 16.3 | 53.8 | **76.4%** | **cut this one** |
| chain | 17.0 | 50.2 | 77.8% | tempting, but nerfing is cheaper |
| regular | 13.7 | 44.9 | 81.3% | defensible |
| rotate | 16.9 | 54.5 | 79.5% | no reason to |
| 2048 | **19.4** | **58.2** | 77.4% | **keep — removing it hurts** |
| magnet | 12.5 | 39.5 | **87.5%** | **keep — removing it hurts** |
| stinky | 10.5 | 33.8 | **84.4%** | **keep — removing it hurts** |

**Read sd with care.** Deleting a weak stone lowers it almost by definition, because bad
hands stop existing; it is not evidence that the stone was bad for the game. Smaller
pools also score lower on it mechanically, so only compare pools of equal size. The
first-mover column is the one that cannot be gamed this way.

### Cut Shift

It is the only removal that buys a real improvement without paying for it somewhere else:
the best first-mover swing of any single cut (**83.0% -> 76.4%**, more than either Chain
or 2048 gives) at essentially unchanged draw-dependence.

It is also the most *redundant* stone in the set. Shift slides a line; that is what 2048
already does, and 2048 does it better. And it is bottom-tier under every measurement we
have: 46.1% with one copy, 35.0% with two, -12.8pp fitted in random hands, 0/6 matchups
won in the two-copy round robin. Nothing in the game is only expressible as a Shift.

### Do not cut the two that look weakest

Magnet (39.2% with two copies) and Stinky (37.3%) are the worst-scoring stones and the
obvious things to delete. Both removals make the game **worse**: the first-mover edge goes
from 83.0% to 87.5% and 84.4%. They are the only brake on the seat advantage — an
all-Stinky mirror is the one configuration in the game where the second player wins — they
are the entire denial class, and they are the pair that produced the only
rock-paper-scissors triangle we found. Cutting them buys a lower sd, which is the
tautology above, and pays for it with the game's biggest actual defect.

**2048 is the sharpest case.** It is a top-tier stone by score (+33.6pp fitted) and yet
removing it is the only cut that makes draw-dependence *worse* on both measures
(17.3 -> 19.4, 55.2 -> 58.2). It is doing balancing work as the counterweight to Chain.

### Chain: cut or nerf

Chain is the "too strong" stone by every measure: +49.2pp fitted, 80% of the top quartile
from a 48% base rate, unbeaten in every base-rules configuration. Cutting it does help
(first-mover 83.0 -> 77.8, p90-p10 55.2 -> 50.2). But `chainPulls: 0` — Chain steps to an
adjacent empty space and drags nothing — already brings it into line (Rotate takes over
the top spot at a similar level), and that keeps the most distinctive mechanic in the game.
Prefer the nerf; cut it only if rules length is the thing being optimised.

### If you want to get down to five

| pool | sd | p90-p10 | first-mover |
| --- | --- | --- | --- |
| 2048 rotate magnet stinky chain (cut shift, regular) | **15.2** | **49.8** | 80.6% |
| regular 2048 rotate magnet stinky (cut shift, chain) | 19.9 | 63.6 | **77.4%** |
| shift 2048 rotate stinky chain (cut regular, magnet) | 9.3 | 32.9 | **87.2%** |

The third row is the trap this whole section is about. An sd of 9.3 is by far the best in
the study and it is the *worst* pool of the three: every hand is a race, so the coin toss
decides 87% of games. Cutting Shift and Regular (top row) is the better five-stone game —
every hand keeps a real choice and the seat advantage does not get worse.

### Also: Swap is in the rules but not in the game

The root README lists a **Swap** stone (exchange the placed stone's row or column with
another). It is not implemented in `index.html` and is not in any measurement here. That
is a free simplification: either delete it from the rules or build it.

## Reducing the first-mover advantage

Measured on mirror matches only — 48 random hands, each played 12 times from both
seatings, 1152 games per rule set (`sim/loadouts.js --opponents 0 --mirrors 12`). That
isolates the seat: identical hands, so the only asymmetry left is who moves first. 50% is
fair; standard error is about 1.2pp.

| rule set | 1st player wins | turns |
| --- | --- | --- |
| *base* | *79.3%* | *4.9* |
| opening stone must be a corner | 83.2% | 4.8 |
| opening stone must be the centre | 80.4% | 4.7 |
| second player starts with +2 Regulars | 79.2% | 4.8 |
| opening stone is inert (no effect, no restriction) | 78.0% | 4.9 |
| opening stone must be an edge | 77.3% | 4.9 |
| second player starts with +1 Regular | 77.0% | 4.9 |
| effect-lines forbidden | 70.7% | 5.6 |
| effect-lines forbidden + chain0 | 68.6% | 5.7 |
| **persistent + fizzle + chain0** ("balance set") | **66.8%** | 5.6 |
| balance set + effect-lines forbidden | **64.6%** | 5.9 |
| **pie rule** | **49.7%** | 5.3 |
| balance set + pie rule | **47.9%** | 6.2 |

### Handicaps and opening restrictions do nothing

Everything aimed *directly* at the seat lands within a couple of points of the 79.3%
baseline, which is barely outside noise. Constraining where the opening stone may go is
worthless in both directions — forcing a corner makes it *worse* (83.2%), forcing an edge
helps by 2pp. Making the opening stone inert buys 1.3pp. Handing the second player a spare
stone buys 2.3pp for one and nothing for two, which is what the earlier finding predicts:
games end after ~5 turns with stones still in hand, so extra cards are not a resource
anyone is short of.

The reason is that the advantage is **tempo**, not position and not material. The first
player reaches three stones first, and nothing that adjusts the starting position or the
hand size changes that ordering.

### Slowing the race down works, and it is free

The rule set already recommended for stone balance — persistent restrictions, restriction
fizzle, Chain drags nothing — cuts the seat advantage from **79.3% to 66.8%**, four times
the effect of any purpose-built handicap, and it was not designed for this at all. Adding
"a movement effect may not complete your own line" takes it to **64.6%**, at the cost of
the stone-balance regression that variant causes (see above). Game length rises from 4.9
to ~5.9 turns, which is the mechanism: the defender gets enough turns to matter.

This is the cheapest real fix. It needs no new concepts in the rules, and it is the same
change already justified on other grounds.

### The pie rule removes it outright

**49.7%** — the seat advantage is gone, and with the balance set on top, 47.9%. That is
not a surprise, it is close to a theorem: if the second player may trade seats after
seeing the opening move, the first player is forced to open with something they would be
equally happy to receive, so the value of moving first is competed away by construction.

Implemented as `pieRule`: after the opening turn, the second player may trade seats,
taking the opening stone *and* the hand that played it, after which the opener moves as
the second player. Game length only rises to 5.3 turns, so it does not slow the game down
the way the balance set does.

The cost is conceptual, not numerical: the opening turn becomes a bidding exercise rather
than a move, which is a real change in feel and adds a rule that needs explaining. It also
makes the opening deliberately weak, which some players dislike.

### Recommendation

Take the **balance set** first: 79.3% → 66.8%, no new concepts, and it is the same change
that removes the dominant hand type. If a ~67% seat advantage is still too high — and for
a two-player game it probably is — add the **pie rule** on top for 47.9%. Nothing else
tested is worth the rules text.

For casual play there is a zero-rules option that the harness itself relies on: **play
paired games with swapped seats** and score the pair. That makes the seat advantage cancel
exactly rather than approximately, which is why every measurement in this document does it.

## Four new stones: Mimic, Leech, Glue, Mountain

Built to answer two questions: is there a stone that rewards moving *second*, and
can positional immobility (Glue, Mountain) replace the Stinky + persistent
restriction + restriction fizzle machinery, which is a lot of rules text.

Every run below is the swap2 shell at 200 games per pair, 600 iterations, both
seatings. `firstAdv` is the mean over the archetype mirrors in that same run, so
it is comparable across these rows but not with the mirror-only instrument in the
section above.

| pool / rules | top | spread | cycles | unbeaten | firstAdv |
|---|---|---|---|---|---|
| recommended: base 7, persist+fizzle+chain0 | magnet 73.4 | 50.8 | 2/35 | **0** | 70.4 |
| Glue+Mountain replace Stinky, plain rules | chain 75.2 | 42.1 | 0/56 | 1 | 76.3 |
| Glue only, plain rules | chain 71.9 | 38.9 | 2/35 | 1 | 79.1 |
| Glue one-sided, plain rules | chain 75.1 | 41.9 | 0/56 | 1 | 74.9 |
| persist + Glue, no fizzle | chain 71.4 | 42.3 | 0/35 | 1 | 79.5 |
| persist + Glue, no fizzle, chain0 | rotate 68.2 | 39.0 | 1/35 | **0** | 77.9 |
| Glue replaces Stinky, persist+fizzle+chain0 | magnet 75.8 | 51.2 | 1/35 | 1 | 76.8 |
| Stinky *and* Glue, persist+fizzle+chain0 | magnet 69.3 | 43.9 | 4/56 | **0** | 70.4 |
| Mimic+Leech added, no Stinky, plain rules | leech 69.1 | 42.8 | 0/56 | 1 | 72.9 |
| all new stones, no Stinky/Chain, plain rules | leech 74.8 | 39.6 | 4/84 | 1 | 70.8 |

### Immobility cannot replace fizzle: it is a fifth of the mechanism

Each denial hand is two copies in the swap2 shell, played against a Chain hand,
600 games. The counter is how many of the opponent's effects the mechanism
actually cancelled.

| mechanism | score vs a Chain hand | enemy effects cancelled per game |
|---|---|---|
| Mountain | 18.2% | 0.06 |
| Glue (symmetric) | 21.7% | 0.19 |
| Glue (one-sided) | 18.8% | 0.20 |
| Stinky + persist+fizzle | 31.2% | 0.32 |
| Magnet + persist+fizzle | **57.3%** | **0.84** |

Magnet plus fizzle cancels four times what Glue does, and that is the whole
difference. Magnet *forces* the opponent to place next to it, so the fizzle clause
then bites almost every turn from anywhere on the board. Glue only bites when the
direction the opponent actually wanted happens to drag a glued stone — about one
turn in five — and its reach is five squares.

Removing fizzle confirms which half is load-bearing: with persistent restrictions
but no fizzle, Magnet drops from 73.4% to 46.4% and Chain is unbeaten again.
**Fizzle is the rule that does the work; persistence is the smaller half.**

### Glue cannot replace Stinky either

Keeping persist+fizzle and swapping Stinky for Glue puts the game *further* out of
balance than the base game was: Magnet becomes unbeaten at 75.8% and the spread
grows to 51.2pp, the worst in this study.

| matchup | result |
|---|---|
| Stinky vs Magnet | **60.5%** |
| Glue vs Magnet | 42.0% |
| Glue vs Rotate | 19.0% |
| Glue vs Chain | 17.5% |

Stinky beats Magnet; Glue loses to it. Stinky is the only counter Magnet has, so
deleting it is what makes Magnet unbeaten — not anything about Glue.

The reason is that the counter-cycle does not live on the movement axis at all. It
lives on the *placement* axis: Magnet compels adjacency, Stinky forbids it, and
they are opposites of one another, which is exactly why they counter. Fizzle is
the amplifier that makes dictating placement matter against a movement hand. Glue
and Mountain sit on the movement axis, where the movement stones already win, and
on that axis they are simply weak stones (35-43%).

Adding Glue *alongside* Stinky changes nothing structurally (unbeaten 0 either
way, firstAdv 70.4 either way) and Glue is the second-worst archetype in that
pool at 35.3%. It does not earn a slot.

**Mountain should be cut outright.** It cancels 0.06 effects per game, it is
dominated by Glue in every pool containing both, and it is Glue with radius zero,
so it adds a stone type without adding a mechanic.

### Mimic is a good stone that does nothing for the second player

Mimic is well balanced — 47.9% and 51.6% across two pools, mid-table in both —
and two Mimics are worth **+21pp over the two Regulars they replace** (47.9 vs
26.4). Keep it if you want another stone; it is the only one of the four that is
neither too weak nor too strong.

But it fails the job it was designed for. Mirror matches, 800 games each:

| mirror hand | 1st player wins |
|---|---|
| plain (regular x3, shift, rotate) | 49.5% |
| Mimic shell (mimic x2, regular, shift, rotate) | 72.5% |
| Mimic + movers (mimic x2, shift, rotate, 2048) | 94.6% |
| all Mimic | 97.1% |

Two reasons, and the first generalises to every "dead on turn 1" design:

1. **A conditional blank costs nothing when you choose your play order.** The
   opener eats 0.67 blanks per game to the responder's 0.36 — a difference of a
   third of a stone. A stone that is bad on the first turn simply is not played on
   the first turn.
2. **Mimic copies movement effects, and movement is what makes moving first
   good.** It amplifies the tempo game rather than taxing it.

The all-Mimic row is 97.1% with *zero* copies per game: if neither side ever plays
a non-Mimic there is nothing to copy, so the hand degenerates into all-Regulars,
and with no movement stones in play a completed line can never be broken. Same
mechanism as the base game's core finding, from the other direction.

### Leech is overpowered

Top archetype in every pool it appears in — 69.1%, 72.1%, 74.8%, beating 7/8 —
and it does not help the seat either (mirror 63.0%). Swapping places with an
enemy stone is the strongest reactive effect there is, as expected. Nerf it (swap
only with an enemy *Regular*, or make the swap the whole turn) or leave it out.

### What this means for simplifying the rules

The awkward text cannot be traded for a stone: fizzle and Stinky are both
load-bearing, and Glue and Mountain are weak stones on an axis that is already
won by the movement stones. What *can* be simplified is the wording, without
touching behaviour:

- The relaxation ladder does not need enumerating. "If no square satisfies every
  restriction on you, ignore as few of them as you can" is the same rule as
  "both, then Stinky only, then Magnet only, then none".
- Fizzle is one clause: "a movement stone placed while an enemy restriction is on
  you is placed, but its effect does not resolve."
- Persistence is one clause: "a Magnet or Stinky restricts for as long as it stays
  on the board, not just the turn after it is played."

That is three sentences for the whole mechanism, which is close to the floor for
what it buys (unbeaten 1 → 0, and the largest single reduction in the first-mover
advantage of anything measured that is not the pie rule).
