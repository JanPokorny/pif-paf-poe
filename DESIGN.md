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
  board, that then do their one thing (Overtake, Relocate, Mirror, Mind Control, Rehearse, Nudge,
  Muffle, Pluck, Bribe). Once played in a duel, won or lost, one is gone from the pouch. They
  have a dashed outline, come as their own reward and shop shelf, and are cheaper than stones.
  Encore, which handed back your last special stone, did not survive the change.
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
  95–100%. A boss's second life adds Reserved, and then restrictions alone drop to
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
  The boss's three in a row adds one to its *power* (up to 2); so does a page filled with twelve
  marks before you open the door, and then the door opens anyway. Power is search depth, and at
  full power the boss fights with its second-life rules from the start.
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
- **Bosses** bring no stones, only their rule (above), and have two lives; the second life adds
  their harder rule. A boss won is a boss relic, three hearts and 60 gold. **Elites** are just
  stronger regular enemies: bigger hands, two hearts if lost, a red star in the corner.
- **Map aids.** A duel won may offer, instead of a stone, a *Double Step* (the boss does not
  answer one step) or a *Pickaxe*. Elites always offer one.
- **Layout.** Good squares — shops, campfires, workshops, chests — keep their distance: each good
  neighbour already laid out makes another a quarter as likely. The boss judges a square by what
  it takes and what it blocks (when it notices — more often in later acts); the run bot plays by
  the same judgement.

Balance is still open: bosses are hard for the bots (2 runs of 32 won).

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
bigger elite hands, no blunders.

## Tests

- `node tools/test-engine.mjs` — every stone, condition and boss rule against its own
  text, plus a 20,000-game fuzz of
  invariants.
- `node tools/runbot.mjs` — whole runs, including the save format's JSON round trip.
- `node tools/smoke.mjs` — random duels with everything switched on, and the AI's timing.
- `eslint -c eslint.config.mjs src/` — undefined names (a renamed variable once froze the Whirl).
