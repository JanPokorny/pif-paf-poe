'use strict';
// Pif-paf-poe engine + experimental "skill" modifiers.
// Port of the game logic in index.html, extended with per-player skills.
// Kept behaviourally identical to index.html when both players have skill 'none'.

const TYPES = ['regular', 'shift', '2048', 'rotate', 'magnet', 'stinky', 'chain'];
const TYPE_CODE = { regular: 'rg', shift: 'sh', '2048': '20', rotate: 'ro', magnet: 'mg', stinky: 'sk', chain: 'ch' };
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const SUBSQUARES = { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] };
const MOVEMENT_TYPES = ['shift', '2048', 'rotate'];
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

function initGameState(handsX, handsO, firstPlayer, skills) {
  const s = {
    board: Array(9).fill(null),
    hands: { X: [...handsX], O: [...handsO] },
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
    stats: { X: {}, O: {} },        // activation counters; dropped by cloneState
  };
  s.history.add(hashState(s));
  return s;
}

function cloneState(s) {
  return {
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
  };
}

function hashState(s) {
  let h = '';
  for (let i = 0; i < 9; i++) { const c = s.board[i]; h += c ? c.player + TYPE_CODE[c.type] : '..'; }
  h += '|';
  if (s.restriction) h += s.restriction.type[0] + s.restriction.pos + s.restriction.owner + s.restriction.uses;
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

function applyEffect(s, a) {
  const t = s.selectedStone, p = s.placedPos;
  if (t === 'shift') applyShift(s.board, p, a.direction, a.line);
  else if (t === '2048') apply2048(s.board, a.direction);
  else if (t === 'rotate') { if (a.ring) applyRing(s.board, a.ring === 'cw'); else applyRotate(s.board, a.subsquare); }
}

// ── Legal actions ───────────────────────────────────────────────────────────

function restrictionActive(s) {
  return s.restriction && s.restriction.owner !== s.currentPlayer ? s.restriction : null;
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
  const r = restrictionActive(s);
  if (r) {
    const ok = free.filter(i => r.type === 'magnet' ? adj(i, r.pos) : !adj(i, r.pos));
    if (ok.length) free = ok;
  }
  return free.map(pos => ({ type: 'place', pos }));
}

function getEffectActions(s) {
  const t = s.selectedStone, p = s.placedPos, sk = s.skills[s.currentPlayer];
  const DIRS = ['up', 'down', 'left', 'right'];
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
    case 'effect': return getEffectActions(s);
    case 'chainMove': { const a = []; for (let i = 0; i < 9; i++) if (!s.board[i] && chainAdj(s, i, s.placedPos)) a.push({ type: 'chainMove', pos: i }); return a; }
    case 'chainPull': { const a = [{ type: 'chainPass' }]; for (let i = 0; i < 9; i++) if (s.board[i] && chainAdj(s, i, s.chainEmpty) && !s.chainMoved.has(i)) a.push({ type: 'chainPull', pos: i }); return a; }
    case 'bonus': return [{ type: 'bonusTake' }, { type: 'bonusPass' }];
    default: return [];
  }
}

// ── Transitions ─────────────────────────────────────────────────────────────

// Restriction bookkeeping + the repeat/line terminal checks. True if the game ended.
function resolveTurn(s) {
  const p = s.currentPlayer;
  if (RESTRICTION_TYPES.includes(s.selectedStone)) {
    s.restriction = { type: s.selectedStone, pos: s.placedPos, owner: p, uses: s.skills[p] === 'lingering' ? 2 : 1 };
  } else if (s.restriction && s.restriction.owner !== p) {
    s.restriction.uses--;
    if (s.restriction.uses <= 0) s.restriction = null;
    else bump(s, 'lingering_extra', s.restriction.owner);   // binds the opponent a second time
  }
  const h = hashState(s);
  if (s.history.has(h)) { s.winner = opp(p); s.phase = 'gameOver'; s.winReason = 'repeat'; return true; }
  s.history.add(h);
  if (check3(s.board, p)) { s.winner = p; s.phase = 'gameOver'; s.winReason = 'line'; return true; }
  if (check3(s.board, opp(p))) { s.winner = opp(p); s.phase = 'gameOver'; s.winReason = 'line'; return true; }
  return false;
}

// `again` keeps the turn with the same player (Relentless).
function advanceTurn(s, again) {
  if (!again) s.currentPlayer = opp(s.currentPlayer);
  s.selectedStone = null; s.placedPos = null;
  s.phase = boardFull(s.board) ? 'remove' : 'select';
  // Dead ends are draws, matching the "no legal actions" break in the reference implementation.
  if (s.phase === 'remove' && !getRemoveActions(s).length) { s.winner = null; s.phase = 'gameOver'; s.winReason = 'stuck'; }
  if (s.phase === 'select' && !s.hands[s.currentPlayer].length) { s.winner = null; s.phase = 'gameOver'; s.winReason = 'nohand'; }
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
  if (t === 'chain') {
    let h = false;
    for (let i = 0; i < 9; i++) if (!s.board[i] && chainAdj(s, i, s.placedPos)) { h = true; break; }
    if (h) { s.phase = 'chainMove'; s.chainMoved = new Set(); } else endTurn(s);
  } else if (MOVEMENT_TYPES.includes(t)) {
    s.phase = 'effect';
    if (t === '2048' && s.skills[s.currentPlayer] === 'overload') s.pending2048 = 1;
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
      applyEffect(s, a);
      if (s.pending2048 > 0) { s.pending2048--; s.phase = 'effect'; }
      else endTurn(s);
      break;
    }
    case 'chainMove': {
      if (!adj(a.pos, s.placedPos)) bump(s, 'slither_diag');
      s.board[a.pos] = s.board[s.placedPos]; s.board[s.placedPos] = null;
      s.chainEmpty = s.placedPos; s.chainMoved.add(a.pos); s.phase = 'chainPull';
      break;
    }
    case 'chainPass': { s.chainEmpty = null; s.chainMoved = null; endTurn(s); break; }
    case 'chainPull': {
      if (!adj(a.pos, s.chainEmpty)) bump(s, 'slither_diag');
      s.board[s.chainEmpty] = s.board[a.pos]; s.board[a.pos] = null;
      s.chainMoved.add(s.chainEmpty); s.chainEmpty = a.pos;
      break;
    }
    case 'bonusPass': { bump(s, 'relentless_pass'); advanceTurn(s, false); break; }
    case 'bonusTake': { bump(s, 'relentless_take'); advanceTurn(s, true); break; }
  }
}

module.exports = {
  TYPES, TYPE_CODE, LINES, SUBSQUARES, MOVEMENT_TYPES, RESTRICTION_TYPES, RING,
  SKILLS, SKILL_IDS,
  opp, adj, adjDiag, boardFull, check3, countStones, subsquaresFor, findById,
  initGameState, cloneState, hashState,
  applyShift, apply2048, applyRotate, applyRing,
  getLegalActions, getRemoveActions, getSelectActions, getPlaceActions, getEffectActions,
  doAction, endTurn, resolveTurn, advanceTurn,
};
