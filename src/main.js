// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, CONDS, RULES, createGame } from './engine.js';
import { RELICS, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, hideToast, tapeUp, art, relicArt, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, pressable, infoStone, infoRelic, ruleChip, stoneCard, relicCard, stoneName, langToggle } from './ui/common.js';
import { icon } from './icons.js';
import { mountDuel } from './ui/duel.js';
import { sfx, soundOn, setSound } from './sound.js';
import { setScene, musicEvent, musicOn, setMusic, unlockMusic } from './music.js';
import { t, tp, lang, localizeData } from './i18n.js';

localizeData({
  stones: STONES, conds: CONDS, rules: RULES, relics: RELICS, enemies: ENEMIES, acts: ACTS, events: EVENTS,
  heat: R.HEAT, quirks: R.QUIRKS,
});
document.documentElement.lang = lang;

// The short name under an enemy's face on the map.
const shortName = (e) => e.short ?? e.name.replace(/^(The|Captain) /, '');

const app = document.getElementById('app');
const SAVE = 'ppp-run-v2';   // v1 runs were of the faster game, with kits
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
  meta.duelsWon = (meta.duelsWon ?? 0) + run.stats.won;
  if (run.victory) {
    meta.wins++;
    meta.bestHeatWon = Math.max(meta.bestHeatWon, run.heat);
    meta.maxHeat = Math.min(R.HEAT.length - 1, Math.max(meta.maxHeat, run.heat + 1));
  }
  saveMeta();
}

// ── Chrome ──────────────────────────────────────────────────────────────────

function topBar(menu = showMenu) {
  const hearts = h('div.hearts' + (flash ? '.' + flash : ''), {},
    h('span', { html: icon('heart') }), `${run.hearts}/${run.maxHearts}`);
  flash = null;
  return h('div.topbar', {},
    hearts,
    h('div.gold', {}, h('span', { html: icon('coin') }), run.gold),
    h('div.where', {}, t('Act {n} · {name}', { n: run.act, name: ACTS[run.act - 1].name.replace(/^The /, '') })),
    h('button.icon-btn', { onclick: showPouch, 'aria-label': t('Your pouch') }, h('span', { html: icon('hand') })),
    h('button.icon-btn', { onclick: menu, 'aria-label': t('Menu') }, h('span', { html: icon('gear') })));
}

// `keep`: a redraw of the same screen, which stays where it was scrolled to.
function screen(...children) {
  const keep = children[0] === KEEP_SCROLL;
  if (keep) children.shift();
  const y = window.scrollY;
  const lefts = [...app.querySelectorAll('.cards.scroll')].map((e) => e.scrollLeft);
  hideToast();
  const el = h('div.screen', {}, ...children);
  app.replaceChildren(el);
  tapeUp(el);
  if (keep) {
    window.scrollTo(0, y);
    el.querySelectorAll('.cards.scroll').forEach((e, k) => { e.scrollLeft = lefts[k] ?? 0; });
  } else {
    app.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  return el;
}
const KEEP_SCROLL = Symbol('keep scroll');

function relicStrip() {
  if (!run.relics.length) return null;
  return h('div.relic-strip', {}, run.relics.map((r) => h('button.relic-mini', { onclick: () => infoRelic(r), title: RELICS[r].name }, relicArt(r))));
}

function showPouch() {
  const body = h('div.pouch-view', {},
    h('h2', {}, t('Pouch · {n}/{cap}', { n: run.pouch.length, cap: R.pouchCap(run) })),
    h('div.stone-grid', {}, run.pouch.map((s) => h('button.pouch-slot', { onclick: () => infoStone(s, 'X') }, stoneEl(s, 'X'), h('span', {}, stoneName(s))))),
    h('h2', {}, t('Relics')),
    run.relics.length ? h('div.relic-list', {}, run.relics.map((r) => h('button.relic-row', { onclick: () => infoRelic(r) }, h('span.relic-token.small', {}, relicArt(r)), h('span', {}, h('b', {}, RELICS[r].name), h('br'), RELICS[r].text)))) : h('p.dim', {}, t('No relics yet.')),
    h('button.btn.wide', { onclick: () => close() }, t('Close')));
  const close = modal(body, { cls: 'tall' });
}

function showMenu() {
  const body = h('div.menu', {},
    h('h2', {}, t('Menu')),
    settingsRow(),
    h('button.btn.wide', { onclick: () => { close(); title(); } }, t('Save & quit to title')),
    h('button.btn.wide.danger', {
      onclick: () => {
        if (!confirm(t('Abandon this run? It will count as a loss.'))) return;
        close();
        run.over = true; recordEnd(); duelState = null; save(); run = null; title();
      },
    }, t('Abandon run')),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Back')));
  const close = modal(body);
}

// Full screen, where the browser allows it (not on iPhones).
const canFullscreen = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } catch { /* not allowed here */ }
}

// Language, music, sound and full screen on one line of small buttons.
function settingsRow() {
  const row = h('div.settings-row');
  const draw = () => row.replaceChildren(
    langToggle(),
    h('button.icon-toggle' + (musicOn() ? '' : '.off'), { 'aria-label': musicOn() ? t('Music: on') : t('Music: off'), 'aria-pressed': String(musicOn()),
      onclick: () => { setMusic(!musicOn()); draw(); } }, h('span', { html: icon(musicOn() ? 'music-on' : 'music-off') })),
    h('button.icon-toggle' + (soundOn() ? '' : '.off'), { 'aria-label': soundOn() ? t('Sound: on') : t('Sound: off'), 'aria-pressed': String(soundOn()),
      onclick: () => { setSound(!soundOn()); draw(); sfx('click'); } }, h('span', { html: icon(soundOn() ? 'sound-on' : 'sound-off') })),
    canFullscreen() ? h('button.icon-toggle', { 'aria-label': t('Full screen'), 'aria-pressed': String(!!document.fullscreenElement),
      onclick: toggleFullscreen }, h('span', { html: icon(document.fullscreenElement ? 'fullscreen-exit' : 'fullscreen') })) : null);
  draw();
  document.addEventListener('fullscreenchange', () => { if (row.isConnected) draw(); });
  return row;
}

