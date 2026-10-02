// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, CONDS, RULES, createGame } from './engine.js';
import { RELICS, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, hideToast, tapeUp, art, relicArt, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, ask, pressable, infoStone, infoRelic, infoRule, stoneCard, relicCard, stoneName, langToggle, energyBar } from './ui/common.js';
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
    h('div.energy', { onclick: () => toast(t('Energy: what your stones may cost together in a duel.')) }, h('span', { html: icon('energy') }), R.energyOf(run)),
    // On a narrow screen only the act's number: the place name gives way.
    h('div.where', {}, t('Act {n}', { n: run.act }), h('span.where-name', {}, ` · ${ACTS[run.act - 1].name.replace(/^The /, '')}`)),
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
    h('h2', {}, t('Pouch · {n}', { n: run.pouch.length })),
    run.pouch.length ? h('div.stone-grid', {}, run.pouch.map((s) => h('button.pouch-slot', { onclick: () => infoStone(s, 'X') }, stoneEl(s, 'X', { cost: true }), h('span', {}, stoneName(s)))))
      : h('p.dim', {}, t('No special stones yet. Pebbles you always have.')),
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
      onclick: async () => {
        if (!(await ask(t('Abandon this run? It will count as a loss.'), t('Abandon run')))) return;
        close();
        run.over = true; recordEnd(); duelState = null; save(); run = null; title();
      },
    }, t('Abandon run')),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Back')));
  const close = modal(body);
}

