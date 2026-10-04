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

Composed themes rendered with FluidSynth and a General MIDI SoundFont (see DESIGN.md, Music),
replacing the first, oscillator-built tracks. Every loop's wrap was checked on the decoded MP3:
all are within an ordinary sample step (the limiter had delayed the audio against the loop points,
which clicked; it now compensates). The title track starts on the first tap.

## Notes, not changed

- Rarity stays as it was set after the + tier measurements (`docs/STONE-FAMILIES.md`).
- Bonfire+, Frog+ and Parrot+ add little over their regular forms; their talisman (Trickster's
  Hat, Frog and Parrot) is the one common one for that reason.
- The run bot wins 35–39 of 96 runs; act 1 is where most runs end, mostly to the boss's lines on
  the map and to the Old Oak.

## Second pass

Fixed:

- The end screen's Title and New run sat small in the middle of the page; they span the bottom
  bar now, as on every other screen.
- The pouch's Close floated mid-sheet with empty paper below it; the buttons of every tall sheet
  (pouch, workshop, choosing a stone or a one-shot) sit at its foot, as in the log.
- Card animations pulse the acted-on stones in opacity, not size.
- Portraits that the sketch filter washed out: the Storm Caller (⛈️, a white cloud on white) is
  an eagle, the Grandmaster's crown a black chess king, the Carpenter's saw a hammer.

To decide (larger, or a matter of taste):

- **Result note**: its Continue is white on the pink/green note, the one action that is not
  yellow. Deliberate (yellow on pink clashes), but an exception to the rule.
- **Gift and treasure screens**: two small cards at the top, an empty page, and a disabled
  "Choose first" in the bottom bar. The cards could be larger and centred, and the bar could hold
  a "Skip" (dashed) instead of a disabled button: now a talisman you do not want must be taken.
- **Events**: the choices are cards in the page, and Move on is one of them, not the dashed
  button in the bottom bar used everywhere else.
- **Workshop pick**: stones show an ⓘ beside their name (a tap picks, so the card is behind the
  ⓘ); elsewhere a tap opens the card. Consistent within itself, but a second idiom.
- **Names from removed stones**: Turncoat Fox (Turncoat) and Tile Bot 2048 (2048, now Gravity+)
  are named after stones that are gone. They still read as names, but a rename would fit the
  stones they play now.
- **Two owls**: the Grand Tactician and the Night Owl event share 🦉.
- **Pip's portrait** (a yellow chick) is pale after the sketch filter; readable, the faintest left.

## Third pass: the open questions, decided

- **Result note**: Continue left the note for the bottom bar, a big yellow button like every
  screen's main action. The note keeps the title and the reason; a win is a mint note now, so
  the yellow button stands out (a loss stays pink).
- **Gift and treasure screens**: left as they are.
- **Events**: the way past an event ("Leave", "Tiptoe past", "No thanks"…, marked `leave` in
  `content.js`) is the dashed button in the bottom bar, and it leaves at once. The page holds
  only the real choices.
- **Choosing stones**: before a duel and in the workshop, each stone has a pencilled box in its
  corner. Ticking the box chooses it at once; a tap on the stone opens its card, whose button
  says Select or Deselect. The workshop's ⓘ beside a name is gone.
- **No more long press**, anywhere. Cards on the reward and shop screens opened on a tap
  already. In a duel, a tap picks a stone up and the line under the hand shows ⓘ for its card;
  out of your turn, or while its effect is chosen, a tap opens the card.
- **Names**: Turncoat Fox is the Swindler Fox (Prohnaná liška), "Let's trade places. Trust
  me."; Tile Bot 2048 is the Tilt Bot (Sklápěcí robot): its Gravity+ tilts the board.
- **Two owls**: the Grand Tactician is an octopus (🐙); the Night Owl keeps 🦉.
- **Pip**: every chick emoji washes out under the sketch filter, so Pip is a penguin (🐧).

The UI bot (`tools/playtest.cjs`) ticks boxes, uses the event's bottom bar and the result's bar:
five runs, Czech and English, phone and small screen, no errors and no stuck screens.
