// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, TRICKS, STONE_TYPES, TRICK_TYPES, createGame, FIELDS } from './engine.js';
import { RELICS, RELIC_TYPES, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, hideToast, art, relicArt, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, infoStone, infoTrick, infoRelic, infoSpace, infoField, stoneCard, trickCard, relicCard, stoneName, langToggle } from './ui/common.js';
import { icon } from './icons.js';
import { mountDuel } from './ui/duel.js';
import { sfx, soundOn, setSound } from './sound.js';
import { t, tp, lang, localizeData } from './i18n.js';

localizeData({
  stones: STONES, tricks: TRICKS, fields: FIELDS, relics: RELICS, enemies: ENEMIES, acts: ACTS, events: EVENTS,
  kits: R.KITS, heat: R.HEAT, quirks: R.QUIRKS,
});
document.documentElement.lang = lang;

// The short name under an enemy's face on the map.
const shortName = (e) => e.short ?? e.name.replace(/^(The|Captain) /, '');

const app = document.getElementById('app');
const SAVE = 'ppp-run-v1';
const META = 'ppp-meta-v1';

let run = null;
let duelState = null;   // the engine state of a duel in progress, saved with the run
let duelView = null;
let flash = null;       // 'hurt' or 'heal': the hearts on the next top bar react

// ── Persistence ─────────────────────────────────────────────────────────────

function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full or blocked */ } }

function save() {
  if (!run) return;
  if (run.over) { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } return; }
  saveJSON(SAVE, { run, duel: duelState });
}

const meta = Object.assign({ runs: 0, wins: 0, best: null, heat: 0, maxHeat: 0, seenHelp: false, bestHeatWon: -1 }, loadJSON(META) ?? {});
const saveMeta = () => saveJSON(META, meta);

function recordEnd() {
  if (run.recorded) return;
  run.recorded = true;
  meta.runs++;
  const reached = { act: run.act, row: run.map ? R.xCount(run) : 0, victory: run.victory };
  const score = (r) => (r ? (r.victory ? 100 : 0) + r.act * 10 + r.row : -1);
  if (score(reached) > score(meta.best)) meta.best = reached;
  meta.bestAct = Math.max(meta.bestAct ?? 0, run.act);
  if (run.daily) {
    meta.daily = { ...(meta.daily ?? {}) };
    meta.daily[run.daily] = run.victory ? 'conquered the Summit' : `fell in act ${run.act}`;
  }
  if (run.victory) {
    meta.wins++;
    meta.bestHeatWon = Math.max(meta.bestHeatWon, run.heat);
    meta.maxHeat = Math.min(R.HEAT.length - 1, Math.max(meta.maxHeat, run.heat + 1));
  }
  saveMeta();
}

// ── Chrome ──────────────────────────────────────────────────────────────────

function topBar() {
  const hearts = h('div.hearts' + (flash ? '.' + flash : ''), {},
    h('span', { html: icon('heart') }), `${run.hearts}/${run.maxHearts}`);
  flash = null;
  return h('div.topbar', {},
    hearts,
    h('div.gold', {}, h('span', { html: icon('coin') }), run.gold),
    h('div.where', {}, t('Act {n} · {name}', { n: run.act, name: ACTS[run.act - 1].name.replace(/^The /, '') })),
    h('button.icon-btn', { onclick: showPouch, 'aria-label': t('Your pouch') }, h('span', { html: icon('hand') })),
    h('button.icon-btn', { onclick: showMenu, 'aria-label': t('Menu') }, h('span', { html: icon('gear') })));
}

function screen(...children) {
  hideToast();
  const el = h('div.screen', {}, ...children);
  app.replaceChildren(el);
  app.scrollTop = 0;
  window.scrollTo(0, 0);
  return el;
}

function relicStrip() {
  if (!run.relics.length) return null;
  return h('div.relic-strip', {}, run.relics.map((r) => h('button.relic-mini', { onclick: () => infoRelic(r), title: RELICS[r].name }, relicArt(r))));
}

function showPouch() {
  const body = h('div.pouch-view', {},
    h('h2', {}, t('Pouch · {n}/{cap}', { n: run.pouch.length, cap: R.pouchCap(run) })),
    h('div.stone-grid', {}, run.pouch.map((s) => h('button.pouch-slot', { onclick: () => infoStone(s, 'X') }, stoneEl(s, 'X'), h('span', {}, stoneName(s))))),
    h('h2', {}, t('Tricks · {n}/{cap}', { n: run.tricks.length, cap: R.trickCap(run) })),
    run.tricks.length ? h('div.trick-list', {}, run.tricks.map((x) => h('button.trick-btn', { onclick: () => infoTrick(x) }, h('span.trick-ico', { html: icon(x) }), TRICKS[x].name))) : h('p.dim', {}, t('No tricks.')),
    h('h2', {}, t('Relics')),
    run.relics.length ? h('div.relic-list', {}, run.relics.map((r) => h('button.relic-row', { onclick: () => infoRelic(r) }, h('span.relic-token.small', {}, relicArt(r)), h('span', {}, h('b', {}, RELICS[r].name), h('br'), RELICS[r].text)))) : h('p.dim', {}, t('No relics yet.')),
    h('p.dim', {}, t('You bring {n} stones into each duel and may spend {tricks} per duel.', { n: R.handSize(run), tricks: tp(R.trickUses(run), '{n} trick', '{n} tricks') })),
    h('button.btn.wide', { onclick: () => close() }, t('Close')));
  const close = modal(body, { cls: 'tall' });
}

