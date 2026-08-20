# 2026-08-20 — which arena, and the fewest players for it

The rules pair each arena with a headcount — the 6x6 at about twelve a side, the 9x9 at about
thirty — and never said what the boundary was or what goes wrong on the wrong side of it. This
record measures both arenas at every size from eight to thirty a side and answers one question:
**the 9x9 wants twenty a side at the least, twenty-four to give a player as much of a game as the
6x6 does at its own size, and thirty is what it was tuned for.**

The sweep is `campaign.js` at 1440 rounds a cell, two seeds summed, on the settled rules; the
campaign lengths are 120 campaigns a cell played to each arena's own target. Nothing here is a new
instrument, and the interesting columns are all ones earlier records already relied on.

## What the sweep says

| a side | 6x6: pts/r | play% | unmet | decis% | mk/zones | life | 9x9: pts/r | play% | unmet | decis% | mk/zones | life |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 2.86 | 64.3% | 49.8% | 36.6% | 3.48/4 | 1.8 | 7.95 | 49.3% | 62.2% | 34.7% | 4.89/9 | 2.9 |
| 10 | 2.92 | 66.4% | 46.7% | 33.6% | 3.64/4 | 1.7 | 9.25 | 55.2% | 56.3% | 33.9% | 5.09/9 | 2.7 |
| **12** | 2.96 | **68.1%** | **45.8%** | 30.5% | 3.67/4 | 1.6 | 9.65 | 57.8% | 53.2% | 29.5% | 5.22/9 | 2.7 |
| 14 | 2.90 | 70.2% | 44.0% | 29.5% | 3.74/4 | 1.6 | 9.99 | 61.3% | 49.6% | 28.9% | 5.19/9 | 2.6 |
| 16 | 2.99 | 72.0% | 42.4% | 27.0% | 3.76/4 | 1.5 | 10.51 | 62.1% | 48.7% | 24.0% | 5.28/9 | 2.6 |
| **20** | 2.98 | 72.9% | 41.3% | 21.8% | 3.77/4 | 1.5 | 11.36 | **64.4%** | **46.3%** | 20.3% | 5.28/9 | 2.6 |
| 24 | 3.10 | 74.4% | 38.8% | 19.0% | 3.81/4 | 1.5 | 11.20 | 66.3% | 44.8% | 16.1% | 5.35/9 | 2.5 |
| **30** | 3.07 | 76.5% | 36.2% | 16.0% | 3.83/4 | 1.5 | 11.89 | 68.2% | 43.0% | 13.2% | 5.33/9 | 2.5 |

`play%` is the share of a team that fights a duel in a round; `unmet` the share of defenders
standing where no attacker came, which is what committing first costs; `decis%` the chance a
player's own duel turns out to decide its space; `mk/zones` the marks a round against the zones
available to place them in; `life` how many rounds a mark survives before a clear takes it.

## The 9x9 costs the player, and the price falls with the headcount

At **every** headcount the 6x6 gives a player more: more duels, fewer defenders left standing in an
empty space, a better chance their own game mattered. That is not a fault in the 9x9 — it is what a
bigger arena is: 81 spaces to cover instead of 36, with the same people.

So the minimum is where the price has come down far enough to be worth paying, and the natural line
to draw it at is the 6x6 at its own designed twelve a side: **68.1% playing, 45.8% of defenders
unmet.** The 9x9 crosses the second at **twenty a side** (46.3%) and comes within two points of the
first at **twenty-four** (66.3%). Below twenty it is not close: at twelve a side on the 9x9, two
players in five never fight in a round and over half the defence stands where nobody comes, against
a third and 46% on the 6x6 with the same people.

## What the 6x6 cannot do, which is why the 9x9 exists

**Grow.** From eight a side to thirty, the 6x6 scores **2.86 → 3.07** points a round: quadruple the
players, seven per cent more game. The 9x9 goes **7.95 → 11.36** by twenty a side, and only 5% more
from there to thirty. Each arena has a headcount where it stops noticing the people you brought,
and the 6x6's is somewhere around twelve.

**Leave anything to choose.** The 6x6 claims **3.83 of its 4** zone-marks a round at thirty a side —
every zone, in 83% of rounds — and a mark survives **1.5** rounds. There is no question about where
to attack, because the answer is everywhere, and nothing built lasts to the next round. The 9x9 at
the same headcount claims **5.33 of 9** and its marks live **2.5** rounds, which is the positional
game the squared scoring was written for: rounds that score more than one line are **91%** of
scoring rounds on the 9x9 against **49%** on the 6x6.

So the two arenas fail in opposite directions, and twenty a side is where the failures cross.

## The campaign length is not the constraint

Played to each arena's own target, 120 campaigns a cell:

| a side | 6x6 to 40 | 9x9 to 170 |
|---|---|---|
| 8 | 24.7 | 31.6 |
| 12 | 22.7 | 28.2 |
| 16 | — | 26.6 |
| 20 | 23.2 | 26.8 |
| 24 | — | 25.6 |
| 30 | 21.6 | 25.3 |

A thin 9x9 runs long rather than badly — 31.6 rounds at eight a side against 25.3 at thirty — so a
group that wants the big arena anyway can have it and pay in time, or drop the target. That is a
choice worth knowing about, and it is not the reason for the minimum: the reason is the two columns
above.

## Open

- **The minimum is a criterion, not a cliff.** Every curve here is monotonic: nothing breaks at
  nineteen a side and works at twenty. The number comes from choosing the 6x6-at-twelve experience
  as the line worth matching, and a group that cares more about the positional game than about
  everybody getting a duel could reasonably run the 9x9 at sixteen.
- **The 9x9's target was not re-fitted for thin turnouts.** 170 is the number for thirty a side; the
  lengths above say a smaller group wants a smaller target, and nobody measured which.
- **Nothing above twenty a side on the 6x6 or thirty on the 9x9 was measured**, so the upper end of
  each range is where the sweep stopped rather than where the arena does.
- **The physical side is unmeasured and may bind first.** 81 spaces have to be hung, staffed and
  walked between; forty players over 81 spaces is two spaces a player, against the 6x6's one and a
  half at its own size. Whether that is an evening or a hike is not something `campaign.js` knows.