// Saves from before the evolved stones were retired: back to their plain forms.
const RETIRED = { rail: 'shift', pivot: 'rotate', electromagnet: 'magnet', stench: 'stinky', 4096: '2048', blast: 'bumper',
  teleport: 'swap', cyclone: 'whirl', kangaroo: 'frog', lighthouse: 'beacon', kaleidoscope: 'flip', bomb: 'firecracker' };
function migrate() {
  for (const st of run.pouch) st.type = RETIRED[st.type] ?? st.type;
  run.pouch = run.pouch.filter((st) => STONES[st.type]);
  // Pebbles in the pouch, and slots counted with them.
  if ((run.v ?? 2) < 3) {
    run.v = 3;
    run.slots = (run.slots ?? 2) + 2;
    for (let k = 0; k < R.MIN_HAND; k++) run.pouch.push({ type: 'pebble', uid: run.nextUid++ });
    if (duelState) { duelState = null; if (run.screen === 'duel') run.screen = 'predual'; }
  }
  // Tricks are one-shot stones now: into the pouch they go.
  for (const x of run.tricks ?? []) if (STONES[x]?.once) run.pouch.push({ type: x, uid: run.nextUid++ });
  delete run.tricks;
  if (duelState && (!duelState.spent || duelState.phase === 'trick')) { duelState = null; if (run.screen === 'duel') run.screen = 'predual'; }
  run.relics = run.relics.filter((x) => RELICS[x]);
  // A duel in progress with a retired stone in it starts over.
  const known = (h) => STONES[h.type];
  if (duelState && !(duelState.hands.X.every(known) && duelState.hands.O.every(known) && duelState.board.every((c) => !c || known(c)))) {
    duelState = null;
    if (run.screen === 'duel') run.screen = 'predual';
  }
}

// ── Title ───────────────────────────────────────────────────────────────────

function title() {
  duelView?.destroy();
  duelView = null;
  setScene('title', 0);
  const saved = loadJSON(SAVE);
  screen(
    h('div.title', {},
      h('div.logo', {},
        // PIF / PAF / POE on a tic-tac-toe board, played out a letter a turn:
        // blue takes the corners and the middle (an X), red the edges (an O).
        h('h1.logo-board', { 'aria-label': 'Pif Paf Poe' },
          h('div.board-lines', { html: '<svg viewBox="0 0 300 300" aria-hidden="true"><path d="M101 8 C 98 90, 104 190, 99 292"/><path d="M200 6 C 203 100, 197 200, 202 293"/><path d="M7 100 C 90 97, 200 104, 294 99"/><path d="M8 201 C 100 204, 190 197, 293 202"/></svg>' }),
          [4, 1, 0, 3, 8, 5, 2, 7, 6].map((i, k) => h(`span.letter.${k % 2 ? 'o' : 'x'}`, {
            'aria-hidden': 'true',
            style: { left: `${(i % 3) * 33.3}%`, top: `${((i / 3) | 0) * 33.3}%`, '--tilt': `${((i * 37) % 11) - 5}deg`, animationDelay: `${0.25 + k * 0.32}s` },
          }, 'PIFPAFPOE'[i]))),
      ),
      h('div.title-buttons', {},
        saved?.run && !saved.run.over ? h('button.btn.primary.wide.big.continue', { onclick: () => { run = saved.run; duelState = saved.duel; migrate(); route(); } },
          h('span', {}, t('Continue run')),
          h('span.continue-sub', {}, `${t('Act {n}', { n: saved.run.act })} · ❤ ${saved.run.hearts}`)) : null,
        h('button.btn.wide.big' + (saved?.run ? '' : '.primary'), { onclick: () => { if (saved?.run && !saved.run.over && !confirm(t('Start over? Your run in progress will be lost.'))) return; newRunMenu(); } }, t('New run')),
        settingsRow()),
    ));
}

// A new run: straight in, or first a word on the heat once some is unlocked.
function newRunMenu() {
  const go = (heat) => {
    meta.heat = heat; saveMeta();
    run = R.newRun({ heat });
    duelState = null;
    save();
    route();
  };
  if (!meta.maxHeat) { go(0); return; }
  let heat = Math.min(meta.heat ?? 0, meta.maxHeat);
  const row = h('div.heat-row');
  const draw = () => {
    row.replaceChildren(
      h('div.heat-label', {}, t('Heat {n}', { n: heat }), h('span.dim', {}, ' — ' + (heat ? R.HEAT.slice(1, heat + 1).map((x) => x.text).join(' ') : R.HEAT[0].text))),
      h('div.heat-btns', {},
        h('button.btn.small', { onclick: () => { if (heat > 0) { heat--; draw(); } } }, '−'),
        h('button.btn.small', { onclick: () => { if (heat < meta.maxHeat) { heat++; draw(); } else toast(t('Win a run to unlock more heat.')); } }, '+')));
  };
  draw();
  const body = h('div.menu', {}, h('h2', {}, t('New run')), row,
    h('button.btn.primary.wide', { onclick: () => { close(); go(heat); } }, t('Climb')),
    h('button.btn.ghost.wide', { onclick: () => close() }, t('Back')));
  const close = modal(body);
}

// ── Router ──────────────────────────────────────────────────────────────────

// The music for where you are: the act's palette, the screen's layers.
function sceneOf(r) {
  switch (r.screen) {
    case 'map': case 'actintro': return 'map';
    case 'predual': case 'duel': {
      const tier = r.pending?.duel?.tier;
      return tier === 'boss' ? 'boss' : tier === 'elite' ? 'elite' : 'duel';
    }
    case 'shop': case 'rest': case 'craft': case 'treasure': case 'reward': return 'calm';
    case 'event': return 'event';
    case 'gameover': return 'defeat';
    case 'victory': return 'victory';
    default: return 'map';
  }
}

