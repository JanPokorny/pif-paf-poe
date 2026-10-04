// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, CONDS, RULES, createGame } from './engine.js';
import { RELICS, OLD_PLUS_RELICS, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, hideToast, tapeUp, art, relicArt, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, ask, tickStone, infoStone, infoRelic, infoThing, stoneCard, relicCard, stoneName, langToggle, energyBar, statusLine } from './ui/common.js';
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
    run.pouch.length ? h('div.stone-grid', {}, run.pouch.map((p) => R.asBrought(run, p)).map((s) => h('button.pouch-slot', { onclick: () => infoStone(s, 'X') }, stoneEl(s, 'X', { cost: true }), h('span', {}, stoneName(s)))))
      : h('p.dim', {}, t('No special stones yet. Pebbles you always have.')),
    h('h2', {}, t('Talismans')),
    run.relics.length ? h('div.relic-list', {}, run.relics.map((r) => h('button.relic-row', { onclick: () => infoRelic(r) }, h('span.relic-token.small', {}, relicArt(r)), h('span', {}, h('b', {}, RELICS[r].name), h('br'), RELICS[r].text)))) : h('p.dim', {}, t('No talismans yet.')),
    h('button.btn.wide.ghost', { onclick: () => close() }, t('Close')));
  const close = modal(body, { cls: 'tall' });
}

