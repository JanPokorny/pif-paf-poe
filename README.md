# Pif·Paf·Poe — the roguelike

**Play it: https://janpokorny.github.io/pif-paf-poe/**

Tic-tac-toe where the pieces move, as a mobile-friendly browser roguelike drawn on a notebook
page. Duel a cast of enemies on a 3×3 board where every stone *does something* when placed, and
grow your pouch of stones, tricks and relics along the way.

Each of the three acts is itself a game of tic-tac-toe against its boss, on an endless sheet: it
starts with the boss's single O, every mark reveals the encounters around it, and four Xs in a
row open the boss's door — but the squares that matter most hide the hardest duels.

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
| `src/engine.js` | the duel rules: stones, tricks, boss field rules. Pure, shared by UI and AI |
| `src/ai.js` | the enemy: Monte Carlo tree search over the engine (runs in a worker via `src/brain.js`) |
| `src/content.js` | relics, enemies, acts, events |
| `src/run.js` | a run: the act maps, duel setup, rewards, shops. Pure, JSON-serialisable |
| `src/main.js`, `src/ui/` | the screens |
| `tools/` | engine tests (`node tools/test-engine.mjs`), headless runs and balance measurements |

Design notes and the measurements behind the numbers: [`DESIGN.md`](DESIGN.md). The game is in
English and Czech.

Fonts are self-hosted in `fonts/`: Patrick Hand and Caveat Brush (SIL OFL) and Permanent Marker (Apache 2.0).
The first, glossy look is kept in `old/style-glossy.css` as a record of what not to do.
