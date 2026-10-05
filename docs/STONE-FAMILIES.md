# Stones and their + tier

Some stones have a **+ tier**: the same stone with a wider effect. A + stone comes two ways:

- **in glass**: glass rewards and the shop's glass shelf include + stones (a dashed outline, a
  + in the corner). Glass costs 1 energy. Played once, it is gone from the pouch;
- **as a talisman**: each + talisman covers a group of stones, and every stone of those kinds you
  bring plays as its + form. It is offered only when your pouch holds one of them.

| talisman | stones | rarity |
|---|---|---|
| Weathervane (Korouhev) | Waltz, Bonfire | uncommon |
| Sled (Saně) | Shift, Gravity | uncommon |
| Long Arm (Dlouhá ruka) | Swap, Lasso | uncommon |
| Boundary Stone (Mezník) | Stinky | uncommon |
| Fuse (Doutnák) | Firecracker, Bumper | rare |
| Trickster's Hat (Šibalův klobouk) | Frog, Parrot | common |

The groups pair stones by what they do and by how much their + form adds: the two strongest
+ forms (Firecracker's and Bumper's reach) make the one rare talisman, the two that add least
(Frog's and Parrot's) the one common.

**"Beside" always means the four squares that share a side.** A + form usually stretches from
beside to the whole row and column. (The map is the one place where "next to" counts corners.)

Measured with `node tools/lab.mjs matrix` (the stone alone, the rest Pebbles, 40 games against
each enemy of each act) and `effects` (how often a play changes nothing). A Pebble alone wins
45 / 11 / 8%.

| stone | rarity | regular | act 1 / 2 / 3 | + form | act 1 / 2 / 3 |
|---|---|---|---:|---|---:|
| Shift | common | slides its row or column, wrapping | 66 / 23 / 17 | any row or column | 64 / 33 / 18 |
| Waltz | common | turns its 2×2 block clockwise | 60 / 23 / 12 | either way | 64 / 28 / 18 |
| Bonfire | uncommon | turns the stones beside it, clockwise | 52 / 18 / 10 | either way | 51 / 19 / 10 |
| Gravity | common | everything falls down | 51 / 15 / 9 | any direction | 63 / 24 / 12 |
| Swap | uncommon | trades places with a stone beside it | 59 / 23 / 12 | with any stone | 68 / 31 / 15 |
| Lasso | common | pulls any enemy stone next to it | 62 / 15 / 15 | yours too | 66 / 25 / 12 |
| Firecracker | rare | a stone beside it back to its hand | 67 / 31 / 22 | any in its row or column | 73 / 26 / 21 |
| Bumper | rare | pushes enemy stones beside it away | 71 / 28 / 20 | in its row and column | 79 / 31 / 28 |
| Magnet | uncommon | the enemy must place beside it | 78 / 19 / 11 | (removed: narrowed the enemy less) | 78 / 26 / 14 |
| Stinky | common | the enemy must not place beside it | 71 / 25 / 19 | nor in its row or column | 82 / 30 / 29 |
| Frog | common | leaps a stone beside it; an enemy leapt is knocked off | 53 / 14 / 12 | the enemy goes back to hand, your Pebble takes its square | 54 / 19 / 13 |
| Parrot | uncommon | becomes the enemy's last stone | 56 / 18 / 15 | any stone on the board | 56 / 14 / 16 |
| Mountain | common | never moves (went anywhere when measured) | 55 / 16 / 11 | | |
| Twin | uncommon | a Pebble on the square opposite | 58 / 19 / 9 | | |
| Magpie | rare | steals a special stone from the enemy's hand | 67 / 31 / 22 | | |

Glass stones without a + tier: Relocate (uncommon; 67 / 29 / 12), Muffle (common; 58 / 23 / 11),
Mind Control (common; 48 / 15 / 11 — the stone named now works as usual, so it is close to a
Pebble).

## Notes

- **Stinky+ and Bumper+ are the strongest + forms** (Stinky+ in the centre leaves only the
  corners). Both come from uncommon/rare stones; watch them in play.
- **Bonfire+, Frog+ and Parrot+ add little** over their regular forms as measured. Bonfire beside
  the centre has only four squares to turn, so "either way" rarely matters; Frog seldom has a
  stone to leap (it does nothing in about 60% of plays); Parrot copies a Pebble whenever that was
  the enemy's last stone.
- **Gravity** does nothing in 41% of plays (everything is already down); Gravity+ is the old 2048.
- **Rarity is power, and also the pool a stone is found in.** Moving Shift and Stinky to
  uncommon (2 energy) by strength took the run bot from 27 to 13 wins in 96: a run starts with
  1 energy, and those two are what carries act 1. Moving Bonfire, Twin and Parrot to common
  filled the common pool with weak stones. So only Bumper moved (to rare).
- **Lasso** first pulled only from its row or column, and did nothing in 88% of plays; it pulls
  any enemy stone again (25% duds).
- **Clinch** counts only squares beside the boss's stones: a diagonal is blocked with a mover or a
  restriction, not by placing. (For a while a square blocking its line counted too; dropped.)
- **Run bot** (`node tools/runbot.mjs --runs 96`): 35 victories in 96, as before the + tier
  (29–34).

Removed: Whirl (Bonfire in the centre), Undo, Pluck (stones back to the hand, as Firecracker),
Bribe, Turncoat (a stone changing sides), Beacon (Magnet+), Mirror (Swap+), Nudge (Lasso+),
Rehearse (Parrot+), 2048 (Gravity+).
