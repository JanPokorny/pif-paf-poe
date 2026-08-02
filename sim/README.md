# Skill balance study

Simulation harness for the **skills** proposed in the root `README.md`. A skill is a single
passive modifier a player owns for the whole game.

```
node sim/test.js                                        # 22 mechanical checks on the skills
node sim/parity.js 400                                  # sim engine == index.html, ply by ply
node sim/run.js --mode general --games 1000 --iters 500  # random hands
node sim/run.js --mode synergy --games 1000 --iters 500  # hands stacked with the skill's stone
node sim/run.js --mode ctrl    --games 1000 --iters 500  # those same hands, no skills
node sim/run.js --mode pool    --games 300  --iters 500  # every skill against every other
node sim/run.js --mode general --hand 9 --only anchor,scavenger    # longer games
```

## Files

| file | what it is |
| --- | --- |
| `engine.js` | the `index.html` game logic ported to Node, plus the skills |
| `mcts.js` | the same MCTS agent as the game, with a seeded RNG and a one-ply-safe rollout policy |
| `run.js` | tournament driver (forks one worker per core) |
| `test.js` | mechanical checks: each skill does what it says, and only that |
| `parity.js` | loads the real script out of `index.html` and lock-steps it against `engine.js` |
| `results/` | raw output of every run quoted below |

## Method

Two effects are far larger than any skill and would otherwise drown it out: the hand you drew,
and who moves first. Both are controlled for.

- **Mirrored hands.** Both players get the *identical* five stones, so a difference in outcome
  is the skill and not the draw.
- **Both seatings.** Every hand is played twice, once with each player moving first. This makes
  50% the exact theoretical score of a worthless skill, whatever the hand distribution — which
  is confirmed by the `none vs none` control landing on 50.2% (n=1000) and by all six
  `--mode ctrl` rows landing in 48.6–51.6%.
- **Identical search budget** for both sides.
- Score is `(wins + 0.5·draws) / games` for the skilled player. Intervals are 95% Wilson.
- `fired` is the share of games in which the skill actually changed something (measured with
  counters that clones drop, so MCTS rollouts are not counted). A skill can be weak because it
  is small, or weak because it never triggers — this separates the two.

`parity.js` verifies the port: with both players on `none`, the simulator produces the same legal
actions and the same resulting state as `index.html` at every ply (400 playthroughs, 8582 plies,
zero divergence). These numbers describe the real game, not a lookalike.

The agent is the game's own MCTS with one change: rollouts take a winning placement when one is
available and avoid handing the opponent a line. Purely random rollouts blunder so often that
everything reads as noise. The policy is skill-agnostic and applies to both players equally.

## What the baseline game looks like

Two facts about the underlying game shape every result.

**Games are short — about 5 turns**, i.e. 2–3 stones placed per player out of 5 held.

**Moving first is worth ~80%** with random hands. This does not shrink when the per-move budget
goes from 100 to 4000 iterations, so it is a property of the game rather than of a weak AI: the
attacker builds a line faster than the defender can dismantle it, and movement stones create
threats that ordinary tic-tac-toe blocking cannot answer.

How lopsided depends almost entirely on the hand — far more than on any skill (`--mode ctrl`,
n=1000 each, no skills in play):

| hand (3 of 5 stones) | 1st player wins | 2nd player wins | turns |
| --- | --- | --- | --- |
| regular | 58.2% | 41.6% | 6.4 |
| magnet/stinky | 69.2% | 28.0% | 6.0 |
| *random (reference)* | *80.0%* | *20.4%* | *4.7* |
| shift | 79.6% | 23.6% | 4.6 |
| 2048 | 87.6% | 10.2% | 4.3 |
| rotate | 87.8% | 11.2% | 4.3 |
| chain | 96.4% | 4.8% | 4.3 |

A chain-heavy hand is a 96/5 game. That is a bigger balance problem than anything the skills do.

Because games end so early, **the board almost never fills** (2.9% of games with random hands),
so the "return a stone from a full board" endgame is nearly dead code — and with it, any skill
that lives there.

## Results

### Random hands (`--mode general`, n=1000 per row, 500 iterations/move)

| skill | score | 95% CI | as 1st | as 2nd | fired |
| --- | --- | --- | --- | --- | --- |
| **relentless** | **61.5%** | 58.4–64.5 | 79.8% | **43.2%** | 18.7% |
| telekinesis | 53.0% | 49.9–56.1 | 81.4% | 24.6% | 11.1% |
| overload | 51.9% | 48.8–55.0 | 82.6% | 21.2% | 31.7% |
| scavenger | 50.8% | 47.7–53.9 | 80.6% | 21.0% | 1.3% |
| *none (control)* | *50.2%* | *47.1–53.3* | *80.0%* | *20.4%* | – |
| lingering | 50.2% | 47.1–53.3 | 78.4% | 22.0% | 29.5% |
| whirlwind | 50.1% | 47.0–53.2 | 81.6% | 18.6% | 17.4% |
| anchor | 48.3% | 45.2–51.4 | 77.6% | 19.0% | 1.4% |
| slither | 48.2% | 45.1–51.3 | 78.2% | 18.2% | 23.4% |

### Synergy hands (`--mode synergy`, 3 of 5 stones are the skill's stone, n=1000 per row)

Control values in brackets are the same hand shape with no skills, from `--mode ctrl`.

