// The duel screen: the board, both hands, and every choice a turn asks for.
//
// The UI drives the same engine the enemy searches. Every choice with more
// than one outcome is shown as targets on or around the board; tapping one
// previews the result, tapping it again (or ✓) commits it. Until the turn is
// over, ↩ puts the whole turn back.

import {
  STONES, TRICKS, FIELDS, legalActions, applyAction, cloneState, allowedSquares,
  winningLine, active, isStuck, guarded, other, row, col, LINES,
} from '../engine.js';
import { h, stoneEl, updateStone, iconEl, toast, infoStone, infoTrick, infoField, infoSpace, stoneName, stoneText, sleep } from './common.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { RELICS } from '../content.js';
import { think } from '../brain.js';
import { sfx } from '../sound.js';

const FIELD_ORDER = ['pos', 'from', 'a', 'to', 'target', 'dir', 'block', 'turn', 'axis', 'line', 'stone', 'hold', 'only'];
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

const SPEED = { enemyPause: 380, move: 360 };
// 'Fast' in the menu halves every pause the enemy takes.
const pace = (ms) => { let f = false; try { f = localStorage.getItem('ppp-fast') === 'on'; } catch { /* ignore */ } return f ? ms * 0.45 : ms; };
const SQUARE = ['top-left', 'top', 'top-right', 'left', 'centre', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const BLOCK = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right' };

// A few words on what an effect or trick choice did, for the move caption.
const sq = (i) => t(SQUARE[i]);
const turning = (cw) => t(cw ? 'clockwise' : 'anticlockwise');
function describe(a) {
  if (a.use && a.use !== 'pass') {
    const trick = TRICKS[a.use].name;
    if (a.from !== undefined) return `${trick}: ${sq(a.from)} → ${sq(a.to)}`;
    if (a.a !== undefined) return t('{trick}: swapped {a} and {b}', { trick, a: sq(a.a), b: sq(a.b) });
    if (a.stone) return t('{trick}: you must play {stone}', { trick, stone: STONES[a.stone].name });
    if (a.pos !== undefined) return t('{trick} on the {square}', { trick, square: sq(a.pos) });
    return trick;
  }
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
  let selIndex = null;          // hand index of the stone taken, for display
  let cands = null;             // the choices still open in effect / trick
  let stageCands = null;        // the set the visible stage was built from
  let preview = null;           // {state, action} awaiting ✓
  let trickName = null;         // the trick being aimed
  let busy = false;             // the enemy is moving, or an animation runs
  let ended = false;
  let caption = [];             // what the enemy just did
  let lastEnemyId = null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const enemyHand = h('div.hand.enemy-hand');
  const enemyTricks = h('div.enemy-tricks');
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
  const trickRow = h('div.trick-row');
  const info = h('div.info-line');

  const header = h('div.enemy-bar', {},
    h('div.portrait', { onclick: () => toast(t('“{quote}”', { quote: enemy.quote ?? '…' })) }, h('div.photo', {}, enemy.emoji)),
    h('div.enemy-meta', {}, h('div.enemy-name', {}, enemy.name,
      enemy.lives ? h('span.boss-lives', { title: t('Enemy lives') }, Array.from({ length: enemy.lives }, (_, k) => h('span' + (k < enemy.livesLeft ? '.alive' : ''), { html: icon('heart') }))) : null,
      enemy.tier && enemy.tier !== 'normal' ? h('span.tier.' + enemy.tier, {}, t(enemy.tier === 'event' ? 'challenge' : enemy.tier)) : null),
    h('div.enemy-row', {}, enemyHand, enemyTricks)), extra);

  const el = h('div.duel', {}, header, chips, status, h('div.board-wrap', {}, board), actions, hand, trickRow, info);
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
      updateStone(e, c, c.player, { stuck: !!c.stuck || guarded({ ...s, player: other(c.player) }, i), dead: !active(s, c) });
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

  function renderHands(s, shown = s) {
    // Enemy hand, as the preview would leave it.
    enemyHand.classList.toggle('crowded', shown.hands.O.length > 6);
    enemyHand.replaceChildren(...shown.hands.O.map((st) => {
      const e = stoneEl(st, 'O', { mini: true, dead: s.disabled === st.type && !s.mods.O.homeTurf });
      e.addEventListener('click', () => { if (!e.classList.contains('target')) tapEnemyStone(st); });
      return e;
    }));
    enemyTricks.replaceChildren(...s.tricks.O.map((x) => h('button.mini-trick', { html: icon(x), onclick: () => infoTrick(x) })));

    // Player hand: during a turn in progress, show the hand as it was.
    const base = snapshot && s.phase !== 'select' && s.player === 'X' && s.turns === snapshot.turns ? snapshot : s;
    const selectable = s.player === 'X' && s.phase === 'select' && !busy
      ? new Set(legalActions(s).map((a) => a.stone + (a.plus ? '+' : ''))) : null;
    const inTurn = base !== s;
    hand.replaceChildren(...base.hands.X.map((st, k) => {
      const e = stoneEl(st, 'X', { dead: s.disabled === st.type && !s.mods.X.homeTurf });
      const b = h('button.hand-slot', { onclick: () => tapHand(k) }, e, h('span.slot-name', {}, STONES[st.type].name));
      if (inTurn && k === selIndex) b.classList.add(s.phase === 'place' ? 'selected' : 'placed');
      if (selectable && !selectable.has(st.type + (st.plus ? '+' : ''))) b.classList.add('forbidden');
      if (!selectable && !(inTurn && s.phase === 'place')) b.classList.add('idle');
      return b;
    }));
    if (!base.hands.X.length) hand.append(h('div.empty-hand', {}, t('No stones left')));

    // Tricks.
    const usable = s.player === 'X' && s.phase === 'trick' && !busy
      ? new Set(legalActions(s).map((a) => a.use)) : new Set();
    trickRow.classList.toggle('spent', s.uses.X <= 0);
    trickRow.replaceChildren(
      s.tricks.X.length ? h('span.uses', { title: t('trick uses left this duel') }, s.uses.X > 0 ? `×${s.uses.X}` : t('used up:')) : h('span.no-tricks', {}, t('No tricks')),
      ...s.tricks.X.map((x) => {
        const b = h('button.trick-btn', { onclick: () => tapTrick(x) }, h('span.trick-ico', { html: icon(x) }), TRICKS[x].name);
        if (usable.has(x)) b.classList.add('usable');
        if (trickName === x) b.classList.add('aiming');
        return b;
      }));
  }

  function renderChips(s) {
    const items = [];
    items.push(h('button.chip', { onclick: () => infoSpace(s.disabled) },
      s.disabled ? h('span.chip-ico.crossed', { html: icon(s.disabled) }) : null,
      s.disabled ? t('No {stone}', { stone: STONES[s.disabled].name }) : t('Neutral space')));
    if (s.field) items.push(h('button.chip.field', { onclick: () => infoField(s.field) }, t('Boss rule: ') + FIELDS[s.field].name));
    const hx = !!s.mods.X.hourglass, ho = !!s.mods.O.hourglass;
    const tie = hx !== ho ? (hx ? 'X' : 'O') : other(s.first);
    items.push(h('span.chip.opener', { title: t('Who takes a full board, or a player out of stones') }, t(tie === 'X' ? 'Full board → you' : 'Full board → them')));
    if (s.silenced.X) items.push(h('span.chip.bad', {}, t('Hushed ×{n}', { n: s.silenced.X })));
    if (s.silenced.O) items.push(h('span.chip.good', {}, t('Enemy hushed ×{n}', { n: s.silenced.O })));
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
    cells.forEach((c) => c.classList.remove('allowed', 'target', 'chosen', 'from'));
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
        : state.board[state.placedAt]?.type === 'glue' ? { true: t('Only yours, corners too'), false: t('Everything beside it') }
          : { true: t('Only their stones'), false: t('All stones') };
      for (const [k, group] of stage.groups) {
        btns.push(h('button.btn.opt' + (isChosen(group) ? '.chosen' : ''), { onclick: pickGroup(group) }, label[k]));
      }
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
    renderChips(s);
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
      setStatus(t('{enemy} is thinking…', { enemy: enemy.name }), 'enemy');
      renderActions([]);
      info.textContent = caption.filter(Boolean).join(', ');
      return;
    }
    const undo = snapshot && state.turns === snapshot.turns && state.phase !== 'select'
      ? h('button.btn.ghost', { onclick: undoTurn }, h('span', { html: icon('undo') }), t('Undo')) : null;

    if (state.phase === 'select') {
      markDangers();
      setStatus(t('Your turn — pick a stone'), 'you');
      info.textContent = caption.length ? `${enemy.name}: ${caption.filter(Boolean).join(', ')}.`
        : state.hands.X.length ? t('Tap a stone in your hand. Tap any stone on the board to read it.') : '';
      if (state.turns >= 2 && state.board.some(Boolean) && cells.some((c) => c.classList.contains('threat'))) coach('enemy'); else coach('select');
      renderActions([]);
    } else if (state.phase === 'place' && !preview) {
      setStatus(t('Place it on a glowing square'), 'you');
      describeSelected();
      coach('place');
      for (const i of allowedSquares(state)) cells[i].classList.add('allowed');
      renderActions([undo]);
    } else if (state.phase === 'place' && preview) {
      const dud = preview.logs?.find((l) => ['silenced', 'snared', 'disabled'].includes(l));
      setStatus(dud ? t('{why} — it will do nothing. Confirm?', { why: t({ silenced: 'Hushed', snared: 'Snared', disabled: 'Switched off' }[dud]) }) : t('This is what happens. Confirm?'), dud ? 'lose-note' : 'you');
      cells[preview.action.pos].classList.add('chosen');
      for (const i of allowedSquares(state)) cells[i].classList.add('allowed');
      renderActions([undo, h('button.btn.primary', { onclick: confirm }, h('span', { html: icon('check') }), t('Confirm'))]);
      verdict();
    } else if (state.phase === 'effect' || (state.phase === 'trick' && trickName)) {
      const btns = renderStage();
      const what = state.phase === 'effect' ? stoneName(state.board[state.placedAt]) : TRICKS[trickName].name;
      setStatus(preview ? t('Tap again or ✓ to confirm') : t(state.phase === 'trick' ? 'Aim your {what}' : 'Choose how your {what} works', { what }), 'you');
      if (state.phase === 'effect') { describeSelected(); if (!preview) coach('effect'); } else info.textContent = TRICKS[trickName].text;
      const back = state.phase === 'trick'
        ? h('button.btn.ghost', { onclick: () => { trickName = null; preview = null; show(); } }, h('span', { html: icon('back') }), t('Back'))
        : (stageCands !== allEffect() ? h('button.btn.ghost', { onclick: () => { stageCands = cands = allEffect(); preview = null; show(); } }, h('span', { html: icon('back') }), t('Back')) : null);
      renderActions([state.phase === 'effect' ? undo : back, state.phase === 'trick' ? undo : back,
        ...btns, preview ? h('button.btn.primary', { onclick: confirm }, h('span', { html: icon('check') }), t('Confirm')) : null]
        .filter((b, k, arr) => b && arr.indexOf(b) === k));
      verdict();
    } else if (state.phase === 'trick') {
      setStatus(t('Spend a trick, or end your turn'), 'you');
      info.textContent = t('Glowing tricks can be used now. A trick resolves before the check for three in a row.');
      coach('trick');
      renderActions([undo, h('button.btn.primary', { onclick: endTurnPass }, t('End turn'))]);
    }
  }

  // Where the enemy's restrictions keep you out, and where one plain stone
  // of theirs would finish a line: shown before you pick anything.
  function markDangers() {
    const ok = new Set(allowedSquares(state, { type: 'shift', plus: false }));
    state.board.forEach((c, i) => { if (!c && !ok.has(i)) cells[i].classList.add('nogo'); });
    // Only where they could actually put a stone, restrictions and all.
    const theirTurn = cloneState(state);
    theirTurn.player = 'O';
    const theyMay = new Set(allowedSquares(theirTurn, { type: 'shift', plus: false }));
    for (const line of LINES) {
      const os = line.filter((i) => state.board[i]?.player === 'O').length;
      const empty = line.filter((i) => !state.board[i]);
      if (os === 2 && empty.length === 1 && theyMay.has(empty[0])) cells[empty[0]].classList.add('threat');
    }
  }

  // First-time tips, one per kind of moment, shown once ever.
  const COACH = {
    select: 'Tip: three of yours in a row wins. Tap a stone in your hand to pick it up — each one does something different.',
    place: 'Tip: highlighted squares are where it may go. Striped squares are ones the enemy\'s stones keep you out of.',
    effect: 'Tip: this stone moves things. Tap a yellow note or dashed square to see the result, then tap it again (or ✓) to confirm.',
    trick: 'Tip: you may spend a trick now, before the check for three in a row — or just end your turn.',
    enemy: 'Tip: a red ! marks a square where the enemy could finish a line with one plain stone.',
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
      state.silenced.X > 0 && state.phase === 'place' ? h('span.red', {}, t(' — but you are hushed: it will do nothing.')) : '',
      h('button.info-more', { onclick: () => infoStone(c, 'X') }, 'ⓘ'));
  }

  const allEffect = () => (state.phase === 'effect' ? effectCands : legalActions(state).filter((a) => a.use === trickName));
  let effectCands = null;

  // ── Player input ──────────────────────────────────────────────────────────
  function myMove() { return !busy && !ended && !state.over && state.player === 'X'; }

  function tapHand(k) {
    if (!myMove()) return;
    if (state.phase !== 'select' && state.phase !== 'place') {
      const st = (snapshot ?? state).hands.X[k];
      if (st) infoStone(st, 'X');
      return;
    }
    if (state.phase === 'place') {
      const same = k === selIndex;
      state = cloneState(snapshot); state.log = [];
      preview = null;
      selIndex = null;
      if (same) { show(); return; }
    }
    const st = state.hands.X[k];
    const ok = legalActions(state).find((a) => a.stone === st.type && !!a.plus === !!st.plus);
    if (!ok) { toast(t('{trick}: you must play the named stone.', { trick: TRICKS['mind-control'].name }), 'bad'); return; }
    sfx('select');
    // Never touch the saved start-of-turn state: work on a copy of it.
    snapshot = state;
    selIndex = k;
    state = cloneState(snapshot); state.log = [];
    applyAction(state, ok);
    show();
  }

  function tapSquare(i) {
    const s = preview ? preview.state : state;
    if (!myMove() || state.phase === 'select' || (state.phase === 'trick' && !trickName)) {
      if (s.board[i]) infoStone(s.board[i], s.board[i].player, s.board[i].stuck ? t('This stone is stuck: nothing will move it.') : '');
      return;
    }
    if (state.phase === 'place') {
      const allowed = allowedSquares(state);
      if (!allowed.includes(i)) {
        if (s.board[i] && !preview) infoStone(s.board[i], s.board[i].player);
        else if (!s.board[i] && i === 4 && state.turns === 0 && state.board.every((c) => !c)) toast(t('Nobody opens a duel in the centre.'), 'bad');
        else if (!s.board[i]) toast(t('Not there — the enemy\'s restrictions point elsewhere.'), 'bad');
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

  function tapEnemyStone(st) { infoStone(st, 'O'); }

  function tapTrick(x) {
    if (!myMove() || state.phase !== 'trick') { infoTrick(x); return; }
    const opts = legalActions(state).filter((a) => a.use === x);
    if (!opts.length) { infoTrick(x); toast(t('{trick} has nothing to do right now.', { trick: TRICKS[x].name })); return; }
    trickName = x;
    preview = null;
    stageCands = cands = opts;
    show();
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
    trickName = null;
    commitState(next);
  }

  function undoTurn() {
    if (!snapshot) return;
    state = cloneState(snapshot); state.log = [];
    preview = null; trickName = null; selIndex = null; cands = stageCands = null;
    sfx('undo');
    show();
  }

  function endTurnPass() {
    const next = cloneState(state); next.log = [];
    applyAction(next, { type: 'trick', use: 'pass' });
    commitState(next);
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
      if (state.phase === 'select') { snapshot = null; selIndex = null; save(); }
      show();
    } else {
      snapshot = null; selIndex = null;
      save();
      enemyTurn();
    }
  }

  function announce(logs, who) {
    const me = who === 'X';
    const v = { enemy: enemy.name };
    for (const l of logs) {
      if (l === 'disabled') toast(t(me ? 'Your stone is switched off by the space.' : '{enemy}\'s stone is switched off by the space.', v));
      else if (l === 'silenced') toast(t(me ? 'Hushed! Your stone does nothing.' : 'Hushed! {enemy}\'s stone does nothing.', v), me ? 'bad' : 'good');
      else if (l === 'snared') toast(t(me ? 'Snared! Your stone does nothing.' : 'Snared! {enemy}\'s stone does nothing.', v), me ? 'bad' : 'good');
      else if (l === 'echo') toast(t('Echo! It goes again.'), 'good');
      else if (l.startsWith('parrot:')) toast(t('The {parrot} copies {stone}!', { parrot: STONES.parrot.name, stone: STONES[l.slice(7)].name }));
      else if (l.startsWith('trick:')) { toast(t(me ? 'You used {trick}!' : '{enemy} used {trick}!', { ...v, trick: TRICKS[l.slice(6)].name }), me ? 'good' : 'bad'); sfx('trick'); }
      else if (l.startsWith('field:')) toast(`${FIELDS[l.slice(6)].name}!`);
    }
  }

  function save() { onSave?.(state); }

  // ── The enemy ─────────────────────────────────────────────────────────────
  async function enemyTurn() {
    busy = true;
    show();
    await sleep(pace(SPEED.enemyPause));
    while (!ended && !state.over && state.player === 'O') {
      const acts = legalActions(state);
      const t0 = performance.now();
      const action = acts.length === 1 ? acts[0] : await think(state, { iterations: enemy.iters, blunder: enemy.blunder });
      const waited = performance.now() - t0;
      if (ended) return;
      if (action.type === 'select') {
        state.log = [];
        applyAction(state, action);
        caption = [t('played {stone}', { stone: stoneName(state.selected) })];
        info.textContent = caption.filter(Boolean).join(', ');
        // Show which stone it took.
        renderHands(state);
        const k = state.hands.O.length;
        const lifted = stoneEl(state.selected, 'O', { mini: true });
        lifted.classList.add('lifted');
        enemyHand.append(lifted);
        sfx('select');
        await sleep(pace(Math.max(120, 420 - waited)));
        continue;
      }
      state.log = [];
      // The board before the boss's field rule, so it can be shown as a step.
      let beforeField = null;
      if (state.field) {
        beforeField = cloneState(state);
        beforeField.field = null;
        applyAction(beforeField, action);
      }
      applyAction(state, action);
      const logs = state.log;
      state.log = [];
      if (beforeField && logs.some((l) => l.startsWith('field:'))) {
        renderBoard(beforeField);
        await sleep(pace(520));
        board.classList.add('shake');
        setTimeout(() => board.classList.remove('shake'), 400);
        sfx('thud');
      }
      renderBoard(state);
      renderHands(state);
      renderChips(state);
      if (action.type === 'place') {
        lastEnemyId = state.placedId;
        caption = [t('played {stone} on the {square}', { stone: stoneName(state.lastPlaced.O), square: sq(action.pos) })];
      } else if (action.type !== 'trick' || action.use !== 'pass') caption.push(describe(action));
      info.textContent = caption.filter(Boolean).join(', ');
      if (action.type === 'place') {
        sfx('place');
        const e = [...stoneEls.values()].find((x) => +x.dataset.at === action.pos);
        e?.classList.add('flash');
        setTimeout(() => e?.classList.remove('flash'), 600);
      } else sfx('move');
      announce(logs, 'O');
      await sleep(pace(action.type === 'place' ? 520 : 600));
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
    if (won) [...header.querySelectorAll('.boss-lives span.alive')].pop()?.classList.replace('alive', 'lost-life');
    sfx(won ? 'win' : 'lose');
    await sleep(900);
    const v = { enemy: enemy.name };
    const hourglass = !!state.mods.X.hourglass !== !!state.mods.O.hourglass;
    const why = state.reason === 'line'
      ? (won ? t('Three in a row!') : t('{enemy} made three in a row.', v))
      : state.reason === 'full'
        ? (hourglass
          ? t(won ? 'The board is full — it goes to you ({hourglass}).' : 'The board is full — it goes to {enemy} ({hourglass}).', { ...v, hourglass: RELICS.hourglass.name })
          : t(won ? 'The board is full — it goes to you, who moved second.' : 'The board is full — it goes to {enemy}, who moved second.', v))
        : t(state.player === 'X'
          ? (won ? 'You are out of stones — it goes to you.' : 'You are out of stones — it goes to {enemy}.')
          : (won ? '{enemy} is out of stones — it goes to you.' : '{enemy} is out of stones — it goes to {enemy}.'), v);
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
    state.hands.X.push(state.selected);
    state.selected = null;
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
