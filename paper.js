// The game as elements. Everything you can put on a page -- a stone, a board, an
// arena, a Counterattack card -- is an element with a `ppp-` name, and a page is a
// sentence of them:
//
//    <ppp-grid>
//      <ppp-row>
//        <ppp-square><ppp-stone player="O" type="stinky"></ppp-stone></ppp-square>
//        <ppp-square></ppp-square>
//        ...
//
// Three kinds of file come out of here, and each does one thing:
//
//    paper/icons/*.svg   one drawing each, from icons.js and nothing else
//    paper/ppp.css       what every element is, in element names and custom
//                        properties -- there is not a class in the file
//    paper/*.html        documents that say what is on them, and no more
//
//   node paper.js                     write them all into paper/
//   node paper.js --out somewhere     write them somewhere else
//
// The sheets you print and cut up are four of those documents. The point of the
// split is the fifth: a page of rules or a tutorial is written in the same elements,
// so an illustration is a position rather than a picture of one, and resizing every
// stone on it is one custom property. paper/example.html is that, and its positions
// come out of the engine, so they cannot disagree with the game.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { setArena, SPACES, VETO, WIDTH, ZONES, ZONE_SPACES } from './arena.js';
import { applyAction, createGame, ITEMS, STONE_TYPES } from './engine.js';
import { ICONS, svg } from './icons.js';
import { arg } from './sim.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

// Zones are named by where they lie, so a 2x2 arena has NW NE SW SE and a 3x3 fills
// in the middle bands: N, W, C, E, S. A space is then its zone and its place within
// it, counted along the rows -- NW1, NW2, NW3 across the top of NW -- which is short
// enough to shout across a hall and needs no ruler to find.
const BANDS = {
  2: { rows: ['N', 'S'], cols: ['W', 'E'] },
  3: { rows: ['N', '', 'S'], cols: ['W', '', 'E'] },
};

function spaceName(s, zones) {
  const { rows, cols } = BANDS[zones];
  const zone = rows[(s.y / 3) | 0] + cols[(s.x / 3) | 0] || 'C';
  return zone + ((s.y % 3) * 3 + (s.x % 3) + 1);
}

// ── The stylesheet ──────────────────────────────────────────────────────────

// One line a type is the only place in the whole set where a name meets a drawing.
// Everything that shows a type -- a stone, an icon in a sentence, the veto printed
// on an arena space, a card -- picks it up from the same custom property.
const drawings = () => [
  ...[...STONE_TYPES, 'neutral'].map((t) => [
    `ppp-stone[type="${t}"], ppp-icon[type="${t}"], ppp-space[veto="${t}"]`, t]),
  ...ITEMS.map((i) => [`ppp-card[item="${i}"], ppp-icon[item="${i}"]`, i]),
].map(([selector, file]) =>
  `${selector} { --ppp-drawing: url("icons/${file}.svg"); }`).join('\n');