function showMenu() {
  const body = h('div.menu', {},
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

// Saves with stones since retired: what each became. 'x+' is a + one-shot.
const RETIRED = { rail: 'shift', pivot: 'rotate', electromagnet: 'magnet', stench: 'stinky', 4096: 'gravity', 2048: 'gravity', blast: 'bumper',
  teleport: 'swap', cyclone: 'bonfire', whirl: 'bonfire', turncoat: 'swap', overtake: 'relocate', pluck: 'relocate', bribe: 'relocate',
  kangaroo: 'frog', lighthouse: 'magnet', beacon: 'magnet', kaleidoscope: 'bonfire', flip: 'bonfire', bomb: 'firecracker',
  mirror: 'swap+', nudge: 'lasso+', rehearse: 'parrot+' };
function migrate() {
  for (const st of run.pouch) {
    const to = RETIRED[st.type];
    if (!to) continue;
    st.type = to.replace(/\+$/, '');
    if (to.endsWith('+')) { st.plus = true; st.once = true; }
  }
  run.pouch = run.pouch.filter((st) => STONES[st.type]);
  // A + form since retired (Magnet+): the plain stone.
  for (const st of run.pouch) if (st.plus && !STONES[st.type].plus) delete st.plus;
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
  // Per-stone + talismans became grouped ones.
  run.relics = [...new Set(run.relics.map((x) => OLD_PLUS_RELICS[x] ?? x))].filter((x) => RELICS[x]);
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
  const resumable = saved?.run && !saved.run.over;
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
        resumable ? h('button.btn.primary.wide.big.continue', { onclick: () => { run = saved.run; duelState = saved.duel; migrate(); route(); } },
          h('span', {}, t('Continue run')),
          h('span.continue-sub', {}, `${t('Act {n}', { n: saved.run.act })} · ❤ ${saved.run.hearts}`)) : null,
        // The yellow button is Continue when there is a run to go back to, else New run.
        h('button.btn.wide.big' + (resumable ? '' : '.primary'), { onclick: async () => { if (resumable && !(await ask(t('Start over? Your run in progress will be lost.'), t('New run')))) return; newRunMenu(); } }, t('New run')),
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

const NODE_ICON = { fight: 'sword', elite: 'skull', rock: 'mountain', shop: 'shop', rest: 'fire', event: 'question', treasure: 'chest', boss: 'crown', gift: 'chest', craft: 'relic-anvil' };
const NODE_NAME = { 'boss-mark': t('Boss'), fight: t('Duel'), elite: t('Elite'), shop: t('Shop'), rest: t('Campfire'), event: t('Unknown'), treasure: t('Treasure'), boss: t('Boss'), rock: t('Rock'), gift: t('Treasure'), craft: t('Workshop'), empty: t('Empty'), lair: t('Lair') };

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
                : c.mark === 'O' ? t('The boss took this square.')
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
  // What happened on the page, oldest first: kept with the map, worded as it is shown.
  map.log ??= [];
  const news = [];   // [delay ms, entry]: this turn's news, in the order it is drawn
  if (freshX) news.push([0, { m: 'x', node: map.cells[freshX].kind }]);
  if (freshS) news.push([0, { m: 's', node: map.cells[freshS].kind }]);
  if (lastO && map.cells[lastO]?.kind !== 'boss-mark') news.push([oAt * 1000, { m: 'o', node: map.cells[lastO].kind }]);
  if (map.news === 'oline') news.push([2200, { m: 'oline', n: R.MAPCFG.lineDamage }]);
  if (opening) news.push([3600, { m: 'open' }]);
  if (map.news === 'thrown') news.push([0, { m: 'thrown', n: 1 }]);
  news.sort((a, b) => a[0] - b[0]);
  const risen = (map.bossWins ?? 0) > 0;
  const bossName = risen ? undeadName(boss) : boss.name;
  const say = (e) => {
    const node = (NODE_NAME[e.node] ?? '').toLowerCase();
    return e.m === 'x' ? [t('You mark the {node} square.', { node }), 'you']
      : e.m === 's' ? [t('You lost there: the {node} square burns.', { node }), 'you']
        : e.m === 'o' ? [t('The boss marks the {node} square.', { node }), 'bad']
          : e.m === 'oline' ? [t('The boss made three in a row: −{n} ❤', { n: e.n }), 'bad']
            : e.m === 'open' ? [t('Three in a row: the lair opens!'), 'good']
              : e.m === 'thrown' ? [t('The boss throws you out (−{n} ❤). The lair is shut again.', { n: e.n }), 'bad'] : ['', ''];
  };
  const line = statusLine({ history: map.log.map((e) => { const [text, kind] = say(e); return { text, kind }; }) });
  map.log.push(...news.map(([, e]) => e));
  if (map.log.length > 60) map.log.splice(0, map.log.length - 60);
  for (const [ms, e] of news) setTimeout(() => { if (line.el.isConnected) line.log(...say(e)); }, ms);
  map.news = null;
  // What to do next: the lair, once it glows; until then, the way to open it.
  const instruct = (open) => line.instruct(open ? t('The lair is open: tap it to face {boss}.', { boss: bossName })
    : !R.xCount(run) ? t('Pick any square next to an X or an O.') : t('Three Xs in a row open the boss\'s lair.'), open ? 'you' : '');
  instruct(map.open && !opening);
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
  const paper = h('div.map-paper', {}, sheet);
  const scroller = h('div.map-scroll', {}, paper);
  // The paper starts under the status line, and lines up with the sheet's cells.
  requestAnimationFrame(() => {
    document.querySelector('.screen')?.style.setProperty('--map-top', `${Math.ceil(line.el.getBoundingClientRect().bottom) + 6}px`);
    paper.style.backgroundPosition = `${sheet.offsetLeft % 24}px ${sheet.offsetTop % 24}px`;
  });
  screen(topBar(),
    h('div.map-page', {},
      line.el,
      scroller,
      threats.size ? h('div.map-help.red', {}, t('Dashed circle: the boss wins a line there.')) : null));
  // Keep the newest marks in view, scrolling the sheet only, never the page.
  // The middle of what shows below the status line.
  const centre = (el) => {
    const top = parseFloat(window.getComputedStyle(paper).paddingTop) || 0;
    const r = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    return {
      left: scroller.scrollLeft + r.left - sr.left - scroller.clientWidth / 2 + r.width / 2,
      top: scroller.scrollTop + r.top - sr.top - top - (scroller.clientHeight - top) / 2 + r.height / 2,
    };
  };
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
      instruct(true);
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

// ── Before a duel: see the enemy, choose your stones ────────────────────────

function preDuel() {
  const duel = run.pending.duel;
  const enemy = ENEMIES[duel.enemyId];
  const energy = R.energyOf(run);
  let chosen = R.defaultHand(run);
  const grid = h('div.stone-row.pick');
  const bar = h('div.energy-slot');
  // The Pebbles that fill a hand, as one stone with a count; a tap says why.
  const pebbles = (player, n, size) => {
    const chip = h('button.stone-pick.pebble-pick', {
      'aria-label': stoneName({ type: 'pebble' }),
      onclick: () => infoStone({ type: 'pebble' }, player, t(player === 'X' ? 'Pebbles fill your hand up to {n} stones.' : 'Pebbles fill their hand up to {n} stones.', { n: size })),
    }, stoneEl({ type: 'pebble' }, player), h('span.hand-count', {}, `×${n}`));
    if (!n) chip.classList.add('none');   // a full hand: no Pebbles, shown faint
    return chip;
  };
  const fight = h('button.btn.primary.wide.big', { onclick: begin }, t('Fight!'));
  const draw = () => {
    const fill = Math.max(0, R.HAND - chosen.length);
    grid.replaceChildren(...run.pouch.map((p) => R.asBrought(run, p)).map((s) => {
      const on = chosen.includes(s.uid);
      return tickStone(s, {
        on, face: '.stone-pick',
        toggle: () => {
          if (on) chosen = chosen.filter((u) => u !== s.uid);
          else if (R.handCost(run, [...chosen, s.uid]) <= energy) chosen.push(s.uid);
          else {
            // Over budget: the energy bar shakes its head.
            const e = bar.firstChild;
            e?.classList.remove('shake'); void e?.offsetWidth; e?.classList.add('shake');
            e?.addEventListener('animationend', () => e.classList.remove('shake'), { once: true });
            sfx('undo');
            return;
          }
          sfx('click');
          draw();
        },
      });
    }), pebbles('X', fill, R.HAND));
    bar.replaceChildren(energyBar(R.handCost(run, chosen), energy));
  };
  draw();

  const tierLabel = { normal: '', elite: t('Elite'), boss: t('Boss'), event: t('Challenge') }[duel.tier];
  // What makes this duel different, each on its own slip of paper: the icon,
  // then its name and what it does. A boss's rules favour it; conditions hold for both.
  // They show the whole text, so there is nothing more to open.
  const note = (kind, ico, name, text) => h(`div.mod-note.${kind}`, {},
    h('span.mod-ico', { html: ico }), h('span.mod-body', {}, h('span.mod-title', {}, name), h('span.mod-text', {}, text)));
  const facts = [
    ...(duel.rules ?? []).map((r) => note('rule', icon(`rule-${r}`), RULES[r].name, RULES[r].text)),
    ...(duel.conds ?? []).map((c) => note('cond', icon(`cond-${c}`), CONDS[c].name, CONDS[c].text)),
    duel.quirk ? note('quirk', icon('star'), R.QUIRKS[duel.quirk].name, R.QUIRKS[duel.quirk].text) : null,
  ].filter(Boolean);
  const canBack = !duel.event;
  screen(topBar(),
    h('div.page', {},
      h('div.enemy-card.' + duel.tier + (isUndead(duel) ? '.undead' : ''), {},
        h('div.portrait.big', {}, h('div.photo', {}, enemy.emoji)),
        h('div', {},
          tierLabel ? h('div.tier.' + duel.tier, {}, tierLabel) : null,
          h('div.enemy-name.big', {}, isUndead(duel) ? undeadName(enemy) : enemy.name),
          h('div.quote', {}, t('“{quote}”', { quote: enemy.quote })))),
      facts.length ? h('div.mod-notes', {}, facts) : null,
      h('div.section-label', {}, t('Their stones')),
      h('div.stone-row', {}, [...new Set(duel.handO.filter((s) => s.type !== 'pebble').map((s) => s.type))].map((type) => {
        const n = duel.handO.filter((s) => s.type === type).length;
        return h('button.stone-pick', { onclick: () => infoStone({ type }, 'O'), 'aria-label': stoneName({ type }) },
          stoneEl({ type }, 'O'), n > 1 ? h('span.hand-count', {}, `×${n}`) : null);
      }), duel.handO.some((s) => s.type === 'pebble') ? pebbles('O', duel.handO.filter((s) => s.type === 'pebble').length, duel.handO.length) : null),
      h('div.section-label.with-bar', {}, h('span', {}, t('Your stones')), bar),
      grid,
      h('div.sticky-bottom.pair', {},
        canBack ? h('button.btn.ghost.big.back-map', { onclick: () => { R.retreat(run); route(); } }, h('span', { html: icon('back') }), t('Back to the map')) : null,
        fight)));

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
      const bonus = R.goldFromLine(duelState);   // the gold stones in your line pay
      const draw = winner === 'X' && duelState.reason === 'full';
      duelState = null;
      // A draw counts as won, but costs a heart first -- the last one ends the run.
      if (draw) {
        flash = 'hurt';
        toast('−1 ❤', 'bad');
        if (R.hurt(run, 1)) { route(); return; }
      }
      if (winner === 'X') {
        const res = R.duelWon(run, bonus);
        if (res.kind === 'boss-continue') { if (bonus) toast(t('Gold stones: +{n} gold', { n: bonus }), 'good'); save(); moonrise(ENEMIES[duel.enemyId], route); return; }
        if (res.kind === 'reward' && duel.tier === 'boss') {
          meta.beaten = { ...(meta.beaten ?? {}), [duel.enemyId]: true };
          saveMeta();
        }
      } else {
        const res = R.duelLost(run);
        if (res.kind === 'rematch') toast(t('🎟️ {relic}: try again!', { relic: RELICS.rematch.name }), 'good');
        else if (res.kind === 'dead') { /* recorded by the end screen */ }
        else if (res.kind === 'lost') { toast(`−${R.heartsLost(duel)} ❤`, 'bad'); flash = 'hurt'; }
        else if (res.kind === 'boss-out') flash = 'hurt';
      }
      route();
    },
  });
}

