# 2026-08-11 — the campaign: how a square is taken, team size, and the defender's step

Three questions in the campaign layer: how a contested square is decided, how many players a
team should have, and whether a defender with nobody to fight may step to an adjacent square.
`campaign.js` was written to answer them and `board.js` to hold the geometry.

## Instruments

- **Arithmetic** — the chance an attack takes a square is a closed form in the two forces and
  the duel odds. It settled the first question outright and no simulation was needed for it.
- **Sweep** — the campaign played for many rounds at each team size, each size run from three
  seeds and summed, because allocating whole players over whole squares is lumpy and one run of
  one size can land on a shape its neighbours do not share.
- **Paired study** — the same positions handed to both variants, several resolutions each, with
  the reference campaign advanced by the two alternately. Needed because a change that concedes
  fewer marks also leaves a sparser board, and a sparser board scores at a different rate for
  reasons that have nothing to do with the change. Across independent campaigns the defence
  looks worth nothing; on shared positions it is worth half a point a round. The paired number
  is the true one.
- **Clairvoyant defence** — one that has already seen the attack and that the attack is not
  re-planned against. Illegal, and there as a ceiling. It concedes 3.34 marks and 0.67 points
  against the real defence's 3.50 and 0.71, which is how we know the defence planner is close
  to the best available rather than merely better than nothing.

The duel is a coin at even odds, because both teams draw hands from the same pool and the seat
is decided at the table, so the attacker's share is a half by symmetry. Checked against the
real thing: 120 rounds with every pairing played out through `engine.js` gave 3.53 marks and
0.725 points at twelve a side, against 3.50 and 0.713 for the coin.

## Decisions

### Power is unpaired players plus won duels, and the attack needs strictly more

The first version was *attackers take the square when won duels plus unpaired attackers exceed
half the attackers present*, and it was broken in a way arithmetic showed at once. A defender
fights one attacker, so a lone attacker faced exactly one duel however many defenders stood
there and took the square by winning it. Massing defenders past the first bought **nothing**,
and matching an odd attack one for one still conceded the square half the time. Half was a
floor no allocation of any number of defenders could lower.

Counting both sides' leftovers fixes it and makes the exchange symmetric:

- twice the defenders and one more takes a square outright;
- twice the attackers denies it outright;
- level numbers never favour the attack — odd against odd is a coin flip, even against even is
  better than that for the defence;
- every extra player helps their own side, monotonically, on both sides.

It also removes an oddity of the first version that would have been noticed at the table: under
it an even number of attackers was never worth more than one fewer, so all forces came in odd
numbers and two attackers on a defended square was strictly worse than one.

What this is worth, measured: a deliberate defence over a scattered one went from 0.09 points an
attacking round at thirty a side to 0.46, and its fall across the team-size range went from 78%
to 17%. The defensive phase changed from a formality into the round's main decision.

The cost, which should be recorded because it is real: individual duels matter *less*. Under the
first rule the defence could buy nothing, so almost everything was a coin flip and 30–50% of
duels decided their square. Under this one both sides can buy certainty at two to one, rational
play buys it, and at twenty a side about 43% of duels decide anything. The trade is that team
decisions matter more and individual games matter less. Turning that back would mean making
certainty dearer than 2:1, which was not asked for.

### Ten to twenty a side

Everything that measures whether the round is a contest still gets worse as the teams grow, with
no turn anywhere in the range, but gently now. The share of a team who plays a duel that decides
its square falls 38% → 21% from ten a side to thirty; rounds conceding all four marks go 63% →
77%; a defensive plan is worth 0.74 points an attacking round at ten and 0.48 at thirty.

The mechanism is unchanged: the board asks for four marks a round whatever the team size, so the
defence's task is fixed while the attack's budget grows. Twelve is the sharpest game and twenty
is still a good one. Thirty a side wants about ten boards to contest, not four.

### The step is allowed, and the rule says must

A defender left unpaired steps to an orthogonally adjacent square where the attackers outnumber
the defenders, and may stand idle only when no unpaired attacker is within reach.

Without it a defender covers one square, thirty defenders cannot cover thirty-two, and the
attack takes 89–94% of the squares it contests against 74% with it. The share of a team whose
game decided anything falls by half or more, and participation from about 65% to about 47%.

**May and must were measured against each other and came out identical**: 0.700 points against
0.701, 3.46 marks against 3.46, at every team size on shared positions. Under this scoring the
step is a genuine choice — an unpaired defender counts towards holding the square they stand on,
so stepping away spends that to buy a duel next door — but the defence wants it nearly always.
So it is written as must, which settles at the table without an argument and costs nothing.