const stylesheet = () => `/* Pif-paf-poe, as elements. Written by paper.js -- change it there.
 *
 * Every rule hangs off an element name or an attribute, so the markup of a page
 * stays a description of the game rather than of its styling: no classes, and
 * nothing to remember but the element names and these properties.
 *
 * Sizes are millimetres, since most of this ends up on paper. Set any of them on
 * a page, or on any element, and everything inside follows:
 *
 *    --ppp-stone     a stone, symbol and all
 *    --ppp-glyph     a type's icon on its own, inline in a sentence
 *    --ppp-square    a square of a duel board
 *    --ppp-space     a space of the arena
 *    --ppp-pitch     stone to stone on a sheet you cut up
 *    --ppp-card-*    the size of a Counterattack card, and of its icon
 */

:root {
  --ppp-ink: #000;
  --ppp-fine: #6d6d6d;          /* what is worth saying quietly */
  --ppp-rule: #c9c9c9;          /* a line that is not a cut line */
  --ppp-tint: #f1f1f1;          /* every other zone of the arena */
  --ppp-font: Helvetica, Arial, sans-serif;

  --ppp-stone: 30mm;
  --ppp-glyph: 6mm;
  --ppp-square: 26mm;
  --ppp-space: 32mm;
  --ppp-pitch: 34mm;
  --ppp-card-width: 94mm;
  --ppp-card-height: 36mm;
  --ppp-card-icon: 20mm;
  --ppp-gutter: 12mm;
}

html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { margin: 0; background: #fff; color: var(--ppp-ink); font-family: var(--ppp-font); }

/* ── A stone, and a type on its own ──────────────────────────────────────── */

/* The symbol fills the stone and the type's icon sits in the disc punched through
 * its middle: two background layers, the icon first because first is on top. */
ppp-stone, ppp-icon {
  display: inline-block;
  vertical-align: middle;
  background-repeat: no-repeat;
  background-position: center;
}

ppp-stone {
  width: var(--ppp-stone);
  height: var(--ppp-stone);
  background-image: var(--ppp-drawing, none), var(--ppp-symbol, none);
  background-size: 51% 51%, 100% 100%;
}

ppp-stone[player="X"] { --ppp-symbol: url("icons/symbol-x.svg"); }
ppp-stone[player="O"] { --ppp-symbol: url("icons/symbol-o.svg"); }

/* A mark is a symbol and nothing else -- a plain X or a plain O -- which is what a
 * side puts on a space of the arena it has taken. */
ppp-mark {
  display: inline-block;
  vertical-align: middle;
  width: var(--ppp-stone);
  height: var(--ppp-stone);
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
  background-image: var(--ppp-symbol, none);
}

ppp-mark[player="X"] { --ppp-symbol: url("icons/mark-x.svg"); }
ppp-mark[player="O"] { --ppp-symbol: url("icons/mark-o.svg"); }

ppp-icon {
  width: var(--ppp-glyph);
  height: var(--ppp-glyph);
  background-image: var(--ppp-drawing, none);
  background-size: 100% 100%;
}

${drawings()}

/* ── A board, and a hand ─────────────────────────────────────────────────── */

ppp-grid { display: inline-block; border: 0.5mm solid var(--ppp-ink); }
ppp-row { display: flex; }

ppp-square {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--ppp-square);
  height: var(--ppp-square);
  border-right: 0.2mm solid var(--ppp-rule);
  border-bottom: 0.2mm solid var(--ppp-rule);
}

ppp-square:last-child { border-right: 0; }
ppp-row:last-child > ppp-square { border-bottom: 0; }
ppp-square > ppp-stone { width: 86%; height: 86%; }

ppp-hand { display: inline-flex; align-items: center; gap: 2mm; }

/* A row of boards, hands and arrows, lined up on their middles. */
ppp-figure {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6mm;
}

/* Between two boards: what the effect did. */
ppp-then {
  display: inline-block;
  vertical-align: middle;
  width: 14mm;
  text-align: center;
  font-size: 7mm;
}
ppp-then::before { content: "\\2192"; }

/* ── The arena ───────────────────────────────────────────────────────────── */

ppp-arena { display: inline-grid; }
ppp-arena[size="small"] { grid-template-columns: repeat(2, max-content); }
ppp-arena[size="big"] { grid-template-columns: repeat(3, max-content); }

ppp-zone {
  display: grid;
  grid-template-columns: repeat(3, var(--ppp-space));
  border: 0.35mm solid var(--ppp-ink);
}

/* Every other zone tinted, so the zones read at a glance without ever looking like
 * they stop a line -- three in a row scores anywhere on the arena. Four zones want
 * the second and third; nine want the evens. */
ppp-arena[size="small"] > ppp-zone:nth-child(2),
ppp-arena[size="small"] > ppp-zone:nth-child(3),
ppp-arena[size="big"] > ppp-zone:nth-child(even) { background: var(--ppp-tint); }

ppp-space {
  position: relative;
  box-sizing: border-box;
  width: var(--ppp-space);
  height: var(--ppp-space);
  border-right: 0.2mm solid var(--ppp-rule);
  border-bottom: 0.2mm solid var(--ppp-rule);
}

ppp-space:nth-child(3n) { border-right: 0; }
ppp-space:nth-child(n+7) { border-bottom: 0; }

/* The type it switches off, and its name, both along the top: the middle of a space
 * stays free for the symbol of whoever takes it. */
ppp-space::before {
  content: "";
  position: absolute;
  top: 7%;
  left: 7%;
  width: 34%;
  height: 34%;
  background: var(--ppp-drawing, none) center / contain no-repeat;
  opacity: 0.68;
}

ppp-space::after {
  content: attr(name);
  position: absolute;
  top: 7%;
  right: 7%;
  font-size: calc(var(--ppp-space) * 0.085);
  font-weight: bold;
  letter-spacing: 0.02em;
  color: var(--ppp-fine);
}

/* Whoever took the space, below the strip its name and veto sit in. */
ppp-space > ppp-mark {
  position: absolute;
  right: 0;
  bottom: 7%;
  left: 0;
  margin: 0 auto;
  width: 54%;
  height: 54%;
}

/* ── Counterattack cards ─────────────────────────────────────────────────── */

ppp-deck {
  display: grid;
  grid-template-columns: repeat(2, var(--ppp-card-width));
  gap: var(--ppp-gutter);
}

/* The icon is out of the flow, so the type beside it stacks as tightly as type
 * does and nothing has to be told where to sit. */
ppp-card {
  display: block;
  position: relative;
  box-sizing: border-box;
  padding-left: calc(var(--ppp-card-icon) + 4mm);
  min-height: var(--ppp-card-height);
}

ppp-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: var(--ppp-card-icon);
  height: var(--ppp-card-icon);
  background: var(--ppp-drawing, none) center / contain no-repeat;
}

ppp-card > * { display: block; }
ppp-name { font-size: 4.8mm; font-weight: bold; }
ppp-rule { font-size: 3mm; line-height: 1.28; margin-top: 1.6mm; }
ppp-note { font-size: 2.6mm; line-height: 1.25; margin-top: 1mm; color: var(--ppp-fine); }

ppp-fine {
  margin-top: 1.8mm;
  font-size: 2.3mm;
  color: var(--ppp-fine);
  border-top: 0.2mm solid var(--ppp-rule);
  padding-top: 1.2mm;
}

/* ── Pages ───────────────────────────────────────────────────────────────── */

/* A sheet of pieces to cut up. Nothing is drawn around them: a cut line you miss by
 * a millimetre shows on the piece for the rest of the campaign, so the pitch leaves
 * paper to cut down the middle of instead. */
ppp-tray {
  display: grid;
  grid-template-columns: repeat(var(--ppp-across, 6), var(--ppp-pitch));
  grid-auto-rows: var(--ppp-pitch);
  justify-items: center;
  align-items: center;
}

ppp-page {
  display: grid;
  place-content: center;
  box-sizing: border-box;
  width: 210mm;
  height: 297mm;
}

ppp-caption {
  display: block;
  max-width: 150mm;
  margin-top: 3mm;
  font-size: 3.4mm;
  line-height: 1.45;
  color: var(--ppp-fine);
}

@page { size: A4; margin: 0; }

@media screen {
  body { background: #e8e8e8; }
  ppp-page { margin: 6mm auto; background: #fff; box-shadow: 0 0.4mm 2mm rgba(0, 0, 0, 0.25); }
}

@media print {
  ppp-page { margin: 0; box-shadow: none; break-after: page; }
  ppp-page:last-of-type { break-after: auto; }
}
`;

