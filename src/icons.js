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

// Leaf: base (bx,by), pointing along `deg`, length L, half-width W.
function leaf(bx, by, deg, L, W, extra = '') {
  const dx = Math.cos(rad(deg)), dy = Math.sin(rad(deg));
  const tx = r2(bx + dx * L), ty = r2(by + dy * L);
  const mx = bx + dx * L * 0.5, my = by + dy * L * 0.5;
  const c1 = [r2(mx - dy * W * 2), r2(my + dx * W * 2)], c2 = [r2(mx + dy * W * 2), r2(my - dx * W * 2)];
  return P(`M ${r2(bx)} ${r2(by)} Q ${c1[0]} ${c1[1]} ${tx} ${ty} Q ${c2[0]} ${c2[1]} ${r2(bx)} ${r2(by)} Z`, extra);
}

// Outline of a rectangle (cx,cy,hw,hh) rotated by deg, clipped to x <= cut (open at the cut).
function clippedCard(cx, cy, hw, hh, deg, cut) {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  const segs = [];
  for (let i = 0; i < 4; i++) {
    let a = pts[i], b = pts[(i + 1) % 4];
    if (a[0] > cut && b[0] > cut) continue;
    const at = (p, q) => { const t = (cut - p[0]) / (q[0] - p[0]); return [cut, p[1] + (q[1] - p[1]) * t]; };
    if (a[0] > cut) a = at(a, b);
    if (b[0] > cut) b = at(b, a);
    segs.push(`M ${r2(a[0])} ${r2(a[1])} L ${r2(b[0])} ${r2(b[1])}`);
  }
  return P(segs.join(' '));
}