function route() {
  duelView?.destroy();
  duelView = null;
  save();
  setScene(sceneOf(run), run.act);
  switch (run.screen) {
    case 'map': return mapScreen();
    case 'actintro': return actIntro();
    case 'predual': return duelState ? duelScreen() : preDuel();
    case 'duel': return duelState ? duelScreen() : preDuel();
    case 'reward': return rewardScreen();
    case 'shop': return shopScreen();
    case 'rest': return restScreen();
    case 'craft': return craftScreen();
    case 'treasure': return treasureScreen();
    case 'event': return eventScreen();
    case 'gameover': return endScreen(false);
    case 'victory': return endScreen(true);
    default: run.screen = 'map'; return mapScreen();
  }
}

// ── Map ─────────────────────────────────────────────────────────────────────

const NODE_ICON = { fight: 'sword', elite: 'skull', rock: 'mountain', shop: 'shop', rest: 'fire', event: 'question', treasure: 'chest', boss: 'crown', gift: 'star', craft: 'relic-anvil' };
const NODE_NAME = { 'boss-mark': t('Boss'), fight: t('Duel'), elite: t('Elite'), shop: t('Shop'), rest: t('Campfire'), event: t('Unknown'), treasure: t('Treasure'), boss: t('Boss'), rock: t('Rock'), gift: t('Gift'), craft: t('Workshop') };

