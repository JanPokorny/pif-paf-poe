# 2026-08-11 — the campaign: team size, and the defender's step

Two questions were open in the campaign layer: how many players a team should have, and
whether a defender with nobody to fight may step to an adjacent space. `campaign.js` was
written to answer them and `board.js` to hold the geometry.

## Instruments

- **Arithmetic** — the chance an attack takes a space is a closed form in the number of
  attackers, the number who found a defender, and the duel odds. The most important thing
  found here came out of this and needed no simulation at all.
- **Sweep** — the campaign played for many rounds at each team size, with each size run from
  three seeds and summed, because allocating whole players over whole squares is lumpy and one
  run of one size can land on a shape its neighbours do not share.
- **Paired study** — the same positions handed to both variants, several resolutions each,
  with the reference campaign advanced by the two alternately. Needed because a change that
  concedes fewer marks also leaves a sparser board, and a sparser board scores at a different
  rate for reasons that have nothing to do with the change. Measuring the variants across
  independent campaigns says the defence is worth nothing; measuring them on shared positions
  says it is worth a third of a point a round. The paired number is the true one.
- **Clairvoyant defence** — a defence that has already seen the attack and that the attack is
  not re-planned against. Illegal, and there as a ceiling.

The duel is a coin at even odds, because both teams draw hands from the same pool and the
seat is decided at the table, so the attacker's share is a half by symmetry. Checked against
the real thing: 120 rounds with every pairing played out through `engine.js` gave 3.73 marks
a round and 0.875 points at twelve a side, against 3.77 and 0.94 for the coin.

## Decisions

### Ten to thirteen a side

Everything that measures whether the round is a contest gets worse as the teams grow, with no
turn anywhere in the range. The share of a team who plays a duel that decides the square it
is played on peaks at 55% around twelve a side and falls to 30% at thirty; rounds conceding
all four marks go from 62% to 83%; and what a deliberate defence is worth over a random one
falls from 0.44 points an attacking round to 0.20.

The mechanism is that the board asks for four marks a round whatever the team size, so the
defence's task is fixed while the attack's budget grows. Players past about three per board
buy the attack certainty rather than buying anybody a game. Which also says what to do if
thirty a side is wanted for its own sake: contest more boards, not more players per board.

### The defender's step is allowed

A defender left unpaired steps to an orthogonally adjacent space where the attackers
outnumber the defenders, and may stand idle only when no unpaired attacker is within reach.

Measured on shared positions it costs the attack 0.04 to 0.15 points an attacking round and
0.09 to 0.17 marks. Those are small. What is not small is what it does to the round: it lifts
the share of each team that gets a duel from about 47% to about 65%, it roughly doubles the
share whose duel decided something at every team size, and it doubles what a defensive plan is
worth at thirty a side (0.20 against 0.09). It is also the only rule under which standing two
deep on a square means anything.

Considered and rejected: leaving it out. Without it a defender covers one square, thirty
defenders cover thirty of thirty-two, and the attack walks into whatever is left. At thirty a
side the defensive phase is then very close to decorative.

### The defence is not able to stop the marks, and this is arithmetic

It concedes between 3.5 and 4 marks of four at every size and under every variant tried. The
clairvoyant defence concedes 3.84. The reason is that a defender fights one attacker, so a
lone attacker faces exactly one duel however many defenders stand on the square, and takes it
as often as they win that duel. Massing defenders past the first buys nothing against a single
attacker, and matching an odd attack one for one still concedes the square half the time. Half
is the floor on the attack's chance at any square it commits an odd force to, and no allocation
of any number of defenders lowers it.

Two corollaries a team will find at the table: twice the defenders plus one takes a square
outright, and an even number of attackers is never worth more than one fewer, so forces come
in odd numbers.

This is recorded rather than fixed, because both answers above are answers about how much the
defence can be made to matter *within* that ceiling. Raising the ceiling means changing how a
square is taken — letting a defender hold more than one attacker, or counting the defence's
unpaired players the way the attack's are counted — and that was not what was asked.

## What the measurements caught in the model

Both worth recording, because both changed the numbers by more than any rule under test.

**A position priced too high makes the attack decline points.** The value of a two-in-a-row
was set by hand at 0.45 of a point. At that price four marks left standing are worth more than
the line they could have completed, so the attack builds instead of scoring. Run against the
same player at 0.12 it lost by six points to one. Prices were then found by playing candidates
against each other; the surface is flat between about 0.08 and 0.14, and every conclusion here
was re-run at both ends of a wide range and held.

That bad price also produced a spurious rules finding. It looked as though attacking first in
a campaign was a disadvantage worth 15% of the scoring rate — the first attacker having more
on the board when the second one scores and clears it. With the price corrected the two seats
are level to within 0.02 points. The seats are even; the asymmetry was bad play.

**A corner may be claimed for either of its boards, and that is how a line is built in one
round.** The first version pre-assigned each corner to one board, which quietly made a whole
class of play impossible: a line across the inner ring uses one square each of three different
boards, so the attack can complete it in a single round if it takes all three. Fixing it
roughly doubled the scoring rate.
