// The duel screen: the board, both hands, and every choice a turn asks for.
//
// The UI drives the same engine the enemy searches. Every choice with more
// than one outcome is shown as targets on or around the board; tapping one
// previews the result, ✓ commits it and tapping it again takes it back. Until the turn is
// over, ↩ puts the whole turn back.

import {
  STONES, CONDS, RULES, legalActions, applyAction, cloneState, allowedSquares,
  winningLine, active, row, col, handKey, LINES, ELS, specOf,
} from '../engine.js';
import { h, stoneEl, updateStone, toast, infoStone, ruleChip, stoneName, stoneText, sleep, statusLine } from './common.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { think } from '../brain.js';
import { sfx } from '../sound.js';
import { musicEvent } from '../music.js';

const FIELD_ORDER = ['pos', 'from', 'a', 'to', 'target', 'dir', 'block', 'turn', 'spin', 'ring', 'stone', 'hold', 'only'];
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

// A hand as one entry per kind of stone (a + form a kind of its own): {st, k (its first index), n}.
const sameKind = (a, b) => handKey(a) === handKey(b);
// The key of a stone in the enemy's hand, as a hand slot: 'O:shift' or 'O:shift+'.
const enemyKey = (st) => `O:${handKey(st)}`;   // '!': glass, '@marble': its material
function groupHand(hand) {
  const out = [];
  hand.forEach((st, k) => {
    const g = out.find((x) => sameKind(x.st, st));
    if (g) g.n++; else out.push({ st, k, n: 1 });
  });
  return out;
}

