# 2026-08-18 — restrictions compose, and a duel won pays

Two rule changes, and a consistency pass over everything they touch. Both were measured
with instruments the earlier records describe: the **paired study** for the duel — one
thousand fixed (opening hand, replying hand, seed) triples replayed under both rules, so a
pairing differs only where the change mattered — and the **sweep** for the campaign, 720
rounds a cell from three seeds and summed.

The hand table was refitted from scratch under the new duel, since every strength in it is
an outcome of the rules being changed. Everything below is measured on that table, and no
figure here is comparable to one from a run on the old one without saying so.

## Every restriction on the board pulls at once, and you answer as many as you can

Before, one restriction was in force — the most recently placed — and playing either a
Magnet or a Stinky replaced whatever was standing, whoever owned it. Now every one of them
asks, separately: a square **satisfies** a Magnet by being beside it and a Stinky by not
being beside it, and **you must place where you satisfy as many as any square can**.

The counting is what makes the rule behave. Two Magnets far apart cannot both be answered,
so answering either is the most on offer and either will do; two whose neighbourhoods
overlap can both be answered, so the overlap is the only place to go. A Magnet and a Stinky
at odds leave every square that answers one of them, and rule out the squares that answer
neither. Adding a restriction never removes the ones already there — it re-sorts the board.

**It deletes the only question the duel asked about the past.** "Which of these two was
played last?" is a fact about the history of the game rather than about the board in front
of you, and it was the one thing a player had to remember rather than see. The new rule is
a property of the position.

**It has no exceptions to state.** The first draft of this rule was an intersection —
beside a Magnet, away from every Stinky — and needed a clause for when the intersection
came out empty, which two Magnets and a Stinky can easily arrange. Under the count there is
nothing to say: the best available score is always achieved by something, so there is always
somewhere to play, and the case where nobody holds a restriction is the same rule with every
square scoring zero.

**The seat does not move.** A thousand paired hand pairings, the opening seat's win rate:

| study | one of them | all at once | change |
|---|---|---|---|
| magnet, pool of six | 69.8% | 71.6% | +1.8pp [−1.8, 5.4] |
| stinky, pool of seven | 67.5% | 67.9% | +0.4pp [−3.3, 4.1] |

Both intervals straddle zero. That is the useful result: the change is free at the balance
the Counterattacks and the spaces were tuned to.

**It binds a good deal more often.** The share of placements made from a narrowed set of
squares rather than the whole free board goes 35.2% → 47.6% in the magnet study and
40.0% → 53.8% in the stinky study — over half of all placements in the second. So the rule
is not a wash that happens to leave the seat alone: it is materially more constraining, and
the seat survives it. It is also more constraining than the intersection draft this replaced,
which reached 45.1% and 49.4% on the same pairings, because the intersection kept falling
back to the whole board and the count never does.

**The first copy is worth more and the second is worth less.** Win rate by copies held, over
every hand-side played:

| | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| magnet, one of them | 45.1% | 54.5% | 54.9% | 31.9% |
| magnet, all at once | 45.1% | **56.6%** | **49.7%** | 34.7% |
| stinky, one of them | 54.5% | 56.1% | 49.8% | 31.6% |
| stinky, all at once | 56.2% | 56.5% | 48.9% | 29.8% |

Under the old rule a second Magnet was worth as much as the first (54.5% → 54.9%), which is
what gave the Magnet the whole top of the census table and is why Stinky was brought back in
the first place. Under the count the first Magnet gains two points and the second loses five.
**One of either is a weapon; a stack of them is a hand with nothing else in it.** The old rule
needed a second stone type to answer the first; this one answers it from inside.

**What it rewards instead is the pair.** Nothing in the rule says so, and it turns up in the
refitted hand table anyway: the best hand on five of the seven spaces holds one Magnet and
one Stinky. A Magnet and a Stinky whose reaches cross cut the board to a handful of squares —
each answers a demand the other cannot — where two of a kind mostly answer the same one
twice. The stone that was brought in as the Magnet's counter is now also its partner.

## A duel won pays a point of its own

