// Small DOM helpers shared by every screen.

import { STONES, TRICKS, FIELDS, createGame, legalActions, applyAction, cloneState, allowedSquares } from '../engine.js';
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
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

// A hand-drawn star sticker for upgraded stones.
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
    title: STONES[s.type]?.name + (s.plus ? '+' : ''),
  });
  updateStone(el, s, player, opts);
  return el;
}

export function updateStone(el, s, player, opts = {}) {
  el.classList.remove('X', 'O');
  el.classList.add(player);
  el.classList.toggle('plus', !!s.plus);
  el.classList.toggle('stuck', !!opts.stuck);
  el.classList.toggle('dead', !!opts.dead);
  el.classList.toggle('mini', !!opts.mini);
  if (el.dataset.type !== s.type || !el.firstChild) {
    el.dataset.type = s.type;
    el.innerHTML = icon(s.type, 'glyph') + STAR + '<span class="tape"></span>';
  }
}

export function stoneName(s) { return (STONES[s.type]?.name ?? s.type) + (s.plus ? '+' : ''); }
export function stoneText(s) { const st = STONES[s.type]; return s.plus ? st.plusText : st.text; }

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

// A modal sheet. Returns a close function.
export function modal(content, { onClose, dismissable = true, cls = '' } = {}) {
  const back = h('div.modal-back');
  const sheet = h(`div.modal.${cls || 'plain'}`, {}, content);
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
    const g = createGame({ handX: [{ type: s.type, plus: s.plus }, { type: 'pebble', plus: false }], handO: ['pebble', 'pebble', 'pebble'], first: 'X', log: false });
    let id = 50;
    for (const [i, p] of Object.entries(DEMO_BOARD)) g.board[+i] = { player: p, type: 'pebble', plus: false, id: id++ };
    g.nextId = 100;
    return g;
  };
  try {
    if (st.restrict) {
      const g = fresh();
      applyAction(g, { type: 'select', stone: s.type, plus: s.plus });
      applyAction(g, { type: 'place', pos: 4 });
      if (g.phase === 'trick') applyAction(g, { type: 'trick', use: 'pass' });
      const ok = new Set(allowedSquares(g, { type: 'shift', plus: false }));
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
      applyAction(g, { type: 'select', stone: s.type, plus: s.plus });
      // Before: the stone drawn where it lands, nothing done yet.
      const before = cloneState(g).board;
      before[pos] = { player: 'X', type: s.type, plus: s.plus, id: 99 };
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
    return h('div.demo', {}, demoBoard(best.before, { [best.pos]: 'placed' }), h('div.demo-arrow', {}, '→'), demoBoard(best.after));
  } catch { return null; }
}

export function infoStone(s, player = 'X', extra = '') {
  const st = STONES[s.type];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, stoneEl(s, player), h('div', {},
      h('div.info-name', {}, stoneName(s)),
      h('div.info-rarity.' + st.rarity, {}, t(st.rarity)))),
    h('p', {}, stoneText(s)),
    stoneDemo(s),
    !s.plus && st.plusText ? h('p.info-plus', {}, h('b', {}, t('Upgraded: ')), st.plusText) : null,
    extra ? h('p.info-extra', {}, extra) : null,
    h('button.btn.wide', { onclick: () => close() }, t('OK')));
  const close = modal(body);
}

export function infoTrick(name) {
  const tr = TRICKS[name];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, h('div.trick-token', { html: icon(name) }), h('div', {},
      h('div.info-name', {}, tr.name), h('div.info-rarity.' + tr.rarity, {}, t('trick') + ' · ' + t(tr.rarity)))),
    h('p', {}, tr.text),
    h('p.info-extra', {}, t('Tricks are spent at the end of your own turn, after your stone has done its thing. Each is used up once spent.')),
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

export function infoField(field) {
  const f = FIELDS[field];
  const close = modal(h('div.info-stone', {}, h('div.info-name', {}, t('Boss rule: ') + f.name), h('p', {}, f.text),
    h('button.btn.wide', { onclick: () => close() }, t('OK'))));
}

export function infoSpace(disabled) {
  const stone = disabled && STONES[disabled].name;
  const text = disabled
    ? t('This duel is fought on a {stone} space: every {stone} stone, yours and theirs, is switched off. It is still placed and still counts towards a line — it just does nothing.', { stone })
    : t('A neutral space: every stone works.');
  const close = modal(h('div.info-stone', {}, h('div.info-name', {}, disabled ? t('No {stone}', { stone }) : t('Neutral space')), h('p', {}, text),
    h('button.btn.wide', { onclick: () => close() }, t('OK'))));
}

// A card for reward and shop screens.
export function stoneCard(s, { onclick, price, sold, footer } = {}) {
  const st = STONES[s.type];
  return h(`button.card.stone-card.${st.rarity}${sold ? '.sold' : ''}`, { onclick, disabled: sold || undefined },
    stoneEl(s, 'X'),
    h('div.card-name', {}, stoneName(s)),
    h('div.card-text', {}, stoneText(s)),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null,
    h('span.card-info', { role: 'button', 'aria-label': t('Example'), onclick: (e) => { e.stopPropagation(); infoStone(s, 'X'); } }, 'ⓘ'),
    footer ?? null);
}

export function trickCard(name, { onclick, price, sold } = {}) {
  const tr = TRICKS[name];
  return h(`button.card.trick-card.${tr.rarity}${sold ? '.sold' : ''}`, { onclick, disabled: sold || undefined },
    h('div.trick-token', { html: icon(name) }),
    h('div.card-name', {}, tr.name),
    h('div.card-text', {}, tr.text),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null);
}

export function relicCard(id, { onclick, price, sold } = {}) {
  const r = RELICS[id];
  return h(`button.card.relic-card.${r.rarity}${sold ? '.sold' : ''}`, { onclick, disabled: sold || undefined },
    h('div.relic-token', {}, relicArt(id)),
    h('div.card-name', {}, r.name),
    h('div.card-text', {}, r.text),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null);
}

// The EN · CS switch. Changing it reloads the page.
export function langToggle() {
  return h('div.lang-toggle', { role: 'group', 'aria-label': 'Language / Jazyk' },
    LANGS.map((l, k) => [k ? h('span.sep', {}, '·') : null,
      h('button.lang' + (l === lang ? '.on' : ''), { onclick: () => setLang(l), 'aria-pressed': String(l === lang), lang: l }, l.toUpperCase())]));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
