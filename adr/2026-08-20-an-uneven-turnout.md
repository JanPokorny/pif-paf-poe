# 2026-08-20 — an uneven turnout

Twenty to sixty people turn up and are split into two teams. Sometimes the split does not come
out even. This record measures what a missing player is worth, tries every currency the game
already has for paying it back, and settles what the rules should say: **field the same number,
the fuller team sitting the difference out a player a round; or, one player short and only one,
hand the short team four extra opening marks on the 6x6 and two on the 9x9.**

`campaign.js` grew the asymmetry it needed: `teamSize` is now read per team rather than off
one `--sizes`, so a round is planned, paired and resolved with the real numbers on both sides,
and the levers are `--short` (how many players team X is missing) with `--short-handicap`,
`--short-marks`, `--short-xp`, `--head-start` and `--bench` for the answers. Team X is always
the short one and the opening seat still alternates, so the first attacker's advantage cancels
out of every figure below rather than being tangled up in it.

Two instruments, both from the earlier records. The **sweep** — fixed rounds, three seeds
summed, campaigns of 24 rounds — measures points per attacking round, which is the unit the
first attacker's handicap was set in. **Campaigns played to a finish** measure the thing that
actually decides an evening: how often the short team wins the race to the target. The hand
table is the 40-opponent, 120-iteration per-veto fit; every number here is from that table.

## A missing body is the most expensive thing that can happen to a team

Points an attacking round, 3600 rounds a cell on the 6x6 at twelve a side and 2400 on the 9x9
at thirty:

| team X short by | 6x6: X | O | gap | 9x9: X | O | gap |
|---|---|---|---|---|---|---|
| **nobody** | 2.90 | 2.84 | −0.06 | 12.29 | 11.76 | −0.53 |
| **one** | 2.42 | 3.43 | **+1.00** | 11.65 | 11.93 | **+0.27** |
| two | 2.00 | 4.19 | +2.19 | 11.23 | 12.39 | +1.16 |
| three | 1.58 | 5.12 | +3.53 | 10.92 | 12.57 | +1.65 |

The level rows are the noise floor and the gaps have to be read net of them: **one player short
of twelve costs 1.07 points an attacking round out of 2.87, which is 37% of what a team scores**,
and one short of thirty costs 0.80 of 12.0, or 7%. The 9x9 figure is the shakier of the two: the
same shortfall measured over races rather than fixed rounds comes out at 0.14 rather than 0.80,
both being small against a scoring rate of twelve, and the rule is set from the races. For
scale, the whole first-attacker advantage
this game already hands a handicap to was +0.64 before its two marks, so on the 6x6 a single
missing body is worth more than half again as much as attacking first.

It costs about as much in the rounds the short team defends as in the rounds it attacks — at
twelve a side, −0.48 off its own scoring and +0.59 onto the other team's — so there is no phase
to hide the shortfall in.

**Why a body matters at all.** A space falls to the attack when its power is *strictly* higher,
and power counts unpaired players as well as won duels, so the body at the margin is what decides
the marginal space. Nothing about it is free to either side and nothing about it is wasted, which
is what the power rule was chosen for; the price of that is that a team with one fewer of them is
short exactly where spaces are decided.

**Why the 6x6 feels it and the 9x9 does not** is only partly settled. Two things point the right
way. A space is a larger share of what a round yields there — four zones mark 3.66 spaces between
them against nine zones marking 5.4 — and squared scoring is relatively steeper the fewer lines a
round makes, since n² grows by 2n and a 6x6 round is making one or two lines where a 9x9 round is
making three or four. Together they are worth a factor of two or three, and the measurement says
five, so something else is in there too.

## What it does to the race

400 campaigns played to a finish, the short team's share of wins:

| short by | 6x6, 12 a side, to 40 | rounds | 9x9, 30 a side, to 170 | rounds |
|---|---|---|---|---|
| **nobody** | 47.3% | 22.7 | 50.5% | 24.2 |
| **one** | **29.3%** | 22.8 | **49.0%** | 24.7 |
| two | 7.8% | 20.4 | 43.5% | 24.5 |
| three | 3.5% | 17.7 | 38.5% | 24.7 |

The level rows are 47.3% and 50.5% rather than 50% flat, which is the measurement's own noise
(±2.5pp at 400 campaigns) and what the rows under them should be read against. There are no
draws: only the attacker scores, so the race is decided the moment one team crosses.

