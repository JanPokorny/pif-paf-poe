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
| pinwheel | 32 + star | 4 | 68 | 4 | 49% | 27% | 15% |
| plain 2x2, 6x6 | 36 | 0 | 80 | 4 | 41% | 31% | 2% |
| overlapping a row and column, 5x5 | 25 | 9 | 48 | 20 | 76% | 31% | 32% |
| pinwheel pulled in one step | 30 | 6 | 60 | 11 | 57% | 29% | 18% |

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