function showDuelMenu() {
  const body = h('div.menu', {},
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
    list.length ? h('div.stone-grid', {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(R.asBrought(run, s), 'X', { cost: true }), h('span', {}, stoneName(R.asBrought(run, s))))))
      : h('p.dim', {}, t('Nothing to choose.')),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

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
  const parts = [h('h1.reward-title', {}, rw.gift ? t('Treasure!') : rw.tier === 'boss' ? t('Boss defeated!') : t('Victory!'))];
  if (rw.gold) parts.push(h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: rw.gold })));
  if (rw.goldStones) parts.push(h('p.dim.reward-note', {}, t('{n} of it from your gold stones.', { n: rw.goldStones })));
  if (rw.energy) parts.push(h('div.reward-gold.reward-energy', {}, h('span', { html: icon('energy') }), t('+{n} energy', { n: rw.energy })));
  if (rw.relic && !rw.taken.relic) {
    R.gainRelic(run, rw.relic);
    rw.taken.relic = true;
    save();
  }
  // What it left behind, as rows of cards: everything in a row of its own is
  // yours ("— and —" between rows, the dashes drawn); where a row offers a choice ("or" between
  // its cards), tap one to choose it. Continue takes it all, once every
  // choice is made.
  rw.sel = rw.sel ?? {};
  // (A save from before the form may have taken some of it already.)
  const want = { once: rw.once && !rw.taken.once, boss: rw.relicChoice?.length && !rw.taken.boss, stone: rw.stones.length && !rw.taken.stone };
  const rows = [];
  if (rw.relic) rows.push(h('div.cards.one', {}, relicCard(rw.relic, { onclick: () => infoRelic(rw.relic) })));
  if (want.once) rows.push(h('div.cards.one', {}, stoneCard(rw.once, { onclick: () => infoStone(rw.once, 'X') })));
  // With only one choice on the page, making it is taking it all.
  const single = !!want.boss + !!want.stone === 1;
  const choose = (key, value) => () => { rw.sel[key] = value; sfx('click'); save(); if (single) take(); else rewardScreen(); };
  const pick = (key, value) => ({ label: t('Pick'), run: choose(key, value) });
  if (want.boss) rows.push(radioRow(rw.sel.boss, rw.relicChoice.map((id) => [id, relicCard(id, { onclick: () => infoRelic(id, pick('boss', id)) })])));
  if (want.stone) rows.push(radioRow(rw.sel.stone, rw.stones.map((st, k) => [k, stoneCard(st, { onclick: () => infoStone(st, 'X', '', pick('stone', k)) })])));
  rows.forEach((r, k) => { if (k) parts.push(h('div.and-sep', {}, h('span.dash'), t('and'), h('span.dash'))); parts.push(r); });
  const ready = (!want.boss || rw.sel.boss !== undefined) && (!want.stone || rw.sel.stone !== undefined);
  function take() {
    if (want.once) R.gainStone(run, rw.once);
    if (want.boss) R.gainRelic(run, rw.sel.boss);
    if (want.stone) R.gainStone(run, rw.stones[rw.sel.stone]);
    sfx('coin');
    R.leaveNode(run);
    route();
  }
  parts.push(h('div.sticky-bottom', {}, h('button.btn.wide.big.primary', {
    disabled: !ready || undefined,
    onclick: take,
  }, ready ? t('Continue') : t('Choose first'))));
  screen(...(Object.keys(rw.sel).length ? [KEEP_SCROLL] : []), topBar(), h('div.page.reward', {}, parts));
}