// The act's map: tic-tac-toe against its boss on an endless sheet, revealed
// a mark at a time.
function mapScreen() {
  if (run.map?.v !== 7) R.makeMap(run);   // a save from an older map: a fresh one
  const map = run.map;
  const reach = new Set(R.reachable(run));
  const boss = ENEMIES[map.boss];
  // One ring of unexplored paper round what is on view: the page goes on.
  const bounds = R.mapBounds(map);
  const x0 = bounds.x0 - 1, y0 = bounds.y0 - 1, x1 = bounds.x1 + 1, y1 = bounds.y1 + 1;
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const threats = new Set(R.bossThreats(map));
  const freshX = map.freshX, lastO = map.lastO, freshS = map.freshS;
  // The turn plays out in order: your X (or the burn), what it reveals, the
  // boss's O, what that reveals. Delays in seconds.
  const appear = new Map();
  (map.revealX ?? []).forEach((k, i) => appear.set(k, 0.75 + i * 0.05));
  (map.revealO ?? []).forEach((k, i) => appear.set(k, 2.1 + i * 0.05));
  const breaching = map.armed === 'breach';
  const grid = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = R.keyOf(x, y);
      const c = map.cells[k];
      if (!c) { grid.push(h('div.map-fog', { 'aria-hidden': 'true' }, '?')); continue; }
      const can = reach.has(k);
      const kind = c.kind;
      const el = h(`button.map-cell.${kind}` + (can ? '.reach' : '') + (c.mark ? '.marked' : '') + (breaching && kind === 'rock' ? '.breachable' : ''), {
        'aria-label': NODE_NAME[kind] ?? boss.name, dataset: { k },
        onclick: () => {
          if (breaching && kind === 'rock') { R.breach(run, k); sfx('thud'); save(); mapScreen(); return; }
          if (!can) {
            const why = kind === 'rock' ? t('Rock: no step, no line through it.')
              : c.mark === 'X' ? t('You have been here.')
                : c.mark === 'O' ? t('{boss} took this square.', { boss: boss.name })
                  : c.mark === 'S' ? t('Burned: only the boss may take it.')
                    : t('Not next to a mark.');
            toast(why);
            return;
          }
          sfx('click');
          R.enterNode(run, k);
          duelState = null;
          route();
        },
      }, kind === 'boss-mark' || kind === 'rock' ? (kind === 'rock' ? h('span.doodle.rock', { html: icon('rock') }) : null) : c.duel
        ? h('span.doodle.foe', {}, h('span.photo', {}, ENEMIES[c.duel.enemyId].emoji))
        : h('span.doodle', { html: icon(NODE_ICON[kind]) }),
      kind === 'boss-mark' || kind === 'rock' ? null : h('span.label', {}, c.duel ? shortName(ENEMIES[c.duel.enemyId]) : NODE_NAME[kind]));
      if ((!c.mark || c.mark === 'S') && threats.has(k)) el.classList.add('boss-threat');
      if (c.mark === 'X') el.insertAdjacentHTML('beforeend', scribbleX(freshX === k));
      if (c.mark === 'O') el.insertAdjacentHTML('beforeend', scribbleO(lastO === k));
      if (c.mark === 'S') el.classList.add('scorched');
      if (freshS === k) el.classList.add('fresh-burn');
      // The square's own picture stays a moment and fades as the mark is drawn.
      if (c.mark && (k === freshX || k === lastO || k === freshS) && kind !== 'boss-mark') {
        el.classList.add('fading');
        el.style.setProperty('--fd', k === lastO && k !== freshX ? '1.4s' : '0s');
      }
      if (appear.has(k)) { el.classList.add('appear'); el.style.setProperty('--d', `${appear.get(k)}s`); }
      if (kind === 'elite' && !c.mark) el.insertAdjacentHTML('beforeend', `<span class="elite-star">${icon('star')}</span>`);
      grid.push(el);
    }
  }
  if (freshX) sfx('scribbleX');
  if (lastO && freshX) sfx('scribbleO');
  map.freshX = null;
  map.lastO = null;
  map.freshS = null; map.revealX = null; map.revealO = null;
  if (map.news === 'oline' || map.news === 'full') musicEvent('stronger');
  else if (map.open && !map.doorHeard) musicEvent('door');
  if (map.open) map.doorHeard = true;
  // The boss growing stronger is news of its own, once the O is drawn.
  const stronger = map.news === 'oline' ? t('{boss}: three in a row — stronger!', { boss: boss.name })
    : map.news === 'full' ? t('Page full: {boss} is stronger.', { boss: boss.name }) : null;
  if (stronger) setTimeout(() => toast(stronger, 'bad'), map.news === 'oline' ? 2200 : 300);
  const news = lastO && map.cells[lastO] && map.cells[lastO].kind !== 'boss-mark' ? t('{boss} marks the {node} square.', { boss: boss.name, node: NODE_NAME[map.cells[lastO].kind].toLowerCase() }) : '';
  const bonus = map.bonus;
  map.bonus = 0;
  map.news = null;
  if (bonus) setTimeout(() => toast(`+${bonus} 🪙`, 'good'), 50);
  // The boss's door: a hint while it is shut, a button once it is open.
  const door = map.open
    ? h('button.btn.primary.wide.boss-go', { onclick: () => { R.enterNode(run, 'boss'); duelState = null; route(); } },
      h('span', { html: icon('crown') }), t('Face the boss'))
    : h('div.door-hint', {}, h('span', { html: icon('crown') }), t('Three Xs in a row open the boss\'s door.'),
)
  // Map aids won in duels: arm one for the next step.
  const aids = R.AID_TYPES.filter((a) => run.aids?.[a]).length ? h('div.aids', {}, R.AID_TYPES.filter((a) => run.aids?.[a]).map((a) => h('button.aid' + (map.armed === a ? '.armed' : ''), {
    onclick: () => { R.toggleAid(run, a); sfx('click'); save(); mapScreen(); if (map.armed) toast(t(R.AIDS[a].text)); },
  }, h('span.aid-ico', { html: icon(a === 'breach' ? 'mountain' : 'rule-headstart') }), `${t(R.AIDS[a].name)} ×${run.aids[a]}`))) : null;
  // Lines of pencil between the squares on view, each a little crooked.
  const W = cols * 100, H = rows * 100;
  let paths = '';
  for (let i = 1; i < cols; i++) { const x = i * 100, w = ((i * 37) % 7) - 3; paths += `<path d="M${x + w} 4 C ${x - w} ${H * 0.33}, ${x + w} ${H * 0.66}, ${x - w / 2} ${H - 4}"/>`; }
  for (let j = 1; j < rows; j++) { const y = j * 100, w = ((j * 53) % 7) - 3; paths += `<path d="M4 ${y + w} C ${W * 0.33} ${y - w}, ${W * 0.66} ${y + w}, ${W - 4} ${y - w / 2}"/>`; }
  // Lines of three, crossed through: their marks are spent.
  let strikes = '';
  for (const { mark, cells } of map.lines ?? []) {
    const [a, b] = [cells[0], cells[cells.length - 1]].map((k) => { const [x, y] = R.coords(k); return [(x - x0) * 100 + 50, (y - y0) * 100 + 50]; });
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const p = [a[0] - ux * 34, a[1] - uy * 34], q = [b[0] + ux * 34, b[1] + uy * 34];
    const bend = 5, mx = (p[0] + q[0]) / 2 - uy * bend, my = (p[1] + q[1]) / 2 + ux * bend;
    const fresh = cells.includes(freshX) && mark === 'X' || cells.includes(lastO) && mark === 'O';
    strikes += `<path pathLength="100" class="${mark === 'X' ? 'x' : 'o'}${fresh ? ' fresh' : ''}" d="M${p[0]} ${p[1]} Q ${mx} ${my}, ${q[0]} ${q[1]}"/>`;
  }
  const sheet = h('div.map-sheet', { style: `--cols: ${cols}; --rows: ${rows}` },
    h('div.board-lines', { html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>` }),
    h('div.map-cells', {}, grid),
    strikes ? h('div.map-strikes', { html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${strikes}</svg>` }) : null);
  const scroller = h('div.map-scroll', {}, sheet);
  screen(topBar(), relicStrip(),
    h('div.map-page', {},
      door,
      aids,
      scroller,
      h('div.map-news', {}, news),
      h('div.map-help', {}, breaching ? t('Tap a rock to break it.')
        : !R.xCount(run) ? t('Pick a square next to the O.')
          : R.pageFull(map) ? t('Page full: face the boss.')
            : tp(R.PAGE - map.visited, '{n} step left on this page.', '{n} steps left on this page.')),
      threats.size ? h('div.map-help.red', {}, t('Dashed circle: the boss wins a line there.')) : null));
  // Keep the newest marks in view, scrolling the sheet only, never the page.
  requestAnimationFrame(() => {
    const target = (freshX && scroller.querySelector(`[data-k="${freshX}"]`)) || scroller.querySelector('.map-cell.reach');
    if (!target) return;
    scroller.scrollLeft = target.offsetLeft - scroller.clientWidth / 2 + target.offsetWidth / 2;
    scroller.scrollTop = target.offsetTop - scroller.clientHeight / 2 + target.offsetHeight / 2;
  });
}

function actIntro() {
  const act = ACTS[run.act - 1];
  screen(h('div.act-intro', {},
    h('div.act-n', {}, t('Act {n}', { n: act.n })),
    h('h1', {}, act.name),
    h('button.btn.primary.wide.big', { onclick: () => { run.screen = 'map'; route(); } }, t('Onward'))));
}

// A boss beaten once rises again by moonlight, undead, with its harder rules.
const isUndead = (duel) => duel.tier === 'boss' && duel.bossWins > 0;
const undeadName = (e) => e.undead ?? t('Undead {boss}', { boss: e.name.replace(/^The /, '') });
// The moon comes up over the board, and the boss climbs out of the earth.
function moonrise(boss, done) {
  const veil = h('div.moonrise', {},
    h('div.moon'),
    h('div.moonrise-text', {}, h('div', {}, t('The moon rises…')),
      h('div.moonrise-name', {}, t('{boss} climbs out of the earth.', { boss: undeadName(boss) }))));
  document.body.append(veil);
  musicEvent('stronger');
  let gone = false;
  const go = () => { if (gone) return; gone = true; veil.classList.add('out'); setTimeout(() => { veil.remove(); done(); }, 500); };
  veil.addEventListener('click', go);
  setTimeout(go, 3200);
}

