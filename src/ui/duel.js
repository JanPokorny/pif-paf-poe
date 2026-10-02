// The duel screen: the board, both hands, and every choice a turn asks for.
//
// The UI drives the same engine the enemy searches. Every choice with more
// than one outcome is shown as targets on or around the board; tapping one
// previews the result, tapping it again (or ✓) commits it. Until the turn is
// over, ↩ puts the whole turn back.

import {
  STONES, CONDS, RULES, legalActions, applyAction, cloneState, allowedSquares,
  winningLine, active, row, col, LINES, ELS, touching, adjacent,
} from '../engine.js';
import { h, stoneEl, updateStone, toast, pressable, infoStone, ruleChip, stoneName, stoneText, sleep } from './common.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { think } from '../brain.js';
import { sfx } from '../sound.js';
import { musicEvent } from '../music.js';

const FIELD_ORDER = ['pos', 'from', 'a', 'to', 'target', 'dir', 'block', 'turn', 'axis', 'line', 'ring', 'stone', 'hold', 'only'];
const DIR_ARROW = { up: 'arrow-up', down: 'arrow-down', left: 'arrow-left', right: 'arrow-right' };

// The next choice that tells these candidates apart.
function stageOf(cands) {
  if (cands.length <= 1) return { kind: 'single' };
  for (const f of FIELD_ORDER) {
    if (!cands.some((c) => f in c)) continue;
    const keyOf = (c) => (f === 'dir' ? `${c.dir}|${c.index ?? ''}`
      : f === 'block' ? `${c.block}|${c.cw}` : String(c[f]));
    const groups = new Map();
    for (const c of cands) {
      const k = keyOf(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    if (groups.size <= 1 && f !== 'a') continue;
    return { kind: f, groups };
  }
  return { kind: 'single' };
}

// A hand as one entry per kind of stone: {st, k (its first index), n}.
function groupHand(hand) {
  const out = [];
  hand.forEach((st, k) => {
    const g = out.find((x) => x.st.type === st.type);
    if (g) g.n++; else out.push({ st, k, n: 1 });
  });
  return out;
}

const SPEED = { enemyPause: 380, move: 360 };
const SQUARE = ['top-left', 'top', 'top-right', 'left', 'centre', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const BLOCK = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right' };

// A few words on what an effect choice did, for the move caption.
const sq = (i) => t(SQUARE[i]);
const turning = (cw) => t(cw ? 'clockwise' : 'anticlockwise');
function describe(a) {
  if (a.type === 'dictate') {
    if (a.kind === 'tactics') return t('you must play {stone}', { stone: STONES[a.value].name });
    if (a.kind === 'column') return t(['the left column is closed to you', 'the middle column is closed to you', 'the right column is closed to you'][a.value]);
    if (a.kind === 'spy') return t(`your stones must move ${a.value}`);
  }
  if (a.ring) return t(a.ring === 'diag' ? 'pushed the diagonals' : 'pushed the straight neighbours');
  if (a.from !== undefined && a.to !== undefined) return `${sq(a.from)} → ${sq(a.to)}`;
  if (a.a !== undefined) return t('swapped {a} and {b}', { a: sq(a.a), b: sq(a.b) });
  if (a.stone && a.type === 'effect') return t('next must come {stone}', { stone: STONES[a.stone].name });
  if (a.dir) {
    if (a.index === undefined) return t(`slid ${a.dir}`);
    return t(a.dir === 'left' || a.dir === 'right' ? `slid row {n} ${a.dir}` : `slid column {n} ${a.dir}`, { n: a.index + 1 });
  }
  if (a.block) return t('turned the {block} block {turn}', { block: t(BLOCK[a.block]), turn: turning(a.cw) });
  if (a.turn) return t('turned the ring {n} {turn}', { n: Math.abs(a.turn), turn: turning(a.turn > 0) });
  if (a.axis) return t('mirrored the board {axis}', { axis: t({ h: 'left–right', v: 'top–bottom', d: 'diagonally', a: 'diagonally' }[a.axis]) });
  if (a.target !== undefined) return t('targeting the {square}', { square: sq(a.target) });
  return '';
}

export function mountDuel(root, opts) {
  const { enemy, onEnd, onSave, extra = null } = opts;
  let state = opts.state;
  let snapshot = null;          // the state at the start of this turn, for ↩
  let selKey = null;            // which hand slot the stone taken came from, for display
  let cands = null;             // the choices still open in the effect
  let stageCands = null;        // the set the visible stage was built from
  let preview = null;           // {state, action} awaiting ✓
  let busy = false;             // the enemy is moving, or an animation runs
  let ended = false;
  let caption = [];             // what the enemy just did
  let lastEnemyId = null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const enemyHand = h('div.hand.enemy-hand');
  const status = h('div.turn-status');
  const chips = h('div.chips');
  const cells = Array.from({ length: 9 }, (_, i) => h('div.cell', { dataset: { i } }));
  const stonesLayer = h('div.stones');
  const overlay = h('div.overlay');
  const lineLayer = h('div.winline');
  const gridLines = h('div.board-lines', { html: `<svg viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
    <path d="M101 8 C 98 90, 104 190, 99 292"/><path d="M200 6 C 203 100, 197 200, 202 293"/>
    <path d="M7 100 C 90 97, 200 104, 294 99"/><path d="M8 201 C 100 204, 190 197, 293 202"/></svg>` });
  const board = h('div.board', {}, gridLines, h('div.cells', {}, cells), stonesLayer, lineLayer, overlay);
  const actions = h('div.actions');
  const hand = h('div.hand.player-hand');
  const info = h('div.info-line');

  const header = h('div.enemy-bar' + (enemy.undead ? '.undead' : ''), {},
    h('div.portrait', { onclick: () => toast(t('“{quote}”', { quote: enemy.quote ?? '…' })) }, h('div.photo', {}, enemy.emoji)),
    h('div.enemy-meta', {}, h('div.enemy-name', {}, enemy.name,
      enemy.tier && enemy.tier !== 'normal' ? h('span.tier.' + enemy.tier, {}, t(enemy.tier === 'event' ? 'challenge' : enemy.tier)) : null),
    ), extra);

  const el = h('div.duel', {}, header, chips, status, enemyHand, h('div.board-wrap', {}, board), actions, hand,
    h('div.press-hint', {}, t('Long press stone for info.')), info);
  root.replaceChildren(el);

  // ── Rendering ─────────────────────────────────────────────────────────────
  const stoneEls = new Map();

  function renderBoard(s) {
    const seen = new Set();
    s.board.forEach((c, i) => {
      if (!c) return;
      seen.add(c.id);
      let e = stoneEls.get(c.id);
      const fresh = !e;
      if (fresh) {
        e = stoneEl(c, c.player);
        e.classList.add('on-board', 'pop');
        stonesLayer.append(e);
        stoneEls.set(c.id, e);
        setTimeout(() => e.classList.remove('pop'), 300);
      }
      updateStone(e, c, c.player, { stuck: !!c.stuck, dead: !active(s, c) });
      const was = e.dataset.at === undefined ? i : +e.dataset.at;
      if (!fresh && Math.abs(row(was) - row(i)) + Math.abs(col(was) - col(i)) >= 2) {
        // A long move (a wrap, a leap, a mirror) is a hop, not a slide.
        e.classList.remove('hop');
        void e.offsetWidth;
        e.classList.add('hop');
        setTimeout(() => e.classList.remove('hop'), 450);
      }
      e.dataset.at = i;
      e.classList.toggle('last', c.id === lastEnemyId);
      e.style.setProperty('--r', row(i));
      e.style.setProperty('--c', col(i));
      e.style.setProperty('--tilt', `${((c.id * 37) % 9) - 4}deg`);
    });
    for (const [id, e] of stoneEls) {
      if (seen.has(id)) continue;
      stoneEls.delete(id);
      e.classList.add('gone');
      setTimeout(() => e.remove(), 300);
    }
  }

  // Which select action a hand slot stands for: a hand index, or 'O:type'
  // for a stone taken from the enemy's hand (Open Hands).
  const slotAction = (s, key) => {
    const acts = legalActions(s);
    if (typeof key === 'string' && key.startsWith('O:')) return acts.find((a) => a.from === 'O' && a.stone === key.slice(2));
    const st = s.hands.X[key];
    return st && acts.find((a) => a.stone === st.type && !a.from);
  };

  function renderHands(s, shown = s) {
    const base = snapshot && s.phase !== 'select' && s.player === 'X' && s.turns === snapshot.turns ? snapshot : s;
    const selecting = s.player === 'X' && s.phase === 'select' && !busy;
    const inTurn = base !== s;
    const shared = s.conds.includes('shared');

    // Enemy hand, as the preview would leave it: one stone per kind, with a count.
    const theirs = inTurn && typeof selKey === 'string' && selKey.startsWith('O:') ? base.hands.O : shown.hands.O;
    const kinds = groupHand(theirs);
    enemyHand.replaceChildren(...kinds.map(({ st, n }) => {
      const e = stoneEl(st, 'O');
      const key = `O:${st.type}`;
      if (shared && selecting && st.type !== 'pebble') { if (slotAction(s, key)) e.classList.add('borrow'); else e.classList.add('forbidden'); }
      if (shared && inTurn && selKey === key && s.phase === 'place') e.classList.add('selected');
      e.addEventListener('click', () => { if (!e.classList.contains('target')) tapEnemyStone(st); });
      return h('div.hand-slot.enemy-slot', {}, e, n > 1 ? h('span.hand-count', {}, `×${n}`) : null);
    }));
    if (!theirs.length) enemyHand.append(h('span.dim.small', {}, t('No stones left.')));

    // Player hand, one stone per kind with a count. During a turn in
    // progress, show the hand as it was. A long press reads a stone.
    const slot = (key, st, n = 1) => {
      const e = stoneEl(st, 'X');
      const b = pressable(h('button.hand-slot', { 'aria-label': STONES[st.type].name }, e,
        n > 1 ? h('span.hand-count', {}, `×${n}`) : null), { tap: () => tapHand(key), long: () => infoStone(st, 'X') });
      if (inTurn && key === selKey) b.classList.add(s.phase === 'place' ? 'selected' : 'placed');
      if (selecting && !slotAction(s, key)) b.classList.add('forbidden');
      if (!selecting && !(inTurn && s.phase === 'place')) b.classList.add('idle');
      return b;
    };
    hand.replaceChildren(...groupHand(base.hands.X).map(({ st, k, n }) => slot(k, st, n)));
    if (!base.hands.X.length) hand.append(h('span.dim.small', {}, t('No stones left: you pass.')));

  }

  function renderChips(s) {
    const items = [];
    for (const c of s.conds) items.push(ruleChip('cond', c));
    for (const r of s.rules) items.push(ruleChip('rule', r));
    if (s.dictate?.kind === 'column') items.push(h('span.chip.bad', {}, t(['Left column closed', 'Middle column closed', 'Right column closed'][s.dictate.value])));
    if (s.dictate?.kind === 'spy') items.push(h('span.chip.bad', {}, t(`Moves go ${s.dictate.value}`)));
    if (s.silenced.X) items.push(h('button.chip.bad', { onclick: () => toast(t('Your next special stone will do nothing.')) }, t('Hushed: next special stone')));
    if (s.silenced.O) items.push(h('button.chip.good', { onclick: () => toast(t('Their next special stone will do nothing.')) }, t('Enemy hushed: next special stone')));
    if (s.forced) items.push(h('span.chip.bad', {}, t(s.forced.player === 'X' ? 'You must play {stone}' : 'They must play {stone}', { stone: STONES[s.forced.stone].name })));
    chips.replaceChildren(...items);
  }

  // A pencil stroke through three squares. Slightly bowed: a dead-straight
  // path has a zero-size box and the pencil filter would swallow it.
  function lineSvg(line, who, dashed = false) {
    const cx = (i) => (col(i) + 0.5) * 100, cy = (i) => (row(i) + 0.5) * 100;
    const [a, , b] = line;
    const dx = (cx(b) - cx(a)) * 0.18, dy = (cy(b) - cy(a)) * 0.18;
    const x1 = cx(a) - dx, y1 = cy(a) - dy, x2 = cx(b) + dx, y2 = cy(b) + dy;
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.04 + 1.5, my = (y1 + y2) / 2 - (x2 - x1) * 0.04 + 1.5;
    return `<svg viewBox="0 0 300 300" aria-hidden="true"><path class="${who}${dashed ? ' dashed' : ''}" pathLength="100" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}"/></svg>`;
  }

  // What the previewed move would do to the game, said out loud.
  function verdict() {
    lineLayer.innerHTML = '';
    if (!preview) return;
    const ps = preview.state;
    if (!ps.over) return;
    if (ps.reason === 'line') lineLayer.innerHTML = lineSvg(winningLine(ps, ps.winner), ps.winner, true);
    if (ps.winner === 'X') setStatus(t('✓ This wins the duel!'), 'win-note');
    else setStatus(t('✗ This hands them the duel!'), 'lose-note');
  }

  function setStatus(text, cls = '') { status.textContent = text; status.className = 'turn-status ' + cls; }

  function renderActions(buttons) { actions.replaceChildren(...buttons.filter(Boolean)); }

  function clearOverlay() {
    overlay.replaceChildren();
    cells.forEach((c) => c.classList.remove('allowed', 'target', 'chosen', 'from', 'reach'));
  }

  // Squares, arrows and buttons for the choice at hand.
  function renderStage() {
    clearOverlay();
    const stage = stageOf(stageCands);
    const chosen = preview?.action;
    const btns = [];
    const place = (x, y, child) => {
      child.style.left = `${(x / 3) * 100}%`;
      child.style.top = `${(y / 3) * 100}%`;
      overlay.append(child);
    };
    const pickGroup = (group) => () => {
      cands = group;
      if (cands.length === 1) {
        if (preview && preview.action === cands[0]) return confirm();
        showPreview(cands[0]);
      } else { stageCands = cands; preview = null; show(); }
    };
    const isChosen = (group) => chosen && group.includes(chosen);

    if (stage.kind === 'single') {
      // Nothing to choose: preview straight away.
      if (!preview) showPreview(stageCands[0]);
    } else if (['pos', 'from', 'to', 'target'].includes(stage.kind)) {
      for (const [k, group] of stage.groups) {
        const i = +k;
        if (!Number.isInteger(i) || !cells[i]) {
          // The choice that aims at no square in particular: "all of them".
          btns.push(h('button.btn.opt' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group) }, t('All of them')));
          continue;
        }
        cells[i].classList.add('target');
        if (isChosen(group)) cells[i].classList.add('chosen');
        cells[i].onclick = pickGroup(group);
      }
    } else if (stage.kind === 'a') {
      for (const [, group] of stage.groups) {
        for (const i of [group[0].a, group[0].b]) {
          cells[i].classList.add('target');
          if (isChosen(group)) cells[i].classList.add('chosen');
          cells[i].onclick = pickGroup(group);
        }
      }
    } else if (stage.kind === 'dir') {
      for (const [k, group] of stage.groups) {
        const [dir, index] = k.split('|');
        let x, y;
        if (index === '') { x = { left: -0.33, right: 3.33, up: 1.5, down: 1.5 }[dir]; y = { up: -0.3, down: 3.3, left: 1.5, right: 1.5 }[dir]; }
        else if (dir === 'left' || dir === 'right') { x = dir === 'left' ? -0.33 : 3.33; y = +index + 0.5; }
        else { y = dir === 'up' ? -0.3 : 3.3; x = +index + 0.5; }
        const b = h('button.arrow' + (isChosen(group) ? '.chosen' : ''), { html: icon(DIR_ARROW[dir]), onclick: pickGroup(group), 'aria-label': t(dir) });
        place(x, y, b);
      }
    } else if (stage.kind === 'block') {
      const centre = { TL: [1, 1], TR: [2, 1], BL: [1, 2], BR: [2, 2] };
      const both = new Set();
      for (const [k] of stage.groups) { const [blk] = k.split('|'); if (both.has(blk)) both.add(blk + '!'); both.add(blk); }
      for (const [k, group] of stage.groups) {
        const [blk, cw] = k.split('|');
        const [x, y] = centre[blk];
        const off = both.has(blk + '!') ? (cw === 'true' ? 0.27 : -0.27) : 0;
        const b = h('button.rot' + (isChosen(group) ? '.chosen' : ''), { html: icon(cw === 'true' ? 'rotate-cw' : 'rotate-ccw'), onclick: pickGroup(group) });
        place(x + off, y, b);
      }
      // Show the block the chosen option turns.
      if (chosen?.block) for (const i of { TL: [0, 1, 3, 4], TR: [1, 2, 4, 5], BL: [3, 4, 6, 7], BR: [4, 5, 7, 8] }[chosen.block]) cells[i].classList.add('chosen');
    } else if (stage.kind === 'turn') {
      // Around the board's corners: clockwise on the right, anticlockwise on the left.
      const spot = { 1: [3.25, -0.25], [-1]: [-0.25, -0.25], 2: [3.25, 3.25], [-2]: [-0.25, 3.25] };
      for (const [k, group] of stage.groups) {
        const x = +k;
        const b = h('button.rot.turn' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group), 'aria-label': `turn ${x}` },
          h('span', { html: icon(x > 0 ? 'rotate-cw' : 'rotate-ccw') }), Math.abs(x) > 1 ? h('span.times', {}, '×2') : null);
        place(...spot[x], b);
      }
    } else if (stage.kind === 'axis') {
      // Each mirror is a note beside the board, pointing along its axis.
      const spot = { h: [1.5, 3.3], v: [3.3, 1.5], d: [-0.25, -0.25], a: [3.25, -0.25] };
      const label = { h: '↔', v: '↕', d: '⤡', a: '⤢' };
      for (const [k, group] of stage.groups) {
        place(...spot[k], h('button.rot.axis' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group), 'aria-label': `mirror ${k}` }, label[k]));
      }
    } else if (stage.kind === 'line') {
      // A Beacon's line: a note at the end of its row, its column, its diagonal.
      const at = state.placedAt;
      const spot = { row: [3.3, row(at) + 0.5], col: [col(at) + 0.5, 3.3], d: [3.25, 3.25], a: [-0.25, 3.25] };
      const label = { row: '↔', col: '↕', d: '⤡', a: '⤢' };
      for (const [k, group] of stage.groups) {
        place(...spot[k], h('button.rot.axis' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group), 'aria-label': k }, label[k]));
      }
      if (chosen?.line) {
        for (let i = 0; i < 9; i++) if (STONES.beacon.restrict(i, at, false, chosen.line) && i !== at) cells[i].classList.add('chosen');
      }
    } else if (stage.kind === 'hold' || stage.kind === 'only') {
      const label = stage.kind === 'hold'
        ? { true: t('It holds its square'), false: t('It slides too') }
        : { true: t('Only their stones'), false: t('All stones') };
      for (const [k, group] of stage.groups) {
        btns.push(h('button.btn.opt' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group) }, label[k]));
      }
    } else if (stage.kind === 'ring') {
      const label = { ortho: t('Push the ones beside it'), diag: t('Push the diagonal ones') };
      for (const [k, group] of stage.groups) btns.push(h('button.btn.opt' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group) }, label[k]));
    } else if (stage.kind === 'stone') {
      // Aim at the enemy's hand itself.
      for (const [k, group] of stage.groups) {
        for (const e of enemyHand.querySelectorAll(`.stone[data-type="${CSS.escape(k)}"]`)) {
          e.classList.add('target');
          if (isChosen(group)) e.classList.add('chosen');
          e.onclick = (ev) => { ev.stopPropagation(); pickGroup(group)(); };
        }
      }
      setTimeout(() => { if (!preview) info.textContent = t('Tap a stone in their hand, up top.'); });
    }
    // Show which stone a two-step choice has already picked.
    if (stageCands.length && stageCands[0].from !== undefined && stageCands.every((c) => c.from === stageCands[0].from)) {
      cells[stageCands[0].from].classList.add('chosen');
    }
    return btns;
  }

  // ── The whole picture, for the current mode ───────────────────────────────
  function show() {
    const s = preview ? preview.state : state;
    renderBoard(s);
    renderHands(state, s);
    renderChips(state);
    cells.forEach((c, i) => { c.onclick = () => tapSquare(i); });
    clearOverlay();
    if (!state.over) lineLayer.innerHTML = '';
    cells.forEach((c) => c.classList.remove('nogo', 'threat'));

    if (state.over) {
      setStatus(state.winner === 'X' ? t('You win!') : t('{enemy} wins', { enemy: enemy.name }), state.winner === 'X' ? 'you' : 'enemy-done');
      renderActions([]);
      info.textContent = '';
      return;
    }
    if (busy || state.player !== 'X') {
      setStatus(t('{enemy} is thinking', { enemy: enemy.name }), 'enemy');   // the dots blink in after it (CSS)
      renderActions([]);
      info.textContent = caption.filter(Boolean).join(', ');
      return;
    }
    const undo = snapshot && state.turns === snapshot.turns && state.phase !== 'select'
      ? h('button.btn.ghost', { onclick: undoTurn }, h('span', { html: icon('undo') }), t('Undo')) : null;

    if (state.phase === 'select') {
      markDangers();
      setStatus(state.half ? t('Your second stone — pick one') : t('Your turn — pick a stone'), 'you');
      const hint = state.conds.includes('shared') && state.hands.O.length ? t('Open Hands: their stones are yours too.') : '';
      info.textContent = caption.length ? `${enemy.name}: ${caption.filter(Boolean).join(', ')}.${hint ? ' ' + hint : ''}`
        : hint || t('Pick a stone.');
      if (state.turns >= 2 && state.board.some(Boolean) && cells.some((c) => c.classList.contains('threat'))) coach('enemy'); else coach('select');
      renderActions([]);
    } else if (state.phase === 'place' && !preview) {
      setStatus(t('Place it on a glowing square'), 'you');
      describeSelected();
      coach('place');
      for (const i of allowedSquares(state)) cells[i].classList.add('allowed');
      renderActions([undo]);
    } else if (state.phase === 'place' && preview) {
      const dud = preview.logs?.includes('silenced');
      setStatus(dud ? t('{why} — it will do nothing. Confirm?', { why: t('Hushed') }) : t('This is what happens. Confirm?'), dud ? 'lose-note' : 'you');
      cells[preview.action.pos].classList.add('chosen');
      for (const i of allowedSquares(state)) cells[i].classList.add('allowed');
      // The squares it acts on from there: beside it (four) or around it (eight).
      const reach = STONES[state.selected?.type]?.reach, at = preview.action.pos;
      if (reach) for (let i = 0; i < 9; i++) if ((reach === 'around' ? touching : adjacent)(at, i)) cells[i].classList.add('reach');
      renderActions([undo, h('button.btn.primary', { onclick: confirm }, h('span', { html: icon('check') }), t('Confirm'))]);
      verdict();
    } else if (state.phase === 'effect') {
      const btns = renderStage();
      const what = stoneName(state.board[state.placedAt]);
      setStatus(preview ? t('Tap again or ✓ to confirm') : t('Choose how your {what} works', { what }), 'you');
      describeSelected(); if (!preview) coach('effect');
      const back = stageCands !== allEffect() ? h('button.btn.ghost', { onclick: () => { stageCands = cands = allEffect(); preview = null; show(); } }, h('span', { html: icon('back') }), t('Back')) : null;
      renderActions([undo, back, ...btns, preview ? h('button.btn.primary', { onclick: confirm }, h('span', { html: icon('check') }), t('Confirm')) : null]
        .filter((b, k, arr) => b && arr.indexOf(b) === k));
      verdict();
    }
  }

  // Where the enemy's restrictions keep you out, and where one plain stone
  // of theirs would finish a line: shown before you pick anything.
  function markDangers() {
    const ok = new Set(allowedSquares(state));
    state.board.forEach((c, i) => { if (!c && !ok.has(i)) cells[i].classList.add('nogo'); });
    // Only where they could actually put a stone, restrictions and all.
    const theirTurn = cloneState(state);
    theirTurn.player = 'O';
    const theyMay = new Set(allowedSquares(theirTurn));
    for (const line of state.rules.includes('elko') ? ELS : LINES) {
      const os = line.filter((i) => state.board[i]?.player === 'O').length;
      const empty = line.filter((i) => !state.board[i]);
      if (os === 2 && empty.length === 1 && theyMay.has(empty[0])) cells[empty[0]].classList.add('threat');
    }
  }

  // First-time tips, one per kind of moment, shown once ever.
  const COACH = {
    select: 'Three in a row wins.',
    place: 'Striped: blocked by their stones.',
    effect: 'Tap an option to preview, again to confirm.',
    enemy: 'Dashed circle: their winning square.',
  };
  function coach(kind) {
    let seen;
    try { seen = JSON.parse(localStorage.getItem('ppp-coach') ?? '{}'); } catch { seen = {}; }
    if (seen[kind] || !COACH[kind]) return false;
    if (coach.shown && coach.shown !== kind) {
      seen[coach.shown] = true;
      try { localStorage.setItem('ppp-coach', JSON.stringify(seen)); } catch { /* ignore */ }
    }
    coach.shown = kind;
    info.replaceChildren(h('span.coach', {}, t(COACH[kind])));
    return true;
  }

  function describeSelected() {
    const c = state.phase === 'effect' ? state.board[state.placedAt] : state.selected;
    if (!c) return;
    info.replaceChildren(h('b', {}, stoneName(c) + ': '), stoneText(c),
      state.silenced.X > 0 && state.phase === 'place' && c.type !== 'pebble' ? h('span.red', {}, t(' — but you are hushed: it will do nothing.')) : '',
      h('button.info-more', { onclick: () => infoStone(c, 'X') }, 'ⓘ'));
  }

  const allEffect = () => effectCands;
  let effectCands = null;

  // ── Player input ──────────────────────────────────────────────────────────
  function myMove() { return !busy && !ended && !state.over && state.player === 'X'; }

  const slotStone = (key) => (typeof key === 'string' ? { type: key.slice(2) } : (snapshot ?? state).hands.X[key]);

  function tapHand(key) {
    if (!myMove()) return;
    if (state.phase !== 'select' && state.phase !== 'place') {
      const st = slotStone(key);
      if (st) infoStone(st, typeof key === 'string' && key.startsWith('O:') ? 'O' : 'X');
      return;
    }
    if (state.phase === 'place') {
      const same = key === selKey;
      state = cloneState(snapshot); state.log = [];
      preview = null;
      selKey = null;
      if (same) { show(); return; }
    }
    const ok = slotAction(state, key);
    if (!ok) {
      const f = state.forced?.player === 'X' && STONES[state.forced.stone].name;
      toast(f ? t('You must play {stone} this turn.', { stone: f }) : t('Not that one.'), 'bad');
      return;
    }
    sfx('select');
    // Never touch the saved start-of-turn state: work on a copy of it.
    snapshot = state;
    selKey = key;
    state = cloneState(snapshot); state.log = [];
    applyAction(state, ok);
    show();
  }

  function tapSquare(i) {
    const s = preview ? preview.state : state;
    if (myMove() && state.phase === 'select' && !s.board[i] && cells[i].classList.contains('nogo')) { toast(whyNot(i), 'bad'); return; }
    if (!myMove() || state.phase === 'select') {
      if (s.board[i]) infoStone(s.board[i], s.board[i].player);
      return;
    }
    if (state.phase === 'place') {
      const allowed = allowedSquares(state);
      if (!allowed.includes(i)) {
        if (s.board[i] && !preview) infoStone(s.board[i], s.board[i].player);
        else if (!s.board[i]) toast(whyNot(i), 'bad');
        return;
      }
      if (preview && preview.action.pos === i) return confirm();
      const action = { type: 'place', pos: i };
      const test = cloneState(state); test.log = [];
      applyAction(test, action);
      const st = STONES[state.selected.type];
      if (test.player === 'X' && test.phase === 'effect') {
        // Several ways to resolve: commit the placement and offer them.
        commitState(test);
        return;
      }
      if (!st.apply && state.selected.type !== 'parrot') { sfx('place'); commitState(test); return; }
      preview = { state: test, action, logs: test.log };
      sfx('place');
      show();
      return;
    }
    if (s.board[i]) infoStone(s.board[i], s.board[i].player);
  }

  // Under Open Hands, their stones are yours to play too.
  function tapEnemyStone(st) {
    const key = `O:${st.type}`;
    if (state.conds.includes('shared') && myMove() && (state.phase === 'select' || state.phase === 'place') && slotAction(snapshot && state.phase === 'place' ? snapshot : state, key)) {
      tapHand(key);
      return;
    }
    infoStone(st, 'O');
  }

  // Why a free square is off limits, in the order the engine narrows them.
  function whyNot(i) {
    if (i === 4 && state.conds.includes('nocentre')) return t('{rule}: nobody may place on the centre.', { rule: CONDS.nocentre.name });
    if (i === 4 && state.rules.includes('reserved')) return t('{rule}: the centre is the boss\'s.', { rule: RULES.reserved.name });
    if (state.dictate?.kind === 'column' && col(i) === state.dictate.value) return t('{rule}: that column is closed this turn.', { rule: RULES.column.name });
    if (state.rules.includes('clinch') && !state.board.some((c, j) => c?.player === 'O' && j !== i && Math.abs(row(i) - row(j)) <= 1 && Math.abs(col(i) - col(j)) <= 1)) {
      return t('{rule}: you must place around one of its stones.', { rule: RULES.clinch.name });
    }
    return t('Not there — the enemy\'s restrictions point elsewhere.');
  }

  function showPreview(action) {
    const test = cloneState(state); test.log = [];
    applyAction(test, action);
    preview = { state: test, action };
    sfx('move');
    show();
  }

  function confirm() {
    if (!preview) return;
    const next = preview.state;
    preview = null;
    commitState(next);
  }

  function undoTurn() {
    if (!snapshot) return;
    state = cloneState(snapshot); state.log = [];
    preview = null; selKey = null; cands = stageCands = null;
    sfx('undo');
    show();
  }

  // A committed step: announce what happened, then carry on.
  function commitState(next) {
    const logs = next.log ?? [];
    state = next;
    state.log = [];
    preview = null;
    announce(logs, 'X');
    afterCommit();
  }

  function afterCommit() {
    if (state.over) return finish();
    if (state.player === 'X') {
      if (state.phase === 'effect') {
        effectCands = legalActions(state);
        stageCands = cands = effectCands;
      }
      // Only a turn's start is saved: a reload mid-turn starts the turn over.
      if (state.phase === 'select') { snapshot = null; selKey = null; save(); }
      show();
    } else {
      snapshot = null; selKey = null;
      save();
      enemyTurn();
    }
  }

  function announce(logs, who) {
    const me = who === 'X';
    const v = { enemy: enemy.name };
    for (const l of logs) {
      if (l === 'silenced') toast(t(me ? 'Hushed! Your stone does nothing.' : 'Hushed! {enemy}\'s stone does nothing.', v), me ? 'bad' : 'good');
      else if (l === 'echo') toast(t('Echo! It goes again.'), 'good');
      else if (l.startsWith('copy:')) { const [, by, what] = l.split(':'); toast(t('The {parrot} copies {stone}!', { parrot: STONES[by].name, stone: STONES[what].name })); }
      else if (l === 'pass:X') toast(t('No stones left: you pass.'), 'bad');
      else if (l === 'pass:O') toast(t('{enemy} has no stones left and passes.', v), 'good');
      else if (l === 'cond:gravity') { /* shown as a step of its own */ }
      else if (l === 'rule:double' && !me) { /* the caption says it */ }
      else if (l === 'rule:headstart') toast(t('{rule}: {enemy} goes again!', { ...v, rule: RULES.headstart.name }), 'bad');
    }
  }

  function save() { onSave?.(state); }

  // ── The enemy ─────────────────────────────────────────────────────────────
  async function enemyTurn() {
    busy = true;
    show();
    await sleep(SPEED.enemyPause);
    let stones = 0;   // placed so far this time round
    while (!ended && !state.over && state.player === 'O') {
      const acts = legalActions(state);
      const t0 = performance.now();
      const action = acts.length === 1 ? acts[0] : await think(state, { iterations: enemy.iters, blunder: enemy.blunder });
      const waited = performance.now() - t0;
      if (ended) return;
      if (action.type === 'select') {
        state.log = [];
        applyAction(state, action);
        // A second stone in one go (Head Start, Double Time) keeps the first in the caption.
        if (!stones) caption = [];
        if (action.from === 'X') caption.push(t('took your {stone}', { stone: stoneName(state.selected) }));
        info.textContent = caption.filter(Boolean).join(', ');
        // Show which stone it took.
        renderHands(state);
        const lifted = stoneEl(state.selected, 'O');
        lifted.classList.add('lifted');
        enemyHand.append(h('div.hand-slot.enemy-slot', {}, lifted));
        sfx('select');
        await sleep(Math.max(120, 420 - waited));
        continue;
      }
      state.log = [];
      const second = stones > 0 && action.type === 'place';
      // The board before Gravity pulls, so the fall can be shown as a step.
      let beforeFall = null;
      if (state.conds.includes('gravity')) {
        beforeFall = cloneState(state);
        beforeFall.conds = state.conds.filter((c) => c !== 'gravity');
        applyAction(beforeFall, action);
      }
      applyAction(state, action);
      const logs = state.log;
      state.log = [];
      if (beforeFall && logs.includes('cond:gravity') && beforeFall.board.some((c, i) => (c?.id ?? 0) !== (state.board[i]?.id ?? 0))) {
        renderBoard(beforeFall);
        await sleep(520);
        board.classList.add('shake');
        setTimeout(() => board.classList.remove('shake'), 400);
        sfx('thud');
      }
      if (action.type === 'dictate') {
        caption.push(describe(action));
        info.textContent = caption.filter(Boolean).join(', ');
        toast(`${enemy.name}: ${describe(action)}`, 'bad');
        renderChips(state);
        await sleep(700);
        continue;
      }
      renderBoard(state);
      renderHands(state);
      renderChips(state);
      if (action.type === 'place') {
        lastEnemyId = state.placedId;
        const said = t('played {stone} on the {square}', { stone: stoneName(state.lastPlaced.O), square: sq(action.pos) });
        caption = second ? [...caption, t('then {what}', { what: said })] : [...caption, said];
        stones++;
      } else caption.push(describe(action));
      info.textContent = caption.filter(Boolean).join(', ');
      if (action.type === 'place') {
        sfx('place');
        const e = [...stoneEls.values()].find((x) => +x.dataset.at === action.pos);
        e?.classList.add('flash');
        setTimeout(() => e?.classList.remove('flash'), 600);
      } else sfx('move');
      announce(logs, 'O');
      await sleep(action.type === 'place' ? 520 : 600);
    }
    busy = false;
    if (state.over) return finish();
    snapshot = null;
    save();
    show();
  }

  // ── The end ───────────────────────────────────────────────────────────────
  async function finish() {
    if (ended) return;
    ended = true;
    busy = true;
    save();
    show();
    const line = state.reason === 'line' ? winningLine(state, state.winner) : null;
    if (line) {
      lineLayer.innerHTML = lineSvg(line, state.winner);
      for (const i of line) cells[i].classList.add('win-' + state.winner);
      for (const e of stoneEls.values()) if (line.includes(+e.dataset.at)) e.classList.add('in-line');
    }
    const won = state.winner === 'X';
    sfx(won ? 'win' : 'lose');
    musicEvent(won ? 'win' : 'lose');
    await sleep(900);
    const v = { enemy: enemy.name };
    const elko = state.rules.includes('elko');
    const why = state.reason === 'line'
      ? (won ? t(elko ? 'An L of three!' : 'Three in a row!') : t(elko ? '{enemy} made an L of three.' : '{enemy} made three in a row.', v))
      : state.rules.includes('patient')
        ? t('The board is full — it goes to {enemy} ({rule}).', { ...v, rule: RULES.patient.name })
        : t(won ? 'The board is full — it goes to you, who moved second.' : 'The board is full — it goes to {enemy}, who moved second.', v);
    const banner = h('div.result-banner.' + (won ? 'won' : 'lost'), {},
      h('div.result-title', {}, won ? t('Victory!') : t('Defeat')),
      h('div.result-why', {}, why),
      h('button.btn.primary.wide', { onclick: () => { banner.remove(); onEnd(state.winner); } }, t('Continue')));
    el.append(banner);
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  state.log = [];
  // An old save from the middle of a turn: put a chosen stone back in hand,
  // or pick up the choice it was waiting on.
  if (!state.over && state.player === 'X' && state.phase === 'place' && state.selected) {
    state.hands[state.from ?? 'X'].push(state.selected);
    state.selected = null;
    state.from = null;
    state.phase = 'select';
  }
  if (!state.over && state.player === 'X' && state.phase === 'effect') {
    effectCands = legalActions(state);
    stageCands = cands = effectCands;
  }
  show();
  if (state.turns <= 1 && state.phase === 'select' && enemy.quote && !caption.length) info.textContent = t('{enemy}: “{quote}”', { enemy: enemy.name, quote: enemy.quote });
  if (state.over) finish();
  else if (state.player === 'O') enemyTurn();


  return { destroy() { ended = true; } };
}
