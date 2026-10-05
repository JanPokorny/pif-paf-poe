# Gameplay harmony: a QA pass

What a run feels like as a whole: whether fun situations occur, whether the player has real
choices and more than one way to play, where it drags, and which stones and talismans earn their
place. Written over a night of measuring (`tools/runbot.mjs`, scratch duel simulations) and
reading the rules; numbers are the bot's, a fair but plain player (150 iterations, 10% blunders).

Status: first pass complete (see the end).

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

256 runs, heat 0: 159 reach act 2, 117 act 3, 100 win.

- **38% of runs end in act 1**, and most of those to the act's bosses (53, more than half of
  them to the risen boss) and to the boss's lines on the map (33).
- **The boss's lines on the map are the biggest source of lost hearts** in every act (1.5 a run
  in act 1, 0.9 in act 2, 0.7 in act 3). The map game is where a run is decided as much as in
  the duels — which is good: it is the part with the most real choice (where to step, whose line
  to break).
- Ordinary act-1 enemies (Rock, Otter, Pip) each take half a heart a run: mostly draws.
- Energy where runs end: 1.5 in act 1, 4.4 in act 2, 10 in act 3. Act 1 is played on one
  energy almost throughout — one common stone a duel.

## Choice, and ways to play

- **On the map**, choices are real and readable: a line of your own against breaking the boss's,
  a shop or a fight, the lair now or later. This is the strongest part of the design.
- **Before a duel**, the choice is which stones the energy pays for. With one energy (all of act
  1) it is no choice at all — the Shift, or a glass stone. From act 2 on it is a good puzzle:
  the enemy's stones and condition are shown, and the right counter differs.
- **Taking stones** is rarely a choice: the pouch is unlimited, so the answer is "the strongest
  one". Glass stones are the exception — a one-use + stone at 1 energy is a real temptation.
- **Ways to play**: restriction stones (Stinky, Magnet) and board movers (Waltz, Swap, Bumper)
  are both strong and play differently — "deny squares" against "rearrange the board". That is
  two styles. What does not exist yet is a style built on talismans: most talismans are flat
  bonuses (hearts, gold, energy); only Wings and the + talismans change how stones play, and the
  materials (marble against restrictions, gold for money) are the closest thing to a build.
- **Dull moments**: the act-1 draws; duels against an enemy with no specials where a single
  Shift decides little; events whose options are "pay gold for a small thing" (gold buys little,
  below); a full board that ends in a heart lost after a duel that felt won.
- **Fun moments** that do occur: a Firecracker or Bumper blowing a stone out of a line that was
  one move from winning; a Waltz turning the boss's two into your three; Open Hands, where the
  enemy's stones are yours too; the lair opening on the map; the risen boss by moonlight.

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
- **Shift looks weak here** (15, under Waltz 25 and Stinky 27) — but against act 2. As the
  *starting* stone over whole runs it is the best of the three (below, Recommendations): keep it.
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

## Heat, and the map's weight (second pass)

