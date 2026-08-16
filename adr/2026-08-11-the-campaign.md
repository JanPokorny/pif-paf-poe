# 2026-08-11 — the campaign

Everything here was measured rather than argued. `campaign.js` plays the round, `board.js`
holds the geometry, `hands.js` and `roster.js` the hands and who fights where, `test.js` the
invariants. Decisions are in order; the retractions are at the end.

## Instruments

- **Arithmetic** — the chance an attack takes a square is closed-form in the two forces and the
  duel odds. It settled the capture rule with no simulation.
- **Sweep** — many rounds per team size, each size from several seeds and summed, because
  allocating whole players over whole squares is lumpy.
- **Paired study** — the same positions handed to both variants, the reference campaign advanced
  by the two alternately. Necessary: across independent campaigns the defence looks worth
  nothing, because a variant conceding fewer marks leaves a sparser board that scores
  differently. On shared positions it is worth half a point a round.
- **Clairvoyant defence** — illegal, and there as a ceiling. It concedes 3.34 marks and 0.67
  points against the real defence's 3.50 and 0.71, so the planner is near the best available.
- **The duel as a coin**, with the attacker's edge as a logit shift. Checked: 120 rounds played
  out through `engine.js` gave 3.53 marks and 0.725 points at twelve a side, against 3.50 and
  0.713 for the coin.

## Power is unpaired players plus won duels, and the attack needs strictly more

The first version — *attackers win when won duels plus unpaired attackers exceed half the
attackers present* — was broken, and arithmetic showed it. A defender fights one attacker, so a
lone attacker faced exactly one duel however many defenders stood there. Massing defenders past
the first bought **nothing** and half was a floor no allocation could lower. It also made an even
number of attackers never worth more than one fewer.

Counting both sides' leftovers makes the exchange symmetric: twice the defenders and one more
takes a square outright, twice the attackers denies it outright, level numbers never favour the
attack, and every extra player helps their own side monotonically.

Worth: a deliberate defence over a scattered one went from 0.09 points an attacking round at
thirty a side to 0.46, and its fall across the size range from 78% to 17%.

The cost, and it is real: **individual duels matter less.** Under the broken rule almost
everything was a coin flip and 30–50% of duels decided their square; under this one both sides
buy certainty at 2:1 and rational play does. Team decisions matter more, individual games less.

## Ten to twenty a side, and nine boards past that

Everything measuring whether the round is a contest gets worse as teams grow, with no turn
anywhere in the range: a team's share playing a duel that decided its square falls 38% → 21%
from ten a side to thirty, rounds conceding all four marks 63% → 77%, a defensive plan 0.74
points an attacking round → 0.48. The mechanism is that the board asks for four marks whatever
the headcount, so the defence's task is fixed while the attack's budget grows.

Nine boards in a 3x3 fixes it for the larger game. The attack claims 4.9 of 9, has **never once**
claimed all nine, and is short by two or more in essentially every round; a defensive plan is
worth 0.8 marks a round against 0.13 on the 2x2 — the same defence, made legible. Which boards to
attack becomes a decision, where on four the answer is always "all of them". And it scales: the
attack takes 52% of boards at twelve a side and 54% at thirty, where four boards go from claiming
everything in 65% of rounds to 76%.

It does not fix the individual duel — that still falls from ~39% at twelve a side to ~20% at
thirty on every arrangement. Nine boards makes the *team's* decisions matter more, not each
player's.

## The step is allowed, and the rule says must

Without it a defender covers one square, thirty cannot cover thirty-two, and the attack takes
89–94% of contested squares against 74% with it; participation falls from ~65% to ~47%.

**May and must measured identical** — 0.700 points against 0.701, 3.46 marks against 3.46, at
every size on shared positions. The step is a genuine choice, since an unpaired defender counts
towards holding the square they stand on, but the defence wants it nearly always. *Must* settles
at the table without an argument and costs nothing.

It is also the only decision the defence makes *after* seeing the attack; everything else it
commits blind and is then read.

## What the defence still cannot do

Stop the marks: it concedes 3.5–3.8 of four at every size under every variant, because the attack
needs one square per board out of six or seven free ones and one attacker takes an undefended
square. What it can do is make them worthless — a deliberate defence roughly halves the attack's
scoring, 1.02–1.21 points an attacking round down to 0.34–0.75, without denying a single mark.
The phase is steering, not blocking.

## The arrangement: the pinwheel does not earn its awkwardness

`board.js` was generalised to take an arrangement so this could be measured. At twelve, twenty
and thirty a side:

| arrangement | squares | shared | lines | one-round lines | a line clears | decided something |
|---|---|---|---|---|---|---|
| pinwheel | 32 + star | 4 | 68 | 4 | 49% | 28% |
| plain 2x2, 6x6 | 36 | 0 | 80 | 4 | 41% | **31%** |
| overlapping a row and column, 5x5 | 25 | 9 | 48 | 20 | 76% | 30% |
| pinwheel pulled in one step | 30 | 6 | 60 | 11 | 57% | 29% |

