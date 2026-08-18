// The drawings, one to a file. Every icon is a list of shapes in its own square of
// coordinates -- eighteen units across, centred on the origin -- so one drawing
// serves a 30mm stone you cut out, a corner of an arena space, and a word in the
// middle of a sentence, at whatever size the page asks for.
//
// Nothing here knows about pages. paper.js writes these out as paper/icons/*.svg,
// and paper/ppp.css decides how big each one is and what it sits on.
//
// The two symbols are drawn in the stone's own square rather than the icon's, since
// they fill it: an X or an O, with a white disc punched through the middle for the
// type's icon to sit in.

export const BOX = 18;         // an icon's square, in its own units
export const SYMBOL_BOX = 30;  // a stone's square, which is what a symbol fills
const FIELD = 8.4;             // radius of the disc punched through a symbol

const INK = '#000';
const FAINT = '#b9b9b9';       // the 3x3 boards inside the Counterattack icons
const FONT = 'Helvetica, Arial, sans-serif';

const n = (v) => (Math.round(v * 100) / 100).toString();

// ── Shapes ──────────────────────────────────────────────────────────────────

// `faint` marks the parts that are context rather than content -- the board an
// effect happens on -- `full` fills a closed path in ink, and `blank` fills it with
// paper, for a shape that has to cover what is drawn under it.
const path = (d, w = 1, { faint = false, full = false, blank = false } = {}) =>
  ({ d, w, faint, full, blank });
const dot = (x, y, r, solid = true, w = 1) => ({ x, y, r, solid, w });
const ring = (x, y, r, w = 1) => dot(x, y, r, false, w);
const word = (t, size) => ({ t, size });

const box = (x, y, w, h) => `M ${n(x)} ${n(y)} h ${n(w)} v ${n(h)} h ${n(-w)} Z`;

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

// A clockwise arc, stopping an arrowhead's length short of where it is going and
// handing back that point and the tangent there, so the head fills the gap and sits
// on the direction of travel rather than on curve.
const arc = (r, from, to, big = 1, gap = 2.2) => {
  const p = (a) => [r * Math.cos((a * Math.PI) / 180), -r * Math.sin((a * Math.PI) / 180)];
  const [sx, sy] = p(from), [mx, my] = p(to + (gap / r) * (180 / Math.PI));
  const [ex, ey] = p(to);
  return {
    d: `M ${n(sx)} ${n(sy)} A ${n(r)} ${n(r)} 0 ${big} 1 ${n(mx)} ${n(my)}`,
    ex, ey, dx: -ey, dy: ex,
  };
};

// A 3x3 board, faint, for the Counterattack icons that need somewhere to happen.
// Cell centres come back with it, since that is what the rest of the icon aims at.
function board(half = 7) {
  const s = (2 * half) / 3;
  const faint = { faint: true };
  const lines = [path(box(-half, -half, 2 * half, 2 * half), 0.3, faint)];
  for (const k of [-1, 1]) {
    lines.push(path(`M ${n((k * s) / 2)} ${n(-half)} V ${n(half)}`, 0.3, faint));
    lines.push(path(`M ${n(-half)} ${n((k * s) / 2)} H ${n(half)}`, 0.3, faint));
  }
  return { lines, cell: (cx, cy) => [cx * s, cy * s] };
}

// ── The six stone types, and the space that switches nothing off ────────────

const STONES = {
  // A row of three squares, an arrow one step along it, and the wrap underneath.
  shift: [
    ...[-6.6, -1.6, 3.4].map((x) => path(box(x, -1.6, 3.2, 3.2), 0.9)),
    path('M -3.4 -4.8 H 1.2', 0.9),
    arrow(3.4, -4.8, 1, 0),
    path('M 6.6 2.6 C 7.6 6.2 5.4 6.6 3.4 6.6 H -3.2', 0.9),
    arrow(-5.4, 6.6, -1, 0, 2.2),
  ],
  // The tile game it is named after, which is what everyone recognises it by.
  '2048': [word('2048', 6.4)],
  // One 2x2 block, turning a step clockwise.
  rotate: (() => {
    const a = arc(6.4, 145, -80);
    return [
      ...[[0.3, -3.1], [-3.1, -3.1], [0.3, 0.3], [-3.1, 0.3]]
        .map(([x, y]) => path(box(x, y, 2.8, 2.8), 0.9)),
      path(a.d, 0.9),
      arrow(a.ex, a.ey, a.dx, a.dy),
    ];
  })(),
  // Nothing moves it, and nothing passes through it.
  mountain: [path('M -6.8 4.8 L -2 -4.8 L 1.2 0.9 L 2.9 -1.4 L 6.8 4.8 Z', 1)],
  // A horseshoe magnet the way it is always drawn: a U, poles up and filled in.
  // Drawn as an outline rather than one thick stroke, which is what keeps it from
  // reading as a cave.
  magnet: [
    path('M -4.9 -5.6 V 1.2 A 4.9 4.9 0 0 0 4.9 1.2 V -5.6 H 2.1 V 1.2 ' +
      'A 2.1 2.1 0 0 1 -2.1 1.2 V -5.6 Z', 0.9),
    path(box(-4.9, -5.6, 2.8, 2.2), 0.9, { full: true }),
    path(box(2.1, -5.6, 2.8, 2.2), 0.9, { full: true }),
  ],
  // Something you keep away from: the waves rise out of it, so it is filled with
  // paper and laid over them rather than letting them run through it.
  stinky: [
    ...[-2.8, 0, 2.8].map((x) =>
      path(`M ${n(x)} 3.4 C ${n(x - 1.8)} 0.6 ${n(x + 1.8)} -1.2 ${n(x)} -3.8`, 0.9)),
    path('M -4.2 5.4 A 4.2 3.4 0 0 1 4.2 5.4 Z', 1, { blank: true }),
  ],
  // A neutral space switches nothing off, and an empty corner reads as a printing
  // fault, so it gets a dash.
  neutral: [path('M -4 0 H 4', 1.2)],
};