// Full screen, where the browser allows it (not on iPhones).
// It sticks: once on, leaving the game (or the back gesture) and coming back
// puts it back -- at once where the browser allows, else on the next tap.
const canFullscreen = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
let wantFull = false;
try { wantFull = localStorage.getItem('ppp-fullscreen') === 'on'; } catch { /* ignore */ }
function enterFullscreen() {
  if (!canFullscreen() || document.fullscreenElement) return;
  try { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* not allowed here */ }
}
function toggleFullscreen() {
  wantFull = !document.fullscreenElement;
  try { localStorage.setItem('ppp-fullscreen', wantFull ? 'on' : 'off'); } catch { /* ignore */ }
  if (wantFull) enterFullscreen();
  else try { document.exitFullscreen(); } catch { /* ignore */ }
}
const reFullscreen = () => { if (wantFull) enterFullscreen(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reFullscreen(); });
window.addEventListener('focus', reFullscreen);
for (const ev of ['pointerup', 'keydown']) document.addEventListener(ev, reFullscreen, { passive: true });

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
  // Energy in place of slots, and no Pebbles in the pouch: a slot past four
  // becomes energy, and each act already climbed one more.
  if ((run.v ?? 2) < 4) {
    run.energy = run.energy ?? Math.max(1, (run.slots ?? 4) - 3) + (run.act - 1);
    delete run.slots;
    run.pouch = run.pouch.filter((st) => st.type !== 'pebble');
    run.lastHand = null;
    run.v = 4;
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
        h('button.btn.wide.big' + (saved?.run ? '' : '.primary'), { onclick: async () => { if (saved?.run && !saved.run.over && !(await ask(t('Start over? Your run in progress will be lost.'), t('New run')))) return; newRunMenu(); } }, t('New run')),
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
const NODE_NAME = { 'boss-mark': t('Boss'), fight: t('Duel'), elite: t('Elite'), shop: t('Shop'), rest: t('Campfire'), event: t('Unknown'), treasure: t('Treasure'), boss: t('Boss'), rock: t('Rock'), gift: t('Gift'), craft: t('Workshop'), empty: t('Empty'), lair: t('Lair') };

// Each act's ground: what blocks the way (trees, boulders, crags), and empty ground.
const terrain = () => Math.min(3, Math.max(1, run?.act ?? 1));
const blockName = () => t(['Thicket', 'Boulders', 'Crag'][terrain() - 1]);

// The act's map: tic-tac-toe against its boss on an endless sheet, revealed
// a mark at a time.
function mapScreen() {
  if (run.map?.v !== 7) R.makeMap(run);   // a save from an older map: a fresh one
  const map = run.map;
  if (map.news === 'oline') flash = 'hurt';   // the hearts in the top bar take the hit
  R.placeLair(run, map);   // a page from before the lair
  // Your line has just opened the lair: it opens on the page once the marks are drawn.
  const opening = map.open && !map.doorHeard;
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
  // With no X of yours first (a fresh page), the O comes at once.
  const oAt = freshX ? 1.4 : 0.15;
  (map.revealO ?? []).forEach((k, i) => appear.set(k, oAt + 0.7 + i * 0.05));
  const grid = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = R.keyOf(x, y);
      const c = map.cells[k];
      if (!c) { grid.push(h('div.map-fog', { 'aria-hidden': 'true' }, '?')); continue; }
      const kind = c.kind;
      const can = kind === 'lair' ? map.open : reach.has(k);
      const el = h(`button.map-cell.${kind}` + (can && kind !== 'lair' ? '.reach' : '') + (c.mark && kind !== 'lair' ? '.marked' : '') + (kind === 'lair' && map.open && !opening ? '.open' : '') + (kind === 'lair' && (map.bossWins ?? 0) > 0 ? '.undead' : '') + (!c.mark && !can && kind !== 'lair' && !R.inReach(map, k) ? '.far' : ''), {
        'aria-label': NODE_NAME[kind] ?? boss.name, dataset: { k },
        onclick: () => {
          if (kind === 'lair') {
            if (!can) { toast(t('{boss}\'s lair. Three Xs in a row open it.', { boss: boss.name })); return; }
            sfx('click');
            R.enterNode(run, 'boss');
            duelState = null;
            route();
            return;
          }
          if (!can) {
            const why = kind === 'rock' ? t('{what}: no step, no line through it.', { what: blockName() })
              : c.mark === 'X' ? t('You have been here.')
                : c.mark === 'O' ? t('{boss} took this square.', { boss: boss.name })
                  : c.mark === 'S' ? t('Burned: only the boss may take it.')
                    : t('Too far: step next to an X or an O first.');
            toast(why);
            return;
          }
          sfx('click');
          R.enterNode(run, k);
          duelState = null;
          route();
        },
      }, kind === 'boss-mark' ? null : kind === 'lair' ? h('span.doodle.lair', { html: icon(`lair-${terrain()}`) }, h('span.lair-boss', {}, boss.emoji)) : kind === 'rock' ? h('span.doodle.rock', { html: icon(`block-${terrain()}`) })
        : kind === 'empty' ? h('span.doodle.empty', { html: icon(`empty-${terrain()}`) }) : c.duel
        ? h('span.doodle.foe', {}, h('span.photo', {}, ENEMIES[c.duel.enemyId].emoji))
        : h('span.doodle', { html: icon(NODE_ICON[kind]) }),
      kind === 'boss-mark' || kind === 'rock' || kind === 'empty' || kind === 'lair' ? null : h('span.label', {}, c.duel ? shortName(ENEMIES[c.duel.enemyId]) : NODE_NAME[kind]));
      if ((!c.mark || c.mark === 'S') && threats.has(k)) el.classList.add('boss-threat');
      if (c.mark === 'X') el.insertAdjacentHTML('beforeend', scribbleX(freshX === k));
      if (c.mark === 'O') el.insertAdjacentHTML('beforeend', scribbleO(lastO === k).replace('<svg ', `<svg style="--o-at: ${oAt}s" `));
      if (c.mark === 'S') el.classList.add('scorched');
      if (freshS === k) el.classList.add('fresh-burn');
      // The square's own picture stays a moment and fades as the mark is drawn.
      if (c.mark && (k === freshX || k === lastO || k === freshS) && kind !== 'boss-mark') {
        el.classList.add('fading');
        el.style.setProperty('--fd', k === lastO && k !== freshX ? `${oAt}s` : '0s');
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
  if (map.news === 'oline') musicEvent('stronger');
  if (map.open) map.doorHeard = true;
  // A line of the boss's Os costs you hearts: news of its own, once the O is drawn.
  if (map.news === 'oline') setTimeout(() => toast(t('{boss}: three in a row — −{n} ❤', { boss: boss.name, n: R.MAPCFG.lineDamage }), 'bad'), 2200);
  const news = lastO && map.cells[lastO] && map.cells[lastO].kind !== 'boss-mark' ? t('{boss} marks the {node} square.', { boss: boss.name, node: NODE_NAME[map.cells[lastO].kind].toLowerCase() }) : '';
  const bonus = map.bonus;
  map.bonus = 0;
  map.news = null;
  if (bonus) setTimeout(() => toast(`+${bonus} 🪙`, 'good'), 50);
  // The boss's lair, on the page: a hint while it is shut, another once it glows.
  const risen = (map.bossWins ?? 0) > 0;
  const openHint = () => h('div.door-hint.open', {}, h('span', { html: icon('crown') }), t('The lair is open: tap it to face {boss}.', { boss: risen ? undeadName(boss) : boss.name }));
  const door = map.open && !opening ? openHint()
    : h('div.door-hint', {}, h('span', { html: icon('crown') }), t('Three Xs in a row open the boss\'s lair.'));
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
      scroller,
      h('div.map-news', {}, news),
      h('div.map-help', {}, !R.xCount(run) ? t('Pick any square next to an X or an O.') : ''),
      threats.size ? h('div.map-help.red', {}, t('Dashed circle: the boss wins a line there.')) : null));
  // Keep the newest marks in view, scrolling the sheet only, never the page.
  const centre = (el) => ({ left: el.offsetLeft - scroller.clientWidth / 2 + el.offsetWidth / 2, top: el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2 });
  requestAnimationFrame(() => {
    const target = (freshX && scroller.querySelector(`[data-k="${freshX}"]`)) || scroller.querySelector('.map-cell.reach');
    if (!target) return;
    const c = centre(target);
    scroller.scrollLeft = c.left;
    scroller.scrollTop = c.top;
  });
  // The lair opens: the page glides over to it, it shakes, and it bursts into light.
  if (opening) {
    const lair = scroller.querySelector('.map-cell.lair');
    const later = (ms, fn) => setTimeout(() => { if (lair?.isConnected) fn(); }, ms);
    later(2300, () => scroller.scrollTo({ ...centre(lair), behavior: 'smooth' }));
    later(2800, () => { lair.classList.add('opening'); sfx('thud'); });
    later(3600, () => {
      lair.classList.remove('opening');
      lair.classList.add('open', 'burst');
      musicEvent('door');
      sfx('win');
      document.querySelector('.door-hint')?.replaceWith(openHint());
    });
  }
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
  // It lingers, then the night slowly lifts off the screen already drawn beneath it.
  let gone = false;
  const go = () => { if (gone) return; gone = true; done(); veil.classList.add('out'); setTimeout(() => veil.remove(), 1600); };
  veil.addEventListener('click', go);
  setTimeout(go, 4800);
}