The thing the pinwheel looked designed for — a line built inside one round, needing three squares
claimable for three different boards — the plain square has just as many, on the diagonals either
side of the centre, where a line crosses the vertical and horizontal boundaries on different
steps. (Reasoned wrongly the other way first; see the retractions.) So the awkwardness buys four
shared corners and the star, and costs three squares, twelve lines and four points of
decisiveness. Noise floor for these runs: same-weight candidate-against-reference differs by up
to 0.07 points.

## The centre space is out, on grounds the numbers do not reach

The hole in the middle of the pinwheel — no attack aimed at it, taken only by an attacking team
declining every mark it won — is dropped, and a square field has no hole, so nothing has to be
done to remove it.

Not a measurement decision. **A round in which your team attacks and has to give up everything it
won is not a round anybody wants to play.** The numbers happened to agree it was marginal (under
a plain score the flip fired in under one round in a hundred, and a team that played for it lost:
a star premium cost 0.02 points a round at 1.5x, 0.09 at 3x, 0.41 at 5x) — but they were starting
to disagree, since under a squared score four lines cross the centre, flips rose to one round in
thirty, and pricing star threats highly turned from a half-point loss into a half-point gain.
That was the strongest case it ever made and it is still not enough.

Worth recording as a shape: a rule can be measurably good and still be wrong.

## What a scored line takes with it: one board, and the attack picks

Measured on the pinwheel and the 3x3, at twelve, twenty and thirty a side:

| what clears | board stays | attack scores | a plan is worth | share of the attack's scoring |
|---|---|---|---|---|
| every board the line touched (original) | 12–15% full | 0.72–1.24 | 0.54–0.84 | 48–65% |
| the line and everything touching it | 10–16% full | 0.77–1.13 | — | — |
| **one of those boards, attack picks** | 16–21% full | 1.05–2.99 | **0.79–1.20** | 22–58% |
| the three squares only | 27–35% full | 1.53–2.48 | 0.63–1.37 | 29–42% |

One board doubles what a defensive plan is worth, gives the attack a decision it did not have,
and leaves the board half again as full; scoring speeds up by about half, so the target rises.

**The line plus everything touching it is a no-op** — a line's neighbourhood is 13–15 squares and
the boards it replaces 10–16, so the two clear the same ground and measure the same. It would
only differ on an arrangement whose boards overlap heavily.

**The subboard-filling bonus cannot fire.** Sweeping the enemy out of a board your symbol fills
was measured under line-clearing everywhere and at the highest occupancy reached: 0.00–0.08
symbols a round. Light clearing leaves the board a third full, not full, and nine squares need
all nine. A reachable trigger — a majority of a board — would be a different rule, unmeasured.

## Squaring the round's score

n lines are worth n². It changes what a good team does more than any other variant, and it is
the only one that ever makes the attack turn down a square it won. The evidence it is strategy
rather than inflation is that it moves the price of a position: the best price for a two-in-a-row
is 0.12 under linear scoring and 0.30–0.45 under squared, collapsing again above 0.7.

At twenty a side, each rule given its own calibrated valuation:

| scoring | clearing | marks | points | board stays | 2+ line rounds | points from 3+ | claims all |
|---|---|---|---|---|---|---|---|
| linear | boards | 3.6 | 0.76 | 15% | 38% | 18% | 68% |
| squared | boards | 3.6 | 1.33 | 19% | 54% | 36% | 69% |
| linear | line | 3.8 | 1.59 | 27% | 70% | 56% | 80% |
| triangular | line | 3.5 | 3.67 | 43% | 91% | 87% | 63% |
| squared | line | 3.1 | 5.50 | 51% | 96% | 86% | 46% |

What it costs is concentration. **Triangular scoring (1, 3, 6, 10) is just as lumpy at 87%**,
which locates the lumpiness in the clearing rule rather than the curve, so the two are chosen as
a pair. Totals inflate 1.8x and 3.5x, so the target rescales with the rule.

## The settled configuration: square field, squared score, one board clears

**Board memory and strategic depth want opposite rules** — the most useful thing measured here,
and not expected. A team pricing a lone mark as groundwork, against one pricing only threats it
can finish next round, wins by:

| what clears | 2x2, twelve a side | 3x3, thirty a side | a mark survives |
|---|---|---|---|
| every board the line touched | +520% | +77% | 1.2–1.8 rounds |
| one board, attack picks | +115% | +21% | 1.7–2.7 rounds |
| the three squares only | +29% | +21% | 2.6–4.7 rounds |

Sweeping the board is what makes each round sharp — every mark earned and placed exactly — and
it is precisely what stops the campaign having a shape. "More memory" is not "more strategy".
Mark life is Little's law, arrivals × life = marks on the board; at 1.2 rounds a mark is gone
before its own team attacks again, and two is the floor for anything to carry.

