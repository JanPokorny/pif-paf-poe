// The pieces, on paper. Three A4 sheets you print, cut out and play with:
//
//    print/stones-x.svg        48 stones for X, eight of each of the six types
//    print/stones-o.svg        the same for O
//    print/counterattacks.svg  ten Counterattack cards, two of each of the five
//
//   node print.js                     write all three into print/
//   node print.js --out somewhere     write them somewhere else
//
// A stone has to say two things at once: whose it is, and what it does. So the
// symbol is drawn full size -- an X or an O you read across the table -- and the
// type's icon sits on top of it, in ink, with a white halo underneath so it stays
// legible over the strokes of the X. Nothing here is coloured for its own sake:
// the two symbols differ by shape, so a black and white printer loses nothing.
//
// Types and Counterattacks are imported from the engine rather than listed again,
// so a sheet cannot quietly go out of date with the game.
//
// Every length is a millimetre: the viewBox is the page in mm, which keeps the
// geometry below readable and means the sheets print at their true size.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { ITEMS, STONE_TYPES } from './engine.js';
import { arg } from './sim.js';

const PAGE = { w: 210, h: 297 };

const INK = '#1b1b1b';
const FAINT = '#b9b9b9';        // the 3x3 boards inside the Counterattack icons
const CUT = '#c9c9c9';          // where the scissors go
const COLOUR = { X: '#a8322c', O: '#1f5c96' };
const FONT = 'Helvetica, Arial, sans-serif';

const n = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Drawing ─────────────────────────────────────────────────────────────────

// An icon is a list of shapes in its own coordinates, centred on the origin and
// about 14 wide, so the same list can be drawn small on a stone and large on a
// card. Two kinds of shape: a stroked path, and a dot. `faint` marks the parts
// that are context rather than content -- the board an effect happens on -- and
// `shut` marks a closed path whose inside is filled white by the halo, so the
// symbol underneath does not show through the middle of a mountain.
const path = (d, w = 1, { faint = false, shut = false } = {}) => ({ d, w, faint, shut });
const dot = (x, y, r, solid = true, w = 1) => ({ x, y, r, solid, w });
const ring = (x, y, r, w = 1) => dot(x, y, r, false, w);

const isDot = (s) => s.r !== undefined;

function shape(s, { white, halo, stroke }) {
  const colour = white ? '#fff' : s.faint ? FAINT : stroke;
  const width = (s.faint ? 0.3 : s.w) + (white ? halo : 0);
  const paint = `stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" ` +
    'stroke-linejoin="round"';
  if (!isDot(s)) {
    return `<path d="${s.d}" fill="${white && s.shut ? '#fff' : 'none'}" ${paint}/>`;
  }
  if (s.solid) {
    return `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r + width / 2)}" fill="${colour}"/>`;
  }
  return `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" ` +
    `fill="${white ? '#fff' : 'none'}" ${paint}/>`;
}

// Icons are drawn twice where they have to survive being laid over an X: once in
// white and fatter, once in ink. The halo is the only reason the overlay works.
function icon(shapes, { scale = 1, halo = 0, stroke = INK } = {}) {
  const out = [];
  for (const white of halo ? [true, false] : [false]) {
    for (const s of shapes) {
      if (white && s.faint) continue;
      out.push(shape(s, { white, halo, stroke }));
    }
  }
  return `<g transform="scale(${n(scale)})">${out.join('')}</g>`;
}

function text(x, y, s, { size = 3, weight = 'normal', fill = INK, anchor = 'middle',
  spacing = 0 } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${n(size)}" ` +
    `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ` +
    `letter-spacing="${n(spacing)}">${esc(s)}</text>`;
}

// Arrowheads are two barbs at a tip, pointing along the direction of travel.
function head(x, y, dx, dy, size = 2.4, spread = 0.55) {
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const barb = (a) => [
    x - size * (ux * Math.cos(a) - uy * Math.sin(a)),
    y - size * (ux * Math.sin(a) + uy * Math.cos(a)),
  ];
  const [ax, ay] = barb(spread), [bx, by] = barb(-spread);
  return `M ${n(ax)} ${n(ay)} L ${n(x)} ${n(y)} L ${n(bx)} ${n(by)}`;
}

const box = (x, y, w, h) => `M ${n(x)} ${n(y)} h ${n(w)} v ${n(h)} h ${n(-w)} Z`;

