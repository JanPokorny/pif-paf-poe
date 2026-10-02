# Stone report

Measured overnight with `tools/lab.mjs`: about 190,000 AI-vs-AI duels on the real
engine. The player (X) is the MCTS brain at 250 iterations with a 5% blunder rate,
a fair, careful player. The enemy (O) opens, as in the game, with its real hand,
search depth and conditions as `prepareDuel` rolls them. Raw numbers are in
`tools/lab-out/*.json`. Rerun any table with `node tools/lab.mjs <experiment> --games N`.

Noise: cells with 60 games are ±6 points, 150–400 games ±3–4. Small differences
are not findings. Everything below is either a large gap or a mechanism I
confirmed by hand.

**The baseline to read every table against.** Pure tic-tac-toe is a draw, and a
full board goes to the player. So the player wins by *blocking*, not by building
lines. With exactly four stones the player has to place every one of them for
the board to fill. Anything that costs the player a stone on the board, or
gives the enemy one back, works against that.

---

## 1. Headline findings

1. **Bribe is broken.** It is the strongest stone in every act and against every
   enemy, and it is almost never wasted. It also carries every pair and every
   boss build it appears in.
2. **Firecracker is a trap.** In a four-stone hand it is *worse than a Pebble*:
   3% wins against a Pebble's 26%. It burns itself up, so the player is one
   stone short of a full board and can no longer win by filling it.
3. **The enemy's opening Magnet decides duels.** With only Pebbles, the player
   wins 69% against Pebbles, 26% against a Shift hand and **0%** against
   Magnet+Shift. No single stone except Bribe, Turncoat and Swap gets above
   10% there.
4. **Many stones fizzle most of the time.** Overtake does nothing in 92% of
   plays, Lasso 87%, Rehearse 82%, Twin 82%, Frog 72%, Bumper 66% and
   Parrot 59%.
5. **Several undead boss phases change nothing.** The Clockwork Colossus's
   second phase is identical to its first (`rules2` equals `rules`). The
   Carpenter's added Patience has no measurable effect (83% → 83%).
6. **Difficulty is out of order.** Magpie Meg (act 2, normal) is harder than
   both act-2 elites. Stinky Skunk (act 1, normal) is harder than the act-1
   elite Twins. Summit Yeti (act 3) is the easiest enemy in the game, at 91%.

---

## 2. Stone power

### Against three standard enemy hands (one stone + 3 Pebbles, 300 games each)

| stone | vs 5 Pebbles | vs Shift + 4 | vs Magnet + Shift + 3 |
|---|---:|---:|---:|
| **bribe** | 99% | 98% | 25% |
| turncoat | 86% | 64% | 31% |
| swap | 90% | 63% | 28% |
| pluck | 95% | 81% | 0% |
| stinky | 97% | 65% | 1% |
| beacon | 97% | 59% | 2% |
| shift | 88% | 53% | 4% |
| magpie | 70% | 70% | 3% |
| rotate | 87% | 45% | 8% |
| magnet | 95% | 36% | 0% |
| relocate | 81% | 42% | 3% |
| nudge | 71% | 48% | 1% |
| mountain | 70% | 46% | 0% |
| lasso | 79% | 34% | 0% |
| whirl | 72% | 41% | 0% |
| parrot | 70% | 40% | 3% |
| mirror | 73% | 34% | 0% |
| 2048 | 58% | 40% | 7% |
| muffle | 70% | 32% | 0% |
| twin | 78% | 23% | 0% |
| mind-control | 70% | 29% | 0% |
| rehearse | 70% | 26% | 0% |
| *pebble* | *69%* | *26%* | *0%* |
| flip | 63% | 29% | 0% |
| bumper | 56% | 32% | 0% |
| frog | 39% | 21% | 5% |
| overtake | 36% | 20% | 0% |
| **firecracker** | **2%** | **3%** | 0% |

Frog, Overtake and Firecracker score *below a Pebble*. Flip, Bumper, Rehearse,
Mind Control and Twin are no better than one.