Worth noting for the phase order: the step is the only decision the defence makes *after* seeing
the attack. Everything else it does is committed blind and then read.

## What the defence still cannot do

Stop the marks. It concedes 3.5–3.8 of four at every size under every variant tried, because the
attack needs one square per board out of six or seven free ones and one attacker takes an
undefended square. What it can do is make them worthless: a deliberate defence roughly halves
the attack's scoring, 1.02–1.21 points an attacking round down to 0.34–0.75, without denying a
single mark. The phase is steering, not blocking.

## What the measurements caught in the model

Both worth recording, because both changed the numbers by more than any rule under test.

**A position priced too high makes the attack decline points.** The value of a two-in-a-row was
set by hand at 0.45 of a point. At that price four marks left standing are worth more than the
line they could have completed, so the attack builds instead of scoring; run against the same
player at 0.12 it lost by six points to one. Prices were then found by playing candidates against
each other, and the same search was re-run after the capture rule changed and returned the same
pair. The surface is flat between about 0.02–0.03 and 0.08–0.12, and every conclusion was
re-checked at both ends of a wide range.

That bad price also produced a spurious rules finding. It looked as though attacking first in a
campaign was a disadvantage worth 15% of the scoring rate — the first attacker having more on the
board when the second one scores and clears it. With the price corrected the two seats are level
to within 0.02 points. The seats are even; the asymmetry was bad play.

**A corner may be claimed for either of its boards, and that is how a line is built in one
round.** The first version pre-assigned each corner to one board, which quietly made a whole class
of play impossible: a line across the inner ring uses one square each of three different boards,
so the attack can complete it in a single round if it takes all three. Fixing it roughly doubled
the scoring rate.

**Every defensive shape the search offered ranked squares by danger, and the dangerous squares
are all in the middle**, so every candidate clustered there. A defence that can step wants its
neighbourhoods to tile the board instead, so a greedy set-cover shape was added to the candidate
list. Without it the step was being undersold.

## Later: the star, and whether the pinwheel earns itself

### The flip is a play, and it is not a plan

Declining every mark to flip the centre space is a real line of play and the only way a symbol
reaches d4: a line through the star cannot be blocked, because its third square is the one no
attack is ever aimed at, so once a team holds both ends the only reply is for the other team to
spend a whole round's marks flipping it themselves.

Instrumented, essentially every flip that occurs is deliberate — the attack held squares it
could have marked and declined them — and a flip round scores 1.1–1.4 points against a normal
round's 0.75.

Then it was priced, because the valuation had been treating a star line like any other. Giving
a position on one a premium made things worse at every setting tried: at 1.5x the premium costs
0.02 points an attacking round, at 3x it costs 0.09, at 5x it costs 0.41 and the flip rate goes
to 3.8% of rounds at 0.28 points each. A team that plays for the flip turns down marks it should
take. **No premium.** The flip is an opportunity, not a plan, and the rules text now says so.

### The pinwheel does not earn its awkwardness

`board.js` was generalised to take an arrangement so this could be measured rather than argued.
Four were compared, at twelve, twenty and thirty a side:

| arrangement | squares | shared | lines | one-round lines | a line clears | decided something | holds |
|---|---|---|---|---|---|---|---|
| pinwheel | 32 + star | 4 | 68 | 4 | 49% | 28% | 15% |
| plain 2x2, 6x6 | 36 | 0 | 80 | 4 | 41% | 31% | 14% |
| overlapping a row and column, 5x5 | 25 | 9 | 48 | 20 | 76% | 30% | 13% |
| pinwheel pulled in one step | 30 | 6 | 60 | 11 | 57% | 29% | 13% |

**The "holds" column was wrong when this was first written** and is corrected above; see the
retraction at the end. The conclusion it was used to support -- that the plain square is close to
memoryless and the overlapping arrangement is the only one that holds a position -- was an
artefact and is withdrawn. Every arrangement holds about the same.

The thing the pinwheel appeared to be for — a line built inside a single round, which needs
three squares claimable for three different boards — it does not uniquely provide. The plain
square has exactly as many, on the diagonals either side of the centre, where a line crosses the
vertical and horizontal boundaries on different steps. This was checked after being reasoned
wrongly the other way: a straight line of three does cross three quadrants, if it crosses the
two boundaries on different steps.