256 runs each, the same seeds. Heat levels add up (heat 3 has the first three's rules too).

| | victories |
|---|---|
| heat 0 | 100 |
| heat 1 — enemies think harder | 90 |
| heat 2 — shops a quarter dearer | 82 |
| heat 3 — one heart fewer | **42** |
| heat 4 — elites bring an extra stone | 53 |
| heat 5 — enemies never blunder | 22 |

- **The steps are uneven.** Heat 1 and 2 are gentle (−10, −8), heat 3 halves the wins (one heart
  out of six), heat 4 adds nothing measurable (53 against 42 is noise), heat 5 halves again.
  For a ladder, swap 3 and 4 and make the "extra stone" step bite — or make heat 3 cost less
  than a whole heart (a heart less from campfires, say).
- **A heart is worth about a fifth of the runs.** Heat 3's single heart costs 40 victories in
  256; Iron Heart's two give 53. Every heart lost or saved anywhere is the biggest thing.

What the boss's lines on the map weigh (each costs a heart today):

| a boss line costs | victories |
|---|---|
| nothing | **186** |
| 1 heart (today) | 100 |
| 2 hearts | 46 |

- **The map's boss lines are the largest single source of difficulty** — larger than any heat
  level: without them the bot wins nearly twice as often. That is a good thing in itself (the
  map is the game's best part), but it means most of a run's danger comes from the map, not the
  duels. Balance work should start here: the boss's chance to block (`MAPCFG.sees`), how often a
  boss line is possible at all, and how the bot (and a player) is warned — now that the dashed
  danger circles are gone, a player sees less of it coming than the bot does.

### The boss always blocks (a dead setting)

`MAPCFG.sees` is meant to be the chance the boss blocks your two in a row (0.75). Varying it
from 0 to 1 changes nothing (99, 102, 102, 101 victories in 256). In `bossMark` the "spoil
yours" weight already gives a square on your two +20, more than any square's value plus its
noise, so the boss blocks **every time** whatever `sees` says. In practice a lair opens only
through a fork (two lines at once), which is what the rocks are laid out to make rare.

Tried (behind an experiment switch, `MAPCFG.strict`, off): with the +20 applied only when the
boss `sees`, the bot wins 96, 97, 97 at `sees` 0.9, 0.75, 0.5 — no change either. **Blocking
your lines is not what limits a run**: the lair opens often enough either way, and runs end on
hearts — the boss's own lines and the boss duels. So easing the map means its *lines against
you* (their damage, or how readily the boss builds them), not its blocks. The setting can go,
or be wired up as intended for a heat level that does not matter much.

## Events (second pass)

Read against what the measurements say a run runs on — hearts first, energy second, gold a
distant third — many events offer a choice with an obvious answer:

| event | the choice in practice |
|---|---|
| Meditating Monk | **Donate 40 gold: +1 energy** — the best deal in the game (Second Wind, the same +1, is worth +48 runs in 256). Never refused when affordable. Breathe deeply (energy for a max heart) is the one real dilemma. |
| Rickety Bridge | lose a heart for 50 gold: never worth it → always "Go around". |
| A Pickpocket | lose 20 gold, or a duel risking a heart: losing the gold is always right. |
| Wishing Fountain | a stone for a heart, or 2 hearts for 20 gold: the heal wins. |
| Wishing Well | heal 2, or 25–50 gold: the heal wins. |
| Storyteller | heal 1 *and* a glass stone, or 20 gold: Listen wins. |
| Gambler's Table | gold for gold, at even odds: no stakes worth having. |
| Wayside Shrine, Duplicating Pond, Night Owl, Hermit, Chest | real trade-offs (a max heart for a strong stone; a stone or a heal; a duel for a talisman) — the good ones. |
| Stonemason, Transmuter, Trader, Library, Sculptor | "do a thing to your stones": fine, and they would matter more with a pouch cap. |

So the **events are only as interesting as gold is valuable**. Either gold needs things worth
buying (Recommendations, 5), or the gold options should become something else (a stone, a
talisman, an energy at a price in hearts).

## Recommendations

Tried with the bot where it could be (256 runs each, same seeds; today: 100 victories):

| start | victories |
|---|---|
| a Shift, 1 energy (today) | 100 |
| a Waltz, 1 energy | 79 |
| a Stinky, 1 energy | 66 |
| a Shift, **2 energy** | **154** |
| a Shift and a Waltz, 2 energy | 158 |

And the two levers together (third pass):

| | victories | mean act reached |
|---|---|---|
| today: 1 energy, any pouch | 100 | 2.08 |
| **2 energy, a pouch of 6** | **98** | **2.33** |
| 2 energy, a pouch of 5 | 84 | 2.22 |

**2 energy with a pouch of 6 keeps today's difficulty but moves it**: runs get further (act 1
stops being the wall), lose more later, and every stone taken has to earn a slot. This is the
single change most worth trying in play.

In order of how much they would change:

1. **Act 1 needs a second stone in duels.** One energy for the whole first act is why a quarter of
   its duels are plain tic-tac-toe and why most runs die there. Starting with 2 energy makes the
   bot win half again as often — too much alone, but **with a pouch of 6 the difficulty is back
   where it is today** and spread over the run (table above).
   Keep the Shift as the starting stone; another start stone tested worse.
2. **Rework the dead stones.** Muffle and Mind Control are worse than a Pebble. Give each a
   board presence or cut them. Bonfire and Parrot (2 energy) and Magnet (2, weaker than Stinky at
   1) are overpriced.
3. **Echo Chamber**: make the repeat optional, or let the player choose when — or replace it
   among the boss relics. As built it undoes itself a quarter of the time it fires.
4. **Four-Leaf Clover**: drop "stones of more energy turn up more often" (it fills an early pouch
   with stones the run cannot field); four choices alone is a fine common talisman.
5. **Give gold something to buy.** Half the talismans are gold in some form and gold barely
   matters. Ideas: a shop service that removes or upgrades a stone (glass → plain, a +), more
   energy for sale at a rising price, a heal that is not capped at two.
6. **A pouch cap (6, glass not counted)** to make taking a stone a decision — and a lever to
   balance a richer act 1 against. It needs a "which one goes?" choice in the UI.
7. **+ forms that add nothing** (Waltz+, Swap+, Bonfire+, Firecracker+): widen them or drop them
   from their talismans, so a + talisman always means something.
8. **More talismans that change how stones play** (like Wings), fewer flat bonuses: e.g. "your
   restriction stones also apply to you" (a defensive build), "glass stones are not spent the
   first time" (a glass build), "marble stones pay 5 gold when placed".

## Not done tonight

- The map's own parameters (rock density, the boss's chance to block) were not varied — only
  the damage of a line.
- A person plays differently from the bot (it picks stones by a fixed ranking and drops by the
  same); the pouch-cap and Clover findings in particular should be felt in play before acting.

Status: **done** for this pass.
