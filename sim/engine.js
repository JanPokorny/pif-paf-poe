'use strict';
// Pif-paf-poe engine + experimental "skill" modifiers.
// Port of the game logic in index.html, extended with per-player skills.
// Kept behaviourally identical to index.html when both players have skill 'none'.

const TYPES = ['regular', 'shift', '2048', 'rotate', 'magnet', 'stinky', 'chain'];
// Experimental stones, kept out of TYPES so every existing script and result
// keeps meaning exactly what it meant. Opt in with the --pool flag.
//   mimic    - resolves the movement effect of the stone the opponent placed last turn
//   leech    - must be placed beside an enemy stone, then swaps places with one
//   glue     - itself and its orthogonal neighbours cannot be moved by an effect
//   mountain - cannot be moved by an effect
const EXTRA_TYPES = ['mimic', 'leech', 'glue', 'mountain'];
const ALL_TYPES = TYPES.concat(EXTRA_TYPES);
const TYPE_CODE = { regular: 'rg', shift: 'sh', '2048': '20', rotate: 'ro', magnet: 'mg', stinky: 'sk', chain: 'ch',
  mimic: 'mi', leech: 'le', glue: 'gl', mountain: 'mo' };
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const SUBSQUARES = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
const MOVEMENT_TYPES = ['shift', '2048', 'rotate'];
// Stones with a resolve step after placement. Mimic only has one if it finds
// something to copy; Leech only if it landed next to an enemy stone.
const EFFECT_TYPES = ['shift', '2048', 'rotate', 'chain', 'leech', 'mimic'];
// What Mimic can copy. Mimic itself is excluded, so copies never chain.
const MIMIC_COPIES = ['shift', '2048', 'rotate', 'chain', 'leech'];
const RESTRICTION_TYPES = ['magnet', 'stinky'];
const RING = [0, 1, 2, 5, 8, 7, 6, 3]; // outer ring, clockwise

// ── Skills ──────────────────────────────────────────────────────────────────
// Each is a single passive modifier owned by a player for the whole game.
const SKILLS = {
  none:        { name: 'None',        key: '-',       desc: 'No modifier (baseline).' },
  whirlwind:   { name: 'Whirlwind',   key: 'rotate',  desc: 'Rotate may instead turn the whole 8-cell outer ring one step, CW or CCW.' },
  telekinesis: { name: 'Telekinesis', key: 'shift',   desc: 'Shift may target any row or column, not only the one it was placed in.' },
  relentless:  { name: 'Relentless',  key: 'regular', desc: 'After placing a Regular stone, if you do not have more stones on the board than the opponent, you may take another turn.' },
  overload:    { name: 'Overload',    key: '2048',    desc: '2048 resolves twice; you pick both directions.' },
  lingering:   { name: 'Lingering',   key: 'magnet/stinky', desc: 'Your Magnet/Stinky restriction binds the opponent for their next two turns instead of one.' },
  slither:     { name: 'Slither',     key: 'chain',   desc: 'Your Chain moves and pulls diagonally as well as orthogonally.' },
  anchor:      { name: 'Anchor',      key: 'any',     desc: 'The stone you placed on your last turn cannot be returned to hand by the opponent.' },
  scavenger:   { name: 'Scavenger',   key: 'any',     desc: 'Stones you return from a full board go to YOUR hand instead of the owner\'s.' },
};
const SKILL_IDS = Object.keys(SKILLS);

