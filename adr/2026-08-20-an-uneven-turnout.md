# 2026-08-20 — an uneven turnout

Twenty to sixty people turn up and are split into two teams. Sometimes the split does not come
out even. This record measures what a missing player is worth, tries every currency the game
already has for paying it back, and settles what the rules should say. Everybody plays, and the
short team is paid twice over: **it attacks in round one, and it keeps three extra opening marks
on the 6x6 — none on the 9x9, where round one covers a missing body on its own.** One player
short is what that is priced for; two or more, and the teams want splitting again.

`campaign.js` grew the asymmetry it needed: `teamSize` is now read per team rather than off one
`--sizes`, so a round is planned, paired and resolved with the real numbers on both sides. Team X
is always the short one, and the levers are `--short` (how many players it is missing) with
`--short-marks`, `--short-handicap`, `--short-xp`, `--head-start` and `--bench` for the answers,
plus `--first` for who attacks in round one and `--seed-handicap` for what they give back.

Two instruments, both from the earlier records. The **sweep** — fixed rounds, three seeds summed,
campaigns of 24 rounds — measures points per attacking round, which is the unit the first
attacker's handicap was set in. **Campaigns played to a finish** measure the thing that actually
decides an evening: how often the short team wins the race to the target. The hand table is the
40-opponent, 120-iteration per-veto fit; every number here is from that table.

**One thing about the seat had to change to measure any of this.** Earlier records ran campaigns
half from each opening seat, so that whoever attacks in round one could not bias a total. That is a
measurement device, not a rule: a real evening has one first attacker. Where a section below says
the seat is *pinned*, the short team attacks in round one of every campaign measured, which is what
the rules now say; teams alternate round by round inside a campaign either way.

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

## Round one is the first half of the handicap, and it is free

Whoever attacks in round one is a round ahead of the other side all evening, and the round-by-round
alternation never hands that back. With the seat pinned and even teams, 600 campaigns a cell:

| even teams, seat pinned | seat-holder's win% |
|---|---|
| 6x6, twelve a side | 54.7% |
| 9x9, thirty a side | 54.7% |

So round one is worth about **five points of win rate** on both arenas, which is a good deal more
than the earlier per-round measure suggested — that record put the seat at +0.10 ± 0.14 points an
attacking round after its two marks and called it level, and on the race it is not. Giving the
short team round one therefore pays part of the debt before a single mark changes hands.

**How far it can be paid down in marks differs by arena**, which is the one place the two need
different numbers for the same reason. Sweeping what the first attacker gives back, even teams, seat
pinned, 600 campaigns a cell:

| gives back | 6x6 | 9x9 |
|---|---|---|
| **two** | 54.7% | 54.7% |
| **three** | 53.0% | **49.3%** |
| four | 53.2% | 49.0% |
| six | — | 43.3% |

**The 9x9 pays it off at three** and lands on the fair line. **The 6x6 never does**: at four back the
first attacker has no opening marks at all and still wins 53.2%, so the curve is flat inside the
noise from two onwards. The tempo is not a position, and on a 36-space arena there is not enough
position to take away — nine pairs give the 9x9 the granularity the 6x6 hasn't got. So the 6x6 keeps
its two and a drawn seat worth about 55/45 with it; see the last of the open questions.

## The second half is marks, and the two arenas want different numbers

The short team takes round one and keeps extra opening marks on top. 600 campaigns a cell, one
player short, against a **50%** target — the two teams should be even, which is not the same as
matching the 54.7% a seat-holder gets with even teams:

| short team's opening marks | 6x6, twelve a side | 9x9, thirty a side |
|---|---|---|
| two | 35.5% | — |
| **five** | **51.7%** | — |
| six | 54.7% | — |
| seven | 62.8% | **50.0%**, and 52.3% the other way round |
| eight | — | 56.3% |
| nine | — | 54.7% |

Marks are counted absolutely here, on the arena at the start of round one, because it does not
matter how they are bookkept: seven on the 9x9 measures 50.0% reached as *give back two, add none*
and 52.3% as *give back three, add one*, which is the same position by a different route and the
same answer inside the noise.

**On the 6x6 the short team wants five**, against the four its opponent holds. The crossing sits
just under five; six overshoots to 54.7%, and five is the side to err on because every mark handed
over front-loads the game — at five the campaign runs 20.9 rounds against the level 23, and at
seven it is down to 18.

**On the 9x9 it wants seven**, which is one mark more than the six the even row settled on. One body
among thirty is worth about a mark and a half there, and the seat covers most of it.

That makes the rules table, in marks on the arena when round one starts:

| | 6x6 | 9x9 |
|---|---|---|
| **even teams** | 2 / 4 | 6 / 9 |
| **first team a player short** | 5 / 4 | 7 / 9 |

## The same lever with the seat alternating, and where it stops working

The marks were first fitted with the opening seat alternating, before the rules gave it to the
short team. Those figures are kept because they price the mark itself, free of the seat: 400 to 600
campaigns a cell, twelve a side on the 6x6, one player short, against a 47.3% level control.

| extra marks | short team's win% |
|---|---|
| none | 29.3% |
| one | 33.0% |
| two | 36.8% |
| three | 40.5% |
| four | 46.5% |
| five | 52.3% |
| six | 61.5% |