Before, a round paid one upgrade point to everyone standing on a space their side won. Now
it pays that *and* a point to everyone who won their duel. A player can collect both, so a
round pays nothing, one, or two, and the second one has to be fought for.

What it changes, beyond the arithmetic: a defender who loses the space but wins their game
now goes home with something, and an unpaired player who never fought can only ever take
one. The reward stops being purely a question of where you were standing.

**It raises a player's income by half.** Earnings per player per round go **0.50 → 0.77** at
twelve a side on the 6x6 — about eighteen points over a campaign where there were twelve.
It is not double, because the two lists overlap heavily: most duels are won by the side that
goes on to win the space, so most of the second point lands on a player who was already
being paid.

## The prices go to three

Both purchases move from 2 to 3. The four things that set the old price were re-applied to
the new income, sweeping both prices over 2–5 independently, 720 rounds a cell from three
seeds, twelve a side on the 6x6. Per player over a campaign:

| swap$ | card$ | earn/r | swaps | reach 3 | hand | bank left | cards | 1st card at | after n swaps | card in defending duels, 1st half → 2nd | attack takes, 1st → 2nd |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 0.76 | 2.75 | 59% | 1.19 | 2.92 | 4.94 | r8.8 | 2.52 | 28% → 88% | 90.1% → 85.1% |
| 2 | 3 | 0.77 | 2.69 | 56% | 1.19 | 1.85 | 3.73 | r10.2 | 2.63 | 18% → 73% | 90.4% → 87.0% |
| 2 | 4 | 0.77 | 2.74 | 58% | 1.19 | 1.80 | 2.78 | r11.6 | 2.71 | 11% → 57% | 90.6% → 87.9% |
| 3 | 2 | 0.77 | 2.40 | 47% | 1.15 | 2.16 | 4.51 | r10.3 | 2.05 | 22% → 82% | 90.4% → 86.2% |
| **3** | **3** | **0.77** | **2.41** | **48%** | **1.16** | **1.49** | **3.22** | **r12.3** | **2.28** | **13% → 64%** | **90.8% → 87.5%** |
| 3 | 4 | 0.77 | 2.47 | 51% | 1.17 | 1.66 | 2.33 | r13.5 | 2.37 | 8% → 48% | 90.4% → 88.8% |
| 4 | 4 | 0.77 | 2.10 | 29% | 1.11 | 1.65 | 2.08 | r14.6 | 2.01 | 6% → 42% | 91.0% → 88.8% |
| 5 | 5 | 0.77 | 1.83 | 9% | 1.05 | 2.06 | 1.43 | r16.0 | 1.72 | 2% → 30% | 91.3% → 89.6% |

**The ladder still has to finish, and above 3 it does not.** Three swaps take a player 96%
of the way to the best hand for their veto. At 3 they reach three swaps 48% of the time and
0.7% never swap at all; at 4 that falls to 29% and at 5 to 9%, and the hand they end on falls
with it, 1.16 → 1.11 → 1.05. The old record's failure marks were 20% reaching three and 2.9%
never swapping, and 3 clears both by a distance.

**Two is now too cheap, and the tell is the cards.** At 2 the campaign hands out an extra
purchase nobody planned for: a card appears in **88%** of defending duels in the second half
against the 65% the old economy ran at, the first card arrives in **round 9** rather than
round 13, and the attack's share of contested spaces is dragged from 90.1% to 85.1% across
the campaign. The Counterattack is a pacing dial and the record says to keep it weak; at 2
the players out-arm the pacing.

**Three lands the pacing back where it was measured.** 13% → 64% of defending duels carry a
card, against the old economy's 11% → 65%; the attack goes 90.8% → 87.5%, against 90.3% →
87.5%. The first card is bought in round 12.3 holding 2.28 swaps, against round 13.4 holding
2.64. The economy is the same shape at a larger scale, which is what a price change should
buy.

**Three also strands the fewest points.** Unspent at the end: 1.49 at 3/3, the lowest anywhere
in the sweep, against 2.92 at 2/2 — a whole purchase left in the purse — and 2.06 at 5/5.