### Against the real cast of each act (matrix, 60 games per stone per enemy)

Each enemy is played with its real hand and search, in a hand of the act's size
(4 / 5 / 6 stones). The figure is the mean win rate across that act's normal and
elite enemies.

| act 1 | | act 2 | | act 3 | |
|---|---:|---|---:|---|---:|
| bribe | 84% | bribe | 62% | bribe | 55% |
| magpie | 59% | magpie | 34% | magpie | 38% |
| beacon | 57% | pluck | 33% | beacon | 32% |
| magnet | 53% | beacon | 30% | pluck | 32% |
| pluck | 52% | turncoat | 25% | turncoat | 24% |
| shift | 46% | relocate | 24% | stinky | 22% |
| swap | 45% | stinky | 24% | magnet | 22% |
| relocate | 44% | magnet | 23% | relocate | 21% |
| … | | … | | … | |
| *pebble* | *25%* | *pebble* | *10%* | *pebble* | *13%* |
| firecracker | 21% | | | rehearse | 10% |

### Best first pick

Rewards never offer one-shot stones. Bribe and Pluck only come from shops,
events and crafting. So among what a reward can actually offer in act 1:

1. **Magpie** (rare): 59%. It needs skill, though (see §5).
2. **Beacon** (uncommon): 57%. It is also the easiest stone to play well.
3. **Magnet** (common): 53%. It is the best of what you see most often.
4. **Shift** (46%) and **Swap** (45%).