// A stone's name with an (i): tapping the name reads the stone.
function infoName(s, player) {
  return h('span.info-name-link', { onclick: (e) => { e.stopPropagation(); infoStone(s, player); } }, stoneName(s), h('span.i', {}, ' ⓘ'));
}

// ── Before a duel: see the enemy, choose your stones ────────────────────────

function preDuel() {
  const duel = run.pending.duel;
  const enemy = ENEMIES[duel.enemyId];
  const energy = R.energyOf(run);
  let chosen = R.defaultHand(run);
  const grid = h('div.stone-row.pick');
  const bar = h('div.energy-slot');
  const fill = h('div.press-hint.pebble-fill');
  const fight = h('button.btn.primary.wide.big', { onclick: begin }, t('Fight!'));
  const draw = () => {
    grid.replaceChildren(...run.pouch.map((s) => {
      const on = chosen.includes(s.uid);
      return pressable(h('button.stone-pick' + (on ? '.on' : ''), { 'aria-label': stoneName(s) }, stoneEl(s, 'X', { cost: true })), {
        tap: () => {
          if (on) chosen = chosen.filter((u) => u !== s.uid);
          else if (R.handCost(run, [...chosen, s.uid]) <= energy) chosen.push(s.uid);
          else { toast(t('Not enough energy: it costs {n}, {left} left.', { n: R.costOf(s.type), left: energy - R.handCost(run, chosen) }), 'bad'); return; }
          sfx('click');
          draw();
        },
        long: () => infoStone(s, 'X'),
      });
    }));
    bar.replaceChildren(energyBar(R.handCost(run, chosen), energy));
    const pebbles = Math.max(0, R.HAND - chosen.length);
    fill.textContent = pebbles ? t('Pebbles fill the rest of your hand: {n}.', { n: pebbles }) : '';
  };
  draw();

  const tierLabel = { normal: '', elite: t('Elite'), boss: t('Boss'), event: t('Challenge') }[duel.tier];
  // What makes this duel different, each on its own slip of paper: the icon,
  // then its name and what it does. A boss's rules favour it; conditions hold for both.
  const note = (kind, ico, name, text, onclick) => h(`button.mod-note.${kind}`, { onclick },
    h('span.mod-ico', { html: ico }), h('span.mod-body', {}, h('span.mod-title', {}, name), h('span.mod-text', {}, text)));
  const facts = [
    ...(duel.rules ?? []).map((r) => note('rule', icon(`rule-${r}`), RULES[r].name, RULES[r].text, () => infoRule('rule', r))),
    ...(duel.conds ?? []).map((c) => note('cond', icon(`cond-${c}`), CONDS[c].name, CONDS[c].text, () => infoRule('cond', c))),
    duel.quirk ? note('quirk', icon('star'), R.QUIRKS[duel.quirk].name, R.QUIRKS[duel.quirk].text) : null,
  ].filter(Boolean);
  const moonrise = duel.tier === 'boss' && duel.bossWins === 0 && enemy.rules2 && enemy.rules2.join() !== duel.rules.join()
    ? h('div.press-hint.moon-note', {}, t('At moonrise: {rules}', { rules: enemy.rules2.map((r) => RULES[r].name).join(', ') })) : null;
  const canBack = !duel.event;
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
      facts.length ? h('div.mod-notes', {}, facts) : null,
      moonrise,
      h('div.section-label', {}, t('Their stones')),
      duel.handO.some((s) => s.type !== 'pebble') ? h('div.stone-row', {}, [...new Set(duel.handO.filter((s) => s.type !== 'pebble').map((s) => s.type))].map((type) => {
        const n = duel.handO.filter((s) => s.type === type).length;
        return h('button.stone-pick', { onclick: () => infoStone({ type }, 'O'), 'aria-label': stoneName({ type }) },
          stoneEl({ type }, 'O'), n > 1 ? h('span.hand-count', {}, `×${n}`) : null);
      })) : h('div.press-hint', {}, t('Only Pebbles.')),
      h('div.section-label', {}, t('Your stones')),
      bar,
      run.pouch.length ? grid : h('div.press-hint', {}, t('No special stones yet: Pebbles only.')),
      fill,
      run.pouch.length ? h('div.press-hint', {}, t('Long press stone for info.')) : null,
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

// Take a stone into the pouch: it holds any number.
function takeStone(s, done) { R.gainStone(run, s); sfx('coin'); done(true); }

function pickFromPouch(prompt, cb, { filter = () => true, cancel = t('Cancel') } = {}) {
  const list = run.pouch.filter(filter);
  const body = h('div.pouch-view', {}, h('h2', {}, prompt),
    list.length ? h('div.stone-grid', {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(s, 'X'), h('span', {}, stoneName(s)))))
      : h('p.dim', {}, t('Nothing to choose.')),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

const pressHint = () => h('div.press-hint', {}, t('Long press for info.'));
// A row of cards to choose one from, "or" between them.
const orRow = (cards) => h('div.cards.pick-one', {}, cards.flatMap((c, k) => (k ? [h('span.or', {}, t('or')), c] : [c])));
// The same as radio buttons: [value, card] pairs, the chosen one marked, the others faded.
function radioRow(chosen, items) {
  return orRow(items.map(([value, card]) => {
    if (chosen === value) card.classList.add('chosen');
    else if (chosen !== undefined) card.classList.add('unchosen');
    return card;
  }));
}

function rewardScreen() {
  const rw = run.pending;
  const parts = [h('h1.reward-title', {}, rw.gift ? t('A gift!') : rw.tier === 'boss' ? t('Boss defeated!') : t('Victory!'))];
  if (rw.gold) parts.push(h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: rw.gold })));
  if (rw.energy) parts.push(h('div.reward-gold.reward-energy', {}, h('span', { html: icon('energy') }), t('+{n} energy', { n: rw.energy })));
  if (rw.relic && !rw.taken.relic) {
    R.gainRelic(run, rw.relic);
    rw.taken.relic = true;
    save();
  }
  // What it left behind, as rows of cards: everything in a row of its own is
  // yours ("~ and ~" between rows); where a row offers a choice ("or" between
  // its cards), tap one to choose it. Continue takes it all, once every
  // choice is made.
  rw.sel = rw.sel ?? {};
  // (A save from before the form may have taken some of it already.)
  const want = { once: rw.once && !rw.taken.once, boss: rw.relicChoice?.length && !rw.taken.boss, stone: rw.stones.length && !rw.taken.stone };
  const rows = [];
  if (rw.relic) rows.push(h('div.cards.one', {}, relicCard(rw.relic, { onclick: () => infoRelic(rw.relic) })));
  if (want.once) rows.push(h('div.cards.one', {}, stoneCard(rw.once, { onclick: () => infoStone(rw.once, 'X') })));
  const choose = (key, value) => () => { rw.sel[key] = value; sfx('click'); save(); rewardScreen(); };
  if (want.boss) rows.push(radioRow(rw.sel.boss, rw.relicChoice.map((id) => [id, relicCard(id, { onclick: choose('boss', id) })])));
  if (want.stone) rows.push(radioRow(rw.sel.stone, rw.stones.map((st, k) => [k, stoneCard(st, { onclick: choose('stone', k) })])));
  rows.forEach((r, k) => { if (k) parts.push(h('div.and-sep', {}, t('~ and ~'))); parts.push(r); });
  parts.push(pressHint());
  const ready = (!want.boss || rw.sel.boss !== undefined) && (!want.stone || rw.sel.stone !== undefined);
  parts.push(h('div.sticky-bottom', {}, h('button.btn.wide.big.primary', {
    disabled: !ready || undefined,
    onclick: () => {
      if (want.once) R.gainStone(run, rw.once);
      if (want.boss) R.gainRelic(run, rw.sel.boss);
      if (want.stone) R.gainStone(run, rw.stones[rw.sel.stone]);
      sfx('coin');
      R.leaveNode(run);
      route();
    },
  }, ready ? t('Continue') : t('Choose first'))));
  screen(...(Object.keys(rw.sel).length ? [KEEP_SCROLL] : []), topBar(), h('div.page.reward', {}, parts));
}

