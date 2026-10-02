# Pif·Paf·Poe — design notes

What the roguelike kept from the camp game, what it changed, and the measurements behind the
numbers. The camp game's own reasoning is in `old/adr/`.

## Kept from the camp game

- **The duel.** 3×3, one stone a turn, most stones move stones already on the board. Three in a
  row wins; a line only your opponent has wins for them.
- **Restrictions compose.** Every enemy Magnet, Stinky and Beacon pulls at once and you place
  where you satisfy as many as any square can (`old/adr/2026-08-18-…`).
- **Counterattacks → one-shot stones.** The camp game's counterattacks became tricks, spent
  at the end of a turn; now they are stones like any other, brought in a slot and placed on the
  board, that then do their one thing (Rewind, Relocate, Mirror, Mind Control, Rehearse, Nudge,
  Muffle, Pluck, Bribe). Once played in a duel, won or lost, one is gone from the pouch. They
  have a dashed outline, come as their own reward and shop shelf, and are cheaper than stones.
  Encore, which handed back your last special stone, did not survive the change.
- **Boss rules** come from an older iteration's sheet of special rules (Taktika, Náskok, Elko,
  Lep, Sloup, Špion, Reservé).

## A slower tempo

The first version ran fast: a hand of five or six stones, all of them spent by the end of a
duel, and a rule for who wins when someone runs out. The second version slows it down.

- **Pebbles run out.** Pebbles are stones in the pouch like any other. A run starts with four
  of them and nothing else, and the pouch never holds fewer than four: Pebbles top it up when a
  one-shot stone is spent or a workshop trades two stones for one (Pebbles cannot be traded).
  A stone sent back off the board, a Pebble too, goes back into its owner's hand. A full board
  (or forty turns) goes to whoever moved second.
- **Four stones a duel, at least.** You bring between four and your hand size (four at first;
  shops sell more slots, up to seven, and Deep Pockets adds one). The pouch holds ten. The enemy
  opens, so it brings enough for a full board: its stones and Pebbles, five or more. A side with
  nothing left to place passes; when neither can place, the duel ends as a full board does.
- **The enemy always opens**, so a full board is always yours: hold out and you win. Plain
  tic-tac-toe is a draw, so the opener's specials are what make a duel winnable for it.