function showMenu() {
  const body = h('div.menu', {},
    h('h2', {}, t('Menu')),
    h('button.btn.wide', { onclick: () => { close(); showHelp(); } }, t('How to play')),
    h('button.btn.wide', { onclick: () => { close(); showCodex(); } }, t('Codex')),
    soundButton(() => close()),
    h('button.btn.wide', { onclick: () => { close(); title(); } }, t('Save & quit to title')),
    h('button.btn.wide.danger', {
      onclick: () => {
        if (!confirm(t('Abandon this run? It will count as a loss.'))) return;
        close();
        run.over = true; recordEnd(); duelState = null; save(); run = null; title();
      },
    }, t('Abandon run')),
    langToggle(),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Back')));
  const close = modal(body);
}

function soundButton(close) {
  let fast = false;
  try { fast = localStorage.getItem('ppp-fast') === 'on'; } catch { /* ignore */ }
  return [
    h('button.btn.wide', { onclick: () => { setSound(!soundOn()); close(); toast(soundOn() ? t('Sound on') : t('Sound off')); } }, soundOn() ? t('Sound: on') : t('Sound: off')),
    h('button.btn.wide', { onclick: () => { try { localStorage.setItem('ppp-fast', fast ? 'off' : 'on'); } catch { /* ignore */ } close(); } }, fast ? t('Enemy speed: fast') : t('Enemy speed: normal')),
  ];
}

// A daily result is saved in English; say it in the current language.
const dailyText = (r) => (/^fell in act (\d+)$/.test(r ?? '') ? t('fell in act {n}', { n: RegExp.$1 }) : t(r));

// ── Title ───────────────────────────────────────────────────────────────────

function title() {
  duelView?.destroy();
  duelView = null;
  const saved = loadJSON(SAVE);
  const best = meta.best
    ? (meta.best.victory
      ? (meta.bestHeatWon > 0 ? t('Best: conquered the Summit at heat {n}', { n: meta.bestHeatWon }) : t('Best: conquered the Summit'))
      : t('Best: reached act {n}', { n: meta.best.act }))
    : t('Tic-tac-toe where the pieces move.');
  screen(
    h('div.title', {},
      h('div.logo', {},
        h('div.doodle-board', {},
          h('div.board-lines', { html: '<svg viewBox="0 0 300 300" aria-hidden="true"><path d="M101 8 C 98 90, 104 190, 99 292"/><path d="M200 6 C 203 100, 197 200, 202 293"/><path d="M7 100 C 90 97, 200 104, 294 99"/><path d="M8 201 C 100 204, 190 197, 293 202"/></svg>' }),
          [[0, 'x'], [4, 'x'], [2, 'o'], [6, 'o'], [8, 'x']].map(([i, m], k) => {
            const el = h('div.mark', { style: { left: `${(i % 3) * 33.3}%`, top: `${((i / 3) | 0) * 33.3}%` }, html: m === 'x' ? scribbleX(true) : scribbleO(true) });
            el.querySelectorAll('path').forEach((p) => { p.style.animationDelay = `${0.2 + k * 0.45 + (p.classList.contains('second') ? 0.2 : 0)}s`; });
            return el;
          })),
        h('h1', {}, h('span.x', {}, 'Pif'), '·Paf·', h('span.o', {}, 'Poe')),
        h('div.subtitle', {}, t('a roguelike of moving stones'))),
      h('div.title-buttons', {},
        saved?.run && !saved.run.over ? h('button.btn.primary.wide.big.continue', { onclick: () => { run = saved.run; duelState = saved.duel; route(); } },
          h('span', {}, t('Continue run')),
          h('span.continue-sub', {}, `${R.KITS[saved.run.kit]?.name ?? ''} · ${t('Act {n}', { n: saved.run.act })} · ❤ ${saved.run.hearts}`)) : null,
        h('button.btn.wide.big' + (saved?.run ? '' : '.primary'), { onclick: () => { if (saved?.run && !saved.run.over && !confirm(t('Start over? Your run in progress will be lost.'))) return; chooseKit(); } }, t('New run')),
        h('button.btn.wide', { onclick: startDaily }, `${t('Daily climb')}${meta.daily?.[today()] ? ' ✓' : ''}`),
        h('button.btn.wide', { onclick: practiceMenu }, t('Practice duel')),
        h('button.btn.wide', { onclick: () => showHelp() }, t('How to play')),
        h('button.btn.wide', { onclick: showCodex }, t('Codex')),
        h('button.btn.wide.ghost', { onclick: () => { setSound(!soundOn()); title(); } }, h('span', { html: icon(soundOn() ? 'sound-on' : 'sound-off') }), soundOn() ? t('Sound on') : t('Sound off'))),
      h('div.title-foot', {}, best, h('br'), `${tp(meta.runs, '{n} run', '{n} runs')} · ${tp(meta.wins, '{n} win', '{n} wins')}`),
      langToggle()));
}

const today = () => new Date().toISOString().slice(0, 10);

// Everyone gets the same seed and kit on the same day.
function startDaily() {
  const d = today();
  const seed = [...d].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) | 0, 7);
  const kits = Object.keys(R.KITS).filter((k) => !R.KITS[k].unlock);
  const kit = kits[Math.abs(seed) % kits.length];
  const go = () => {
    run = R.newRun({ kit, seed: Math.abs(seed), heat: 0 });
    run.daily = d;
    duelState = null;
    save();
    route();
  };
  const body = h('div.menu', {}, h('h2', {}, `${t('Daily climb')} · ${d}`),
    h('p', {}, t('Today everyone climbs the same mountain as {kit}. Same maps, same enemies, same loot.', { kit: R.KITS[kit].name })),
    meta.daily?.[d] ? h('p.dim', {}, t('Your result today: {r}', { r: dailyText(meta.daily[d]) })) : null,
    h('button.btn.primary.wide', { onclick: () => { const sv = loadJSON(SAVE); if (sv?.run && !sv.run.over && !confirm(t('Start the daily climb? Your run in progress will be lost.'))) return; close(); go(); } }, t('Climb')),
    h('button.btn.ghost.wide', { onclick: () => close() }, t('Back')));
  const close = modal(body);
}

const UNLOCK_TEXT = {
  win: 'Locked — win a run to unlock',
  summit: 'Locked — reach the Summit to unlock',
  heat: 'Locked — win at heat 1 or more to unlock',
};
function kitOpen(k) {
  if (!k.unlock) return true;
  if (k.unlock === 'win') return meta.wins > 0;
  if (k.unlock === 'summit') return (meta.bestAct ?? 0) >= 3 || meta.wins > 0;
  if (k.unlock === 'heat') return meta.bestHeatWon >= 1;
  return false;
}

function chooseKit() {
  let heat = Math.min(meta.heat ?? 0, meta.maxHeat);
  const heatRow = h('div.heat-row');
  const drawHeat = () => {
    heatRow.replaceChildren(
      h('div.heat-label', {}, t('Heat {n}', { n: heat }), h('span.dim', {}, ' — ' + (heat ? R.HEAT.slice(1, heat + 1).map((x) => x.text).join(' ') : R.HEAT[0].text))),
      h('div.heat-btns', {},
        h('button.btn.small', { onclick: () => { if (heat > 0) { heat--; drawHeat(); } } }, '−'),
        h('button.btn.small', { onclick: () => { if (heat < meta.maxHeat) { heat++; drawHeat(); } else toast(t('Win a run to unlock more heat.')); } }, '+')));
  };
  drawHeat();
  const shownAt = Date.now();
  screen(
    h('div.page', {},
      h('div.page-head', {}, h('button.icon-btn', { onclick: title, html: icon('back'), 'aria-label': t('Back') }), h('h2', {}, t('Choose your kit'))),
      meta.maxHeat > 0 ? heatRow : null,
      h('div.kits', {}, Object.entries(R.KITS).map(([id, k]) => {
        const locked = !kitOpen(k);
        return h('button.kit' + (locked ? '.locked' : ''), {
          onclick: () => {
            if (Date.now() - shownAt < 450) return;   // the tap that opened this screen
            if (locked) { toast(t(UNLOCK_TEXT[k.unlock])); return; }
            meta.heat = heat; saveMeta();
            run = R.newRun({ kit: id, heat });
            duelState = null;
            save();
            route();
          },
        },
        h('div.kit-head', {}, h('span.kit-emoji', {}, art('kit', id, k.emoji)), h('div', {}, h('div.kit-name', {}, k.name), h('div.kit-text', {}, k.text))),
        h('div.kit-stones', {}, k.pouch.map((x) => stoneEl({ type: x }, 'X', { mini: true })),
          k.tricks.map((x) => h('span.mini-trick', { html: icon(x) }))),
        h('div.kit-stats', {}, `❤ ${k.hearts - (heat >= 3 ? 1 : 0)}  ·  ${t('{n} gold', { n: k.gold })}${k.relics ? '  ·  ' + k.relics.map((r) => RELICS[r].name).join(', ') : ''}`),
        locked ? h('div.kit-lock', {}, t(UNLOCK_TEXT[k.unlock])) : null);
      }))));
}