// A stone's name with an (i): tapping the name reads the stone.
function infoName(s, player) {
  return h('span.info-name-link', { onclick: (e) => { e.stopPropagation(); infoStone(s, player); } }, stoneName(s), h('span.i', {}, ' ⓘ'));
}

// ── Before a duel: see the enemy, choose your stones ────────────────────────

function preDuel() {
  const duel = run.pending.duel;
  const enemy = ENEMIES[duel.enemyId];
  const size = R.handSize(run);
  let chosen = R.defaultHand(run);
  const grid = h('div.stone-row.pick');
  const count = h('span.count');
  const fight = h('button.btn.primary.wide.big', { onclick: begin }, t('Fight!'));
  const draw = () => {
    grid.replaceChildren(...run.pouch.map((s) => {
      const on = chosen.includes(s.uid);
      return pressable(h('button.stone-pick' + (on ? '.on' : ''), { 'aria-label': stoneName(s) }, stoneEl(s, 'X')), {
        tap: () => {
          if (on) chosen = chosen.filter((u) => u !== s.uid);
          else if (chosen.length < size) chosen.push(s.uid);
          else { toast(t('Only {n}.', { n: size })); return; }
          sfx('click');
          draw();
        },
        long: () => infoStone(s, 'X'),
      });
    }));
    count.textContent = `${chosen.length}/${size}`;
    const need = R.MIN_HAND - chosen.length;
    fight.disabled = need > 0;
    fight.textContent = need > 0 ? t('Pick {n} more', { n: need }) : t('Fight!');
  };
  draw();

  const tierLabel = { normal: '', elite: t('Elite'), boss: t('Boss'), event: t('Challenge') }[duel.tier];
  const facts = [
    ...(duel.rules ?? []).map((r) => h('div.fact.warn.rule-fact', {}, ruleChip('rule', r), h('span', {}, RULES[r].text))),
    ...(duel.conds ?? []).map((c) => h('div.fact.rule-fact', {}, ruleChip('cond', c), h('span', {}, CONDS[c].text))),
    duel.quirk ? h('div.fact.warn', {}, `${R.QUIRKS[duel.quirk].name}: ${R.QUIRKS[duel.quirk].text}`) : null,
    duel.tier === 'boss' && duel.bossWins === 0 && enemy.rules2 && enemy.rules2.join() !== duel.rules.join()
      ? h('div.fact.dim', {}, t('At moonrise: {rules}', { rules: enemy.rules2.map((r) => RULES[r].name).join(', ') })) : null,
    duel.tier === 'boss' && run.map?.power ? h('div.fact.warn', {}, run.map.power >= 2 ? t('Full strength: it thinks harder, and brings its harder rules from the start.') : t('Grown stronger: it thinks harder.')) : null,
  ].filter(Boolean);
  const canBack = duel.tier !== 'boss' && !duel.event;
  screen(topBar(),
    h('div.page', {},
      canBack ? h('button.btn.ghost.small.back-map', { onclick: () => { R.retreat(run); route(); } }, h('span', { html: icon('back') }), t('Back to the map')) : null,
      h('div.enemy-card.' + duel.tier + (isUndead(duel) ? '.undead' : ''), {},
        h('button.stake', { onclick: () => toast(t('Will cost you {n} ❤ on loss.', { n: R.heartsLost(duel) })), 'aria-label': t('Will cost you {n} ❤ on loss.', { n: R.heartsLost(duel) }) },
          h('span', { html: icon('sword') }), String(R.heartsLost(duel))),
        h('div.portrait.big', {}, h('div.photo', {}, enemy.emoji)),
        h('div', {},
          tierLabel ? h('div.tier.' + duel.tier, {}, tierLabel) : null,
          h('div.enemy-name.big', {}, isUndead(duel) ? undeadName(enemy) : enemy.name),
          h('div.quote', {}, t('“{quote}”', { quote: enemy.quote })))),
      h('div.section-label', {}, t('Their stones')),
      h('div.stone-row', {}, [...new Set(duel.handO.map((s) => s.type))].map((type) => {
        const n = duel.handO.filter((s) => s.type === type).length;
        return h('button.stone-pick', { onclick: () => infoStone({ type }, 'O'), 'aria-label': stoneName({ type }) },
          stoneEl({ type }, 'O'), n > 1 ? h('span.hand-count', {}, `×${n}`) : null);
      })),
      facts.length ? h('div.duel-facts.facts-card', {}, facts) : null,
      h('div.section-label', {}, t('Your stones '), count),
      grid,
      h('div.press-hint', {}, t('Long press stone for info.')),
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
  const base = ENEMIES[duel.enemyId];
  const enemy = { ...base, name: isUndead(duel) ? undeadName(base) : base.name, undead: isUndead(duel), iters: duel.iters, blunder: duel.blunder, tier: duel.tier };
  // The same top bar as on the map: your hearts and gold, the menu.
  const holder = screen(topBar(showDuelMenu), h('div.duel-host'));
  const extra = null;
  duelView = mountDuel(holder.querySelector('.duel-host'), {
    state: duelState, enemy, extra,
    onSave: (s) => { duelState = s; save(); },
    onEnd: (winner) => {
      // One-shot stones played in the duel are gone from the pouch.
      R.spendOnce(run, run.lastHand, duelState.spent.X);
      duelState = null;
      if (winner === 'X') {
        const res = R.duelWon(run);
        if (res.kind === 'boss-continue') { save(); moonrise(ENEMIES[duel.enemyId], route); return; }
        if (res.kind === 'reward' && duel.tier === 'boss') {
          meta.beaten = { ...(meta.beaten ?? {}), [duel.enemyId]: true };
          saveMeta();
        }
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
    h('button.btn.wide', { onclick: () => { close(); showPouch(); } }, t('Pouch & relics')),
    settingsRow(),
    h('button.btn.wide', { onclick: () => { close(); title(); } }, t('Save & quit to title')),
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

function pickFromPouch(prompt, cb, { filter = () => true, cancel = t('Cancel') } = {}) {
  const list = run.pouch.filter(filter);
  const body = h('div.pouch-view', {}, h('h2', {}, prompt),
    list.length ? h('div.stone-grid', {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(s, 'X'), h('span', {}, stoneName(s)))))
      : h('p.dim', {}, t('Nothing to choose.')),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

// The card you pick glides to the middle of its row; the others fly off.
function pickCard(card, after) {
  const row = card.parentElement;
  const rr = row.getBoundingClientRect(), cr = card.getBoundingClientRect();
  card.style.setProperty('--dx', `${rr.left + rr.width / 2 - (cr.left + cr.width / 2)}px`);
  card.classList.add('picked');
  [...row.children].forEach((c, k) => {
    if (c === card) return;
    const side = c.getBoundingClientRect().left < cr.left ? -1 : 1;
    c.style.setProperty('--fx', `${side * (40 + 10 * k)}vw`);
    c.style.setProperty('--fr', `${side * (14 + 6 * k)}deg`);
    c.classList.add('unpicked');
  });
  row.style.pointerEvents = 'none';
  setTimeout(after, 480);
}

// A map aid as a reward card.
function aidCard(kind, onclick) {
  return pressable(h('button.card.aid-card', { 'aria-label': t(R.AIDS[kind].name) },
    h('div.trick-token', { html: icon(kind === 'breach' ? 'mountain' : 'rule-headstart') }),
    h('div.card-name', {}, t(R.AIDS[kind].name))), { tap: onclick, long: () => toast(t(R.AIDS[kind].text)) });
}
const pressHint = () => h('div.press-hint', {}, t('Long press for info.'));

function rewardScreen() {
  const rw = run.pending;
  const done = () => { R.leaveNode(run); route(); };
  const parts = [h('h1.reward-title', {}, rw.gift ? t('A gift!') : rw.tier === 'boss' ? t('Boss defeated!') : t('Victory!'))];
  if (rw.gold) parts.push(h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: rw.gold })));
  if (rw.relic && !rw.taken.relic) {
    R.gainRelic(run, rw.relic);
    rw.taken.relic = true;
    save();
  }
  // What it left behind, in one row: a relic (already yours) and a one-shot stone to take.
  const found = [];
  if (rw.relic) found.push(relicCard(rw.relic, { onclick: () => infoRelic(rw.relic) }));
  if (rw.once && !rw.taken.once) {
    found.push(stoneCard(rw.once, {
      onclick: () => takeStone(rw.once, (ok) => { if (ok) { rw.taken.once = true; save(); rewardScreen(); } }),
    }));
  }
  if (found.length) parts.push(h('div.section-label', {}, rw.relic ? t('Found') : t('A one-shot stone')), h('div.cards', {}, found));
  if (rw.relicChoice?.length && !rw.taken.boss) {
    parts.push(h('div.section-label', {}, t('Choose a boss relic')),
      h('div.cards', {}, rw.relicChoice.map((id) => relicCard(id, {
        onclick: (e) => { R.gainRelic(run, id); rw.taken.boss = id; sfx('coin'); save(); pickCard(e.currentTarget, rewardScreen); },
      }))));
  } else if (rw.taken.boss) parts.push(h('div.section-label', {}, t('Boss relic')), relicCard(rw.taken.boss, { onclick: () => infoRelic(rw.taken.boss) }));
  if (rw.taken.stone && rw.taken.stone !== true && !rw.taken.stone.startsWith('aid:')) parts.push(h('div.section-label', {}, t('You took the {stone}.', { stone: STONES[rw.taken.stone].name })), h('div.cards.one', {}, stoneCard({ type: rw.taken.stone }, {})));
  if (rw.taken.stone?.startsWith?.('aid:')) parts.push(h('div.section-label', {}, t('You took a map aid: {aid}.', { aid: t(R.AIDS[rw.taken.stone.slice(4)].name) })));
  if (rw.stones.length && !rw.taken.stone) {
    parts.push(h('div.section-label', {}, t('Take one')),
      h('div.cards', {}, rw.aid ? aidCard(rw.aid, (e) => { R.gainAid(run, rw.aid); rw.taken.stone = `aid:${rw.aid}`; sfx('coin'); save(); pickCard(e.currentTarget, rewardScreen); }) : null, rw.stones.map((s) => stoneCard(s, {
        onclick: (e) => {
          const card = e.currentTarget;
          takeStone(s, (ok) => {
            if (!ok) return;
            rw.taken.stone = s.type;
            save();
            pickCard(card, () => { if (run?.pending === rw) rewardScreen(); });
          });
        },
      }))));
  }
  parts.push(pressHint());
  const pendingBoss = rw.relicChoice?.length && !rw.taken.boss;
  parts.push(h('div.sticky-bottom', {}, h('button.btn.wide.big' + (pendingBoss ? '' : '.primary'), {
    onclick: () => { if (pendingBoss && !confirm(t('Leave without a boss relic?'))) return; done(); },
  }, (rw.stones.length && !rw.taken.stone) || (rw.once && !rw.taken.once) ? t('Skip') : t('Continue'))));
  screen(topBar(), h('div.page.reward', {}, parts));
}

function treasureScreen() {
  const tr = run.pending;
  screen(topBar(), h('div.page.reward', {},
    h('h1.reward-title', {}, t('Treasure!')),
    h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: tr.gold })),
    tr.relic ? [h('div.section-label', {}, t('Inside the chest')), relicCard(tr.relic, { onclick: () => infoRelic(tr.relic) })]
      : tr.choices?.length ? [h('div.section-label', {}, t('Take one')), h('div.cards', {}, tr.choices.map((id) => relicCard(id, {
        onclick: (e) => { R.gainRelic(run, id); tr.relic = id; sfx('coin'); save(); pickCard(e.currentTarget, treasureScreen); },
      })))]
        : null,
    pressHint(),
    h('div.sticky-bottom', {}, h('button.btn.wide.big' + (tr.relic || !tr.choices?.length ? '.primary' : ''), { onclick: () => { R.leaveNode(run); route(); } }, tr.relic || !tr.choices?.length ? t('Continue') : t('Skip')))));
}

// ── Shop ────────────────────────────────────────────────────────────────────

// A shop service as a card like the wares.
function serviceCard(ico, name, price, off, onclick) {
  return h('button.card.service-card' + (off ? '.sold' : run.gold < price ? '.dear' : ''), { onclick, disabled: off || undefined },
    h('div.relic-token', { html: icon(ico) }), h('div.card-name', {}, name), h('div.price', {}, iconEl('coin'), price));
}

function shopScreen(redraw = false) {
  const shop = run.pending.shop;
  const buy = (cost, fn) => {
    if (run.gold < cost) { toast(t('Not enough gold.'), 'bad'); return; }
    fn(() => { run.gold -= cost; sfx('coin'); save(); shopScreen(true); });
  };
  screen(...(redraw ? [KEEP_SCROLL] : []), topBar(), h('div.page.shop', {},
    h('div.section-label', {}, t('Stones')),
    h('div.cards.scroll', {}, shop.stones.map((s) => stoneCard(s, {
      price: s.price, sold: s.sold, dear: run.gold < s.price,
      onclick: () => buy(s.price, (pay) => takeStone(s, (ok) => { if (ok) { s.sold = true; pay(); } })),
    }))),
    h('div.section-label', {}, t('One-shot stones')),
    h('div.cards.scroll', {}, (shop.once ?? []).map((x) => stoneCard(x, {
      price: x.price, sold: x.sold, dear: run.gold < x.price,
      onclick: () => buy(x.price, (pay) => takeStone(x, (ok) => { if (ok) { x.sold = true; pay(); } })),
    }))),
    // Relics and services share a row of cards.
    h('div.section-label', {}, t('Relics and services')),
    h('div.cards.scroll', {},
      shop.relics.map((r) => relicCard(r.relic, {
        price: r.price, sold: r.sold || R.has(run, r.relic), dear: run.gold < r.price,
        onclick: () => buy(r.price, (pay) => { R.gainRelic(run, r.relic); r.sold = true; pay(); }),
      })),
      serviceCard('hand', t('+1 slot'), shop.slotPrice,
        shop.slotted || !R.canAddSlot(run), () => buy(shop.slotPrice, (pay) => { run.slots++; shop.slotted = true; pay(); toast(t('{n} slots', { n: R.handSize(run) }), 'good'); })),
      serviceCard('heart', '+1 ❤', shop.healPrice,
        run.hearts >= run.maxHearts || shop.healed >= 2, () => buy(shop.healPrice, (pay) => { run.hearts++; shop.healed++; sfx('heal'); pay(); }))),
    pressHint(),
    h('div.sticky-bottom', {}, h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Leave shop')))));
}

// ── Rest ────────────────────────────────────────────────────────────────────

function restScreen() {
  const heal = Math.max(2, Math.ceil(run.maxHearts * 0.4));
  const leave = () => { R.leaveNode(run); route(); };
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('fire') }),
    h('h2', {}, t('Campfire')),
    h('button.btn.wide.big', {
      disabled: run.hearts >= run.maxHearts || undefined,
      onclick: () => { run.hearts = Math.min(run.maxHearts, run.hearts + heal); sfx('heal'); musicEvent('heal'); toast(`+${heal} ❤`, 'good'); flash = 'heal'; leave(); },
    }, t('Rest: heal {n} ❤', { n: heal })),
    h('button.btn.wide.ghost', { onclick: leave }, t('Move on'))));
}

// ── Workshop: two stones for one of a higher tier ──────────────────────────

// Pick two stones, then one of two results. Calls done(text) with what came of it.
function craftFlow(done) {
  let picked = [];
  const pickBody = h('div.pouch-view');
  const drawPick = () => {
    const [a, b] = picked.map((u) => run.pouch.find((x) => x.uid === u));
    pickBody.replaceChildren(
      h('h2', {}, t('Trade which two stones?')),
      h('div.stone-grid.pick', {}, R.craftable(run).map((x) => h('button.pouch-slot' + (picked.includes(x.uid) ? '.on' : ''), {
        onclick: () => {
          picked = picked.includes(x.uid) ? picked.filter((u) => u !== x.uid) : picked.length < 2 ? [...picked, x.uid] : [picked[1], x.uid];
          sfx('click'); drawPick();
        },
      }, stoneEl(x, 'X'), infoName(x, 'X')))),
      h('p.dim', {}, b ? t('→ one {tier} stone', { tier: t(R.craftTier(a, b)) }) : t('Two stones → one better.')),
      h('button.btn.primary.wide', {
        disabled: !b || undefined,
        onclick: () => {
          closePick();
          const choices = R.craftChoices(run, a, b);
          const body = h('div.pouch-view', {}, h('h2', {}, t('Choose what to make')),
            h('div.cards', {}, choices.map((c) => stoneCard(c, {
              onclick: () => { closeChoice(); R.craft(run, a.uid, b.uid, c); sfx('coin'); save(); done(t('Your {a} and {b} become a {c}.', { a: stoneName(a), b: stoneName(b), c: stoneName(c) })); },
            }))));
          const closeChoice = modal(body, { dismissable: false, cls: 'tall' });
        },
      }, t('Trade')),
      h('button.btn.wide.ghost', { onclick: () => { closePick(); done(null); } }, t('Never mind')));
  };
  drawPick();
  const closePick = modal(pickBody, { dismissable: false, cls: 'tall' });
}

function craftScreen() {
  const leave = () => { R.leaveNode(run); route(); };
  const made = run.pending.made;
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('relic-anvil') }),
    h('h2', {}, t('Workshop')),
    h('p.dim', {}, made ?? (R.craftable(run).length >= 2 ? t('Two stones → one better.') : t('Needs two special stones.'))),
    !made && R.craftable(run).length >= 2 ? h('button.btn.wide.big', {
      onclick: () => craftFlow((text) => { if (text) { run.pending.made = text; save(); craftScreen(); } }),
    }, t('Trade two stones for one')) : null,
    h('button.btn.wide' + (made ? '.primary.big' : '.ghost'), { onclick: leave }, t('Move on'))));
}

