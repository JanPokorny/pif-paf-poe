# Pif·Paf·Poe — design notes

What the roguelike kept from the camp game, what it changed, and the measurements behind the
numbers. The camp game's own reasoning is in `old/adr/`.

## Kept from the camp game

- **The duel.** 3×3, one stone a turn, most stones move stones already on the board. Three in a
  row wins; a line only your opponent has wins for them; a full board, or a player to move with
  nothing to play, goes to whoever moved second.
- **Restrictions compose.** Every enemy Magnet, Stinky and Beacon pulls at once and you place
  where you satisfy as many as any square can (`old/adr/2026-08-18-…`).
- **Spaces.** Each duel is fought on a space that switches one stone type off for both sides.
  The ADR found this the largest seat-balance lever in the whole project; here it also makes the
  loadout choice before each duel matter.
- **Counterattacks → tricks.** Spent at the end of your own turn, before the line check, so any
  of them can finish a line. Overtake, Relocate, Mirror, Mind Control and Rehearse are the five
  the ADR kept; six more were added (Nudge, Muffle, Anchor, Pluck, Bribe, Reinforce).

## Changed for a single player

- **The arena is gone.** It is a team game. In its place each act's map is itself a game of
  tic-tac-toe against the act's boss, on a 4×4 grid of encounters: you mark X where you go, the
  boss answers with an O, three Xs in a row open the boss's door. A lost duel scorches its
  square; the boss never takes shops or campfires; each line of Os it draws, and boxing you in,
  make it stronger (up to +3: upgraded stones and deeper search). Squares cleared after the door
  opens pay gold, so pressing on is a real gamble.
- **Nobody opens in the centre.** With the space and the Counterattack gone as balancers, the
  measured dominant opening was a Mountain or a Magnet in the centre, for both sides. The first
  stone of a duel must go elsewhere.
- **A hand is chosen per duel** from a pouch of up to 7, after seeing the enemy's stones, the
  space and who opens.
- **Upgrades.** Every stone has a + version that does a little more.

## The stones

23 types. Every stone's card shows an example computed by the engine itself.

Two hands holding two of a stone (plus Shift, Rotate, Pebble) against a fixed Shift, Rotate,
Magnet, Mountain, Pebble hand, 60 games, both seats, MCTS at 200 iterations
(`node tools/stones.mjs`), after the centre rule:

| stone | win | | stone | win |
|---|---|---|---|---|
| Turncoat | 67% | | Frog | 35% |
| Twin | 67% | | Beacon | 35% |
| Hush | 48% | | Whirl | 33% |
| Bumper | 47% | | Flip | 32% |
| Parrot | 47% | | Firecracker | 32% |
| Magpie | 47% | | Guardian | 32% |
| Magnet | 43% | | Shift | 23% |
| Snare | 43% | | Mountain | 23% |
| 2048 | 42% | | Glue | 23% |
| Stinky | 42% | | Rotate | 20% |
| Swap | 37% | | Lasso | 15% |
| | | | Pebble | 8% |

What that table changed along the way:

- **Joker** counted towards a line for both sides. It lost every game it was in, and became the
  **Guardian**, which shields its owner's neighbours from the enemy.
- **Firecracker** (90%) now burns itself up; **Twin** (88%) now drops its Pebble only on the
  square facing it through the centre.
- **Bumper, Flip, Lasso, Frog, Swap** measured at or below a Pebble. Bumper now pushes only enemy
  stones and knocks them off the edge back into hand; Flip holds its own square (a whole-board
  mirror maps lines onto lines and changes nothing); Frog sends a leapt-over enemy stone home.
- **Flytrap** and **Seesaw** were built and measured (92% and 10%) and cut.

## Difficulty

Enemies are the same Monte Carlo search as the camp game's AI (`src/ai.js`), dialled by
iterations and a blunder rate. `node tools/balance.mjs` duels a bot with a typical pouch against
every enemy; `node tools/runbot.mjs` plays whole runs headless. At heat 0 a strong bot (300
iterations) wins about 40% of runs and a weak one (150, occasional blunders) about 10%. A human
who scouts the map and picks a loadout per duel should sit between the two.

Heat 1–5 raises it after each win: deeper search, more upgraded enemy stones, a heart fewer,
bigger elite and boss hands, no blunders and elites that always open.

## Tests

- `node tools/test-engine.mjs` — every stone, trick and field rule against its own text, plus a
  20,000-game fuzz of invariants.
- `node tools/runbot.mjs` — whole runs, including the save format's JSON round trip.
- `eslint -c eslint.config.mjs src/` — undefined names (a renamed variable once froze the Whirl).
