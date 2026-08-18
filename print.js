// The pieces, on paper. Five A4 sheets you print and play with:
//
//    print/stones-x.svg        48 stones for X, eight of each of the six types
//    print/stones-o.svg        the same for O
//    print/counterattacks.svg  ten Counterattack cards, two of each of the five
//    print/arena-small.svg     the 6x6 arena, four zones, vetoes printed on
//    print/arena-big.svg       the 9x9 arena, nine zones
//
//   node print.js                     write all five into print/
//   node print.js --out somewhere     write them somewhere else
//
// A stone has to say two things at once: whose it is, and what it does. So the
// symbol is drawn full size -- an X or an O you read across the table -- and the
// type's icon sits in a white disc punched through the middle of it. Everything is
// black: the two symbols differ by shape, so nothing here needs a colour printer,
// and the only text is on the cards, whose rules have to be read.
//
// Nothing is drawn around a piece. A cut line you miss shows on the piece for the
// rest of the campaign, so the stones and the cards are set far apart instead and
// you cut down the middle of the gap.
//
// Types, Counterattacks and the arena's geometry are imported from the engine and
// arena rather than listed again, so a sheet cannot quietly go out of date with
// the game.
//
// Every length is a millimetre: the viewBox is the page in mm, which keeps the
// geometry below readable and means the sheets print at their true size.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { setArena, SPACES, VETO, WIDTH, HEIGHT, ZONES, ZONE_SPACES } from './arena.js';
import { ITEMS, STONE_TYPES } from './engine.js';
import { arg } from './sim.js';

const PAGE = { w: 210, h: 297 };

const INK = '#000';
const FAINT = '#b9b9b9';        // the 3x3 boards inside the Counterattack icons
const RULE = '#c9c9c9';         // the arena's space grid, and the line on a card
const FONT = 'Helvetica, Arial, sans-serif';

const n = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Drawing ─────────────────────────────────────────────────────────────────

// An icon is a list of shapes in its own coordinates, centred on the origin and
// no more than FIELD across, so the same list can be drawn small on a stone and
// large on a card. Three kinds of shape: a stroked path, a dot, and a word.
// `faint` marks the parts that are context rather than content -- the board an
// effect happens on -- and `full` fills a closed path in ink.
const path = (d, w = 1, { faint = false, full = false } = {}) => ({ d, w, faint, full });
const dot = (x, y, r, solid = true, w = 1) => ({ x, y, r, solid, w });
const ring = (x, y, r, w = 1) => dot(x, y, r, false, w);
const word = (t, size) => ({ t, size });

function shape(s, tone = INK) {
  const colour = s.faint ? FAINT : tone;
  const paint = `stroke="${colour}" stroke-width="${n(s.faint ? 0.3 : s.w)}" ` +
    'stroke-linecap="round" stroke-linejoin="round"';
  if (s.t !== undefined) {
    return `<text x="0" y="${n(s.size * 0.36)}" font-family="${FONT}" ` +
      `font-size="${n(s.size)}" font-weight="bold" text-anchor="middle" fill="${colour}" ` +
      `letter-spacing="0.2">${esc(s.t)}</text>`;
  }
  if (s.r === undefined) {
    return `<path d="${s.d}" fill="${s.full ? colour : 'none'}" ${paint}/>`;
  }
  if (s.solid) return `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="${colour}"/>`;
  return `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="none" ${paint}/>`;
}

const icon = (shapes, scale = 1, tone = INK) =>
  `<g transform="scale(${n(scale)})">${shapes.map((s) => shape(s, tone)).join('')}</g>`;

function text(x, y, s, { size = 3, weight = 'normal', fill = INK, anchor = 'middle',
  spacing = 0 } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${n(size)}" ` +
    `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ` +
    `letter-spacing="${n(spacing)}">${esc(s)}</text>`;
}