// ── Events ──────────────────────────────────────────────────────────────────

function eventScreen() {
  const ev = EVENTS.find((e) => e.id === run.pending.id);
  const result = run.pending.result;
  const api = {
    rng: () => R.rand(run),
    pouchRoom: () => !R.pouchFull(run),
    // `pay` is charged on the first pick, so backing out costs nothing.
    craft: () => new Promise((resolve) => craftFlow((text) => resolve(text ?? t('You change your mind.')))),
    pickOnce: (text) => new Promise((resolve) => pickFromPouch(text, resolve, { filter: (x) => STONES[x.type].once, cancel: t('Never mind') })),
    chooseStone: (rarity, pay = null) => new Promise((resolve) => {
      const opts = R.stoneChoices(run, 'elite', rarity);
      const body = h('div.pouch-view', {}, h('h2', {}, t('Choose a stone')),
        h('div.cards', {}, opts.map((s) => stoneCard(s, { onclick: () => { close(); takeStone(s, (ok) => { if (ok) pay?.(); resolve(ok ? t('You take the {stone}.', { stone: stoneName(s) }) : t('You leave it be.')); }); } }))),
        h('button.btn.wide.ghost', { onclick: () => { close(); resolve(t('You take nothing.')); } }, t('None')));
      const close = modal(body, { dismissable: false, cls: 'tall' });
    }),
    gainRandomOnce: (rarity) => {
      const s = R.randomOnce(run, rarity);
      if (R.pouchFull(run)) return t('You find a {stone}, but your pouch is full.', { stone: stoneName(s) });
      R.gainStone(run, s);
      return t('You gain a {stone}.', { stone: stoneName(s) });
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
      resolve(t('It bubbles and hisses… and becomes a {stone}!', { stone: stoneName(s) }));
    })),
    duplicate: () => new Promise((resolve) => pickFromPouch(t('Duplicate which stone?'), (s) => {
      if (!s) return resolve(t('The reflection fades.'));
      R.gainStone(run, { type: s.type });
      resolve(t('A second {stone} climbs out of the pond.', { stone: stoneName(s) }));
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
  let grid = '';
  if (run.map?.won) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) { const w = run.map.won[r * 3 + c]; grid += w === 'X' ? '❌' : w === 'O' ? '⭕' : w === 'draw' ? '⬛' : '⬜'; }
      grid += '\n';
    }
    grid = grid.trimEnd();
  }
  const head = `Pif·Paf·Poe${run.heat ? t(' · heat {n}', { n: run.heat }) : ''}`;
  const line = victory ? t('Conquered the Summit 🏆') : t('Fell in act {n} ({act})', { n: run.act, act: ACTS[run.act - 1].name });
  const text = `${head}\n${line}\n${t('{won} duels won, {lost} lost', { won: run.stats.won, lost: run.stats.lost })}\n${grid}\n${location.href.split('#')[0]}`;
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => toast(t('Copied!'), 'good'), () => {
    const close = modal(h('div.menu', {}, h('h2', {}, t('Your result')), h('pre.share', {}, text), h('button.btn.wide', { onclick: () => close() }, t('OK'))));
  });
}

