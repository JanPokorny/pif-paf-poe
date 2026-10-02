// Small DOM helpers shared by every screen.

import { STONES, CONDS, RULES, createGame, legalActions, applyAction, cloneState, allowedSquares, touching, adjacent } from '../engine.js';
import { RELICS } from '../content.js';
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
const STAR = '<svg class="badge-plus" viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -8.5 L2.4 -2.7 L8.6 -2.4 L3.8 1.5 L5.4 7.6 L0 4.2 L-5.4 7.6 L-3.8 1.5 L-8.6 -2.4 L-2.4 -2.7 Z"/></svg>';

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
export const relicArt = (id) => art('relic', id, RELICS[id]?.emoji ?? '?');

export const iconEl = (name, cls = '') => h('span.icon-wrap', { html: icon(name, cls) });

// A stone token. `player` is X (you, a rounded square) or O (the enemy, a circle).
export function stoneEl(s, player = 'X', opts = {}) {
  const el = h(`div.stone.${player}`, {
    dataset: { type: s.type },
    title: STONES[s.type]?.name,
  });
  updateStone(el, s, player, opts);
  return el;
}

export function updateStone(el, s, player, opts = {}) {
  el.classList.remove('X', 'O');
  el.classList.add(player);
  el.classList.toggle('stuck', !!opts.stuck);
  el.classList.toggle('dead', !!opts.dead);
  el.classList.toggle('mini', !!opts.mini);
  el.classList.toggle('once', !!STONES[s.type]?.once);
  if (el.dataset.type !== s.type || !el.firstChild) {
    el.dataset.type = s.type;
    el.innerHTML = icon(s.type, 'glyph') + STAR + '<span class="tape"></span>';
  }
}

// Tap for one thing, hold for another: long press reads a stone without
// picking it up. The click that ends a long press is swallowed.
export function pressable(el, { tap, long }) {
  let timer = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', () => {
    fired = false; cancel();
    timer = setTimeout(() => { fired = true; timer = null; try { navigator.vibrate?.(12); } catch { /* no haptics */ } long(); }, 450);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, cancel);
  el.addEventListener('click', (e) => {
    if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); return; }
    tap?.(e);
  });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired) { cancel(); fired = true; long(); } });
  return el;
}

export function stoneName(s) { return STONES[s.type]?.name ?? s.type; }
export function stoneText(s) { return STONES[s.type]?.text ?? ''; }

let toastTimer = null;
let toastAt = 0;
// Clear a note left over from the last screen, but not one just raised for this one.
export function hideToast() { const el = document.getElementById('toast'); if (el && Date.now() - toastAt > 400) el.className = ''; }
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div'); el.id = 'toast'; document.body.append(el); }
  toastAt = Date.now();
  el.className = 'show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2200);
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