// ── Rule variants ───────────────────────────────────────────────────────────
// Defaults reproduce index.html exactly. Everything else is an experiment.
const DEFAULT_RULES = {
  // A line completed by a movement effect wins immediately. With false, it is
  // deferred: the opponent gets one turn to break it, and it wins at the end of
  // that turn if it survives. Lines completed by the placement itself always win
  // at once.
  effectWin: true,
  // A movement effect may not be used to complete your own line at all: the
  // winning stone has to be placed, which means it can be blocked.
  effectLineForbidden: false,
  // While the opponent's Magnet/Stinky restriction is on you, your movement
  // stone's effect does not resolve (the stone is still placed).
  restrictionFizzle: false,
  // Every Magnet/Stinky the opponent has on the board restricts you, for as long
  // as it stays there, instead of only the one they played last turn.
  persistentRestriction: false,
  // How many stones Chain may drag after its own mandatory move.
  chainPulls: Infinity,
  // May the very first stone of the game be placed in the centre?
  openCentre: true,
  // Where the very first stone of the game may go: 'any' | 'centre' | 'edge' | 'corner'.
  openingSquare: 'any',
  // The opening stone resolves no effect and imposes no restriction.
  dullOpening: false,
  // Extra Regular stones handed to whoever moves second.
  secondPlayerExtra: 0,
  // Pie rule: after the opening turn, the second player may trade seats, taking
  // the opening stone and the hand that played it.
  pieRule: false,
};

const CENTRE = [4], EDGES = [1, 3, 5, 7], CORNERS = [0, 2, 6, 8];

// ── Board helpers ───────────────────────────────────────────────────────────

function opp(p) { return p === 'X' ? 'O' : 'X'; }
function adj(a, b) {
  const r1 = (a / 3) | 0, c1 = a % 3, r2 = (b / 3) | 0, c2 = b % 3;
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}
function adjDiag(a, b) {
  const r1 = (a / 3) | 0, c1 = a % 3, r2 = (b / 3) | 0, c2 = b % 3;
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && (dr + dc) > 0;
}
function boardFull(b) { return b.every(c => c !== null); }
function check3(board, p) {
  return LINES.some(([a, b, c]) =>
    board[a] && board[a].player === p && board[b] && board[b].player === p && board[c] && board[c].player === p);
}
function subsquaresFor(pos) { return Object.keys(SUBSQUARES).filter(k => SUBSQUARES[k].includes(pos)); }
function countStones(board, p) { let n = 0; for (let i = 0; i < 9; i++) if (board[i] && board[i].player === p) n++; return n; }
function findById(board, id) { if (id == null) return -1; for (let i = 0; i < 9; i++) if (board[i] && board[i].id === id) return i; return -1; }

// Chain adjacency depends on the mover's skill.
function chainAdj(s, a, b) { return s.skills[s.currentPlayer] === 'slither' ? adjDiag(a, b) : adj(a, b); }

// ── State ───────────────────────────────────────────────────────────────────

function initGameState(handsX, handsO, firstPlayer, skills, rules) {
  const R = rules ? { ...DEFAULT_RULES, ...rules } : DEFAULT_RULES;
  const hands = { X: [...handsX], O: [...handsO] };
  for (let i = 0; i < R.secondPlayerExtra; i++) hands[opp(firstPlayer)].push('regular');
  const s = {
    rules: R,
    board: Array(9).fill(null),
    hands,
    skills: { X: (skills && skills.X) || 'none', O: (skills && skills.O) || 'none' },
    currentPlayer: firstPlayer,
    restriction: null,       // {type,pos,owner,uses}
    history: new Set(),
    phase: 'select',
    selectedStone: null,
    placedPos: null,
    winner: null,
    winReason: null,
    chainEmpty: null,
    chainMoved: null,
    nextId: 1,
    anchored: { X: null, O: null }, // stone id protected from removal
    pending2048: 0,                 // extra 2048 resolutions queued (Overload)
    lastPlaced: { X: null, O: null },  // what each player placed on their last turn (Mimic)
    mimicAs: null,                     // the effect a Mimic is borrowing this turn
    turnsDone: 0,
    pieResolved: false,
    lineOnPlace: false,             // mover already had a line before any effect
    movedThisTurn: false,           // an effect or chain move has run this turn
    chainPulled: 0,
    stats: { X: {}, O: {} },        // activation counters; dropped by cloneState
  };
  s.hasMimic = hands.X.includes('mimic') || hands.O.includes('mimic');
  s.history.add(hashState(s));
  return s;
}