| skill | score | 95% CI | as 1st (ctrl) | as 2nd (ctrl) | fired |
| --- | --- | --- | --- | --- | --- |
| **relentless** | **71.9%** | 69.0–74.6 | 56.8% (58.2) | **87.0% (41.6)** | 49.6% |
| **telekinesis** | **61.4%** | 58.3–64.4 | 91.2% (79.6) | 31.6% (23.6) | 59.1% |
| overload | 51.4% | 48.3–54.5 | 86.8% (87.6) | 16.0% (10.2) | 91.1% |
| lingering | 50.8% | 47.7–53.9 | 65.0% (69.2) | 36.6% (28.0) | 45.2% |
| slither | 49.6% | 46.5–52.7 | 96.6% (96.4) | 2.6% (4.8) | 65.0% |
| **whirlwind** | **45.4%** | 42.3–48.5 | 87.2% (87.8) | 3.6% (11.2) | 60.8% |

### Stronger play (`--mode synergy --iters 2000`, n=500 per row)

| skill | score @500 | score @2000 |
| --- | --- | --- |
| relentless | 71.9% | **76.6%** |
| telekinesis | 61.4% | 55.4% |
| *none (control)* | *50.2%* | *51.8%* |
| whirlwind | 45.4% | 43.8% |

### Every skill against every other (`--mode pool`, random hands, 2400 games per skill)

| skill | score | 95% CI |
| --- | --- | --- |
| **relentless** | **62.4%** | 60.4–64.3 |
| telekinesis | 50.4% | 48.4–52.4 |
| slither | 50.1% | 48.1–52.1 |
| anchor | 48.6% | 46.6–50.6 |
| overload | 48.5% | 46.5–50.5 |
| *none* | *48.1%* | *46.1–50.1* |
| lingering | 47.8% | 45.8–49.8 |
| whirlwind | 47.3% | 45.3–49.3 |
| scavenger | 46.8% | 44.8–48.8 |

## Verdicts

**Relentless is broken.** It is the only skill that is strong with a random hand (61.5%), it is
the only one that beats the whole field (62.4%), and stacking Regular stones takes it to 71.9%.
It is the one skill that gets *stronger* as both players think harder (76.6% at 2000
iterations/move), which is the signature of a real strategic advantage rather than a
search artifact.

What it does is worse than the raw number suggests: **it inverts the game.** With a
Regular-heavy hand, the second player normally wins 41.6% — with Relentless they win **87.0%**.
Moving first becomes a disadvantage. The mechanism is that the trigger condition can only be met
by the trailing player, so the skill hands out exactly one free stone, at the start, to whoever
is behind on tempo — and one free stone is worth more than the entire first-move advantage. Note
also that "not having an advantage" is trivially true on the very first turn as second player, so
this fires in essentially every game where it can (49.6%), immediately, with no setup cost.

Fixes worth simulating: require being *strictly behind* rather than level; limit the extra turn
to once per game; forbid winning on the extra turn; or make the extra placement a Regular stone
that cannot itself complete a line.

**Telekinesis is strong but not broken** at 53.0% with random hands and 61.4% with a
Shift-heavy hand — and unlike Relentless it fades as play improves (55.4% at 2000 iterations),
which suggests part of its edge is that a 12-option effect is harder for the *opponent's* search
to anticipate than a 4-option one. It is the one skill on this list that is worth tuning rather
than rewriting: restricting it to an *adjacent* row/column would likely land it near 52–55%.

**Whirlwind is a trap — it makes you worse.** 45.4% with a Rotate-heavy hand (CI 42.3–48.5,
clear of 50), and it does not recover with more search (43.8%). It fires often (60.8%) and wins
only half the games in which it fires. Rotating eight cells moves the opponent's stones as much
as your own and hands the resulting position to *them*, so a strictly-larger option set is a
strictly worse skill. Any "bigger effect" skill needs an asymmetry — e.g. the ring rotation
should skip the opponent's stones, or be usable only to move your own — or it is just a
hand-shaped foot-gun.

**Overload, Lingering and Slither are inert**, all inside the control's confidence interval in
both conditions, despite firing in 45–91% of games. They *happen* a lot and *matter* not at all.
Lingering has the most interesting shape of the three: it trades away first-player strength
(-4.2pp) for second-player strength (+8.6pp), so it is a genuine catch-up mechanic that is
roughly correctly priced. Overload's second 2048 usually undoes the first.

**Anchor and Scavenger cannot be evaluated, because they never trigger.** Anchor fired in 1.4%
of games and Scavenger in 1.3%, since both only apply on a full board, which happens in ~3% of
games. Widening the hands to nine stones does not help — the full-board rate stays at 0.1% and
games still end in 4.4 turns, because the game is decided long before anyone runs out of
placements. When Anchor does fire, the skilled player scores 7.1%, which is not the skill
backfiring but selection: the only games that reach a full board are grinds you are already
losing. Either skill would need to be rewritten to touch the early game to matter at all.

## Caveats

- The agent is fixed-budget MCTS, not a solver. Effects that depend on deep tactics may be
  understated, and skills that add branching (Telekinesis 4→12 options, Whirlwind 2→4) cost
  their owner some search quality at a fixed budget. The 2000-iteration run is the check on
  this: Relentless and Whirlwind hold, Telekinesis shrinks.
- Relentless gives its owner more *moves*, and therefore more total thinking time per game at a
  fixed per-move budget. Its edge grows with the budget rather than shrinking, so this does not
  explain the result, but it is not perfectly controlled either.
- Skills are only ever tested against `none` and against each other in `--mode pool`; specific
  skill-plus-hand combinations beyond the 3-of-5 stacking were not swept.
- The sim uses the seven stone types implemented in `index.html`. The `Swap` stone described in
  the root README is not implemented there and is not covered here.
