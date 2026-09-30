// Translation. English is the source language: every string in the code is the
// English one, and doubles as its key into the Czech dictionary (i18n-cs.js).
// The language changes only by reloading, so the game's data tables (stones,
// relics, enemies...) are translated in place once, at startup.
//
// Nothing here touches the browser at import time unguarded: the engine and
// run modules import this, and the tools run them in Node.

import CS, { CS_DATA } from './i18n-cs.js';

const KEY = 'ppp-lang';
export const LANGS = ['en', 'cs'];

function detect() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* blocked storage */ }
  try {
    if (/^cs\b/i.test(globalThis.navigator?.language ?? '')) return 'cs';
  } catch { /* no navigator */ }
  return 'en';
}

export const lang = detect();

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  try { localStorage.setItem(KEY, l); } catch { /* blocked storage */ }
  location.reload();
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// Czech has three count forms: 1, 2–4, and everything else (0, 5+).
const csForm = (n) => (n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2);

// The English string, or its Czech translation, with {placeholders} filled in.
export function t(en, vars) {
  const cs = lang === 'cs' ? CS[en] : undefined;
  if (Array.isArray(cs)) return fill(cs[csForm(vars?.n ?? 0)], vars);
  return fill(cs ?? en, vars);
}

// A count-dependent string: English picks `one` or `other` by n; the Czech
// entry for `other` is [1, 2–4, 5+]. {n} is filled in either way.
export function tp(n, one, other, vars = {}) {
  const v = { n, ...vars };
  if (lang === 'cs' && Array.isArray(CS[other])) return fill(CS[other][csForm(n)], v);
  return t(n === 1 ? one : other, v);
}

// Overwrite the player-facing fields of the game's data tables with their
// Czech versions. Tables keyed by id take a { id: fields } map; arrays (acts,
// heat, events) are matched by position, or by id when entries carry one.
export function localizeData(tables) {
  if (lang !== 'cs') return;
  for (const [name, table] of Object.entries(tables)) {
    const tr = CS_DATA[name];
    if (!tr) continue;
    const entries = Array.isArray(table) ? table.map((x, i) => [x.id ?? i, x]) : Object.entries(table);
    for (const [id, item] of entries) {
      const src = tr[id];
      if (!src) continue;
      for (const [field, value] of Object.entries(src)) {
        if (field === 'choices') src.choices.forEach((c, k) => { if (item.choices[k]) Object.assign(item.choices[k], c); });
        else item[field] = value;
      }
    }
  }
}