**The 6x6 is where this has to be answered.** One player short of twelve turns a coin flip into
losing seven times in ten; one short of thirty on the 9x9 cannot be told from level at all, and it
takes two or three missing before the 9x9 notices. So the arena that is easiest to fill — twelve
a side, and 20-odd players is the smallest turnout the game is written for — is also the one where
the split going wrong by one matters most. A rule that costs a whole player their round is worth
it there, and mostly ceremonial at thirty a side.

**Team size is not the whole of it.** Holding the arena at 6x6 and varying the teams, one player
short: 25.8% at ten a side, 27.5% at twelve, 33.0% at sixteen, 31.8% at twenty — the shortfall
fades slowly with team size, and nothing like fast enough to explain the 9x9 result at thirty. The
arena is doing most of the work, not the headcount.

## Evening the numbers is the answer, and it comes out level

The fuller team sits the difference out each round. Both sides then put the same number on the
arena, and what is left over is two effects pulling against each other: the fuller team fields
its best eleven of twelve, which helps it, and the round's earnings are shared by twelve players
rather than eleven, since a benched player earns nothing that round, which hurts it. 400
campaigns a cell, against level controls of 47.3% on the 6x6 and 50.5% on the 9x9:

| benched | short team's win% | gap, points an attacking round |
|---|---|---|
| 6x6, one short | **50.7%** | +0.04 |
| 6x6, two short | 51.5% | −0.07 |
| 9x9, one short | **48.5%** | +0.30 |
| 9x9, two short | 53.5% | −0.16 |

Every row is inside the noise of even, at both arenas and for one or two players missing — the
selection and the dilution cancel, and there is nothing left to tune. That is a better result
than any handicap could be: it needs no number, so it cannot be calibrated to the wrong headcount
or the wrong arena.

## If everyone would rather play, the price is four opening marks a body

Three of the four currencies the game already has can pay the debt, and the best of them is the
one the first attacker's handicap is already paid in: **opening marks**. The short team draws
extra pairs the same way as the rest and keeps its own half of each; the fuller team's half is
left off. 400 to 600 campaigns a cell, twelve a side on the 6x6, one player short:

| marks | short team's win% |
|---|---|
| none | 29.3% |
| one | 33.0% |
| two | 36.8% |
| three | 40.5% |
| **four** | **46.5%** |
| five | 52.3% |
| six | 61.5% |

Four is the number the rules take. It leaves the short team a point or two light of the 47.3%
level control and five puts it a few over; four is the side to err on, because every mark handed
over front-loads the game a little more — at four the campaign runs 20.4 rounds against the level
23, and at six it is down to 17.5.

**It is a rate rather than a threshold.** Two players short wants twice as many, at the same four
a body:

| two players short, marks a body | short team's win% |
|---|---|
| **four** | **49.3%** |
| five | 71.5% |
| six | 80.5% |

Four a body lands level again at eight marks handed over, which is what makes it a rate worth
stating as one — but level on the scoreboard only. That campaign is finished in 14.9 rounds
against the level 23, so half the evening has gone: **the rules state the marks handicap for one
player short and send anybody two or more short to even the numbers instead.** The rows above are
the same warning, louder: **the lever is far too strong past level.** At
five a body the short team wins 71.5% and the campaign is over in 10 rounds instead of 23, because
ten extra marks on a 36-space arena is most of a scored line handed to a team that only has to
hold it once. A shortfall of two or three is where paying in marks stops being a handicap and
starts being a different game, and where evening the numbers is the only sane answer.

**Handing marks over beats taking them away.** The other direction — the fuller team gives back
marks, exactly as the first attacker does — was measured too, and buys about half as much per
mark: 29.3% at none, then 29.8%, 31.8% and 36.0% for one, two and three, and three is nearly all
there is to give when only four pairs are seeded. The two are not the same manipulation. A mark
taken off the fuller team leaves a space empty, and an empty space is something both sides can
attack — the side with more players more effectively. A mark handed to the short team occupies
that space and adds to its position at once.

**On the 9x9 the lever is barely needed and prices the same way.** One player short of thirty is
already inside the noise of level, so there is nothing to pay; from two players short:

| 9x9, thirty a side, marks a body | two short | three short |
|---|---|---|
| none | 43.5% | 38.5% |
| one | 45.7% | — |
| **two** | 46.0% | **49.5%** |
| three | 53.7% | — |
| four | 58.0% | 67.5% |
| six | 74.5% | 83.5% |

**Two a body**, against the 50.5% level control — level at three short, a little light at two, and
three a body is a little heavy at both. The 9x9's slope is about three points of win rate a mark
where the 6x6's is four and a half, and it starts from a much smaller debt, which is the whole of
why the two arenas are handed different numbers.

