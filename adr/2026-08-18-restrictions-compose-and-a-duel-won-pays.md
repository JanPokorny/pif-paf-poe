# 2026-08-18 — restrictions compose, and a duel won pays

Two rule changes, and a consistency pass over everything they touch. Both were measured
with instruments the earlier records describe: the **paired study** for the duel — one
thousand fixed (opening hand, replying hand, seed) triples replayed under both rules, so a
pairing differs only where the change mattered — and the **sweep** for the campaign, 720
rounds a cell from three seeds and summed.

The hand table was refitted from scratch under the new duel, since every strength in it is
an outcome of the rules being changed. Everything below is measured on that table, and no
figure here is comparable to one from a run on the old one without saying so.

## Every restriction on the board binds at once

Before, one restriction was in force — the most recently placed — and playing either a
Magnet or a Stinky replaced whatever was standing, whoever owned it. Now every Magnet and
every Stinky the opponent has on the board binds together. Take the free squares, keep the
ones beside at least one enemy Magnet, drop the ones beside any enemy Stinky, and play from
what is left; if that is empty, play anywhere free.

**It deletes the only question the duel asked about the past.** "Which of these two was
played last?" is a fact about the history of the game rather than about the board in front
of you, and it was the one thing a player had to remember rather than see. The new rule is
a property of the position.

**The seat does not move.** A thousand paired hand pairings, the opening seat's win rate:

| study | one of them | all at once | change |
|---|---|---|---|
| magnet, pool of six | 69.8% | 68.6% | −1.2pp [−4.9, 2.5] |
| stinky, pool of seven | 67.5% | 67.4% | −0.1pp [−3.7, 3.5] |

Both intervals straddle zero. That is the useful result: the change is free at the balance
the Counterattacks and the spaces were tuned to.

**It binds about ten points more often.** The share of placements made from a narrowed set
of squares rather than the whole free board goes 35.2% → 45.1% in the magnet study and
40.0% → 49.4% in the stinky study. So the rule is not a wash that happens to leave the seat
alone — it is materially more constraining, and the seat survives it.

**A second copy stops paying, which is the point.** Win rate by copies held, over every
hand-side played:

| | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| magnet, one of them | 45.1% | 54.5% | 54.9% | 31.9% |
| magnet, all at once | 48.0% | 54.9% | **47.3%** | 31.9% |
| stinky, one of them | 54.5% | 56.1% | 49.8% | 31.6% |
| stinky, all at once | 57.0% | 55.7% | **49.2%** | 30.3% |

Under the old rule a second Magnet was worth as much as the first (54.5% → 54.9%), which is
what gave the Magnet the whole top of the census table and is why Stinky was brought back
in the first place. Under the new rule the second copy costs seven points, and a hand with
no Magnet at all gains three. The mechanism is that the two stones now dilute themselves:
a second Magnet *widens* the set, since beside either one will do, and a second Stinky
narrows it until nothing is left and the fallback hands the whole board back. **One of
either is a weapon; a stack of them is a hand with nothing else in it.** The old rule needed
a second stone type to answer the first; this one answers it from inside.

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
| 2 | 2 | 0.77 | 2.66 | 55% | 1.27 | 3.41 | 4.83 | r9.0 | 2.65 | 27% → 85% | 89.3% → 85.5% |
| 2 | 3 | 0.77 | 2.70 | 56% | 1.28 | 1.93 | 3.68 | r10.3 | 2.68 | 18% → 70% | 89.9% → 87.4% |
| **3** | **3** | **0.77** | **2.57** | **55%** | **1.25** | **1.75** | **3.01** | **r13.0** | **2.51** | **11% → 59%** | **90.7% → 87.4%** |
| 3 | 4 | 0.77 | 2.56 | 54% | 1.25 | 1.73 | 2.25 | r13.8 | 2.46 | 8% → 45% | 90.8% → 88.4% |
| 4 | 2 | 0.77 | 2.13 | 29% | 1.13 | 2.36 | 3.74 | r13.1 | 1.99 | 11% → 72% | 91.2% → 86.8% |
| 4 | 4 | 0.76 | 2.33 | 45% | 1.18 | 1.72 | 1.82 | r15.5 | 2.24 | 5% → 37% | 91.4% → 88.9% |
| 5 | 5 | 0.77 | 2.02 | 21% | 1.11 | 2.05 | 1.25 | r17.0 | 1.91 | 2% → 25% | 91.5% → 89.9% |

**The ladder still has to finish, and above 3 it does not.** Three swaps take a player 96%
of the way to the best hand for their veto. At 3 they reach three swaps 55% of the time, the
same as the old 2 did on the old income; at 4 that falls to 29–45% and the hand they end on
falls with it, 1.25 → 1.18.

**Two is now too cheap, and the tell is the cards.** At 2 the campaign hands out an extra
purchase nobody planned for: a card appears in **85%** of defending duels in the second half
against the 65% the old economy ran at, the first card arrives in **round 9** rather than
round 13, and the attack's share of contested spaces is dragged from 89.3% to 85.5% across
the campaign. The Counterattack is a pacing dial and the record says to keep it weak; at 2
the players out-arm the pacing.

**Three lands the pacing back where it was measured.** 11% → 59% of defending duels carry a
card, against the old economy's 11% → 65%; the attack goes 90.7% → 87.4%, against 90.3% →
87.5%. The first card is bought in round 13.0 holding 2.51 swaps, against round 13.4 holding
2.64. The economy is the same shape at a larger scale, which is what a price change should
buy.

**Three also strands the fewest points.** Unspent at the end: 1.75 at 3/3, against 3.41 at
2/2 — more than a whole purchase left in the purse — and 2.05 at 5/5. The prices level keeps
the card from being what a player buys with their first points, which is the one asymmetry
the old record found could not be tuned away.

**It transfers.** Same prices, no rescaling, 720 rounds a cell:

| arena, a side | earn/r | swaps | reach 3 | never | hand | bank | cards | 1st card at |
|---|---|---|---|---|---|---|---|---|
| small, 12 | 0.77 | 2.57 | 55% | 1.3% | 1.25 | 1.75 | 3.01 | r13.0 |
| small, 30 | 0.80 | 2.58 | 56% | 0.9% | 1.25 | 1.62 | 3.31 | r12.5 |
| big, 12 | 0.73 | 2.53 | 55% | 0.9% | 1.23 | 1.84 | 2.69 | r13.4 |
| big, 30 | 0.78 | 2.55 | 55% | 1.0% | 1.25 | 1.85 | 3.04 | r12.5 |

**And the targets stand.** 200 campaigns played to a finish: the 6x6 at 40 points takes 22.9
rounds (23.2 before), the 9x9 at 170 with thirty a side takes 24.5 (23.9 before). The round
itself is where it was too — 2.95 points an attacking round at twelve a side against the
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
  the table is an inference from the second copy losing seven points, not a count of ranks.
- **Nothing was measured about three or more restriction stones in play at once**, since
  hands that hold that many are rare in the pool and the table for 3 and 4 copies runs on
  tens of hand-sides.