- **No spaces, no vetoes.** The spaces that switched a stone type off are gone. Regular enemies
  bring stones and, sometimes, a *condition* for both sides: **Gravity** (after every turn every
  stone falls as far as it can), **Hollow** (nobody plays the centre), **Open Hands** (either side
  may play a special stone from the other's hand, as its own). Some enemies have one as a home
  rule; others roll one (25% in act 1, 35% in act 2, 40% in act 3, more for elites).
- **Bosses bring no stones.** Only Pebbles, and rules in their favour: **Tactics** (it names the
  stone you play), **Head Start** (it plays twice on its first turn), **Elbow** (rows do not
  count: an L of three wins), **Clinch** (you must place next to one of its stones, corners included — so a threat can always be blocked), **Column**
  (it closes a column to you each turn), **Spy** (it names the direction your stones move),
  **Reserved** (the centre is its alone), **Patience** (a full board is its), **Double Time**
  (every turn is two stones in a row, for both sides, the boss first). The dictating rules
  are a phase of their own after the boss's turn, searched by the same AI as every other choice.
  They are the bosses at the end of each act (below).
  Double Time is the hard one, and it wants a particular loadout. Bot duels, 20 each: Pebbles
  only or two Mountains win 0%, movers (Shift and Rotate, Rail/Pivot/Teleport, 2048/4096)
  20–40%, restrictions (Magnet and Stinky, and their evolved forms of the time)
  95–100%. A boss's undead phase adds Reserved, and then restrictions alone drop to
  0–15%: it takes a restriction *and* a mover (Magnet and Shift: 95%).
  The sheet's Sloup had the boss choose the column you *must* play in; measured against the bot
  that won 96% for the boss, so here the boss closes a column instead. OOTB (playing outside
  the board) is left out for now: the engine's board is a fixed 3×3.
- **Mountain is the only wall.** The protective and disabling stones (Snare, Hush, Glue,
  Guardian) were confusing and are gone. Moving stones — shifts, rotations, whirls, 2048, and
  Gravity — step over a Mountain: it holds its square and the rest go round.
- **No second level of stones.** The + versions went first, then the twelve named evolutions
  that replaced them (Rail, Electromagnet, Lighthouse…): an evolved restriction that also could
  not be moved was a Mountain in disguise, and two levels of every stone were more to learn than
  they were worth. Instead there is **crafting**: at a workshop (a square of the map, or the
  wandering stonemason) two stones become one of the next tier up from the humbler of the two —
  two commons make an uncommon, rares stay rare — chosen from two.

## The map

Back to the endless page, after a detour through Ultimate tic-tac-toe: nested clearings were a
second game on top of the duels and took the attention away from them. Each act is a page of
its own, with its boss.

- **Fog.** You start on one square; you see and may step only next to your marks (X) and the
  boss's (O). Every square you step on is an X; a duel lost costs its hearts and scorches the
  square, which only the boss may take afterwards. You choose again at once — the boss answers
  only a real X.
- **The door.** Your three in a row opens the boss's door (+10 gold for every square past that).
  The boss's three in a row costs you two hearts. There is no page limit any more: the door opens
  only to your line, and when nothing on view is free the boss moves again (into the fog beside
  the page if it must) until something is.
- **Spent lines.** Every line of three is crossed through on the page, and its marks are spent:
  no later line may use them, so a fourth mark beside a line, or a fork sharing its square, makes
  nothing new. A mark that finishes two lines at once crosses through only one.
- **Rocks.** On an open page two open squares are already a double threat, and a line came in
  about five steps 95% of the time. So the page lays rocks on a lattice — (x + 3y) mod 7 in two
  classes, shifted so you never start on one — plus scattered ones, likelier the further you
  have spread and the more live lines you hold. Rocks take about a third of the page; a bot that
  plays for its line gets one before the page fills 62% of the time, in about seven steps
  (`node tools/maprocks.mjs`). A *Pickaxe* breaks one rock.
- **No forks at the start.** Within three squares of the boss's first mark, no two open lines of
  three share a square, so every line there is a single threat the boss can block. The 9×9
  around the start is laid out when the page is made: the lattice, then greedily the rock that
  breaks the most overlaps until none are left, then every rock the rule does not need is
  cleared again (random order). That leaves about 38% rock there, and keeps at least fifteen
  squares connected to the start. With it the line-building bot opens the door before the page
  fills 34% of the time, in about nine steps (62% and seven steps without).
- **Bosses** bring no stones, only their rule (above), and are beaten twice: once beaten, the moon
  rises and the boss climbs back out of the earth as its undead self ("Undead Old Oak"), with its
  harder rule. A boss won is a boss relic, three hearts and 60 gold. **Elites** are just
  stronger regular enemies: bigger hands, two hearts if lost, a red star in the corner.
- **Map aids.** A duel won may offer, instead of a stone, a *Double Step* (the boss does not
  answer one step) or a *Pickaxe*. Elites always offer one.
- **The page by distance** (`node tools/mapgen.mjs`, measured over whole explored pages):
  obstacles are densest near the start, where the fork-free layout holds (about half of rings
  1–4), and thin out ring by ring (a quarter by ring 9). Empty squares — nothing on them, just the
  X — grow from ring 2, and from ring 10 the page is nothing else, so a page holds a finite number
  of everything: about sixty encounters, none past ring 8. Elites grow from 2% of encounters next
  to the start to a quarter far out, and the act's stronger enemies (by how hard they think) gather
  further out (strength rank 0.3 near, 0.7 far). Kinds keep apart: each of the same kind within two
  squares makes another much less likely (a third for duels, a seventh for the rest), good squares
  avoid each other too, and the same enemy never appears within three squares. A line-building
  bot opens the door on every page, in about sixteen steps.
- **Terrain by act.** The Meadow's obstacles are firs and its empty ground tiny shrubs; the
  Quarry's are boulders and gravel; the Summit's crags and tufts of grass in the snow.

Balance was measured and retuned in `docs/STONES-REPORT.md`; the run bots (see Difficulty) win a fifth to a half of their runs.

## The stones

27 special types and the Pebble. Every stone's card shows an example computed by the engine.

One stone, the rest of the act's hand Pebbles (four, five, six stones), against every enemy of the
act as the game rolls them, 60 games each (`node tools/lab.mjs matrix`). Rarity follows power:
the stronger and the more skill a stone wants, the rarer.

| stone | rarity | act 1 | act 2 | act 3 |
|---|---|---:|---:|---:|
| Magpie | rare | 68% | 29% | 29% |
| Pluck | rare, one-shot | 53% | 21% | 26% |
| Rewind | uncommon, one-shot | 56% | 21% | 24% |
| Firecracker | rare | 52% | 23% | 22% |
| Beacon | rare | 61% | 15% | 18% |
| Bribe | rare, one-shot | 67% | 9% | 10% |
| Magnet | uncommon | 55% | 13% | 13% |
| Relocate | uncommon, one-shot | 45% | 18% | 17% |
| Stinky | common | 47% | 16% | 17% |
| Nudge | common, one-shot | 46% | 17% | 16% |
| Shift | common | 48% | 15% | 14% |
| Swap | uncommon | 47% | 15% | 15% |
| Turncoat | uncommon | 41% | 21% | 14% |
| Twin | uncommon | 47% | 15% | 6% |
| 2048 | uncommon | 43% | 14% | 10% |
| Muffle | common, one-shot | 45% | 10% | 11% |
| Rotate | common | 41% | 14% | 10% |
| Frog | common | 37% | 11% | 15% |
| Parrot | uncommon | 38% | 12% | 12% |
| Flip | uncommon | 39% | 9% | 10% |
| Whirl | uncommon | 37% | 9% | 10% |
| Mirror | common, one-shot | 38% | 8% | 10% |
| Mountain | common | 36% | 7% | 9% |
| Lasso | common | 34% | 7% | 10% |
| Pebble | starter | 29% | 6% | 10% |
| Mind Control | common, one-shot | 31% | 8% | 6% |
| Rehearse | common, one-shot | 28% | 7% | 8% |
| Bumper | common | 28% | 6% | 8% |

`docs/STONES-REPORT.md` has the rest: duds, choices, skill, pairs, boss builds, and what changed
(Bribe takes only a Pebble beside it, Firecracker leaves a Pebble, Twin needs no empty centre,
Lasso pulls all at once, Frog knocks the stone it leaps off the board, Muffle hushes the next
*special* stone, and Overtake became Rewind).

## Difficulty

Enemies are the same Monte Carlo search as the camp game's AI (`src/ai.js`), dialled by
iterations and a blunder rate. `node tools/balance.mjs` duels a bot with a typical pouch against
every enemy (`--life 1` for a boss's undead phase); `node tools/runbot.mjs` plays
whole runs headless; `node tools/lab.mjs` measures stones, enemies and bosses in bulk.

A typical pouch for the act, 250 iterations and 5% blunders, against each enemy
(`node tools/lab.mjs enemies`): normal enemies 52–83%, elites 41–63%; bosses at first 54–91% and
risen 42–62%.

At heat 0 (six hearts), bots that play the map sensibly, pick their stones by strength and keep one that moves things win:

| player bot | runs won |
|---|---|
| 80 iterations, 20% blunders | about 20% |
| 150 iterations, 10% blunders | about 34% |
| 300 iterations, no blunders | about 52% |

Heat 1–5 raises it after each win: deeper search, dearer shops, a heart fewer,
bigger elite hands, no blunders.

## Tests

- `node tools/test-engine.mjs` — every stone, condition and boss rule against its own
  text, plus a 20,000-game fuzz of
  invariants.
- `node tools/runbot.mjs` — whole runs, including the save format's JSON round trip.
- `node tools/smoke.mjs` — random duels with everything switched on, and the AI's timing.
- `eslint -c eslint.config.mjs src/` — undefined names (a renamed variable once froze the Whirl).