function cloneState(s) {
  return {
    rules: s.rules,
    board: s.board.map(c => c ? { player: c.player, type: c.type, id: c.id } : null),
    hands: { X: [...s.hands.X], O: [...s.hands.O] },
    skills: s.skills,
    currentPlayer: s.currentPlayer,
    restriction: s.restriction ? { ...s.restriction } : null,
    history: new Set(s.history),
    phase: s.phase,
    selectedStone: s.selectedStone,
    placedPos: s.placedPos,
    winner: s.winner,
    winReason: s.winReason,
    chainEmpty: s.chainEmpty != null ? s.chainEmpty : null,
    chainMoved: s.chainMoved ? new Set(s.chainMoved) : null,
    nextId: s.nextId,
    anchored: { X: s.anchored.X, O: s.anchored.O },
    pending2048: s.pending2048,
    lineOnPlace: s.lineOnPlace,
    movedThisTurn: s.movedThisTurn,
    chainPulled: s.chainPulled,
    dullTurn: s.dullTurn,
    lastPlaced: { X: s.lastPlaced.X, O: s.lastPlaced.O },
    mimicAs: s.mimicAs,
    hasMimic: s.hasMimic,
    turnsDone: s.turnsDone,
    pieResolved: s.pieResolved,
  };
}

function hashState(s) {
  let h = '';
  for (let i = 0; i < 9; i++) { const c = s.board[i]; h += c ? c.player + TYPE_CODE[c.type] : '..'; }
  h += '|';
  if (s.restriction) h += s.restriction.type[0] + s.restriction.pos + s.restriction.owner + s.restriction.uses;
  // What was played last turn is part of the position only when a Mimic could
  // read it. Gated so games without Mimic hash exactly as index.html does, and
  // the parity check keeps its meaning.
  if (s.hasMimic) h += '|' + (s.lastPlaced.X || '-') + (s.lastPlaced.O || '-');
  return h;
}

// Activation counters, incremented only on the real game state (clones drop `stats`).
function bump(s, key, player) {
  if (!s.stats) return;
  const p = player || s.currentPlayer;
  s.stats[p][key] = (s.stats[p][key] || 0) + 1;
}

// ── Effects ─────────────────────────────────────────────────────────────────

function applyShift(board, pos, dir, line) {
  // line: optional {axis:'row'|'col', index:0..2} for Telekinesis; defaults to the stone's own line.
  const r = (pos / 3) | 0, c = pos % 3;
  const horiz = (dir === 'left' || dir === 'right');
  let idx;
  if (line) {
    if (line.axis === 'row') idx = [line.index * 3, line.index * 3 + 1, line.index * 3 + 2];
    else idx = [line.index, line.index + 3, line.index + 6];
  } else if (horiz) idx = [r * 3, r * 3 + 1, r * 3 + 2];
  else idx = [c, c + 3, c + 6];
  const v = idx.map(i => board[i]);
  const shift = (dir === 'right' || dir === 'down') ? 2 : 1;
  for (let i = 0; i < 3; i++) board[idx[i]] = v[(i + shift) % 3];
}

function apply2048(board, dir) {
  const horiz = dir === 'left' || dir === 'right';
  const toEnd = dir === 'right' || dir === 'down';
  for (let i = 0; i < 3; i++) {
    const idx = horiz ? [i * 3, i * 3 + 1, i * 3 + 2] : [i, i + 3, i + 6];
    const stones = idx.map(j => board[j]).filter(x => x !== null);
    const res = Array(3).fill(null);
    if (toEnd) { for (let j = 0; j < stones.length; j++) res[3 - stones.length + j] = stones[j]; }
    else { for (let j = 0; j < stones.length; j++) res[j] = stones[j]; }
    for (let j = 0; j < 3; j++) board[idx[j]] = res[j];
  }
}

function applyRotate(board, sq) {
  const [tl, tr, bl, br] = SUBSQUARES[sq];
  const s = [board[tl], board[tr], board[bl], board[br]];
  board[tl] = s[2]; board[tr] = s[0]; board[br] = s[1]; board[bl] = s[3];
}

function applyRing(board, dirCw) {
  const v = RING.map(i => board[i]);
  for (let i = 0; i < RING.length; i++) {
    const src = dirCw ? (i - 1 + RING.length) % RING.length : (i + 1) % RING.length;
    board[RING[i]] = v[src];
  }
}