At twelve a side on the 2x2:

| | scores | mark life | points from 3+ line rounds | attack short of every board | a plan is worth |
|---|---|---|---|---|---|
| every board clears, plain | 0.78 | 1.3 | 27% | 39% | 59% of the scoring |
| **one board, squared** | **2.14** | **2.2** | **35%** | **40%** | **66%** |
| line only, squared | 5.30 | 6.2 | 87% | 61% | — |

The middle row is the middle row on every measure at once. Targets: about 22 points on the 2x2
and 70 on the 3x3, both about twenty rounds.

A myopic baseline that did not work, recorded so it is not tried again: a team with no position
value scores exactly 0.00 everywhere, because with nothing to prefer it never lines anything up.
The instrument became horizon *depth* — groundwork term against threat term — instead.

## Ex ante and ex post decisiveness agree

"Decided something" was computed afterwards: would this result, flipped, have flipped the square?
Fair challenge — two attackers against two defenders who both win is a square no single result
would have changed, so afterwards none of the four decided it, which undercounts what the players
faced.

The question a player faces is the ex-ante one, computed exactly as
`C(pairs-1, need-1) p^(need-1) q^(pairs-need)`. **The two agree everywhere** — 58.1% against
57.7%, 45.4% against 45.2%, 32.7% against 32.2%. They have to: the chance a duel is decisive *is*
the chance it turns out to have been decisive, and the ex-ante sum is the lower-variance
estimator of the same quantity. What needed fixing was the phrasing, not the number. On a square
with level numbers that chance runs between a third and a half — one against one certain, two
against two a half each, six against six 31%.

## Hands, and the occasion for a swap

`hands.js` plays all 252 hands of five against a sample of each other and fits a Bradley-Terry
strength, so a duel is `sigmoid(mine − theirs)`. The hands span 3.50: best beats worst 97%, best
beats median 75%, and **one chosen swap is worth 0.69**. The scalar reduction is checked, not
trusted: in a dense round robin the fit calls the winner right 82.4% of the time, is off by 9.1
points on a pairing's win rate, and **9.1% of triples are cyclic** — a known ninth of the space
it cannot see, which is what Stinky-answering-Magnet would predict.

The occasion went through three positions. *After winning a duel* was taken first, on structural
grounds, before the board had vetoes and before teams played roles. *After playing one, win or
lose* replaced it. **On a square you won** is the settled answer. Measured on the settled board
with roles in play, twelve a side:

| occasion | offers a round | change a hand | useful a round | spread | distinct hands | early-luck r | worst at 24 |
|---|---|---|---|---|---|---|---|
| after winning a duel | 5.8 | 65% | 3.8 | **0.58** | 85% | 0.24 | **−0.19** |
| after losing one | 5.7 | 67% | 3.8 | 0.39 | 84% | 0.03 | 0.51 |
| after playing one | 11.3 | 54% | 6.2 | 0.35 | 75% | −0.05 | 0.78 |
| **on a square you won** | 11.8 | 53% | **6.3** | 0.31 | 73% | **−0.01** | **0.74** |
| by standing out | 4.0 | 50% | 2.0 | 0.23 | 90% | — | — |

Four things decided it.

- **A swap can be wasted.** With roles in play a player already holding the best hand for their
  veto gains nothing, so a third to a half of all offers change nothing. Offers × landings is the
  figure to compare, not the raw count.
- **Rewarding the loser can be farmed.** A stone is worth 0.69 and the square you threw costs
  your team, not you. Nothing in the simulation defects, so this is reasoning, but it is decisive
  between *after losing* and *after playing one*.
- **Rewarding duel winners strands somebody.** The unluckiest player a side finishes at −0.19,
  below where an average random hand starts, and early luck predicts the finish (r = 0.24).
- **Fighting is not the player's choice.** Whether you are engaged depends on the other team's
  allocation, and the rules already count standing on a square without fighting as a
  contribution — an unpaired attacker's presence is part of how the square is taken. *After
  playing a duel* gives nothing to the player who walked alone onto an empty square, which is the
  most efficient thing anybody did that round.

What it costs is the hierarchy: spread settles at 0.31 rather than 0.58, so no star duellists
emerge. *After winning* remains the pick if a hierarchy of champions is wanted.

Two findings that hold whichever occasion is chosen. **Chosen, not rolled** — random replacement
leaves the field's mean at −0.15 against a −0.01 start after twenty-four rounds, a walk rather
than a ladder. And **standing out is a trap**: the rate has a real optimum near a fifth of the
team, but a team that declines it entirely is beaten four to one (1.05 against 4.33), so it is a
compulsory opening move with a decision attached, and it drops participation from 59% to 48%
every round.

Method: hands make players non-interchangeable, so each captain deals their players out in
strength order against their own ranking of the squares, the defence pairs off on a square the
way that wins it most games, and both sides plan against the duel odds they expect. The standout
control ran at 2.27 against 2.24, the noise floor for those lengths.

