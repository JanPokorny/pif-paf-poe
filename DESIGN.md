# Pif·Paf·Poe — design notes

What the roguelike kept from the camp game, what it changed, and the measurements behind the
numbers. The camp game's own reasoning is in `old/adr/`.

## Kept from the camp game

- **The duel.** 3×3, one stone a turn, most stones move stones already on the board. Three in a
  row wins; a line only your opponent has wins for them.
- **Restrictions compose.** Every enemy Magnet and Stinky pulls at once and you place
  where you satisfy as many as any square can (`old/adr/2026-08-18-…`).
- **Counterattacks → one-shot stones.** The camp game's counterattacks became tricks, spent
  at the end of a turn; now they are stones like any other, brought along like any other and placed on the
  board, that then do their one thing (Relocate, Mind Control, Muffle, and + stones). Once played in a duel, won or lost, one is gone from the pouch. They
  have a dashed outline, come as their own reward and shop shelf, and are cheaper than stones.
  Encore, which handed back your last special stone, did not survive the change.
- **Boss rules** come from an older iteration's sheet of special rules (Taktika, Náskok, Elko,
  Lep, Sloup, Špion, Reservé).

## A slower tempo

The first version ran fast: a hand of five or six stones, all of them spent by the end of a
duel, and a rule for who wins when someone runs out. The second version slows it down.

- **Energy.** What you bring into a duel is a decision of its own: every special stone costs
  energy (common 1, uncommon 2, rare 3, a dot each in the stone's corner), and together they may
  cost no more than you have. A run starts with 1. Beating an elite gives 1, an act's boss 2;
  every shop sells 1 (once a visit), the Meditating Monk trades one for a max heart or 40 gold,
  and Second Wind (a boss relic) adds 1. Picking stones before a duel fills a bar of dots.
- **Rewards are a form.** Each row of a reward is yours ("~ and ~" between rows); a row that
  offers a choice ("or" between its cards) works like radio buttons, and Continue stays grey
  until every choice is made, then takes it all. Nothing can be skipped.
- **No Pebbles in the pouch.** Pebbles are free and never owned: they fill your hand up to four
  stones at the start of a duel, and the enemy's up to five (it opens, so a full board takes five
  of its stones). A side whose hand is empty on its turn finds a Pebble ("You found a pebble!"),
  so nobody ever passes. A stone sent back off the board goes back into its owner's hand. A full
  board (or forty turns) goes to whoever moved second. The pouch holds any number of stones.
- **Enemies grow as you do:** one special stone in act 1, two in act 2, three in act 3; an elite
  brings one more. Measured at the energy a player has by then (1, 4, 8: `node tools/lab.mjs
  enemies --energy 1,4,8`).
- **The enemy always opens**, so a full board is always yours, as a **draw**: it counts as a
  win (the reward, the square), but costs you a heart. Holding out is a way through, not a free
  one. Plain tic-tac-toe is a draw, so the opener's specials are what make a duel winnable for it.
- **No spaces, no vetoes.** The spaces that switched a stone type off are gone. Regular enemies
  bring stones and, sometimes, a *condition* for both sides: **Gravity** (after every turn every
  stone falls as far as it can), **Hollow** (nobody plays the centre), **Open Hands** (either side
  may play a special stone from the other's hand, as its own). Some enemies have one as a home
  rule; others roll one (25% in act 1, 35% in act 2, 40% in act 3, more for elites).
- **Bosses bring no stones.** Only Pebbles, and rules in their favour: **Tactics** (it names the
  stone you play), **Head Start** (it plays twice on its first turn), **Elbow** (rows do not
  count: an L of three wins), **Clinch** (you must place beside one of its stones; a diagonal threat is stopped with a mover or a restriction, not by placing), **Column**
  (it closes a column to you each turn), **Spy** (it names the direction your stones move),
  **Reserved** (the centre is its alone), **Patience** (a full board is its), **Double Time**
  (every turn is two stones in a row, for both sides, the boss first). The dictating rules
  are a phase of their own after the boss's turn, searched by the same AI as every other choice.
  They are the bosses at the end of each act (below).
  Double Time is the hard one, and it wants a particular loadout. Bot duels, 20 each: Pebbles
  only or two Mountains win 0%, movers (Shift and Waltz, Rail/Pivot/Teleport, 2048/4096)
  20–40%, restrictions (Magnet and Stinky, and their evolved forms of the time)
  95–100%. A boss's undead phase adds Reserved, and then restrictions alone drop to
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
- **Sight.** A mark brings the paper round it into view two squares deep, but only the squares
  next to an X or an O can be taken, by you or by the boss. The outer ring is on view, dimmed:
  you see what lies past the square you step on before you commit a line to it.
- **The lair.** The boss's lair takes the place of one of the obstacles next to its first mark: a
  wall like any other, until your three in a row opens it.
  Open, it glows, and tapping it starts the boss duel. You may step back to the map from the
  boss as from any duel; it waits in its lair as it was, risen already if you beat it once.
  Lose to it and it throws you out (−1 ❤): the lair shuts, and another line of three opens it
  again, the boss still risen if you had beaten it once.
  The boss's three in a row costs you a heart (two made it the last blow in a quarter of the bots' runs). There is no page limit any more: the lair opens
  only to your line, and when nothing on view is free the boss moves again (into the fog beside
  the page if it must) until something is.
