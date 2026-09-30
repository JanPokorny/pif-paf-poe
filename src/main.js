// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, TRICKS, STONE_TYPES, TRICK_TYPES, CONDS, RULES, createGame } from './engine.js';
import { RELICS, RELIC_TYPES, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, hideToast, art, relicArt, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, infoStone, infoTrick, infoRelic, ruleChip, stoneCard, trickCard, relicCard, stoneName, langToggle } from './ui/common.js';
import { icon } from './icons.js';
import { mountDuel } from './ui/duel.js';
import { sfx, soundOn, setSound } from './sound.js';
import { t, tp, lang, localizeData } from './i18n.js';

localizeData({
  stones: STONES, tricks: TRICKS, conds: CONDS, rules: RULES, relics: RELICS, enemies: ENEMIES, acts: ACTS, events: EVENTS,
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
    h('p.dim', {}, t('You bring {n} special stones into each duel, besides as many Pebbles as you like, and may spend {tricks} per duel.', { n: R.handSize(run), tricks: tp(R.trickUses(run), '{n} trick', '{n} tricks') })),
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
          h('span.continue-sub', {}, `${t('Act {n}', { n: saved.run.act })} · ❤ ${saved.run.hearts}`)) : null,
        h('button.btn.wide.big' + (saved?.run ? '' : '.primary'), { onclick: () => { if (saved?.run && !saved.run.over && !confirm(t('Start over? Your run in progress will be lost.'))) return; newRunMenu(); } }, t('New run')),
        h('button.btn.wide', { onclick: practiceMenu }, t('Practice duel')),
        meta.runs ? h('button.btn.wide', { onclick: showJournal }, t('Journal')) : null,
        h('button.btn.wide', { onclick: () => showHelp() }, t('How to play')),
        h('button.btn.wide', { onclick: showCodex }, t('Codex')),
        h('button.btn.wide.ghost', { onclick: () => { setSound(!soundOn()); title(); } }, h('span', { html: icon(soundOn() ? 'sound-on' : 'sound-off') }), soundOn() ? t('Sound on') : t('Sound off'))),
      h('div.title-foot', {}, best, h('br'), `${tp(meta.runs, '{n} run', '{n} runs')} · ${tp(meta.wins, '{n} win', '{n} wins')}`),
      langToggle()));
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

// ── Practice: one duel, nothing at stake ────────────────────────────────────

// What you have done across all runs: bosses beaten, records.
function showJournal() {
  const bosses = Object.keys(ENEMIES).filter((k) => ENEMIES[k].tier === 'boss');
  const body = h('div.menu.journal', {},
    h('h2', {}, t('Journal')),
    h('div.section-label', {}, t('Bosses beaten')),
    h('div.journal-grid', {}, bosses.map((id) => h('div.journal-item' + (meta.beaten?.[id] ? '.got' : ''), {},
      h('div.portrait', {}, h('div.photo', {}, ENEMIES[id].emoji)), h('span', {}, meta.beaten?.[id] ? ENEMIES[id].name : '?')))),
    h('div.section-label', {}, t('Records')),
    h('p', {}, t('{runs} runs, {wins} won, {duels} duels won in all.', { runs: meta.runs, wins: meta.wins, duels: meta.duelsWon ?? 0 })
      .replace(/^1 runs/, '1 run').replace(/, 1 duels/, ', 1 duel')),
    h('button.btn.wide', { onclick: () => close() }, t('Close')));
  const close = modal(body, { cls: 'tall' });
}

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
  const handX = R.stoneChoices(fake, 'normal', null, R.handSize(fake));
  const state = createGame({ ...R.gameConfig(fake, duel, []), handX, tricksX: [R.randomTrick(fake)] });
  const enemy = { ...ENEMIES[id], iters: duel.iters, blunder: duel.blunder, tier: 'normal', lives: 1, livesLeft: 1 };
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

const NODE_ICON = { fight: 'sword', elite: 'skull', shop: 'shop', rest: 'fire', event: 'question', treasure: 'chest', boss: 'crown', gift: 'star' };
const NODE_NAME = { 'boss-mark': t('Boss'), fight: t('Duel'), elite: t('Elite'), shop: t('Shop'), rest: t('Campfire'), event: t('Unknown'), treasure: t('Treasure'), boss: t('Boss'), gift: t('Gift') };

