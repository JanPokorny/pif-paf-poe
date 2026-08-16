# 2026-08-11 — the stone pool, the Counterattack, and spaces

Everything here was decided by measurement rather than argument. Three instruments were
used, and which one a claim comes from matters:

- **Census** — every one of the distinct five-stone hands plays every other, both seats.
  Exact over the whole hand space, and no sampling.
- **Paired study** — one thousand fixed (opening hand, replying hand, seed) triples replayed
  with and without a change, so the interval is on the per-pairing difference.
- **Metagame** — a population of loadouts, worst tenth dropped and best tenth copied each
  round, so hands are measured against the field that actually forms rather than against a
  field nobody would bring. This is the one that decided things, and it disagrees with the
  other two often enough to matter.

## Decisions

### The pool is six stones

Shift, 2048, Rotate, Mountain, Magnet, Stinky.

Cut on the way: **Regular** (a do-nothing turn), **Glue** (a stall that reverted the game to
tic-tac-toe), the old **Swap**, **Stinky**'s first version, **Mimic**, **Leech** (renamed to
Swap, then cut in turn), and the second **Swap**. The last cut is the one worth recording:
Swap was the weakest stone by every measure the census had, and cutting it *raised* the
opening seat from 69.8% to 72.7% and left no hand at all preferring to reply. A reactive
stone is worth little to the hand holding it and something to the game, because it is a
thing the opener has to play around.

### A Mountain blocks rather than vetoes

Previously an effect that would have moved a stuck stone was struck off the menu. Now every
effect always resolves: the Mountain holds its square and everything else moves as far as
the space allows. Considered and rejected: leaving it as a veto, which made a movement stone
dead weight against a Mountain-heavy board.

### A Magnet's pull is permanent

It holds until another restriction stone replaces it or it leaves the board, rather than for
one turn. Measured over the whole hand space this moved the opening seat 71.7% → 69.8% and
turned the Magnet from a stone you take one of into one every good hand holds — a second
copy went from 41.7% to 53.0%.

The cost, which the census caught and a sampled study would not have: it gave the Magnet the
whole top of the table, 32 of the top 32 hands, with the best Magnet-free hand at rank 36 of
126. **Stinky was brought back as the answer** — the same restriction pushing instead of
pulling, sharing the single restriction slot so either replaces the other. In a pool that
held both, the Magnet's share of the top quartile fell from 95% to 68%.

Stinky's own pull was measured permanent-versus-one-turn as well: permanence fixes its copy
curve exactly as it did the Magnet's and does nothing at all for the seat (−0.7pp
[−4.3, 2.9]). Pulling the opponent onto four squares costs them a turn; pushing them off
four leaves them the rest of the board.

### The second player brings Counterattacks, holds several, spends one

Twenty-six were built and measured. The five kept are Overtake, Relocate, Mirror, Mind
Control and Rehearse, and the rule is hold as many as you like and spend one per game.

What the whole exercise found, and it is more useful than any individual number:

- **Subtracting from the opponent's move is worth tens of points. Adding to your own options
  is worth a few.** Cancelling an effect outright was +43pp to the replying seat; resolving
  your own stone twice was −1.3pp.
- **Naming what the opponent must play, or must not play, is worth nothing.** Mind Control,
  Shortlist and Veto are one item in three grades and all three land in the same dead band. A
  five-stone hand with one type barred still has four other placements.
- **Repositioning your own stones is nearly nothing** — Nudge, Relocate, Rearrange, Rehearse
  and Echo all said so. The exception is Mirror, which is positional but also moves *their*
  stone, and that is what puts it in the useful band.
- **A free choice of Counterattack balances the game at the strongest item on the list, not
  the average one.** Given all eighteen to choose from, a population converged on Overtake at
  69.5% share and the other seventeen went extinct — including Anchor, the item that was the
  closest thing to balanced when measured alone. Either the list is flat or there is one item.
- **Holding a second Counterattack is worth about five points and a third is worth nothing.**
  One use per game is the binding constraint; the second exists so that something is always
  applicable. Holding one, the item goes unspent in 53% of games; holding two, 3%.

Where the five land, each given to every replying player against a converged field, with the
opening seat's win rate as the measure and a slight lean to the opener as the target:

| pick | opening seat |
|---|---|
| Overtake | 42.8% |
| Relocate | 53.5% |
| Mirror | 56.8% |
| Mind Control | 64.6% |
| Rehearse | 71.4% |
| nothing at all | 86.1% |

### Spaces switch a stone type off

A game is fought on a space, and a space switches one stone type off for both players: still
placed, still counts towards a line, no effect. This was the largest single effect measured
anywhere in the project, and it is not about the items.

| | shift | 2048 | rotate | mountain | magnet | opening seat |
|---|---|---|---|---|---|---|
| one space | 38.5% | 2.0% | 5.3% | 15.0% | 39.2% | 86.1% |
| a circuit of six | 24.8% | 19.2% | 15.5% | 18.0% | 22.5% | 72.1% |

On a single space the field collapses onto Shift and Magnet and the opener climbs to 86%,
because the hands selection keeps are the ones that *open* best — the survivors take 91% of
their census games from the opening seat. On a circuit the collapse does not happen, the
commonest hand is one of each, and the opener takes 72%. **Fourteen points of seat balance,
bought by changing which hands are good rather than by handing the reply a lever.**

### The full board goes to the second player

Moving first is the advantage — you reach three stones first — so the second player takes the
tie. It also gives the first player a deadline: the board fills on *their* fifth stone. And it
is why the second player only ever places four of their five, so the one left behind is a choice
they make by playing the others.

Do not expect it to even the game up. The first player takes 72.7% over the whole hand space and
only 9.3% of games reach a full board, so the tiebreak decides about one game in eleven. It leans
the right way without being a fix; what evens the game is the Counterattack, and what keeps hands
honest is the space.

### What the spaces cost a narrow hand

A hand that cannot play on a vetoed space loses a game in six outright, and a hand tuned to one
stone loses more. The spaces do not fall evenly either: switching off the Magnet leaves the
opening seat at 78%, since it removes the main brake on an opening run, and switching off 2048
leaves it at 65%.

## Two measurement lessons, recorded because they cost real time

**A converged field is not the same field twice.** Two replicates of the same item settled on
different metagames and gave 53.8% and 59.9%. The spread between fields is wider than the
interval within either, so a single run measures an item in one attractor, not the item.

**When adding options measures worse, suspect the search.** It happened twice. Mirror is a
strict superset of Exchange and measured 5pp worse; holding four Counterattacks is a superset
of holding three and measured 4.9pp worse. Both were the player, not the rules: a
once-per-game item is spent too early when a rollout would waste it anyway, and a wide
end-of-turn menu spreads a small search too thin. Tripling the search flipped the sign of the
second from −3.5pp to +7.5pp. The rollout policy now holds a once-per-game item unless
spending it wins on the spot, which moved Relocate from a dead 63.0% to a live 53.5%.

Any monotonicity violation is now treated as a bug report against the measurement.

## Open

- The circuit draws its space at random. The intent is that players choose it, which is
  stronger pressure, so 14pp is a floor and the seat effect of *who* chooses is unmeasured.
- The pick list is not flat, so as picks it balances at Overtake's 42.8% rather than
  Mirror's 56.8%.
- The census and every balance figure above were measured on the five-stone pool, before
  Stinky rejoined it.
