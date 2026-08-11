// The campaign board: four 3x3 boards arranged on a grid, and whatever their
// arrangement leaves behind.
//
// The arrangement is a setting, because the one in the drawing is peculiar and the
// peculiarity has to earn itself. `pinwheel` is that one -- each board one step off
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
// Two things fall out of it. Neighbouring boards share exactly one square -- the
// four lowercase ones -- so four nines make 32 squares rather than 36, and those
// four can be claimed for either of the two boards they belong to. And nothing owns
// d4: it is the hole the four boards leave, the extra space the star marks. It takes
// a symbol and counts towards a line like any other square, but no attack is ever
// aimed at it and no defender ever stands on it, so it changes hands only by
// flipping -- which makes a line through it one the other team cannot block.
//
// `square` is the obvious alternative: the same four boards in a plain 2x2, a 6x6
// with 36 squares, nothing shared and no hole. A line of three still crosses three
// boards there, on the diagonals either side of the centre, so a line can still be
// built in a single round.
//
// The four squares the drawing marks B, at a1, g1, a7 and g7, are the corners the
// pinwheel does not reach. They are not spaces yet.

export const LAYOUTS = {
  // Each entry is board name -> the coordinates of its top-left square.
  pinwheel: { N: [2, 0], W: [0, 2], E: [4, 2], S: [2, 4] },
  square: { A: [0, 0], B: [3, 0], C: [0, 3], D: [3, 3] },
  // Two more the comparison turned up: boards overlapping along a whole row and
  // column, and the pinwheel pulled in by one step. Both connect the boards far
  // more tightly than either of the above.
  touching: { A: [0, 0], B: [2, 0], C: [0, 2], D: [2, 2] },
  offset: { N: [1, 0], W: [0, 2], E: [3, 2], S: [1, 4] },
};

// Live bindings, reassigned by setLayout. Everything downstream imports these by
// name and so follows the switch without being handed a board explicitly.
export let SUBBOARDS, SPACES, STAR, REGULAR, N_SPACES, BOARD_SPACES, SPACE_BOARDS,
  CORNERS, LINES, LINES_AT, ADJACENT, LINE_CLEARS, WIDTH, HEIGHT;

const AXES = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function setLayout(name = 'pinwheel') {
  const origin = LAYOUTS[name];
  if (!origin) throw new Error(`no such layout: ${name}`);
  SUBBOARDS = Object.keys(origin);

  // ── The squares ───────────────────────────────────────────────────────────
  const found = new Map();
  for (const b of SUBBOARDS) {
    const [x0, y0] = origin[b];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const x = x0 + dx, y = y0 + dy, k = `${x},${y}`;
      if (!found.has(k)) found.set(k, { x, y, boards: [] });
      found.get(k).boards.push(b);
    }
  }

  const xs = [...found.values()].map((s) => s.x), ys = [...found.values()].map((s) => s.y);
  WIDTH = Math.max(...xs) + 1;
  HEIGHT = Math.max(...ys) + 1;

  // A hole is a square no board covers but that the boards enclose on all four
  // sides. The pinwheel leaves exactly one, in the middle; the others leave none.
  const holes = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if (found.has(`${x},${y}`)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => found.has(`${x + dx},${y + dy}`))) {
      holes.push({ x, y, boards: [] });
    }
  }
  if (holes.length > 1) throw new Error(`${name} leaves ${holes.length} holes; the star needs exactly one or none`);

  const name0 = (x, y) => 'abcdefgh'[x] + (y + 1);
  SPACES = [...found.values(), ...holes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((s, i) => ({ ...s, i, name: name0(s.x, s.y) }));

  STAR = holes.length ? SPACES.findIndex((s) => !s.boards.length) : -1;
  REGULAR = SPACES.filter((s) => s.i !== STAR).map((s) => s.i);
  N_SPACES = SPACES.length;

  const at = new Map(SPACES.map((s) => [`${s.x},${s.y}`, s.i]));
  const spaceAt = (x, y) => at.get(`${x},${y}`) ?? -1;

  BOARD_SPACES = Object.fromEntries(
    SUBBOARDS.map((b) => [b, SPACES.filter((s) => s.boards.includes(b)).map((s) => s.i)]));
  SPACE_BOARDS = SPACES.map((s) => s.boards);
  CORNERS = SPACES.filter((s) => s.boards.length > 1).map((s) => s.i);

  // ── Lines ─────────────────────────────────────────────────────────────────
  // Three in a row anywhere, in any of the four axes, regardless of which boards
  // the three squares belong to. All three have to exist, so a line cannot run
  // through a square the boards never reach.
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

  // ── Clearing ──────────────────────────────────────────────────────────────
  // A scored line clears every board the three symbols stood on, whole, and the
  // star as well if the line ran through it. Which is why a line is worth a point
  // and not a position: taking it costs you the ground you took it from.
  LINE_CLEARS = LINES.map((line) => {
    const out = new Set();
    for (const i of line) {
      if (i === STAR) out.add(STAR);
      for (const b of SPACE_BOARDS[i]) for (const j of BOARD_SPACES[b]) out.add(j);
    }
    return [...out].sort((a, b) => a - b);
  });
}

setLayout('pinwheel');

// Can these squares be claimed for different boards? A shared square belongs to
// two, so it is a small matching; three squares at most, so it is done by trying
// them. A hole belongs to none and can never be claimed.
export function claimable(spaces, used = []) {
  if (!spaces.length) return true;
  return SPACE_BOARDS[spaces[0]].some((b) =>
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
