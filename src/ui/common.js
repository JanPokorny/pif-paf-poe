// Small DOM helpers shared by every screen.

import { STONES, CONDS, RULES, createGame, legalActions, applyAction, cloneState, allowedSquares, specOf } from '../engine.js';
import { RELICS } from '../content.js';
import { costOf, GOLD_PAY as R_GOLD } from '../run.js';
import { icon, ICONS } from '../icons.js';
import { t, lang, setLang, LANGS } from '../i18n.js';

export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// A hand-drawn star sticker (unused while no stone is special enough).
// A + stone: a small + drawn in the stone's own ink, in the corner of its face.
const STAR = '<svg class="badge-plus" viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -6.5 V6.5 M-6.5 0 H6.5"/></svg>';

// Marble: a cut, many-sided outline in place of the drawn one (shown by CSS).
const MARBLE = '<svg class="marble-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M29 3 L71 3 L97 29 L97 71 L71 97 L29 97 L3 71 L3 29 Z"/><path class="vein" d="M14 64 C 30 56, 38 70, 56 58 S 80 46, 90 52"/></svg>';

// Pen marks, as SVG strings in a 0..100 box: an X in two strokes, an O in one
// loop that overshoots where it closes. `fresh` draws them in.
export function scribbleX(fresh = false) {
  return `<svg class="scribble x${fresh ? ' fresh' : ''}" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="100" d="M22 20 C 40 38, 58 60, 80 82"/><path pathLength="100" class="second" d="M79 19 C 60 40, 42 58, 20 81"/></svg>`;
}
export function scribbleO(fresh = false) {
  return `<svg class="scribble o${fresh ? ' fresh' : ''}" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="100" d="M56 16 C 30 12, 14 34, 18 56 C 22 80, 48 90, 68 80 C 88 70, 88 40, 74 26 C 66 18, 52 14, 42 20"/></svg>`;
}

// Ink art for a relic, event or kit, falling back to its emoji as a stamp.
export function art(kind, id, emoji) {
  const name = kind === 'x' ? id : `${kind}-${id}`;
  return ICONS[name] ? h('span.art', { html: icon(name) }) : h('span.art.stamp', {}, emoji);
}
// A + talisman shows the stone it upgrades, starred.
export const relicArt = (id) => (RELICS[id]?.upgrades
  ? h('span.art.upgrade', { html: RELICS[id].upgrades.map((x) => icon(x)).join('') + STAR })
  : art('relic', id, RELICS[id]?.emoji ?? '?'));

export const iconEl = (name, cls = '') => h('span.icon-wrap', { html: icon(name, cls) });

// A stone token. `player` is X (you, a rounded square) or O (the enemy, a circle).
export function stoneEl(s, player = 'X', opts = {}) {
  const el = h(`div.stone.${player}`, {
    dataset: { type: s.type },
    title: stoneName(s),
  });
  updateStone(el, s, player, opts);
  // `cost`: its energy, as dots in the corner.
  if (opts.cost) el.append(costDots(s));
  return el;
}
export function costDots(s) {
  const n = costOf(s);
  return h('span.cost', { 'aria-label': t('{n} energy', { n }) }, ...Array.from({ length: n }, () => h('i')));
}
// The energy you have, as dots: `used` of them filled.
export function energyBar(used, total) {
  return h('div.energy-bar' + (used > total ? '.over' : ''), { 'aria-label': t('Energy {used}/{n}', { used, n: total }) },
    h('span.energy-ico', { html: icon('energy') }),
    ...Array.from({ length: Math.max(total, used) }, (_, i) => h('i' + (i < used ? '.on' : '') + (i >= total ? '.over' : ''))));
}

export function updateStone(el, s, player, opts = {}) {
  el.classList.remove('X', 'O');
  el.classList.add(player);
  el.classList.toggle('stuck', !!opts.stuck);
  el.classList.toggle('dead', !!opts.dead);
  el.classList.toggle('mini', !!opts.mini);
  el.classList.toggle('once', !!(s.once || STONES[s.type]?.once));
  el.classList.toggle('plus', !!(s.plus && STONES[s.type]?.plus));
  el.classList.toggle('marble', s.mat === 'marble');
  el.classList.toggle('gold', s.mat === 'gold');
  if (el.dataset.type !== s.type || !el.firstChild) {
    el.dataset.type = s.type;
    el.innerHTML = MARBLE + icon(s.type, 'glyph') + STAR + '<span class="tape"></span>';
  }
}