What the pinwheel does uniquely provide is the star, and the star is worth very little as the
rules stand. So the awkwardness buys the four shared corners and a slightly smaller board, and
costs three squares, twelve lines and four points of decisiveness.

The best of the four is the one nobody drew: four boards overlapping along a whole row and
column. Twenty of its forty-eight lines finish in a single round, and it is the only arrangement
that holds a position. Its numbers are, if anything, understated here — it prefers a higher price
on a two-in-a-row than the pinwheel does (0.05/0.18 beats 0.03/0.12 by 0.11 points on it), so it
was measured with a slightly mistuned attack. Same-weight candidate-against-reference runs differ
by up to 0.07 points at these sample sizes, which is the noise floor for all of the above.

### The boards do not remember much, and that is the clearing rule

The larger finding, turned up by the comparison rather than sought. A scored line clears every
board its symbols stood on: 41% to 76% of the whole board. Against three or four marks a round
that leaves between 0.7 and 8 symbols standing at any time — the plain square runs at 2% full and
is very close to memoryless.

So the campaign is nearer a run of separate rounds than a game of position. If building across
rounds is supposed to matter, the rule to change is what a scored line takes with it, not the
arrangement of the boards. Not changed here, because it was not what was asked.

## Retraction: the occupancy figures in the section above were wrong

The share of the board carrying a symbol was computed in the reporting thread, which divides by
the number of squares of *its* board — and that was always the pinwheel's 32, whatever the run
had actually used. So every non-pinwheel arrangement had its occupancy divided by the wrong
number: the 6x6's 36 squares read as 2% full instead of 14%, and the 5x5's 25 read as 32%
instead of 13%.

Two claims went with it and are withdrawn:

- **"The plain square runs at 2% full and is close to memoryless."** It runs at 14%, the same as
  the pinwheel.
- **"The overlapping arrangement is the only one that holds a position."** It holds 13%, no more
  than the others.

What survives is the finding those were dressing: every arrangement sits between 12% and 15%
full, so the board holds about one round of play, and that is a fact about the clearing rule
rather than about any arrangement. The conclusion that the pinwheel does not earn its awkwardness
also survives, on the numbers that were not broken — marks taken and duels that decided
something — where the plain 2x2 is a little ahead of it.

Anything a worker computes a share of has to carry its own denominator. The tally now records the
board's own square and board counts, and repeats are grouped without summing them.

## Nine boards, and what a scored line should take

### Nine boards in a 3x3 for twenty a side and up

On any four-board arrangement the attack takes about nine marks in ten and claims every board in
roughly two rounds in three, at every team size. The defence's work is real but invisible: it
steers marks onto squares that are not building anything.

On nine boards it claims 4.9 of 9, has never once claimed all nine across every run here, and is
short by two boards or more in essentially every round. A defensive plan is worth 0.8 marks a
round against 0.13 on the 2x2 — the same defence, the same work, made legible. Which boards to
attack becomes a decision, where on four boards the answer is always "all of them".

It also scales, which four boards do not: the attack takes 52% of the boards at twelve a side and
54% at thirty, where four boards go from claiming everything in 65% of rounds to 76% over the same
range.

What nine boards does not fix is the individual duel — the share of a team whose game decided its
square still falls from about 39% at twelve a side to about 20% at thirty on every arrangement. It
makes the team's decisions matter more, not each player's.

### One board clears, and the attack picks which

Three variants of what a scored line takes were measured against the original rule, on the
pinwheel and the 3x3, at twelve, twenty and thirty a side:

| what clears | board stays | attack scores | a plan is worth | share of the attack's scoring |
|---|---|---|---|---|
| every board the line touched (original) | 12–15% full | 0.72–1.24 | 0.54–0.84 | 48–65% |
| the line and everything touching it | 10–16% full | 0.77–1.13 | — | — |
| one of those boards, attack picks | 16–21% full | 1.05–2.99 | **0.79–1.20** | 22–58% |
| the three squares only | **27–35% full** | 1.53–2.48 | 0.63–1.37 | 29–42% |

**One board, attack's choice** is the best of the three: it doubles what a defensive plan is worth
in points a round, gives the attack a decision it did not have, and leaves the board half again as
full. Scoring speeds up by about half, so the target score has to rise with it.

**The line and everything touching it is a no-op.** A line's neighbourhood is 13–15 squares and
the boards it would otherwise clear are 10–16, so the two rules clear almost the same ground and
measure the same on every metric. It would only become a real change on an arrangement whose
boards overlap heavily enough that one board is most of the whole.