// A modal sheet. Returns a close function.
export function modal(content, { onClose, dismissable = true, cls = '' } = {}) {
  const back = h('div.modal-back');
  const sheet = h(`div.modal.${cls || 'plain'}`, {}, content);
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
function stoneDemo(s) {
  const st = STONES[s.type];
  const fresh = () => {
    const g = createGame({ handX: [s.type], first: 'X', log: false });
    let id = 50;
    for (const [i, p] of Object.entries(DEMO_BOARD)) g.board[+i] = { player: p, type: 'pebble', id: id++ };
    g.nextId = 100;
    return g;
  };
  try {
    if (st.restrict) {
      const g = fresh();
      applyAction(g, { type: 'select', stone: s.type });
      applyAction(g, { type: 'place', pos: 4 });
      if (g.phase === 'effect') applyAction(g, legalActions(g)[0]);
      g.phase = 'place';
      const ok = new Set(allowedSquares(g));
      const marks = {};
      for (let i = 0; i < 9; i++) if (!g.board[i]) marks[i] = ok.has(i) ? 'ok' : 'no';
      return h('div.demo', {}, demoBoard(g.board, marks), h('div.demo-cap', {}, t('Placed in the centre: the enemy may only use the marked squares.')));
    }
    if (!st.apply) return null;
    // The placement and choice that change the board the most.
    let best = null;
    for (const pos of [4, 0, 5, 7, 1]) {
      const g = fresh();
      if (g.board[pos]) continue;
      applyAction(g, { type: 'select', stone: s.type });
      // Before: the stone drawn where it lands, nothing done yet.
      const before = cloneState(g).board;
      before[pos] = { player: 'X', type: s.type, id: g.nextId };
      applyAction(g, { type: 'place', pos });
      const opts = g.phase === 'effect' ? legalActions(g) : [null];
      for (const o of opts) {
        const after = cloneState(g);
        if (o) applyAction(after, o);
        const same = (a, b) => (!a && !b) || (a && b && a.player === b.player && a.type === b.type);
        const moved = after.board.reduce((n, c, i) => n + (same(c, before[i]) ? 0 : 1), 0)
          + (after.hands.X.length !== g.hands.X.length || after.hands.O.length !== g.hands.O.length ? 2 : 0);
        if (!best || moved > best.moved) best = { moved, before, after: after.board, pos };
      }
    }
    if (!best || !best.moved) return null;
    return h('div.demo', {}, animatedDemo(best.before, best.after, best.pos));
  } catch { return null; }
}

// What "beside" and "around" mean, drawn: the four squares sharing a side, or all eight.
function reachDemo(st) {
  if (!st.reach || st.restrict) return null;   // a restriction's own demo shows it already
  const near = st.reach === 'around' ? touching : adjacent;
  const marks = {};
  for (let i = 0; i < 9; i++) marks[i] = i === 4 ? 'placed' : near(4, i) ? 'ok' : '';
  return h('div.demo.reach-demo', {}, demoBoard({ 4: { player: 'X', type: st.id } }, marks),
    h('div.demo-cap', {}, st.reach === 'around' ? t('Around: all eight squares, corners too.') : t('Beside: the four squares that share a side.')));
}

// The example played out on one small board, over and over: the stone lands,
// then every stone slides to where it ends up; what leaves fades, what is new
// appears, what changes side or kind turns.
const DEMO_CELL = 36, DEMO_STONE = 30;
function animatedDemo(before, after, pos) {
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
    cellAt(pos).classList.remove('placed');
    for (const [id, el] of els) {
      el.classList.add('still');
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
  const play = () => {
    for (const [id, el] of els) {
      const i = where(after, id);
      if (i < 0) { el.style.opacity = 0; el.style.scale = 0.4; continue; }
      const c = after[i];
      updateStone(el, c, c.player, { mini: true, stuck: !!c.stuck });
      el.style.translate = spot(i);
      el.style.opacity = 1; el.style.scale = 1;
    }
  };
  // One loop: still, land, act, hold. It stops once the card is closed.
  const loop = () => {
    if (!board.isConnected && board.dataset.started) return;
    board.dataset.started = '1';
    reset();
    setTimeout(land, 500);
    setTimeout(play, 1300);
    setTimeout(loop, 3800);
  };
  loop();
  return board;
}

export function infoStone(s, player = 'X', extra = '') {
  const st = STONES[s.type];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, stoneEl(s, player), h('div', {},
      h('div.info-name', {}, stoneName(s)),
      h('div.info-rarity.' + st.rarity, {}, st.once ? `${t('one-shot')} · ${t(st.rarity)}` : t(st.rarity)))),
    h('p', {}, stoneText(s)),
    reachDemo(st),
    stoneDemo(s),
    st.once ? h('p.info-plus', {}, t('One use: once played, it is gone from your pouch.')) : null,
    extra ? h('p.info-extra', {}, extra) : null,
    h('button.btn.wide', { onclick: () => close() }, t('OK')));
  const close = modal(body);
}

export function infoRelic(id) {
  const r = RELICS[id];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, h('div.relic-token', {}, relicArt(id)), h('div', {},
      h('div.info-name', {}, r.name), h('div.info-rarity.' + r.rarity, {}, t('relic') + ' · ' + t(r.rarity)))),
    h('p', {}, r.text),
    h('button.btn.wide', { onclick: () => close() }, t('OK')));
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
    h('button.btn.wide', { onclick: () => close() }, t('OK'))));
}
export function ruleChip(kind, id, cls = '') {
  const r = ruleOf(kind, id);
  return h(`button.rule-chip.${kind}${cls}`, { onclick: (e) => { e.stopPropagation(); infoRule(kind, id); } },
    h('span.chip-ico', { html: icon(`${kind}-${id}`) }), h('span', {}, r.name));
}

// A card for reward and shop screens.
// Cards are small: picture, name, price. Tap takes or buys; a long press reads.
export function stoneCard(s, { onclick, price, sold, dear, footer } = {}) {
  const st = STONES[s.type];
  return pressable(h(`button.card.stone-card.${st.rarity}${sold ? '.sold' : dear ? '.dear' : ''}`, { disabled: sold || undefined, 'aria-label': stoneName(s) },
    stoneEl(s, 'X'),
    h('div.card-name', {}, stoneName(s)),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null,
    footer ?? null), { tap: onclick, long: () => infoStone(s, 'X') });
}

export function relicCard(id, { onclick, price, sold, dear } = {}) {
  const r = RELICS[id];
  return pressable(h(`button.card.relic-card.${r.rarity}${sold ? '.sold' : dear ? '.dear' : ''}`, { disabled: sold || undefined, 'aria-label': r.name },
    h('div.relic-token', {}, relicArt(id)),
    h('div.card-name', {}, r.name),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null), { tap: onclick, long: () => infoRelic(id) });
}

// The EN · CS switch. Changing it reloads the page.
// EN / CS: the language in use underlined, a tap on the other switches.
export function langToggle() {
  return h('div.lang-toggle', { role: 'group', 'aria-label': 'Language / Jazyk' },
    LANGS.map((l, k) => [k ? h('span.sep', {}, '/') : null,
      h('button.lang' + (l === lang ? '.on' : ''), { onclick: () => setLang(l), 'aria-pressed': String(l === lang), lang: l }, l.toUpperCase())]));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