Avoid Firecracker (21%, below a Pebble's 25%), Rehearse, Bumper, Frog,
Mind Control and Overtake. All of them are within a few points of a Pebble.

### What a fifth slot changes (300 games each, vs Shift)

Going from four stones to five barely moves any stone (±5 points, i.e. noise),
with one exception: **Firecracker goes from 3% to 28%**. The fifth stone
replaces the one it burns. So Firecracker belongs in act 2 or later, or with
Satchel / More Slots, but the game never tells you that.

---

## 3. What stones actually do (effects, 400 games each)

Mixed hands (the stone, a random second stone, 3 Pebbles) against
Magnet + Shift + Rotate.

- **Played:** how often per duel the AI chose to place it at all.
- **Dud:** the board, the enemy's hand and what the enemy must play were all
  unchanged afterwards.
- **Choices:** the average number of effect options the player had to pick
  from.
- **Bites:** the share of enemy turns, while the restriction stood, on which it
  actually removed squares.

| stone | played | dud | choices | bites |
|---|---:|---:|---:|---:|
| overtake | 0.50 | **92%** | – | |
| lasso | 0.79 | **87%** | – | |
| twin | 0.78 | **82%** | – | |
| rehearse | 0.71 | **82%** | 0.5 | |
| frog | 0.73 | **72%** | – | |
| bumper | 0.81 | **66%** | – | |
| parrot | 0.71 | **59%** | 1.3 | |
| relocate | 0.38 | 50%¹ | **8.3** | |
| mirror | 0.62 | 40% | 2.2 | |
| rotate | 0.70 | 27% | 1.9 | |
| flip | 0.58 | 25% | 4.0 | |
| whirl | 0.76 | 22% | 2.0 | |
| turncoat | 0.76 | 19% | – | |
| firecracker | 1.00 | 19% | – | |
| shift | 0.79 | 18% | 4.0 | |
| 2048 | 0.75 | 18% | 4.0 | |
| nudge | 0.67 | 17% | **5.0** | |
| swap | 0.74 | 8% | 1.3 | |
| magpie | 0.93 | 4% | 1.6 | |
| bribe | 0.94 | 2% | – | |
| stinky | 0.83 | – | – | 86% |
| magnet | 0.86 | – | – | 73% |
| beacon | 0.87 | – | 2.0 | 58% |
| muffle | 0.58 | –² | – | |

¹ Relocate moves the stone it just placed half the time, which amounts to
"place a Pebble anywhere".
² Muffle always silences the enemy's next stone, but **45% of the time that
stone is a Pebble**: the enemy sees it coming and plays something it doesn't
mind losing.

---

## 4. Enemies

The player holds a typical hand for the act (what the rewards would have
offered by then, topped up with Pebbles). 200 games per enemy.

| act | toughest | | easiest | |
|---|---|---:|---|---:|
| 1 | Lord of Stench (elite) | 38% | Bumbling Hamster | 83% |
| 1 | Stinky Skunk | 45% | Pip the Novice | 76% |
| 1 | Falling Apple | 46% | Grumbling Rock | 73% |
| 1 | The Twins (elite) | 48% | | |
| 2 | **Magpie Meg** (normal!) | **34%** | Leapin' Frog | 87% |
| 2 | Hollow Witch (elite) | 42% | Bumper Bee | 86% |
| 2 | Stone Golem (elite) | 44% | Quarry Miner, Lasso Lou | 83% |
| 3 | Captain Polly (Open Hands) | 39% | **Summit Yeti** | **91%** |
| 3 | Grand Tactician (elite) | 42% | Firecracker Fay | 75% |
| 3 | Tile Bot 2048 | 56% | The Jester | 67% |
| events | Night Owl | 41% | Pickpocket 78%, Hermit | 73% |

Why they are tough:

- **Magpie Meg steals your best stone.** She is the only enemy against which
  Bribe does *worse* than a Pebble (−12). Restrictions and Mountains, which
  she can steal but gains little from, are the counter.
- **Captain Polly** plays with Open Hands, which lets her use your specials.
- The enemies built on restrictions (Stinky, Magnet, Beacon) are the tough
  ones in every act. The movers (Bumper, Lasso, Frog, the Yeti's Mountain and
  Bumper) are pushovers, the same stones that fizzle when you play them.

### Bosses: two phases each, by player build (100 games each)

| boss | phase 1 | undead | needs |
|---|---:|---:|---|
| **Grandmaster** (Tactics) | 33% | **12%** | Restrictions and few movers: movers 15%, Pebbles 72% (!), restrictions 85% in phase 1. Undead: only one-shots (85%) |
| Scarecrow (Reserved) | 74% | 24% | Restrictions (88%); movers fall to 36% when undead |
| Old Oak (Clinch) | 87% | 37% | Restrictions (84–96%); Pebbles only 1% when undead |
| Mirror Knight (Spy) | 90% | 56% | Undead: Magnet + Shift drops to 38% (Spy picks your direction). Beacon + Stinky 92% |
| Twin Kings (Double Time) | 64% | 63% | Magnet + movers (96–99%). Beacon + Stinky is 98% in phase 1 but **6%** undead |
| Clockwork Colossus (Column) | 68% | 68% | Restrictions *and* movers together (99%). Either alone: 18% / 38% |
| Carpenter (Elbow) | 83% | 83% | Movers (90%). Beacon + Stinky only 44%: row/column pressure doesn't block L-shapes |

- **The boss that needs a special build is the Grandmaster.** He picks which
  stone you play, so a pouch of movers gets turned against you. A pouch of
  restrictions, or even plain Pebbles, does far better. That is a lovely
  inversion, but the game doesn't hint at it.
- **The Colossus** is the other build check: it needs both kinds at once.
- **Two Mountains and Pebbles-only lose to every undead boss (0–2%).** That is
  fine: undead phases should demand a build.
- **Pluck + Bribe beats nearly every boss at 94–100%.** Bosses hold only
  Pebbles, so stones that work on the enemy's stones on the board are never
  dead against them. Magpie, Parrot and Mind Control, on the other hand, are
  *always* dead against bosses: there is nothing to steal, copy or name but a
  Pebble.

### Conditions (typical act-2 hand vs Magnet + Shift + Rotate, 400 games)

| condition | win |
|---|---:|
| Gravity | 52% |
| none | 48% |
| Hollow (no centre) | 44% |
| **Open Hands** | **28%** |

Open Hands is a large penalty: the enemy gets to play your stones too, and it
is the better player of the two. Gravity is neutral.

---

## 5. Skill: which stones need a good player

Win rates vs Shift for a weak player (60 iterations, 25% blunders) against a
strong one (600 iterations, no blunders).

| needs skill | weak → strong | | plays itself | weak → strong |
|---|---:|---|---|---:|
| magpie | 24 → 90 | | **bribe** | 81 → 100 |
| swap | 23 → 77 | | **beacon** | 55 → 40³ |
| mountain | 15 → 66 | | magnet | 19 → 35 |
| turncoat | 27 → 72 | | parrot | 21 → 43 |
| whirl | 16 → 58 | | overtake | 11 → 33 |
| 2048 | 9 → 48 | | firecracker | 3 → 7 |

³ Within noise of "no gap". Either way Beacon is as good in a beginner's hand
as in an expert's.

Magpie, Swap and Mountain are expert stones: strong when played well, near
Pebbles otherwise. Bribe and Beacon are strong for anyone. Those are the ones
to offer early or to new players.

---

## 6. Pairs (one pair + 2 Pebbles vs Magnet + Shift + Rotate, 120 games each)

The best pairs all contain Bribe: Bribe + Bribe 94%, Magnet + Bribe 93%,
Magpie + Bribe 91%. Without Bribe:

| pair | win |
|---|---:|
| beacon + magpie | 68% |
| magpie + magpie | 67% |
| turncoat + magpie | 59% |
| magpie + pluck | 48% |
| swap + magpie | 45% |
| turncoat + turncoat | 38% |
| shift + turncoat | 33% |

Anti-synergies at 0–1%:

- Twin with anything: Twin + Twin, Flip, Mountain, Stinky or Beacon.
- Two Flips.
- Two Mountains.
- Mountain + Pluck.
- Pluck + Pluck.

Pluck is excellent alone against a Shift hand (81%) but useless against an
opening Magnet. A plucked Magnet is simply placed again.

---

## 7. Too complex, not intuitive, or irrational

### Broken or irrational

- **Bribe**: a two-stone swing (one more for you, one fewer for them) that is
  almost never wasted. It can be played anywhere and targets anything but the
  centre.
  *Suggestion:* "An enemy **Pebble beside it** becomes yours." It stays good,
  needs placement, and fizzles against special stones.
- **Firecracker**: burning itself up means you lose your full-board win in a
  four-stone hand. A rare stone that plays below a Pebble feels like a bug.
  *Suggestion:* it stays as a Pebble ("leaves a scorched Pebble"), or it goes
  back to your hand with the stone it blew.
- **Your hand decides the enemy's opening.** The enemy sees your stones (the
  duel is open information), and it opens to dodge them:
  - Holding Overtake, the enemy *never* opens in the centre (0 of 100 duels,
    against Shift + Pebbles).
  - Holding Twin, it opens in the centre *every* time (150 of 150) to block it.

  So any stone whose condition the opener controls is dead against an attentive
  enemy. That explains Overtake's 92% and Twin's 82% duds.