**The three squares only** is the sole rule that gives the campaign a memory — 27–35% full against
12–15% — and the one to take if building across rounds is meant to matter. It doubles or triples
the scoring rate and gives the defence its least relative influence.

### The subboard-filling bonus cannot fire

Sweeping the other team's symbols out of a board when your symbol fills it was measured under
line-clearing on every arrangement, at every team size, and at the highest occupancy any of them
reach: it sweeps between 0.00 and 0.08 symbols a round.

Light clearing does not make the board full, it makes it a third full — three or four marks go
down a round and a scored line takes three away, and the two balance near a third. A nine-square
board needs all nine of them, which does not occur. A trigger that could be reached — a majority
of a board rather than all of it — would be a different rule and was not measured.

## Squaring the round's score

Counting n lines in one round as n squared changes what a good team does more than any other
variant measured, and it is the only one that ever makes the attack turn down a square it won.

The evidence that it is a strategy change and not score inflation is that it moves the price of a
position. By the same candidate-against-candidate method used to calibrate the valuation in the
first place, the best price for a two-in-a-row is about 0.12 under linear scoring and 0.30–0.45
under squared. That inverts the earliest finding in this file: 0.45 was the hand-set value that
lost six points to one, *because* it declined points it should have taken. Under squared scoring
the same valuation wins. Above 0.7 it collapses again, so hoarding is strongly but not unboundedly
correct.

All the figures below were re-measured with each scoring rule given its own calibrated valuation.
The first pass was not, and it showed the rule doing almost nothing under the original clearing —
a mistuned attack cannot exploit a rule that rewards patience, so an uncalibrated comparison hides
exactly the effect being looked for. Same trap as the position price itself, third time.

At twenty a side, stepping on:

| scoring | clearing | marks | points | lines | board stays | 2+ line rounds | points from 3+ | claims all | flips |
|---|---|---|---|---|---|---|---|---|---|
| linear | boards | 3.6 | 0.76 | 0.76 | 15% | 38% | 18% | 68% | 0.7% |
| squared | boards | 3.6 | 1.33 | 0.66 | 19% | 54% | 36% | 69% | 0.3% |
| linear | line | 3.8 | 1.59 | 1.58 | 27% | 70% | 56% | 80% | 0.5% |
| triangular | line | 3.5 | 3.67 | 1.54 | 43% | 91% | 87% | 63% | 2.3% |
| squared | line | 3.1 | 5.50 | 1.45 | 51% | 96% | 86% | 46% | 3.0% |

Three things it buys. The attack refuses marks to hold position — 3.1 of four rather than 3.8, and
every board in 46% of rounds rather than 80%. The board fills to half, which is the answer to the
campaign not remembering anything. And the star becomes central: four lines cross it, so a flip can
take all four for sixteen points, flips go from 1 round in 200 to 1 in 30, and pricing star threats
above ordinary ones is now worth +0.50 points a round where under linear scoring it cost 0.41. The
"take the flip, do not build towards it" decision reverses under this rule.

What it costs is concentration: with light clearing 86% of all points come from rounds taking three
lines or more, so a campaign is two or three detonations and a lot of preparation. Triangular
scoring (1, 3, 6, 10) was tried as the gentler curve and is just as lumpy at 87%, which locates the
lumpiness in the clearing rule rather than the curve. So the two must be chosen as a pair:

- **squared with the original clearing** — hoarding incentive present, board half again as full,
  36% of points from the big rounds. The balanced pair.
- **squared with line-only clearing** — a full positional game, and a very swingy one.

Totals inflate 1.8x and 3.5x respectively, so the target score is rescaled with the rule.

## The settled configuration: square field, squared score, one board clears

### Board memory and strategic depth want opposite rules

The most useful thing measured in the whole campaign layer, and it was not expected. A team that
prices a lone mark as groundwork, played against one that prices only threats it can finish next
round, wins by:

| what clears | 2x2, twelve a side | 3x3, thirty a side | a mark survives |
|---|---|---|---|
| every board the line touched | +520% | +77% | 1.2–1.8 rounds |
| one board, attack picks | +115% | +21% | 1.7–2.7 rounds |
| the three squares only | +29% | +21% | 2.6–4.7 rounds |

Sweeping the board is what makes each individual round sharp — on a swept board every mark has to
be earned and placed exactly, on a crowded one threats turn up by accident — and it is also
precisely what stops the campaign having any shape across rounds. "More memory" is not "more
strategy"; the earlier note calling light clearing the fix for a memory-less campaign was right
about the memory and silent about what it costs in per-round precision.

