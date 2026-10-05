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

*(pending: each talisman given at the start of 256 runs, against the baseline of 39%)*

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

*(pending)*

## The pouch: a build, not a hoard

*(pending: the experiment with a pouch of at most N stones)*

## Recommendations

*(pending)*