// ── Practice: one duel, nothing at stake ────────────────────────────────────

function practiceMenu() {
  const body = h('div.menu', {}, h('h2', {}, t('Practice duel')),
    h('p', {}, t('One duel with a random hand, against an enemy from the act you pick. Nothing is at stake.')),
    ACTS.map((a) => h('button.btn.wide', { onclick: () => { close(); practice(a.n); } }, `${a.name} — ${t(['gentle', 'tricky', 'tough'][a.n - 1])}`)),
    h('button.btn.ghost.wide', { onclick: () => close() }, t('Back')));
  const close = modal(body);
}

function practice(act) {
  duelView?.destroy();
  const fake = R.newRun({ seed: (Math.random() * 2 ** 31) | 0 });
  fake.act = act;
  const pool = Object.keys(ENEMIES).filter((k) => ENEMIES[k].act === act && ENEMIES[k].tier === 'normal');
  const id = pool[(R.rand(fake) * pool.length) | 0];
  const duel = R.prepareDuel(fake, id);
  const handX = Array.from({ length: 5 }, () => R.randomStone(fake));
  const state = createGame({ ...R.gameConfig(fake, duel, []), handX, tricksX: [R.randomTrick(fake)] });
  const enemy = { ...ENEMIES[id], iters: duel.iters, blunder: duel.blunder, tier: 'normal' };
  const holder = screen(h('div.duel-host'));
  const extra = h('div.duel-side', {},
    h('button.icon-btn.small', { onclick: () => { duelView?.destroy(); title(); }, 'aria-label': t('Quit') }, h('span', { html: icon('close') })),
    h('div.small.dim', {}, t('practice')));
  duelView = mountDuel(holder.querySelector('.duel-host'), {
    state, enemy, extra,
    onEnd: () => {
      const close = modal(h('div.menu', {}, h('h2', {}, t('Another one?')),
        h('button.btn.primary.wide', { onclick: () => { close(); practice(act); } }, t('Again')),
        h('button.btn.wide', { onclick: () => { close(); title(); } }, t('Title'))), { dismissable: false });
    },
  });
}

// ── Router ──────────────────────────────────────────────────────────────────

function route() {
  duelView?.destroy();
  duelView = null;
  save();
  switch (run.screen) {
    case 'map': return mapScreen();
    case 'actintro': return actIntro();
    case 'predual': return duelState ? duelScreen() : preDuel();
    case 'duel': return duelState ? duelScreen() : preDuel();
    case 'reward': return rewardScreen();
    case 'shop': return shopScreen();
    case 'rest': return restScreen();
    case 'treasure': return treasureScreen();
    case 'event': return eventScreen();
    case 'gameover': return endScreen(false);
    case 'victory': return endScreen(true);
    default: run.screen = 'map'; return mapScreen();
  }
}

// ── Map ─────────────────────────────────────────────────────────────────────

const NODE_ICON = { fight: 'sword', elite: 'skull', shop: 'shop', rest: 'fire', event: 'question', treasure: 'chest', boss: 'crown' };
const NODE_NAME = { fight: t('Duel'), elite: t('Elite'), shop: t('Shop'), rest: t('Campfire'), event: t('Unknown'), treasure: t('Treasure'), boss: t('Boss') };
const NODE_TEXT = {
  fight: t('A duel. Win for gold and a new stone; lose and it costs a heart — and the boss takes the square.'),
  elite: t('A tough duel. Win for a relic; lose and it costs 2 hearts.'),
  shop: t('Stones, tricks, relics and services, for gold.'),
  rest: t('Heal, or upgrade a stone.'),
  event: t('Something happens. Who knows what.'),
  treasure: t('A relic and some gold, free.'),
};

// The act's map is a game of tic-tac-toe against its boss, on a 4x4 grid.
function mapScreen() {
  const map = run.map;
  const reach = new Set(R.reachable(run));
  const boss = ENEMIES[map.boss];
  const lines = `<svg viewBox="0 0 400 400" preserveAspectRatio="none" aria-hidden="true">
    <path d="M101 6 C 98 120, 104 260, 99 394"/><path d="M200 4 C 203 130, 197 270, 201 396"/><path d="M300 7 C 297 140, 303 250, 299 393"/>
    <path d="M5 100 C 130 97, 260 104, 395 99"/><path d="M4 201 C 140 204, 260 197, 396 202"/><path d="M6 299 C 120 302, 270 296, 394 301"/></svg>`;
  const freshX = map.freshX;
  const cells = map.cells.map((c, i) => {
    const can = reach.has(String(i));
    const el = h(`button.map-cell.${c.kind}` + (can ? '.reach' : '') + (c.mark ? '.marked' : ''), {
      'aria-label': NODE_NAME[c.kind],
      onclick: () => {
        if (!can) {
          const why = c.mark === 'X' ? t('You have been here.') : c.mark === 'O' ? t('{boss} took this square.', { boss: boss.name }) : t('Too far: go next to one of your Xs.');
          const what = c.duel ? `${ENEMIES[c.duel.enemyId].name}${c.kind === 'elite' ? ` (${t('elite')}${c.duel.quirk ? ', ' + R.QUIRKS[c.duel.quirk].name.toLowerCase() : ''})` : ''}${c.duel.disabled ? t(', no {stone}', { stone: STONES[c.duel.disabled].name }) : ''}` : NODE_NAME[c.kind];
          toast(`${what} — ${c.mark ? why : NODE_TEXT[c.kind] + ' ' + why}`);
          return;
        }
        sfx('click');
        R.enterNode(run, String(i));
        duelState = null;
        route();
      },
    }, c.duel
      ? h('span.doodle.foe', {}, h('span.photo', {}, ENEMIES[c.duel.enemyId].emoji),
        c.duel.disabled ? h('span.cell-space', { html: icon(c.duel.disabled) }) : null)
      : h('span.doodle', { html: icon(NODE_ICON[c.kind]) }),
    h('span.label', {}, c.duel ? shortName(ENEMIES[c.duel.enemyId]) : NODE_NAME[c.kind]));
    if (!c.mark && R.MAP_LINES.some((l) => l.includes(i) && l.filter((j) => map.cells[j].mark === 'O').length === 2 && l.every((j) => j === i || map.cells[j].mark === 'O'))) el.classList.add('boss-threat');
    if (c.mark === 'X') el.insertAdjacentHTML('beforeend', scribbleX(freshX === i));
    if (c.mark === 'O') el.insertAdjacentHTML('beforeend', scribbleO(map.lastO === i));
    return el;
  });
  if (freshX !== null && freshX !== undefined) sfx('scribbleX');
  if (map.lastO !== null && map.lastO !== undefined) sfx('scribbleO');
  const threatened = cells.some((c) => c.classList.contains('boss-threat'));
  map.freshX = null;
  const lastO = map.lastO;
  map.lastO = null;
  const news = map.news === 'oline' ? t('{boss} drew three in a row — it grows stronger!', { boss: boss.name })
    : map.news === 'boxed' ? t('Boxed in! The door opens, but {boss} grows stronger.', { boss: boss.name })
    : lastO !== null && lastO !== undefined ? t('{boss} marks the {node} square.', { boss: boss.name, node: NODE_NAME[map.cells[lastO].kind].toLowerCase() }) : '';
  map.news = null;
  const door = h('button.boss-door' + (map.open ? '.open' : ''), {
    onclick: () => {
      if (!map.open) { toast(t('Draw three Xs in a row — across, down or diagonal — to open the door.')); return; }
      R.enterNode(run, 'boss'); duelState = null; route();
    },
  },
  h('div.portrait', {}, h('div.photo', {}, boss.emoji)),
  h('div.door-text', {},
    h('div.door-name', {}, boss.name),
    map.open ? h('div', {}, t('The door is open. Tap to face the boss — or keep exploring.')) : h('div', {}, t('Draw three in a row to open the door.')),
    map.power ? h('div.power', {}, tp(map.power, 'Power +{n}: one of its stones is upgraded, and it thinks harder.', 'Power +{n}: {n} of its stones are upgraded, and it thinks harder.')) : null));
  const el = screen(topBar(), relicStrip(),
    h('div.map-page', {},
      door,
      h('div.map-grid' + (R.xCount(run) ? '' : '.first'), {}, h('div.board-lines', { html: lines }), h('div.map-cells', {}, cells)),
      h('div.map-news', {}, news),
      h('div.map-help', {}, !R.xCount(run)
        ? t('Pick any square to start. You mark X where you go; after each step the boss marks an O. Next time, go beside one of your Xs — diagonals count.')
        : reach.size > (map.open ? 1 : 0) ? t('Go to a highlighted square next to one of your Xs — diagonals count.')
          : t('No open squares left beside your Xs. Face the boss!')),
      threatened ? h('div.map-help.red', {}, t('Dashed red circle: the boss would finish a line of Os there.')) : null));
  void el;
}

