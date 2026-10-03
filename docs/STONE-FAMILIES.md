# Stones and their + tier

Some stones have a **+ tier**: the same stone with a wider effect. A + stone comes two ways:

- **as a one-shot**: one-shot rewards and shop one-shots include + stones (a dashed outline, a
  star). Played once, it is gone from the pouch;
- **as a talisman**: "Shift+" makes every Shift you bring a Shift+. A + talisman is offered only
  for a kind of stone in your pouch.

**"Beside" always means the four squares that share a side.** A + form usually stretches from
beside to the whole row and column. (The map is the one place where "next to" counts corners.)

Measured with `node tools/lab.mjs matrix` (the stone alone, the rest Pebbles, 40 games against
each enemy of each act) and `effects` (how often a play changes nothing). A Pebble alone wins
45 / 11 / 8%.

| stone | rarity | regular | act 1 / 2 / 3 | + form | act 1 / 2 / 3 |
|---|---|---|---:|---|---:|
| Shift | uncommon | slides its row or column, wrapping | 66 / 23 / 17 | any row or column | 64 / 33 / 18 |
| Waltz | common | turns its 2×2 block clockwise | 60 / 23 / 12 | either way | 64 / 28 / 18 |
| Bonfire | common | turns the stones beside it, clockwise | 52 / 18 / 10 | either way | 51 / 19 / 10 |
| Gravity | common | everything falls down | 51 / 15 / 9 | any direction | 63 / 24 / 12 |
| Swap | uncommon | trades places with a stone beside it | 59 / 23 / 12 | with any stone | 68 / 31 / 15 |
| Lasso | common | pulls any enemy stone next to it | (measuring) | yours too | (measuring) |
| Firecracker | rare | a stone beside it back to its hand | 67 / 31 / 22 | any in its row or column | 73 / 26 / 21 |
| Bumper | rare | pushes enemy stones beside it away | 71 / 28 / 20 | in its row and column | 79 / 31 / 28 |
| Magnet | uncommon | the enemy must place beside it | 78 / 19 / 11 | in its row or column | 78 / 26 / 14 |
| Stinky | uncommon | the enemy must not place beside it | 71 / 25 / 19 | nor in its row or column | 82 / 30 / 29 |
| Frog | common | leaps a stone beside it; an enemy leapt is knocked off | 53 / 14 / 12 | the enemy goes back to hand, your Pebble takes its square | 54 / 19 / 13 |
| Parrot | common | becomes the enemy's last stone | 56 / 18 / 15 | any stone on the board | 56 / 14 / 16 |
| Mountain | common | goes anywhere, never moves | 55 / 16 / 11 | | |
| Twin | common | a Pebble on the square opposite | 58 / 19 / 9 | | |
| Magpie | rare | steals a special stone from the enemy's hand | 67 / 31 / 22 | | |

One-shots without a + tier: Relocate (uncommon; 67 / 29 / 12), Muffle (common; 58 / 23 / 11),
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
- Rarity follows the measured strength: Stinky and Shift moved to uncommon, Bumper to rare,
  Bonfire, Twin and Parrot to common.

Removed: Whirl (Bonfire in the centre), Undo, Pluck (stones back to the hand, as Firecracker),
Bribe, Turncoat (a stone changing sides), Beacon (Magnet+), Mirror (Swap+), Nudge (Lasso+),
Rehearse (Parrot+), 2048 (Gravity+).