Mark survival is by Little's law rather than by instrumenting each mark: marks arrive at `marks` a
round and the board carries `occupancy × spaces`, so the ratio is the mean life of one. At 1.2
rounds a mark is gone before its own team attacks again, which is the whole of why the original
rule felt like a run of separate rounds. Two is the floor for anything to carry.

Note the myopic baseline that did not work: a team with no position value at all scores exactly
0.00 in every configuration, because with nothing to prefer it never lines anything up. That shows
position value is necessary, not that a deep horizon pays, so the instrument became horizon *depth*
— the groundwork term against the threat term — instead.

### The recommendation

Square field, 2x2 at about twelve a side and 3x3 at about thirty; squared score; one board clears
and the attack picks which. At twelve a side on the 2x2:

| | scores | mark life | points from 3+ line rounds | attack short of every board | a plan is worth |
|---|---|---|---|---|---|
| every board clears, plain | 0.78 | 1.3 | 27% | 39% | 59% of the scoring |
| **one board, squared** | **2.14** | **2.2** | **35%** | **40%** | **66%** |
| line only, squared | 5.30 | 6.2 | 87% | 61% | — |

The middle row is the middle row on every measure at once. Squaring buys the arc — the best price
for a two-in-a-row goes 0.12 → 0.35, and the attack starts refusing squares it won to keep ground,
which nothing else here makes it do. Clearing one board keeps that from collapsing into two
enormous rounds: squaring on light clearing gives 87% of points to the biggest rounds, and one-board
clearing brings it to 35%. It is also the rule under which the defence has the most influence of
anything tried, two thirds of the attack's scoring, and the one where the attack most often falls
short of a board.

Targets rescale with the squared score: about 22 points on the 2x2 and 70 on the 3x3 both give
roughly twenty rounds.

What none of it fixes is the individual duel — about 31% of a team plays a game that decided its
square at twelve a side, 17–21% at thirty, on every setting. That is the price of the two-to-one
exchange rate: both sides can buy certainty and rational teams do.

### What choosing a square field costs

The centre space and the flip. A 6x6 or 9x9 has no hole, so there is no square no attack can be
aimed at, no unblockable line, and no round spent conceding everything to take one square. Worth
little under a plain score — under one round in a hundred — but squaring was making it real, up to
one in thirty. If it is wanted it has to be put back deliberately, as a nominated square belonging
to no board.

## The centre space is out, on grounds the numbers do not reach

The hole in the middle of the pinwheel — the square no attack could be aimed at, taken only by an
attacking team declining every mark it won for the round — is dropped, and the square field has no
hole so nothing has to be done to remove it.

Not a measurement decision. **A round in which your team attacks and has to give up everything it
won is not a round anybody wants to play.** The measurements happen to agree it was marginal — under
a plain score the flip fired in under one round in a hundred and a team that played for it lost —
but they were also starting to disagree: under a squared score four lines cross the centre, so one
flip could take all four for sixteen points, flips rose to one round in thirty, and pricing those
threats highly turned from a half-point-a-round loss into a half-point gain. That was the strongest
case the centre space ever made and it is still not enough, because the case against it is about
what the round is like to sit through rather than what it is worth.

Worth recording as the shape of the thing: a rule can be measurably good and still be wrong.

## Two ways to ask whether a player's own game mattered

The "decided something" figure quoted throughout was computed *afterwards* — would this one result,
flipped, have flipped the square? A fair challenge to it: two attackers against two defenders who
both win is a square no single result would have changed, since the attack needed both duels and got
neither, so afterwards none of those four decided it. Does that undercount?

It does, case by case. The question a player actually faces is the one asked *beforehand*: sitting
down, what is the chance my result turns this square either way? It does exactly when the other
duels on the square come to one short of what the attack needs, which for two against two is an
even chance for each of the four — not none.

So the ex-ante figure was computed exactly, as `C(pairs-1, need-1) p^(need-1) q^(pairs-need)`, and
put beside the ex-post one. **They agree to within a point everywhere** — 58.1% against 57.7%, 45.4%
against 45.2%, 32.7% against 32.2% across the team sizes.

They have to. The probability that a duel is decisive *is* the probability that it turns out to have
been decisive, so summing the first and counting the second are two estimators of one quantity; the
ex-ante sum is simply the lower-variance one. Nothing measured needs revising. What needed fixing was
the phrasing: it is "the chance your game decides its square", not "the share of games that decided
their square", and on a square with level numbers that chance runs between a third and a half — one
against one certain, two against two and three against three a half each, six against six 31%.