// A 3x3 board, faint, for the Counterattack icons that need somewhere to happen.
// Cell centres come back with it, since that is what the rest of the icon aims at.
function board(half = 7) {
  const s = (2 * half) / 3;
  const faint = { faint: true };
  const lines = [path(box(-half, -half, 2 * half, 2 * half), 0.3, faint)];
  for (const k of [-1, 1]) {
    lines.push(path(`M ${n(k * s / 2)} ${n(-half)} V ${n(half)}`, 0.3, faint));
    lines.push(path(`M ${n(-half)} ${n(k * s / 2)} H ${n(half)}`, 0.3, faint));
  }
  return { lines, cell: (cx, cy) => [cx * s, cy * s] };
}

// ── The six stone types ─────────────────────────────────────────────────────

const shut = { shut: true };
const arc = (r, from, to, big = 1) => {
  const p = (a) => [r * Math.cos(a * Math.PI / 180), -r * Math.sin(a * Math.PI / 180)];
  const [sx, sy] = p(from), [ex, ey] = p(to);
  return { d: `M ${n(sx)} ${n(sy)} A ${n(r)} ${n(r)} 0 ${big} 1 ${n(ex)} ${n(ey)}`, ex, ey };
};

const STONE_ICONS = {
  // A row of three squares, an arrow one step along it, and the wrap underneath.
  shift: () => [
    ...[-6.6, -1.6, 3.4].map((x) => path(box(x, -1.6, 3.2, 3.2), 0.9, shut)),
    path('M -3.4 -4.8 H 3', 0.9),
    path(head(3.4, -4.8, 1, 0), 0.9),
    path('M 6.6 3.4 C 6.6 7.4 -6.6 7.4 -6.6 3.8', 0.9),
    path(head(-6.6, 3.4, 0, -1, 2), 0.9),
  ],
  // Everything slides as far as it can go: a line of four squares whose stones
  // have all packed up at the far end, and one long arrow for the distance.
  '2048': () => [
    path(box(-7, -3.4, 14, 6.8), 0.9, shut),
    ...[-3.5, 0, 3.5].map((x) => path(`M ${n(x)} -3.4 V 3.4`, 0.6)),
    dot(1.75, 0, 1.3), dot(5.25, 0, 1.3),
    path('M -6.2 5.8 H 5.2', 0.9),
    path(head(5.6, 5.8, 1, 0), 0.9),
  ],
  // One 2x2 block, turning a step clockwise.
  rotate: () => {
    const a = arc(6.4, 145, -80);
    return [
      ...[[0.3, -3.1], [-3.1, -3.1], [0.3, 0.3], [-3.1, 0.3]]
        .map(([x, y]) => path(box(x, y, 2.8, 2.8), 0.9, shut)),
      path(a.d, 0.9),
      path(head(a.ex, a.ey, -a.ey, a.ex, 2.2), 0.9),
    ];
  },
  // Nothing moves it, and nothing passes through it.
  mountain: () => [
    path('M -6.8 4.8 L -2 -4.8 L 1.2 0.9 L 2.9 -1.4 L 6.8 4.8 Z', 1, shut),
  ],
  // A horseshoe, poles down.
  magnet: () => [
    path('M -4.4 4.2 V -0.6 A 4.4 4.4 0 0 1 4.4 -0.6 V 4.2', 1.5),
    path('M -6.2 4.6 H -2.6', 1.2),
    path('M 2.6 4.6 H 6.2', 1.2),
  ],
  // Something you keep away from.
  stinky: () => [
    ...[-2.8, 0, 2.8].map((x) =>
      path(`M ${n(x)} 2.4 C ${n(x - 1.8)} 0.2 ${n(x + 1.8)} -1.4 ${n(x)} -3.8`, 0.9)),
    path('M -4.2 5.4 A 4.2 3.4 0 0 1 4.2 5.4 Z', 1, shut),
  ],
};

// ── The five Counterattacks ─────────────────────────────────────────────────