// An arrowhead is a filled triangle at the tip, pointing along the direction of
// travel. Two open barbs would do on a straight arrow, but where the arrow bends
// into its own head the barb and the curve lie along each other and the whole thing
// reads as a hook. A solid head cannot be mistaken for more line.
function arrow(x, y, dx, dy, size = 2.4, width = 1.9) {
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const [bx, by] = [x - ux * size, y - uy * size];          // the middle of the base
  const [px, py] = [(-uy * width) / 2, (ux * width) / 2];   // half of it, across the axis
  return path(`M ${n(x)} ${n(y)} L ${n(bx + px)} ${n(by + py)} ` +
    `L ${n(bx - px)} ${n(by - py)} Z`, 0.4, { full: true });
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

// A clockwise arc, stopping an arrowhead's length short of where it is going and
// handing back that point and the tangent there, so the head fills the gap and sits
// on the direction of travel rather than on curve.
const arc = (r, from, to, big = 1, gap = 2.2) => {
  const p = (a) => [r * Math.cos(a * Math.PI / 180), -r * Math.sin(a * Math.PI / 180)];
  const [sx, sy] = p(from), [mx, my] = p(to + (gap / r) * (180 / Math.PI));
  const [ex, ey] = p(to);
  return {
    d: `M ${n(sx)} ${n(sy)} A ${n(r)} ${n(r)} 0 ${big} 1 ${n(mx)} ${n(my)}`,
    ex, ey, dx: -ey, dy: ex,
  };
};

const STONE_ICONS = {
  // A row of three squares, an arrow one step along it, and the wrap underneath.
  shift: () => [
    ...[-6.6, -1.6, 3.4].map((x) => path(box(x, -1.6, 3.2, 3.2), 0.9)),
    path('M -3.4 -4.8 H 1.2', 0.9),
    arrow(3.4, -4.8, 1, 0),
    path('M 6.6 2.6 C 7.6 6.2 5.4 6.6 3.4 6.6 H -3.2', 0.9),
    arrow(-5.4, 6.6, -1, 0, 2.2),
  ],
  // The tile game it is named after, which is what everyone recognises it by.
  '2048': () => [word('2048', 6.4)],
  // One 2x2 block, turning a step clockwise.
  rotate: () => {
    const a = arc(6.4, 145, -80);
    return [
      ...[[0.3, -3.1], [-3.1, -3.1], [0.3, 0.3], [-3.1, 0.3]]
        .map(([x, y]) => path(box(x, y, 2.8, 2.8), 0.9)),
      path(a.d, 0.9),
      arrow(a.ex, a.ey, a.dx, a.dy),
    ];
  },
  // Nothing moves it, and nothing passes through it.
  mountain: () => [
    path('M -6.8 4.8 L -2 -4.8 L 1.2 0.9 L 2.9 -1.4 L 6.8 4.8 Z', 1),
  ],
  // A horseshoe magnet the way it is always drawn: a U, poles up and filled in.
  // Drawn as an outline rather than one thick stroke, which is what keeps it from
  // reading as a cave.
  magnet: () => [
    path('M -4.9 -5.6 V 1.2 A 4.9 4.9 0 0 0 4.9 1.2 V -5.6 H 2.1 V 1.2 ' +
      'A 2.1 2.1 0 0 1 -2.1 1.2 V -5.6 Z', 0.9),
    path(box(-4.9, -5.6, 2.8, 2.2), 0.9, { full: true }),
    path(box(2.1, -5.6, 2.8, 2.2), 0.9, { full: true }),
  ],
  // Something you keep away from.
  stinky: () => [
    ...[-2.8, 0, 2.8].map((x) =>
      path(`M ${n(x)} 2.4 C ${n(x - 1.8)} 0.2 ${n(x + 1.8)} -1.4 ${n(x)} -3.8`, 0.9)),
    path('M -4.2 5.4 A 4.2 3.4 0 0 1 4.2 5.4 Z', 1),
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
      path('M 2.4 -2.4 L 7.4 -7.4', 1), arrow(8.4, -8.4, 1, -1, 2.8, 2.2)],
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
      return [...b.lines, dot(fx, fy, 2.6), ring(tx, ty, 2.4, 0.6),
        path(`M ${n(fx)} ${n(fy - 2.9)} C ${n(fx - 1.4)} ${n(fy - 8)} ` +
          `${n(ex - 5)} ${n(ey - 2.4)} ${n(ex - 2.2)} ${n(ey - 1.1)}`, 0.9),
        arrow(ex, ey, 5, 2.4, 2.4)];
    },
  },
  mirror: {
    title: 'Mirror',
    rule: 'Swap what stands on two squares symmetric about the centre.',
    note: 'Whoever owns the two stones.',
    // One pair through the centre, trading places.
    icon: () => {
      const b = board();
      const [ax, ay] = b.cell(-1, -1), [bx, by] = b.cell(1, 1);
      return [...b.lines, dot(ax, ay, 2.6), ring(bx, by, 2.4, 1.1),
        path(`M ${n(ax + 3.8)} ${n(ay + 3.8)} L ${n(bx - 3.8)} ${n(by - 3.8)}`, 0.9),
        arrow(ax + 2.3, ay + 2.3, -1, -1, 2.2),
        arrow(bx - 2.3, by - 2.3, 1, 1, 2.2)];
    },
  },
  'mind-control': {
    title: 'Mind Control',
    rule: 'Name a stone in your opponent’s hand. That is what they must play next turn.',
    note: 'You never touch the stone yourself.',
    // Their hand, and the one you point at.
    icon: () => [
      ...[-7.4, -2.4, 2.6].map((x) => path(box(x, 2.2, 4.6, 4.6), x === -2.4 ? 1.4 : 0.7)),
      path('M 0 -7.6 V -1.6', 1),
      arrow(0, 0.6, 0, 1, 2.6, 2.2),
    ],
  },
  rehearse: {
    title: 'Rehearse',
    rule: 'Resolve one of your stones on the board again, from wherever it now stands.',
    note: 'Not one the space has switched off.',
    // One stone of yours, doing its thing a second time.
    icon: () => {
      const a = arc(4.8, 115, -150);
      return [...board().lines, dot(0, 0, 2.4),
        path(a.d, 1), arrow(a.ex, a.ey, a.dx, a.dy, 2.6, 2.1)];
    },
  },
};

