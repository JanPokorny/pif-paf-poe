// The arena: one playing area divided into zones of nine spaces, four zones or nine of
// them. Everything here is geometry -- what is next to what, which lines exist, and
// which stone type each space switches off.
//
// Two sizes, chosen by headcount:
//
//    small   2x2 zones, a 6x6 arena of 36 spaces, about twelve a side
//    big     3x3 zones, a 9x9 arena of 81 spaces, about thirty a side
//
// The zones tile the arena, so every space belongs to exactly one of them, and a line
// of three can still cross three zones -- on the diagonals either side of a corner
// where zones meet, which is what lets a line be built inside a single round.

export const SIZES = { small: 2, big: 3 };

// Live bindings, reassigned by setArena. Everything downstream imports these by name
// and so follows the switch without being handed an arena explicitly.
export let ZONES, SPACES, SPACE_IDS, N_SPACES, ZONE_SPACES, SPACE_ZONE,
  LINES, LINES_AT, LINE_ZONES, ADJACENT, VETO, WIDTH, HEIGHT;

// Each space switches off one type of stone for the duels fought on it: the stone is
// still placed and still counts towards a line, but nothing it does happens. Six types
// and a neutral space make seven, laid out stepping one across and three down, which
// puts every veto within reach of every zone and never repeats one along a line of
// three. It is printed on the arena rather than drawn per round, so both teams can plan
// around it.
export const VETO_TYPES = ['neutral', 'shift', '2048', 'rotate', 'mountain', 'magnet', 'stinky'];

const AXES = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function setArena(size = 'small') {
  const n = SIZES[size] ?? SIZES[Object.keys(SIZES).find((k) => k === size)];
  if (!n) throw new Error(`no such arena: ${size}`);
  WIDTH = 3 * n;
  HEIGHT = 3 * n;

  const zoneOf = (x, y) => 'ABCDEFGHI'[((y / 3) | 0) * n + ((x / 3) | 0)];
  ZONES = Array.from({ length: n * n }, (_, k) => 'ABCDEFGHI'[k]);

  const name0 = (x, y) => 'abcdefghi'[x] + (y + 1);
  SPACES = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    SPACES.push({ x, y, i: SPACES.length, name: name0(x, y), zone: zoneOf(x, y) });
  }
  N_SPACES = SPACES.length;
  SPACE_IDS = SPACES.map((s) => s.i);
  SPACE_ZONE = SPACES.map((s) => s.zone);
  ZONE_SPACES = Object.fromEntries(
    ZONES.map((z) => [z, SPACES.filter((s) => s.zone === z).map((s) => s.i)]));

  const at = new Map(SPACES.map((s) => [`${s.x},${s.y}`, s.i]));
  const spaceAt = (x, y) => at.get(`${x},${y}`) ?? -1;

  // Three in a row anywhere, in any of the four axes, whichever zones the three
  // spaces belong to.
  LINES = [];
  for (const s of SPACES) {
    for (const [dx, dy] of AXES) {
      const l = [0, 1, 2].map((k) => spaceAt(s.x + dx * k, s.y + dy * k));
      if (l.every((i) => i >= 0)) LINES.push(l);
    }
  }
  LINES_AT = SPACES.map(() => []);
  LINES.forEach((line, li) => line.forEach((i) => LINES_AT[i].push(li)));
  // Which zones a line's three spaces stand in -- one of them is cleared when it scores.
  LINE_ZONES = LINES.map((line) => [...new Set(line.map((i) => SPACE_ZONE[i]))]);

  // Orthogonal only: sharing an edge, not a corner. This is what a defender may step
  // along.
  ADJACENT = SPACES.map((s) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => spaceAt(s.x + dx, s.y + dy)).filter((j) => j >= 0));

  VETO = SPACES.map((s) => VETO_TYPES[(s.x + 3 * s.y) % VETO_TYPES.length]);
}

setArena('small');

// Can these spaces be claimed for different zones? A zone marks one space a round, so
// a set of spaces can all be marked in one round exactly when no two share a zone.
export const claimable = (spaces) =>
  new Set(spaces.map((i) => SPACE_ZONE[i])).size === spaces.length;

// `marks` is one entry per space: 0 empty, 1 X, 2 O.
export function render(marks, extra = () => null) {
  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    let row = '';
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      row += ' ' + (extra(i) ?? ['.', 'X', 'O'][marks[i]]).padStart(2);
    }
    rows.push(row);
  }
  return rows.join('\n');
}