- **Spent lines.** Every line of three is crossed through on the page, and its marks are spent:
  no later line may use them, so a fourth mark beside a line, or a fork sharing its square, makes
  nothing new. A mark that finishes two lines at once crosses through only one.
- **Rocks.** On an open page two open squares are already a double threat, and a line came in
  about five steps 95% of the time. So the page lays rocks on a lattice — (x + 3y) mod 7 in two
  classes, shifted so you never start on one — plus scattered ones, likelier the further you
  have spread and the more live lines you hold. Rocks take about a third of the page; a bot that
  plays for its line gets one before the page fills 62% of the time, in about seven steps
  (`node tools/maprocks.mjs`). Nothing breaks a rock.
- **No forks at the start.** Within three squares of the boss's first mark, no two open lines of
  three share a square, so every line there is a single threat the boss can block. Lines through
  the boss's first mark count too (they once were left out, and nearly every page let the boss
  fork with its first answer): only the mark's own square may be shared. The 9×9
  around the start is laid out when the page is made: the lattice, then greedily the rock that
  breaks the most overlaps until none are left, then every rock the rule does not need is
  cleared again (random order). That leaves about 38% rock there, and keeps at least fifteen
  squares connected to the start. With it the line-building bot opens the door before the page
  fills 34% of the time, in about nine steps (62% and seven steps without).
- **Bosses** bring no stones, only their rule (above), and are beaten twice: once beaten, the moon
  rises and the boss climbs back out of the earth as its undead self ("Undead Old Oak"), with its
  harder rule. A boss won is a boss relic, three hearts and 60 gold. **Elites** are just
  stronger regular enemies: bigger hands, a red star in the corner. A lost duel costs one heart, elite and boss alike.
- **No map aids.** Duels used to offer a *Double Step* (the boss skipped a reply) or a *Pickaxe*
  (broke a rock) instead of a stone; they are gone. A duel's reward is stones, gold and relics.
- **The page by distance** (`node tools/mapgen.mjs`, measured over whole explored pages):
  obstacles are densest near the start, where the fork-free layout holds (about half of rings
  1–4), and thin out ring by ring (a quarter by ring 9). Empty squares — nothing on them, just the
  X — grow from ring 2, and from ring 10 the page is nothing else, so a page holds a finite number
  of everything: about sixty encounters, none past ring 8. Elites grow from 2% of encounters next
  to the start to a quarter far out, and the act's stronger enemies (by how hard they think) gather
  further out (strength rank 0.3 near, 0.7 far). Kinds keep apart: each of the same kind within two
  squares makes another much less likely (a third for duels, a seventh for the rest), good squares
  avoid each other too, and the same enemy never appears within three squares. A line-building
  bot opens the door on every page, in about sixteen steps.
- **Terrain by act.** The Meadow's obstacles are firs and its empty ground tiny shrubs; the
  Quarry's are boulders and gravel; the Summit's crags and tufts of grass in the snow.

Balance was measured and retuned with `tools/lab.mjs`; the run bots (see Difficulty) win a third to two thirds of their runs at heat 0.

## The stones

18 special stones and the Pebble, three of them glass by nature (Relocate, Muffle, Mind Control).
Every stone's card shows an example computed by the engine.

- **No restriction ever leaves you without a square.** Every rule and stone narrows where you
  may place only as far as some square is left ("if you can" is implied, never written).
- **"Beside" always means the four squares that share a side**, for every stone and boss rule
  (Clinch included). The map is the one place where "next to" counts corners.
- **The + tier.** Eleven stones have a + form, the same stone with a wider effect (usually from
  beside to its whole row and column). A + stone comes in glass (in glass rewards and shop
  shelves) or through a talisman that makes every stone of that kind you bring its + form,
  offered only for kinds in your pouch. A + stone has a small + in the corner of its face.
  Magnet has none: a Magnet reaching its whole row and column narrowed the enemy less than one
  reaching only beside it.