const COUNTERATTACKS = {
  overtake: {
    title: 'Overtake',
    rule: 'If your opponent holds the centre square, take that stone off the board and ' +
      'back into their hand.',
    note: 'A Mountain is not safe from it.',
    // The centre stone, on its way off the board.
    icon: () => [...board().lines, ring(0, 0, 2.4, 1.1),
      path('M 2.4 -2.4 L 8.2 -8.2', 1), path(head(8.6, -8.6, 1, -1, 2.6), 1)],
  },
  relocate: {
    title: 'Relocate',
    rule: 'Move one of your own stones to any free square.',
    note: 'It resolves nothing on arrival.',
    // A stone of yours, and the empty square it lands on.
    icon: () => {
      const b = board();
      const [fx, fy] = b.cell(-1, 1), [tx, ty] = b.cell(1, -1);
      const [ex, ey] = [tx - 1.2, ty - 3.2];
      return [...b.lines, dot(fx, fy, 2.2), ring(tx, ty, 2.4, 0.6),
        path(`M ${n(fx)} ${n(fy - 2.9)} C ${n(fx - 1.4)} ${n(fy - 8)} ` +
          `${n(ex - 5)} ${n(ey - 2.4)} ${n(ex)} ${n(ey)}`, 0.9),
        path(head(ex, ey, 1, 0.4, 2.2), 0.9)];
    },
  },
  mirror: {
    title: 'Mirror',
    rule: 'Swap what stands on one facing pair through the centre: 0 and 8, 1 and 7, ' +
      '2 and 6, 3 and 5.',
    note: 'Whoever owns the two stones.',
    // One pair through the centre, trading places.
    icon: () => {
      const b = board();
      const [ax, ay] = b.cell(-1, -1), [bx, by] = b.cell(1, 1);
      return [...b.lines, dot(ax, ay, 2.2), ring(bx, by, 2.4, 1.1),
        path(`M ${n(ax + 3)} ${n(ay + 3)} L ${n(bx - 3)} ${n(by - 3)}`, 0.9),
        path(head(ax + 2.6, ay + 2.6, -1, -1, 2.2), 0.9),
        path(head(bx - 2.6, by - 2.6, 1, 1, 2.2), 0.9)];
    },
  },
  'mind-control': {
    title: 'Mind Control',
    rule: 'Name a stone in your opponent’s hand. That is what they must play next turn.',
    note: 'You never touch the stone yourself.',
    // Their hand, and the one you point at.
    icon: () => [
      ...[-7.4, -2.4, 2.6].map((x) => path(box(x, 2.2, 4.6, 4.6), x === -2.4 ? 1.4 : 0.7)),
      path('M 0 -7.6 V -0.4', 1),
      path(head(0, 0.4, 0, 1, 2.6), 1),
    ],
  },
  rehearse: {
    title: 'Rehearse',
    rule: 'Resolve one of your stones on the board again, from wherever it now stands.',
    note: 'Not one the space has switched off.',
    // One stone of yours, doing its thing a second time.
    icon: () => {
      const a = arc(4.8, 115, -150);
      return [...board().lines, dot(0, 0, 2),
        path(a.d, 1), path(head(a.ex, a.ey, -a.ey, a.ex, 2.4), 1)];
    },
  },
};

// ── A stone ─────────────────────────────────────────────────────────────────

// Square stones, cut on a shared grid: two straight cuts a row where circles
// would have wanted scissors, and a square holds a bigger symbol than a circle
// of the same pitch does.
const STONE = 30;          // side of the cut square
// How far each symbol reaches. The X's arms point into the corners, which are
// empty; the O's ring has to stay clear of the type's name along the bottom.
const GLYPH = { X: 10.2, O: 9.4 };

// Centred on the origin: the cut line, the symbol at full size, the type's icon
// haloed over it, and the type's name below, clear of both symbols.
function stone(type, player) {
  const c = COLOUR[player], g = GLYPH[player], h = STONE / 2;
  const cross = `M ${n(-g)} ${n(-g)} L ${n(g)} ${n(g)} M ${n(g)} ${n(-g)} L ${n(-g)} ${n(g)}`;
  const symbol = player === 'X'
    ? `<path d="${cross}" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round"/>`
    : `<circle cx="0" cy="0" r="${n(g)}" fill="none" stroke="${c}" stroke-width="3.5"/>`;
  return [
    `<rect x="${n(-h)}" y="${n(-h)}" width="${STONE}" height="${STONE}" fill="#fff" ` +
      `stroke="${CUT}" stroke-width="0.25"/>`,
    symbol,
    icon(STONE_ICONS[type](), { scale: 0.82, halo: 1.5 }),
    text(0, h - 1.2, type, { size: 2.4, fill: '#6d6d6d', spacing: 0.25 }),
  ].join('');
}

// ── The sheets ──────────────────────────────────────────────────────────────

function sheet(title, blurb, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" ` +
    `viewBox="0 0 ${PAGE.w} ${PAGE.h}">
<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
${text(PAGE.w / 2, 13, title, { size: 5.4, weight: 'bold' })}
${text(PAGE.w / 2, 18.4, blurb, { size: 2.9, fill: '#6d6d6d' })}
${body}
${text(PAGE.w / 2, PAGE.h - 6, 'Print at 100% — no fit-to-page — on A4.',
    { size: 2.6, fill: '#9a9a9a' })}
</svg>
`;
}

