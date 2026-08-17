// The arena: one playing area divided into four or nine 3x3 zones, and whatever their
// arrangement leaves behind.
//
// The arrangement is a setting, because the one in the drawing is peculiar and the
// peculiarity has to earn itself. `pinwheel` is that one -- each zone one step off
// centre in its own compass direction, so the whole thing is a 7x7 square with the
// four 2x2 corners missing:
//
//        a  b  c  d  e  f  g
//     1  .  .  N  N  N  .  .
//     2  .  .  N  N  N  .  .
//     3  W  W  nw N  ne E  E
//     4  W  W  W  *  E  E  E
//     5  W  W  ws S  es E  E
//     6  .  .  S  S  S  .  .
//     7  .  .  S  S  S  .  .
//
// Two things fall out of it. Neighbouring zones share exactly one square -- the
// four lowercase ones -- so four nines make 32 squares rather than 36, and those
// four can be claimed for either of the two zones they belong to. And nothing owns
// d4: it is the hole the four zones leave, the extra space the star marks. It takes
// a symbol and counts towards a line like any other square, but no attack is ever
// aimed at it and no defender ever stands on it, so it changes hands only by
// flipping -- which makes a line through it one the other team cannot block.
//
// `square` is the obvious alternative: the same four zones in a plain 2x2, a 6x6
// with 36 squares, nothing shared and no hole. A line of three still crosses three
// zones there, on the diagonals either side of the centre, so a line can still be
// built in a single round.
//
// The four squares the drawing marks B, at a1, g1, a7 and g7, are the corners the
// pinwheel does not reach. They are not spaces yet.

export const LAYOUTS = {
  // Each entry is zone name -> the coordinates of its top-left square.
  pinwheel: { N: [2, 0], W: [0, 2], E: [4, 2], S: [2, 4] },
  square: { A: [0, 0], B: [3, 0], C: [0, 3], D: [3, 3] },
  // Nine zones in a 3x3, an 81-square arena. One mark per zone per round means
  // nine marks a round rather than four, which is what makes it the arrangement for
  // thirty a side: the work grows with the players instead of staying at four.
  square3: Object.fromEntries('ABCDEFGHI'.split('').map((b, k) => [b, [3 * (k % 3), 3 * ((k / 3) | 0)]])),
  // Two more the comparison turned up: zones overlapping along a whole row and
  // column, and the pinwheel pulled in by one step. Both connect the zones far
  // more tightly than either of the above.
  touching: { A: [0, 0], B: [2, 0], C: [0, 2], D: [2, 2] },
  offset: { N: [1, 0], W: [0, 2], E: [3, 2], S: [1, 4] },
};

// Live bindings, reassigned by setLayout. Everything downstream imports these by
// name and so follows the switch without being handed an arena explicitly.
export let ZONES, SPACES, STAR, REGULAR, N_SPACES, ZONE_SPACES, SPACE_ZONES,
  CORNERS, LINES, LINES_AT, ADJACENT, NEIGHBOURS, LINE_ZONES, LINE_HALO, LINE_CLEARS,
  VETO, VETO_BY_ZONE, ZONE_VETO, WIDTH, HEIGHT;

// Each square switches off one type of stone for the duels fought on it: the stone is
// still placed and still counts towards a line, but nothing it does happens. Six types
// and a neutral square make seven, laid out so that no two squares sharing a line have
// the same veto where that can be arranged -- the pattern below steps by one across and
// by three down, which on a 6x6 or 9x9 puts every veto within reach of every zone and
// never repeats one along a row, a column or a diagonal of three.
//
// It is a property of the printed arena rather than something drawn per round, so a
// team can plan around it and an attack knows what its people are walking into.
export const VETO_TYPES = ['neutral', 'shift', '2048', 'rotate', 'mountain', 'magnet', 'stinky'];