// ── A stone ─────────────────────────────────────────────────────────────────

// Square stones, cut on a shared grid: two straight cuts a row where circles
// would have wanted scissors, and a square holds a bigger symbol than a circle
// of the same pitch does.
const STONE = 34;          // pitch of the grid a sheet of stones is laid out on
const FIELD = 7.6;         // radius of the clear middle the icon is drawn in

// Centred on the origin: the symbol at full size, a white disc over the middle of
// it, and the type's icon on the disc. The X is drawn whole and then interrupted,
// which keeps its four arms pointing at the corners while the icon gets clean paper
// to sit on; the O's ring leaves the same disc clear by itself. No name -- the icon
// is the name, and six of them are learnt in a hand or two.
//
// Nothing is drawn around a stone. A cut line you miss by a millimetre shows on
// every piece for the rest of the game, so the stones are simply set far enough
// apart to cut between by eye.
function stone(type, player) {
  const g = 10.2;
  const symbol = player === 'X'
    ? `<path d="M ${n(-g)} ${n(-g)} L ${n(g)} ${n(g)} M ${n(g)} ${n(-g)} L ${n(-g)} ${n(g)}" ` +
      `fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`
    : `<circle cx="0" cy="0" r="10.4" fill="none" stroke="${INK}" stroke-width="3.6"/>`;
  return [
    symbol,
    `<circle cx="0" cy="0" r="${n(FIELD)}" fill="#fff"/>`,
    icon(STONE_ICONS[type](), 0.85),
  ].join('');
}

// ── The sheets ──────────────────────────────────────────────────────────────

// Nothing outside the pieces themselves: a sheet is what you cut up, so it carries
// no title, no caption and no printing advice. Print at 100%, on A4.
function sheet(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" ` +
    `viewBox="0 0 ${PAGE.w} ${PAGE.h}">
<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>
${body}
</svg>
`;
}