function treasureScreen() {
  const tr = run.pending;
  screen(...(tr.sel !== undefined ? [KEEP_SCROLL] : []), topBar(), h('div.page.reward', {},
    h('h1.reward-title', {}, t('Treasure!')),
    h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: tr.gold })),
    tr.relic ? h('div.cards.one', {}, relicCard(tr.relic, { onclick: () => infoRelic(tr.relic) }))
      // Its one choice: picking a talisman takes it, and the treasure with it.
      : tr.choices?.length ? radioRow(tr.sel, tr.choices.map((id) => [id, relicCard(id, { onclick: () => infoRelic(id, { label: t('Pick'), run: () => { R.gainRelic(run, id); sfx('coin'); R.leaveNode(run); route(); } }) })]))
        : null,
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
  // Every ware opens its card first; the card's button buys it.
  const offer = (cost, fn) => ({ label: [t('Buy'), h('span.price-tag', {}, iconEl('coin'), cost)], disabled: run.gold < cost, run: () => buy(cost, fn) });
  screen(...(redraw ? [KEEP_SCROLL] : []), topBar(), h('div.page.shop', {},
    h('div.section-label', {}, t('Stones')),
    h('div.cards.scroll', {}, shop.stones.map((s) => stoneCard(s, {
      price: s.price, sold: s.sold, dear: run.gold < s.price,
      onclick: () => infoStone(s, 'X', '', offer(s.price, (pay) => takeStone(s, (ok) => { if (ok) { s.sold = true; pay(); } }))),
    }))),
    h('div.section-label', {}, t('Glass stones')),
    h('div.cards.scroll', {}, (shop.once ?? []).map((x) => stoneCard(x, {
      price: x.price, sold: x.sold, dear: run.gold < x.price,
      onclick: () => infoStone(x, 'X', '', offer(x.price, (pay) => takeStone(x, (ok) => { if (ok) { x.sold = true; pay(); } }))),
    }))),
    // Relics and services share a row of cards.
    h('div.section-label', {}, t('Talismans and services')),
    h('div.cards.scroll', {},
      shop.relics.map((r) => relicCard(r.relic, {
        price: r.price, sold: r.sold || R.has(run, r.relic), dear: run.gold < r.price,
        onclick: () => infoRelic(r.relic, offer(r.price, (pay) => { R.gainRelic(run, r.relic); r.sold = true; pay(); })),
      })),
      serviceCard('energy', t('+1 energy'), shop.energyPrice ?? shop.slotPrice,
        shop.energized || shop.slotted, () => infoThing({ art: icon('energy'), name: t('+1 energy'), text: t('One more energy in every duel from now on: room for a costlier stone.') },
          offer(shop.energyPrice ?? shop.slotPrice, (pay) => { run.energy = (run.energy ?? 1) + 1; shop.energized = true; pay(); toast(t('{n} energy', { n: R.energyOf(run) }), 'good'); }))),
      serviceCard('heart', '+1 ❤', shop.healPrice,
        run.hearts >= run.maxHearts || shop.healed >= 2, () => infoThing({ art: icon('heart'), name: '+1 ❤', text: t('Heal one heart. Twice per shop at most.') },
          offer(shop.healPrice, (pay) => { run.hearts++; shop.healed++; sfx('heal'); pay(); })))),
    h('div.sticky-bottom', {}, h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Leave shop')))));
}

// ── Rest ────────────────────────────────────────────────────────────────────

function restScreen() {
  const heal = Math.max(2, Math.ceil(run.maxHearts * 0.4));
  const leave = () => { R.leaveNode(run); route(); };
  // Like every screen: what to do in the bar at the bottom, the main choice in yellow.
  const full = run.hearts >= run.maxHearts;
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('fire') }),
    h('h2', {}, t('Campfire')),
    full ? h('p.dim', {}, t('Your hearts are full.')) : null,
    h('div.sticky-bottom.pair', {},
      h('button.btn.ghost.big.wide', { onclick: leave }, t('Move on')),
      h('button.btn.primary.big.wide', {
        disabled: full || undefined,
        onclick: () => { run.hearts = Math.min(run.maxHearts, run.hearts + heal); sfx('heal'); musicEvent('heal'); toast(`+${heal} ❤`, 'good'); flash = 'heal'; leave(); },
      }, t('Rest: heal {n} ❤', { n: heal })))));
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
      // As before a duel: the box ticks a stone, a tap on it opens its card.
      h('div.stone-grid', {}, R.craftable(run).map((x) => tickStone(R.asBrought(run, x), {
        on: picked.includes(x.uid), name: true, face: '.pouch-slot',
        toggle: () => {
          picked = picked.includes(x.uid) ? picked.filter((u) => u !== x.uid) : picked.length < 2 ? [...picked, x.uid] : [picked[1], x.uid];
          sfx('click'); drawPick();
        },
      }))),
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