- **Overtake**: it can only ever hit the centre, so the enemy simply keeps out
  of it. Making it convert the centre stone instead changes nothing (measured,
  §8). *Suggestion:* drop it, or give it a target the enemy can't avoid (e.g.
  "the enemy's last-placed stone goes back to their hand").
- **Twin**: it needs an empty centre, and the enemy fills the centre at once.
  *Suggestion:* "opposite it across the board, if that square is empty",
  without the centre condition: 35% → 48% in act 1 (§8).
- **Colossus's undead phase** has the same rules as phase 1. Give it a
  `rules2`, e.g. `['column', 'headstart']`.
- **Carpenter's undead Patience** never matters: Elbow games almost never
  fill. Something like Head Start would bite.
- **Restriction asymmetry.** The enemy's opening Magnet decides the duel more
  than any stone of yours. Consider letting the player's first stone each duel
  ignore restrictions by default (today that is the Wings relic,
  `freeFirst`), or keeping Magnet out of enemies' opening stones in act 1.

### Not intuitive

- **"Beside" means two different things.** Magnet, Stinky, Bumper, Frog and
  Turncoat use the four orthogonal squares. Swap, Firecracker, Lasso and the
  Oak's Clinch include the corners ("around", "diagonals too", "corners
  included"). Players can't see the difference on the board.
  *Suggestion:* one word each ("beside" = 4 squares, "around" = 8), and a
  highlight of the affected squares while the stone is selected.