// A stone to choose: the box in its corner ticks it at once; a tap on the stone
// opens its card, whose button selects or deselects it.
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5 C 6.5 14, 8 16, 9.5 19 C 12 12.5, 15.5 7.5, 20.5 3.5"/></svg>';
export function tickStone(s, { on, toggle, name = false, face = '' }) {
  const box = h('button.tick-box', { role: 'checkbox', 'aria-checked': String(!!on), 'aria-label': stoneName(s), html: TICK,
    onclick: (e) => { e.stopPropagation(); toggle(); } });
  const btn = h('button.tick-face' + face, { 'aria-label': stoneName(s),
    onclick: () => infoStone(s, 'X', '', { label: on ? t('Deselect') : t('Select'), run: toggle }) },
  stoneEl(s, 'X', { cost: true }), name ? h('span.tick-name', {}, stoneName(s)) : null);
  return h('div.tick-stone' + (on ? '.on' : ''), {}, btn, box);
}

// A stone's name and text: its + form's for a + stone.
export function stoneName(s) { return specOf(s)?.name ?? s.type; }
export function stoneText(s) { return specOf(s)?.text ?? ''; }

let toastTimer = null;
let toastAt = 0;
// Clear a note left over from the last screen, but not one just raised for this one.
// Hiding keeps the toast's colour: only `show` goes, so it fades out as it was.
export function hideToast() { const el = document.getElementById('toast'); if (el && Date.now() - toastAt > 400) el.classList.remove('show'); }
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div'); el.id = 'toast'; document.body.append(el); }
  toastAt = Date.now();
  el.className = 'show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Tape is never stuck on quite straight: a little off-centre and askew, the
// same for the same thing every time it is drawn.
export function tapeUp(root) {
  for (const el of root.querySelectorAll('.card, .portrait, .rules-note, .result-banner')) {
    let n = 7;
    for (const ch of el.textContent) n = (Math.imul(n, 31) + ch.charCodeAt(0)) | 0;
    el.style.setProperty('--tape-x', `${((n >>> 3) % 21) - 10}px`);
    el.style.setProperty('--tape-r', `${((n >>> 9) % 9) - 4}deg`);
  }
}

// A sheet is ruled paper, a rule every 26px. Its text is written one line to a
// rule; every other block (a grid of stones, a button, a board) is topped up
// with margin to a whole number of rules, so the text below stays on them --
// also when the sheet redraws.
const RULE = 26;
function onRules(el) {
  el.classList.add('ruled');
  const snap = () => {
    for (const c of el.children) {
      c.style.marginBottom = '';
      const extra = (RULE - (c.offsetHeight % RULE)) % RULE;
      if (extra) c.style.marginBottom = `${extra}px`;
    }
  };
  new window.MutationObserver(snap).observe(el, { childList: true });
  new window.ResizeObserver(snap).observe(el);
  snap();
}