- **Materials.** A stone is plain, or one of three materials:
  - **glass** (a dashed outline): played once, then gone from the pouch; always the + form where
    there is one, always 1 energy. The one-use stones of old are glass.
  - **marble** (a cut, many-sided outline): goes anywhere, whatever the other side's stones
    restrict (conditions and boss rules still hold). One energy more. Enemies from act 2 on
    sometimes bring it.
  - **gold** (a glinting gold rim): +10 gold for each gold stone in your winning three in a row.
    One energy more. Only yours.

  Marble and gold turn up now and then among rewards and in the shop (dearer there), at the
  workshop (made from a stone of yours, for gold, in place of a trade) and from the Stonemason
  event. A trade at the workshop keeps the material of what went in. + talismans upgrade them
  as any stone.
- **Mountain is only a wall**: nothing moves it, but it obeys restrictions like any stone.
  Going anywhere is marble's now.
- **Rarity follows power** (`node tools/lab.mjs matrix`, `power`, `effects`), and power decides
  the energy cost.

`docs/STONE-FAMILIES.md` has every stone, its + form and their measurements.

## Difficulty

Enemies are the same Monte Carlo search as the camp game's AI (`src/ai.js`), dialled by
iterations and a blunder rate. `node tools/balance.mjs` duels a bot with a typical pouch against
every enemy (`--life 1` for a boss's undead phase); `node tools/runbot.mjs` plays
whole runs headless; `node tools/lab.mjs` measures stones, enemies and bosses in bulk.

A typical pouch for the act (what the act's energy, 1, 4 and 8, pays for), 250 iterations and 5%
blunders, against each boss (`node tools/lab.mjs tune`): at first 57–91% and risen 49–69%.

At heat 0 (six hearts), bots that play the map sensibly, pick their stones by strength and keep one that moves things win:

| player bot | runs won |
|---|---|
| 80 iterations, 20% blunders | about 15% |
| 150 iterations, 10% blunders | about 36% |
| 300 iterations, no blunders | about 57% |

(With energy the bot reaches about 1, 4 and 9 energy in the three acts. Before energy, when the
hand grew with bought slots, the same bots won about 30%, 54% and 69%.)

Heat 1–5 raises it after each win: deeper search, dearer shops, a heart fewer,
bigger elite hands, no blunders.

## Tests

- `node tools/test-engine.mjs` — every stone, condition and boss rule against its own
  text, plus a 20,000-game fuzz of
  invariants.
- `node tools/runbot.mjs` — whole runs, including the save format's JSON round trip.
- `node tools/smoke.mjs` — random duels with everything switched on, and the AI's timing.
- `eslint -c eslint.config.mjs src/` — undefined names (a renamed variable once froze the Whirl).

## Music

The music is composed by hand and rendered ahead of time with off-the-shelf tools: the
FluidSynth synthesiser playing the FluidR3 General MIDI SoundFont (MIT licence), ffmpeg for
cutting, levels and MP3. `tools/music/score.py` is the score: each act's theme (a 16-bar melody
and chord progression written in scale degrees), key, mode, tempo and instruments, and the act's
one arrangement of it in layers. `python3 tools/music/build.py` renders it to `music/*.mp3` with
`music/tracks.json`, then `node tools/music/measure.cjs` (with the dev server up; `PORT` if not
8080) records where a browser's decode starts. Needs `apt-get install fluidsynth
fluid-soundfont-gm ffmpeg` and `pip install mido`.

| act | key | tempo | instruments |
|---|---|---|---|
| 1 | C major | 108 | flute, piccolo, celesta, harp, strings, bass; horn for the boss |
| 2 | D dorian | 104 | clarinet, marimba, vibes, strings, bassoon; trombone for the boss |
| 3 | A minor | 112 | oboe, horn, harp, tremolo strings, contrabass, timpani; brass for the boss |

Each act is one continuous piece, 32 bars: the theme, then the theme again in another voice. It
is rendered in three variations that pick which layers sound and how hard: map, sparse (whole-note
bass, a slow arpeggio, light percussion in the second half), also for shops, rests, workshops,
treasure, rewards and events; duel, fuller (driving bass, pizzicato, drum kit); and boss, also for
elites, everything with a low brass lead, cello, timpani and heavy drums. A layer plays the same
notes at the same moments in every variation that has it. The three share tempo, key and loop
length to the sample, so the game (`src/music.js`) crossfades between them at the same point of the loop and the music
plays on as one. A new act, the title (a music box), victory (brass) and defeat (piano) crossfade
in from the top. Each act has a stinger per music event (win, lose, door, stronger, heal) in its
key, played on the track's next beat with the band ducked under it. Live scheduling used to drift
and crackle whenever the page was busy.

Each loop is rendered three times with the same notes and the second pass kept, so the echoes of
its end ring into its start; its first 50 ms are blended from what follows its end, so the wrap
is seamless. Half a second either side is kept in the file and never played (an MP3 is inexact at
its edges): the manifest's `offset` and `seconds` say where the loop is.