function actIntro() {
  const act = ACTS[run.act - 1];
  screen(h('div.act-intro', {},
    h('div.act-n', {}, t('Act {n}', { n: act.n })),
    h('h1', {}, act.name),
    h('p', {}, t(['A summer camp. A field of stones that will not stay still.', 'The meadow is behind you. The ground turns to stone.', 'The air thins. Only the best players make it this far.'][act.n - 1])),
    h('div.rules-note', {}, t('This act is a game of tic-tac-toe against {boss} {emoji}. Each square is an encounter: clear it and mark your X. After each of your steps, the boss marks an O. Draw three in a row to open its door.', { boss: ENEMIES[run.map.boss].name, emoji: '' })),
    h('button.btn.primary.wide.big', { onclick: () => { run.screen = 'map'; route(); } }, t('Onward'))));
}

// ── Before a duel: see the enemy, choose your stones ────────────────────────

function preDuel() {
  const duel = run.pending.duel;
  const enemy = ENEMIES[duel.enemyId];
  const size = R.handSize(run);
  let chosen = R.defaultHand(run, duel.disabled);
  const grid = h('div.stone-grid.pick');
  const count = h('span.count');
  const fight = h('button.btn.primary.wide.big', { onclick: begin }, t('Fight!'));
  const draw = () => {
    grid.replaceChildren(...run.pouch.map((s) => {
      const on = chosen.includes(s.uid);
      const dead = duel.disabled === s.type && !R.has(run, 'home-turf');
      return h('button.pouch-slot' + (on ? '.on' : ''), {
        onclick: () => {
          if (on) chosen = chosen.filter((u) => u !== s.uid);
          else if (chosen.length < size) chosen.push(s.uid);
          else { toast(t('You can bring {n}. Tap one to leave it behind.', { n: size })); return; }
          sfx('click');
          draw();
        },
        oncontextmenu: (e) => { e.preventDefault(); infoStone(s, 'X'); },
      }, stoneEl({ ...s, plus: s.plus || R.autoUpgraded(run, s.type) }, 'X', { dead }), h('span', {}, stoneName(s)),
      h('span.slot-info', { onclick: (e) => { e.stopPropagation(); infoStone(s, 'X'); } }, 'ⓘ'));
    }));
    const need = Math.min(size, run.pouch.length);
    count.textContent = `${chosen.length}/${size}`;
    fight.disabled = chosen.length < need;
    fight.textContent = chosen.length < need ? t('Pick {n} more', { n: need - chosen.length }) : t('Fight!');
  };
  draw();

  const tierLabel = { normal: '', elite: t('Elite'), boss: t('Boss'), event: t('Challenge') }[duel.tier];
  const stakes = duel.tier === 'boss'
    ? t('Beat it twice to pass ({n}/2). Each loss costs 1 ❤.', { n: duel.bossWins })
    : t(duel.event ? 'Lose and it costs {n} ❤.' : 'Lose and it costs {n} ❤ — and the boss takes this square.', { n: R.heartsLost(duel) });
  const canBack = (duel.tier === 'normal' || duel.tier === 'elite') && !duel.event;
  screen(topBar(),
    h('div.page', {},
      canBack ? h('button.btn.ghost.small.back-map', { onclick: () => { R.retreat(run); route(); } }, h('span', { html: icon('back') }), t('Back to the map')) : null,
      h('div.enemy-card.' + duel.tier, {},
        h('div.portrait.big', {}, h('div.photo', {}, enemy.emoji)),
        h('div', {},
          tierLabel ? h('div.tier.' + duel.tier, {}, tierLabel) : null,
          h('div.enemy-name.big', {}, enemy.name),
          h('div.quote', {}, t('“{quote}”', { quote: enemy.quote })))),
      h('div.section-label', {}, t('Their stones')),
      h('div.hand.enemy-hand.show', {}, duel.handO.map((s) => h('button.slot-plain', { onclick: () => infoStone(s, 'O') }, stoneEl(s, 'O', { dead: duel.disabled === s.type && !duel.modsO.homeTurf })))),
      duel.tricksO.length ? h('div.enemy-tricks-pre', {}, t('Tricks: '), duel.tricksO.map((x) => h('button.link', { onclick: () => infoTrick(x) }, TRICKS[x].name))) : null,
      h('div.duel-facts.facts-card', {},
        h('button.fact', { onclick: () => infoSpace(duel.disabled) },
          duel.disabled ? h('span.chip-ico.crossed', { html: icon(duel.disabled) }) : '',
          ' ' + (duel.disabled ? t('No {stone} here', { stone: STONES[duel.disabled].name }) : t('Neutral space'))),
        h('div.fact', {}, duel.first === 'X' ? t('You open') : t('{enemy} opens — a full board goes to you', { enemy: enemy.name })),
        duel.quirk ? h('div.fact.warn', {}, `${R.QUIRKS[duel.quirk].name}: ${R.QUIRKS[duel.quirk].text}`) : null,
        duel.field ? h('button.fact.warn', { onclick: () => infoField(duel.field) }, `${FIELDS[duel.field].name}: ${FIELDS[duel.field].text}`) : null,
        h('div.fact.dim', {}, stakes)),
      h('div.section-label', {}, t('Bring your stones '), count),
      grid,
      run.tricks.length ? h('div.dim.small', {}, t('Tricks: ') + run.tricks.map((x) => TRICKS[x].name).join(', ')) : null,
      h('div.pre-spacer'),
      h('div.sticky-bottom', {}, fight)));

  function begin() {
    run.lastHand = chosen.slice();
    const cfg = R.gameConfig(run, duel, chosen);
    duelState = createGame(cfg);
    run.screen = 'duel';
    save();
    duelScreen();
  }
}