## The other two currencies work, and are worse

**A purse of upgrade points**, handed to every player on the short team at the start. It buys
hands rather than ground, so it pays in duel odds in every round rather than in position in the
first one — and it works: at twelve a side, one short, 28.5% / 41.3% / 42.3% / 56.3% for a purse
of one, two, three and six each. Four or five each is the crossing. It is a worse rule for
reasons off the table: eleven purses is eleven pieces of book-keeping at the shop before the game
starts, and the prices in the economy were set against an income of about eighteen points over a
campaign, which a purse of five each moves by a quarter.

**Points on the scoreboard**, a head start for the short team. Also works, and the crossing is
about a fifth of the target per missing player:

| head start, 6x6 to 40, one short | short team's win% |
|---|---|
| none | 29.3% |
| two | 32.5% |
| four | 35.8% |
| six | 38.8% |
| eight | 42.0% |
| ten | 46.8% |
| twelve | 56.0% |

About eleven points of forty — a quarter of the target — for one player short of twelve. It is the
worst-determined number in this record: the curve is nearly flat from six to ten and then jumps,
and it does not scale per player the way the marks do (two players short is still under water at
nine points each). On the 9x9 two players short of thirty crosses somewhere around ten to fifteen
points of a hundred and seventy, with the same flat-then-jump shape.

It is the worst of the three despite being the easiest to administer: it is paid in the currency
the game is scored in, so the scoreboard stops meaning what it says, and it has to be recomputed
for every target. It is recorded here because it is the one handicap that can be applied halfway
through an evening, when somebody has to leave.

## The two handicaps are paid in the same coin, and both are paid

The first attacker still gives back two marks. Nothing about an uneven turnout changes what
attacking first is worth — the seat alternates every round and the shortfall does not — so the
two are separate debts that happen to be settled in the same currency: **four out to the short
team, two back from whoever attacks first, and if that is the short team it nets two.** Every
figure above was measured with the seat handicap in place and the opening seat alternating, so the
four already accounts for that arithmetic rather than assuming it away.

**Measured rather than assumed.** Points an attacking round by seat, 3600 rounds: level teams give
the first attacker +0.27, and a short team paid its handicap gives +0.08. Both sit inside the
±0.14 the earlier record put on the two-mark handicap, so an uneven turnout does not move the
seat, and the seat does not eat the turnout's handicap.

## Open

- **The size of the effect is the model's; the direction is the game's.** Both sides here are
  planners that place whole players over whole spaces and know each other's numbers. A table of
  humans will not extract the full value of an extra body, so 37% of a scoring rate is closer to a
  ceiling on what a shortfall costs than to a prediction, and the four marks that pay for it are
  priced against that ceiling. What is not model-dependent is which way it runs: the margin is
  where bodies decide spaces, and the 6x6 is where a body is worth most.
- **Why the two arenas differ by a factor of five is not established.** A space being a bigger
  share of a 6x6 round's marks and squared scoring being steeper at fewer lines account for two
  or three of it. The rest is unexplained, and it is the load-bearing part of the rule: it is why
  the 9x9 and the 6x6 are not handed the same number.
- **Benching is measured as a captain would play it** — the weakest player on the vetoes in front
  of them sits out, chosen fresh each round. A team that rotates the bench fairly instead, so that
  nobody sits out twice before everybody has, gives up some of that selection, which pushes the
  result further into the short team's favour rather than back. Nobody measured how far.
- **Nothing was measured below ten a side, above thirty, or with the teams uneven by more than
  three**, and the marks were fitted at twelve on the 6x6 and thirty on the 9x9. Anything between
  is an interpolation, and 20-a-side on the 6x6 — where the arena is crowded and a body is worth
  visibly less — was measured but not fitted.
- **No per-round handicap was found in the duel's own vocabulary.** The clean answer to a
  per-round charge would be a per-round payment, and the obvious candidates are worthless or worth
  too much: a stand-in that pairs and always loses is worth exactly nothing, since an attacker who
  beats it is no better off than an attacker nobody met, while one that cannot be paired is worth
  strictly more than a real player, because an unpaired body counts towards holding a space and
  never loses a duel. What is left is arithmetic at a duel station, which is why the answers here
  are all paid at setup.
- **The marks handicap front-loads the game.** A short team holding four extra marks has a
  position it cannot defend with the bodies it has, so it has to cash the opening early; campaigns
  run 20 rounds against the level 23. That is a change in the shape of the evening, not just in
  who wins it, and it is the strongest argument for benching over paying.
