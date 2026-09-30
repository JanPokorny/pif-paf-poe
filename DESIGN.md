# Pif·Paf·Poe — design notes

What the roguelike kept from the camp game, what it changed, and the measurements behind the
numbers. The camp game's own reasoning is in `old/adr/`.

## Kept from the camp game

- **The duel.** 3×3, one stone a turn, most stones move stones already on the board. Three in a
  row wins; a line only your opponent has wins for them.
- **Restrictions compose.** Every enemy Magnet, Stinky and Beacon pulls at once and you place
  where you satisfy as many as any square can (`old/adr/2026-08-18-…`).
- **Counterattacks → tricks.** Spent at the end of your own turn, before the line check, so any
  of them can finish a line. Overtake, Relocate, Mirror, Mind Control and Rehearse are the five
  the ADR kept; five more were added (Nudge, Muffle, Pluck, Bribe, Encore). An Anchor trick that
  fixed a stone in place was cut: the Mountain is the only thing nothing moves.
- **Boss rules** come from an older iteration's sheet of special rules (Taktika, Náskok, Elko,
  Lep, Sloup, Špion, Reservé).

## A slower tempo

The first version ran fast: a hand of five or six stones, all of them spent by the end of a
duel, and a rule for who wins when someone runs out. The second version slows it down.

- **Pebbles never run out.** Both sides may always place another Pebble; it is not in the hand
  and needs no slot. A Pebble sent back to hand simply leaves the board. There is no rule for
  running out any more: a full board (or forty turns) goes to whoever moved second.
- **No stones to start with.** A run begins with an empty pouch: the first duels are Pebbles
  against an enemy with a single special stone, and everything else is found along the way.
- **Two slots.** You bring two special stones into a duel at first. Shops sell more slots (up to
  five; Deep Pockets adds one). The pouch holds six.
- **The enemy always opens**, so a full board is always yours: hold out and you win. Plain
  tic-tac-toe is a draw, so the opener's specials are what make a duel winnable for it.
- **No spaces, no vetoes.** The spaces that switched a stone type off are gone. Regular enemies
  bring stones and, sometimes, a *condition* for both sides: **Gravity** (after every turn every
  stone falls as far as it can), **Hollow** (nobody plays the centre), **Open Hands** (either side
  may play a special stone from the other's hand, as its own). Some enemies have one as a home
  rule; others roll one (25% in act 1, 35% in act 2, 40% in act 3, more for elites).
- **Mini-bosses bring no stones.** Only Pebbles, and rules in their favour: **Tactics** (it names the
  stone you play), **Head Start** (it plays twice on its first turn), **Elbow** (rows do not
  count: an L of three wins), **Clinch** (you must place next to one of its stones, corners included — so a threat can always be blocked), **Column**
  (it closes a column to you each turn), **Spy** (it names the direction your stones move),
  **Reserved** (the centre is its alone), **Patience** (a full board is its), **Double Time**
  (every turn is two stones in a row, for both sides, the boss first). The dictating rules
  are a phase of their own after the boss's turn, searched by the same AI as every other choice.
  They are mini-bosses on the map now (below), one duel each.
  Double Time is the hard one, and it wants a particular loadout. Bot duels, 20 each: Pebbles
  only or two Mountains win 0%, movers (Shift and Rotate, Rail/Pivot/Teleport, 2048/4096)
  20–40%, restrictions (Magnet and Stinky, and their evolved forms of the time)
  95–100%. The Twin Kings' second life adds Reserved, and then restrictions alone drop to
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

Each act is Ultimate tic-tac-toe with its boss: nine clearings in a 3×3, each a 3×3 of squares
(duels, elites, shops, campfires, treasure, events), all on view. The boss opens in the very
middle.

- **The send rule.** Where you step inside a clearing decides the clearing the boss must answer
  in, and its step sends you. A clearing that is finished, or has nothing left for you, frees
  you to step in any open one.
- **Scorching.** A lost duel costs its hearts and scorches the square: you may not step there
  again, but the boss may. You choose again at once — the boss answers only a real X.
- **Clearings.** Three in a row takes a clearing (+15 gold for you, −1 ❤ if it is the boss's).
  Three clearings in a row beat the act's rival outright — there is no final duel — for a boss
  relic, gold, three hearts and a stone.
- **Mini-bosses.** The stoneless rule-bearers (Tactics, Head Start, Elbow, Clinch, Column, Spy,
  Reserved, Patience, Double Time) are mini-bosses now, holding the middle square of two
  clearings on an act's first map and three after; on later maps they bring their harder rule
  sets. One duel each, two hearts if lost, a relic if won. The boss's three in a row costs another heart
  and starts a fresh map; so does a map nobody can win any more. Each new map of an act is less
  friendly than the last.
- The boss judges a square by what it takes, what it blocks (when it notices: more often map by
  map) and where it sends you; greed for treasure and shops breaks ties. The run bot plays by
  the same judgement.

Acts are long: a map takes some 25–35 of your steps. Balance for this map is still open.

## The stones

18 types. Every stone's card shows an example computed by the engine.

A hand of one stone plus a Shift against a Shift and a Rotate, both seats, 80 games, MCTS at 200
iterations (`node tools/stones.mjs`):

| stone | win | | stone | win |
|---|---|---|---|---|
| Lighthouse | 81% | | Turncoat | 46% |
| Electromagnet | 80% | | Kaleidoscope | 45% |
| Stench | 76% | | Flip, Parrot | 44% |
| Rail | 76% | | Bumper, Cyclone | 43% |
| Stinky | 74% | | Pivot | 41% |
| Magnet | 73% | | Rotate, Whirl | 39% |
| Beacon | 69% | | Kangaroo | 34% |
| Magpie | 68% | | Frog | 30% |
| Twin | 64% | | Bomb | 26% |
| Shift | 57% | | Lasso, Firecracker | 25% |
| Teleport, 4096 | 55–56% | | Pebble | 14% |
| 2048, Swap, Mountain, Blast | 49–53% | | | |

The table was measured with the evolved forms still in; they are gone now. Twin won 93% and now
needs the centre empty too.

## Difficulty

Enemies are the same Monte Carlo search as the camp game's AI (`src/ai.js`), dialled by
iterations and a blunder rate. `node tools/balance.mjs` duels a bot with a typical pouch against
every enemy (`--life 1` for a boss's second life); `node tools/runbot.mjs` plays
whole runs headless; `node tools/stones.mjs` measures the stones.

At heat 0 (six hearts), bots that play the map sensibly, pick their stones by strength and keep one that moves things win:

| player bot | runs won |
|---|---|
| 80 iterations, 20% blunders | about 12% |
| 150 iterations, 10% blunders | about 13% |
| 300 iterations, no blunders | about 34% |

Heat 1–5 raises it after each win: deeper search, dearer shops, a heart fewer,
bigger elite hands and boss tricks, no blunders.

## Tests

- `node tools/test-engine.mjs` — every stone, trick, condition and boss rule against its own
  text, plus a 20,000-game fuzz of
  invariants.
- `node tools/runbot.mjs` — whole runs, including the save format's JSON round trip.
- `node tools/smoke.mjs` — random duels with everything switched on, and the AI's timing.
- `eslint -c eslint.config.mjs src/` — undefined names (a renamed variable once froze the Whirl).