**A mark is worth about four and a half points of win rate on the 6x6 and three on the 9x9**, and
the seat is worth about five. Four marks a body pays for a body outright; with the seat doing part
of the work, three do — which is the arithmetic behind the rules table, and it holds because the two
handicaps add rather than interfering.

**It is a rate rather than a threshold, and that is the problem with it.** Two players short takes
twice as many, at the same four a body with the seat alternating: 49.3% at four each, 71.5% at five,
80.5% at six. Level on the scoreboard, but that campaign is finished in **14.9 rounds against the
level 23** — half the evening gone, because eight extra marks on a 36-space arena is most of a
scored line handed to a team that only has to hold it once. **So the rules price the handicap for
one player short and send anybody two or more short back to splitting the teams.**

**Handing marks over beats taking them away.** The other direction — the fuller team gives back
marks, exactly as the first attacker does — buys about half as much per mark: 29.3% at none, then
29.8%, 31.8% and 36.0% for one, two and three, and three is nearly all there is to give when only
four pairs are seeded. The two are not the same manipulation. A mark taken off the fuller team
leaves a space empty, and an empty space is something both sides can attack — the side with more
players more effectively. A mark handed to the short team occupies that space and adds to its
position at once.

**And the 9x9 at two and three players short**, seat alternating, for the same reason the 6x6 rows
are kept: 43.5% / 45.7% / 46.0% / 53.7% at none, one, two and three marks a body with two missing,
and 38.5% / 49.5% / 67.5% at none, two and four with three missing. About two a body there, against
a 50.5% control — consistent with a mark being worth three points on the 9x9 and the debt being much
smaller to begin with.

## Evening the numbers was measured, and not taken

The other way to answer an uneven turnout is to refuse it: the fuller team sits players out until
both sides field the same number. It works, exactly, and the rules do not use it.

| benched, seat alternating | short team's win% | gap, points an attacking round |
|---|---|---|
| 6x6, one short | 50.7% | +0.04 |
| 6x6, two short | 51.5% | −0.07 |
| 9x9, one short | 48.5% | +0.30 |
| 9x9, two short | 53.5% | −0.16 |

Every row is inside the noise of even, at both arenas and for one or two missing, and it needs no
number at all — the fuller team's better selection from a deeper bench and its diluted income (a
benched player earns nothing that round) cancel. It is the most robust result in this record.

It is not the rule because of what it costs off the table: somebody who turned up to play stands
and watches, every round, and the game is written for an evening where twenty to sixty people all
have something to do. The handicap above buys the same fairness at the price of a slightly
front-loaded opening, and everybody plays. Worth knowing it is there if a table would rather have
the exact answer.

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

## What the rules ended up saying

One bullet for the seat, one table, and no third case:

- The team a player short attacks in round one; with even teams, draw for it. Teams alternate from
  there as before.
- Opening marks, first attacker / second: **2 / 4** on the 6x6 and **6 / 9** on the 9x9 with even
  teams, **5 / 4** and **7 / 9** when the first team is a player short.
- Priced for one player short. Two or more, split the teams again.

The seeding did not move and nothing new was invented to pay for a shortfall: the handicap is a seat
the rules were already handing out, plus three marks on the 6x6 and one on the 9x9. The 9x9's own
seat handicap did move, from two marks back to three, and that is a correction to the old rule
rather than anything to do with an uneven turnout — it only became visible once the seat stopped
being averaged away.

## Open

- **The size of the effect is the model's; the direction is the game's.** Both sides here are
  planners that place whole players over whole spaces and know each other's numbers. A table of
  humans will not extract the full value of an extra body, so 37% of a scoring rate is closer to a
  ceiling on what a shortfall costs than to a prediction, and the seat and three marks that pay for
  it are priced against that ceiling. What is not model-dependent is which way it runs: the margin is
  where bodies decide spaces, and the 6x6 is where a body is worth most.
- **Why the two arenas differ by a factor of five is not established.** A space being a bigger
  share of a 6x6 round's marks and squared scoring being steeper at fewer lines account for two
  or three of it. The rest is unexplained, and it is the load-bearing part of the rule: it is why
  the 9x9 and the 6x6 are not handed the same number.
- **A drawn seat is worth 55/45, and marks will not buy it down.** That is a wart in the game as it
  already stood, not something an uneven turnout created — it was invisible while the records
  alternated the seat and averaged it away. With even teams the rules now say to draw for round one,
  which makes it fair before the draw and lopsided after it — and unlike the 9x9, the 6x6 cannot
  buy it back with marks: at four back the first attacker starts with none and still wins 53.2%.
  Three things were not tried: a
  compensation that is not a position (a Counterattack in hand for the second team, say), a shorter
  target for the first attacker, and simply letting the team that lost the draw pick their arena
  half. Any of them would want its own record.
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
- **The marks handicap front-loads the game.** A short team holding three extra marks has a
  position it cannot defend with the bodies it has, so it has to cash the opening early; campaigns
  run 20.9 rounds against the level 23. That is a change in the shape of the evening, not just in
  who wins it, and it is the strongest argument for benching over paying.
- **The 9x9's short row rests on two numbers a point and a half apart.** Seven marks measures 50.0%
  and 52.3% by the two routes to it, and the neighbours are 56.3% at eight and 43.5% unpaid with the
  seat alternating. So seven is right to within about a mark, and no finer than that.