// Six columns of eight, one column per type: a sheet is eight of everything, so
// nothing has to be counted out, and a column is one type all the way down.
function stoneSheet(player) {
  const rows = 8;
  const grid = (span, count) => (PAGE[span] - count * STONE) / 2 + STONE / 2;
  const [left, top] = [grid('w', STONE_TYPES.length), grid('h', rows)];
  const cells = [];
  STONE_TYPES.forEach((type, col) => {
    for (let r = 0; r < rows; r++) {
      cells.push(`<g transform="translate(${n(left + col * STONE)} ${n(top + r * STONE)})">` +
        `${stone(type, player)}</g>`);
    }
  });
  return sheet(cells.join('\n'));
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

// Two columns by five rows, with a wide gutter between them and nothing drawn
// around a card: ten cards come apart on five straight cuts, and none of them has
// to land anywhere in particular.
const CARD = { w: 94, h: 50, gap: 10 };

// Icon on the left, name and rule on the right, and under the rule the two things
// about a Counterattack that are easy to forget at the table.
function card(item) {
  const { title, rule, note, icon: shapes } = COUNTERATTACKS[item];
  const x = 37;
  const width = CARD.w - x - 4;
  const body = paragraph(x, 23.6, rule, { size: 3.1, width, anchor: 'start' });
  const footnote = paragraph(x, body.next + 1.4, note,
    { size: 2.7, width, anchor: 'start', fill: '#6d6d6d' });
  // Broken by hand into two lines that each say one thing, rather than wrapped.
  const reminder = ['Spend at the end of your turn.', 'Moved second only, one a game.']
    .map((l, i) => text(x, CARD.h - 7.3 + i * 3.3, l,
      { size: 2.5, anchor: 'start', fill: '#6d6d6d' })).join('\n');
  return [
    `<g transform="translate(18 22)">${icon(shapes(), 1.05)}</g>`,
    text(x, 16.4, title, { size: 5, weight: 'bold', anchor: 'start' }),
    body.svg,
    footnote.svg,
    `<path d="M ${n(x)} ${n(CARD.h - 10.6)} H ${n(CARD.w - 4)}" stroke="${RULE}" ` +
      'stroke-width="0.25"/>',
    reminder,
  ].join('\n');
}

// Two of each of the five, down the page in pairs, so one sheet is a full set for
// two players.
function counterattackSheet() {
  const pitch = { w: CARD.w + CARD.gap, h: CARD.h + CARD.gap };
  const span = (page, size, count) => (page - (count * size - CARD.gap)) / 2;
  const left = span(PAGE.w, pitch.w, 2), top = span(PAGE.h, pitch.h, ITEMS.length);
  const cards = ITEMS.flatMap((item, row) => [0, 1].map((col) =>
    `<g transform="translate(${n(left + col * pitch.w)} ${n(top + row * pitch.h)})">` +
    `${card(item)}</g>`));
  return sheet(cards.join('\n'));
}

// ── The arena ───────────────────────────────────────────────────────────────

const TINT = '#f1f1f1';         // every other zone, so the zones read at a glance
const VETO_TONE = '#5a5a5a';    // printed on the arena, not played onto it

// Zones are named by where they lie, so a 2x2 arena has NW NE SW SE and a 3x3
// fills in the middle bands: N, W, C, E, S. A space is then its zone and its place
// within it, counted along the rows -- NW1, NW2, NW3 across the top of NW -- which
// is short enough to shout across a hall and needs no ruler to find.
const BANDS = {
  2: { rows: ['N', 'S'], cols: ['W', 'E'] },
  3: { rows: ['N', '', 'S'], cols: ['W', '', 'E'] },
};

function spaceName(s, zones) {
  const { rows, cols } = BANDS[zones];
  const zone = rows[(s.y / 3) | 0] + cols[(s.x / 3) | 0] || 'C';
  return zone + ((s.y % 3) * 3 + (s.x % 3) + 1);
}

// One page of arena. Every space carries its name and the stone type it switches
// off, both along the top, so the middle of the space stays free for the symbol of
// whoever takes it. Zones are drawn heavy and tinted like a chequerboard: three
// in a row scores anywhere on the arena, so the zone lines have to be readable
// without ever looking like they stop a line.
//
// A neutral space switches nothing off, and gets a dash rather than an icon --
// there is no stone to draw, and an empty corner reads as a printing fault.
function arenaSheet(size) {
  setArena(size);
  const cell = size === 'big' ? 21 : 32;
  const zones = WIDTH / 3;
  const left = (PAGE.w - WIDTH * cell) / 2, top = (PAGE.h - HEIGHT * cell) / 2;
  const at = (x, y) => [left + x * cell, top + y * cell];
  const out = [];

  for (const s of SPACES) {
    const [x, y] = at(s.x, s.y);
    const tinted = (((s.x / 3) | 0) + ((s.y / 3) | 0)) % 2 === 1;
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(cell)}" height="${n(cell)}" ` +
      `fill="${tinted ? TINT : '#fff'}" stroke="${RULE}" stroke-width="0.25"/>`);
    const veto = VETO[s.i];
    const shapes = veto === 'neutral' ? [path('M -3.4 0 H 3.4', 1)] : STONE_ICONS[veto]();
    out.push(`<g transform="translate(${n(x + cell * 0.27)} ${n(y + cell * 0.25)})">` +
      `${icon(shapes, cell * 0.026, VETO_TONE)}</g>`);
    const label = Math.max(2.2, cell * 0.08);
    out.push(text(x + cell - cell * 0.13, y + cell * 0.13 + label, spaceName(s, zones),
      { size: label, weight: 'bold', fill: VETO_TONE, anchor: 'end', spacing: 0.15 }));
  }

  // Zone borders last, over the tints and the space grid.
  for (const z of ZONES) {
    const spaces = ZONE_SPACES[z].map((i) => SPACES[i]);
    const [x, y] = at(Math.min(...spaces.map((s) => s.x)), Math.min(...spaces.map((s) => s.y)));
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(3 * cell)}" height="${n(3 * cell)}" ` +
      `fill="none" stroke="${INK}" stroke-width="0.7"/>`);
  }
  return sheet(out.join('\n'));
}

const out = arg('out', 'print');
if (!existsSync(out)) mkdirSync(out, { recursive: true });
const sheets = {
  'stones-x.svg': stoneSheet('X'),
  'stones-o.svg': stoneSheet('O'),
  'counterattacks.svg': counterattackSheet(),
  'arena-small.svg': arenaSheet('small'),
  'arena-big.svg': arenaSheet('big'),
};
for (const [name, svg] of Object.entries(sheets)) {
  writeFileSync(`${out}/${name}`, svg);
  console.log(`${out}/${name}`);
}
