# Pif-paf-poe

Tic-tac-toe where the pieces move. Two players duel on a 3x3 board; 20–60 players fight those
duels over one big arena, in a campaign that runs an evening.

# What you are trying to do

Four nested layers, each fed by the one below:

| layer | you win it by |
|---|---|
| **campaign**, an evening | reaching the agreed score first |
| **arena**, a round | lining up three of your marks — that scores |
| **space**, a scrum | out-powering the other side there: duels won plus spare players |
| **duel**, two players | three of your stones in a row on a 3x3 board |

That is the order below, outside in. The arena is what an evening looks like; the duel is what you
actually play.

# The arena

Two teams, **X** and **O**, 10–30 players each. They take turns attacking an **arena** of
**spaces**, grouped into **zones** of nine. Spaces won take your symbol; three marks in a row
anywhere on the arena — any direction, across zone boundaries — scores.

**Size by headcount.** 6x6, four zones, 36 spaces, ~12 a side. 9x9, nine zones, 81 spaces, ~30
a side. Nothing else changes.

Every space prints one **stone type it switches off**, for both players, in every duel fought
there. So where you are sent decides which of your stones work. The pattern steps one across and
three down, so no line of three repeats a veto:

```
   --  sh  20  ro  mo  mg          --  neutral     mo  mountain
   ro  mo  mg  st  --  sh          sh  shift       mg  magnet
   st  --  sh  20  ro  mo          20  2048        st  stinky
   20  ro  mo  mg  st  --          ro  rotate
   mg  st  --  sh  20  ro
   sh  20  ro  mo  mg  st
```

The 9x9 continues the same pattern.

## Setting up

- **Hands.** Five random stones each.
- **Opening marks.** About a fifth of the arena, half to each side — four each on the 6x6, nine
  each on the 9x9 — so round one has ground worth fighting over. Place them in rotational pairs:
  for every X space, O takes the one half a turn about the centre away. Draw pairs one at a time,
  rejecting any that completes a three in a row.
- **First attacker gives back two.** Attacking first is worth something; that team removes two of
  its own opening marks.
- **Target.** 40 points on the 6x6, 170 on the 9x9 — about two dozen rounds either way.

## The round

One team attacks, one defends, swapping every round. The defence commits blind; the attack places
knowing exactly where the defenders stand. That asymmetry is the game: the defence cannot cover
everything, and the attack pays the price the defence set.

1. **Defence takes positions.** Every defender stands on any space, any number to a space.
2. **Attack takes positions.** Every attacker stands on a space with no symbol on it, having seen
   the whole defence.
3. **Pairing.** On each space, defenders pair off one to one with attackers; a defender with a
   choice picks. A defender with nobody to fight **must step** to an adjacent space where
   attackers outnumber defenders and pair up there. Only one with no unpaired attacker on or
   beside their space stands idle.
4. **Duels.** Every pair plays a duel on that space, **attacker first**.
5. **Taking spaces.** A side's **power** on a space is duels won there plus players left unpaired
   there. The attack takes the space if its power is **strictly higher**; level holds it for the
   defence.
6. **Marks.** Each zone may mark **one** of the spaces its attack took — or none.
7. **Scoring.** Count the attacker's three-in-a-rows, overlapping ones separately (a cross is two,
   four in a row is two). **n lines score n²** — 1, 4, 9, 16.
8. **Clearing.** Each scored line costs ground: one zone the line passed through is wiped of both
   symbols, and the **attack picks which**.
9. **Paying.** One **upgrade point** for standing on a space your side won, fought or not; one for
   winning your duel. So nothing, one, or two a round.

**Power, as rules of thumb.** Three attackers, two defenders: two duels, one attacker spare — win
both and it's 3–0, split and it's 2–1, lose both and it's 1–2 for the defence.

- **Twice the defenders plus one takes a space whatever the duels do.**
- **Twice the attackers denies it whatever the duels do** — level holds.

Between those, every extra body helps its own side. Nobody standing is wasted.

## Upgrade points

Spent between rounds, never expiring:

| | cost |
|---|---|
| **replace one stone** in your hand, your choice of both | **3 points** |
| **a Counterattack**, drawn at random, single use | **3 points** |

A campaign pays about eighteen, so expect to fix your hand first and buy Counterattacks with the
rest. Since the campaign's attacker moves first, **a Counterattack is only ever spent in a round
your team defends.**

# The duel

**Five stones** each, one placed a turn on a 3x3 board. Three in a row, orthogonal or diagonal,
wins. Hands may hold repeats and need not match.

The twist: most stones **do something when placed**, and what they do is move stones already on
the board, yours and theirs alike. A line can be made by moving a stone into it, and taken apart
by the next stone played. You never just pick a square — you pick a square and an effect.

```
0 1 2
3 4 5   Adjacent always means sharing an edge, never a corner.
6 7 8
```

**Who goes first** is decided at the table; in a campaign it is the attacker. The player moving
second is the only one who may hold and spend **Counterattacks** — that is their compensation.

## A turn

1. **Place** a stone from your hand on any free square. Only an opponent's Magnets and Stinkies
   (which say where) and Mind Control (which says which stone) ever narrow the choice.
2. **Resolve** its effect, if it has one. Not optional: you may place where the effect does
   nothing, but not decline an effect that works.