**The runner-up, and why it lost.** Swap 2 / card 4 is the one other cell that lands the card
share (11% → 57%), and it keeps a better ladder: 2.74 swaps and 58% reaching three, against
2.41 and 48%. It loses on two counts. The attack's edge comes off less across the campaign
(90.6% → 87.9% against 90.8% → 87.5%), so the cards do less of the pacing work they are there
for; and it prices the card at twice the swap, where the old record's finding was that **at
equal prices a player who saves and a player who spends on impulse are indistinguishable** —
which is worth more than the ten points of reach-3, because it means the design does not
depend on how far ahead the table plans. Equal prices, and the cheapest pair that still
finishes the ladder, is 3 and 3.

**It transfers.** Same prices, no rescaling, 720 rounds a cell:

| arena, a side | earn/r | swaps | reach 3 | never | hand | bank | cards | 1st card at |
|---|---|---|---|---|---|---|---|---|
| small, 12 | 0.77 | 2.41 | 48% | 0.7% | 1.16 | 1.49 | 3.22 | r12.3 |
| small, 30 | 0.81 | 2.41 | 48% | 1.1% | 1.16 | 1.47 | 3.54 | r11.8 |
| big, 12 | 0.73 | 2.42 | 48% | 0.7% | 1.16 | 1.58 | 2.91 | r12.5 |
| big, 30 | 0.78 | 2.45 | 51% | 0.9% | 1.16 | 1.61 | 3.22 | r11.9 |

**And the targets stand.** 200 campaigns played to a finish: the 6x6 at 40 points takes 22.5
rounds (23.2 before), the 9x9 at 170 with thirty a side takes 25.0 (23.9 before). The round
itself is where it was too — 2.97 points an attacking round at twelve a side against the
3.01 the finished rules measured.

## The consistency pass

Small things, found by reading the rules against the code rather than measured.

- **The arena's veto legend was unreadable.** `RULES.md` printed the pattern with `M` for
  both mountain and magnet and `S` for both shift and stinky, so the key could not be
  applied to the grid. The pattern itself was right; it is now printed in the engine's own
  two-letter codes.
- **Two Counterattacks in the engine that no game could hold.** `king-of-the-hill` and
  `veto` had action builders and transitions, but neither is in `ITEMS`, so `createGame`
  rejects any hand holding one. Both are gone, and with them the `deny` flag on a forced
  move that only Veto ever set.
- **A turn's first step listed only half of what narrows it.** It named the Magnet and the
  Stinky, which say where, and not Mind Control, which says which stone.
- **`stones.html` still told a reader that only the latest restriction binds.**
- Stale names in comments: `Exchange` for what is now Mirror, `Swap` for a stone that was
  cut, "all three" of five Counterattacks.

## What the code plays now

`oneRestriction` is the one rules variant left in `engine.js` — the single-restriction rule,
kept because the study above is what replaced it and deleting it would make the numbers
unreproducible. `--swap-cost` and `--card-cost` came back to `campaign.js` for the same
reason: the price table above is the whole argument for 3, and it cannot be re-run without
them. Everything else in both files plays RULES.md and nothing else.

## Open

- **The allocation planner does not know that a duel pays.** Both sides still place players
  to win spaces, not to win points, so nothing in the sweep can show the behavioural change
  the second point is most likely to cause: an attacker who would rather fight for a space
  than walk onto an empty one. The measured income is therefore a floor on what a table
  actually earns, and the pricing rests on the income rather than on the tactics.
- **The census has not been re-run.** The copy curves above come from sampled pairings, not
  from every hand playing every other; the claim that the Magnet no longer owns the top of
  the table is an inference from the second copy losing five points, not a count of ranks.
  The Magnet-and-Stinky pair topping five of seven veto columns is the same kind of evidence
  — a fitted table, not a ranking.
- **Nothing was measured about three or more restriction stones in play at once**, since
  hands that hold that many are rare in the pool and the table for 3 and 4 copies runs on
  tens of hand-sides. The count makes those positions sharper than any earlier rule did — a
  board with three restrictions on it can pin the opponent to one square — and that is the
  part of the change with the least evidence under it.
- **Whether a player can work the count out at a table is untested.** Two stones is a glance;
  four is arithmetic on every turn. If it proves fiddly in play the cheap retreat is to cap
  what counts, not to go back to the rule it replaced.