// ── Documents ───────────────────────────────────────────────────────────────

const document = (title, body, style = '') => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="stylesheet" href="ppp.css">
${style}${body}
`;

const stone = (player, type) => `<ppp-stone player="${player}" type="${type}"></ppp-stone>`;
const mark = (player) => `<ppp-mark player="${player}"></ppp-mark>`;

// Six columns of eight on one grid: X on the top four rows and O on the bottom four,
// a column to a type, four of each a side. Every gap is the same, the halfway one
// included, so the sheet comes apart on straight cuts wherever the eye puts them.
function stonesPage() {
  const rows = 8;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (const type of STONE_TYPES) cells.push(stone(r < rows / 2 ? 'X' : 'O', type));
  }
  return document('Pif-paf-poe — stones',
    `<ppp-page>\n  <ppp-tray>\n    ${cells.join('\n    ')}\n  </ppp-tray>\n</ppp-page>`);
}

// The five Counterattacks, in the words a card has room for.
const CARDS = {
  overtake: {
    name: 'Overtake',
    rule: 'If your opponent holds the centre square, take that stone off the board and ' +
      'back into their hand.',
    note: 'A Mountain is not safe from it.',
  },
  relocate: {
    name: 'Relocate',
    rule: 'Move one of your own stones to any free square.',
    note: 'It resolves nothing on arrival.',
  },
  mirror: {
    name: 'Mirror',
    rule: 'Swap what stands on two squares symmetric about the centre.',
    note: 'Whoever owns the two stones.',
  },
  'mind-control': {
    name: 'Mind Control',
    rule: 'Name a stone in your opponent’s hand. That is what they must play next turn.',
    note: 'You never touch the stone yourself.',
  },
  rehearse: {
    name: 'Rehearse',
    rule: 'Resolve one of your stones on the board again, from wherever it now stands.',
    note: 'Not one the space has switched off.',
  },
};

const FINE = 'Moved second only — spend at the end of your turn.';

const card = (item, indent = '') => {
  const { name, rule, note } = CARDS[item];
  const lines = [
    `<ppp-card item="${item}">`,
    `  <ppp-name>${esc(name)}</ppp-name>`,
    `  <ppp-rule>${esc(rule)}</ppp-rule>`,
    `  <ppp-note>${esc(note)}</ppp-note>`,
    `  <ppp-fine>${esc(FINE)}</ppp-fine>`,
    '</ppp-card>',
  ];
  return lines.join(`\n${indent}`);
};

// Two of each of the five, down the page in pairs, so one sheet is a full set for
// two players.
function cardsPage() {
  const cards = ITEMS.flatMap((item) => [card(item, '    '), card(item, '    ')]);
  return document('Pif-paf-poe — Counterattacks',
    `<ppp-page>\n  <ppp-deck>\n    ${cards.join('\n    ')}\n  </ppp-deck>\n</ppp-page>`);
}

// One page of arena: zones of nine spaces, each space carrying its name and the
// stone type it switches off.
function arenaPage(size) {
  setArena(size);
  const zones = WIDTH / 3;
  const html = ZONES.map((z) => {
    const spaces = ZONE_SPACES[z].map((i) => {
      const s = SPACES[i];
      return `<ppp-space veto="${VETO[i]}" name="${attr(spaceName(s, zones))}"></ppp-space>`;
    });
    return `    <ppp-zone>\n      ${spaces.join('\n      ')}\n    </ppp-zone>`;
  }).join('\n');
  return document(`Pif-paf-poe — the ${WIDTH}x${WIDTH} arena`,
    `<ppp-page style="--ppp-space: ${size === 'big' ? 21 : 32}mm">\n` +
    `  <ppp-arena size="${size}">\n${html}\n  </ppp-arena>\n</ppp-page>`);
}

// ── A page that is not for cutting up ───────────────────────────────────────

const gridHtml = (board, indent = '    ') => {
  const rows = [0, 1, 2].map((r) => {
    const squares = [0, 1, 2].map((c) => {
      const cell = board[r * 3 + c];
      return `<ppp-square>${cell ? stone(cell.player, cell.type) : ''}</ppp-square>`;
    });
    return `${indent}  <ppp-row>\n${indent}    ${squares.join(`\n${indent}    `)}` +
      `\n${indent}  </ppp-row>`;
  });
  return `${indent}<ppp-grid>\n${rows.join('\n')}\n${indent}</ppp-grid>`;
};

// The illustration is a position, and the position is the engine's: X opens with a
// Magnet, which binds O to a square beside it; O answers with a Stinky, which pushes
// X away from that one; and X's Shift then slides the column it lands in, wrapping
// what falls off the top around to the bottom.
function shiftStudy() {
  const s = createGame({
    handX: ['magnet', 'shift', 'rotate', '2048', 'mountain'],
    handO: ['stinky', 'mountain', 'rotate', 'shift', 'magnet'],
    first: 'X',
  });
  const play = (...actions) => actions.forEach((a) => applyAction(s, a));
  play({ type: 'select', stone: 'magnet' }, { type: 'place', pos: 0 });
  play({ type: 'select', stone: 'stinky' }, { type: 'place', pos: 1 });
  play({ type: 'select', stone: 'shift' }, { type: 'place', pos: 6 });
  const before = s.board.map((c) => c && { ...c });
  play({ type: 'effect', direction: 'up' });
  return { before, after: s.board.map((c) => c && { ...c }), hand: [...s.hands.X] };
}

function examplePage() {
  const { before, after, hand } = shiftStudy();
  const types = STONE_TYPES.map((t) =>
    `<li><ppp-icon type="${t}"></ppp-icon> <b>${esc(t)}</b></li>`).join('\n    ');
  const style = `<style>
  body { margin: 0 auto; padding: 12mm; max-width: 180mm; }
  h1 { font-size: 8mm; margin: 0 0 2mm; }
  h2 { font-size: 5mm; margin: 12mm 0 3mm; }
  p { font-size: 3.6mm; line-height: 1.5; max-width: 150mm; }
  ul { list-style: none; padding: 0; display: flex; gap: 6mm; flex-wrap: wrap; font-size: 3.4mm; }
  li { display: flex; align-items: center; gap: 1.5mm; }