// One implementation of "resolve a movement effect onto this board", shared by
// the real move, the immobility veto, the effect-line filter and the MCTS
// preview, so the four can never drift apart.
function applyEffectTo(board, type, pos, a) {
  if (type === 'shift') applyShift(board, pos, a.direction, a.line);
  else if (type === '2048') apply2048(board, a.direction);
  else if (type === 'rotate') { if (a.ring) applyRing(board, a.ring === 'cw'); else applyRotate(board, a.subsquare); }
  else if (type === 'leech') { const t = board[a.swap]; board[a.swap] = board[pos]; board[pos] = t; }
}

// The effect currently resolving: Mimic borrows another stone's, everything else
// uses its own.
function effectiveType(s) { return s.mimicAs || s.selectedStone; }

function applyEffect(s, a) {
  applyEffectTo(s.board, effectiveType(s), s.placedPos, a);
}

// ── Immobility (Glue, Mountain) ─────────────────────────────────────────────
// Glue and Mountain turn "this movement does not happen" into a property of the
// board rather than a rules clause: a direction that would drag a stuck stone is
// simply not on the menu, and a stone with no legal direction left resolves
// nothing. That is restrictionFizzle, expressed as board position.

function immobile(board, i) {
  const c = board[i];
  if (!c) return false;
  if (c.type === 'mountain' || c.type === 'glue') return true;
  for (let j = 0; j < 9; j++) if (board[j] && board[j].type === 'glue' && adj(i, j)) return true;
  return false;
}

function anyImmobile(board) {
  for (let i = 0; i < 9; i++) if (immobile(board, i)) return true;
  return false;
}

// Effects are permutations of the board's references, so "did this stone move"
// is an identity comparison. Immobility is judged on the pre-effect board.
function movesStuckStone(s, a) {
  if (!anyImmobile(s.board)) return false;
  const b = s.board.slice();
  if (a.type === 'effect') applyEffectTo(b, effectiveType(s), s.placedPos, a);
  else if (a.type === 'chainMove') { b[a.pos] = b[s.placedPos]; b[s.placedPos] = null; }
  else if (a.type === 'chainPull') { b[s.chainEmpty] = b[a.pos]; b[a.pos] = null; }
  else return false;
  for (let i = 0; i < 9; i++) if (immobile(s.board, i) && b[i] !== s.board[i]) return true;
  return false;
}

function withoutStuck(s, acts) {
  if (!anyImmobile(s.board)) return acts;
  return acts.filter(a => !movesStuckStone(s, a));
}

// ── Legal actions ───────────────────────────────────────────────────────────

function restrictionActive(s) {
  if (s.rules.persistentRestriction) {
    const o = opp(s.currentPlayer);
    for (let i = 0; i < 9; i++) {
      const c = s.board[i];
      if (c && c.player === o && RESTRICTION_TYPES.includes(c.type)) return { type: c.type, pos: i, owner: o, uses: 1 };
    }
    return null;
  }
  return s.restriction && s.restriction.owner !== s.currentPlayer ? s.restriction : null;
}

// Placement filter for persistent restrictions: adjacent to at least one enemy
// Magnet, and adjacent to no enemy Stinky. Relaxed step by step if that leaves
// nowhere to play, so a lock can never deadlock the game.
function persistentFilter(s, free) {
  const o = opp(s.currentPlayer);
  const magnets = [], stinkies = [];
  for (let i = 0; i < 9; i++) {
    const c = s.board[i];
    if (!c || c.player !== o) continue;
    if (c.type === 'magnet') magnets.push(i);
    else if (c.type === 'stinky') stinkies.push(i);
  }
  if (!magnets.length && !stinkies.length) return free;
  const okMagnet = f => !magnets.length || magnets.some(m => adj(f, m));
  const okStinky = f => stinkies.every(st => !adj(f, st));
  for (const test of [f => okMagnet(f) && okStinky(f), okStinky, okMagnet]) {
    const ok = free.filter(test);
    if (ok.length) return ok;
  }
  return free;
}