// Six columns of eight, one column per type: a sheet is eight of everything, so
// nothing has to be counted out, and the columns tell you what you are cutting.
function stoneSheet(player) {
  const rows = 8;
  const left = (PAGE.w - STONE_TYPES.length * STONE) / 2 + STONE / 2;
  const top = 29 + STONE / 2;
  const cells = [];
  STONE_TYPES.forEach((type, col) => {
    for (let r = 0; r < rows; r++) {
      cells.push(`<g transform="translate(${n(left + col * STONE)} ${n(top + r * STONE)})">` +
        `${stone(type, player)}</g>`);
    }
  });
  return sheet(
    `Pif-paf-poe — stones for ${player}`,
    'Eight of each of the six types. A hand is five stones, drawn at random, repeats and all.',
    cells.join('\n'));
}

// Rough advance widths, as fractions of the font size, for a sans-serif. Wrapping
// text is the one thing SVG will not do for you, and a card's rule has to fit its
// card, so the lines are broken here.
const NARROW = new Set([...'ijlt.,:;\'’!|()[]']);
const WIDE = new Set([...'mwMWABCDEFGHIJKLNOPQRSTUVXYZ0123456789—']);
const advance = (ch) => (ch === ' ' ? 0.28 : NARROW.has(ch) ? 0.3 : WIDE.has(ch) ? 0.63 : 0.52);
const measure = (s, size) => [...s].reduce((w, ch) => w + advance(ch), 0) * size;

function wrap(s, size, width) {
  const lines = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, size) > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// A wrapped paragraph, returned with the baseline the next one should start at,
// so a card stacks its rule, its footnote and its reminder without any of them
// being positioned by hand.
function paragraph(x, y, s, { size = 3, width, leading = 1.32, ...rest } = {}) {
  const lines = wrap(s, size, width);
  return {
    svg: lines.map((l, i) => text(x, y + i * size * leading, l, { size, ...rest })).join('\n'),
    next: y + lines.length * size * leading,
  };
}

const CARD = { w: 93, h: 50, gap: 1.2 };

// Icon on the left, name and rule on the right, and under the rule the two things
// about a Counterattack that are easy to forget at the table.
function card(item) {
  const { title, rule, note, icon: shapes } = COUNTERATTACKS[item];
  const x = 37;
  const width = CARD.w - x - 5.5;
  const body = paragraph(x, 23.6, rule, { size: 3.1, width, anchor: 'start' });
  const footnote = paragraph(x, body.next + 1.4, note,
    { size: 2.7, width, anchor: 'start', fill: '#6d6d6d' });
  const reminder = paragraph(CARD.w / 2, CARD.h - 5.4,
    'Spend at the end of your turn — moved second only, one a game.',
    { size: 2.5, width: CARD.w - 12, fill: '#6d6d6d' });
  return [
    `<rect x="0" y="0" width="${n(CARD.w)}" height="${n(CARD.h)}" rx="2" ` +
      `fill="#fff" stroke="${CUT}" stroke-width="0.25"/>`,
    `<g transform="translate(19 22)">${icon(shapes(), { scale: 1.05 })}</g>`,
    text(x, 16.4, title, { size: 5, weight: 'bold', anchor: 'start' }),
    body.svg,
    footnote.svg,
    `<path d="M 6 ${n(CARD.h - 10.6)} H ${n(CARD.w - 6)}" stroke="${CUT}" stroke-width="0.25"/>`,
    reminder.svg,
  ].join('\n');
}

// Two of each of the five, down the page in pairs, so one sheet is a full set for
// two players.
function counterattackSheet() {
  const left = (PAGE.w - (2 * CARD.w + CARD.gap)) / 2;
  const top = 25;
  const cards = ITEMS.flatMap((item, row) => [0, 1].map((col) =>
    `<g transform="translate(${n(left + col * (CARD.w + CARD.gap))} ` +
    `${n(top + row * (CARD.h + CARD.gap))})">${card(item)}</g>`));
  return sheet(
    'Pif-paf-poe — Counterattacks',
    'Two of each of the five. Hold as many as you like, present up to three, spend at most one.',
    cards.join('\n'));
}

const out = arg('out', 'print');
if (!existsSync(out)) mkdirSync(out, { recursive: true });
const sheets = {
  'stones-x.svg': stoneSheet('X'),
  'stones-o.svg': stoneSheet('O'),
  'counterattacks.svg': counterattackSheet(),
};
for (const [name, svg] of Object.entries(sheets)) {
  writeFileSync(`${out}/${name}`, svg);
  console.log(`${out}/${name}`);
}
