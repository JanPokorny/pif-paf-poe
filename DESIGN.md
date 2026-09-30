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
  the ADR kept; six more were added (Nudge, Muffle, Anchor, Pluck, Bribe, Encore).
- **Boss rules** come from an older iteration's sheet of special rules (Taktika, Náskok, Elko,
  Lep, Sloup, Špion, Reservé).

## A slower tempo

The first version ran fast: a hand of five or six stones, all of them spent by the end of a
duel, and a rule for who wins when someone runs out. The second version slows it down.

- **Pebbles never run out.** Both sides may always place another Pebble; it is not in the hand
  and needs no slot. A Pebble sent back to hand simply leaves the board. There is no rule for
  running out any more: a full board (or forty turns) goes to whoever moved second.
- **Two slots.** You bring two special stones into a duel at first. Shops sell more slots (up to
  five; Deep Pockets adds one). The pouch holds six.
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
  A boss has two lives; once beaten it rises again, often with a second rule.
  Double Time is the hard one, and it wants a particular loadout. Bot duels, 20 each: Pebbles
  only or two Mountains win 0%, movers (Shift and Rotate, Rail/Pivot/Teleport, 2048/4096)
  20–40%, restrictions (Magnet and Stinky, Electromagnet and Stench, Beacon and Lighthouse)
  95–100%. The Twin Kings' second life adds Reserved, and then restrictions alone drop to
  0–15%: it takes a restriction *and* a mover (Magnet and Shift: 95%).
  The sheet's Sloup had the boss choose the column you *must* play in; measured against the bot
  that won 96% for the boss, so here the boss closes a column instead. OOTB (playing outside
  the board) is left out for now: the engine's board is a fixed 3×3.
- **Mountain is the only wall.** The protective and disabling stones (Snare, Hush, Glue,
  Guardian) were confusing and are gone. Moving stones — shifts, rotations, whirls, 2048, and
  Gravity — step over a Mountain: it holds its square and the rest go round.
- **Named evolutions instead of +.** Twelve stones evolve into a named stone that can do
  everything the plain one can and more: Shift → Rail, Rotate → Pivot, Magnet → Electromagnet,
  Stinky → Stench, 2048 → 4096, Bumper → Blast, Swap → Teleport, Whirl → Cyclone, Frog → Kangaroo,
  Beacon → Lighthouse, Flip → Kaleidoscope, Firecracker → Bomb. The test suite checks the
  "never less" part on random boards. Campfires, shops and a few events evolve stones; nothing
  you find is evolved already, but later enemies' stones often are.

## The map

Each act is a game of tic-tac-toe with its boss on a 5×5 sheet of graph paper. It starts with
the boss's O in the middle; every mark reveals the squares around it, and a square is decided
the moment it comes into view, by how much it matters: one that would extend your line or break
the boss's turns up as an elite or a duel, one off to the side as a campfire, shop or treasure.
**Three Xs in a row open the boss's door.** A lost duel scorches its square; the boss never marks
shops or campfires; a line of three Os, or a full page (ten squares), makes the boss stronger —
it thinks harder. Squares cleared after the door opens pay gold, so pressing on is a gamble.
In the first act one of the first squares is a **gift**: a special stone of two, free.

## The stones

30 types, 12 of them evolved forms. Every stone's card shows an example computed by the engine.

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

What that table changed along the way: Stench forbade the corners too and so, in the centre,
forbade everything — which means nothing; it now counts twice instead. Blast pushed diagonal
neighbours as well, which often helped the enemy; it now chooses the straight or the diagonal
ones. Lighthouse was also heavy and won 95%; Twin won 93% and now needs the centre empty too.

## Difficulty

Enemies are the same Monte Carlo search as the camp game's AI (`src/ai.js`), dialled by
iterations and a blunder rate. `node tools/balance.mjs` duels a bot with a typical pouch against
every enemy (`--power 1 --life 1` for a grown boss's second life); `node tools/runbot.mjs` plays
whole runs headless; `node tools/stones.mjs` measures the stones.

At heat 0, bots that pick their stones by strength and keep one that moves things win:

| player bot | runs won |
|---|---|
| 80 iterations, 20% blunders | about 30% |
| 150 iterations, 10% blunders | about 50% |
| 300 iterations, no blunders | about 65% |

Heat 1–5 raises it after each win: deeper search, more evolved enemy stones, a heart fewer,
bigger elite hands and boss tricks, no blunders.

## Tests

- `node tools/test-engine.mjs` — every stone, trick, condition and boss rule against its own
  text, "evolving never takes a choice away" on random boards, plus a 20,000-game fuzz of
  invariants.
- `node tools/runbot.mjs` — whole runs, including the save format's JSON round trip.
- `node tools/smoke.mjs` — random duels with everything switched on, and the AI's timing.
- `eslint -c eslint.config.mjs src/` — undefined names (a renamed variable once froze the Whirl).