function duelScreen() {
  const duel = run.pending.duel;
  const enemy = { ...ENEMIES[duel.enemyId], iters: duel.iters, blunder: duel.blunder, tier: duel.tier };
  const holder = screen(h('div.duel-host'));
  const extra = h('div.duel-side', {},
    h('button.icon-btn.small', { onclick: showDuelMenu, 'aria-label': t('Menu') }, h('span', { html: icon('gear') })),
    h('div.hearts.small', {}, h('span', { html: icon('heart') }), `${run.hearts}`),
    duel.tier === 'boss' ? h('div.boss-score', {}, `${duel.bossWins}/2`) : null);
  duelView = mountDuel(holder.querySelector('.duel-host'), {
    state: duelState, enemy, extra,
    onSave: (s) => { duelState = s; save(); },
    onEnd: (winner) => {
      // Tricks spent in the duel are gone from the run.
      run.tricks = [...duelState.tricks.X].filter((x) => TRICKS[x]);
      duelState = null;
      if (winner === 'X') {
        const res = R.duelWon(run);
        if (res.kind === 'boss-continue') toast(t('One down. It rises again!'));
      } else {
        const res = R.duelLost(run);
        if (res.kind === 'rematch') toast(t('🎟️ {relic}: try again!', { relic: RELICS.rematch.name }));
        else if (res.kind === 'dead') { /* recorded by the end screen */ }
        else if (res.kind === 'lost') { toast(`−${R.heartsLost(duel)} ❤`, 'bad'); flash = 'hurt'; }
        else if (res.kind === 'boss-retry') { toast(t('−1 ❤. Again!'), 'bad'); flash = 'hurt'; }
      }
      route();
    },
  });
}

function showDuelMenu() {
  const body = h('div.menu', {},
    h('h2', {}, t('Paused')),
    h('button.btn.wide', { onclick: () => { close(); showHelp(); } }, t('How to play')),
    h('button.btn.wide', { onclick: () => { close(); showCodex(); } }, t('Codex')),
    h('button.btn.wide', { onclick: () => { close(); showPouch(); } }, t('Pouch & relics')),
    soundButton(() => close()),
    h('button.btn.wide', { onclick: () => { close(); title(); } }, t('Save & quit to title')),
    langToggle(),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Resume')));
  const close = modal(body);
}

// ── Rewards ─────────────────────────────────────────────────────────────────

// Take a stone into the pouch, asking what to drop if it is full.
function takeStone(s, done) {
  if (!R.pouchFull(run)) { R.gainStone(run, s); sfx('coin'); done(true); return; }
  pickFromPouch(t('Your pouch is full. Drop a stone to take the {stone}?', { stone: stoneName(s) }), (victim) => {
    if (!victim) { done(false); return; }
    run.pouch = run.pouch.filter((p) => p.uid !== victim.uid);
    R.gainStone(run, s);
    done(true);
  }, { cancel: t('Keep my pouch') });
}

function takeTrick(tr, done) {
  if (!R.tricksFull(run)) { run.tricks.push(tr); done(true); return; }
  const body = h('div.menu', {}, h('h2', {}, t('Too many tricks')), h('p', {}, t('Drop one to take {trick}?', { trick: TRICKS[tr].name })),
    run.tricks.map((x, k) => h('button.btn.wide', { onclick: () => { run.tricks.splice(k, 1); run.tricks.push(tr); close(); done(true); } }, t('Drop {trick}', { trick: TRICKS[x].name }))),
    h('button.btn.wide.ghost', { onclick: () => { close(); done(false); } }, t('Keep mine')));
  const close = modal(body, { dismissable: false });
}

// `upgrade` marks a pick for upgrading: each stone shows what its + does.
function pickFromPouch(prompt, cb, { filter = () => true, cancel = t('Cancel'), upgrade = false } = {}) {
  const list = run.pouch.filter(filter);
  const body = h('div.pouch-view', {}, h('h2', {}, prompt),
    list.length ? h('div.stone-grid' + (upgrade ? '.upgrades' : ''), {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(s, 'X'), h('span', {}, stoneName(s)),
      upgrade ? h('span.plus-note', {}, '+ ' + STONES[s.type].plusText) : null)))
      : h('p.dim', {}, t('Nothing to choose.')),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

function rewardScreen() {
  const rw = run.pending;
  const done = () => { R.leaveNode(run); route(); };
  const parts = [h('h1.reward-title', {}, rw.tier === 'boss' ? t('Boss defeated!') : t('Victory!'))];
  parts.push(h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: rw.gold })));
  if (rw.relic && !rw.taken.relic) {
    R.gainRelic(run, rw.relic);
    rw.taken.relic = true;
    save();
  }
  if (rw.relic) parts.push(h('div.section-label', {}, t('Relic found')), relicCard(rw.relic, { onclick: () => infoRelic(rw.relic) }));
  if (rw.relicChoice?.length && !rw.taken.boss) {
    parts.push(h('div.section-label', {}, t('Choose a boss relic')),
      h('div.cards', {}, rw.relicChoice.map((id) => relicCard(id, {
        onclick: () => { R.gainRelic(run, id); rw.taken.boss = id; sfx('coin'); save(); rewardScreen(); },
      }))));
  } else if (rw.taken.boss) parts.push(h('div.section-label', {}, t('Boss relic')), relicCard(rw.taken.boss, { onclick: () => infoRelic(rw.taken.boss) }));
  if (rw.trick && !rw.taken.trick) {
    parts.push(h('div.section-label', {}, t('A trick')), h('div.cards.one', {}, trickCard(rw.trick, {
      onclick: () => takeTrick(rw.trick, (ok) => { if (ok) { rw.taken.trick = true; sfx('coin'); save(); rewardScreen(); } }),
    })));
  }
  if (rw.stones.length && !rw.taken.stone) {
    parts.push(h('div.section-label', {}, t('Take a stone')),
      h('div.cards', {}, rw.stones.map((s) => stoneCard(s, {
        onclick: (e) => {
          const card = e.currentTarget;
          takeStone(s, (ok) => {
            if (!ok) return;
            rw.taken.stone = true;
            save();
            card.classList.add('taken');
            setTimeout(() => { if (run?.pending === rw) rewardScreen(); }, 420);
          });
        },
      }))));
  }
  const pendingBoss = rw.relicChoice?.length && !rw.taken.boss;
  parts.push(h('div.sticky-bottom', {}, h('button.btn.wide.big' + (pendingBoss ? '' : '.primary'), {
    onclick: () => { if (pendingBoss && !confirm(t('Leave without a boss relic?'))) return; done(); },
  }, (rw.stones.length && !rw.taken.stone) || (rw.trick && !rw.taken.trick) ? t('Skip') : t('Continue'))));
  screen(topBar(), h('div.page.reward', {}, parts));
}

function treasureScreen() {
  const tr = run.pending;
  screen(topBar(), h('div.page.reward', {},
    h('h1.reward-title', {}, t('Treasure!')),
    h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: tr.gold })),
    tr.relic ? [h('div.section-label', {}, t('Inside the chest')), relicCard(tr.relic, { onclick: () => infoRelic(tr.relic) })] : h('p', {}, t('The chest is otherwise empty.')),
    h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Continue'))));
}

// ── Shop ────────────────────────────────────────────────────────────────────