function treasureScreen() {
  const tr = run.pending;
  screen(...(tr.sel !== undefined ? [KEEP_SCROLL] : []), topBar(), h('div.page.reward', {},
    h('h1.reward-title', {}, t('Treasure!')),
    h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: tr.gold })),
    tr.relic ? h('div.cards.one', {}, relicCard(tr.relic, { onclick: () => infoRelic(tr.relic) }))
      : tr.choices?.length ? radioRow(tr.sel, tr.choices.map((id) => [id, relicCard(id, { onclick: () => { tr.sel = id; sfx('click'); save(); treasureScreen(); } })]))
        : null,
    pressHint(),
    h('div.sticky-bottom', {}, h('button.btn.wide.big.primary', {
      disabled: (!tr.relic && tr.choices?.length && tr.sel === undefined) || undefined,
      onclick: () => { if (!tr.relic && tr.sel !== undefined) { R.gainRelic(run, tr.sel); sfx('coin'); } R.leaveNode(run); route(); },
    }, !tr.relic && tr.choices?.length && tr.sel === undefined ? t('Choose first') : t('Continue')))));
}

// ── Shop ────────────────────────────────────────────────────────────────────

// A shop service as a card like the wares.
function serviceCard(ico, name, price, off, onclick) {
  // Out of reach of your purse shows, whether or not the service is on offer at all.
  return h('button.card.service-card' + (off ? '.sold' : '') + (run.gold < price ? '.dear' : ''), { onclick, disabled: off || undefined },
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
      serviceCard('energy', t('+1 energy'), shop.energyPrice ?? shop.slotPrice,
        shop.energized || shop.slotted, () => buy(shop.energyPrice ?? shop.slotPrice, (pay) => { run.energy = (run.energy ?? 1) + 1; shop.energized = true; pay(); toast(t('{n} energy', { n: R.energyOf(run) }), 'good'); })),
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
      ? t(run.heat ? 'You beat {boss}. You are the champion at heat {n}.' : 'You beat {boss}. You are the champion.', { boss: ENEMIES[run.map.boss].name, n: run.heat })
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
