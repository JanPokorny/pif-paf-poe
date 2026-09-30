# Pif·Paf·Poe — the roguelike

**Play it: https://janpokorny.github.io/pif-paf-poe/**

Tic-tac-toe where the pieces move, as a mobile-friendly browser roguelike. Climb three acts of
branching maps, duel a cast of enemies on a 3×3 board where every stone *does something* when
placed, and grow your pouch of stones, tricks and relics along the way.

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
| `src/run.js` | a run: map generation, duel setup, rewards, shops. Pure, JSON-serialisable |
| `src/main.js`, `src/ui/` | the screens |
| `tools/` | headless playtests and balance measurements (`node tools/balance.mjs`) |