// The act's map: tic-tac-toe against its boss, a 3x3 page at a time.
function mapScreen() {
  if (run.map?.v !== 4) R.makeMap(run);   // a save from the 5x5 days: a fresh page
  const map = run.map;
  const reach = new Set(R.reachable(run));
  const boss = ENEMIES[map.boss];
  const { x0, y0, x1, y1 } = R.mapBounds(map);
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const threats = new Set(R.bossThreats(map));
  const freshX = map.freshX;
  const lastO = map.lastO;
  const grid = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = R.keyOf(x, y);
      const c = map.cells[k];
      const can = reach.has(k);
      const kind = c.kind === 'boss-mark' ? 'boss-mark' : c.kind;
      const el = h(`button.map-cell.${kind}` + (can ? '.reach' : '') + (c.mark ? '.marked' : ''), {
        'aria-label': NODE_NAME[kind] ?? boss.name, dataset: { k },
        onclick: () => {
          if (!can) {
            const why = map.result ? t('This page is over.') : c.mark === 'X' ? t('You have been here.') : c.mark === 'O' ? t('{boss} took this square.', { boss: boss.name }) : t('You lost the duel here: the square is scorched.');
            toast(why);
            return;
          }
          sfx('click');
          R.enterNode(run, k);
          duelState = null;
          route();
        },
      }, kind === 'boss-mark' ? null : c.duel
        ? h('span.doodle.foe', {}, h('span.photo', {}, ENEMIES[c.duel.enemyId].emoji),
          c.duel.conds?.length ? h('span.cell-space', { html: icon(`cond-${c.duel.conds[0]}`) }) : null)
        : h('span.doodle', { html: icon(NODE_ICON[kind]) }),
      kind === 'boss-mark' ? null : h('span.label', {}, c.duel ? shortName(ENEMIES[c.duel.enemyId]) : NODE_NAME[kind]));
      if (!c.mark && threats.has(k)) el.classList.add('boss-threat');
      if (c.mark === 'X') el.insertAdjacentHTML('beforeend', scribbleX(freshX === k));
      if (c.mark === 'O') el.insertAdjacentHTML('beforeend', scribbleO(lastO === k));
      if (c.mark === 'S') el.classList.add('scorched');
      if (map.line?.includes(k)) el.classList.add('in-line', map.result === 'won' ? 'line-x' : 'line-o');
      grid.push(el);
    }
  }
  if (freshX) sfx('scribbleX');
  if (lastO && freshX) sfx('scribbleO');
  map.freshX = null;
  map.lastO = null;
  const won = map.result === 'won';
  const news = map.result === 'lost' ? t('{boss} made three in a row: −1 ❤.', { boss: boss.name })
    : map.result === 'draw' ? t('The page is full, and nobody has three in a row.')
      : won ? t('Three in a row! The door is open.')
        : lastO && map.cells[lastO] && map.cells[lastO].kind !== 'boss-mark' ? t('{boss} marks the {node} square.', { boss: boss.name, node: NODE_NAME[map.cells[lastO].kind].toLowerCase() }) : '';
  if (map.result === 'lost' && lastO) { flash = 'hurt'; sfx('lose'); }
  const door = h('button.boss-door' + (won ? '.open' : ''), {
    onclick: () => {
      if (!won) { toast(t('Draw three Xs in a row — across, down or diagonal — to open the door.')); return; }
      R.enterNode(run, 'boss'); duelState = null; route();
    },
  },
  h('div.portrait', {}, h('div.photo', {}, boss.emoji)),
  h('div.door-text', {},
    h('div.door-name', {}, boss.name),
    won ? h('div', {}, t('The door is open. Tap to face the boss.')) : h('div', {}, t('Page {n}. Three in a row opens the door.', { n: map.page })),
    h('div.door-rules', {}, (boss.rules ?? []).map((r) => ruleChip('rule', r, '.small')))));
  const turn = map.result === 'lost' || map.result === 'draw'
    ? h('button.btn.primary.wide.big', { onclick: () => { R.nextPage(run); save(); route(); } }, t('Turn the page'))
    : null;
  // Lines of pencil between the squares on view, each a little crooked.
  const W = cols * 100, H = rows * 100;
  let paths = '';
  for (let i = 1; i < cols; i++) { const x = i * 100, w = ((i * 37) % 7) - 3; paths += `<path d="M${x + w} 4 C ${x - w} ${H * 0.33}, ${x + w} ${H * 0.66}, ${x - w / 2} ${H - 4}"/>`; }
  for (let j = 1; j < rows; j++) { const y = j * 100, w = ((j * 53) % 7) - 3; paths += `<path d="M4 ${y + w} C ${W * 0.33} ${y - w}, ${W * 0.66} ${y + w}, ${W - 4} ${y - w / 2}"/>`; }
  const sheet = h('div.map-sheet', { style: `--cols: ${cols}; --rows: ${rows}` },
    h('div.board-lines', { html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>` }),
    h('div.map-cells', {}, grid));
  const scroller = h('div.map-scroll', {}, sheet);
  screen(topBar(), relicStrip(),
    h('div.map-page', {},
      door,
      scroller,
      h('div.map-news' + (map.result === 'won' ? '.good' : ''), {}, news),
      turn,
      map.result ? (map.result === 'won' ? null : h('div.map-help', {}, t('The boss opens a fresh page — and every page hides fewer friends than the last.')))
        : h('div.map-help', {}, !R.xCount(run)
          ? t('The boss has opened in the middle. Go anywhere: you mark an X, then it marks an O — never on a shop, a campfire or a gift. Three Os in a row cost you a heart; a full page turns over.')
          : t('Three Xs in a row open the door. Three Os cost you a heart.')),
      threats.size ? h('div.map-help.red', {}, t('Dashed red circle: the boss would finish a line of Os there.')) : null));
}

function actIntro() {
  const act = ACTS[run.act - 1];
  screen(h('div.act-intro', {},
    h('div.act-n', {}, t('Act {n}', { n: act.n })),
    h('h1', {}, act.name),
    h('p', {}, t(['A summer camp. A field of stones that will not stay still.', 'The meadow is behind you. The ground turns to stone.', 'The air thins. Only the best players make it this far.'][act.n - 1])),
    h('div.rules-note', {}, t('This act is tic-tac-toe with {boss}, a page of nine squares at a time. It opens in the middle. Wherever you go you mark an X, and it answers with an O. Three Xs in a row open its door. Three Os cost you a heart, and a full page is a draw: either way it opens a fresh page, and each hides harder squares than the last.', { boss: ENEMIES[run.map.boss].name })),
    run.act === 1 ? h('p.dim', {}, t('Somewhere on the first page lies a gift: a special stone, free.')) : null,
    h('button.btn.primary.wide.big', { onclick: () => { run.screen = 'map'; route(); } }, t('Onward'))));
}

// ── Before a duel: see the enemy, choose your stones ────────────────────────

function preDuel() {
  const duel = run.pending.duel;
  const enemy = ENEMIES[duel.enemyId];
  const size = R.handSize(run);
  let chosen = R.defaultHand(run);
  const grid = h('div.stone-grid.pick');
  const count = h('span.count');
  const fight = h('button.btn.primary.wide.big', { onclick: begin }, t('Fight!'));
  const draw = () => {
    grid.replaceChildren(...run.pouch.map((s) => {
      const on = chosen.includes(s.uid);
      return h('button.pouch-slot' + (on ? '.on' : ''), {
        onclick: () => {
          if (on) chosen = chosen.filter((u) => u !== s.uid);
          else if (chosen.length < size) chosen.push(s.uid);
          else { toast(t('You can bring {n}. Tap one to leave it behind.', { n: size })); return; }
          sfx('click');
          draw();
        },
        oncontextmenu: (e) => { e.preventDefault(); infoStone(s, 'X'); },
      }, stoneEl(s, 'X'), h('span', {}, stoneName(s)),
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
    ? tp(R.BOSS_LIVES - duel.bossWins, 'It has {n} life left: each duel you win takes one, each you lose costs you 1 ❤.', 'It has {n} lives left: each duel you win takes one, each you lose costs you 1 ❤.')
    : t(duel.event ? 'Lose and it costs {n} ❤.' : 'Lose and it costs {n} ❤ — and the square is scorched.', { n: R.heartsLost(duel) });
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
      h('div.section-label', {}, duel.tier === 'boss' ? t('It brings no special stones — only Pebbles, and its rules') : t('Their stones')),
      h('div.hand.enemy-hand.show', {},
        h('button.slot-plain.pebble-mini', { onclick: () => infoStone({ type: 'pebble' }, 'O') }, stoneEl({ type: 'pebble' }, 'O'), h('span.inf', {}, '∞')),
        duel.handO.map((s) => h('button.slot-plain', { onclick: () => infoStone(s, 'O') }, stoneEl(s, 'O')))),
      duel.tricksO.length ? h('div.enemy-tricks-pre', {}, t('Tricks: '), duel.tricksO.map((x) => h('button.link', { onclick: () => infoTrick(x) }, TRICKS[x].name))) : null,
      h('div.duel-facts.facts-card', {},
        (duel.rules ?? []).map((r) => h('div.fact.warn.rule-fact', {}, ruleChip('rule', r), h('span', {}, RULES[r].text))),
        (duel.conds ?? []).map((c) => h('div.fact.rule-fact', {}, ruleChip('cond', c), h('span', {}, CONDS[c].text))),
        h('div.fact', {}, (duel.rules ?? []).includes('patient') ? t('{enemy} opens', { enemy: enemy.name }) : t('{enemy} opens — a full board goes to you', { enemy: enemy.name })),
        duel.quirk ? h('div.fact.warn', {}, `${R.QUIRKS[duel.quirk].name}: ${R.QUIRKS[duel.quirk].text}`) : null,
        duel.tier === 'boss' && duel.bossWins === 0 && enemy.rules2 && enemy.rules2.join() !== enemy.rules.join()
          ? h('div.fact.dim', {}, t('Once beaten, it rises again with: {rules}.', { rules: enemy.rules2.map((r) => RULES[r].name).join(', ') })) : null,
        h('div.fact.dim', {}, stakes)),
      h('div.section-label', {}, t('Bring your special stones '), count),
      h('div.dim.small', {}, t('Pebbles are always with you, as many as you like.')),
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
  const lives = duel.tier === 'boss' ? R.BOSS_LIVES : 1;
  const enemy = { ...ENEMIES[duel.enemyId], iters: duel.iters, blunder: duel.blunder, tier: duel.tier, lives, livesLeft: duel.tier === 'boss' ? lives - duel.bossWins : 1 };
  const holder = screen(h('div.duel-host'));
  const extra = h('div.duel-side', {},
    h('button.icon-btn.small', { onclick: showDuelMenu, 'aria-label': t('Menu') }, h('span', { html: icon('gear') })),
    h('div.hearts.small', {}, h('span', { html: icon('heart') }), `${run.hearts}`),
  );
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

// `evolve` marks a pick for evolving: each stone shows what it becomes.
function pickFromPouch(prompt, cb, { filter = () => true, cancel = t('Cancel'), evolve = false } = {}) {
  const list = run.pouch.filter(evolve ? (x) => filter(x) && STONES[x.type].evolvesTo : filter);
  const body = h('div.pouch-view', {}, h('h2', {}, prompt),
    list.length ? h('div.stone-grid' + (evolve ? '.upgrades' : ''), {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(s, 'X'), h('span', {}, stoneName(s)),
      evolve ? h('span.plus-note', {}, h('b', {}, `→ ${STONES[STONES[s.type].evolvesTo].name}: `), STONES[STONES[s.type].evolvesTo].text) : null)))
      : h('p.dim', {}, t('Nothing to choose.')),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

function rewardScreen() {
  const rw = run.pending;
  const done = () => { R.leaveNode(run); route(); };
  const parts = [h('h1.reward-title', {}, rw.gift ? t('A gift!') : rw.tier === 'boss' ? t('Boss defeated!') : t('Victory!'))];
  if (rw.gift && !rw.taken.stone) parts.push(h('p.dim', {}, t('Someone left a pouch by the path. Take one of these, free.')));
  if (rw.gold) parts.push(h('div.reward-gold', {}, h('span', { html: icon('coin') }), t('+{n} gold', { n: rw.gold })));
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
  if (rw.taken.stone && rw.taken.stone !== true) parts.push(h('div.section-label', {}, t('You took the {stone}.', { stone: STONES[rw.taken.stone].name })), h('div.cards.one', {}, stoneCard({ type: rw.taken.stone }, {})));
  if (rw.stones.length && !rw.taken.stone) {
    parts.push(h('div.section-label', {}, t('Take a stone')),
      h('div.cards', {}, rw.stones.map((s) => stoneCard(s, {
        onclick: (e) => {
          const card = e.currentTarget;
          takeStone(s, (ok) => {
            if (!ok) return;
            rw.taken.stone = s.type;
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
    tr.relic ? [h('div.section-label', {}, t('Inside the chest')), relicCard(tr.relic, { onclick: () => infoRelic(tr.relic) })]
      : tr.choices?.length ? [h('div.section-label', {}, t('Take one')), h('div.cards', {}, tr.choices.map((id) => relicCard(id, {
        onclick: () => { R.gainRelic(run, id); tr.relic = id; sfx('coin'); save(); treasureScreen(); },
      })))]
        : h('p', {}, t('The chest is otherwise empty.')),
    h('div.sticky-bottom', {}, h('button.btn.wide.big' + (tr.relic || !tr.choices?.length ? '.primary' : ''), { onclick: () => { R.leaveNode(run); route(); } }, tr.relic || !tr.choices?.length ? t('Continue') : t('Skip')))));
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
        disabled: shop.slotted || !R.canAddSlot(run) || undefined,
        onclick: () => buy(shop.slotPrice, (pay) => { run.slots++; shop.slotted = true; pay(); toast(t('You now bring {n} special stones into each duel.', { n: R.handSize(run) }), 'good'); }),
      }, h('b', {}, t('A new stone slot')), h('span.price', {}, iconEl('coin'), shop.slotPrice ?? '—'),
      h('span.dim', {}, shop.slotted ? t(' (done)') : R.canAddSlot(run) ? t(' bring {n} into each duel', { n: R.handSize(run) + 1 }) : t(' (as many as there can be)'))),
      h('button.service', {
        disabled: shop.upgraded || !R.upgradeable(run).length || undefined,
        onclick: () => buy(shop.upgradePrice, (pay) => pickFromPouch(t('Evolve which stone?'), (s) => { if (s) { R.evolve(s); shop.upgraded = true; pay(); } }, { evolve: true })),
      }, h('b', {}, t('Evolve a stone')), h('span.price', {}, iconEl('coin'), shop.upgradePrice), shop.upgraded ? h('span.dim', {}, t(' (done)')) : null),
      h('button.service', {
        disabled: run.hearts >= run.maxHearts || shop.healed >= 2 || undefined,
        onclick: () => buy(shop.healPrice, (pay) => { run.hearts++; shop.healed++; sfx('heal'); pay(); }),
      }, h('b', {}, t('Bandage (+1 ❤)')), h('span.price', {}, iconEl('coin'), shop.healPrice), h('span.dim', {}, t(' {n} left', { n: 2 - shop.healed })))),
    h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Leave shop'))));
}

// ── Rest ────────────────────────────────────────────────────────────────────

function restScreen() {
  const anvil = R.has(run, 'anvil');
  const heal = Math.max(2, Math.ceil(run.maxHearts * 0.4));
  const leave = () => { R.leaveNode(run); route(); };
  const p = run.pending;
  // With the Tiny Anvil, evolving leaves time to rest too.
  const canHeal = !p.healed && (!p.evolved || anvil) && run.hearts < run.maxHearts;
  const canEvolve = !p.evolved && (!p.healed || anvil) && R.upgradeable(run).length > 0;
  const doneOne = p.healed || p.evolved;
  if (doneOne && !canHeal && !canEvolve) { leave(); return; }
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('fire') }),
    h('h2', {}, doneOne ? t('The fire burns low') : t('A quiet campfire')),
    !doneOne ? h('p.dim', {}, run.hearts >= run.maxHearts && !R.upgradeable(run).length ? t('Nothing to mend and nothing left to evolve: you are at full hearts and every stone has grown up.')
      : anvil ? t('Rest a while and evolve a stone — the anvil makes quick work of it.') : t('Rest a while, or work on a stone.')) : null,
    canHeal ? h('button.btn.wide.big', {
      onclick: () => { run.hearts = Math.min(run.maxHearts, run.hearts + heal); p.healed = true; sfx('heal'); toast(`+${heal} ❤`, 'good'); flash = 'heal'; save(); restScreen(); },
    }, t('Rest: heal {n} ❤', { n: heal })) : null,
    canEvolve ? h('button.btn.wide.big', {
      onclick: () => pickFromPouch(t('Evolve which stone?'), (s) => {
        if (!s) return;
        R.evolve(s); p.evolved = true; sfx('coin'); save(); restScreen();
      }, { evolve: true }),
    }, t('Evolve a stone')) : null,
    h('button.btn.wide' + (doneOne ? '.primary.big' : '.ghost'), { onclick: leave }, t('Move on'))));
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
      const one = () => pickFromPouch(left > 1 ? t('Evolve a stone ({n} left)', { n: left }) : t('Evolve which stone?'), (s) => {
        if (s) { if (!done.length) pay?.(); R.evolve(s); left--; done.push(stoneName(s)); save(); }
        if (s && left > 0 && R.upgradeable(run).length) one();
        else resolve(done.length ? t('{text} You now have: {stones}.', { text, stones: done.join(', ') }) : t('You change your mind.'));
      }, { cancel: done.length ? t('Done') : t('Never mind'), evolve: true });
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
      const up = { common: 'uncommon', uncommon: 'rare', rare: 'rare' }[STONES[STONES[s.type].evolvesFrom ?? s.type].rarity];
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
  if (run.map && !Array.isArray(run.map.cells)) {
    const { x0, y0, x1, y1 } = R.mapBounds(run.map);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const m = run.map.cells[R.keyOf(x, y)]?.mark;
        grid += m === 'X' ? '❌' : m === 'O' ? '⭕' : m === 'S' ? '⬛' : '⬜';
      }
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

// ── Help & codex ────────────────────────────────────────────────────────────

function showHelp(after) {
  const s = (x, p = 'X') => stoneEl({ type: x }, p, { mini: true });
  const pages = [
    h('div', {}, h('h2', {}, t('The duel')),
      h('p', {}, t('Tic-tac-toe on a 3×3 board: three of your stones in a row — across, down or diagonal — wins.')),
      h('p', {}, t('You are '), h('b.blue', {}, t('blue squares')), t(', the enemy is '), h('b.red', {}, t('red circles')), t('. The enemy always opens; then you take turns placing one stone each.')),
      h('p', {}, s('pebble'), ' ', h('b', {}, t('Pebbles never run out.')), t(' Both sides may always place another. Besides them you bring a few '), h('b', {}, t('special stones')), t(' — two at first — which do something when placed: mostly move stones already on the board, yours and theirs alike.'))),
    h('div', {}, h('h2', {}, t('A turn')),
      h('p', {}, t('1. Tap a stone in your hand. Glowing squares show where it may go.')),
      h('p', {}, t('2. Tap a square. If the stone does something, you will see what — tap again or ✓ to confirm. If it can do it several ways, arrows and targets appear: tap one to preview it.')),
      h('p', {}, t('3. If you hold tricks, you may spend one before ending your turn.')),
      h('p', {}, t('Until your turn ends, ↩ Undo takes the whole turn back.'))),
    h('div', {}, h('h2', {}, t('Some stones')),
      h('p', {}, s('shift'), ' ', h('b', {}, STONES.shift.name), t(' slides its row or column one step, wrapping around.')),
      h('p', {}, s('rotate'), ' ', h('b', {}, STONES.rotate.name), t(' turns a 2×2 block clockwise.')),
      h('p', {}, s('magnet'), ' ', h('b', {}, STONES.magnet.name), t(': the enemy must place next to it. '), s('stinky'), ' ', h('b', {}, STONES.stinky.name), t(': must not.')),
      h('p', {}, s('mountain'), ' ', h('b', {}, STONES.mountain.name), t(' is never moved: moving stones step over it.')),
      h('p', {}, t('Tap any stone, anywhere, to read what it does. Most stones can '), h('b', {}, t('evolve')), t(' into a stronger, named stone (marked with a '), h('b.gold', {}, '★'), t(').'))),
    h('div', {}, h('h2', {}, t('The rules that decide')),
      h('p', {}, h('b', {}, t('A full board goes to you')), t(' — the enemy opened, so the tie is yours. Hold out, and you win.')),
      h('p', {}, t('Some duels carry a '), h('b', {}, t('condition')), t(' for both sides: gravity, a hollow centre, open hands.')),
      h('p', {}, t('Bosses bring no special stones at all. Instead each has '), h('b', {}, t('a rule in its favour')), t(' — it names the stone you play, closes a column, takes two turns at once… Read it before you choose your stones.'))),
    h('div', {}, h('h2', {}, t('The climb')),
      h('p', {}, t('Three acts. Each act is tic-tac-toe with its boss, on pages of nine squares: duels, elites, shops, campfires, treasure and the unknown. The boss opens every page in the middle.')),
      h('p', {}, t('Wherever you go you mark an '), h('b.blue', {}, 'X'), t('; after each step the boss marks an '), h('b.red', {}, 'O'), t(' — never on a shop, a campfire or a gift. A lost duel scorches its square.')),
      h('p', {}, h('b', {}, t('Three Xs in a row open the boss\'s door.')), t(' Three Os cost you a heart, and a full page is a draw; either way the boss opens a fresh page, each less friendly than the last.')),
      h('p', {}, t('Before each duel you choose which special stones to bring. Shops sell more slots. Lose and it costs hearts; run out and the climb is over. A boss has two lives.'))),
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
    const tabs = h('div.tabs', {}, ['stones', 'tricks', 'relics', 'rules', 'enemies'].map((x) => h('button.tab' + (x === tab ? '.on' : ''), { onclick: () => { tab = x; draw(); } }, t(x))));
    let list;
    if (tab === 'stones') {
      // Each stone, with its evolved form tucked under it.
      const order = ['pebble', ...STONE_TYPES.filter((x) => x !== 'pebble' && !STONES[x].evolvesFrom)].flatMap((x) => (STONES[x].evolvesTo ? [x, STONES[x].evolvesTo] : [x]));
      list = order.map((x) => h('div.codex-row' + (STONES[x].evolvesFrom ? '.evolved' : ''), { onclick: () => infoStone({ type: x }, 'X'), style: { cursor: 'pointer' } }, stoneEl({ type: x }, 'X'), h('div', {},
        h('b', {}, STONES[x].name), h('span.info-rarity.' + STONES[x].rarity, {}, ' ' + t(STONES[x].rarity)),
        STONES[x].evolvesFrom ? h('span.dim', {}, ' · ' + t('evolved {stone}', { stone: STONES[STONES[x].evolvesFrom].name })) : null,
        h('div', {}, STONES[x].text))));
    } else if (tab === 'rules') {
      list = [
        h('div.section-label', {}, t('Conditions: for both sides')),
        ...Object.keys(CONDS).map((c) => h('div.codex-row', {}, h('div.trick-token', { html: icon(`cond-${c}`) }), h('div', {}, h('b', {}, CONDS[c].name), h('div', {}, CONDS[c].text)))),
        h('div.section-label', {}, t('Boss rules: in the boss\'s favour')),
        ...Object.keys(RULES).map((r) => h('div.codex-row', {}, h('div.trick-token', { html: icon(`rule-${r}`) }), h('div', {}, h('b', {}, RULES[r].name), h('div', {}, RULES[r].text)))),
      ];
    } else if (tab === 'tricks') {
      list = TRICK_TYPES.map((x) => h('div.codex-row', { onclick: () => infoTrick(x), style: { cursor: 'pointer' } }, h('div.trick-token', { html: icon(x) }), h('div', {},
        h('b', {}, TRICKS[x].name), h('span.info-rarity.' + TRICKS[x].rarity, {}, ' ' + t(TRICKS[x].rarity)), h('div', {}, TRICKS[x].text))));
    } else if (tab === 'relics') {
      list = RELIC_TYPES.map((r) => h('div.codex-row', {}, h('div.relic-token.small', {}, relicArt(r)), h('div', {},
        h('b', {}, RELICS[r].name), h('span.info-rarity.' + RELICS[r].rarity, {}, ' ' + t(RELICS[r].rarity)), h('div', {}, RELICS[r].text))));
    } else {
      list = Object.values(ENEMIES).filter((e) => e.act > 0).map((e) => h('div.codex-row', {}, h('div.relic-token.small', {}, e.emoji), h('div', {},
        h('b', {}, e.name), h('span.dim', {}, ` · ${t('act {n}', { n: e.act })} ${t(e.tier)}`),
        e.core ? h('div.hand.show.tiny', {}, e.core.map((x) => stoneEl({ type: x }, 'O', { mini: true }))) : null,
        e.cond ? h('div.chips.inline', {}, ruleChip('cond', e.cond)) : null,
        e.rules ? h('div.chips.inline', {}, e.rules.map((r) => ruleChip('rule', r))) : null,
        e.rules2 && e.rules2.join() !== e.rules.join() ? h('div.dim', {}, t('Once beaten, it rises again with: {rules}.', { rules: e.rules2.map((r) => RULES[r].name).join(', ') })) : null)));
    }
    body.replaceChildren(tabs, h('div.codex-list', {}, list), h('button.btn.wide', { onclick: () => close() }, t('Close')));
    // A new tab starts at its top.
    for (let el = body; el; el = el.parentElement) el.scrollTop = 0;
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
