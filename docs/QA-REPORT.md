# QA report

A night of playing and fixing, after the + tier, the grouped talismans and the pre-rendered
music went in.

How it was checked:

- **The UI bot** (`tools/playtest.cjs`) through every act, in Czech and English, on a phone
  (390×664) and a small screen (360×640): no console errors, no page errors, no screen it got
  stuck on.
- **By hand**, with a harness that drops into a duel with a chosen board and hand: every + stone
  (Parrot+, Magnet+, Gravity+, Lasso+, Frog+, Bumper+, Firecracker+, Bonfire+) and Mind Control;
  every stone's card and its animation; talisman cards; the pouch; the shop; the campfire; the
  workshop; the end screen; both menus.
- **The run bot** (`node tools/runbot.mjs --runs 96`) and the engine tests (89).

## Fixed

| What | Where |
|---|---|
| The run bot crashed on borrowing a one-shot + stone under Open Hands. | engine `selectActions` |
| A one-shot Shift+ and a Shift made + by a talisman merged into one "×2" slot: the one-shot could not be chosen. | engine, duel hand |
| Copying with a Parrot+ was logged as "You: target top left". | duel log |
| Twin, Parrot and Parrot+ had no animation on their card (the sample board gave them nothing to do). | stone cards |
| Swap+ and Parrot had no caption under their animation; Shift+'s said "its row or column". | stone cards |
| A notification sat on top of an open card, over its text. It now sits above it. | style `#toast` |
| The title's yellow button disappeared when the save held a finished run. | title |
| The UI bot looped on rewards (a tap now opens the card) and on the pre-duel screen (it pressed "Back to the map"). | `tools/playtest.cjs` |

## Unified

- **Buttons**: dismissing is always the dashed button ("Close", "Back", "None", "Never mind");
  an action is yellow; other actions are plain. Info cards, the pouch and the share card used a
  plain "OK" or "Close".
- **The bottom bar**: every screen's way out and main action sit in it, the way out dashed on the
  left, the main action yellow on the right — pre-duel, campfire, workshop, end screen, event
  results. The campfire, workshop and end screen had their buttons in the middle of the page.
- **Picking**: a tap opens a stone's card, whose button takes or buys it — rewards, shop, and
  now the events that offer a stone too (they took it at once).
- **Menus**: neither the map's menu nor the duel's has a heading.
- **Words**: English says "talismans", as the Czech does ("relics" before).
- **Labels that wrapped** in the bottom bar ("Na začátek", the workshop's trade) are kept to one
  line.

## Music

Rendered ahead of time (see DESIGN.md, Music): every loop's seam was checked for a jump (all
within an ordinary sample step), the encoder's lead-in is skipped, and the title track starts on
the first tap.

## Notes, not changed

- Rarity stays as it was set after the + tier measurements (`docs/STONE-FAMILIES.md`).
- Bonfire+, Frog+ and Parrot+ add little over their regular forms; their talisman (Trickster's
  Hat, Frog and Parrot) is the one common one for that reason.
- The run bot wins 35–39 of 96 runs; act 1 is where most runs end, mostly to the boss's lines on
  the map and to the Old Oak.