- **Several restrictions at once:** "you must place where you satisfy as many
  as any square can" is invisible logic. It already shows as allowed squares
  on the board, which is enough; just keep it out of the card texts.
- **Lasso**: 87% duds. It needs a stone exactly two squares away with an empty
  square between, and "or all of them" adds a second decision.
  *Suggestion:* "pulls every stone two squares away one step closer", with no
  choice.
- **Bumper / Frog**: two-thirds duds. Both need a specific neighbour
  arrangement the player has to set up. That is fine for uncommons, but Frog
  also *hands the enemy back a stone*, so it plays below a Pebble.
  *Suggestion:* the leapt-over enemy stone becomes a Pebble of yours, or is
  simply removed.
- **Rehearse**: 82% duds. It needs another *active, repeatable* special of
  yours already on the board, and the card doesn't say that Twin and one-shot
  stones don't count.
- **Parrot**: 59% duds. It is always a Pebble against bosses and against
  enemies that hold only Pebbles. Say so on the card, or let it copy *your*
  last special as a fallback.
- **Magpie / Mind Control**: always dead against bosses. That is fine for a
  build game, but the boss preview should say "plays only Pebbles".
- **Muffle**: the enemy sees it and spends a Pebble 45% of the time.
  *Suggestion:* "The enemy's next *special* stone does nothing."
- **Mountain**: the "one-shot stones still can" exception reads oddly. It is
  also weak alone and anti-synergistic in pairs. It is purely a defensive stone
  for skilled players (15 → 66 skill gap).

### Too complex (too many choices per play)

- Relocate: 8.3 options on average (any of your stones × any empty square).
- Nudge: 5.0.
- Shift, 2048 and Flip: 4 each. Flip's diagonal axes are hard to picture.

Shift and 2048 are fine: arrows are easy to read. For Relocate, *"move this
stone, or one of yours beside it"* would cut the choices without losing the
trick.

### Housekeeping

- The header comment at the top of `src/engine.js` still says both sides have
  unlimited Pebbles.
- The comment on `returnToHand` says a Pebble goes "simply off the board", but
  the code returns it to the hand.

---

## 8. Suggested changes, in priority order

1. Nerf Bribe (enemy Pebble beside it).
2. Fix Firecracker (leaves a Pebble).
3. Twin drops the centre condition. Overtake gets a target the enemy can't
   dodge, or goes.
4. Give the Colossus a real undead phase; replace the Carpenter's Patience.
5. Fix the difficulty order: move Magpie Meg to elite or act 3, Summit Yeti
   down or harder, and Stinky Skunk later in act 1.
6. Make Lasso no-choice (no loss of power, measured). Muffle hits the next
   *special* stone. Frog: removing instead of returning helps only a little;
   it needs a bigger rethink.
7. Unify "beside" / "around" and highlight the affected squares.
8. Hint at the Grandmaster's build ("He chooses which of your stones you play").

None of these are applied. This report only measures; the changes are yours to
pick.

---

## 9. The proposals, measured

`node tools/lab.mjs proposals`: each change patched into the engine for the
duel only.

- Standard hands: 300 games each. The stone + 3 Pebbles, enemy opens.
- Act 1: the whole act-1 cast with real hands, 75 games per enemy.