const AXES = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function setLayout(name = 'pinwheel') {
  const origin = LAYOUTS[name];
  if (!origin) throw new Error(`no such layout: ${name}`);
  ZONES = Object.keys(origin);

  // ── The squares ───────────────────────────────────────────────────────────
  const found = new Map();
  for (const b of ZONES) {
    const [x0, y0] = origin[b];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const x = x0 + dx, y = y0 + dy, k = `${x},${y}`;
      if (!found.has(k)) found.set(k, { x, y, zones: [] });
      found.get(k).zones.push(b);
    }
  }

  const xs = [...found.values()].map((s) => s.x), ys = [...found.values()].map((s) => s.y);
  WIDTH = Math.max(...xs) + 1;
  HEIGHT = Math.max(...ys) + 1;

  // A hole is a square no zone covers but that the zones enclose on all four
  // sides. The pinwheel leaves exactly one, in the middle; the others leave none.
  const holes = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if (found.has(`${x},${y}`)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => found.has(`${x + dx},${y + dy}`))) {
      holes.push({ x, y, zones: [] });
    }
  }
  if (holes.length > 1) throw new Error(`${name} leaves ${holes.length} holes; the star needs exactly one or none`);

  const name0 = (x, y) => 'abcdefgh'[x] + (y + 1);
  SPACES = [...found.values(), ...holes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((s, i) => ({ ...s, i, name: name0(s.x, s.y) }));

  STAR = holes.length ? SPACES.findIndex((s) => !s.zones.length) : -1;
  REGULAR = SPACES.filter((s) => s.i !== STAR).map((s) => s.i);
  N_SPACES = SPACES.length;

  const at = new Map(SPACES.map((s) => [`${s.x},${s.y}`, s.i]));
  const spaceAt = (x, y) => at.get(`${x},${y}`) ?? -1;

  ZONE_SPACES = Object.fromEntries(
    ZONES.map((b) => [b, SPACES.filter((s) => s.zones.includes(b)).map((s) => s.i)]));
  SPACE_ZONES = SPACES.map((s) => s.zones);
  CORNERS = SPACES.filter((s) => s.zones.length > 1).map((s) => s.i);

  // ── Lines ─────────────────────────────────────────────────────────────────
  // Three in a row anywhere, in any of the four axes, regardless of which zones
  // the three squares belong to. All three have to exist, so a line cannot run
  // through a square the zones never reach.
  LINES = [];
  for (const s of SPACES) {
    for (const [dx, dy] of AXES) {
      const l = [0, 1, 2].map((k) => spaceAt(s.x + dx * k, s.y + dy * k));
      if (l.every((i) => i >= 0)) LINES.push(l);
    }
  }
  LINES_AT = SPACES.map(() => []);
  LINES.forEach((line, li) => line.forEach((i) => LINES_AT[i].push(li)));

  // ── Adjacency ─────────────────────────────────────────────────────────────
  // Orthogonal only -- sharing an edge, not a corner. The star is left out: no
  // combatant ever stands on it, so it is neither a step on the way anywhere nor
  // a place to step to.
  ADJACENT = SPACES.map((s) =>
    s.i === STAR ? [] : [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => spaceAt(s.x + dx, s.y + dy))
      .filter((j) => j >= 0 && j !== STAR));

  // Touching squares, edge or corner, for the clearing rule that works outwards
  // from a line rather than by zones. This one does include the star, because the
  // star is a space that holds a symbol even though nobody ever stands on it.
  const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  NEIGHBOURS = SPACES.map((s) => AROUND
    .map(([dx, dy]) => spaceAt(s.x + dx, s.y + dy)).filter((j) => j >= 0));

  // ── Clearing ──────────────────────────────────────────────────────────────
  // What a scored line takes with it is a rule variant, so the arena only supplies
  // the ingredients and campaign.js picks among them.
  //
  //   LINE_ZONES  which zones the three symbols stood on
  //   LINE_HALO    the three squares and everything touching them, edge or corner
  //   LINE_CLEARS  every one of those zones, whole, plus the star if it was in the
  //                line -- the original rule
  LINE_ZONES = LINES.map((line) => [...new Set(line.flatMap((i) => SPACE_ZONES[i]))]);

  LINE_HALO = LINES.map((line) => {
    const out = new Set(line);
    for (const i of line) for (const j of NEIGHBOURS[i]) out.add(j);
    return [...out].sort((a, b) => a - b);
  });

  // The veto pattern. Seven is coprime with the step, so the diagonals do not repeat.
  // `byZone` gives every square of a zone the same veto instead, which is a different
  // game: attacking a zone then means committing to one kind of hand.
  VETO = SPACES.map((s) => VETO_TYPES[(s.x + 3 * s.y) % VETO_TYPES.length]);
  ZONE_VETO = Object.fromEntries(ZONES.map((b, k) => [b, VETO_TYPES[k % VETO_TYPES.length]]));
  VETO_BY_ZONE = SPACES.map((s) => (s.zones.length ? ZONE_VETO[s.zones[0]] : 'neutral'));

  LINE_CLEARS = LINES.map((line, li) => {
    const out = new Set();
    for (const i of line) if (i === STAR) out.add(STAR);
    for (const b of LINE_ZONES[li]) for (const j of ZONE_SPACES[b]) out.add(j);
    return [...out].sort((a, b) => a - b);
  });
}

setLayout('pinwheel');

// Can these squares be claimed for different zones? A shared square belongs to
// two zones, so it is a small matching; three squares at most, so it is done by trying
// them. A hole belongs to no zone and can never be claimed.
export function claimable(spaces, used = []) {
  if (!spaces.length) return true;
  return SPACE_ZONES[spaces[0]].some((b) =>
    !used.includes(b) && claimable(spaces.slice(1), [...used, b]));
}

// `marks` is one entry per space: 0 empty, 1 X, 2 O.
export function render(marks, extra = () => null) {
  const at = new Map(SPACES.map((s) => [`${s.x},${s.y}`, s.i]));
  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    let row = '';
    for (let x = 0; x < WIDTH; x++) {
      const i = at.get(`${x},${y}`);
      row += ' ' + (i === undefined ? ' '
        : (extra(i) ?? (i === STAR && !marks[i] ? '*' : ['.', 'X', 'O'][marks[i]]))).padStart(2);
    }
    rows.push(row);
  }
  return rows.join('\n');
}
