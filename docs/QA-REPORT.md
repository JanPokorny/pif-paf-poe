# QA report

An overnight playtest of the whole game:

- **Headless runs.** `node tools/runbot.mjs` over every heat level, 96 runs each: 576 runs in
  all, with no exception.
- **A bot playing the real UI.** `tools/playtest.cjs` drives the browser as a player taps:
  - English and Czech;
  - an iPhone-sized screen (390×664) and a small one (360×640);
  - runs started fresh, and from saved act-2 and act-3 starts with the energy and stones a
    player has by then.

  It records console errors, native dialogs, screens it gets stuck on, and a screenshot of
  every kind of screen. Its duels are random taps, so it loses most of them, but it walks
  every screen.
- **Scripted checks** for what a random player never reaches: boss victories, the moonrise,
  the change of act, the victory screen, the menus.

## Fixed

| What | Where |
|---|---|
| Under Open Hands, an empty hand never found a Pebble while the enemy held a special to borrow, though the hand said it would. The bot was stuck there. | engine `settle` |
| Board stones grew and shrank about the top-left square: the win pulse, the pop-in of a new stone (it slid in from the corner), its removal and its hop. | style: board stone animations |
| A toast sat on top of the bottom button ("Fight!", "Continue"), hiding its label. In duels it now sits below the top bar. | style `#toast` |
| On small screens the top bar cut "Act 1 · The Meadow" (and the longer Czech "Dějství 3 · Vrchol") into an ellipsis once energy joined it. Below 420px only the act's number shows. | top bar |
| The first page's gift could offer a stone the starting energy (1) cannot bring along (a 2048, a rare). | `enterNode('gift')` |
| Second Wind (formerly Deep Pockets) still showed the trousers. | icon |
| The victory line "The Twin Kings bows." | end screen |
| A reward taken half under the old screens could be offered again by the new reward form (from an old save). | reward screen |
| The workshop and pouch pickers had no energy dots, unlike every other list of stones. | workshop, pickers |

Asked for during the night and done:

- Duel modifiers as paper notes above the enemy's stones.
- Rewards read "~ and ~" and "or", without headings; then the reward form itself (radio
  choices, a grey Continue until every choice is made, nothing skippable).
- No pouch limit.
- Treasure chests choose the same way.

## Checked and fine

- **No console errors, page errors or native dialogs** in any browser run.
- **Every screen renders in both languages and both sizes:** title, act intro, map, pre-duel,
  duel, result, rewards (normal, elite, boss, gift), shop, campfire, workshop, treasure,
  events and their pickers, end screen, victory.
- **Act changes and the final victory** work end to end: boss beaten twice → reward → act intro
  → map; and on the last act, the victory screen with heat unlocked.
- **Engine tests** (83) pass. Map generation keeps the gift in reach on 2,000 seeds.

## Notes, not changed

- Toasts still briefly cover what is under them, now above the button bar: the enemy's name in a
  duel, a row of stones before one. They fade in two seconds.
- The shop's rows scroll sideways on a 360px screen. That is by design, but only the cut-off
  card hints at it.
- The headless bot wins about a third of its runs at heat 0, 9% at heat 5. Heats 1 to 4 are
  close together (23–38%): the heat steps may want spacing out.