</style>
`;
  const body = `<h1>Pif-paf-poe, on a page</h1>
<p>Every piece here is an element. Nothing in this document is a picture of the game:
it is the game, written down, at whatever size the page asks for.</p>

<h2>The six types</h2>
<ul>
    ${types}
</ul>

<h2>A Shift, resolving</h2>
<p>X opens with a Magnet, so O must answer beside it. O plays a Stinky, so X must go
somewhere not beside <em>that</em> — and X's Shift lands bottom left and names
<b>up</b>. The column slides, and what falls off the top comes back at the bottom.</p>

<ppp-figure style="--ppp-square: 22mm">
${gridHtml(before)}
  <ppp-then></ppp-then>
${gridHtml(after)}
</ppp-figure>
<ppp-caption>The same two boards at any size you like: the squares are
<code>--ppp-square</code>, and the stones follow them.</ppp-caption>

<h2>What X holds afterwards</h2>
<ppp-hand style="--ppp-stone: 18mm">
  ${hand.map((t) => stone('X', t)).join('\n  ')}
</ppp-hand>

<h2>One Counterattack</h2>
${card('mirror')}

<h2>Where the duel is fought</h2>
<p>The arena, small enough to read at a glance. A space a side has taken carries that
side's mark — a plain X or O, and nothing else; the veto and the space's name sit along
the top of it.</p>
<ppp-arena size="small" style="--ppp-space: 16mm">
${ZONES.map((z) => {
    const spaces = ZONE_SPACES[z].map((i) => {
      const s = SPACES[i];
      const held = i % 7 === 3 ? mark('X') : i % 11 === 5 ? mark('O') : '';
      return `<ppp-space veto="${VETO[i]}" name="${attr(spaceName(s, 2))}">${held}</ppp-space>`;
    });
    return `  <ppp-zone>\n    ${spaces.join('\n    ')}\n  </ppp-zone>`;
  }).join('\n')}
</ppp-arena>
`;
  return document('Pif-paf-poe — the elements', body, style);
}

// ── Writing it all out ──────────────────────────────────────────────────────

const out = arg('out', 'paper');
if (!existsSync(`${out}/icons`)) mkdirSync(`${out}/icons`, { recursive: true });

const files = {
  'ppp.css': stylesheet(),
  'stones.html': stonesPage(),
  'counterattacks.html': cardsPage(),
  'arena-small.html': arenaPage('small'),
  'arena-big.html': arenaPage('big'),
  // Last, because the arena it draws is whichever size was set up before it.
  'example.html': (setArena('small'), examplePage()),
};

for (const name of Object.keys(ICONS)) {
  writeFileSync(`${out}/icons/${name}.svg`, svg(name));
}
console.log(`${out}/icons/*.svg  (${Object.keys(ICONS).length})`);

for (const [name, text] of Object.entries(files)) {
  writeFileSync(`${out}/${name}`, text);
  console.log(`${out}/${name}`);
}