## Stone vetoes: adopted for the coordination

Every square switches off one stone type. `hands.js --vetoes` fits a strength table per veto —
seven ladders — and `board.js` steps the pattern one across and three down, which spreads them
evenly on both fields with no veto repeated in a line of three.

**The ladders are nearly different games.** Every veto has a different best hand (four 2048s and
a Stinky under Shift's; four Shifts and a Magnet under 2048's; three Rotates and two 2048s under
the Mountain's). Across the twenty-one pairs the columns correlate **0.489** on average, one pair
at **−0.05**. A hand swings **1.92** between its best and worst veto against **0.69** for a whole
stone — where a player stands is worth about three stones.

**Coordination is worth +0.94 ± 0.05 points an attacking round** on a scoring rate of about 2.4,
holding at thirty a side: sending each player to the square whose veto suits their hand, against
sending the best hands where the most is at stake. The largest single effect measured anywhere in
this project. The noise floor was established first, because a 1200-round symmetric control came
in at 0.49 and looked like a bug; at that length the per-seed spread is ±0.22, and at 3000 rounds
the control is 0.038 ± 0.137.

**They do not stop hands converging, and the first reason given for that was wrong.** The claim
was that a swapping player cannot know where they will be sent — but a team can decide that in
advance, and the `cover` swap policy the claim rested on was a poor model of coordination. Rebuilt
with roles: every player given a veto, quotas from `demand` (a decaying count of which vetoes the
duels are actually fought on), swaps spent on their own veto, and the assignment sending a
role-holder ahead of a stronger player without the role. **The conclusion held** — specialists
lose by 0.89 ± 0.05 points a round at twelve a side and 2.6 at thirty, about 37% of the scoring
rate, with a roles-against-roles control at +0.03 ± 0.08.

The real reason is the stone pool. The best all-rounder, `shi shi 204 204 sti`, ranks between 8th
and 33rd of 252 under every veto and is *the best hand there is* under the Magnet veto.
Specialising buys at most 0.50 on your own square and costs 0.64 elsewhere, so a specialist needs
to stand on their own veto 0.64/1.14 ≈ **56%** of the time to break even — and coordination
delivers 45% at twelve a side, 52% at thirty, because the attack picks the contested squares for
the lines they make. **Veto-by-board**, the variant the mechanism predicts should help, does:
57% hit rate, gap narrowed from 2.6 to 1.9 at thirty a side. It does not close it.

So if varied hands are wanted, the thing to change is the pool — no hand able to sit in the top
fifteen under every veto — or the reward, so it cannot inflate the whole field: trading stones
with a teammate is zero-sum inside a team and has no best hand to converge on. Neither measured.

One correction to the convergence figures: they were measured with swaps aimed at being good on
average, and under that aim the field does collapse (86% of a team on one hand by round sixty).
With swaps aimed at the veto a player has been *told* to specialise in, the field holds 75–85%
distinct hands for a whole campaign, because there are seven attractors rather than one.

Worth recording as a pattern: the objection was right, the model deserved rebuilding, and the
answer did not move. A conclusion that survives a better test is worth more than one never tested.

## The opening position, and the first attacker's handicap

An empty board makes a dull opening: every square is worth the same. Measured as how far the best
free square stands above the median — the size of the choice in front of a captain — on the 6x6:

| seeded each side | round 1 | 2 | 3 | 4 | first point at round |
|---|---|---|---|---|---|
| none | 0.30 | 0.60 | 1.14 | 1.92 | 3.6 |
| 2 | 0.71 | 0.93 | 1.26 | 2.18 | 3.1 |
| **4** | **0.96** | 1.31 | 1.33 | 1.97 | **2.7** |
| 6 | 1.15 | 1.77 | 1.28 | 1.71 | 2.0 |
| 8 | 1.45 | 1.83 | 1.23 | 1.63 | 1.6 |

Four pairs put round one where round three of an empty board sits and bring the first point
forward by a round, while leaving the position still building; six or eight front-load it and
then the curve sags. The 9x9 wants the same fifth: nine pairs take its opening from 0.15 to 1.27.
Rotational pairs make the two openings identical by construction, and pairs completing a line are
rejected as drawn.

**There is a first-attacker advantage**, in points per attacking round:

| setting | gap |
|---|---|
| no seeding, level duel | +0.45 |
| seeded four pairs, no handicap | **+0.64** |
| gives back one | +0.41 |
| **gives back two** | **+0.10 ± 0.14** |
| no handicap, attacker at 72% | +0.57 |
| gives back two, attacker at 72% | +0.15 |
| gives back three, attacker at 72% | +0.09 |

So it is worth about a quarter of the scoring rate, seeding **amplifies** it rather than causing
it — there is now a position to exploit and the first attacker gets first use — and two marks back
levels it within noise at every edge tried. Three is indistinguishable from two.

This does not contradict the earlier entry finding the seats level to within 0.02: that was true
of an empty board, a plain score and every board clearing. Squared scoring rewards holding a
position, which is exactly what tempo buys.

## The Counterattack is a pacing dial, and should be kept weak

Once the campaign's attacker is the duel's first player, the duel's first-mover advantage becomes
a standing attacker advantage — **not** a fairness problem, since the teams attack in alternate
rounds, so the thing the Counterattack was invented for has gone away.

| attacker's chance | Counterattack | attack takes | your game decides its square | points a round |
|---|---|---|---|---|
| 50% | one that levels the seat | 84% | 51% | 2.46 |
| **57%** | **Mirror or Relocate** | **87%** | **50%** | **2.76** |
| 65% | a weak one | 89% | 48% | 2.92 |
| 72% | none | 92% | 45% | 2.94 |

No Counterattack at all runs the campaign 20% faster, but the pace is bought from the defence —
the phase the power rule was changed to make matter. At 72% the defence holds one contested
square in twelve; at 50%, one in six. Keep it weak: 57% takes 12% of the pace for almost nothing.
The figure to tune against is how many contested squares the defence still holds, not whether the
duel is even.

## Upgrade points: a square pays one, and both purchases cost two

A square won pays **one point** to each of your players standing on it — the same list the stone
swap already uses. **A stone swap costs 2. A Counterattack, drawn at random and single use,
costs 2.**

The prices were first derived from three measured inputs and then played out, because a
derivation cannot see what players do with a purse.

**The inputs.** A player earns **0.50 points a round**, twelve over a twenty-four round campaign,
and fights about fifteen duels. The swap ladder, climbing towards the best hand for a player's
veto, is **1.02, 0.36, 0.16, 0.05, 0.01** — three swaps take a player 96% of the way, which is
why "happy with my hand" arrives so early. (Much steeper than the 0.69 quoted earlier, which
averaged over all hands; this is the marginal step from where a player actually stands.) The
cards are worth **Overtake 1.23, Relocate 0.80, Mirror 0.67, Mind Control 0.34, Rehearse 0.03**,
mean **0.62** — as logit shifts in the attacker's edge, which is how they enter a duel.

**The simulation.** Points earned on won squares, spent between rounds; a card subtracts its
worth from the attacker's edge for one defending duel and is discarded; players hold any number
and use the best they have. Two shoppers, because which one a live game gets is not obvious:
*save* works out which purchase is worth most per point and waits for it, *impulse* buys whatever
it can afford now. Base attacker edge 72%, twelve a side, twenty-four rounds, 720 rounds per
cell from three seeds.

Per player over one campaign, saving buyers:

| swap$ | card$ | swaps | reach 3 | never swap | bank left | cards bought | 1st card at | after n swaps | card in defending duels, 1st half → 2nd | attack takes, 1st → 2nd |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 2.63 | 54% | 0.6% | 3.22 | 6.01 | r5.8 | 2.50 | 47% → 97% | 87.7% → 84.5% |
| 1 | 2 | 2.56 | 52% | 0.8% | 1.13 | 4.10 | r7.8 | 2.49 | 26% → 75% | 88.6% → 85.5% |
| **2** | **2** | **2.36** | **45%** | **0.8%** | **0.84** | **3.18** | **r11.8** | **2.24** | **11% → 65%** | **90.3% → 87.5%** |
| 2 | 1 | 2.43 | 48% | 1.0% | 1.75 | 5.26 | r8.6 | 1.86 | 31% → 90% | 88.9% → 85.5% |
| 2 | 3 | 2.45 | 49% | 1.3% | 1.10 | 1.98 | r14.3 | 2.39 | 5% → 42% | 91.8% → 88.4% |
| 2 | 8 | 2.47 | 48% | 1.3% | 3.66 | 0.42 | r19.8 | 1.65 | 0% → 8% | 91.4% → 90.4% |
| 3 | 2 | 1.84 | 20% | 2.9% | 0.80 | 2.80 | r13.6 | 1.77 | 9% → 56% | 91.4% → 87.6% |
| 3 | 3 | 2.01 | 28% | 1.5% | 1.04 | 1.63 | r15.8 | 1.87 | 3% → 34% | 91.9% → 89.2% |
| 4 | 2 | 1.41 | 1% | 5.0% | 0.98 | 2.67 | r14.4 | 1.37 | 7% → 54% | 91.4% → 88.3% |
| 4 | 4 | 1.68 | 6% | 1.9% | 1.44 | 0.94 | r18.0 | 1.47 | 1% → 19% | 91.2% → 89.8% |

Four things set the price, and they all point at two.

**A swap must cost at most 2, because the ladder is three swaps and the purse is twelve.** At 3 a
player reaches three swaps 20% of the time and 2.9% never swap at all; at 4, 1% and 5.0%. The
mechanic is meant to finish, and above 2 it does not.

**A card must not cost less than a swap.** Priced below, it becomes what a player buys with their
first two points, and the hand ladder starves. This only shows with impulse buyers, and it is
severe — at swap 2 / card 1 they take **1.69 swaps, 18% reaching three, 7.8% never swapping, and
their first card in round 0.8 after 0.00 swaps**, against 2.43 / 48% / 1.0% / round 8.6 for
savers. At **equal prices the two shoppers are indistinguishable** (2.36 against 2.37 swaps,
first card round 11.8 against 11.8), so the design does not depend on how far ahead the players
plan. That is worth more than any few points of tuning.

**Two minimises stranded points.** Unspent at the end: 0.84 at 2/2, against 1.75 at 2/1, 1.53 at
2/4 and 3.66 when cards are priced out. A reward nobody can spend is not a reward.

**The ordering falls out; it is not imposed.** At 2/2 a player buys their first card in **round
11.8, holding 2.24 swaps** — the hand first, then the cards, which is exactly the sequence the
mechanic was designed for and nothing in the rules says it. It is the two value curves: a swap
applies to every duel a player has left (fifteen at the start, seven at halfway), a card to one,
so early swaps beat cards and late cards beat a fourth swap worth 0.05.

**The economy is its own brake on the attacker's edge**, and the size of it is now measured
rather than guessed. Cards appear in 11% of defending duels in the first half of a campaign and
65% in the second, and the attack's share of contested squares falls **90.3% → 87.5%** between
the halves. Against a card-free control (card priced at 8) the fall is 91.4% → 90.4%, so about
2pp of the 2.8 is the cards. The campaign opens fast and tightens as the players arm themselves,
and it ends near the 87% the pacing entry above said to aim for while spending the opening
rounds nearer 90%.

**It transfers.** Thirty a side on nine boards at 1/2/2: earn 0.50, 2.32 swaps, 45% reaching
three, 0.8% never, first card round 11.5 after 2.21 swaps, density 12% → 63%. Same prices, no
rescaling. Campaign length is the one thing that moves it — sixteen rounds gives 1.93 swaps and
24% reaching three, thirty-two gives 2.57 and 52% — so a much shorter campaign would want a
cheaper swap.

Two constraints on changing the prices. **A Counterattack only works for the defender**, since
the campaign's attacker opens the duel, so a card is bought for half a player's duels; the
simulation prices it that way. And **the draw must stay random** — Overtake is worth forty times
Rehearse, so a chooser would always take 1.23 and the honest price would be nearer four.

What is still not modelled: a player holding a card back for a duel that matters (here they spend
whenever they hold one, and unspent cards at the end are wasted), teams pooling or directing
purchases, and any purchase other than these two.

## Re-measured on the finished rules: what the attack takes, and whether hoarding pays

Everything above was measured as each rule was decided. With all of them in place — seeded
board, attacker opening the duel at 72%, vetoes, roles, the economy — three of the numbers move,
and one conclusion reverses.

### "The attack takes 88% of contested squares" counts the walkovers

`contested` is every square the attack sent anyone to, and the attack places second knowing
everything, so most of those squares have nobody on them: twelve defenders cannot cover
thirty-six squares. Split at twelve a side, settled rules:

| | squares a round | attack takes |
|---|---|---|
| every square the attack goes to | 8.8 | 88.5% |
| of those, ones somebody defended | 3.9 | **82.1%** |
| of those, ones with level numbers | 2.9 | 79.0% |

At an even duel (edge 0.5) the same three are 82.1%, 69.2% and 62.1%. So the headline figure is
mostly the attack choosing where to fight — it brings 1.18 attackers per defender where it
commits, and simply does not go where it would lose. Quote the middle row when the question is
"can the defence hold a square"; the top row only answers "does the attack pick well".

### The defence's job is shaping, and it is worth about half the scoring

Paired study, deliberate defence against a random one on the same positions, settled rules,
twelve a side:

| | marks conceded | points conceded | value conceded | its own players in a duel |
|---|---|---|---|---|
| deliberate | 3.71 | **2.40** | 3.68 | 68% |
| random | 3.89 | 4.52 | 5.95 | 43% |

**It denies 0.19 of a mark and 2.13 points a round** — 47% of the attack's scoring. That is the
same finding as the early entry, at the higher scoring rate the finished rules run at, and it is
the answer to the take rate above: the defence is not trying to hold squares, it is choosing
which squares the attack is allowed to want. It also gets 68% of its own players into a duel
against 43%, because clustering plus the step is what creates pairings at all.

### Multi-line rounds are the norm, and hoarding for them is not a plan

Rounds by lines scored, twelve a side on the 6x6:

| lines in a round | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| share of rounds, squared | 20% | 31% | 36% | 11% | 1.7% | 0.3% |
| share of all points | — | 10% | 47% | 32% | 9% | 2% |
| share of rounds, linear | 19% | 41% | 28% | 9% | 1.9% | 0.5% |

**90% of all points arrive in rounds taking two lines or more**, and 61% of scoring rounds are
multiples against 49% under a linear score — so squaring does change behaviour by about twelve
points, and the big rounds are where a campaign is decided.

But **deliberately holding back to build them now loses.** Candidate valuations against the
0.03/0.12 reference, seats swapped on identical seeds so the board cancels (the control is
exactly 0.000, the runs being deterministic), six seeds of 480 rounds:

| a two-in-a-row priced at | 6x6, twelve a side | 9x9, thirty a side |
|---|---|---|
| 0.06 | −0.207 ± 0.057 | −1.519 ± 0.409 |
| **0.12** | **0.000** | **0.000** |
| 0.20 | −0.187 ± 0.100 | **+1.166 ± 0.436** |
| 0.28 | +0.058 ± 0.087 | +0.682 ± 0.348 |
| 0.35 | −0.221 ± 0.064 | +0.292 ± 0.370 |

**The two fields want opposite things, which was not expected.** On the 6x6 a patient team
(0.05/0.35) loses 0.13 ± 0.05 to a greedy one and a hoarding team (0.08/0.60) loses 0.21 ± 0.09;
the price band is 0.12–0.28, flat inside it and falling off either side. On the 9x9 the curve is
single-peaked around 0.20 and steep: **+1.17 there, −1.52 at 0.06**, so on nine boards playing
for position is worth about 9% of the scoring rate and refusing to is worth −11%.

On the small field **this reverses the earlier entry**, which found 0.30–0.45 optimal under a
squared score. That was measured on an empty board with a level duel; the rules added since put
structure on the board from round one and land 3.8 marks a round into it, so on 36 squares the
doubles arrive without being planned for and paying for them twice is what loses. Nine boards
have 81 squares and nine marks a round to spend, so there is room to build something the next
round can still use, and holding pays there.

So on the small field squaring is doing its work as a **scoring** rule and not as an
**incentive** one: it decides which rounds matter, but the hold-versus-cash arc it bought on an
empty board is gone. Whether that is worth restoring on the 6x6 — by seeding less, or by
clearing more — is untested.

### The targets were stale

Rounds to reach a target, 120 campaigns each, settled rules:

| field | 22 | 30 | 40 | 50 |
|---|---|---|---|---|
| 6x6, twelve a side | 11.8 | 16.0 | **22.3** | 27.6 |

| field | 70 | 100 | 140 | 180 |
|---|---|---|---|---|
| 9x9, thirty a side | 7.8 | 12.4 | 18.0 | **23.9** |

The old 22 and 70 were set before seeding, the attacker's edge and the hands, and now give
twelve-round and eight-round campaigns. **40 and 170** are the figures for about twenty-two
rounds, which is what the economy is priced against.

The 9x9 is much lumpier than the 6x6 and worth knowing before choosing it: 95% of its scoring
rounds take two lines or more and 73% of all its points come from rounds taking four or five,
because nine boards place nine marks a round.

## Which side commits first: the defence, still

The complaint the question came from: the attack knows it needs one square per board, so
it concentrates on wins it can count, while the defence commits blind and spreads. Both halves
were measured, and then the order was reversed and measured too. `--order attack` puts the
attack in first as a leader that must expect to be answered, and the defence in second as a
pure best response.

### How blind the defence actually is

Of the squares the attack goes to, and where the defenders end up, twelve a side:

| | undefended | fewer than the attack | matched | more, short of a shutout | shut out | defenders meeting nobody |
|---|---|---|---|---|---|---|
| defence first (as written) | 37% | 16% | **46%** | 1% | 0% | 46% |
| attack first | 26% | 4% | 32% | 7% | **31%** | 1% |

So the complaint is about half right. The defence never once buys a shutout and 46% of its
players stand where nobody comes — but it **matches on 46% of the squares the attack picks**,
which is not luck: it clusters on the dangerous middle, and the attack has to come there. It
cannot pick the squares, but it can price the neighbourhood.

The rule that rescues it is the step, and this is the clearest measurement of why it is in the
rules. Defence first, with the step against without: players getting a duel 68% against 51%,
and a team's share whose duel decided its square 30% against 17%. Half the defence standing
where nobody came is not waste — stepping converts it into pairings.

### Reversing the order

| | points a round | marks of 4 | attack takes | of defended | plays a duel | duel decided its square |
|---|---|---|---|---|---|---|
| **defence first** | **2.92** | **3.69** | 90% | 83% | 68% | **30%** |
| attack first | 2.08 | 2.27 | 55% | 39% | 70% | 26% |
| attack first, may step | 1.39 | 1.86 | 45% | — | 57% | **6%** |
| attack first, no step | 1.16 | 1.75 | 43% | — | 58% | 6% |

And what a defensive plan is worth, paired against a random defence on shared positions:

| | marks denied | points denied |
|---|---|---|
| defence first | 0.20 | 2.43 |
| attack first | **1.30** | **4.44** |

**No, the defence would not simply match.** With the attack in front of it, it matches a third,
**shuts out a third** and abandons a quarter. Matching is the least attractive of the three: at
the settled 72% opener a matched square is worse than a coin flip for the defender, while twice
the attackers denies it outright, so an informed defence buys denials where it can afford them
and writes off the rest. That is a better decision than matching, and it is the strongest thing
to be said for the reversal — the defence stops steering and starts blocking, and its plan is
worth 4.44 points a round against 2.43.

### Why it is still not worth doing

**It is a pace lever, not a fairness one.** The teams attack in alternate rounds, so neither
gains; what changes is that the campaign runs 29% slower and 1.4 marks a round lighter.

**It moves the decision out of the duels.** A shutout is settled before anybody plays. With
mandatory stepping the damage is contained — 26% against 30% — and only because the forced step
drags the defence's spare players off their shutouts. Let the defence decline the step, which is
exactly what an informed defence wants, and the share of a team whose duel decided anything
falls to **6%**. The reversal quietly guts the thing the rest of this document spent its effort
protecting.

**It inverts what the step is for.** Under the present order the mandatory step helps the
defence; under the reversed one it hurts it, and the defence would want it optional. Two rules
that currently agree would have to be rewritten together.

**It puts the hard problem on the wrong side.** Moving first means planning against your own
answer. An attack that ignores what the defence will do scores **1.04** against the 2.08 of one
that anticipates it — so half the attack's scoring would ride on the attacking captain solving a
two-ply problem under time pressure, with twelve to thirty people waiting. Under the present
order the attack's job is a best response, which is the easy side of the problem, and the
defence's harder job is one it can prepare between rounds.

So: keep the defence first. The concentration asymmetry is real and it is the point — the attack
buys certainty at 2:1 and the defence answers by making the certain squares worthless, which the
paired study says is worth 2.43 points a round.

Untested, and the obvious things to try if the defence should be able to deny rather than steer:
giving ties to the attack, which would make matching useless and force the defence to double or
abandon; and simultaneous deployment behind a screen, which removes the asymmetry entirely but
needs mixed strategies to be interesting and is awkward to run at a table.

## Model bugs and retractions

Recorded rather than quietly fixed. The third bit three times.

- **A position priced too high makes the attack decline points.** A two-in-a-row hand-set at 0.45
  loses to the same player at 0.12 by six to one. Prices are now found by playing candidates
  against each other; the surface is flat between 0.02–0.03 and 0.08–0.12. That bad price also
  produced a spurious rules finding — an apparent 15% penalty for attacking first — withdrawn:
  with the price corrected the seats were level to within 0.02.
- **A corner may be claimed for either of its boards**, which is how a line is built in one round.
  The first version pre-assigned each corner and quietly made a whole class of play impossible.
  Fixing it roughly doubled the scoring rate.
- **An uncalibrated comparison hides the effect being looked for.** A mistuned attack cannot
  exploit a rule that rewards patience, so the first pass at squared scoring showed it doing
  nothing.
- **Every defensive shape the search offered ranked squares by danger**, and the dangerous squares
  are all in the middle, so every candidate clustered there and the step was undersold. A greedy
  set-cover shape was added to the candidate list.
- **Retracted: the occupancy figures.** The share of the board carrying a symbol was computed in
  the reporting thread, which divided by *its* board's square count — always the pinwheel's 32.
  So "the plain square runs at 2% full and is close to memoryless" and "the overlapping
  arrangement is the only one that holds a position" were artefacts; every arrangement holds
  12–15%. What survives is that the board holds about one round of play, which is a fact about
  the clearing rule. Anything a worker computes a share of now carries its own denominator.
- **Retracted: a straight line of three cannot cross three quadrants.** It can, if it crosses the
  two boundaries on different steps. The layout comparison is computed, not argued.
- **A completed line had no price.** `posValue` looked up `POS[3]` with three weights, so a
  standing line read `undefined` and everything downstream became NaN; the defence planner
  compares with `v < best` from `Infinity`, and `NaN < Infinity` is false, so it silently returned
  `null`. Unreachable until seeding could hand a side a standing line. Fixed with a price and a
  rejection test, plus a test for each. The kind of bug an invariant hides: a new rule made a
  state reachable that the old code was entitled to assume away.
- **When adding options measures worse, suspect the search.** Inherited from the duel work and it
  held here too: any monotonicity violation is treated as a bug report against the measurement.

## Open

- The stone pool contains a hand that is good under every veto, which is what defeats
  specialisation. Changing the pool is unmeasured.
- Trading stones between teammates — zero-sum inside a team, so no field-wide inflation — is the
  obvious answer to hand convergence and is unmeasured.
- A subboard-fill bonus with a reachable trigger (a majority of a board) is unmeasured.
- The centre space could be put back as a nominated square belonging to no board, if the
  unblockable line is wanted after all.