const HEART_D = 'M 0 6.2 C -4 3.4 -7 0.6 -7 -2.2 C -7 -4.6 -5.2 -6 -3.4 -6 C -1.8 -6 -0.6 -5 0 -3.8 C 0.6 -5 1.8 -6 3.4 -6 C 5.2 -6 7 -4.6 7 -2.2 C 7 0.6 4 3.4 0 6.2 Z';
const rays = (cx, cy, r0, r1, angs, w = 1.2) => angs.map((a) => { const s = pt(cx, cy, r0, a), e = pt(cx, cy, r1, a); return P(`M ${s[0]} ${s[1]} L ${e[0]} ${e[1]}`, SW(w)); }).join('');
const arcD = (cx, cy, r, a0, a1) => { const s = pt(cx, cy, r, a0), e = pt(cx, cy, r, a1); return `M ${s[0]} ${s[1]} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${e[0]} ${e[1]}`; };

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

  mountain: P('M -7.6 5.4 L -2.4 -5.2 L 1.2 1.2 L 3.6 -2.2 L 7.6 5.4') + P('M -8 5.4 H 8') + P('M -4.6 -0.7 L -3.4 0.3 L -2.4 -0.9 L -1.4 0.3 L -0.3 -0.8', SW(1.1)),
  // A rock on the map: a pale mountain in a dark outline, its snowcap left as paper.
  rock: P('M -7.6 5.4 L -2.4 -5.2 L 1.2 1.2 L 3.6 -2.2 L 7.6 5.4 Z', ' fill="var(--rock-fill, #c9c6c0)"') + P('M -4.6 -0.7 L -2.4 -5.2 L -0.15 -0.8 L -1.4 0.3 L -2.4 -0.9 L -3.4 0.3 Z', ' fill="var(--paper, #fff)"' + SW(1.1)),

  '2048': '<text x="0" y="2.3" font-family="Permanent Marker, system-ui, sans-serif" font-size="6.2" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="-0.1">2048</text>',

  '4096': '<text x="0" y="2.3" font-family="Permanent Marker, system-ui, sans-serif" font-size="6.2" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="-0.1">4096</text>',

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
  seesaw: P('M -7.5 -0.5 L 7.5 -3.5', SW(1.8)) + P('M -2 5.5 L 0 -1.8 L 2 5.5 Z') + C(-5.6, -3.4, 1.7) + C(5.4, -6.2, 1.7),
  magpie: P('M -6.5 1.5 C -4 -4.5 2 -5.5 5 -2.5 L 7.5 -3.5 L 6 0 C 4 4 -2 5 -6.5 1.5 Z') + DOT(2.6, -2.2, 0.9) + P('M -6.5 1.5 L -8 5.5 M -4.5 3.2 L -5 6.5') + C(-1, 6.2, 1.3, SW(1.1)),
  flytrap: P('M -6.5 -1 C -5 -6.5 5 -6.5 6.5 -1 Z') + P('M -6.5 1 C -5 6.5 5 6.5 6.5 1 Z') + P('M -4 -2.6 L -3.2 -0.9 L -2.2 -2.9 L -1.2 -0.9 L 0 -3.1 L 1.2 -0.9 L 2.2 -2.9 L 3.2 -0.9 L 4 -2.6', SW(1)) + P('M -4 2.6 L -3.2 0.9 L -2.2 2.9 L -1.2 0.9 L 0 3.1 L 1.2 0.9 L 2.2 2.9 L 3.2 0.9 L 4 2.6', SW(1)),
  'arrow-up': arrow(0, 6, 0, -6.4, 4, 3),
  'arrow-down': arrow(0, -6, 0, 6.4, 4, 3),
  'arrow-left': arrow(6, 0, -6.4, 0, 4, 3),
  'arrow-right': arrow(-6, 0, 6.4, 0, 4, 3),
  'rotate-cw': arcArrow(0, 0, 5, 200, 470, 3.4, 2.4),
  'rotate-ccw': arcArrow(0, 0, 5, -20, -290, 3.4, 2.4),

  // ---------- RELICS ----------
  'relic-home-turf':
    P('M -7 -0.4 L 0 -6.6 L 7 -0.4') + P('M -5.2 -1.8 V 6.4 H 5.2 V -1.8') +
    P('M -1.7 6.4 V 2.2 H 1.7 V 6.4', SW(1.3)) + P('M 3.2 -3.8 V -6.2 H 4.9 V -2.4', SW(1.3)),

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

  'relic-velvet-rope':
    P('M -5.4 -3 V 5.6 M 5.4 -3 V 5.6', SW(1.6)) + P('M -7.2 6.6 H -3.6 M 3.6 6.6 H 7.2', SW(1.6)) +
    DOT(-5.4, -4.4, 1.5) + DOT(5.4, -4.4, 1.5) +
    P('M -5.4 -1.8 C -3 4 3 4 5.4 -1.8', SW(2)),

  'relic-iron-heart':
    P(HEART_D, SW(1.6)) + `<g transform="translate(0 -0.3) scale(0.6)">${P(HEART_D, SW(1.8))}</g>` +
    DOT(-5.3, -2.6, 0.7) + DOT(5.3, -2.6, 0.7) + DOT(-3.4, -4.7, 0.7) + DOT(3.4, -4.7, 0.7) + DOT(-3.6, 2.2, 0.7) + DOT(3.6, 2.2, 0.7) + DOT(0, 4.7, 0.7),

  'relic-deep-pockets':
    P('M -5.2 -6.6 H 5.2 L 6.4 6.8 H 2 L 0 -1.2 L -2 6.8 H -6.4 Z') +
    P('M -5.3 -4.6 H 5.3 M 0 -4.6 V -1.6', SW(1.1)) +
    P('M -5.1 -4.6 C -4.8 -2.6 -3.6 -1.8 -2.2 -1.8 V -4.6 M 5.1 -4.6 C 4.8 -2.6 3.6 -1.8 2.2 -1.8 V -4.6', SW(1.1)) +
    DOT(0, -5.6, 0.6),

  'relic-satchel':
    P('M -5 -1.2 C -5 -4.2 -3 -5.2 0 -5.2 C 3 -5.2 5 -4.2 5 -1.2 V 5.6 Q 5 6.8 3.8 6.8 H -3.8 Q -5 6.8 -5 5.6 Z') +
    P('M -1.8 -5.1 V -6.2 Q -1.8 -7.2 -0.8 -7.2 H 0.8 Q 1.8 -7.2 1.8 -6.2 V -5.1', SW(1.3)) +
    P('M -3.2 1.2 H 3.2 V 4.8 Q 3.2 5.3 2.7 5.3 H -2.7 Q -3.2 5.3 -3.2 4.8 Z M -3.2 2.6 H 3.2', SW(1.2)) +
    P('M -5 0 H -6.6 V 4.6 H -5 M 5 0 H 6.6 V 4.6 H 5', SW(1.2)) + DOT(0, 2.6, 0.8),

  'relic-gloves':
    P('M -3.2 6.8 V 2.8 L -5.9 0.2 Q -6.8 -0.8 -5.9 -1.5 Q -5.1 -2 -4.3 -1.2 L -3.2 -0.2 V -4.8 Q -3.2 -5.9 -2.3 -5.9 Q -1.4 -5.9 -1.4 -4.8 V -1.8 V -6.2 Q -1.4 -7.3 -0.4 -7.3 Q 0.6 -7.3 0.6 -6.2 V -1.8 V -5.6 Q 0.6 -6.7 1.6 -6.7 Q 2.6 -6.7 2.6 -5.6 V -1.6 V -4 Q 2.6 -5 3.5 -5 Q 4.4 -5 4.4 -4 V 1.8 Q 4.4 3 3.6 3.6 V 6.8 Z') +
    P('M -3.2 4.4 H 3.6', SW(1.2)),

  'relic-lucky-coin': C(0, 0, 6.6) + P('M 0 -5.3 V -4.7 M 0 5.3 V 4.7 M -5.3 0 H -4.7 M 5.3 0 H 4.7', SW(1)) + F(star(0, 0.3, 3.7, 1.55)),

  'relic-hammer':
    `<g transform="rotate(-35)">` +
    P('M -5.4 -6.2 H 4.4 Q 5.6 -6.2 5.6 -5 V -2.8 Q 5.6 -1.6 4.4 -1.6 H -5.4 Z') + P('M -3.2 -6.2 V -1.6 M 3.4 -6.2 V -1.6', SW(1.1)) +
    P('M -1 -1.6 V 6.2 Q -1 7 0 7 Q 1 7 1 6.2 V -1.6') + '</g>',

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

  'relic-opening-book':
    P('M 0 -3.8 C -2 -5.4 -4.6 -5.6 -7 -4.8 V 5 C -4.6 4.2 -2 4.4 0 6 C 2 4.4 4.6 4.2 7 5 V -4.8 C 4.6 -5.6 2 -5.4 0 -3.8 Z') +
    P('M 0 -3.8 V 6') +
    P('M -5.4 -2.4 C -4 -2.8 -2.8 -2.6 -1.6 -2 M -5.4 0.2 C -4 -0.2 -2.8 0 -1.6 0.6 M -5.4 2.8 C -4 2.4 -2.8 2.6 -1.6 3.2 M 5.4 -2.4 C 4 -2.8 2.8 -2.6 1.6 -2 M 5.4 0.2 C 4 -0.2 2.8 0 1.6 0.6', SW(1)),

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

  'relic-polisher':
    P(star(-1.6, 1.6, 5.6, 1.4, 4)) + F(star(4.6, -4.6, 2.6, 0.7, 4)) + F(star(5, 4.2, 1.6, 0.5, 4)) + DOT(-5.6, -5.4, 0.8),

  'relic-lodestone':
    `<g transform="translate(-1.2 1.2) rotate(45) scale(0.82)">` +
    P('M -5 -5.8 V 1 A 5 5 0 0 0 5 1 V -5.8 H 2 V 1 A 2 2 0 0 1 -2 1 V -5.8 Z', SW(1.7)) +
    P('M -5 -5.8 h 3 v 2.4 h -3 Z M 2 -5.8 h 3 v 2.4 h -3 Z', ' fill="currentColor"' + SW(1.7)) + '</g>' +
    P('M 2.2 -6.2 L 2.8 -7.6 M 5 -5 L 6.6 -6.6 M 6.2 -2.2 L 7.6 -2.8', SW(1.2)),

  'relic-bedrock':
    P('M -7 -2.6 Q -4.6 -6.4 -1.4 -4.8 Q 1.6 -3.4 4 -5.4 Q 6 -6.8 7 -4.4 V 6.4 H -7 Z') +
    P('M -7 0.6 Q -3.6 -1 0 0.4 Q 3.6 1.8 7 0 M -7 3.6 Q -3.2 2.4 0.4 3.6 Q 3.8 4.8 7 3.2', SW(1.1)) +
    DOT(-3.4, -2.4, 0.6) + DOT(2.4, -1.4, 0.6) + DOT(4.6, 2.6, 0.6) + DOT(-4.4, 2, 0.6) + DOT(-1, 5.2, 0.6),

  'relic-pinwheel':
    P('M 0.2 -1.4 L 1.6 7.4', SW(1.4)) +
    [0, 90, 180, 270].map((a) => `<g transform="translate(0 -1.4) rotate(${a})">${P('M 0 0 V -5.6 A 2.8 2.8 0 0 1 0 0 Z', SW(1.3))}</g>`).join('') +
    DOT(0, -1.4, 1),

  'relic-soap':
    P('M -6.6 1.4 Q -6.6 -0.6 -4.6 -0.6 H 3.2 Q 5.2 -0.6 5.2 1.4 V 4.6 Q 5.2 6.6 3.2 6.6 H -4.6 Q -6.6 6.6 -6.6 4.6 Z') +
    P('M -4.6 1.6 H -1.8', SW(1.2)) +
    C(2.2, -3.6, 1.7, SW(1.2)) + C(-1.8, -4.6, 1.1, SW(1.1)) + C(5.4, -6.2, 1.1, SW(1.1)) + DOT(6.2, -2.6, 0.6),

  'relic-slingshot':
    P('M 0 7.2 V 1.6', SW(2)) + P('M 0 1.8 C -3.2 1.2 -4.6 -2 -4.6 -6 M 0 1.8 C 3.2 1.2 4.6 -2 4.6 -6', SW(1.7)) +
    P('M -4.6 -5 L -1.2 -2.8 M 4.6 -5 L 1.2 -2.8', SW(1.1)) + DOT(0, -2.6, 1.5),

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

  // ---------- KITS ----------
  'kit-apprentice':
    `<g transform="rotate(45)">` +
    P('M -1.9 -6.8 H 1.9 V 3.6 L 0 7.2 L -1.9 3.6 Z') + P('M -1.9 -4.6 H 1.9 M -1.9 3.6 H 1.9 M 0 -4.6 V 3.6', SW(1.1)) +
    F('M -0.65 5.9 L 0 7.2 L 0.65 5.9 Z') + '</g>',

  'kit-tinkerer':
    `<g transform="rotate(45) translate(0 0.4)">` +
    P(`M ${pt(0, -4, 3.6, 110).join(' ')} A 3.6 3.6 0 0 1 ${pt(0, -4, 3.6, 251).join(' ')} L -1.2 -4.4 H 1.2 L ${pt(0, -4, 3.6, 289).join(' ')} A 3.6 3.6 0 0 1 ${pt(0, -4, 3.6, 70).join(' ')} V 5.8 A 1.23 1.23 0 0 1 -1.23 5.8 Z`) +
    C(0, 4.4, 0.5, SW(1)) + '</g>',

  'kit-warden':
    P('M 0 -7 L 6 -4.6 V 0 C 6 3.8 3.4 6 0 7.4 C -3.4 6 -6 3.8 -6 0 V -4.6 Z') +
    DOT(0, -1, 1.6) + F('M -0.6 0 L -1.3 3.4 H 1.3 L 0.6 0 Z'),

  'kit-gambler':
    clippedCard(-2.4, 0, 3.6, 5.4, -16, -1.4) +
    P('M -1.4 -5.6 h 7.4 v 11 h -7.4 Z') +
    `<g transform="translate(2.3 0.2) scale(0.28)">${F(HEART_D)}</g>` + DOT(0, -4.2, 0.55) + DOT(4.6, 4, 0.55),

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
  'cond-shared': arcArrow(0, 0, 5.4, 200, 340, 2.8, 1.9) + arcArrow(0, 0, 5.4, 20, 160, 2.8, 1.9),
  'rule-tactics': P('M -1 6.6 V -2.6 A 1.4 1.4 0 0 1 1.8 -2.6 V 1.8 L 5 2.6 Q 6.6 3.2 6 5 L 5.2 6.6') + P('M -1 1 L -3.6 -0.2 Q -5.4 0.4 -4.4 2.2 L -1 6.6') + P('M -3.4 -6.2 L -2.2 -4.6 M 0.4 -7.2 V -5.4 M 4 -6.2 L 2.8 -4.6', SW(1)),
  'relic-war-chest':
    P('M -6.6 0 h 13.2 v 6.4 h -13.2 Z') + P('M -6.6 0 V -1.6 C -6.6 -3.6 -4.4 -4.2 0 -4.2 C 4.4 -4.2 6.6 -3.6 6.6 -1.6 V 0') +
    C(-2.6, -6.4, 1.6) + C(1.4, -7, 1.6) + C(4.4, -5.8, 1.4) + P('M -1.3 1 h 2.6 v 2.6 h -2.6 Z', ' fill="currentColor"' + SW(1)),
  'relic-whetstone':
    P('M -7 3.4 L -4.6 -1.8 H 7 L 4.6 3.4 Z') + P('M -4.6 -1.8 L -7 3.4 V 5.6 L -4.6 0.4 Z M 4.6 3.4 V 5.6 H -7', SW(1.1)) +
    P('M 1.6 -7.4 L 2.2 -4.6 M 5.6 -6.6 L 3.8 -4.2 M -1.8 -6.4 L 0.4 -4.2', SW(1)),
  'rule-double': P('M -6.6 -1 h 5.6 v 5.6 h -5.6 Z M 1 -4.6 h 5.6 v 5.6 h -5.6 Z') + P('M -3.8 -3.4 V -6.4 M 3.8 3.4 V 6.4', SW(1)),
  'rule-headstart': P('M -6 -5 L -1 0 L -6 5 M 0 -5 L 5 0 L 0 5', SW(1.8)),
  'rule-elko': P('M -5.6 -5.6 H -0.4 V -0.4 H 5.6 V 5.6 H -5.6 Z') + P('M -0.4 -0.4 V 5.6 M -5.6 -0.4 H -0.4', FAINT),
  'rule-clinch': C(-2.6, 0, 3.6) + C(3.4, 0, 3.6, ' stroke-dasharray="1.6 1.2"'),
  'rule-column': MINI_GRID + P('M -6.6 -6.6 L 6.6 6.6', SW(1.4)) + P('M 2.2 -6.6 H 6.6 V 6.6 H 2.2 Z', ' fill="currentColor" fill-opacity="0.25" stroke="none"'),
  'rule-spy': P('M -7 0 Q 0 -6.6 7 0 Q 0 6.6 -7 0 Z') + C(0, 0, 2.2) + DOT(0, 0, 0.9),
  'rule-reserved': MINI_GRID + F(star(0, 0.2, 2.1, 0.9)),
  'rule-patient': RAW['relic-hourglass'],
});

RAW['kit-trickster'] = RAW.trick;
RAW['kit-mason'] = RAW.mountain;

const G = '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';

export const ICONS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, `${G}${v}</g>`]));

export function icon(name, cls = '') {
  const inner = ICONS[name] ?? ICONS.question;
  return `<svg class="icon ${cls}" viewBox="-9 -9 18 18" aria-hidden="true">${inner}</svg>`;
}
