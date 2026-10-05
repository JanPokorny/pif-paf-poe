// Line-icon set, drawn as inline SVG in a -9..9 viewBox.
// Every mark uses currentColor, so icons tint with CSS `color`.

const r2 = (n) => Math.round(n * 100) / 100;
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (cx, cy, r, deg) => [r2(cx + r * Math.cos(rad(deg))), r2(cy + r * Math.sin(rad(deg)))];

// Stroked path (inherits the group defaults) and filled shapes.
const P = (d, extra = '') => `<path d="${d}"${extra}/>`;
const F = (d) => `<path d="${d}" fill="currentColor" stroke-width="0.6"/>`;
const C = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${extra}/>`;
const DOT = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
const SW = (w) => ` stroke-width="${w}"`;
const FAINT = ' stroke-width="0.7" opacity="0.45"';
const FILL_ROCK = ' fill="var(--rock-fill, #c9c6c0)"';
// A fir tree: two tiers of branches and a stub of trunk, base at (cx, by).
const fir = (cx, by, hgt, w) => P(`M ${cx} ${by - hgt} L ${cx + w * 0.75} ${by - hgt * 0.45} L ${cx + w * 0.4} ${by - hgt * 0.45} L ${cx + w} ${by - hgt * 0.08} L ${cx - w} ${by - hgt * 0.08} L ${cx - w * 0.4} ${by - hgt * 0.45} L ${cx - w * 0.75} ${by - hgt * 0.45} Z`, FILL_ROCK)
  + P(`M ${cx} ${by - hgt * 0.08} V ${by + 0.4}`, SW(1.3));

// Filled triangular arrowhead with its tip at (x, y), pointing along `deg`.
function head(x, y, deg, len = 2.6, w = 1.5) {
  const dx = Math.cos(rad(deg)), dy = Math.sin(rad(deg));
  const bx = x - dx * len, by = y - dy * len;
  const a = [r2(bx - dy * w), r2(by + dx * w)];
  const b = [r2(bx + dy * w), r2(by - dx * w)];
  return F(`M ${r2(x)} ${r2(y)} L ${a[0]} ${a[1]} L ${b[0]} ${b[1]} Z`);
}

// Straight arrow from (x1,y1) to tip (x2,y2).
function arrow(x1, y1, x2, y2, len = 2.6, w = 1.5) {
  const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const ex = x2 - Math.cos(rad(deg)) * len * 0.7, ey = y2 - Math.sin(rad(deg)) * len * 0.7;
  return P(`M ${r2(x1)} ${r2(y1)} L ${r2(ex)} ${r2(ey)}`) + head(x2, y2, deg, len, w);
}

// Arc arrow on a circle, from angle a0 to a1 (degrees, y-down; a1 > a0 = clockwise).
function arcArrow(cx, cy, r, a0, a1, len = 2.6, w = 1.5) {
  const cw = a1 > a0;
  const trim = ((len * 0.7) / r) * (180 / Math.PI) * (cw ? 1 : -1);
  const s = pt(cx, cy, r, a0), e = pt(cx, cy, r, a1 - trim);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const tip = pt(cx, cy, r, a1);
  // tangent, nudged back a little to follow the curve at the head
  const tdeg = a1 - trim * 0.5 + (cw ? 90 : -90);
  return P(`M ${s[0]} ${s[1]} A ${r} ${r} 0 ${large} ${cw ? 1 : 0} ${e[0]} ${e[1]}`) + head(tip[0], tip[1], tdeg, len, w);
}

const GRID =
  P('M -7 -7 h 14 v 14 h -14 Z', FAINT) +
  P('M -2.33 -7 V 7 M 2.33 -7 V 7 M -7 -2.33 H 7 M -7 2.33 H 7', FAINT);

function star(cx, cy, ro, ri, n = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const [x, y] = pt(cx, cy, i % 2 ? ri : ro, rot + (i * 180) / n);
    d += `${i ? 'L' : 'M'} ${x} ${y} `;
  }
  return d + 'Z';
}

function gear() {
  const n = 8, ro = 7, ri = 5.1;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    const pts = [pt(0, 0, ri, a - 22.5 + 4), pt(0, 0, ro, a - 12), pt(0, 0, ro, a + 12), pt(0, 0, ri, a + 22.5 - 4)];
    for (const [j, [x, y]] of pts.entries()) d += `${i === 0 && j === 0 ? 'M' : 'L'} ${x} ${y} `;
  }
  return P(d + 'Z') + C(0, 0, 2.2);
}

const PEBBLE = 'M -5.4 2.3 C -5.9 -1.4 -2.6 -4.2 0.6 -4.1 C 4.2 -4 6.2 -1.4 5.8 1.4 C 5.4 3.9 2.8 4.6 0 4.6 C -3.1 4.6 -5.1 4.1 -5.4 2.3 Z';

// Leaf: base (bx,by), pointing along `deg`, length L, half-width W.
function leaf(bx, by, deg, L, W, extra = '') {
  const dx = Math.cos(rad(deg)), dy = Math.sin(rad(deg));
  const tx = r2(bx + dx * L), ty = r2(by + dy * L);
  const mx = bx + dx * L * 0.5, my = by + dy * L * 0.5;
  const c1 = [r2(mx - dy * W * 2), r2(my + dx * W * 2)], c2 = [r2(mx + dy * W * 2), r2(my - dx * W * 2)];
  return P(`M ${r2(bx)} ${r2(by)} Q ${c1[0]} ${c1[1]} ${tx} ${ty} Q ${c2[0]} ${c2[1]} ${r2(bx)} ${r2(by)} Z`, extra);
}

const HEART_D = 'M 0 6.2 C -4 3.4 -7 0.6 -7 -2.2 C -7 -4.6 -5.2 -6 -3.4 -6 C -1.8 -6 -0.6 -5 0 -3.8 C 0.6 -5 1.8 -6 3.4 -6 C 5.2 -6 7 -4.6 7 -2.2 C 7 0.6 4 3.4 0 6.2 Z';
const arcD = (cx, cy, r, a0, a1) => { const s = pt(cx, cy, r, a0), e = pt(cx, cy, r, a1); return `M ${s[0]} ${s[1]} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${e[0]} ${e[1]}`; };

const RAW = {
  // ---------- STONES ----------
  pebble: P(PEBBLE) + P('M -2.6 -1.4 C -1.8 -2.3 -0.6 -2.6 0.6 -2.5', SW(1.1)),

  // >>>: a row pushed along.
  shift: P('M -7 -4.6 L -3.4 0 L -7 4.6 M -2 -4.6 L 1.6 0 L -2 4.6 M 3 -4.6 L 6.6 0 L 3 4.6', SW(1.8)),

  // A refresh sign drawn square: two arrows chasing each other round.
  rotate:
    P('M -3.4 -5.6 H 5.6 V 0.8 M 3.4 5.6 H -5.6 V -0.8', SW(1.6)) + head(5.6, 3.8, 90, 3, 1.8) + head(-5.6, -3.8, 270, 3, 1.8),

  magnet:
    P('M -5 -5.8 V 1 A 5 5 0 0 0 5 1 V -5.8 H 2 V 1 A 2 2 0 0 1 -2 1 V -5.8 Z', SW(1.4)) +
    P('M -5 -5.8 h 3 v 2.4 h -3 Z M 2 -5.8 h 3 v 2.4 h -3 Z', ' fill="currentColor"' + SW(1.4)),

  stinky:
    P('M -3 2.6 C -4.8 -0.2 -1.2 -2 -3 -4.8 M 0 2.6 C -1.8 -0.2 1.8 -2 0 -4.8 M 3 2.6 C 1.2 -0.2 4.8 -2 3 -4.8', SW(1.3)) +
    P('M -4.8 6 A 4.8 3.6 0 0 1 4.8 6 Z', ' fill="currentColor"'),

  mountain: P('M -7.6 5.4 L -2.4 -5.2 L 1.2 1.2 L 3.6 -2.2 L 7.6 5.4') + P('M -8 5.4 H 8') + P('M -4.6 -0.7 L -3.4 0.3 L -2.4 -0.9 L -1.4 0.3 L -0.3 -0.8', SW(1.1)),
  // A rock on the map: a pale mountain in a dark outline, its snowcap left as paper.
  // The page's terrain, by act: what blocks the way, and empty ground.
  // Meadow: three firs, the front one overlapping the two behind; tiny shrubs.
  'block-1': fir(-4.4, 5.2, 9, 3.2) + fir(4.4, 5.2, 9.5, 3.3) + fir(0, 7, 12, 4.2),
  'empty-1': P('M -6.5 3.5 C -6.8 1.6 -5.6 0.6 -4.6 1.6 C -4.2 0.4 -2.6 0.6 -2.6 2 C -1.8 2 -1.6 3.2 -2.2 3.5 Z', FILL_ROCK + SW(1.1))
    + P('M 2.4 -1.5 C 2.2 -3 3.4 -3.7 4.2 -2.8 C 4.8 -3.6 6.2 -3 5.9 -1.8 C 6.6 -1.6 6.5 -0.6 6 -0.4 L 2.4 -0.4 Z', FILL_ROCK + SW(1.1))
    + P('M -4.6 3.5 V 4.6 M 4.2 -0.4 V 0.6', SW(1)),
  // Quarry: a jagged crag, ridges down its faces and ledges cut into its side; gravel.
  'block-2': P('M -8 6 L -5.8 -0.6 L -4 -1.8 L -1.6 -7.2 L 1 -3.4 L 2.6 -4.8 L 5.6 0.6 L 6.6 0.2 L 8 6 Z', FILL_ROCK)
    + P('M -1.6 -7.2 L -0.4 -2.6 L 1.2 0.8 M 2.6 -4.8 L 2.4 -1.6 M -4 -1.8 L -3.4 1.6 M 4.2 3.2 H 7.1 M 3.4 0.6 H 5.8', SW(1)),
  'empty-2': DOT(-5, 3, 0.9) + DOT(-2.6, 4.4, 0.6) + DOT(4.6, -2, 0.8) + DOT(6.2, -0.6, 0.55) + DOT(2.6, -0.8, 0.5) + DOT(-4, -3.6, 0.55),
  // Summit: the snow-capped mountain; tufts of grass in the snow.
  'block-3': P('M -7.6 5.4 L -2.4 -5.2 L 1.2 1.2 L 3.6 -2.2 L 7.6 5.4 Z', FILL_ROCK) + P('M -4.6 -0.7 L -2.4 -5.2 L -0.15 -0.8 L -1.4 0.3 L -2.4 -0.9 L -3.4 0.3 Z', ' fill="var(--paper, #fff)"' + SW(1.1)),
  'empty-3': P('M -6.4 3.6 L -5.6 1 M -5.2 3.6 L -5.2 0.6 M -4 3.6 L -4.6 1.2 M 3.4 -1 L 4 -3.4 M 4.6 -1 L 4.8 -3.8 M 5.8 -1 L 5.4 -3.2', SW(1)),
  rock: P('M -7.6 5.4 L -2.4 -5.2 L 1.2 1.2 L 3.6 -2.2 L 7.6 5.4 Z', ' fill="var(--rock-fill, #c9c6c0)"') + P('M -4.6 -0.7 L -2.4 -5.2 L -0.15 -0.8 L -1.4 0.3 L -2.4 -0.9 L -3.4 0.3 Z', ' fill="var(--paper, #fff)"' + SW(1.1)),

  bumper: DOT(0, 0, 2) + arrow(0, -3.4, 0, -7.4) + arrow(0, 3.4, 0, 7.4) + arrow(-3.4, 0, -7.4, 0) + arrow(3.4, 0, 7.4, 0),

  lasso:
    `<ellipse cx="1" cy="-2.6" rx="5.8" ry="3.6"/>` +
    P('M -3.2 -0.2 C -4.6 1.6 -2 3 -3 4.4 C -3.8 5.6 -5.6 5.8 -6.6 7') + DOT(-3.2, -0.2, 1.3),

  // Two stones, one in front on the left and one behind on the right, and an
  // arrow over them both ways.
  swap:
    C(3.6, 3, 3.9, SW(1.3)) + DOT(-2.9, 3.7, 4.6) +
    P('M -3.6 -2.4 V -3.8 C -3.6 -9 4.2 -9 4.2 -3.8 V -2.9') + head(-3.6, -1.3, 90, 2.4, 1.6) + head(4.2, -1.8, 90, 2.4, 1.6),

  // A frog's head: two eyes on top, a wide grin.
  frog:
    P('M -5.7 -1.2 C -8 0.8 -7.6 6.3 0 6.4 C 7.6 6.3 8 0.8 5.7 -1.2 M -1.3 -1.9 Q 0 -1.3 1.3 -1.9') +
    C(-3.6, -3, 2.4) + C(3.6, -3, 2.4) + DOT(-3.4, -2.8, 1.05) + DOT(3.8, -2.8, 1.05) +
    P('M -4 2.6 Q 0 5.2 4 2.6', SW(1.1)),

  // A small fire with the stones going round it.
  bonfire:
    P('M 0 -3.4 C 1.6 -2 2.4 -0.8 2.4 0.8 C 2.4 2.2 1.3 3 0 3 C -1.3 3 -2.4 2.2 -2.4 0.8 C -2.4 -0.2 -2 -0.9 -1.4 -1.5 C -1.2 -0.6 -0.8 -0.1 -0.4 0 C -0.8 -1.4 -0.6 -2.5 0 -3.4 Z', SW(1.3)) +
    arcArrow(0, 0, 6.6, 200, 340, 2.6, 1.6) + arcArrow(0, 0, 6.6, 20, 160, 2.6, 1.6),

  firecracker:
    P('M -6.8 1.2 h 4.4 v 6.2 h -4.4 Z M -6.8 3.4 h 4.4', SW(1.3)) +
    P('M -4.6 1.2 C -4.6 -2 -1.6 -2 0.4 -3.2', SW(1.2)) +
    DOT(3.2, -4, 1.1) +
    [0, 60, 120, 180, 240, 300].map((a) => { const s = pt(3.2, -4, 2.1, a + 30), e = pt(3.2, -4, 3.7, a + 30); return P(`M ${s[0]} ${s[1]} L ${e[0]} ${e[1]}`, SW(1.3)); }).join(''),

  parrot:
    P('M 1.4 -3.2 C 0.2 -6.6 -5.8 -6.6 -5.8 -1.2 C -5.8 2.8 -4.2 5.4 -2.6 7') +
    P('M 1.4 1 C 1.2 3.4 0.4 5.4 -0.4 7') +
    P('M 1.4 -3.2 C 5.4 -4.4 7.4 -1.4 6 2.6 C 5.2 0.6 3.6 0.2 1.4 1 Z', ' fill="currentColor"' + SW(1.2)) +
    DOT(-1.6, -2.4, 1.1),

  twin: C(-2.4, 0, 4) + C(2.4, 0, 4),

  // An apple: what falls.
  gravity:
    P('M 0 -3 C -2 -4.8 -6.6 -4.4 -6.6 0.6 C -6.6 4.8 -3.8 7.4 -1.8 7 C -0.9 6.8 -0.6 6.4 0 6.4 C 0.6 6.4 0.9 6.8 1.8 7 C 3.8 7.4 6.6 4.8 6.6 0.6 C 6.6 -4.4 2 -4.8 0 -3 Z') +
    P('M 0 -3 C 0 -5 0.5 -6.4 1.4 -7.4', SW(1.3)) +
    P('M 1 -5.4 C 2.8 -7.4 5.2 -6.9 5.6 -6.1 C 4.2 -4.6 2.2 -4.6 1 -5.4 Z', SW(1.1)),

  // ---------- TRICKS ----------
  relocate:
    GRID + DOT(-4.67, 4.67, 2.5) + C(4.67, -4.67, 2.2, SW(1.1)) +
    P('M -4.67 1.4 C -6 -3.4 -2 -7.4 0.8 -7.2', SW(1.3)) + head(2.8, -7, 5, 2.4, 1.4),

  'mind-control':
    P('M -7.2 2.4 h 4 v 4 h -4 Z M 3.2 2.4 h 4 v 4 h -4 Z', FAINT.replace('0.7', '1')) +
    P('M -2 2.4 h 4 v 4 h -4 Z') +
    arrow(0, -7.4, 0, 0.6),

  muffle:
    P('M -4.6 3.4 V -0.6 A 4.6 4.6 0 0 1 4.6 -0.6 V 3.4 L 6 4.8 H -6 L -4.6 3.4 Z') +
    P('M -1.6 6.6 A 1.6 1.6 0 0 0 1.6 6.6') + P('M 0 -5.2 V -6.6') +
    P('M -6.6 -6.6 L 6.6 6.6'),

  // ---------- UI ----------
  heart: P('M 0 6.2 C -4 3.4 -7 0.6 -7 -2.2 C -7 -4.6 -5.2 -6 -3.4 -6 C -1.8 -6 -0.6 -5 0 -3.8 C 0.6 -5 1.8 -6 3.4 -6 C 5.2 -6 7 -4.6 7 -2.2 C 7 0.6 4 3.4 0 6.2 Z'),

  // Filled pale gold, as the heart and the bolt have their washes.
  coin: C(0, 0, 6.6, ' fill="#f1d98a"') + C(0, 0, 3.6, SW(1.1)),
  'chevron-down': P('M -5 -2 L 0 3.2 L 5 -2', SW(1.8)),
  // Energy: a bolt.
  energy: P('M 2 -7.6 L -4.6 1.2 H -0.4 L -2 7.6 L 4.6 -1.2 H 0.4 Z', ' fill="currentColor"' + SW(1.1)),

  star: P(star(0, 0.5, 7.2, 3.1)),

  sword:
    P('M -3.2 2 L 5 -6.4 L 6.8 -6.8 L 6.4 -5 L -2 3.2') +
    P('M -5.4 -0.2 L 0.2 5.4 M -3.4 3.4 L -6.4 6.4'),

  skull:
    P('M -4 6.6 V 3.4 L -5.6 2.4 C -6.8 -2 -4.8 -6.6 0 -6.6 C 4.8 -6.6 6.8 -2 5.6 2.4 L 4 3.4 V 6.6 Z') +
    DOT(-2.4, -1.2, 1.6) + DOT(2.4, -1.2, 1.6) +
    P('M -1.3 6.6 V 4.8 M 1.3 6.6 V 4.8', SW(1.1)) + F('M 0 1.2 L -0.8 2.6 H 0.8 Z'),

  crown:
    P('M -6.2 5 L -6.8 -3 L -3.2 0.2 L 0 -4.8 L 3.2 0.2 L 6.8 -3 L 6.2 5 Z') +
    DOT(-6.8, -4.4, 1.1) + DOT(0, -6.3, 1.1) + DOT(6.8, -4.4, 1.1),

  shop:
    P('M -5.6 -2.4 H 5.6 L 6.4 6.6 H -6.4 Z') +
    P('M -2.8 -2.4 V -4 A 2.8 2.8 0 0 1 2.8 -4 V -2.4'),

  fire:
    P('M 0 -7 C 2.8 -4.6 4.4 -2.6 4.4 0 C 4.4 2.3 2.4 3.6 0 3.6 C -2.4 3.6 -4.4 2.3 -4.4 0 C -4.4 -1.6 -3.7 -2.8 -2.6 -3.8 C -2.4 -2.2 -1.7 -1.2 -0.9 -1 C -1.6 -3.4 -1.1 -5.4 0 -7 Z') +
    P('M -6.4 7 L 6.4 4.6 M -6.4 4.6 L 6.4 7'),

  question:
    P('M -3 -2.8 C -3 -5.2 -1.4 -6.4 0.3 -6.4 C 2.4 -6.4 3.4 -5 3.4 -3.4 C 3.4 -1.4 0 -1 0 1.6', SW(1.7)) +
    DOT(0, 5.2, 1.3),

  chest:
    P('M -6.6 -1.2 h 13.2 v 7.4 h -13.2 Z') +
    P('M -6.6 -1.2 V -3.4 C -6.6 -5.6 -4.4 -6.2 0 -6.2 C 4.4 -6.2 6.6 -5.6 6.6 -3.4 V -1.2') +
    P('M -1.3 -2.4 h 2.6 v 3.2 h -2.6 Z', ' fill="currentColor"' + SW(1)),

  back: P('M 6.4 0 H -5.8 M -1 -5 L -6 0 L -1 5', SW(1.7)),

  check: P('M -6.2 0.6 L -2.2 4.6 L 6.4 -4.4', SW(1.8)),

  undo: P('M -5.6 -2.2 H 2 A 4.2 4.2 0 0 1 2 6.2 H -2.4 M -2.4 -5.6 L -5.8 -2.2 L -2.4 1.2', SW(1.6)),

  gear: gear(),

  map:
    P('M -7 -4.8 L -2.4 -6.4 L 2.4 -4.8 L 7 -6.4 V 4.8 L 2.4 6.4 L -2.4 4.8 L -7 6.4 Z') +
    P('M -2.4 -6.4 V 4.8 M 2.4 -4.8 V 6.4', SW(1.2)),

  trick:
    P('M -3.6 -6.8 h 7.2 a 1.2 1.2 0 0 1 1.2 1.2 v 11.2 a 1.2 1.2 0 0 1 -1.2 1.2 h -7.2 a 1.2 1.2 0 0 1 -1.2 -1.2 v -11.2 a 1.2 1.2 0 0 1 1.2 -1.2 Z') +
    P('M 1 -4.4 L -2.2 0.6 H 0.4 L -1 4.4 L 2.2 -0.6 H -0.4 Z', ' fill="currentColor"' + SW(0.8)),

  hand:
    P('M -2.4 -3.6 C -7 -1 -7 6.4 0 6.4 C 7 6.4 7 -1 2.4 -3.6 Z') +
    P('M -2.4 -3.6 L -3.8 -6.6 H 3.8 L 2.4 -3.6') +
    P('M -1.8 -3.6 C -1 -2.6 1 -2.6 1.8 -3.6 M 1.2 -3 L 3.2 -1.2', SW(1.1)),

  'sound-on':
    P('M -6.8 -2.4 H -4 L 0 -6 V 6 L -4 2.4 H -6.8 Z') +
    P('M 2.8 -2.6 A 3.8 3.8 0 0 1 2.8 2.6 M 4.8 -5 A 6.8 6.8 0 0 1 4.8 5'),

  fullscreen: P('M -7 -3 V -7 H -3 M 3 -7 H 7 V -3 M 7 3 V 7 H 3 M -3 7 H -7 V 3', SW(1.8)),
  'fullscreen-exit': P('M -7 -3 H -3 V -7 M 3 -7 V -3 H 7 M 7 3 H 3 V 7 M -3 7 V 3 H -7', SW(1.8)),

  'music-on':
    P('M -1 4.6 V -6.2 L 6 -7.6 V 2.8') + C(-3.4, 4.6, 2.4) + C(3.6, 2.8, 2.4) + P('M -1 -3.2 L 6 -4.6'),

  'music-off':
    P('M -1 4.6 V -6.2 L 6 -7.6 V 2.8') + C(-3.4, 4.6, 2.4) + C(3.6, 2.8, 2.4) + P('M -7.4 -7.4 L 7.4 7.4', SW(1.8)),

  'sound-off':
    P('M -6.8 -2.4 H -4 L 0 -6 V 6 L -4 2.4 H -6.8 Z') +
    P('M 3 -2.4 L 7.2 2.4 M 7.2 -2.4 L 3 2.4'),

  magpie: P('M -6.5 1.5 C -4 -4.5 2 -5.5 5 -2.5 L 7.5 -3.5 L 6 0 C 4 4 -2 5 -6.5 1.5 Z') + DOT(2.6, -2.2, 0.9) + P('M -6.5 1.5 L -8 5.5 M -4.5 3.2 L -5 6.5') + C(-1, 6.2, 1.3, SW(1.1)),

  'arrow-up': arrow(0, 6, 0, -6.4, 4, 3),
  'arrow-down': arrow(0, -6, 0, 6.4, 4, 3),
  'arrow-left': arrow(6, 0, -6.4, 0, 4, 3),
  'arrow-right': arrow(-6, 0, 6.4, 0, 4, 3),
  'rotate-cw': arcArrow(0, 0, 5, 200, 470, 3.4, 2.4),
  'rotate-ccw': arcArrow(0, 0, 5, -20, -290, 3.4, 2.4),

  'relic-hourglass':
    P('M -5 -7 H 5 M -5 7 H 5', SW(1.7)) +
    P('M -3.8 -7 C -3.8 -2.8 -0.9 -1.6 -0.9 0 C -0.9 1.6 -3.8 2.8 -3.8 7 M 3.8 -7 C 3.8 -2.8 0.9 -1.6 0.9 0 C 0.9 1.6 3.8 2.8 3.8 7') +
    F('M -2.5 -3.8 H 2.5 C 1.8 -2.6 0.6 -2 0 -1.2 C -0.6 -2 -1.8 -2.6 -2.5 -3.8 Z') +
    F('M -3 7 C -2.8 5.4 -1.2 4.4 0 4 C 1.2 4.4 2.8 5.4 3 7 Z') + P('M 0 -0.6 V 3.6', SW(0.8)),

  'relic-wings': [1, -1].map((sg) =>
    `<g transform="scale(${sg} 1)">` +
    P('M -1 -1.8 C -3 -4.8 -5.6 -6 -7.4 -5.8 C -7.4 -3.8 -6.9 -2.4 -6.1 -1.6 C -6.5 -0.4 -5.9 0.8 -4.8 1.3 C -4.8 2.6 -3.4 3.6 -1 3.2') +
    P('M -6.1 -1.6 C -4.6 -1.6 -3 -1 -1.8 0 M -4.8 1.3 C -3.8 1.3 -2.6 1.5 -1.6 1.9', SW(1.1)) + '</g>').join('') +
    `<ellipse cx="0" cy="0.8" rx="1" ry="3.2"/>`,

  'relic-echo':
    P('M -3.3 2.4 V -0.8 A 3.3 3.3 0 0 1 3.3 -0.8 V 2.4 L 4.3 3.6 H -4.3 L -3.3 2.4 Z') +
    DOT(0, 5, 1.1) + P('M 0 -4.1 V -5.4') +
    P(arcD(0, -0.4, 5.6, -35, 35) + arcD(0, -0.4, 5.6, 145, 215), SW(1.3)) +
    P(arcD(0, -0.4, 7.4, -30, 30) + arcD(0, -0.4, 7.4, 150, 210), SW(1.1)),

  'relic-iron-heart':
    P(HEART_D, SW(1.6)) + `<g transform="translate(0 -0.3) scale(0.6)">${P(HEART_D, SW(1.8))}</g>` +
    DOT(-5.3, -2.6, 0.7) + DOT(5.3, -2.6, 0.7) + DOT(-3.4, -4.7, 0.7) + DOT(3.4, -4.7, 0.7) + DOT(-3.6, 2.2, 0.7) + DOT(3.6, 2.2, 0.7) + DOT(0, 4.7, 0.7),

  // Second Wind: three gusts curling at their ends.
  'relic-deep-pockets':
    P('M -7 -3.6 H 2.6 C 5 -3.6 5.6 -6.8 3.4 -7 C 1.8 -7.1 1.4 -5.6 2.2 -5') +
    P('M -7 0.4 H 5 C 7.4 0.4 7.6 3.6 5.4 3.6 C 4 3.6 3.6 2.2 4.4 1.8') +
    P('M -5 4.4 H -0.6 C 1.4 4.4 1.6 7 -0.2 7.1', SW(1.2)),

  // A loyalty card: two stamps in, one to go.
  'relic-satchel':
    P('M -6.4 -4.6 H 6.4 Q 7.4 -4.6 7.4 -3.6 V 3.6 Q 7.4 4.6 6.4 4.6 H -6.4 Q -7.4 4.6 -7.4 3.6 V -3.6 Q -7.4 -4.6 -6.4 -4.6 Z') +
    P('M -5.4 -2.4 H -0.8', SW(1.1)) +
    F(star(-3.8, 1.2, 1.9, 0.8)) + F(star(0, 1.2, 1.9, 0.8)) + C(3.8, 1.2, 1.6, SW(1)),

  'relic-lucky-coin': C(0, 0, 6.6) + P('M 0 -5.3 V -4.7 M 0 5.3 V 4.7 M -5.3 0 H -4.7 M 5.3 0 H 4.7', SW(1)) + F(star(0, 0.3, 3.7, 1.55)),

  'relic-herbs':
    P('M -3.8 7.2 C -2.6 2.6 -0.6 -1.6 3.6 -6.6', SW(1.3)) +
    leaf(-2.6, 3, 200, 4.2, 1.1) + leaf(-2.4, 2.2, 330, 4, 1.1) + leaf(-0.9, -0.2, 190, 4.4, 1.1) +
    leaf(-0.4, -0.9, 330, 4.4, 1.1) + leaf(1.4, -3.4, 225, 3.6, 1) + leaf(1.6, -3.6, 350, 3.6, 1) + leaf(3.6, -6.6, 300, 2, 0.6),

  'relic-badge':
    P('M -6.4 -5.2 Q -6.4 -6.4 -5.2 -6.4 H -0.6 L 6.2 0.4 Q 6.9 1.1 6.2 1.8 L 1.8 6.2 Q 1.1 6.9 0.4 6.2 L -6.4 -0.6 Z') +
    C(-3.3, -3.3, 1.2, SW(1.2)) + P('M -0.4 1.8 L 1.8 -0.4 M 1.2 3.4 L 3.4 1.2', SW(1.2)),

  'relic-clover':
    `<g transform="translate(0 -1)">` +
    [45, 135, 225, 315].map((a) => `<g transform="rotate(${a}) translate(0 -3.1) scale(0.47)">${P(HEART_D, SW(3.2))}</g>`).join('') + DOT(0, 0, 0.9) + '</g>' +
    P('M 0 -0.6 C 0.2 2.6 1.2 5.4 3 7.4', SW(1.5)),

  'relic-bell':
    P('M -5.4 4 C -4 3.4 -4.2 -3 0 -3.2 C 4.2 -3 4 3.4 5.4 4 Z') + P('M -6 4 H 6', SW(1.6)) +
    P('M -0.9 -3.2 V -5.6 M 0.9 -3.2 V -5.6', SW(1.2)) + '<rect x="-1.6" y="-7.4" width="3.2" height="2" rx="1" fill="currentColor" stroke="none"/>' +
    DOT(0, 5.6, 1.2) + P('M -2.4 0.4 C -2 -1 -1.4 -1.6 -0.6 -1.8', SW(1)),

  'relic-phoenix':
    P('M -4 4 C -4.8 -1 -0.8 -6.2 6.6 -6.8 C 6.2 0 1.2 4.8 -4 4 Z') +
    P('M -6.8 6.8 L 3.8 -3.8', SW(1.3)) +
    P('M -1.9 -0.4 L -4.5 -1.2 M 0.8 -3.1 L -1.4 -4.6 M 0.6 1.8 L 1.6 4.2 M 3.2 -0.8 L 5 1', SW(1.1)),

  'relic-anvil':
    P('M -7.4 -4.6 H 6.6 V -2.2 Q 4.2 -2.2 3.2 -0.6 V 2.6 L 5.4 4.8 V 6.4 H -4.4 V 4.8 L -2.2 2.6 V -0.8 Q -2.6 -1.8 -3.8 -2 Q -6.2 -2.4 -7.4 -4.6 Z'),

  'relic-rematch':
    `<g transform="rotate(-18)">` +
    P('M -6.6 -3.6 H 6.6 V -1.4 A 1.4 1.4 0 0 0 6.6 1.4 V 3.6 H -6.6 V 1.4 A 1.4 1.4 0 0 0 -6.6 -1.4 Z') +
    P('M 2.8 -3.6 V 3.6', SW(1.1) + ' stroke-dasharray="0.9 1.3"') +
    P('M -4.2 -1.2 H 0.4 M -4.2 1.2 H -0.8', SW(1.1)) + DOT(4.7, 0, 0.8) + '</g>',

  'relic-piggy':
    `<ellipse cx="-0.6" cy="1" rx="5.6" ry="4.2"/>` +
    P('M 4.8 -0.6 H 6.6 Q 7.2 -0.6 7.2 0 V 1.8 Q 7.2 2.4 6.6 2.4 H 5', SW(1.3)) +
    P('M 0.6 -2.9 L 1.4 -5.2 L 3.2 -2.4', SW(1.3)) +
    P('M -3.6 4.6 V 6.8 M 2.2 4.6 V 6.8', SW(1.6)) +
    P('M -3.6 -2 H -1.2', SW(1.4)) + C(-2.4, -5.8, 1.4, SW(1.1)) +
    P('M -6.2 0.4 C -7.6 0 -7.6 -1.8 -6.4 -1.6', SW(1.1)) + DOT(3.4, -0.4, 0.7),

  // ---------- EVENTS ----------
  'event-stonemason':
    P('M -7 6.6 L -6.2 1.6 L -1.8 0.2 L 3.6 1.6 L 4.6 6.6 Z') + P('M -6.4 3.6 L -3 3.2 M -2 4.8 L 1.2 5', SW(1)) +
    F('M -0.2 -0.2 L 0.8 -2.6 L 2.2 -1.2 Z') + P('M 1.4 -1.8 L 3.6 -4', SW(1.4)) + P('M 3.8 -4.2 L 6.4 -6.8', SW(2.6)) +
    P('M -2.4 -2.4 L -3.4 -3.6 M -0.6 -3.4 L -0.8 -5 M -3 -0.6 L -4.6 -1', SW(1.1)),

  'event-shrine':
    P('M -7.4 -6 Q 0 -4.4 7.4 -6', SW(2)) + P('M -5.8 -2.8 H 5.8', SW(1.6)) +
    P('M -4.2 -5 L -4.8 6.8 M 4.2 -5 L 4.8 6.8', SW(1.8)) + P('M 0 -4.8 V -2.8', SW(1.4)) +
    P('M -6.2 6.8 H -3.4 M 3.4 6.8 H 6.2', SW(1.3)),

  'event-gambler':
    '<rect x="-6" y="-6" width="12" height="12" rx="2.2"/>' +
    DOT(-3, -3, 1.1) + DOT(3, -3, 1.1) + DOT(0, 0, 1.1) + DOT(-3, 3, 1.1) + DOT(3, 3, 1.1),

  'event-well':
    P('M -7 -3.8 L 0 -7.2 L 7 -3.8', SW(1.6)) + P('M -5 -4.6 V 1.6 M 5 -4.6 V 1.6') + P('M -5 -2.6 H 5', SW(1.2)) +
    P('M 0 -2.6 V -1.2', SW(1)) + P('M -1.3 -1.2 H 1.3 L 1 0.8 H -1 Z', SW(1.1)) +
    P('M -6.2 1.6 H 6.2 V 7 H -6.2 Z') + P('M -6.2 4.3 H 6.2 M -2 1.6 V 4.3 M 2.4 1.6 V 4.3 M 0.2 4.3 V 7 M -4.2 4.3 V 7 M 4.4 4.3 V 7', SW(1)),

  'event-hermit':
    P('M -4.4 3.4 C -3 -0.6 -1.2 -4.8 2.2 -6.8 Q 3.6 -7.4 4.8 -6.2 Q 2.8 -6.2 2.2 -4.4 C 2 -1.4 3 1 4.4 3.4') +
    `<ellipse cx="0" cy="4.4" rx="7" ry="2.1"/>` +
    F(star(-0.4, -0.4, 1.8, 0.75)) + DOT(1.8, 1.8, 0.6) + DOT(0.6, -3.8, 0.5),

  'event-transmuter':
    P('M -1.9 -6.6 V -2.4 L -6 5 Q -6.6 6.6 -4.8 6.6 H 4.8 Q 6.6 6.6 6 5 L 1.9 -2.4 V -6.6') + P('M -3 -6.6 H 3', SW(1.6)) +
    P('M -4.2 1.8 Q -2 0.8 0 1.8 Q 2 2.8 4.2 1.8', SW(1.1)) +
    C(-1.4, 4.4, 0.9, SW(1)) + C(1.6, 3.6, 0.6, SW(1)) + DOT(0.4, -4.2, 0.55) + DOT(-0.6, -1.4, 0.45),

  'event-chest':
    P('M -6.6 -1.4 V -3.4 C -6.6 -5.6 -4.4 -6.2 0 -6.2 C 4.4 -6.2 6.6 -5.6 6.6 -3.4 V -1.4') +
    P('M -6.6 -1.4 h 13.2 v 8 h -13.2 Z') +
    P('M -1.6 1.2 C -1.6 0 -0.8 -0.4 0.1 -0.4 C 1.1 -0.4 1.6 0.2 1.6 1 C 1.6 2 0 2.2 0 3.4', SW(1.4)) + DOT(0, 5, 0.85),

  'event-mirror':
    `<ellipse cx="0" cy="-2.1" rx="4.6" ry="5.1"/>` +
    P('M -2.4 -4.8 Q -1.6 -5.8 -0.2 -5.9 M -3 -2.8 L -2.8 -3.6', SW(1.1)) +
    P('M 0 3 V 7.2', SW(2.2)) + P('M -1.4 3.6 H 1.4', SW(1.2)),

  'event-thief':
    P('M 0 -1.4 C -2 -3 -6 -3.4 -7 -1.8 C -7.6 0.6 -6 3.4 -3.8 3.4 C -2 3.4 -1 1.8 0 1.8 C 1 1.8 2 3.4 3.8 3.4 C 6 3.4 7.6 0.6 7 -1.8 C 6 -3.4 2 -3 0 -1.4 Z') +
    `<ellipse cx="-3.5" cy="0.1" rx="1.5" ry="1"/><ellipse cx="3.5" cy="0.1" rx="1.5" ry="1"/>` +
    P('M -7 -1 C -7.8 1 -7.4 3.6 -6.2 5.4 M -6.8 -0.6 C -6.6 2 -5.2 4 -4.2 5.2', SW(1.1)),

  'event-fountain':
    P('M -6.8 1.8 H 6.8 Q 6.2 5 2 5.2 H -2 Q -6.2 5 -6.8 1.8 Z') + P('M -1.2 5.2 V 6.6 M -3.6 7 H 3.6', SW(1.4)) +
    P('M 0 1.8 V -3.6', SW(1.4)) +
    P('M 0 -3.6 C -0.6 -7.6 -5 -7 -5.6 -1 M 0 -3.6 C 0.6 -7.6 5 -7 5.6 -1', SW(1.2)) +
    DOT(-5.6, 0.2, 0.55) + DOT(5.6, 0.2, 0.55) + DOT(0, -5.4, 0.6),

  'event-trader':
    P('M -4 3 V -5.4 Q -4 -6.6 -2.8 -6.6 H 2.8 Q 4 -6.6 4 -5.4 V 3') +
    F('M -4 0.2 H 4 V 2 H -4 Z') +
    P('M -7 4.2 Q -7 3 -4 3 H 4 Q 7 3 7 4.2 Q 7 5.6 4.4 5.6 H -4.4 Q -7 5.6 -7 4.2 Z'),

  'event-library':
    P('M -6.2 3.8 h 12.4 v 3 h -12.4 Z M -4.4 3.8 V 6.8', SW(1.3)) +
    P('M -5.2 0.8 h 10 v 3 h -10 Z M 3 0.8 V 3.8', SW(1.3)) +
    P('M -6 -2.2 h 10.8 v 3 h -10.8 Z M -4.2 -2.2 V 0.8', SW(1.3)) +
    P('M -2.6 -2.2 V -6.2 H 0.2 V -2.2 M -2.6 -5 H 0.2', SW(1.3)) + P('M 0.2 -2.2 V -7.2 H 3 V -2.2 M 0.2 -6 H 3', SW(1.3)),

  'event-bridge':
    P('M -6.6 -4.6 V 5 M 6.6 -4.6 V 5', SW(1.8)) +
    P('M -6.6 -3.6 Q 0 1.4 6.6 -3.6', SW(1.2)) + P('M -6.6 1.8 Q 0 6.4 6.6 1.8', SW(1.5)) +
    P('M -4.4 -1.9 V 3.3 M -2.2 -0.9 V 4.2 M 0 -1.1 V 4.1 M 2.2 -0.9 V 4.2 M 4.4 -1.9 V 3.3', SW(0.9)) +
    P('M -7.4 6.6 Q -5.4 5.8 -3.4 6.6 M 3.4 6.6 Q 5.4 5.8 7.4 6.6', SW(1)),

  'event-nightowl':
    P('M -5.6 -2 L -6 -6.8 L -2.6 -4.6 Q 0 -5.4 2.6 -4.6 L 6 -6.8 L 5.6 -2 Q 7.2 3.8 0 7.2 Q -7.2 3.8 -5.6 -2 Z') +
    C(-2.6, -1, 2.1, SW(1.3)) + C(2.6, -1, 2.1, SW(1.3)) + DOT(-2.4, -0.8, 0.9) + DOT(2.4, -0.8, 0.9) +
    F('M -0.9 1.4 H 0.9 L 0 3.2 Z') + P('M -2.4 4.6 L -1.6 5.2 M 2.4 4.6 L 1.6 5.2', SW(0.9)),

  'event-storyteller':
    P('M -6.6 -4.6 Q -6.6 -6.2 -5 -6.2 H 5 Q 6.6 -6.2 6.6 -4.6 V 1.8 Q 6.6 3.4 5 3.4 H -0.6 L -4.2 6.8 V 3.4 H -5 Q -6.6 3.4 -6.6 1.8 Z') +
    P('M -4 -3.4 H 4 M -4 -1 H 4 M -4 1.2 H 1', SW(1.2)),

  // ---------- MISC ----------
  trophy:
    P('M -4.4 -6.6 H 4.4 V -3 C 4.4 0.4 2.4 1.8 0 1.8 C -2.4 1.8 -4.4 0.4 -4.4 -3 Z') +
    P('M -4.4 -5 H -6.4 C -6.8 -2 -5.6 -0.6 -3.6 -0.5 M 4.4 -5 H 6.4 C 6.8 -2 5.6 -0.6 3.6 -0.5', SW(1.3)) +
    P('M 0 1.8 V 4.4') + P('M -3.4 6.8 H 3.4 V 5.2 Q 3.4 4.4 2.6 4.4 H -2.6 Q -3.4 4.4 -3.4 5.2 Z') +
    F(star(0, -3, 1.9, 0.8)),

  tombstone:
    P('M -4.6 6.2 V -2.4 A 4.6 4.6 0 0 1 4.6 -2.4 V 6.2') + P('M -7.2 6.4 H 7.2', SW(1.6)) +
    P('M 0 -4.4 V 1.6 M -2 -2.4 H 2', SW(1.4)) +
    P('M -6 6.4 L -6.6 4.8 M -5.6 6.4 L -5.4 5 M 5.8 6.4 L 6.5 4.9 M 5.4 6.4 L 5.3 5.1', SW(1)),
};

// A small 3x3 grid, for the rules that are about squares.
const MINI_GRID = P('M -2.2 -6.6 V 6.6 M 2.2 -6.6 V 6.6 M -6.6 -2.2 H 6.6 M -6.6 2.2 H 6.6', FAINT);

// Duel conditions and boss rules.
Object.assign(RAW, {
  'cond-gravity': arrow(0, -6.4, 0, 3.2, 3.4, 2.4) + P('M -6.6 6.2 H 6.6', SW(1.8)) + P('M -4.4 -5 V -1 M 4.4 -5 V -1', SW(1)),
  'cond-nocentre': MINI_GRID + P('M -1.6 -1.6 L 1.6 1.6 M 1.6 -1.6 L -1.6 1.6', SW(1.6)),
  // An open hand, palm out, with a stone in it: your stones on show, for either side to play.
  'cond-shared': P('M -4.4 1 V -4.6 A 1.1 1.1 0 0 1 -2.2 -4.6 V -0.6 M -2.2 -1 V -6.6 A 1.1 1.1 0 0 1 0 -6.6 V -0.8 M 0 -1 V -6.2 A 1.1 1.1 0 0 1 2.2 -6.2 V -0.6 M 2.2 -0.8 V -4.4 A 1.1 1.1 0 0 1 4.4 -4.4 V 2.4 Q 4.4 7.2 0 7.2 Q -3 7.2 -4.6 4.6 L -7 0.8 A 1.1 1.1 0 0 1 -5.2 -0.4 L -4.4 1')
    + C(0, 3.2, 2),
  'rule-tactics': P('M -1 6.6 V -2.6 A 1.4 1.4 0 0 1 1.8 -2.6 V 1.8 L 5 2.6 Q 6.6 3.2 6 5 L 5.2 6.6') + P('M -1 1 L -3.6 -0.2 Q -5.4 0.4 -4.4 2.2 L -1 6.6') + P('M -3.4 -6.2 L -2.2 -4.6 M 0.4 -7.2 V -5.4 M 4 -6.2 L 2.8 -4.6', SW(1)),
  'relic-war-chest':
    P('M -6.6 0 h 13.2 v 6.4 h -13.2 Z') + P('M -6.6 0 V -1.6 C -6.6 -3.6 -4.4 -4.2 0 -4.2 C 4.4 -4.2 6.6 -3.6 6.6 -1.6 V 0') +
    C(-2.6, -6.4, 1.6) + C(1.4, -7, 1.6) + C(4.4, -5.8, 1.4) + P('M -1.3 1 h 2.6 v 2.6 h -2.6 Z', ' fill="currentColor"' + SW(1)),
  'rule-double': P('M -6.6 -1 h 5.6 v 5.6 h -5.6 Z M 1 -4.6 h 5.6 v 5.6 h -5.6 Z') + P('M -3.8 -3.4 V -6.4 M 3.8 3.4 V 6.4', SW(1)),
  'rule-headstart': P('M -6 -5 L -1 0 L -6 5 M 0 -5 L 5 0 L 0 5', SW(1.8)),
  'rule-elko': P('M -5.6 -5.6 H -0.4 V -0.4 H 5.6 V 5.6 H -5.6 Z') + P('M -0.4 -0.4 V 5.6 M -5.6 -0.4 H -0.4', FAINT),
  'rule-clinch': C(-2.6, 0, 3.6) + C(3.4, 0, 3.6, ' stroke-dasharray="1.6 1.2"'),
  'rule-column': MINI_GRID + P('M -6.6 -6.6 L 6.6 6.6', SW(1.4)) + P('M 2.2 -6.6 H 6.6 V 6.6 H 2.2 Z', ' fill="currentColor" fill-opacity="0.25" stroke="none"'),
  'rule-spy': P('M -7 0 Q 0 -6.6 7 0 Q 0 6.6 -7 0 Z') + C(0, 0, 2.2) + DOT(0, 0, 0.9),
  'rule-reserved': MINI_GRID + F(star(0, 0.2, 2.1, 0.9)),
  'rule-patient': RAW['relic-hourglass'],
});

const G = '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';

// The boss's lair, in the act's terrain: a dark mouth in it, which glows once open.
for (const n of [1, 2, 3]) {
  RAW[`lair-${n}`] = RAW[`block-${n}`]
    + P('M -4.4 7.4 V 2 C -4.4 -1.4 -2.4 -3 0 -3 C 2.4 -3 4.4 -1.4 4.4 2 V 7.4 Z', ' fill="var(--lair-in, #3b352e)"' + SW(1.3));
}
export const ICONS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, `${G}${v}</g>`]));

export function icon(name, cls = '') {
  const inner = ICONS[name] ?? ICONS.question;
  return `<svg class="icon ${cls}" viewBox="-9 -9 18 18" aria-hidden="true">${inner}</svg>`;
}
