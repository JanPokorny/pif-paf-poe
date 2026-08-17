# Pif-paf-poe

Tic-tac-toe where the pieces move. Two players duel on a 3x3 board; twenty to sixty players fight
those duels for one big arena of four or nine zones, in a campaign that runs an evening.

Read the duel first — the campaign is built on it.

# The duel

You each hold **five stones** and place one a turn on a 3x3 board. Three in a row, orthogonal or
diagonal, wins.

The difference from tic-tac-toe is that most stones **do something when placed**, and what they
do is move stones already on the board — yours and your opponent's. So a line can be made by
moving a stone into it rather than by placing one there, and a line you were about to complete
can be taken apart by the stone your opponent plays next. You are never only choosing a square;
you are choosing a square and an effect.

Squares are numbered left to right, then top to bottom:

```
0 1 2
3 4 5
6 7 8
```

**Adjacent** always means sharing an edge, never a corner.

## A turn

Hands may hold repeats, and the two hands need not match. Who goes first is decided at the
table — in a campaign it is always the attacker. **The player who moves second is the only one
who can spend a Counterattack**, which is what compensates them for moving second.

On your turn, in order:

1. **Place** a stone from your hand on any free square. The only thing that ever narrows the
   choice is an opponent's Magnet or Stinky.
2. **Resolve** its effect, if it has one. This is not optional: you may place a stone where its
   effect has nothing to do, but you may not place it where the effect works and decline it.
3. **Counterattack** — if you moved second and hold one, you may spend it now.
4. **Check.** If you have three in a row you win; if only your opponent does, they win.
5. Pass the turn.

Stones are never removed, so the ninth placement fills the board. **If the board fills with nobody
in a line, the player who moved second wins** — as they do if the player to move has no stones
left. There are no draws.

## The stones

Six types. Three of them move things, one refuses to be moved, and two dictate where the
opponent may play.

**Shift** — name a direction. The row or column this stone sits in slides one step that way, and
whatever falls off the end wraps around to the other end.

**2048** — name a direction. Every stone on the board slides that way as far as it can go, just
as in the tile game.

**Rotate** — pick one of the 2x2 blocks this stone belongs to. Those four squares turn one step
clockwise.

**Mountain** — does nothing when placed, and nothing ever moves it. It **blocks rather than
forbids**: other effects still happen, they just cannot move it or pass through it.

- **2048** — stones cannot slide past it, so each stretch of the line packs up on its own.
- **Shift** — a stone whose destination is the Mountain stays put, and so does anything queued
  behind it. Nothing wraps through a Mountain.
- **Rotate** — the Mountain keeps its corner; each of the other three advances if the corner
  ahead of it is free, or becomes free.

Every direction and block always stays legal. An effect that moves nothing is still a legal move.

**Magnet** — your opponent must place their stones **adjacent** to this one.

**Stinky** — your opponent must place their stones **not adjacent** to this one.

Those two bind only the opponent, never their owner. If no free square satisfies the
restriction, it does not apply that turn. Neither wears off, and **only one is ever in force** —
the most recently placed, working from wherever its stone now stands. Placing either one
replaces the other, whoever owned it.

## Spaces

A duel is always fought on a **space**, and every space **switches one stone type off** for both
players. A switched-off stone is still placed, still occupies its square and still counts towards
a line — it simply has no effect. A dead Magnet or Stinky binds nobody; a dead Mountain shoves
around like any other stone.

There is a space for each of the six types, and a neutral space that switches nothing off. Which
space you are on changes which hands are good, so it matters more than it sounds.

## Counterattacks

A Counterattack is not a stone and is never placed. **Only the player who moves second can spend
one.**

Hold as many as you like, **present up to three** at the start of the game so your opponent knows
what they face, and **spend at most one**, chosen with the board in front of you. An unspent
Counterattack is kept for another game; only a spent one is discarded.

All of them are spent at the end of your turn — after your stone has resolved, before the check
for three in a row — so any of them can finish a line.

**Overtake** — if your opponent holds the centre square, take that stone off the board and back
into their hand. It is not a movement effect, so a Mountain is not safe from it.

**Relocate** — move one of your own stones to any free square. It resolves nothing on arrival.

**Mirror** — pick one of the four pairs facing each other through the centre — 0 and 8, 1 and 7,
2 and 6, 3 and 5 — and swap what stands on them, whoever owns it.

**Mind Control** — name a stone in your opponent's hand. That is what they must play next turn.

**Rehearse** — resolve one of your stones on the board again, from wherever it now stands. A
stone the space has switched off cannot be rehearsed.

# The campaign

Two teams, **X** and **O**, of ten to thirty players each. They take turns attacking one
**arena**, divided into **zones** of nine spaces each. Spaces you win take your symbol; three
in a row anywhere on the arena scores; first to the agreed score wins the evening.

Every space of the arena has a stone type printed on it, switched off for every duel fought
there. So where you are sent decides which of your stones work.

## The arena

**Pick the size by the headcount.** Four zones in a 2x2 — a 6x6 arena, 36 spaces — suits about
twelve a side. Nine zones in a 3x3 — a 9x9 arena, 81 spaces — suits about thirty. The rules do
not otherwise change.