function shopScreen() {
  const shop = run.pending.shop;
  const buy = (cost, fn) => {
    if (run.gold < cost) { toast(t('Not enough gold.'), 'bad'); return; }
    fn(() => { run.gold -= cost; sfx('coin'); save(); shopScreen(); });
  };
  screen(topBar(), h('div.page.shop', {},
    h('div.shop-head', {}, h('span.shop-emoji', { html: icon('shop') }), h('div', {}, h('h2', {}, t('The Travelling Merchant')), h('div.dim', {}, t('“Stones, tricks, trinkets. Gold only.”')))),
    h('div.section-label', {}, t('Stones')),
    h('div.cards.scroll', {}, shop.stones.map((s) => stoneCard(s, {
      price: s.price, sold: s.sold,
      onclick: () => buy(s.price, (pay) => takeStone(s, (ok) => { if (ok) { s.sold = true; pay(); } })),
    }))),
    h('div.section-label', {}, t('Tricks')),
    h('div.cards.scroll', {}, shop.tricks.map((x) => trickCard(x.trick, {
      price: x.price, sold: x.sold,
      onclick: () => buy(x.price, (pay) => takeTrick(x.trick, (ok) => { if (ok) { x.sold = true; pay(); } })),
    }))),
    shop.relics.length ? [h('div.section-label', {}, t('Relics')),
      h('div.cards.scroll', {}, shop.relics.map((r) => relicCard(r.relic, {
        price: r.price, sold: r.sold || R.has(run, r.relic),
        onclick: () => buy(r.price, (pay) => { R.gainRelic(run, r.relic); r.sold = true; pay(); }),
      })))] : null,
    h('div.section-label', {}, t('Services')),
    h('div.services', {},
      h('button.service', {
        disabled: shop.upgraded || !R.upgradeable(run).length || undefined,
        onclick: () => buy(shop.upgradePrice, (pay) => pickFromPouch(t('Upgrade which stone?'), (s) => { if (s) { s.plus = true; shop.upgraded = true; pay(); } }, { filter: (s) => !s.plus, upgrade: true })),
      }, h('b', {}, t('Upgrade a stone')), h('span.price', {}, iconEl('coin'), shop.upgradePrice), shop.upgraded ? h('span.dim', {}, t(' (done)')) : null),
      h('button.service', {
        disabled: run.pouch.length <= 5 || undefined,
        onclick: () => buy(shop.removePrice, (pay) => pickFromPouch(t('Remove which stone?'), (s) => {
          if (s) { run.pouch = run.pouch.filter((p) => p.uid !== s.uid); run.removals++; shop.removePrice = R.price(run, 50 + 25 * run.removals); pay(); }
        })),
      }, h('b', {}, t('Remove a stone')), h('span.price', {}, iconEl('coin'), shop.removePrice), run.pouch.length <= 5 ? h('span.dim', {}, t(' (keep 5)')) : null),
      h('button.service', {
        disabled: run.hearts >= run.maxHearts || shop.healed >= 2 || undefined,
        onclick: () => buy(shop.healPrice, (pay) => { run.hearts++; shop.healed++; sfx('heal'); pay(); }),
      }, h('b', {}, t('Bandage (+1 ❤)')), h('span.price', {}, iconEl('coin'), shop.healPrice), h('span.dim', {}, t(' {n} left', { n: 2 - shop.healed })))),
    h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Leave shop'))));
}

// ── Rest ────────────────────────────────────────────────────────────────────

function restScreen() {
  const n = R.has(run, 'anvil') ? 2 : 1;
  const heal = Math.max(2, Math.ceil(run.maxHearts * 0.4));
  const leave = () => { R.leaveNode(run); route(); };
  if (run.pending.done) {
    const more = (run.pending.upgrades ?? 1) < n && R.upgradeable(run).length;
    screen(topBar(), h('div.page.rest', {}, h('div.campfire', { html: icon('fire') }), h('h2', {}, t('The fire burns low')),
      more ? h('button.btn.wide.big', {
        onclick: () => pickFromPouch(t('Upgrade which stone?'), (s) => {
          if (!s) return;
          s.plus = true; run.pending.upgrades = (run.pending.upgrades ?? 1) + 1; sfx('coin'); leave();
        }, { filter: (s) => !s.plus, upgrade: true }),
      }, t('Sharpen one more')) : null,
      h('button.btn.primary.wide.big', { onclick: leave }, t('Move on'))));
    return;
  }
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('fire') }),
    h('h2', {}, t('A quiet campfire')),
    h('p.dim', {}, t('Rest a while, or sharpen your stones.')),
    h('button.btn.wide.big', {
      disabled: run.hearts >= run.maxHearts || undefined,
      onclick: () => { run.hearts = Math.min(run.maxHearts, run.hearts + heal); sfx('heal'); toast(`+${heal} ❤`, 'good'); flash = 'heal'; leave(); },
    }, t('Rest: heal {n} ❤', { n: heal })),
    h('button.btn.wide.big', {
      disabled: !R.upgradeable(run).length || undefined,
      onclick: () => {
        let left = n;
        const one = () => pickFromPouch(left > 1 ? t('Upgrade a stone ({n} left)', { n: left }) : t('Upgrade which stone?'), (s) => {
          if (!s) { if (left < n) leave(); return; }
          s.plus = true; left--; sfx('coin');
          run.pending.done = true; run.pending.upgrades = n - left; save();
          if (left > 0 && R.upgradeable(run).length) one(); else leave();
        }, { filter: (s) => !s.plus, cancel: left < n ? t('Done') : t('Cancel'), upgrade: true });
        one();
      },
    }, n > 1 ? t('Sharpen: upgrade two stones') : t('Sharpen: upgrade a stone')),
    h('button.btn.wide.ghost', { onclick: leave }, t('Move on'))));
}

// ── Events ──────────────────────────────────────────────────────────────────