function endScreen(victory) {
  recordEnd();
  const st = run.stats;
  const mins = Math.round((Date.now() - st.started) / 60000);
  screen(h('div.page.end', {},
    h('div.end-emoji', {}, victory ? art('x', 'trophy', '🏆') : art('x', 'tombstone', '🪦')),
    h('h1', {}, victory ? t('You conquered the Summit!') : t('Your climb ends here')),
    h('p', {}, victory
      ? t(run.heat ? '{boss} bows. You are the champion at heat {n}.' : '{boss} bows. You are the champion.', { boss: ENEMIES[run.map.boss].name, n: run.heat })
      : t('Fallen in act {n}, {act}.', { n: run.act, act: ACTS[run.act - 1].name })),
    h('div.stats', {},
      h('div', {}, h('b', {}, st.won), tp(st.won, ' duel won', ' duels won')),
      h('div', {}, h('b', {}, st.lost), tp(st.lost, ' duel lost', ' duels lost')),
      h('div', {}, h('b', {}, st.elites), tp(st.elites, ' elite beaten', ' elites beaten')),
      h('div', {}, h('b', {}, st.bosses), tp(st.bosses, ' boss beaten', ' bosses beaten')),
      h('div', {}, h('b', {}, st.gold), t(' gold earned', { n: st.gold })),
      h('div', {}, h('b', {}, mins), tp(mins, ' minute', ' minutes'))),
    h('div.section-label', {}, t('Final pouch')),
    h('div.hand.show', {}, run.pouch.map((s) => stoneEl(s, 'X', { mini: true }))),
    relicStrip(),
    victory && meta.maxHeat > run.heat ? h('p.good', {}, t('Heat {n} unlocked!', { n: run.heat + 1 })) : null,
    h('button.btn.wide', { onclick: () => shareResult(victory) }, t('Copy result to share')),
    h('button.btn.primary.wide.big', { onclick: () => { run = null; duelState = null; newRunMenu(); } }, t('New run')),
    h('button.btn.wide', { onclick: () => { run = null; title(); } }, t('Title'))));
  try { localStorage.removeItem(SAVE); } catch { /* ignore */ }
}

// ── Boot ────────────────────────────────────────────────────────────────────

title();
// Browsers start audio only from a tap (on phones, its lift): the music begins with the first one.
for (const ev of ['pointerup', 'click', 'touchend', 'keydown']) document.addEventListener(ev, unlockMusic, { passive: true });
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline play is a bonus */ });
}