## Hands that change hands: after winning a duel, with the stone chosen

Four occasions for letting a player replace one stone, all handing out the same thing so that only
the recipient differs.

### First, what a swap is worth

`hands.js` plays all 252 hands of five against a sample of each other on a circuit of spaces and
fits a Bradley-Terry strength, so a duel becomes `sigmoid(mine - theirs)`. The hands span 3.50:
best beats worst 97%, best beats median 75%, and **one chosen swap is worth 0.69** — an even duel
turned into a 67% one. Large enough that the rule handing it out decides more than the board.

The scalar reduction is an assumption and is checked rather than trusted: fourteen hands in a dense
round robin, 28 games a pairing. The fit calls the winner right 82.4% of the time, is off by 9.1
points on a pairing's win rate, and **9.1% of triples are cyclic** — A beats B beats C beats A. So
the ladder is a good approximation with a known ninth of the space it cannot see, which is what
Stinky-answering-Magnet would predict.

### The four, measured over twenty-four rounds

| occasion | swaps a round | mean hand at round 2 / 8 / 24 | spread at 2 / 24 | field tops out | early lead predicts final |
|---|---|---|---|---|---|
| none (hands fixed) | 0 | −0.01 / −0.01 / −0.01 | 0.60 / 0.60 | — | r = 0.67 |
| **after winning** | 5.9 | 0.25 / 0.59 / 0.87 | **0.72 / 0.52** | past 24 | r = 0.60 |
| after losing | 5.7 | 0.27 / 0.73 / 1.05 | 0.70 / 0.18 | round 20 | r = 0.64 |
| after unpaired | 11.0 | 0.60 / 1.10 / 1.10 | 0.38 / 0.10 | **round 8** | r = 0.54 |
| by standing out | 4.0 | 0.36 / 0.90 / 1.09 | 0.33 / 0.09 | round 12–16 | — |

**After winning** is the pick. It is the only occasion that spreads a team out rather than levelling
it — 0.72 against the 0.60 of hands that never change — and the only one still moving at round
twenty-four. It gives a team a few duellists worth spending where the round will be decided.

And it does not run away, which was the reason to suspect it and the prediction that was wrong.
Both teams win about half the duels every round, so both collect about the same swaps; the
advantage lands *inside* a team, not between them, and an early lead predicts the final result
slightly *less* well than with no hand rule at all.

**After losing** is the workable second: fastest to lift the average, and it pulls a team together
(spread 0.70 → 0.18, the gap between team averages 0.18 → 0.07). It erases itself by round twenty.

**After a round unpaired is rejected.** Eleven swaps a round against four to six, because a third of
a team is unpaired in any round, so the field tops out at round eight and is frozen thereafter — the
mechanic is done before the campaign is half over. It is also the only occasion nobody chooses: the
other team's allocation decides which of your players go unrewarded.

**Standing out is the most appealing on paper and the worst in play.** The rate has a real optimum
near a fifth of the team, and the sweep around it looks like a decision — a third or two fifths
costs 0.05–0.14 points a round. But a team that declines it entirely is beaten **four to one**, 1.05
against 4.33. So it is a compulsory opening move with a trap attached, not a choice: the band where
the choice matters is worth a tenth of a point and missing the idea is worth three. It also drops
the share of players who get a game from 59% to 48%, every round.

### Two findings that hold whichever occasion is chosen

**Chosen, not rolled.** Replacing a stone at random rather than choosing flattens everything: after
twenty-four rounds of rewarding every winner the field's mean is −0.15 against a −0.01 start, the
spread has not moved off 0.61, and essentially nobody reaches a top hand. A random replacement is a
walk, not a ladder.

**A ratchet needs a stop.** Every occasion drives the field towards one hand and then stops
mattering. Drawing a space per duel does not prevent it — the strength table was fitted on that
circuit and the field converges anyway. If hands are to keep changing for a whole campaign the
reward wants to be something that cannot inflate the field; trading stones with a teammate is the
obvious shape, being zero-sum inside a team and so having no ceiling to reach. Not measured.

### Method notes

Hands make players non-interchangeable, which the round did not previously model. Each captain now
deals their players out in strength order against their own ranking of the squares, and the defence
pairs off on a square the way that wins it the most games — champion against champion or its best
against their weakest, whichever comes out higher. Both sides plan against the duel odds they can
expect, their average hand against the other's, which is most of how an advantage in hands turns
into an advantage on the board.

