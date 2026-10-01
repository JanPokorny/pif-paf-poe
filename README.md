# Pif·Paf·Poe — the roguelike

**Play it: https://janpokorny.github.io/pif-paf-poe/**

Tic-tac-toe where the pieces move, as a mobile-friendly browser roguelike drawn on a notebook
page. Duel a cast of enemies on a 3×3 board. You bring at least four stones into every duel —
Pebbles, and special stones that *do something* when placed; more as you buy slots — and they
can be crafted, two into one of a higher tier, along the way. One-shot stones do one strong
thing and are gone from the pouch once played. Some duels carry a condition for both sides
(gravity, a hollow centre, open hands); bosses bring no stones at all, only a rule in their
favour.

Each act is an endless notebook page of encounters. You start on one square and see only the
squares next to your marks; every step is an X, and the act's boss answers with an O. Rocks dot
the page in a pattern that makes three in a row hard to force. Your three in a row opens the
boss's door; the boss's lines (or a full page) make it stronger. Bosses bring no stones, only a
rule in their favour, and have two lives.

It grew out of a physical summer-camp game; the original rules, simulations and print-and-play
sheets live in [`old/`](old/).

## Running locally

No build step. Serve the folder and open it:

```sh
npx http-server -c-1 .
```

## Layout

| path | what |
|---|---|
| `src/engine.js` | the duel rules: stones, one-shot stones, conditions, boss rules. Pure, shared by UI and AI |
| `src/ai.js` | the enemy: Monte Carlo tree search over the engine (runs in a worker via `src/brain.js`) |
| `src/sound.js`, `src/music.js` | sound effects, and endless music composed live a bar at a time: the act sets key, tempo and instruments, the screen sets the layers, events add a phrase |
| `src/content.js` | relics, enemies, acts, events |
| `src/run.js` | a run: the act maps, duel setup, rewards, shops. Pure, JSON-serialisable |
| `src/main.js`, `src/ui/` | the screens |
| `tools/` | engine tests (`node tools/test-engine.mjs`), headless runs and balance measurements |

Design notes and the measurements behind the numbers: [`DESIGN.md`](DESIGN.md). The game is in
English and Czech.

Fonts are self-hosted in `fonts/`: Patrick Hand and Caveat Brush (SIL OFL).
The first, glossy look is kept in `old/style-glossy.css` as a record of what not to do.