| stone | version | vs Pebbles | vs Shift | vs Magnet+Shift | act 1 |
|---|---|---:|---:|---:|---:|
| Bribe | now | 99% | 98% | 25% | 84% |
| | *enemy Pebble beside it* | 98% | 96% | 0% | **59%** |
| Firecracker | now | 2% | 3% | 0% | 21% |
| | *leaves a Pebble* | 98% | 87% | 0% | **50%** |
| Twin | now | 78% | 23% | 0% | 35% |
| | *no centre condition* | 85% | 58% | 0% | **48%** |
| Lasso | now | 79% | 34% | 0% | 32% |
| | *always pulls all, no choice* | 76% | 37% | 0% | 33% |
| Frog | now | 39% | 21% | 5% | 28% |
| | *leapt enemy stone removed* | 43% | 26% | 8% | 31% |
| Overtake | now | 36% | 20% | 0% | 28% |
| | *centre stone becomes yours* | 31% | 13% | 0% | 32% |

For comparison, act-1 means for stones as they are: Pebble 25%, Magnet 53%,
Beacon 57%, Magpie 59%.

- **The Bribe nerf** lands it next to Magpie and Beacon: still a top rare, no
  longer an auto-win.
- **The Firecracker fix** takes it from a trap to a good rare.
- **Twin without the centre condition** is a solid rare.
- **Lasso without its choice** keeps its power, so that change is free
  clarity.
- **Frog and Overtake** barely move. They need different ideas, not tweaks.

---

## 10. After the changes (applied)

Everything in §8 except the "beside / around" wording is now in the game.

### Stones