3. **Counterattack**, if you moved second and hold one.
4. **Check.** Your line wins; a line only your opponent has wins for them.
5. Pass.

Stones are never removed, so the ninth placement fills the board. **A full board with no line, or
a player to move with no stones, goes to whoever moved second.** There are no draws.

## The stones

Six types: three move things, one refuses to be moved, two dictate where the opponent may play.

- **Shift** — name a direction. This stone's row or column slides one step that way; what falls
  off the end wraps around.
- **2048** — name a direction. Every stone slides that way as far as it goes, as in the tile game.
- **Rotate** — pick a 2x2 block this stone belongs to. Those four squares turn one step clockwise.
- **Mountain** — does nothing, and nothing ever moves it. It **blocks rather than forbids**: other
  effects still happen, they just cannot move it or pass through it.
  - *2048* — each stretch of the line packs up on its own side of it.
  - *Shift* — a stone whose destination is the Mountain stays put, and so does anything behind it.
    Nothing wraps through a Mountain.
  - *Rotate* — the Mountain keeps its corner; each other stone advances if the corner ahead is
    free, or becomes free.
- **Magnet** — your opponent must place **adjacent** to it.
- **Stinky** — your opponent must place **not adjacent** to it.

Every direction and block stays legal; an effect that moves nothing is still a legal move.

**Magnets and Stinkies bind only the opponent, and all of them pull at once.** A square
**satisfies** a Magnet by being beside it, a Stinky by not being beside it. Count, for every free
square, how many of their restrictions it satisfies — **you must place where you satisfy as many
as any square can.**

So: two distant Magnets cannot both be answered, and either will do. Two overlapping ones can, so
the overlap is where you go. A Magnet against a Stinky leaves the squares answering one of them.
There is always somewhere to play, and with no restrictions down the whole free board is yours.
Neither wears off; both work from wherever their stone now stands, and one taken off the board
stops pulling.

## Spaces

Every duel is fought on a **space**, which **switches one stone type off** for both players. A
switched-off stone is still placed, still occupies its square, still counts towards a line — it
just has no effect. A dead Magnet binds nobody; a dead Mountain shoves like any other stone.
There is a space per type plus a neutral one. It changes which hands are good, so it matters.

## Counterattacks

Not stones, never placed, and **only the player moving second may spend one.** Hold as many as you
like, **present up to three** at the start so your opponent knows what they face, and **spend at
most one** per game, chosen with the board in front of you. Unspent ones are kept; only a spent one
is discarded.

All resolve at the end of your turn — after your stone, before the line check — so any of them can
finish a line.

- **Overtake** — if your opponent holds the centre, that stone goes back to their hand. Not a
  movement, so a Mountain is not safe from it.
- **Relocate** — move one of your stones to any free square. It resolves nothing on arrival.
- **Mirror** — swap what stands on one pair facing through the centre (0–8, 1–7, 2–6, 3–5),
  whoever owns it. Not a movement, so it moves even a Mountain.
- **Mind Control** — name a stone in your opponent's hand; that is what they must play next turn.
- **Rehearse** — resolve one of your stones on the board again, from where it now stands. Not one
  the space has switched off.

# Making a set

Everything printable lives in `paper/`: one stylesheet, an SVG per drawing, and HTML built from
`ppp-` elements. Open a document in a browser and print it — there is nothing to build. Printed
text is Czech, the language of the table; names follow RULES.cs.md.

- `pnp-stones.html` — 48 stones, X on the top half and O on the bottom, four of each type a
  side. A player needs about twelve — two of each type — so one sheet serves four.
- `pnp-marks.html` — plain X and O symbols to cut out and lay on the overview map, marking who
  holds a space.
- `pnp-counterattacks.html` — one roster card per player, four to a sheet: every Counterattack,
  its rule, and eight circles — fill one when bought, cross it off when spent. At the foot, the
  upgrade points that buy them: twenty-four circles, about what a campaign pays — fill one when
  earned, cross three off for a purchase.
- `pnp-arena.html` — the arena as nine sheets, a zone to a sheet, named by the Czech compass —
  SZ, S, SV, Z, C, V, JZ, J, JV; each space carries its name (zone plus place in it, SZ1–SZ9) and
  its switched-off type along the top, leaving the middle for a symbol. The first four sheets
  (SZ, SV, JZ, JV) make the 6x6; all nine make the 9x9. Print the set twice: trim one to the
  border and glue it into the overview map for the central location, cut the other into single
  spaces to hang at the duel stations.
- `rules-stones.html` — not for cutting: the six types, each with a board before and after its
  effect.
- `rules.html` — RULES.cs.md as a printable document, verbatim, with the type icons inline.

Everything is black, so any printer will do. Print at 100% with no fit-to-page, on card if you have
it, and cut down the middle of the gaps: nothing is printed to cut along, so a wobbling cut leaves
no line on the piece.

`paper/ppp.css` is the whole vocabulary — a `ppp-grid` of `ppp-row`s of `ppp-square`s, a
`ppp-stone player="O" type="stinky"` in a square, a `ppp-mark player="O"` on a taken arena space, a
`ppp-then dir="up"` between two boards — so a page of your own is written the same way, and sizes
are custom properties.
