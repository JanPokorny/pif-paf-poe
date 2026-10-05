# Gameplay harmony: a QA pass

What a run feels like as a whole: whether fun situations occur, whether the player has real
choices and more than one way to play, where it drags, and which stones and talismans earn their
place. Written over a night of measuring (`tools/runbot.mjs`, scratch duel simulations) and
reading the rules; numbers are the bot's, a fair but plain player (150 iterations, 10% blunders).

Status: **in progress** — sections marked *(pending)* are still being measured.

## How the bot was fixed first

Two bugs made every run-bot number since the draw rule too kind:

- **Draws cost nothing to the bot.** The heart a full board costs was taken in the UI, not in
  `duelWon`, so the bot never paid it. It is in `run.js` now.
- **The Sculptor event crashed about one run in five** (the bot's event API lacked `canPolish`),
  and crashed runs were simply left out of the totals.

With both fixed, the bot wins **37–39%** of runs at heat 0 (142 of 384; 100 of 256), not the
57–62% reported before. Treat earlier balance claims in commit messages with that in mind.

## Duels

Bot against each act's ordinary enemies, with a typical hand for the act (act 1: Shift; act 2:
Shift, Magnet, Swap; act 3: five stones), 120 duels an act:

| act | won by a line | draw (full board) | lost | turns | your specials played |
|---|---|---|---|---|---|
| 1 | 39% | **24%** | 37% | 6.3 | 0.9 |
| 2 | 48% | 18% | 34% | 6.1 | 2.4 |
| 3 | 59% | 7% | 34% | 7.0 | 3.7 |

- **Act 1 is a quarter draws.** With one Shift against one or two enemy specials, a quarter of
  the first duels fill the board: plain tic-tac-toe, and now a heart each. That is the dullest
  stretch of the game, and the most punishing for a new player, who also loses most often there
  (most runs end in act 1, below).
- **Specials matter more as the run goes on**: by act 3 most duels are won by a line, and the
  board moves several times a duel. That is the game at its best.
- A duel is short — six or seven turns. A single good effect usually decides it; there is
  little room for a long plan, so the interesting choice is *which* stone, *when*.

## The run