function eventScreen() {
  const ev = EVENTS.find((e) => e.id === run.pending.id);
  const result = run.pending.result;
  const api = {
    rng: () => R.rand(run),
    pouchRoom: () => !R.pouchFull(run),
    trickRoom: () => !R.tricksFull(run),
    // `pay` is charged on the first pick, so backing out costs nothing.
    upgradeStone: (text, n = 1, pay = null) => new Promise((resolve) => {
      let left = n;
      const done = [];
      const one = () => pickFromPouch(left > 1 ? t('Upgrade a stone ({n} left)', { n: left }) : t('Upgrade which stone?'), (s) => {
        if (s) { if (!done.length) pay?.(); s.plus = true; left--; done.push(stoneName(s)); save(); }
        if (s && left > 0 && R.upgradeable(run).length) one();
        else resolve(done.length ? t('{text} Upgraded: {stones}.', { text, stones: done.join(', ') }) : t('You change your mind.'));
      }, { filter: (s) => !s.plus, cancel: done.length ? t('Done') : t('Never mind'), upgrade: true });
      one();
    }),
    pickTrick: (text) => new Promise((resolve) => {
      const body = h('div.menu', {}, h('h2', {}, text),
        run.tricks.map((x, k) => h('button.btn.wide', { onclick: () => { close(); resolve(k); } }, TRICKS[x].name)),
        h('button.btn.wide.ghost', { onclick: () => { close(); resolve(-1); } }, t('Never mind')));
      const close = modal(body, { dismissable: false });
    }),
    chooseStone: (rarity, pay = null) => new Promise((resolve) => {
      const opts = R.stoneChoices(run, 'elite', rarity);
      const body = h('div.pouch-view', {}, h('h2', {}, t('Choose a stone')),
        h('div.cards', {}, opts.map((s) => stoneCard(s, { onclick: () => { close(); takeStone(s, (ok) => { if (ok) pay?.(); resolve(ok ? t('You take the {stone}.', { stone: stoneName(s) }) : t('You leave it be.')); }); } }))),
        h('button.btn.wide.ghost', { onclick: () => { close(); resolve(t('You take nothing.')); } }, t('None')));
      const close = modal(body, { dismissable: false, cls: 'tall' });
    }),
    gainRandomTrick: (rarity) => {
      const tr = R.randomTrick(run, rarity);
      if (R.tricksFull(run)) return t('You find {trick}, but have no room for it.', { trick: TRICKS[tr].name });
      run.tricks.push(tr);
      return t('You gain the trick {trick}.', { trick: TRICKS[tr].name });
    },
    gainRandomRelic: (text) => {
      const id = R.randomRelic(run);
      if (!id) return t('{text} nothing.', { text });
      R.gainRelic(run, id);
      return `${text} ${RELICS[id].name}! ${RELICS[id].text}`;
    },
    transmute: () => new Promise((resolve) => pickFromPouch(t('Transmute which stone?'), (s) => {
      if (!s) return resolve(t('You change your mind.'));
      const up = { starter: 'common', common: 'uncommon', uncommon: 'rare', rare: 'rare' }[STONES[s.type].rarity];
      let n;
      for (let g = 0; g < 20; g++) { n = R.randomStone(run, up); if (n.type !== s.type) break; }
      s.type = n.type;
      s.plus = s.plus || n.plus;
      resolve(t('It bubbles and hisses… and becomes a {stone}!', { stone: stoneName(s) }));
    })),
    duplicate: () => new Promise((resolve) => pickFromPouch(t('Duplicate which stone?'), (s) => {
      if (!s) return resolve(t('The reflection fades.'));
      R.gainStone(run, { type: s.type, plus: s.plus });
      resolve(t('A second {stone} climbs out of the pond.', { stone: stoneName(s) }));
    })),
    removeStone: (heal) => new Promise((resolve) => pickFromPouch(t('Let go of which stone?'), (s) => {
      if (!s) return resolve(t('You keep everything.'));
      run.pouch = run.pouch.filter((p) => p.uid !== s.uid);
      if (heal) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
      resolve(t('The {stone} sinks out of sight. You feel lighter.', { stone: stoneName(s) }));
    })),
    fight: (id) => {
      run.pending = { kind: 'duel', duel: R.prepareDuel(run, id, { tier: 'event', event: id }) };
      run.screen = 'predual';
      duelState = null;
      route();
      return null;
    },
  };
  const choices = result
    ? [h('p.event-result', {}, result), h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Continue'))]
    : ev.choices.map((c) => {
      const ok = !c.can || c.can(run, api);
      return h('button.choice' + (ok ? '' : '.disabled'), {
        disabled: !ok || undefined,
        onclick: async () => {
          // A reload in the middle of a choice must not offer the event again.
          run.pending.result = t('You move on.');
          save();
          const out = await c.act(run, api);
          if (out === null) return;   // it started a duel
          run.pending.result = out;
          save();
          eventScreen();
        },
      }, h('b', {}, c.label), c.detail ? h('span.dim', {}, ' — ' + c.detail) : null);
    });
  screen(topBar(), h('div.page.event', {},
    h('div.event-emoji', {}, art('event', ev.id, ev.emoji)),
    h('h2', {}, ev.title),
    h('p', {}, ev.text),
    h('div.choices', {}, choices)));
}

// ── The end ─────────────────────────────────────────────────────────────────

// A result to paste to friends: the last act's map as Xs and Os.
function shareResult(victory) {
  const cells = run.map?.cells ?? [];
  const grid = [0, 1, 2, 3].map((r) => cells.slice(r * 4, r * 4 + 4).map((c) => (c.mark === 'X' ? '❌' : c.mark === 'O' ? '⭕' : '⬜')).join('')).join('\n');
  const head = `Pif·Paf·Poe${run.daily ? t(' daily {d}', { d: run.daily }) : ''}${run.heat ? t(' · heat {n}', { n: run.heat }) : ''}`;
  const line = victory ? t('Conquered the Summit as {kit} 🏆', { kit: R.KITS[run.kit].name }) : t('Fell in act {n} ({act})', { n: run.act, act: ACTS[run.act - 1].name });
  const text = `${head}\n${line}\n${t('{won} duels won, {lost} lost', { won: run.stats.won, lost: run.stats.lost })}\n${grid}\n${location.href.split('#')[0]}`;
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => toast(t('Copied!'), 'good'), () => {
    const close = modal(h('div.menu', {}, h('h2', {}, t('Your result')), h('pre.share', {}, text), h('button.btn.wide', { onclick: () => close() }, t('OK'))));
  });
}

function endScreen(victory) {
  recordEnd();
  const st = run.stats;
  const mins = Math.round((Date.now() - st.started) / 60000);
  const kit = R.KITS[run.kit];
  screen(h('div.page.end', {},
    h('div.end-emoji', {}, victory ? art('x', 'trophy', '🏆') : art('x', 'tombstone', '🪦')),
    h('h1', {}, victory ? t('You conquered the Summit!') : t('Your climb ends here')),
    h('p', {}, victory
      ? t(run.heat ? '{boss} bows. {kit} is the champion at heat {n}.' : '{boss} bows. {kit} is the champion.', { boss: ENEMIES[run.map.boss].name, kit: kit.name, n: run.heat })
      : t('Fallen in act {n}, {act}.', { n: run.act, act: ACTS[run.act - 1].name })),
    h('div.stats', {},
      h('div', {}, h('b', {}, st.won), t(' duels won', { n: st.won })),
      h('div', {}, h('b', {}, st.lost), t(' duels lost', { n: st.lost })),
      h('div', {}, h('b', {}, st.elites), t(' elites beaten', { n: st.elites })),
      h('div', {}, h('b', {}, st.bosses), t(' bosses beaten', { n: st.bosses })),
      h('div', {}, h('b', {}, st.gold), t(' gold earned', { n: st.gold })),
      h('div', {}, h('b', {}, mins), t(' minutes', { n: mins }))),
    h('div.section-label', {}, t('Final pouch')),
    h('div.hand.show', {}, run.pouch.map((s) => stoneEl(s, 'X', { mini: true }))),
    relicStrip(),
    victory && meta.maxHeat > run.heat ? h('p.good', {}, t('Heat {n} unlocked!', { n: run.heat + 1 })) : null,
    h('button.btn.wide', { onclick: () => shareResult(victory) }, t('Copy result to share')),
    h('button.btn.primary.wide.big', { onclick: () => { run = null; duelState = null; chooseKit(); } }, t('New run')),
    h('button.btn.wide', { onclick: () => { run = null; title(); } }, t('Title'))));
  try { localStorage.removeItem(SAVE); } catch { /* ignore */ }
}

// ── Help & codex ────────────────────────────────────────────────────────────