const SPEED = { enemyPause: 380, move: 360 };
const SQUARE = ['top-left', 'top', 'top-right', 'left', 'centre', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const BLOCK = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right' };

// A few words on what a move did, for the status line and its log.
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
  if (a.spin) return t('turned the stones around it {turn}', { turn: turning(a.spin > 0) });
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
  let lastEnemyId = null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const enemyHand = h('div.hand.enemy-hand');
  const status = statusLine();     // what to do now, and each move as it happens (with the log behind ⌄)
  const chips = h('div.chips');
  const cells = Array.from({ length: 9 }, (_, i) => h('div.cell', { dataset: { i } }));
  const stonesLayer = h('div.stones');
  // The squares a stone acts on, lit white beneath the stones.
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

  const el = h('div.duel', {}, header, chips, status.el, enemyHand, h('div.board-wrap', {}, board), actions, hand, info);
  root.replaceChildren(el);
  // The board's lines on the paper's: nudged onto the nearest of its 24px squares.
  const wrap = el.querySelector('.board-wrap');
  const align = () => {
    if (!wrap.isConnected) { window.removeEventListener('resize', align); return; }
    wrap.style.translate = '';
    const r = board.getBoundingClientRect();
    const snap = (v) => Math.round(v / 24) * 24 - v;
    wrap.style.translate = `${snap(r.left)}px ${snap(r.top)}px`;
  };
  requestAnimationFrame(align);
  window.addEventListener('resize', align);

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
      // In a preview, the stones it moves or changes pulse, faint.
      const before = s !== state && state.board.findIndex((x) => x?.id === c.id);
      e.classList.toggle('moving', s !== state && (before < 0 ? c.id !== s.placedId : before !== i || state.board[before].player !== c.player || state.board[before].type !== c.type));
      e.dataset.at = i;
      // Their latest stone, ringed on your turn only: not while they play, nor once it is over.
      e.classList.toggle('last', c.id === lastEnemyId && !busy && !state.over && state.player === 'X');
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

  const slotStone = (key) => {
    if (typeof key !== 'string') return (snapshot ?? state).hands.X[key];
    const m = key.slice(2).match(/^(.*?)(\+?)(!?)(?:@(\w+))?$/);
    return { type: m[1], ...(m[2] && { plus: true }), ...(m[3] && { once: true }), ...(m[4] && { mat: m[4] }) };
  };
  // Which select action a hand slot stands for: a hand index, or 'O:type'
  // for a stone taken from the enemy's hand (Open Hands).
  const slotAction = (s, key) => {
    const acts = legalActions(s);
    const st = typeof key === 'string' ? slotStone(key) : s.hands.X[key];
    const from = typeof key === 'string' ? 'O' : undefined;
    return st && acts.find((a) => a.from === from && sameKind({ type: a.stone, plus: a.plus, once: a.once, mat: a.mat }, st));
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
      const key = enemyKey(st);
      if (shared && selecting) { if (slotAction(s, key)) e.classList.add('borrow'); else e.classList.add('forbidden'); }
      if (shared && inTurn && selKey === key && s.phase === 'place') e.classList.add('selected');
      e.addEventListener('click', () => { if (!e.classList.contains('target')) tapEnemyStone(st); });
      return h('div.hand-slot.enemy-slot', {}, e, n > 1 ? h('span.hand-count', {}, `×${n}`) : null);
    }));
    // Under Open Hands, a sticky note says which of theirs you may take.
    if (enemyHand.querySelector('.stone.borrow')) enemyHand.append(h('span.pick-note', {}, t('You can play these!')));

    // Player hand, one stone per kind with a count. During a turn in
    // progress, show the hand as it was. Out of your turn, a tap reads a stone.
    const slot = (key, st, n = 1) => {
      const e = stoneEl(st, 'X');
      const b = h('button.hand-slot', { 'aria-label': stoneName(st), onclick: () => tapHand(key) }, e,
        n > 1 ? h('span.hand-count', {}, `×${n}`) : null);
      if (inTurn && key === selKey) b.classList.add(s.phase === 'place' ? 'selected' : 'placed');
      if (selecting && !slotAction(s, key)) b.classList.add('forbidden');
      if (!selecting && !(inTurn && s.phase === 'place')) b.classList.add('idle');
      return b;
    };
    hand.replaceChildren(...groupHand(base.hands.X).map(({ st, k, n }) => slot(k, st, n)));

  }

  function renderChips(s) {
    const items = [];
    for (const c of s.conds) items.push(ruleChip('cond', c));
    for (const r of s.rules) items.push(ruleChip('rule', r));
    if (s.dictate?.kind === 'column') items.push(h('span.chip.bad', {}, t(['Left column closed', 'Middle column closed', 'Right column closed'][s.dictate.value])));
    if (s.dictate?.kind === 'spy') items.push(h('span.chip.bad', {}, t(`Moves go ${s.dictate.value}`)));
    if (s.silenced.X) items.push(h('button.chip.bad', { onclick: () => toast(t('Your next special stone will do nothing.'), 'bad') }, t('Hushed: next special stone')));
    if (s.silenced.O) items.push(h('button.chip.good', { onclick: () => toast(t('Their next special stone will do nothing.'), 'good') }, t('Enemy hushed: next special stone')));
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
    if (ps.winner === 'X' && ps.reason === 'full') setStatus(t('= This ends in a draw: yours, for a heart.'), 'win-note');
    else if (ps.winner === 'X') setStatus(t('✓ This wins the duel!'), 'win-note');
    else setStatus(t('✗ This hands them the duel!'), 'lose-note');
  }

  const setStatus = (text, cls = '') => status.instruct(text, cls);
  const said = (who, what) => what && status.log(t(who === 'X' ? 'You: {what}' : '{enemy}: {what}', { enemy: enemy.name, what }), who === 'X' ? 'you' : 'bad');

  function renderActions(buttons) { actions.replaceChildren(...buttons.filter(Boolean)); }

  function clearOverlay() {
    overlay.replaceChildren();
    cells.forEach((c) => c.classList.remove('allowed', 'target', 'chosen', 'from', 'placed-at'));
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
        // Tapped again: the preview is taken back.
        if (preview && preview.action === cands[0]) { preview = null; stageCands = cands = allEffect(); show(); return; }
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
    } else if (stage.kind === 'turn' || stage.kind === 'spin') {
      // Around the board's corners: clockwise on the right, anticlockwise on the left.
      const spot = { 1: [3.25, -0.25], [-1]: [-0.25, -0.25], 2: [3.25, 3.25], [-2]: [-0.25, 3.25] };
      for (const [k, group] of stage.groups) {
        const x = +k;
        const b = h('button.rot.turn' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group), 'aria-label': `turn ${x}` },
          h('span', { html: icon(x > 0 ? 'rotate-cw' : 'rotate-ccw') }), Math.abs(x) > 1 ? h('span.times', {}, '×2') : null);
        place(...spot[x], b);
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
      setStatus(state.winner === 'X' ? (state.reason === 'full' ? t('Draw') : t('You win!')) : t('{enemy} wins', { enemy: enemy.name }), state.winner === 'X' ? 'you' : 'enemy-done');
      renderActions([]);
      info.textContent = '';
      return;
    }
    if (busy || state.player !== 'X') {
      setStatus(t('{enemy} is thinking', { enemy: enemy.name }), 'enemy');   // the dots blink in after it (CSS)
      renderActions([]);
      info.textContent = '';
      return;
    }
    const undo = snapshot && state.turns === snapshot.turns && state.phase !== 'select'
      ? h('button.btn.ghost', { onclick: undoTurn }, h('span', { html: icon('undo') }), t('Undo')) : null;

    if (state.phase === 'select') {
      markDangers();
      setStatus(state.half ? t('Your second stone — pick one') : t('Your turn — pick a stone'), 'you');
      info.textContent = '';
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
      // Where it was placed, outlined: it may have moved on from there.
      cells[preview.action.pos].classList.add('placed-at');
      renderActions([undo, h('button.btn.primary', { onclick: confirm }, h('span', { html: icon('check') }), t('Confirm'))]);
      verdict();
    } else if (state.phase === 'effect') {
      const btns = renderStage();
      if (preview) cells[state.placedAt].classList.add('placed-at');
      // The chosen square's stone pulses faint, as every stone a preview moves does.
      cells.forEach((c, i) => {
        if (!c.classList.contains('chosen')) return;
        for (const e of stoneEls.values()) if (e.isConnected && +e.dataset.at === i) e.classList.add('moving');
      });
      const what = stoneName(state.board[state.placedAt]);
      setStatus(preview ? t('✓ to confirm, tap again to take it back') : t('Choose how your {what} works', { what }), 'you');
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
    effect: 'Tap an option to preview it, ✓ to confirm.',
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
      h('button.info-more', { onclick: () => infoStone(c, 'X') }, t('More →')));
  }

  const allEffect = () => effectCands;
  let effectCands = null;

  // ── Player input ──────────────────────────────────────────────────────────
  function myMove() { return !busy && !ended && !state.over && state.player === 'X'; }



  function tapHand(key) {
    if (ended) return;
    if (!myMove() || (state.phase !== 'select' && state.phase !== 'place')) {
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
      // Tapped again: the stone goes back to hand-held, to be placed elsewhere.
      if (preview && preview.action.pos === i) { preview = null; show(); return; }
      const action = { type: 'place', pos: i };
      const test = cloneState(state); test.log = [];
      applyAction(test, action);
      const st = specOf(state.selected);
      if (test.player === 'X' && test.phase === 'effect') {
        // Several ways to resolve: commit the placement and offer them.
        commitState(test, action);
        return;
      }
      if (!st.apply && state.selected.type !== 'parrot') { sfx('place'); commitState(test, action); return; }
      preview = { state: test, action, logs: test.log };
      sfx('place');
      show();
      return;
    }
    if (s.board[i]) infoStone(s.board[i], s.board[i].player);
  }

  // Under Open Hands, their stones are yours to play too.
  function tapEnemyStone(st) {
    const key = enemyKey(st);
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
    const { state: next, action } = preview;
    preview = null;
    commitState(next, action);
  }

  function undoTurn() {
    if (!snapshot) return;
    state = cloneState(snapshot); state.log = [];
    preview = null; selKey = null; cands = stageCands = null;
    sfx('undo');
    show();
  }

  // A committed step: announce what happened, then carry on.
  function commitState(next, action) {
    const logs = next.log ?? [];
    // A Parrot+ choosing what to copy says so itself (the 'copy' log below).
    const copying = action?.type === 'effect' && state.board[state.placedAt]?.type === 'parrot';
    if (action && !copying) said('X', action.type === 'place' ? t('played {stone} on the {square}', { stone: stoneName(state.selected), square: sq(action.pos) }) : describe(action));
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
      if (l === 'silenced') status.log(t(me ? 'Hushed! Your stone does nothing.' : 'Hushed! {enemy}\'s stone does nothing.', v), me ? 'bad' : 'good');
      else if (l === 'echo') status.log(t('Echo! It goes again.'), 'good');
      else if (l.startsWith('copy:')) { const [, by, what] = l.split(':'); status.log(t('The {parrot} copies {stone}!', { parrot: STONES[by].name, stone: STONES[what].name })); }
      else if (l === 'found:X') status.log(t('You found a pebble!'), 'good');
      else if (l === 'found:O') status.log(t('{enemy} finds a pebble!', v), 'bad');
      else if (l === 'cond:gravity') { /* shown as a step of its own */ }
      else if (l === 'rule:headstart') status.log(t('{rule}: {enemy} goes again!', { ...v, rule: RULES.headstart.name }), 'bad');
    }
  }

  function save() { onSave?.(state); }

  // ── The enemy ─────────────────────────────────────────────────────────────
  async function enemyTurn() {
    busy = true;
    show();
    await sleep(SPEED.enemyPause);
    while (!ended && !state.over && state.player === 'O') {
      const acts = legalActions(state);
      const t0 = performance.now();
      const action = acts.length === 1 ? acts[0] : await think(state, { iterations: enemy.iters, blunder: enemy.blunder });
      const waited = performance.now() - t0;
      if (ended) return;
      if (action.type === 'select') {
        state.log = [];
        applyAction(state, action);
        if (action.from === 'X') said('O', t('took your {stone}', { stone: stoneName(state.selected) }));
        // Show which stone it took: its kind lifts in the hand, the stone still counted there.
        if (action.from === 'X') {
          // Taken from your hand (Open Hands): it lifts there, before it goes.
          state.hands.X.push(state.selected);
          renderHands(state);
          const k = groupHand(state.hands.X).findIndex(({ st }) => sameKind(st, state.selected));
          state.hands.X.pop();
          hand.children[k]?.querySelector('.stone')?.classList.add('lifted');
        } else {
          renderHands(state, { ...state, hands: { ...state.hands, O: [...state.hands.O, state.selected] } });
          const k = groupHand([...state.hands.O, state.selected]).findIndex(({ st }) => sameKind(st, state.selected));
          enemyHand.children[k]?.querySelector('.stone')?.classList.add('lifted');
        }
        sfx('select');
        await sleep(Math.max(120, 420 - waited));
        continue;
      }
      state.log = [];
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
        said('O', describe(action));
        renderChips(state);
        await sleep(700);
        continue;
      }
      renderBoard(state);
      renderHands(state);
      renderChips(state);
      if (action.type === 'place') {
        lastEnemyId = state.placedId;
        said('O', t('played {stone} on the {square}', { stone: stoneName(state.lastPlaced.O), square: sq(action.pos) }));
      } else said('O', describe(action));
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
    // A full board that goes to you is a draw: it counts as won, for a heart.
    const draw = won && state.reason === 'full';
    sfx(won ? 'win' : 'lose');
    musicEvent(won ? 'win' : 'lose');
    await sleep(900);
    const v = { enemy: enemy.name };
    const elko = state.rules.includes('elko');
    const why = state.reason === 'line'
      ? (won ? t(elko ? 'An L of three!' : 'Three in a row!') : t(elko ? '{enemy} made an L of three.' : '{enemy} made three in a row.', v))
      : state.rules.includes('patient')
        ? t('The board is full — it goes to {enemy} ({rule}).', { ...v, rule: RULES.patient.name })
        : draw ? t('The board is full. It counts as yours, but costs you a heart.')
          : t('The board is full — it goes to {enemy}, who moved second.', v);
    const banner = h('div.result-banner.' + (draw ? 'draw' : won ? 'won' : 'lost'), {},
      h('div.result-title', {}, draw ? t('Draw') : won ? t('Victory!') : t('Defeat')),
      h('div.result-why', {}, why));
    // The way on in the bottom bar, yellow, as on every screen.
    const bar = h('div.result-bar', {}, h('button.btn.primary.wide.big', { onclick: () => { banner.remove(); bar.remove(); onEnd(state.winner); } }, t('Continue')));
    el.append(banner, bar);
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
  if (state.turns <= 1 && enemy.quote) status.log(t('{enemy}: “{quote}”', { enemy: enemy.name, quote: enemy.quote }));
  if (state.over) finish();
  else if (state.player === 'O') enemyTurn();


  return { destroy() { ended = true; } };
}