Three in a row **anywhere on the arena** scores, in any direction, across zone boundaries as
freely as within one.

Each space's printed veto follows a fixed pattern, stepping one across and three down, so that
no line of three repeats a veto:

```
   -  S  2  R  M  M          -  neutral      S  shift
   R  M  M  S  -  S          2  2048         R  rotate
   S  -  S  2  R  M          M  mountain     M  magnet
   2  R  M  M  S  -                          S  stinky
   M  S  -  S  2  R
   S  2  R  M  M  S
```

The 9x9 continues the same pattern.

## Setting up

- **Hands.** Everyone draws five stones at random.
- **The opening position.** Mark about a fifth of the arena before play, half to each side —
  **four spaces each on the 6x6, nine each on the 9x9** — so that the first round already has
  ground worth fighting over. Place them in rotational pairs: for every space X starts on, O
  starts on the one half a turn about the centre away from it. Draw the pairs one at a time and
  reject any pair that would complete a three in a row.
- **The first attacker gives back two.** Attacking first is worth something, so the team that
  goes first removes two of its own opening marks.
- **The target.** Agree what to play to: **40 points on the 6x6, 170 on the 9x9**. Either is
  about twenty-three rounds.

## The round

One team attacks, the other defends, and they swap every round. The defence commits without
knowing where the attack will go; the attack then places knowing exactly where the defenders
are. That asymmetry is the game: the defence cannot cover everything, so it has to decide what
is worth covering, and the attack has to buy the spaces it wants at the price the defence set.

1. **The defence takes positions.** Every defender stands on a space, any space, as many to a
   space as you like.
2. **The attack takes positions.** Every attacker stands on a space with no symbol on it,
   having seen the whole defence. Again, as many to a space as you like.
3. **Pairing.** On each space, defenders pair off one to one with attackers, and a defender
   with a choice picks their opponent. **A defender with nobody to fight must step** to an
   adjacent space where attackers outnumber defenders, and pair up there. Only a defender with
   no unpaired attacker on their space or beside it stands idle.
4. **The duels.** Every pair plays a duel on that space, **attacker moving first**.
5. **Taking the spaces.** Each side's **power** on a space is the duels it won there plus its
   players left unpaired there. **The attack takes the space if its power is strictly higher**;
   level power holds it for the defence.
6. **Placing the marks.** Each zone may mark **one** of the spaces its attack took, with the
   attacking team's symbol — or none, if none is worth having.
7. **Scoring.** Count the attacking team's three-in-a-rows, overlapping ones separately: a cross
   is two, four in a row is two. **n lines in one round score n²** — 1, 4, 9, 16.
8. **Clearing.** Every scored line costs ground. For each one, **one** zone that the line
   passed through is wiped clean of both teams' symbols, and **the attack picks which zone**.
9. **Paying.** Everyone standing on a space their side won — attackers on a space taken,
   defenders on a space held, whether they fought or not — takes **one upgrade point**.

### Reading a space

Power is the whole of the tactics, and it comes to two rules of thumb.

Say three attackers meet two defenders. Two pairs fight, one attacker is left over. If the
attack wins both duels its power is 2 + 1 = 3 against 0, and it takes the space; one duel each
makes it 1 + 1 = 2 against 1, still enough; lose both and it is 0 + 1 = 1 against 2, and the
defence holds.

- **Twice the defenders and one more takes a space whatever the duels do.** Five attackers
  against two: three are left over, so losing both duels still wins it 3 to 2.
- **Twice the attackers denies it whatever the duels do.** Two defenders against one attacker:
  one fights, one is spare, so even losing the duel leaves the defence level — and level holds.

Between those two, every extra player on either side helps their own side, and nobody standing
on a space is wasted: an unpaired defender holds just as an unpaired attacker takes.

## Upgrade points

Points are spent between rounds, on one of two things:

| | cost |
|---|---|
| **replace one stone** in your hand, your choice of both | **2 points** |
| **a Counterattack**, drawn at random, single use | **2 points** |

Nothing else costs points and they never expire. A campaign pays a player about twelve, so
expect to finish your hand first and buy Counterattacks with what is left.

Counterattacks bought here are held under the duel's rule — as many as you like, present up to
three, spend at most one, unspent ones kept. Since the campaign's attacker moves first, **a
Counterattack is only ever spent in a round your team defends.**

# Making a set

Five A4 sheets print the game, at `print/`:

- `stones-x.svg` and `stones-o.svg` — 48 stones a sheet, eight of each of the six types, the
  type's icon in the middle of the symbol. Eight hands, so print one of each per eight players.
- `counterattacks.svg` — ten cards, two of each of the five, the rule on the card.
- `arena-small.svg` and `arena-big.svg` — the 6x6 arena and the 9x9. Zones are drawn heavy and
  every other one tinted; each space carries the type it switches off in one corner and keeps
  its middle free for the symbol of whoever takes it.

Everything is black, so any printer will do. Print at 100% with no fit-to-page, on card if you
have it, and cut the stones along the grid. `node print.js` writes all five again.