function getRemoveActions(s) {
  const o = opp(s.currentPlayer);
  let cands = [];
  for (let i = 0; i < 9; i++) if (s.board[i] && s.board[i].player === o) cands.push(i);
  // Anchor: opponent's most recently placed stone is untouchable (unless nothing else is left).
  if (s.skills[o] === 'anchor' && s.anchored[o] != null) {
    const prot = findById(s.board, s.anchored[o]);
    const rest = cands.filter(i => i !== prot);
    if (rest.length) cands = rest;
  }
  const r = restrictionActive(s);
  if (r) {
    const noR = cands.filter(i => i !== r.pos);
    const ful = noR.filter(i => r.type === 'magnet' ? adj(i, r.pos) : !adj(i, r.pos));
    const pool = ful.length ? ful : noR.length ? noR : cands;
    return pool.map(pos => ({ type: 'remove', pos }));
  }
  return cands.map(pos => ({ type: 'remove', pos }));
}

function getSelectActions(s) {
  return [...new Set(s.hands[s.currentPlayer])].map(t => ({ type: 'select', stoneType: t }));
}

function getPlaceActions(s) {
  let free = [];
  for (let i = 0; i < 9; i++) if (!s.board[i]) free.push(i);
  if (free.length === 9) {                       // the opening placement
    const sq = s.rules.openingSquare;
    if (sq === 'centre') free = free.filter(i => CENTRE.includes(i));
    else if (sq === 'edge') free = free.filter(i => EDGES.includes(i));
    else if (sq === 'corner') free = free.filter(i => CORNERS.includes(i));
    else if (!s.rules.openCentre) free = free.filter(i => i !== 4);
  }
  if (s.rules.persistentRestriction) {
    free = persistentFilter(s, free);
  } else {
    const r = restrictionActive(s);
    if (r) {
      const ok = free.filter(i => r.type === 'magnet' ? adj(i, r.pos) : !adj(i, r.pos));
      if (ok.length) free = ok;
    }
  }
  // Leech wants to land beside an enemy stone. Applied after the opponent's
  // restriction, which outranks it: a Leech with nowhere to latch on is still
  // placeable, it just arrives inert.
  if (s.selectedStone === 'leech') {
    const o = opp(s.currentPlayer);
    const near = free.filter(i => {
      for (let j = 0; j < 9; j++) if (s.board[j] && s.board[j].player === o && adj(i, j)) return true;
      return false;
    });
    if (near.length) free = near;
  }
  return free.map(pos => ({ type: 'place', pos }));
}

// Would this action leave the mover with a line they did not already have?
function makesNewLine(s, a) {
  if (!s.rules.effectLineForbidden || s.lineOnPlace) return false;
  const b = s.board.slice();
  if (a.type === 'effect') applyEffectTo(b, effectiveType(s), s.placedPos, a);
  else if (a.type === 'chainMove') { b[a.pos] = b[s.placedPos]; b[s.placedPos] = null; }
  else if (a.type === 'chainPull') { b[s.chainEmpty] = b[a.pos]; b[a.pos] = null; }
  else return false;
  return check3(b, s.currentPlayer);
}

// The stuck filter is a hard legality rule, so it is applied before the soft
// effectLineForbidden filter (which keeps one option rather than none).
function effectOptions(s) { return withoutStuck(s, getEffectActions(s)); }

function chainMoveOptions(s) {
  const a = [];
  for (let i = 0; i < 9; i++) if (!s.board[i] && chainAdj(s, i, s.placedPos)) a.push({ type: 'chainMove', pos: i });
  return withoutStuck(s, a);
}

function withoutWinningEffects(s, acts, keepAtLeastOne) {
  if (!s.rules.effectLineForbidden) return acts;
  const ok = acts.filter(a => !makesNewLine(s, a));
  return (ok.length || !keepAtLeastOne) ? ok : acts;
}