function showHelp(after) {
  const s = (x, p = 'X') => stoneEl({ type: x }, p, { mini: true });
  const pages = [
    h('div', {}, h('h2', {}, t('The duel')),
      h('p', {}, t('Tic-tac-toe on a 3×3 board: three of your stones in a row — across, down or diagonal — wins.')),
      h('p', {}, t('You are '), h('b.blue', {}, t('blue squares')), t(', the enemy is '), h('b.red', {}, t('red circles')), t('. You take turns placing one stone from your hand.')),
      h('p', {}, t('The twist: most stones '), h('b', {}, t('do something when placed')), t(' — and what they do is move stones already on the board, yours and theirs alike. A line can be made by sliding a stone into it, and broken by the next stone played.'))),
    h('div', {}, h('h2', {}, t('A turn')),
      h('p', {}, t('1. Tap a stone in your hand. Glowing squares show where it may go.')),
      h('p', {}, t('2. Tap a square. If the stone does something, you will see what — tap again or ✓ to confirm. If it can do it several ways, arrows and targets appear: tap one to preview it.')),
      h('p', {}, t('3. If you hold tricks, you may spend one before ending your turn.')),
      h('p', {}, t('Until your turn ends, ↩ Undo takes the whole turn back.'))),
    h('div', {}, h('h2', {}, t('Some stones')),
      h('p', {}, s('shift'), ' ', h('b', {}, STONES.shift.name), t(' slides its row or column one step, wrapping around.')),
      h('p', {}, s('rotate'), ' ', h('b', {}, STONES.rotate.name), t(' turns a 2×2 block clockwise.')),
      h('p', {}, s('magnet'), ' ', h('b', {}, STONES.magnet.name), t(': the enemy must place next to it. '), s('stinky'), ' ', h('b', {}, STONES.stinky.name), t(': must not.')),
      h('p', {}, s('mountain'), ' ', h('b', {}, STONES.mountain.name), t(' is never moved — it is a wall for everything else.')),
      h('p', {}, t('Tap any stone, anywhere, to read what it does. Upgraded stones (with a '), h('b.gold', {}, '+'), t(') do more.'))),
    h('div', {}, h('h2', {}, t('The rules that decide')),
      h('p', {}, h('b', {}, t('A full board goes to whoever moved second')), t(' — and so does a game where the player to move has no stones left. Opening is an advantage; the tiebreak is the second player\'s consolation.')),
      h('p', {}, t('Each duel is fought on a '), h('b', {}, t('space')), t(' that may switch one stone type off, for both sides. Switched-off stones still count for lines, they just do nothing.')),
      h('p', {}, t('Several Magnets and Stinkies all pull at once: you must place where you satisfy as many as any square can.'))),
    h('div', {}, h('h2', {}, t('The climb')),
      h('p', {}, t('Three acts. Each act is itself a game of tic-tac-toe against its boss, on a 4×4 grid of encounters: duels ⚔, elites 💀, shops, campfires, treasure and the unknown.')),
      h('p', {}, t('Wherever you go you mark an '), h('b.blue', {}, 'X'), t(' — next to one you already have. After each step the boss marks an '), h('b.red', {}, 'O'), t(', taking that square away. Lose a duel and the boss takes that square — that is its move.')),
      h('p', {}, h('b', {}, t('Three Xs in a row open the boss\'s door.')), t(' If the boss draws its own line first, or boxes you in, it grows stronger.')),
      h('p', {}, t('Before each duel you see the enemy\'s stones and the space, and choose which 5 of your pouch to bring. Lose and it costs hearts; run out and the climb is over. Bosses must be beaten twice.'))),
  ];
  let k = 0;
  const holder = h('div.help-page');
  const dots = h('div.dots');
  const next = h('button.btn.primary', {}, t('Next'));
  const prev = h('button.btn.ghost', {}, t('Back'));
  const draw = () => {
    holder.replaceChildren(pages[k]);
    dots.replaceChildren(...pages.map((_, i) => h('span.dot' + (i === k ? '.on' : ''))));
    next.textContent = k === pages.length - 1 ? t('Play') : t('Next');
    prev.style.visibility = k === 0 ? 'hidden' : 'visible';
  };
  next.onclick = () => { if (k < pages.length - 1) { k++; draw(); } else { close(); after?.(); } };
  prev.onclick = () => { if (k > 0) { k--; draw(); } };
  draw();
  const close = modal(h('div.help', {}, holder, dots, h('div.help-nav', {}, prev, next)), { cls: 'tall' });
}

function showCodex() {
  let tab = 'stones';
  const body = h('div.codex');
  const draw = () => {
    const tabs = h('div.tabs', {}, ['stones', 'tricks', 'relics', 'enemies'].map((x) => h('button.tab' + (x === tab ? '.on' : ''), { onclick: () => { tab = x; draw(); } }, t(x))));
    let list;
    if (tab === 'stones') {
      list = STONE_TYPES.map((x) => h('div.codex-row', { onclick: () => infoStone({ type: x, plus: false }, 'X'), style: { cursor: 'pointer' } }, stoneEl({ type: x }, 'X'), h('div', {},
        h('b', {}, STONES[x].name), h('span.info-rarity.' + STONES[x].rarity, {}, ' ' + t(STONES[x].rarity)),
        h('div', {}, STONES[x].text), h('div.dim', {}, '+ ' + STONES[x].plusText))));
    } else if (tab === 'tricks') {
      list = TRICK_TYPES.map((x) => h('div.codex-row', { onclick: () => infoTrick(x), style: { cursor: 'pointer' } }, h('div.trick-token', { html: icon(x) }), h('div', {},
        h('b', {}, TRICKS[x].name), h('span.info-rarity.' + TRICKS[x].rarity, {}, ' ' + t(TRICKS[x].rarity)), h('div', {}, TRICKS[x].text))));
    } else if (tab === 'relics') {
      list = RELIC_TYPES.map((r) => h('div.codex-row', {}, h('div.relic-token.small', {}, relicArt(r)), h('div', {},
        h('b', {}, RELICS[r].name), h('span.info-rarity.' + RELICS[r].rarity, {}, ' ' + t(RELICS[r].rarity)), h('div', {}, RELICS[r].text))));
    } else {
      list = Object.values(ENEMIES).filter((e) => e.act > 0).map((e) => h('div.codex-row', {}, h('div.relic-token.small', {}, e.emoji), h('div', {},
        h('b', {}, e.name), h('span.dim', {}, ` · ${t('act {n}', { n: e.act })} ${t(e.tier)}`),
        h('div.hand.show.tiny', {}, e.core.map((x) => stoneEl({ type: x }, 'O', { mini: true }))),
        e.field ? h('div.dim', {}, `${t('Rule')} — ${FIELDS[e.field].name}: ${FIELDS[e.field].text}`) : null,
        e.field2 ? h('div.dim', {}, `${t('Once beaten, it rises with a new rule')} — ${FIELDS[e.field2].name}: ${FIELDS[e.field2].text}`) : null)));
    }
    body.replaceChildren(tabs, h('div.codex-list', {}, list), h('button.btn.wide', { onclick: () => close() }, t('Close')));
  };
  draw();
  const close = modal(body, { cls: 'tall' });
}

// ── Boot ────────────────────────────────────────────────────────────────────

title();
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline play is a bonus */ });
}