The standout control was run before the comparison was believed: both teams at the same rate scored
2.27 against 2.24, which is the noise floor for these run lengths.

## Stone vetoes: adopted for the coordination, and they do not do the other thing

Every square switches off one stone type for the duels on it. `hands.js --vetoes` fits a strength
table per veto — seven ladders instead of one — and `board.js` lays the seven out stepping one across
and three down, which on both the 6x6 and the 9x9 spreads them evenly and puts no repeated veto on
any line of three.

### The ladders are nearly different games

- Every veto has a different best hand: four 2048s and a Stinky under the Shift veto, four Shifts
  and a Magnet under 2048's, three Rotates and two 2048s under the Mountain's.
- Across the twenty-one pairs of vetoes the strength columns correlate **0.489** on average and one
  pair at **−0.05**. A hand being strong on one square says almost nothing about another.
- A hand swings **1.92** of strength between its best and worst veto, against **0.69** for a whole
  stone swapped. Where a player stands is worth about three stones.

### Coordination is worth +0.94 points a round

A team that sends each player to the square whose veto suits their hand, against one that sends its
best hands where the most is at stake and ignores the vetoes: **+0.94 ± 0.05** points an attacking
round on a scoring rate of about 2.4, holding at thirty a side. The largest single effect measured
anywhere in this file.

The noise floor was established first, because an earlier 1200-round run put the symmetric control
at 0.49 and that looked like a bug. It was not: at 1200 rounds the per-seed spread is about ±0.22
and 0.49 is an unlucky two sigma. At 3000 rounds the control comes in at 0.038 with a per-seed
standard deviation of 0.137, and the treatment above is four seeds at 2400 rounds each.

### Hands still converge, and diversity is punished

The hope was that position-dependent strength would stop the field walking onto one hand. It does
not. A player choosing a swap does not know where they will be sent, so the rational choice is the
best average across the vetoes — and everyone's best average is the same hand:

| round | 6 | 12 | 24 | 36 | 48 | 60 |
|---|---|---|---|---|---|---|
| distinct hands of twelve | 9.1 | 6.6 | 4.0 | 3.1 | 2.6 | 2.4 |
| share on the commonest | 27% | 48% | 72% | 79% | 84% | 86% |

Which is the course it ran with no vetoes at all. And a swap policy aimed at covering the board —
which does hold 10.7 of twelve hands distinct indefinitely — **loses by 0.95 ± 0.10 points a round**
to one aimed at individual average.

The mechanism, which is the useful part: **the attack chooses which squares are contested**, so
neither side knows which vetoes the round will turn on. A specialist is strong on one square in
seven; an all-rounder is adequate on all seven, and adequate everywhere is what pays when somebody
else picks the ground. Specialisation is fragile precisely because the board is chosen by the
opponent.

### The variant that would follow from that, untested

Give the veto to the **board** rather than the square — nine boards, one veto each. Then attacking a
board means facing a known veto, specialists become plannable, and the thing that makes them fragile
goes away. The cost would be some of the coordination the square-by-square pattern buys, since every
square in a board would then ask for the same hand. Not measured.

### Method note

Vetoes made the assignment a decision, so `assign` gained a `coordinate` setting — deal by average
strength and ignore the vetoes, or fill the squares that matter most with whoever is strongest on
that square's veto — and `swap` gained an `aim`: the best average, the best single veto, or the
largest gain to the team's coverage across the board. Having both as settings per team is what let
the two claims be separated, and they turned out to point opposite ways.

## Correction: coordination was modelled badly, and the conclusion survived being fixed

The section above concluded that vetoes do not stop hand convergence, and gave the reason as "a
player choosing a swap does not know which square they will be sent to". **That reason was wrong** —
a team can decide in advance who goes where — and the `cover` swap policy it rested on was a poor
model of coordination: it maximised a static coverage score over all seven vetoes equally, with no
stable roles and no connection to how the assignment actually worked.

Rebuilt properly. Every player is given a veto to specialise in; the quotas come from `demand`, a
decaying count of which vetoes the duels are actually being fought on, so the roster follows the
board the round is really decided on; the swaps a player earns are spent on their own veto; and the
assignment sends a role-holder to their square ahead of a stronger player without the role.

**The conclusion held.** Specialists lose by 0.89 ± 0.05 points a round at twelve a side on the 2x2
and 2.6 at thirty a side on the 3x3 — about 37% of the scoring rate either way. Control (roles
against roles) came in at +0.03 ± 0.08.