*(pending: where runs end, by act; pouch size over a run; how often energy, not the pouch,
limits a duel's hand)*

## Talismans

Each talisman given at the very start of 256 runs (the same seeds), against **100 victories
without**. The noise is about ±8 runs; a gap under 15 says little.

| talisman | wins | Δ | |
|---|---|---|---|
| Phoenix Feather | 158 | **+58** | a second life |
| Iron Heart | 153 | **+53** | +2 max hearts |
| Second Wind | 148 | **+48** | +1 energy |
| Boundary Stone (Stinky+) | 128 | +28 | only once a Stinky is found |
| Herbal Pouch | 118 | +18 | |
| War Chest | 116 | +16 | |
| Wings | 115 | +15 | |
| Hand Bell | 114 | +14 | |
| Fuse (Firecracker+, Bumper+) | 112 | +12 | |
| Rematch Token | 110 | +10 | |
| Echo Chamber | 107 | +7 | see below |
| Lucky Coin | 105 | +5 | |
| Merchant's Badge | 104 | +4 | |
| Sled, Weathervane, Trickster's Hat, Long Arm | 97–103 | ≈0 | |
| Loyalty Card, Piggy Bank | 98–99 | ≈0 | |
| Four-Leaf Clover | **75** | **−25** | worse than nothing |

What it says:

- **Hearts are the currency that decides a run.** The three big ones are a second life, two more
  hearts, and energy. Everything that only adds gold or shop goods (Piggy Bank, Lucky Coin,
  Badge, Loyalty Card) does next to nothing: gold buys little that matters. The shop's heal and
  energy are the only purchases that move a run, and they are capped.
- **The Four-Leaf Clover hurts.** It tilts rewards towards stones of more energy — stones the run
  cannot yet bring. With 1 energy for the whole first act, a 2- or 3-energy stone is a pick that
  does nothing for a long time, and it is picked instead of one that would fit. The talisman
  reads as luck and plays as a trap. (The bot takes the strongest stone offered; a person might
  too.)
- **The + talismans** given at the start are worth nothing until their stones turn up; as found
  (they are only offered once the pouch holds one), they help — Fuse and Boundary Stone most.
  Not a problem, but Weathervane and Trickster's Hat (Waltz, Bonfire; Frog, Parrot) upgrade
  stones whose + form adds little (as `docs/STONE-FAMILIES.md` found).
- **Gold has too little to buy.** Several talismans (Piggy Bank, Lucky Coin, Badge, Loyalty Card,
  War Chest) are gold in some form, and gold mostly buys stones the energy cannot field.

### Echo Chamber (Ozvěna)

"The first stone each duel that does something does it twice." As built:

- It fires **on its own**, on whichever stone first does something — the player does not choose
  when. A Muffle, a Pebble-like stone, a minor nudge early on: the echo is spent on it.
- The repeat is **compulsory**: the second effect must be chosen even when it undoes the first
  (a Shift sliding back, a Swap swapping back, a Waltz turning on). At best it doubles a good
  move; at worst it costs a choice the player did not want to make.
- It is a **boss relic**, picked from three, against Second Wind (+1 energy — the resource the
  whole game is built on), Phoenix Feather and War Chest. Next to +1 energy it is hard to want.

Measured (200 act-2 duels, typical hands, the same duels with and without it):

- It **fired in 56%** of duels — mostly on a Shift (48 times) or a Swap (27); a duel without a
  stone that does something never sees it.
- In **27% of the times it fired, the repeat put the board back** as it was but for the new
  stone: the bot, forced to act again, undid its own move (a Shift slid back, a Swap swapped
  back) because the first move was the good one.
- It won **99 duels against 94** without it: about +2.5 points, for a boss relic.

**Verdict: not something a player would want.** It is a weak, sometimes self-defeating effect
dressed as a big one. Options, best first:
1. **Make the repeat optional** ("…may do it twice"): a Skip button in the effect choice. Keeps
   the idea, removes the undoing; still small.
2. **Let the player choose when**: once per duel, a tap on the talisman before confirming an
   effect repeats it. A real decision, and a good one to look for.
3. **Replace it** among the boss relics with something that changes how a run is built (see
   Recommendations).

## Stones

Each stone alone (the rest of the hand Pebbles) against act 2's ordinary enemies, 80 duels each,
the same duels for every stone; a + form as a glass stone. Noise about ±4.

| stone | wins /80 | energy | | stone | wins /80 | energy |
|---|---|---|---|---|---|---|
| Pebbles only | **9** | – | | Bumper+ | **36** | 1 (glass) |
| Firecracker | 32 | 3 | | Shift+ | 30 | 1 (glass) |
| Relocate | 28 | 1 | | Stinky+ | 28 | 1 (glass) |
| Stinky | 27 | 1 | | Firecracker+ | 27 | 1 (glass) |
| Waltz | 25 | 1 | | Waltz+ | 26 | 1 (glass) |
| Magpie | 25 | 3 | | Swap+ | 22 | 1 (glass) |
| Swap | 23 | 2 | | Gravity+ | 21 | 1 (glass) |
| Bumper | 22 | 3 | | Lasso+ | 21 | 1 (glass) |
| Twin | 21 | 2 | | Frog+ | 18 | 1 (glass) |
| Magnet | 17 | 2 | | Parrot+ | 16 | 1 (glass) |
| Mountain | 17 | 1 | | Bonfire+ | 11 | 1 (glass) |
| **Shift** | **15** | 1 | | | | |
| Lasso, Frog | 13 | 1 | | | | |
| Gravity | 12 | 1 | | | | |
| Parrot | 12 | 2 | | | | |
| Bonfire | **10** | 2 | | | | |
| Mind Control | **7** | 1 (glass) | | | | |
| Muffle | **6** | 1 (glass) | | | | |

- **Every special beats Pebbles** — but Muffle and Mind Control do not: they are *worse than a
  Pebble*. They act on the enemy's next stone, not the board, and a turn spent on them is a stone
  not blocking. Since Muffle now counts Pebbles, the enemy shrugs it off with one. Both are dead
  picks; they need a board effect of their own (Muffle: "…and it is placed like any stone that
  blocks"?) or to go.
- **Shift, the stone every run starts with, is weak** (15, under Waltz 25 and Stinky 27). It is
  part of why act 1 is a quarter draws. Starting with a Waltz or a Stinky would make the first
  duels livelier at the same energy.
- **Bonfire (2 energy) is the weakest stone that costs more than 1**, Parrot (2) close behind;
  **Magnet (2) is weaker than Stinky (1)**. The energy prices do not follow strength there.
- **Glass + stones are bargains**: 1 energy for the strongest effects in the game (Bumper+ 36,
  Shift+ 30). That is fine for a one-use stone, and makes glass the most interesting reward —
  but it also says the plain rares at 3 energy (Firecracker 32, Bumper 22, Magpie 25) are
  dear for what they do.
- A **+ form that adds nothing**: Waltz+, Swap+, Bonfire+, Firecracker+ win about what the plain
  stone does. Their talismans (Weathervane, Long Arm, Fuse half) are paying for little.

## The pouch: a build, not a hoard

Today the pouch holds any number of stones, and before each duel the player picks what the
energy pays for. Most of a run's decisions about stones are therefore taken *before a duel*, ad
hoc, rather than when a stone is taken: there is never a reason to refuse one.

The experiment: a pouch of at most N stones, the bot keeping its strongest when one more comes
(256 runs each, the same seeds):

| pouch | no cap | 8 | 6 | 5 | 4 | 3 |
|---|---|---|---|---|---|---|
| victories | 100 | 88 | 69 | 60 | 37 | 19 |

- A cap is a **big difficulty lever**: 6 stones costs a third of the victories, 4 nearly two
  thirds. Glass stones fill slots too, and the bot throws away by a fixed ranking, not by what
  goes together — a person building on purpose would do better, but the direction is clear.
- **It does make taking a stone a decision**, which is what is missing: a reward or a shop stone
  would now cost one already owned. The workshop (two for one) and the Transmuter would gain
  weight, and stone choices would read as a build.
- Suggested shape, if tried for real: **6 stones, glass not counted** (glass is spent anyway);
  when full, a new stone asks which to give up (or to leave it). Compensate the difficulty
  elsewhere — the act-1 draws below are the obvious place.

## Recommendations

*(pending)*