// A modal sheet. Returns a close function.
export function modal(content, { onClose, dismissable = true, cls = '' } = {}) {
  const back = h('div.modal-back');
  const sheet = h(`div.modal.${cls || 'plain'}`, {}, content);
  if (content.matches?.('.pouch-view, .menu, .ask, .info-stone')) requestAnimationFrame(() => onRules(content));
  tapeUp(sheet);
  back.append(sheet);
  const close = () => {
    back.classList.add('closing');
    setTimeout(() => back.remove(), 160);
    onClose?.();
  };
  if (dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return close;
}

// The status line, on the map and in duels: what just happened, each entry for
// a moment, then back to what to do next. The ⌄ beside it opens the whole log.
//   log(text, kind)   an entry: shown for a moment, kept in the history
//   instruct(text, kind)   what to do next: shown whenever nothing new is
//   history    [{text, kind}], oldest first (pass one in to carry it on)
export function statusLine({ history = [], title = '' } = {}) {
  const text = h('span.status-text');
  const btn = h('button.log-btn', { 'aria-label': t('What happened'), html: icon('chevron-down'), onclick: (e) => { e.stopPropagation(); showLog(); } });
  const el = h('div.status-line', {}, text, btn);
  let instruction = { text: '', kind: '' };
  const queue = [];
  let timer = null;
  const render = (item, isLog) => {
    text.textContent = item.text;
    el.className = 'status-line ' + (item.kind ?? '') + (isLog ? ' is-log' : '');
    btn.hidden = !history.length;
  };
  const next = () => {
    if (!el.isConnected && timer) { timer = null; return; }
    const item = queue.shift();
    if (!item) { timer = null; render(instruction); return; }
    render(item, true);
    // More waiting: hurry through them.
    timer = setTimeout(next, queue.length ? 900 : 1600);
  };
  function showLog() {
    const list = h('ol.log-list', {}, history.map((x) => h('li.' + (x.kind || 'plain'), {}, x.text)));
    const close = modal(h('div.log-view', {}, h('h2', {}, title || t('What happened')),
      history.length ? list : h('p.dim', {}, t('Nothing yet.')),
      h('button.btn.wide.ghost.log-close', { onclick: () => close() }, t('Close'))), { cls: 'tall' });
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  render(instruction);
  return {
    el, history,
    log(entry, kind = '') {
      if (!entry) return;
      const item = { text: entry, kind };
      history.push(item);
      queue.push(item);
      if (queue.length > 3) queue.splice(0, queue.length - 3);   // never far behind
      if (!timer) next();
    },
    instruct(entry, kind = '') {
      instruction = { text: entry, kind };
      if (!timer) render(instruction);
    },
  };
}

// Our own yes-or-no, in place of the browser's confirm(), which drops fullscreen.
export function ask(question, yes, no = t('Back')) {
  return new Promise((done) => {
    let answered = false;
    const answer = (v) => { if (answered) return; answered = true; close(); done(v); };
    const close = modal(h('div.ask', {},
      h('p.ask-q', {}, question),
      h('button.btn.wide.danger', { onclick: () => answer(true) }, yes),
      h('button.btn.wide.ghost', { onclick: () => answer(false) }, no)), { onClose: () => { if (!answered) { answered = true; done(false); } } });
  });
}

// A worked example of a stone, computed by the engine itself: a small board
// before and after, or the squares it leaves the enemy.
const DEMO_BOARD = { 1: 'O', 3: 'O', 8: 'O', 2: 'X', 7: 'X' };
function demoBoard(board, marks = {}) {
  const g = h('div.demo-board');
  for (let i = 0; i < 9; i++) {
    const c = board[i];
    const cell = h('div.demo-cell' + (marks[i] ? '.' + marks[i] : ''));
    if (c) cell.append(stoneEl(c, c.player, { mini: true, stuck: !!c.stuck, dead: !!c.hushed }));
    g.append(cell);
  }
  return g;
}
// A word under the example where the picture alone does not say it.
function demoCaption(st) {
  if (st.id === 'parrot') return t('Here it copies a Shift, and slides like one.');
  return null;
}

function stoneDemo(s) {
  const st = specOf(s);
  const plus = s.plus && STONES[s.type].plus ? { plus: true } : {};
  // The sample board; a copying stone gets an enemy Shift to copy, one played last.
  const copies = s.type === 'parrot';
  if (s.type === 'mountain') return mountainDemo();
  const fresh = (empty = false) => {
    const g = createGame({ handX: [{ type: s.type, ...plus }], first: 'X', log: false });
    let id = 50;
    // A Waltz gets a full block of four to turn.
    const sample = s.type === 'rotate' ? { ...DEMO_BOARD, 0: 'X' } : DEMO_BOARD;
    if (!empty) for (const [i, p] of Object.entries(sample)) g.board[+i] = { player: p, type: copies && +i === 8 ? 'shift' : 'pebble', id: id++ };
    if (copies) g.lastPlaced.O = { type: 'shift' };
    g.nextId = 100;
    return g;
  };
  try {
    if (st.restrict) {
      // On an empty board, the squares it closes to the enemy, struck through one
      // after another: in the centre, so the corners show untouched; a + one,
      // reaching its row and column, in a corner, where that differs.
      const at = plus.plus ? 0 : 4;
      const g = fresh(true);
      const before = cloneState(g).board;
      before[at] = { player: 'X', type: s.type, id: g.nextId, ...plus };
      applyAction(g, { type: 'select', stone: s.type, ...plus });
      applyAction(g, { type: 'place', pos: at });
      if (g.phase === 'effect') applyAction(g, legalActions(g)[0]);
      g.phase = 'place';
      const ok = new Set(allowedSquares(g));
      const marks = {};
      for (let i = 0; i < 9; i++) if (!g.board[i] && !ok.has(i)) marks[i] = 'no';
      return h('div.demo', {}, animatedDemo(before, g.board, at, { marks }));
    }
    if (!st.apply && !st.copies) return null;
    // The placement and choice that change the board the most.
    let best = null;
    // On the sample board; a stone that needs room (a Twin) on an empty one.
    for (const [pos, empty] of [[4], [0], [5], [7], [1], [0, true], [4, true]]) {
      if (empty && best?.moved) break;
      const g = fresh(empty);
      if (g.board[pos]) continue;
      applyAction(g, { type: 'select', stone: s.type, ...plus });
      // Before: the stone drawn where it lands, nothing done yet.
      const before = cloneState(g).board;
      before[pos] = { player: 'X', type: s.type, id: g.nextId, ...plus };
      applyAction(g, { type: 'place', pos });
      const opts = g.phase === 'effect' ? legalActions(g) : [null];
      for (const o of opts) {
        const after = cloneState(g);
        if (o) applyAction(after, o);
        // A Parrot+ became another stone: let that one act too.
        for (let k = 0; k < 3 && after.phase === 'effect' && after.player === 'X'; k++) applyAction(after, legalActions(after)[0]);
        const same = (a, b) => (!a && !b) || (a && b && a.player === b.player && a.type === b.type);
        // Stones it moves or changes, then squares it changes.
        const at = (id) => after.board.findIndex((c) => c?.id === id);
        const stones = before.reduce((n, c, i) => n + (c && (at(c.id) !== i || !same(after.board[at(c.id)], c)) ? 1 : 0), 0);
        // (A stone sent back to a hand has left the board: counted already.)
        const moved = stones * 10 + after.board.reduce((n, c, i) => n + (same(c, before[i]) ? 0 : 1), 0);
        if (!best || moved > best.moved) best = { moved, before, after: after.board, pos, o };
      }
    }
    if (!best || !best.moved) return null;
    const cap = demoCaption(st);
    return h('div.demo', {}, animatedDemo(best.before, best.after, best.pos), cap ? h('div.demo-cap', {}, cap) : null);
  } catch { return null; }
}

// A Mountain does nothing itself: a Shift and a Waltz step their stones round it.
function mountainDemo() {
  const play = (type, pos, others, pick) => {
    const g = createGame({ handX: [{ type }], first: 'X', log: false });
    let id = 50;
    g.board[4] = { player: 'X', type: 'mountain', id: id++ };
    for (const [i, p] of Object.entries(others)) g.board[+i] = { player: p, type: 'pebble', id: id++ };
    g.nextId = 100;
    applyAction(g, { type: 'select', stone: type });
    const before = cloneState(g).board;
    before[pos] = { player: 'X', type, id: g.nextId };
    applyAction(g, { type: 'place', pos });
    const o = legalActions(g).find(pick);
    if (o) applyAction(g, o);
    return animatedDemo(before, g.board, pos);
  };
  try {
    return h('div.demo', {},
      play('shift', 3, { 5: 'O' }, (a) => a.dir === 'right'),
      play('rotate', 0, { 1: 'O', 3: 'O' }, (a) => a.block === 'TL'),
      h('div.demo-cap', {}, t('Stones moving past it step over it.')));
  } catch { return null; }
}

// The example played out on one small board, over and over: the stone lands,
// then every stone slides to where it ends up; what leaves fades, what is new
// appears, what changes side or kind turns.
const DEMO_CELL = 36, DEMO_STONE = 30;
function animatedDemo(before, after, pos, { marks = null } = {}) {
  const board = demoBoard([], {});
  board.classList.add('anim');
  const spot = (i) => `${(i % 3) * DEMO_CELL + (DEMO_CELL - DEMO_STONE) / 2}px ${((i / 3) | 0) * DEMO_CELL + (DEMO_CELL - DEMO_STONE) / 2}px`;
  const where = (b, id) => b.findIndex((c) => c?.id === id);
  const ids = [...new Set([...before, ...after].filter(Boolean).map((c) => c.id))];
  const placedId = before[pos].id;
  const els = new Map(ids.map((id) => {
    const c = before[where(before, id)] ?? after[where(after, id)];
    const el = stoneEl(c, c.player, { mini: true });
    el.classList.add('demo-stone');
    board.append(el);
    return [id, el];
  }));
  const cellAt = (i) => board.children[i];
  const reset = () => {
    for (let i = 0; i < 9; i++) cellAt(i).classList.remove('placed', 'ok', 'no');
    for (const [id, el] of els) {
      el.classList.add('still');
      el.classList.remove('flash');
      const i = where(before, id);
      const c = i >= 0 ? before[i] : after[where(after, id)];
      updateStone(el, c, c.player, { mini: true, stuck: !!c.stuck });
      el.style.translate = spot(i >= 0 ? i : where(after, id));
      const shown = i >= 0 && id !== placedId;
      el.style.opacity = shown ? 1 : 0;
      el.style.scale = shown ? 1 : 0.4;
    }
    void board.offsetWidth;   // the reset lands before anything moves
    for (const el of els.values()) el.classList.remove('still');
  };
  const land = () => {
    cellAt(pos).classList.add('placed');
    const el = els.get(placedId);
    el.style.opacity = 1; el.style.scale = 1;
  };
  // The stones the effect works on -- those that move, change or leave -- flash
  // a moment before it acts.
  const acted = ids.filter((id) => {
    const i = id === placedId ? pos : where(before, id), k = where(after, id);
    if (id === placedId) return k !== pos;   // the new stone, when it moves too
    if (i < 0) return false;
    const a = before[i], b = after[k];
    return k !== i || !b || a.player !== b.player || a.type !== b.type;
  });
  const light = () => { for (const id of acted) els.get(id).classList.add('flash'); };
  const play = () => {
    Object.entries(marks ?? {}).forEach(([i, m], k) => { cellAt(+i).style.setProperty('--d', `${k * 0.18}s`); cellAt(+i).classList.add(m); });
    for (const [id, el] of els) {
      const i = where(after, id);
      if (i < 0) { el.style.opacity = 0; el.style.scale = 0.4; continue; }
      const c = after[i];
      updateStone(el, c, c.player, { mini: true, stuck: !!c.stuck });
      el.style.translate = spot(i);
      el.style.opacity = 1; el.style.scale = 1;
    }
  };
  // One loop: still, land, flash what it works on, act, hold. It stops
  // once the card is closed.
  const flash = acted.length > 0;
  const loop = () => {
    if (!board.isConnected && board.dataset.started) return;
    board.dataset.started = '1';
    reset();
    setTimeout(land, 500);
    if (flash) setTimeout(light, 1000);
    setTimeout(play, flash ? 1700 : 1300);
    setTimeout(loop, flash ? 4400 : 3800);
  };
  loop();
  return board;
}

// The buttons under an info card: OK alone, or an action (Buy, Pick) over Close.
// action: {label, run, disabled}; run() is called once the card has closed.
function infoButtons(close, action) {
  // Dismissing is always the dashed button; an action on the card, yellow.
  if (!action) return h('button.btn.wide.ghost', { onclick: () => close() }, t('Close'));
  return h('div.info-actions', {},
    h('button.btn.wide.primary', { disabled: action.disabled || undefined, onclick: () => { close(); action.run(); } }, action.label),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Close')));
}

export function infoStone(s, player = 'X', extra = '', action = null) {
  const st = STONES[s.type];
  const once = s.once || st.once;
  const plus = s.plus && st.plus;
  const body = h('div.info-stone', {},
    h('div.info-head', {}, stoneEl(s, player), h('div', {},
      h('div.info-name', {}, stoneName(s)),
      h('div.info-rarity.' + st.rarity, {}, [once ? t('glass') : s.mat ? t(s.mat) : null, t(st.rarity), costOf(s) ? t('{n} energy', { n: costOf(s) }) : null].filter(Boolean).join(' · ')))),
    h('p', {}, stoneText(s)),
    stoneDemo(s),
    plus ? h('p.info-plus', {}, t('Without the +: {text}', { text: st.text })) : null,
    once ? h('p.info-plus', {}, t('Glass: once played, it is gone from your pouch. It always costs 1 energy.')) : null,
    s.mat === 'marble' ? h('p.info-plus', {}, t('Marble: it goes anywhere, whatever the other side\'s stones restrict. 1 energy more.')) : null,
    s.mat === 'gold' ? h('p.info-plus', {}, t('Gold: +{n} gold when it is in your winning three in a row. 1 energy more.', { n: R_GOLD })) : null,
    extra ? h('p.info-extra', {}, extra) : null,
    infoButtons(() => close(), action));
  const close = modal(body);
}

export function infoRelic(id, action = null) {
  const r = RELICS[id];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, h('div.relic-token', {}, relicArt(id)), h('div', {},
      h('div.info-name', {}, r.name), h('div.info-rarity.' + r.rarity, {}, t('talisman') + ' · ' + t(r.rarity)))),
    h('p', {}, r.text),
    // A + talisman: each stone it upgrades, and what its + form does.
    r.upgrades ? h('div.plus-list', {}, r.upgrades.map((x) => h('div.plus-row', {},
      stoneEl({ type: x, plus: true }, 'X', { mini: true }), h('span', {}, h('b', {}, `${STONES[x].name}+: `), STONES[x].plusText)))) : null,
    infoButtons(() => close(), action));
  const close = modal(body);
}

// The same card for anything else on offer (a shop's services): a picture, a name, what it does.
export function infoThing({ art: pic, name, kind = '', text }, action = null) {
  const body = h('div.info-stone', {},
    h('div.info-head', {}, h('div.relic-token', { html: pic }), h('div', {},
      h('div.info-name', {}, name), kind ? h('div.info-rarity', {}, kind) : null)),
    h('p', {}, text),
    infoButtons(() => close(), action));
  const close = modal(body);
}

// A duel condition (for both sides) or a boss rule (in the boss's favour).
export const ruleOf = (kind, id) => (kind === 'cond' ? CONDS[id] : RULES[id]);
export function infoRule(kind, id) {
  const r = ruleOf(kind, id);
  const close = modal(h('div.info-stone', {},
    h('div.info-head', {}, h('div.trick-token', { html: icon(`${kind}-${id}`) }), h('div', {},
      h('div.info-name', {}, r.name), h('div.info-rarity', {}, kind === 'cond' ? t('for both sides') : t('boss rule')))),
    h('p', {}, r.text),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Close'))));
}
export function ruleChip(kind, id, cls = '') {
  const r = ruleOf(kind, id);
  return h(`button.rule-chip.${kind}${cls}`, { onclick: (e) => { e.stopPropagation(); infoRule(kind, id); } },
    h('span.chip-ico', { html: icon(`${kind}-${id}`) }), h('span', {}, r.name));
}

// A card for reward and shop screens.
// Cards are small: picture, name, price. A tap opens the card (where to take or
// buy it).
export function stoneCard(s, { onclick, price, sold, dear, footer } = {}) {
  const st = STONES[s.type];
  return h(`button.card.stone-card.${st.rarity}${sold ? '.sold' : dear ? '.dear' : ''}`, { disabled: sold || undefined, 'aria-label': stoneName(s), onclick: onclick ?? (() => infoStone(s, 'X')) },
    stoneEl(s, 'X', { cost: true }),
    h('div.card-name', {}, stoneName(s)),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null,
    footer ?? null);
}

export function relicCard(id, { onclick, price, sold, dear } = {}) {
  const r = RELICS[id];
  return h(`button.card.relic-card.${r.rarity}${sold ? '.sold' : dear ? '.dear' : ''}`, { disabled: sold || undefined, 'aria-label': r.name, onclick: onclick ?? (() => infoRelic(id)) },
    h('div.relic-token', {}, relicArt(id)),
    h('div.card-name', {}, r.name),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null);
}

// The EN · CS switch. Changing it reloads the page.
// EN / CS: the language in use underlined, a tap on the other switches.
export function langToggle() {
  return h('div.lang-toggle', { role: 'group', 'aria-label': 'Language / Jazyk' },
    LANGS.map((l, k) => [k ? h('span.sep', {}, '/') : null,
      h('button.lang' + (l === lang ? '.on' : ''), { onclick: () => setLang(l), 'aria-pressed': String(l === lang), lang: l }, l.toUpperCase())]));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