// Make one stone of the pouch marble or gold, for `cost` gold. Calls done(text), or done(null).
function polishFlow(mat, cost, done) {
  pickFromPouch(mat === 'marble' ? t('Which stone in marble?') : t('Which stone in gold?'), (s) => {
    if (!s) return done(null);
    run.gold -= cost;
    R.polish(run, s.uid, mat);
    sfx('coin'); save();
    done(t(mat === 'marble' ? 'Your {stone} is marble now.' : 'Your {stone} is gold now.', { stone: stoneName(s) }));
  }, { filter: (x) => R.polishable(run).includes(x), cancel: t('Never mind') });
}

function craftScreen() {
  const leave = () => { R.leaveNode(run); route(); };
  const made = run.pending.made;
  const did = (text) => { if (text) { run.pending.made = text; save(); craftScreen(); } };
  // One job a visit: a trade, or a stone made marble or gold.
  const price = (mat) => R.price(run, R.POLISH[mat]);
  const jobs = [
    { label: t('Trade two stones'), detail: t('Two stones → one better.'), ok: R.craftable(run).length >= 2, go: () => craftFlow(did) },
    ...R.MATERIALS.map((mat) => ({
      label: mat === 'marble' ? t('Marble') : t('Gold'),
      detail: t(mat === 'marble' ? 'Pay {n} gold: a stone of yours goes anywhere, whatever their stones restrict.' : 'Pay {n} gold: a stone of yours pays 10 gold in your winning line.', { n: price(mat) }),
      ok: run.gold >= price(mat) && R.polishable(run).length > 0,
      go: () => polishFlow(mat, price(mat), did),
    })),
  ];
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('relic-anvil') }),
    h('h2', {}, t('Workshop')),
    made ? h('p.event-result.good', {}, made)
      : h('div.choices', {}, jobs.map((j) => h('button.choice' + (j.ok ? '' : '.disabled'), { disabled: !j.ok || undefined, onclick: j.go },
        h('b', {}, j.label), h('span.dim', {}, ' — ' + j.detail)))),
    // As everywhere: leaving dashed; once a job is done, leaving is the way on, in yellow.
    h('div.sticky-bottom', {}, h(made ? 'button.btn.primary.big.wide' : 'button.btn.ghost.big.wide', { onclick: leave }, t('Move on')))));
}