function getEffectActions(s) {
  const t = effectiveType(s), p = s.placedPos, sk = s.skills[s.currentPlayer];
  const DIRS = ['up', 'down', 'left', 'right'];
  if (t === 'leech') {
    const o = opp(s.currentPlayer), out = [];
    for (let i = 0; i < 9; i++) if (s.board[i] && s.board[i].player === o && adj(i, p)) out.push({ type: 'effect', swap: i });
    return out;
  }
  if (t === '2048') return DIRS.map(d => ({ type: 'effect', direction: d }));
  if (t === 'shift') {
    const base = DIRS.map(d => ({ type: 'effect', direction: d }));
    if (sk !== 'telekinesis') return base;
    const out = [];
    for (const d of DIRS) {
      const axis = (d === 'left' || d === 'right') ? 'row' : 'col';
      const own = axis === 'row' ? ((p / 3) | 0) : (p % 3);
      for (let i = 0; i < 3; i++) out.push({ type: 'effect', direction: d, line: i === own ? null : { axis, index: i } });
    }
    return out;
  }
  if (t === 'rotate') {
    const base = subsquaresFor(p).map(sq => ({ type: 'effect', subsquare: sq }));
    if (sk === 'whirlwind' && p !== 4) base.push({ type: 'effect', ring: 'cw' }, { type: 'effect', ring: 'ccw' });
    return base;
  }
  return [];
}

function getLegalActions(s) {
  switch (s.phase) {
    case 'remove': return getRemoveActions(s);
    case 'select': return getSelectActions(s);
    case 'place': return getPlaceActions(s);
    case 'effect': return withoutWinningEffects(s, effectOptions(s), true);
    case 'chainMove': return withoutWinningEffects(s, chainMoveOptions(s), true);
    case 'chainPull': {
      const a = [{ type: 'chainPass' }];
      if (s.chainPulled >= s.rules.chainPulls) return a;
      const pulls = [];
      for (let i = 0; i < 9; i++) if (s.board[i] && chainAdj(s, i, s.chainEmpty) && !s.chainMoved.has(i)) pulls.push({ type: 'chainPull', pos: i });
      return a.concat(withoutWinningEffects(s, withoutStuck(s, pulls), false));
    }
    case 'bonus': return [{ type: 'bonusTake' }, { type: 'bonusPass' }];
    case 'pie': return [{ type: 'pieKeep' }, { type: 'pieSwap' }];
    default: return [];
  }
}

// ── Transitions ─────────────────────────────────────────────────────────────

// Restriction bookkeeping + the repeat/line terminal checks. True if the game ended.
function resolveTurn(s) {
  const p = s.currentPlayer;
  // Recorded after the effect has resolved, so Mimic reads what the opponent
  // played, not what that stone went on to do. Mimic records itself, which is
  // why a Mimic cannot copy a Mimic.
  s.lastPlaced[p] = s.selectedStone;
  if (RESTRICTION_TYPES.includes(s.selectedStone) && !s.dullTurn) {
    s.restriction = { type: s.selectedStone, pos: s.placedPos, owner: p, uses: s.skills[p] === 'lingering' ? 2 : 1 };
  } else if (s.restriction && s.restriction.owner !== p) {
    s.restriction.uses--;
    if (s.restriction.uses <= 0) s.restriction = null;
    else bump(s, 'lingering_extra', s.restriction.owner);   // binds the opponent a second time
  }
  const h = hashState(s);
  if (s.history.has(h)) { s.winner = opp(p); s.phase = 'gameOver'; s.winReason = 'repeat'; return true; }
  s.history.add(h);
  // A line the mover shuffled into existence this turn does not win on the spot
  // when effectWin is off; the opponent gets one turn to break it, after which
  // the check at the end of *their* turn (the branch below) awards the win.
  const deferred = !s.rules.effectWin && s.movedThisTurn && !s.lineOnPlace;
  if (check3(s.board, p) && !deferred) { s.winner = p; s.phase = 'gameOver'; s.winReason = 'line'; return true; }
  if (check3(s.board, opp(p))) { s.winner = opp(p); s.phase = 'gameOver'; s.winReason = 'line'; return true; }
  return false;
}

