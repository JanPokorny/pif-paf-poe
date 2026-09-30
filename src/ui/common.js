// Small DOM helpers shared by every screen.

import { STONES, TRICKS, FIELDS } from '../engine.js';
import { RELICS } from '../content.js';
import { icon } from '../icons.js';

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
    el.innerHTML = icon(s.type, 'glyph') + '<span class="badge-plus">+</span><span class="badge-lock">'
      + icon('lock') + '</span>';
  }
}

export function stoneName(s) { return (STONES[s.type]?.name ?? s.type) + (s.plus ? '+' : ''); }
export function stoneText(s) { const st = STONES[s.type]; return s.plus ? st.plusText : st.text; }

let toastTimer = null;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div#toast'); el.id = 'toast'; document.body.append(el); }
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

export function infoStone(s, player = 'X', extra = '') {
  const st = STONES[s.type];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, stoneEl(s, player), h('div', {},
      h('div.info-name', {}, stoneName(s)),
      h('div.info-rarity.' + st.rarity, {}, st.rarity))),
    h('p', {}, stoneText(s)),
    !s.plus && st.plusText ? h('p.info-plus', {}, h('b', {}, 'Upgraded: '), st.plusText) : null,
    extra ? h('p.info-extra', {}, extra) : null,
    h('button.btn.wide', { onclick: () => close() }, 'OK'));
  const close = modal(body);
}

export function infoTrick(name) {
  const t = TRICKS[name];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, h('div.trick-token', { html: icon(name) }), h('div', {},
      h('div.info-name', {}, t.name), h('div.info-rarity.' + t.rarity, {}, 'trick · ' + t.rarity))),
    h('p', {}, t.text),
    h('p.info-extra', {}, 'Tricks are spent at the end of your own turn, after your stone has done its thing. Each is used up once spent.'),
    h('button.btn.wide', { onclick: () => close() }, 'OK'));
  const close = modal(body);
}

export function infoRelic(id) {
  const r = RELICS[id];
  const body = h('div.info-stone', {},
    h('div.info-head', {}, h('div.relic-token', {}, r.emoji), h('div', {},
      h('div.info-name', {}, r.name), h('div.info-rarity.' + r.rarity, {}, 'relic · ' + r.rarity))),
    h('p', {}, r.text),
    h('button.btn.wide', { onclick: () => close() }, 'OK'));
  const close = modal(body);
}

export function infoField(field) {
  const f = FIELDS[field];
  const close = modal(h('div.info-stone', {}, h('div.info-name', {}, 'Boss rule: ' + f.name), h('p', {}, f.text),
    h('button.btn.wide', { onclick: () => close() }, 'OK')));
}

export function infoSpace(disabled) {
  const text = disabled
    ? `This duel is fought on a ${STONES[disabled].name} space: every ${STONES[disabled].name} stone, yours and theirs, is switched off. It is still placed and still counts towards a line — it just does nothing.`
    : 'A neutral space: every stone works.';
  const close = modal(h('div.info-stone', {}, h('div.info-name', {}, disabled ? `No ${STONES[disabled].name}` : 'Neutral space'), h('p', {}, text),
    h('button.btn.wide', { onclick: () => close() }, 'OK')));
}

// A card for reward and shop screens.
export function stoneCard(s, { onclick, price, sold, footer } = {}) {
  const st = STONES[s.type];
  return h(`button.card.stone-card.${st.rarity}${sold ? '.sold' : ''}`, { onclick, disabled: sold || undefined },
    stoneEl(s, 'X'),
    h('div.card-name', {}, stoneName(s)),
    h('div.card-text', {}, stoneText(s)),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null,
    footer ?? null);
}

export function trickCard(name, { onclick, price, sold } = {}) {
  const t = TRICKS[name];
  return h(`button.card.trick-card.${t.rarity}${sold ? '.sold' : ''}`, { onclick, disabled: sold || undefined },
    h('div.trick-token', { html: icon(name) }),
    h('div.card-name', {}, t.name),
    h('div.card-text', {}, t.text),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null);
}

export function relicCard(id, { onclick, price, sold } = {}) {
  const r = RELICS[id];
  return h(`button.card.relic-card.${r.rarity}${sold ? '.sold' : ''}`, { onclick, disabled: sold || undefined },
    h('div.relic-token', {}, r.emoji),
    h('div.card-name', {}, r.name),
    h('div.card-text', {}, r.text),
    price !== undefined ? h('div.price', {}, iconEl('coin'), price) : null);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