// ── Events ──────────────────────────────────────────────────────────────────

function eventScreen() {
  const ev = EVENTS.find((e) => e.id === run.pending.id);
  const result = run.pending.result;
  const api = {
    rng: () => R.rand(run),
    // `pay` is charged on the first pick, so backing out costs nothing.
    craft: () => new Promise((resolve) => craftFlow((text) => resolve(text ?? t('You change your mind.')))),
    pickOnce: (text) => new Promise((resolve) => pickFromPouch(text, resolve, { filter: (x) => R.isOnce(x), cancel: t('Never mind') })),
    chooseStone: (rarity, pay = null) => new Promise((resolve) => {
      const opts = R.stoneChoices(run, 'elite', rarity);
      const body = h('div.pouch-view', {}, h('h2', {}, t('Choose a stone')),
        // As everywhere: a tap opens the stone's card, whose button takes it.
        h('div.cards', {}, opts.map((s) => stoneCard(s, { onclick: () => infoStone(s, 'X', '', { label: t('Pick'), run: () => { close(); takeStone(s, (ok) => { if (ok) pay?.(); resolve(ok ? t('You take the {stone}.', { stone: stoneName(s) }) : t('You leave it be.')); }); } }) }))),
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
    canPolish: () => R.polishable(run).length > 0,
    polish: (mat, cost) => new Promise((resolve) => polishFlow(mat, cost, (text) => resolve(text ?? t('You change your mind.')))),
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
  // What a choice came to, by what it changed: anything gained is good news
  // (even paid for), only losses bad, nothing at all neither.
  const sig = () => ({ hearts: run.hearts, maxHearts: run.maxHearts, gold: run.gold, energy: run.energy ?? 0, relics: run.relics.length, pouch: JSON.stringify(run.pouch) });
  const moodOf = (a, b) => {
    const gained = b.hearts > a.hearts || b.maxHearts > a.maxHearts || b.gold > a.gold || b.energy > a.energy || b.relics > a.relics
      || (b.pouch !== a.pouch && JSON.parse(b.pouch).length >= JSON.parse(a.pouch).length);
    const lost = b.hearts < a.hearts || b.maxHearts < a.maxHearts || b.gold < a.gold || JSON.parse(b.pouch).length < JSON.parse(a.pouch).length;
    return gained ? 'good' : lost ? 'bad' : '';
  };
  const choose = (c) => async () => {
    // A reload in the middle of a choice must not offer the event again.
    run.pending.result = t('You move on.');
    save();
    const was = sig();
    const out = await c.act(run, api);
    if (out === null) return;   // it started a duel
    run.pending.result = out;
    run.pending.mood = moodOf(was, sig());
    save();
    eventScreen();
  };
  const leave = result ? null : ev.choices.find((c) => c.leave);
  const choices = result
    ? [h('p.event-result' + (run.pending.mood ? '.' + run.pending.mood : ''), {}, result)]
    : ev.choices.filter((c) => !c.leave).map((c) => {
      const ok = !c.can || c.can(run, api);
      return h('button.choice' + (ok ? '' : '.disabled'), {
        disabled: !ok || undefined,
        onclick: choose(c),
      }, h('b', {}, c.label), c.detail ? h('span.dim', {}, ' — ' + c.detail) : null);
    });
  screen(topBar(), h('div.page.event', {},
    h('div.event-emoji', {}, art('event', ev.id, ev.emoji)),
    h('h2', {}, ev.title),
    h('p', {}, ev.text),
    h('div.choices', {}, choices),
    // The way on, in the bottom bar like every Continue; before a choice, the way past it,
    // dashed, as every way out: it leaves at once.
    result ? h('div.sticky-bottom', {}, h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Continue')))
      : leave ? h('div.sticky-bottom', {}, h('button.btn.ghost.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, leave.label)) : null));
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
    const close = modal(h('div.menu', {}, h('h2', {}, t('Your result')), h('pre.share', {}, text), h('button.btn.wide.ghost', { onclick: () => close() }, t('Close'))));
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
    h('div.hand.show', {}, run.pouch.map((s) => stoneEl(R.asBrought(run, s), 'X', { mini: true }))),
    relicStrip(),
    victory && meta.maxHeat > run.heat ? h('p.good', {}, t('Heat {n} unlocked!', { n: run.heat + 1 })) : null,
    h('button.btn.wide', { onclick: () => shareResult(victory) }, t('Copy result to share')),
    // Leaving is the dashed button, the way on the yellow one at the bottom, as everywhere.
    h('div.sticky-bottom.pair', {},
      h('button.btn.ghost.big.wide', { onclick: () => { run = null; title(); } }, t('Main menu')),
      h('button.btn.primary.big.wide', { onclick: () => { run = null; duelState = null; newRunMenu(); } }, t('New run')))));
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