// `again` keeps the turn with the same player (Relentless).
function advanceTurn(s, again) {
  if (!again) { s.currentPlayer = opp(s.currentPlayer); s.turnsDone++; }
  s.selectedStone = null; s.placedPos = null;
  s.lineOnPlace = false; s.movedThisTurn = false; s.chainPulled = 0; s.dullTurn = false;
  s.phase = boardFull(s.board) ? 'remove' : 'select';
  // Dead ends are draws, matching the "no legal actions" break in the reference implementation.
  if (s.phase === 'remove' && !getRemoveActions(s).length) { s.winner = null; s.phase = 'gameOver'; s.winReason = 'stuck'; }
  if (s.phase === 'select' && !s.hands[s.currentPlayer].length) { s.winner = null; s.phase = 'gameOver'; s.winReason = 'nohand'; }
  // Pie rule: the second player decides before their first turn.
  if (s.rules.pieRule && !s.pieResolved && s.turnsDone === 1 && s.phase !== 'gameOver') s.phase = 'pie';
}

// Trade seats: the deciding player takes the opening stone and the hand that
// played it, and the opener now moves as the second player.
function pieSwap(s) {
  for (let i = 0; i < 9; i++) if (s.board[i]) s.board[i].player = opp(s.board[i].player);
  const h = s.hands.X; s.hands.X = s.hands.O; s.hands.O = h;
  s.skills = { X: s.skills.O, O: s.skills.X };
  s.anchored = { X: s.anchored.O, O: s.anchored.X };
  if (s.restriction) s.restriction.owner = opp(s.restriction.owner);
  s.currentPlayer = opp(s.currentPlayer);
  // Positions seen before the trade describe a mirrored game; start the
  // repetition record over so the swap cannot hand out a bogus repeat win.
  s.history = new Set();
  s.history.add(hashState(s));
}

// Relentless: after a plain Regular placement, offer another turn when not ahead on board.
function endTurn(s) {
  if (resolveTurn(s)) return;
  const p = s.currentPlayer;
  if (s.skills[p] === 'relentless' && s.selectedStone === 'regular' &&
      countStones(s.board, p) <= countStones(s.board, opp(p)) && s.hands[p].length > 0) {
    s.phase = 'bonus';
    return;
  }
  advanceTurn(s, false);
}

function afterPlacement(s) {
  const t = s.selectedStone;
  s.lineOnPlace = check3(s.board, s.currentPlayer);
  // dullOpening: the game's very first stone is inert - no effect, no restriction.
  s.dullTurn = false;
  if (s.rules.dullOpening && s.board.filter(c => c).length === 1) {
    s.dullTurn = true;
    endTurn(s);
    return;
  }
  if (s.rules.restrictionFizzle && restrictionActive(s) && EFFECT_TYPES.includes(t)) {
    bump(s, 'fizzle');           // the restriction grounded this movement stone
    endTurn(s);
    return;
  }
  // Mimic borrows the effect of the stone the opponent placed on their last
  // turn. On the opening move there is nothing to borrow, so a Mimic in the
  // first player's hand is a Regular exactly once per game - by construction,
  // and only for them.
  s.mimicAs = null;
  if (t === 'mimic') {
    const last = s.lastPlaced[opp(s.currentPlayer)];
    if (!last || !MIMIC_COPIES.includes(last)) { bump(s, 'mimic_blank'); endTurn(s); return; }
    s.mimicAs = last;
    bump(s, 'mimic_copy');
  }
  const eff = effectiveType(s);
  if (eff === 'chain') {
    if (chainMoveOptions(s).length) { s.phase = 'chainMove'; s.chainMoved = new Set(); }
    else { if (anyImmobile(s.board)) bump(s, 'stuck'); endTurn(s); }
  } else if (EFFECT_TYPES.includes(eff)) {
    // No legal direction left (everything reachable is glued, or a Leech landed
    // with nothing to grab) - the stone is placed and resolves nothing.
    if (!effectOptions(s).length) {
      bump(s, eff === 'leech' && !anyImmobile(s.board) ? 'leech_blank' : 'stuck');
      endTurn(s);
      return;
    }
    s.phase = 'effect';
    if (eff === '2048' && s.skills[s.currentPlayer] === 'overload') s.pending2048 = 1;
  } else endTurn(s);
}