| stone | change | act 1, before → after¹ | dud, before → after |
|---|---|---:|---:|
| Bribe | an enemy **Pebble beside it** becomes yours | 84% → 67% | 2% → 93%² |
| Firecracker | leaves a burnt Pebble | 21% → 52% | 19% → 1% |
| Twin | the facing square only needs to be empty | 33% → 47% | 82% → 3% |
| Lasso | pulls every stone in reach, no choice | 32% → 34% | 87% → 85% |
| Frog | the leapt enemy stone is knocked off the board | 27% → 37% | 72% → 66% |
| Overtake → **Rewind** | the enemy's last stone goes back to their hand | 29% → 56% | 92% → 0% |
| Muffle | hushes the next *special* stone (Pebbles don't use it up) | 31% → 45% | – |

¹ Act-1 mean of the matrix. The "after" column also reflects the retuned
enemies, which are a little easier in act 1 (the Pebble went from 25% to 29%).

² Bribe is now a narrow counter: against Pebble-heavy hands it is still 96%
(vs Shift + 4 Pebbles), but against special-heavy hands it rarely finds a
target. Its boss build is gone: Pluck + Bribe no longer beats every boss.

### Rarities, by measured power

| | common | uncommon | rare |
|---|---|---|---|
| stones | Shift, Rotate, Stinky, Mountain, Lasso, Frog, **Bumper** | **Magnet**, Swap, 2048, Whirl, Flip, **Turncoat**, **Twin**, **Parrot** | **Beacon**, Firecracker, Magpie |
| one-shots | Nudge, Mirror, Muffle, **Mind Control**, **Rehearse** | **Rewind**, **Relocate** | Pluck, Bribe |

Bold marks a stone that moved. Beacon is strong and easy to play, so it went
up to rare. Magnet went up to uncommon. Turncoat, Twin and Parrot went down to
uncommon. Bumper, Mind Control and Rehearse are the weakest stones and are now
common, the ones you see often but rarely want.

### Enemies and bosses (typical pouch, 200 games each)

| | before | after |
|---|---|---|
| act-1 normals | 45–83% | 54–82% |
| act-1 elites | 38–48% | 41–49% |
| act-2 normals | 34–87% (Magpie Meg the hardest of the act) | 60–79% |
| act-2 elites | 42–44% | 45–55% |
| act-3 normals | 39–91% (Yeti the easiest in the game) | 52–83% |
| act-3 elites | 42–58% | 48–63% |
| boss first / undead, Oak | 87 / 37% | 91 / 50% |
| Scarecrow | 74 / 24% | 64 / 54% |
| Colossus | 68 / **68%** (no change) | 82 / 56% |
| Mirror Knight | 90 / 56% | 78 / 62% |
| Carpenter | 83 / **83%** (no change) | 84 / 51% |
| Grandmaster | 33 / 12% | 54 / 42% |
| Twin Kings | 64 / 63% | 78 / 46% |

What changed:

- Weak enemies (Lasso Lou, Leapin' Frog, Bumper Bee, Quarry Miner) gained a
  Magnet or Stinky and sharper play.
- Gravity favoured the player, so the Quarry Miner lost it. The Yeti keeps it
  but carries a Muffle.
- Over-hard enemies were eased with simpler cores and more blunders: Stinky
  Skunk, Clingy Crab, Lord of Stench, the Twins and Magpie Meg.
- Boss rules:
  - Oak's undead phase: Clinch + Reserved.
  - Scarecrow's: Reserved + Spy.
  - Colossus and Carpenter now rise with Head Start.
  - Mirror Knight: Head Start from the first phase.
  - Twin Kings: Reserved from the first phase; undead adds Tactics.
  - Grandmaster's undead phase: Spy in place of Reserved, and it thinks harder
    (new `iters2` field).
- Patience is no longer used by any boss.

### Builds each boss wants, now

- **Grandmaster**: restrictions or plain Pebbles (86–90%). Movers are turned
  against you (22–30%).
- **Colossus** (undead) and **Carpenter** (undead): restrictions *and* movers
  together (73–92%). Either kind alone gets under 45%.
- **Twin Kings**: Magnet + movers (63–99%). Restrictions alone get 20%.
- **Mirror Knight**: restrictions (78–91%). Movers alone get 8–23%.
- **Oak / Scarecrow**: almost any real build. Pebbles and Mountains lose.

### Whole runs (`node tools/runbot.mjs --runs 128`, heat 0)

| player bot | before | after |
|---|---:|---:|
| 80 iterations, 20% blunders | ~12% | 20% |
| 150 iterations, 10% blunders | ~13% | 34% |
| 300 iterations, no blunders | ~34% | 52% |

The bot now leaves Magpie, Parrot and Mind Control at home against bosses,
as a player would. Those stones are always dead against a boss.

### Round two: the open issues

- **"Beside" and "around"**: beside is always the four squares that share a
  side, around all eight.
  - Card texts (EN and CS) and the Clinch rule follow this.
  - Each stone carries its `reach`. The placement preview outlines those
    squares, and the info card draws them.
- **Weak stones reworked** (act-1 matrix, before → after):

  | stone | change | before → after |
  |---|---|---:|
  | Bumper | a stone pushed off the edge is knocked off the board; now uncommon | 28% → 53% |
  | Lasso | pulls *any* enemy stone onto an empty square beside it | 33% → 39% |
  | Mountain | also goes anywhere, whatever the restrictions; Mirror and Relocate no longer move it | 36% → 37% (40% in the proposal run) |
  | Mind Control | the stone named also does nothing | 31% → 37% |
  | Rehearse | becomes a copy of your last special stone | 63% → 67% with a Shift beside it in the hand³ |

  ³ Alone with Pebbles it has nothing to copy, so the matrix shows it at
  Pebble level.

  Tried and dropped: a Lasso that pulls only enemy stones, an eight-way
  Bumper, and a Bribe that reaches corners. None measured better.
- **Act-1 elites re-tuned** after the Lasso change: the Twins and the Lord of
  Stench carry a Frog instead of a Lasso (both about 50%).
- **Act-1 bosses' undead phases** now measure 55–57%.
- **Boss lines cost 1 heart, not 2.**

  | per line | bot wins (150 it., 192 runs) | runs ended by a boss line |
  |---:|---:|---:|
  | 2 hearts | 37% | 48 (25%) |
  | 1 heart | 52% | 16 (8%) |
  | 0 hearts | 61% | 0 |

  The map still pushes back; it just no longer decides a quarter of the runs.
- **Whole runs now** (heat 0, 192 runs each):

  | player bot | runs won |
  |---|---:|
  | 80 iterations, 20% blunders | 30% |
  | 150 iterations, 10% blunders | 54% |
  | 300 iterations, no blunders | 69% |

  Heat 1–5 raises it from there.
