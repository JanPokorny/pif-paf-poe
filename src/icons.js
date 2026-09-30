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

function spiral() {
  let d = '';
  const t0 = 0, t1 = 2.35 * Math.PI, steps = 60;
  let last;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const r = 1.2 + 5.3 * (i / steps);
    const x = r2(r * Math.cos(t)), y = r2(r * Math.sin(t));
    d += `${i ? 'L' : 'M'} ${x} ${y} `;
    last = t;
  }
  return d;
}

// Open jaw trap: two jaws hinged on the left, teeth pointing inward.
function snare() {
  const H = [-6.2, 0];
  let out = '';
  for (const sgn of [-1, 1]) {
    const T = [6.4, 5.4 * sgn];
    out += P(`M ${H[0]} ${H[1]} L ${T[0]} ${T[1]}`, SW(1.6));
    const dx = T[0] - H[0], dy = T[1] - H[1], L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, nx = -uy * sgn * -1, ny = ux * sgn * -1; // normal toward centre line
    for (const t of [0.42, 0.66, 0.9]) {
      const bx = H[0] + dx * t, by = H[1] + dy * t;
      const a = [r2(bx - ux * 1.1), r2(by - uy * 1.1)], b = [r2(bx + ux * 1.1), r2(by + uy * 1.1)];
      const tip = [r2(bx + nx * 2.2), r2(by + ny * 2.2)];
      out += F(`M ${a[0]} ${a[1]} L ${tip[0]} ${tip[1]} L ${b[0]} ${b[1]} Z`);
    }
  }
  return out + DOT(H[0], H[1], 1.5);
}

const PEBBLE = 'M -5.4 2.3 C -5.9 -1.4 -2.6 -4.2 0.6 -4.1 C 4.2 -4 6.2 -1.4 5.8 1.4 C 5.4 3.9 2.8 4.6 0 4.6 C -3.1 4.6 -5.1 4.1 -5.4 2.3 Z';