function doAction(s, a) {
  switch (a.type) {
    case 'remove': {
      const st = s.board[a.pos];
      bump(s, 'remove');
      if (s.skills[s.currentPlayer] === 'scavenger') bump(s, 'scavenger_steal');
      {
        const o = opp(s.currentPlayer);
        if (s.skills[o] === 'anchor' && s.anchored[o] != null && findById(s.board, s.anchored[o]) >= 0)
          bump(s, 'anchor_shield', o);
      }
      s.board[a.pos] = null;
      const to = s.skills[s.currentPlayer] === 'scavenger' ? s.currentPlayer : st.player;
      s.hands[to].push(st.type);
      if (s.anchored[st.player] === st.id) s.anchored[st.player] = null;
      s.phase = 'select';
      break;
    }
    case 'select': {
      const idx = s.hands[s.currentPlayer].indexOf(a.stoneType);
      s.hands[s.currentPlayer].splice(idx, 1);
      s.selectedStone = a.stoneType;
      s.phase = 'place';
      break;
    }
    case 'place': {
      const id = s.nextId++;
      s.board[a.pos] = { player: s.currentPlayer, type: s.selectedStone, id };
      s.anchored[s.currentPlayer] = id;
      s.placedPos = a.pos;
      afterPlacement(s);
      break;
    }
    case 'effect': {
      if (a.ring) bump(s, 'whirlwind_ring');
      if (a.line) bump(s, 'telekinesis_line');
      if (s.pending2048 > 0) bump(s, 'overload_second');
      s.movedThisTurn = true;
      applyEffect(s, a);
      if (s.pending2048 > 0) { s.pending2048--; s.phase = 'effect'; }
      else endTurn(s);
      break;
    }
    case 'chainMove': {
      if (!adj(a.pos, s.placedPos)) bump(s, 'slither_diag');
      s.movedThisTurn = true;
      s.board[a.pos] = s.board[s.placedPos]; s.board[s.placedPos] = null;
      s.chainEmpty = s.placedPos; s.chainMoved.add(a.pos); s.phase = 'chainPull';
      break;
    }
    case 'chainPass': { s.chainEmpty = null; s.chainMoved = null; endTurn(s); break; }
    case 'chainPull': {
      if (!adj(a.pos, s.chainEmpty)) bump(s, 'slither_diag');
      s.board[s.chainEmpty] = s.board[a.pos]; s.board[a.pos] = null;
      s.chainMoved.add(s.chainEmpty); s.chainEmpty = a.pos; s.chainPulled++; s.movedThisTurn = true;
      break;
    }
    case 'pieKeep': { s.pieResolved = true; s.phase = boardFull(s.board) ? 'remove' : 'select'; break; }
    case 'pieSwap': {
      bump(s, 'pie_swap');
      s.pieResolved = true;
      pieSwap(s);
      s.phase = boardFull(s.board) ? 'remove' : 'select';
      break;
    }
    case 'bonusPass': { bump(s, 'relentless_pass'); advanceTurn(s, false); break; }
    case 'bonusTake': { bump(s, 'relentless_take'); advanceTurn(s, true); break; }
  }
}

module.exports = {
  TYPES, EXTRA_TYPES, ALL_TYPES, TYPE_CODE, LINES, SUBSQUARES, MOVEMENT_TYPES,
  EFFECT_TYPES, MIMIC_COPIES, RESTRICTION_TYPES, RING,
  SKILLS, SKILL_IDS, DEFAULT_RULES,
  opp, adj, adjDiag, boardFull, check3, countStones, subsquaresFor, findById,
  immobile, anyImmobile, effectiveType,
  initGameState, cloneState, hashState,
  applyShift, apply2048, applyRotate, applyRing, applyEffectTo,
  getLegalActions, getRemoveActions, getSelectActions, getPlaceActions, getEffectActions,
  doAction, endTurn, resolveTurn, advanceTurn,
};