### The real reason, which is the stone pool and not the board

The best all-rounder, `shi shi 204 204 sti`, ranks between 8th and 33rd of 252 under every veto, and
under the Magnet veto it is *the best hand there is*. So specialising buys at most 0.50 of strength
on your own square and costs 0.64 on every other one, and a specialist needs to stand on their own
veto more than 0.64/1.14 ≈ **56%** of the time just to break even — before counting the rounds spent
part-way to a specialist hand, paying the cost without yet collecting the gain.

Coordination cannot deliver 56%. A role-holder is on their own veto 45% of their duels at twelve a
side and 52% at thirty, because the attack picks the contested squares for the lines they make, not
for their vetoes.

Veto-by-board was then tested, since it was the variant the mechanism predicted would help: it does,
lifting the hit rate to 57% and narrowing the gap from 2.6 to 1.9 at thirty a side, and it does not
close it.

So the blocker is that **the pool contains a hand that is good everywhere**. If varied hands are
wanted, that is what has to change — no hand able to sit in the top fifteen under every veto — or the
reward has to stop inflating the field, for which trading stones with a teammate remains the obvious
shape. Neither measured.

Worth recording as a pattern: the objection was right, the model deserved rebuilding, and the answer
did not move. Both halves of that are worth reporting — a conclusion that survives a better test is
worth more than one that was never tested, and a wrong stated reason is worth correcting even when
the conclusion stands.

## Revised: the swap comes after playing a duel, win or lose

The earlier decision was *after winning*, taken on structural grounds — slowest convergence, widest
spread — before the board had vetoes, before teams played roles, and before two things had been
measured that matter more for a live game.

Re-measured on the settled board with roles in play, twelve a side:

| occasion | offers a round | change a hand | useful a round | spread | distinct hands | early-luck r | worst player at 24 |
|---|---|---|---|---|---|---|---|
| after winning | 5.8 | 65% | 3.8 | 0.58 | 85% | 0.24 | −0.19 |
| after losing | 5.7 | 67% | 3.8 | 0.39 | 84% | 0.03 | 0.51 |
| **after playing one** | 11.3 | 54% | 6.2 | 0.35 | 75% | −0.05 | 0.78 |
| after a round unpaired | 11.2 | 52% | 5.8 | 0.32 | 74% | 0.02 | 0.77 |
| by standing out | 4.0 | 50% | 2.0 | 0.23 | — | — | — |

Three things decided it, two of them new.

**A swap can be wasted, and how often depends on the occasion.** With roles in play a player already
holding the best hand for their veto gains nothing, so between a third and a half of all swap offers
change nothing at all — 65% land after winning, 54% after playing one, 50% for standing out. The
useful figure is offers times landings, and it is what should be compared rather than the raw count.

**Rewarding the loser can be farmed.** It is the obvious way to keep the back of the field moving and
it pays a player to lose on purpose: a stone is worth 0.69 of strength and the square they threw costs
their team, not them. Nothing in the simulation defects, so this is reasoning rather than measurement
— but it is decisive between *after losing* and *after playing one*, which are otherwise close.

**Under *after winning* one player a side finishes worse than they started.** The unluckiest player on
each team ends at −0.19, below where an average random hand begins, having lost early, never earned a
swap and watched the team improve around them; and how a player's first six rounds went predicts where
they finish (r = 0.24). Under *after playing one* the worst-off finishes at +0.78 and early luck
predicts nothing (r = −0.05). For twelve to thirty real people spending an evening on this, a
mechanic that quietly strands its unluckiest participant is worse than one that flattens the team.

*After playing one* also has the property no other occasion has: **the swap is handed over when the
pairing is made, before the result is known**, so there is nothing to adjudicate.

What it costs is the hierarchy. Spread settles at 0.35 rather than 0.58, so no star duellists emerge.
*After winning* stays the pick if that is wanted, at the price above.

### And a correction to the section before this one

The convergence figures there were measured with swaps aimed at being good on average, and under that
aim the field does collapse onto one hand — 86% of a team on the same five stones by round sixty. With
swaps aimed at the veto a player has been *told* to specialise in, the field holds **75–85% distinct
hands for a whole campaign**, because there are seven attractor hands rather than one. So the vetoes
do keep hands apart, on the condition that the team says who goes where — which in a live game is the
likely behaviour anyway, since finding the single best all-rounder is exactly the kind of optimisation
a room full of people will not do.