const RAW = {
  // ---------- STONES ----------
  pebble: P(PEBBLE) + P('M -2.6 -1.4 C -1.8 -2.3 -0.6 -2.6 0.6 -2.5', SW(1.1)),

  shift:
    P('M -7 -1.7 h 3.4 v 3.4 h -3.4 Z M -1.7 -1.7 h 3.4 v 3.4 h -3.4 Z M 3.6 -1.7 h 3.4 v 3.4 h -3.4 Z', SW(1.3)) +
    arrow(-3.6, -5, 3.6, -5) +
    P('M 6.6 3 C 7.4 6.2 5.6 6.4 3.4 6.4 H -3.4') + head(-5.8, 6.4, 180),

  rotate:
    P('M -3.3 -3.3 h 6.6 v 6.6 h -6.6 Z M 0 -3.3 V 3.3 M -3.3 0 H 3.3', SW(1.3)) +
    arcArrow(0, 0, 6.2, 215, 480),

  magnet:
    P('M -5 -5.8 V 1 A 5 5 0 0 0 5 1 V -5.8 H 2 V 1 A 2 2 0 0 1 -2 1 V -5.8 Z', SW(1.4)) +
    P('M -5 -5.8 h 3 v 2.4 h -3 Z M 2 -5.8 h 3 v 2.4 h -3 Z', ' fill="currentColor"' + SW(1.4)),

  stinky:
    P('M -3 2.6 C -4.8 -0.2 -1.2 -2 -3 -4.8 M 0 2.6 C -1.8 -0.2 1.8 -2 0 -4.8 M 3 2.6 C 1.2 -0.2 4.8 -2 3 -4.8', SW(1.3)) +
    P('M -4.8 6 A 4.8 3.6 0 0 1 4.8 6 Z', ' fill="currentColor"'),

  mountain: P('M -7 5 L -2 -5 L 1.2 0.8 L 3 -1.6 L 7 5 Z'),

  '2048': '<text x="0" y="2.3" font-family="system-ui, sans-serif" font-size="6.4" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="-0.1">2048</text>',

  bumper: DOT(0, 0, 2) + arrow(0, -3.4, 0, -7.4) + arrow(0, 3.4, 0, 7.4) + arrow(-3.4, 0, -7.4, 0) + arrow(3.4, 0, 7.4, 0),

  lasso:
    `<ellipse cx="1" cy="-2.6" rx="5.8" ry="3.6"/>` +
    P('M -3.2 -0.2 C -4.6 1.6 -2 3 -3 4.4 C -3.8 5.6 -5.6 5.8 -6.6 7') + DOT(-3.2, -0.2, 1.3),

  swap:
    DOT(-5.2, 1.6, 1.9) + C(5.2, 1.6, 1.7, SW(1.3)) +
    P('M -5.2 -2 C -4 -6.4 2.8 -6.8 4.5 -3.6') + head(5.2, -1.4, 72) +
    P('M 1.6 5.6 C 0 6.8 -1.8 6.8 -3 6.2') + head(-4.2, 5.2, 205, 2.2, 1.3),

  whirl: DOT(0, 0, 1.6) + P(spiral()) + head(...pt(0, 0, 6.5, 2.35 * 180 + 14), 2.35 * 180 + 14 + 95),

  frog:
    DOT(0, 4.2, 2.2) +
    P('M -6.4 4.6 Q -3.5 -9 4.6 1.8') + head(6, 4.6, 63) +
    P('M -7 7 H -4.5 M 4.5 7 H 7', SW(1.1)),

  beacon:
    DOT(0, 0, 1.8) + C(0, 0, 3.6, SW(1.2)) +
    P('M 0 -7.3 V -5 M 0 5 V 7.3 M -7.3 0 H -5 M 5 0 H 7.3'),

  flip:
    P('M 0 -7.4 V 7.4', SW(1.1) + ' stroke-dasharray="1.4 1.6"') +
    P('M -2 -4.6 V 4.6 L -7 0 Z', ' fill="currentColor"') +
    P('M 2 -4.6 V 4.6 L 7 0 Z'),

  snare: snare(),

  hush:
    C(0, -0.6, 6.4) + P('M -3.8 -2.4 Q -2.6 -1.2 -1.4 -2.4 M 1.4 -2.4 Q 2.6 -1.2 3.8 -2.4', SW(1.3)) +
    P('M -3 2.4 H 3', SW(1.4)) +
    '<rect x="-1.1" y="0" width="2.2" height="7.4" rx="1.1" fill="currentColor" stroke="none"/>',

  glue:
    P('M 0 -6.8 C 2 -3.6 5 -1 5 2.2 A 5 5 0 0 1 -5 2.2 C -5 -1 -2 -3.6 0 -6.8 Z') +
    P('M -2.4 2 A 2.6 2.6 0 0 0 0 4.6', SW(1.2)),

  firecracker:
    P('M -6.8 1.2 h 4.4 v 6.2 h -4.4 Z M -6.8 3.4 h 4.4', SW(1.3)) +
    P('M -4.6 1.2 C -4.6 -2 -1.6 -2 0.4 -3.2', SW(1.2)) +
    DOT(3.2, -4, 1.1) +
    [0, 60, 120, 180, 240, 300].map((a) => { const s = pt(3.2, -4, 2.1, a + 30), e = pt(3.2, -4, 3.7, a + 30); return P(`M ${s[0]} ${s[1]} L ${e[0]} ${e[1]}`, SW(1.3)); }).join(''),

  turncoat:
    C(0, 0, 3.8) + P('M 0 -3.8 A 3.8 3.8 0 0 0 0 3.8 Z', ' fill="currentColor"') +
    arcArrow(0, 0, 6.6, 275, 345, 2.3, 1.4) + arcArrow(0, 0, 6.6, 95, 165, 2.3, 1.4),

  parrot:
    P('M 1.4 -3.2 C 0.2 -6.6 -5.8 -6.6 -5.8 -1.2 C -5.8 2.8 -4.2 5.4 -2.6 7') +
    P('M 1.4 1 C 1.2 3.4 0.4 5.4 -0.4 7') +
    P('M 1.4 -3.2 C 5.4 -4.4 7.4 -1.4 6 2.6 C 5.2 0.6 3.6 0.2 1.4 1 Z', ' fill="currentColor"' + SW(1.2)) +
    DOT(-1.6, -2.4, 1.1),

  twin: C(-2.4, 0, 4) + C(2.4, 0, 4),

  joker:
    P('M -5.4 3 L -6.4 -4 L -2 0.4 L 0 -5 L 2 0.4 L 6.4 -4 L 5.4 3 Z') +
    P('M -5.6 3 h 11.2 v 3 h -11.2 Z') +
    DOT(-6.5, -5.4, 1.2) + DOT(0, -6.3, 1.2) + DOT(6.5, -5.4, 1.2),

  // ---------- TRICKS ----------
  overtake: GRID + C(0, 0, 2.4, SW(1.4)) + arrow(2.2, -2.2, 7.2, -7.2),

  relocate:
    GRID + DOT(-4.67, 4.67, 2.5) + C(4.67, -4.67, 2.2, SW(1.1)) +
    P('M -4.67 1.4 C -6 -3.4 -2 -7.4 0.8 -7.2', SW(1.3)) + head(2.8, -7, 5, 2.4, 1.4),

  mirror:
    GRID + DOT(-4.67, -4.67, 2.5) + C(4.67, 4.67, 2.2, SW(1.3)) +
    P('M -0.9 -0.9 L 0.9 0.9', SW(1.3)) + head(-2.4, -2.4, 225, 2, 1.3) + head(2.4, 2.4, 45, 2, 1.3),

  'mind-control':
    P('M -7.2 2.4 h 4 v 4 h -4 Z M 3.2 2.4 h 4 v 4 h -4 Z', FAINT.replace('0.7', '1')) +
    P('M -2 2.4 h 4 v 4 h -4 Z') +
    arrow(0, -7.4, 0, 0.6),

  rehearse: GRID + DOT(0, 0, 2.3) + arcArrow(0, 0, 4.8, 245, 485, 2.4, 1.4),

  nudge: arrow(-7, 0, -0.6, 0) + DOT(3.8, 0, 2.8) + P('M -6 -3.6 H -3 M -6 3.6 H -3', SW(1.1)),

  muffle:
    P('M -4.6 3.4 V -0.6 A 4.6 4.6 0 0 1 4.6 -0.6 V 3.4 L 6 4.8 H -6 L -4.6 3.4 Z') +
    P('M -1.6 6.6 A 1.6 1.6 0 0 0 1.6 6.6') + P('M 0 -5.2 V -6.6') +
    P('M -6.6 -6.6 L 6.6 6.6'),

  anchor:
    C(0, -5.4, 1.6) + P('M 0 -3.8 V 6.4 M -3.2 -1.6 H 3.2') +
    P('M -6 1.4 C -5.6 4.8 -3 6.4 0 6.4 C 3 6.4 5.6 4.8 6 1.4') +
    P('M -7.2 3 L -6 1.4 L -4.2 2.4 M 7.2 3 L 6 1.4 L 4.2 2.4'),

  pluck:
    P('M -1.8 -7 L 0.4 1.2 M 4.8 -7 L 2.6 1.2 M -1.8 -7 H 4.8') +
    DOT(1.5, 4.4, 2.5) + arrow(-5.8, 6, -5.8, -3.8, 2.3, 1.4),

  bribe:
    `<ellipse cx="0" cy="-3.8" rx="5.6" ry="2.2"/>` +
    P('M -5.6 -3.8 V 3.8 A 5.6 2.2 0 0 0 5.6 3.8 V -3.8 M -5.6 -1.2 A 5.6 2.2 0 0 0 5.6 -1.2 M -5.6 1.3 A 5.6 2.2 0 0 0 5.6 1.3', ''),

  reinforce:
    `<g transform="translate(-1.8 2.4) scale(0.85)">${P(PEBBLE, SW(1.76))}</g>` +
    P('M 4.4 -7.2 V -1.6 M 1.6 -4.4 H 7.2', SW(1.6)),

  // ---------- UI ----------
  heart: P('M 0 6.2 C -4 3.4 -7 0.6 -7 -2.2 C -7 -4.6 -5.2 -6 -3.4 -6 C -1.8 -6 -0.6 -5 0 -3.8 C 0.6 -5 1.8 -6 3.4 -6 C 5.2 -6 7 -4.6 7 -2.2 C 7 0.6 4 3.4 0 6.2 Z'),

  coin: C(0, 0, 6.6) + C(0, 0, 3.6, SW(1.1)),

  star: P(star(0, 0.5, 7.2, 3.1)),

  lock:
    P('M -5.2 -1 h 10.4 v 7.4 h -10.4 Z') +
    P('M -3.2 -1 V -3.4 A 3.2 3.2 0 0 1 3.2 -3.4 V -1') +
    P('M 0 1.8 V 3.6'),

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

  close: P('M -5.2 -5.2 L 5.2 5.2 M 5.2 -5.2 L -5.2 5.2', SW(1.8)),

  undo: P('M -5.6 -2.2 H 2 A 4.2 4.2 0 0 1 2 6.2 H -2.4 M -2.4 -5.6 L -5.8 -2.2 L -2.4 1.2', SW(1.6)),

  info: C(0, 0, 6.6) + DOT(0, -3.3, 1.1) + P('M 0 -0.6 V 3.8', SW(1.7)),

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

  'sound-off':
    P('M -6.8 -2.4 H -4 L 0 -6 V 6 L -4 2.4 H -6.8 Z') +
    P('M 3 -2.4 L 7.2 2.4 M 7.2 -2.4 L 3 2.4'),

  'x-mark': P('M -5.8 -5.8 L 5.8 5.8 M 5.8 -5.8 L -5.8 5.8', SW(3)),

  'o-mark': C(0, 0, 5.6, SW(3)),

  guardian: P('M 0 -7 L 6 -4.6 V 0 C 6 3.8 3.4 6 0 7.4 C -3.4 6 -6 3.8 -6 0 V -4.6 Z') + P('M -2.6 0.2 L -0.6 2.4 L 3 -2.2', SW(1.6)),
  'arrow-up': arrow(0, 6, 0, -6.4, 4, 3),
  'arrow-down': arrow(0, -6, 0, 6.4, 4, 3),
  'arrow-left': arrow(6, 0, -6.4, 0, 4, 3),
  'arrow-right': arrow(-6, 0, 6.4, 0, 4, 3),
  'rotate-cw': arcArrow(0, 0, 5, 200, 470, 3.4, 2.4),
  'rotate-ccw': arcArrow(0, 0, 5, -20, -290, 3.4, 2.4),
};

const G = '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';

export const ICONS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, `${G}${v}</g>`]));

export function icon(name, cls = '') {
  const inner = ICONS[name] ?? ICONS.question;
  return `<svg class="icon ${cls}" viewBox="-9 -9 18 18" aria-hidden="true">${inner}</svg>`;
}
