// The campaign board: four 3x3 boards pinwheeled around a hole, and the hole.
//
// Each board sits one step off centre in its own compass direction, which makes
// the whole thing a 7x7 square with the four 2x2 corners missing:
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
// Neighbouring boards share exactly one square -- the four lowercase ones -- so
// four nines make 32 rather than 36 squares. Those four are the corner spaces an
// attack may claim for either of the two boards they belong to.
//
// Nothing owns d4. It is the hole the four boards leave, and the extra space the
// star marks: it takes a symbol like any other square and counts towards a line,
// but no attack is ever aimed at it and no defender ever stands on it. It only
// ever changes hands by flipping, which is what an attack that places nothing
// does to it.
//
// The four squares the drawing marks B, at a1, g1, a7 and g7, are the corners
// the boards do not reach. They are not spaces and they are not here.

export const SUBBOARDS = ['N', 'W', 'E', 'S'];

// Where each board's top-left square sits in 7x7 coordinates.
const ORIGIN = { N: [2, 0], W: [0, 2], E: [4, 2], S: [2, 4] };

const STAR_XY = [3, 3];

const name = (x, y) => 'abcdefg'[x] + (y + 1);

// ── The spaces ──────────────────────────────────────────────────────────────

// Built board by board so that `boards` comes out in a stable order, then sorted
// reading order so that an index is legible next to the diagram above.
const found = new Map();
for (const b of SUBBOARDS) {
  const [x0, y0] = ORIGIN[b];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const x = x0 + dx, y = y0 + dy, k = `${x},${y}`;
    if (!found.has(k)) found.set(k, { x, y, name: name(x, y), boards: [] });
    found.get(k).boards.push(b);
  }
}

const star = { x: STAR_XY[0], y: STAR_XY[1], name: name(...STAR_XY), boards: [] };
if (found.has(`${star.x},${star.y}`)) throw new Error('the star is inside a board');

export const SPACES = [...found.values(), star]
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .map((s, i) => ({ ...s, i }));

export const STAR = SPACES.find((s) => s.name === star.name).i;

// The 32 squares an attack can be aimed at and a defender can stand on: every
// space except the star.
export const REGULAR = SPACES.filter((s) => s.i !== STAR).map((s) => s.i);

export const N_SPACES = SPACES.length;

const at = new Map(SPACES.map((s) => [`${s.x},${s.y}`, s.i]));
const spaceAt = (x, y) => at.get(`${x},${y}`) ?? -1;

// Which squares belong to each board, and which boards each square belongs to.
export const BOARD_SPACES = Object.fromEntries(
  SUBBOARDS.map((b) => [b, SPACES.filter((s) => s.boards.includes(b)).map((s) => s.i)]),
);
export const SPACE_BOARDS = SPACES.map((s) => s.boards);

// The four shared squares, for the rule that lets either of their boards claim them.
export const CORNERS = SPACES.filter((s) => s.boards.length > 1).map((s) => s.i);

// ── Lines ───────────────────────────────────────────────────────────────────

// Three in a row anywhere on the board, in any of the four axes, regardless of
// which boards the three squares belong to. A line may run through the star and
// eight of them do. It may not run through a missing corner, since all three
// squares have to exist.
const AXES = [[1, 0], [0, 1], [1, 1], [1, -1]];

export const LINES = [];
for (const s of SPACES) {
  for (const [dx, dy] of AXES) {
    const l = [0, 1, 2].map((k) => spaceAt(s.x + dx * k, s.y + dy * k));
    if (l.every((i) => i >= 0)) LINES.push(l);
  }
}

// Every line each space takes part in. The eight squares of the inner ring sit
// on ten lines each, the star on eight, and the outer arm-ends on three.
export const LINES_AT = SPACES.map(() => []);
LINES.forEach((line, li) => line.forEach((i) => LINES_AT[i].push(li)));

// ── Adjacency ───────────────────────────────────────────────────────────────

// Orthogonally adjacent, which is the only kind of adjacency in this game --
// sharing an edge, not a corner. The star is left out: no combatant ever stands
// on it, so it is neither a step on the way anywhere nor a place to step to.
export const ADJACENT = SPACES.map((s) =>
  s.i === STAR ? [] : [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => spaceAt(s.x + dx, s.y + dy))
    .filter((j) => j >= 0 && j !== STAR),
);

// ── Clearing ────────────────────────────────────────────────────────────────

// A scored line clears every board the three symbols stood on, whole, and the
// star as well if the line ran through it. Which is why a line is worth a point
// and not a position: taking it costs you the ground you took it from.
export const LINE_CLEARS = LINES.map((line) => {
  const out = new Set();
  for (const i of line) {
    if (i === STAR) out.add(STAR);
    for (const b of SPACE_BOARDS[i]) for (const j of BOARD_SPACES[b]) out.add(j);
  }
  return [...out].sort((a, b) => a - b);
});

// ── Rendering ───────────────────────────────────────────────────────────────

// `marks` is one entry per space: 0 empty, 1 X, 2 O.
export function render(marks, extra = () => null) {
  const glyph = (i) => extra(i) ?? ['.', 'X', 'O'][marks[i]];
  const rows = [];
  for (let y = 0; y < 7; y++) {
    let row = '';
    for (let x = 0; x < 7; x++) {
      const i = spaceAt(x, y);
      row += ' ' + (i < 0 ? ' ' : i === STAR && !marks[i] ? '*' : glyph(i)).padStart(2);
    }
    rows.push(row);
  }
  return rows.join('\n');
}