// ── The five Counterattacks ─────────────────────────────────────────────────

const ITEM_ICONS = {
  // The centre stone, on its way off the board.
  overtake: [...board().lines, ring(0, 0, 2.4, 1.1),
    path('M 2.4 -2.4 L 7.4 -7.4', 1), arrow(8.4, -8.4, 1, -1, 2.8, 2.2)],
  // A stone of yours, and the empty square it lands on.
  relocate: (() => {
    const b = board();
    const [fx, fy] = b.cell(-1, 1), [tx, ty] = b.cell(1, -1);
    const [ex, ey] = [tx - 1.2, ty - 3.2];
    return [...b.lines, dot(fx, fy, 2.6), ring(tx, ty, 2.4, 0.6),
      path(`M ${n(fx)} ${n(fy - 2.9)} C ${n(fx - 1.4)} ${n(fy - 8)} ` +
        `${n(ex - 5)} ${n(ey - 2.4)} ${n(ex - 2.2)} ${n(ey - 1.1)}`, 0.9),
      arrow(ex, ey, 5, 2.4, 2.4)];
  })(),
  // One pair through the centre, trading places.
  mirror: (() => {
    const b = board();
    const [ax, ay] = b.cell(-1, -1), [bx, by] = b.cell(1, 1);
    return [...b.lines, dot(ax, ay, 2.6), ring(bx, by, 2.4, 1.1),
      path(`M ${n(ax + 3.8)} ${n(ay + 3.8)} L ${n(bx - 3.8)} ${n(by - 3.8)}`, 0.9),
      arrow(ax + 2.3, ay + 2.3, -1, -1, 2.2),
      arrow(bx - 2.3, by - 2.3, 1, 1, 2.2)];
  })(),
  // Their hand, and the one you point at.
  'mind-control': [
    ...[-7.4, -2.4, 2.6].map((x) => path(box(x, 2.2, 4.6, 4.6), x === -2.4 ? 1.4 : 0.7)),
    path('M 0 -7.6 V -1.6', 1),
    arrow(0, 0.6, 0, 1, 2.6, 2.2),
  ],
  // One stone of yours, doing its thing a second time.
  rehearse: (() => {
    const a = arc(4.8, 115, -150);
    return [...board().lines, dot(0, 0, 2.4),
      path(a.d, 1), arrow(a.ex, a.ey, a.dx, a.dy, 2.6, 2.1)];
  })(),
};

// ── The two symbols ─────────────────────────────────────────────────────────

// Drawn whole and then interrupted by the disc, which keeps the X's four arms
// pointing at the corners while the icon gets clean paper to sit on. The O's ring
// leaves the same disc clear by itself; the disc is drawn for both all the same, so
// one rule in the stylesheet lays an icon over either symbol.
const REACH = 11;

const SYMBOLS = {
  'symbol-x': [
    path(`M ${-REACH} ${-REACH} L ${REACH} ${REACH} M ${REACH} ${-REACH} ` +
      `L ${-REACH} ${REACH}`, 3.6),
    path(`M ${-FIELD} 0 A ${FIELD} ${FIELD} 0 1 0 ${FIELD} 0 ` +
      `A ${FIELD} ${FIELD} 0 1 0 ${-FIELD} 0 Z`, 0, { blank: true }),
  ],
  'symbol-o': [
    ring(0, 0, 10.8, 3.8),
    path(`M ${-FIELD} 0 A ${FIELD} ${FIELD} 0 1 0 ${FIELD} 0 ` +
      `A ${FIELD} ${FIELD} 0 1 0 ${-FIELD} 0 Z`, 0, { blank: true }),
  ],
};

// Every drawing there is, by the name of the file it is written to.
export const ICONS = {
  ...Object.fromEntries(Object.entries(STONES).map(([k, v]) => [k, { box: BOX, shapes: v }])),
  ...Object.fromEntries(Object.entries(ITEM_ICONS)
    .map(([k, v]) => [k, { box: BOX, shapes: v }])),
  ...Object.fromEntries(Object.entries(SYMBOLS)
    .map(([k, v]) => [k, { box: SYMBOL_BOX, shapes: v }])),
};

// ── Writing one out ─────────────────────────────────────────────────────────

function shape(s) {
  const colour = s.faint ? FAINT : INK;
  const paint = `stroke="${colour}" stroke-width="${n(s.faint ? 0.3 : s.w)}" ` +
    'stroke-linecap="round" stroke-linejoin="round"';
  if (s.t !== undefined) {
    return `<text x="0" y="${n(s.size * 0.36)}" font-family="${FONT}" ` +
      `font-size="${n(s.size)}" font-weight="bold" text-anchor="middle" fill="${colour}" ` +
      `letter-spacing="0.2">${s.t}</text>`;
  }
  if (s.r === undefined) {
    const fill = s.full ? colour : s.blank ? '#fff' : 'none';
    return `<path d="${s.d}" fill="${fill}" ${s.w ? paint : ''}/>`;
  }
  if (s.solid) return `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="${colour}"/>`;
  return `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="none" ${paint}/>`;
}

// A standalone document, so the stylesheet can point a background at it.
export function svg(name) {
  const { box: side, shapes } = ICONS[name];
  const half = side / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${side} ${side}" ` +
    `width="${side}" height="${side}">
${shapes.map(shape).join('\n')}
</svg>
`;
}
