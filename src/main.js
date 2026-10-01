// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, TRICKS, STONE_TYPES, TRICK_TYPES, CONDS, RULES, createGame } from './engine.js';
import { RELICS, RELIC_TYPES, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, hideToast, tapeUp, art, relicArt, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, infoStone, infoTrick, infoRelic, ruleChip, stoneCard, trickCard, relicCard, stoneName, langToggle } from './ui/common.js';
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

// Saves from before the evolved stones were retired: back to their plain forms.
const RETIRED = { rail: 'shift', pivot: 'rotate', electromagnet: 'magnet', stench: 'stinky', 4096: '2048', blast: 'bumper',
  teleport: 'swap', cyclone: 'whirl', kangaroo: 'frog', lighthouse: 'beacon', kaleidoscope: 'flip', bomb: 'firecracker' };
function migrate() {
  for (const st of run.pouch) st.type = RETIRED[st.type] ?? st.type;
  run.pouch = run.pouch.filter((st) => STONES[st.type]);
  run.tricks = run.tricks.filter((x) => TRICKS[x]);
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
  const saved = loadJSON(SAVE);
  const best = meta.best
    ? (meta.best.victory
      ? (meta.bestHeatWon > 0 ? t('Best: conquered the Summit at heat {n}', { n: meta.bestHeatWon }) : t('Best: conquered the Summit'))
      : t('Best: reached act {n}', { n: meta.best.act }))
    : t('Tic-tac-toe where the pieces move.');
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
        h('div.subtitle', {}, t('a roguelike of moving stones'))),
      h('div.title-buttons', {},
        saved?.run && !saved.run.over ? h('button.btn.primary.wide.big.continue', { onclick: () => { run = saved.run; duelState = saved.duel; migrate(); route(); } },
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
  const { x0, y0, x1, y1 } = R.mapBounds(map);
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const threats = new Set(R.bossThreats(map));
  const freshX = map.freshX, lastO = map.lastO;
  const breaching = map.armed === 'breach';
  const grid = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = R.keyOf(x, y);
      const c = map.cells[k];
      if (!c) { grid.push(h('div.map-fog')); continue; }
      const can = reach.has(k);
      const kind = c.kind;
      const el = h(`button.map-cell.${kind}` + (can ? '.reach' : '') + (c.mark ? '.marked' : '') + (breaching && kind === 'rock' ? '.breachable' : ''), {
        'aria-label': NODE_NAME[kind] ?? boss.name, dataset: { k },
        onclick: () => {
          if (breaching && kind === 'rock') { R.breach(run, k); sfx('thud'); save(); mapScreen(); return; }
          if (!can) {
            const why = kind === 'rock' ? t('A rock: nobody can mark it, and no line runs through it.')
              : c.mark === 'X' ? t('You have been here.')
                : c.mark === 'O' ? t('{boss} took this square.', { boss: boss.name })
                  : c.mark === 'S' ? t('A duel was lost here: the square is scorched. Only the boss may still take it.')
                    : t('The page is full: only the boss is left.');
            toast(why);
            return;
          }
          sfx('click');
          R.enterNode(run, k);
          duelState = null;
          route();
        },
      }, kind === 'boss-mark' || kind === 'rock' ? (kind === 'rock' ? h('span.doodle.rock', { html: icon('rock') }) : null) : c.duel
        ? h('span.doodle.foe', {}, h('span.photo', {}, ENEMIES[c.duel.enemyId].emoji),
          c.duel.conds?.length ? h('span.cell-space', { html: icon(`cond-${c.duel.conds[0]}`) }) : null)
        : h('span.doodle', { html: icon(NODE_ICON[kind]) }),
      kind === 'boss-mark' || kind === 'rock' ? null : h('span.label', {}, c.mark === 'S' ? t('Burned') : c.duel ? shortName(ENEMIES[c.duel.enemyId]) : NODE_NAME[kind]));
      if ((!c.mark || c.mark === 'S') && threats.has(k)) el.classList.add('boss-threat');
      if (c.mark === 'X') el.insertAdjacentHTML('beforeend', scribbleX(freshX === k));
      if (c.mark === 'O') el.insertAdjacentHTML('beforeend', scribbleO(lastO === k));
      if (c.mark === 'S') el.classList.add('scorched');
      if (kind === 'elite' && !c.mark) el.insertAdjacentHTML('beforeend', `<span class="elite-star">${icon('star')}</span>`);
      grid.push(el);
    }
  }
  if (freshX) sfx('scribbleX');
  if (lastO && freshX) sfx('scribbleO');
  map.freshX = null;
  map.lastO = null;
  const news = map.news === 'oline' ? t('{boss} drew three in a row — it grows stronger!', { boss: boss.name })
    : map.news === 'full' ? t('The page is full. {boss} will wait no longer — and it has grown stronger.', { boss: boss.name })
      : lastO && map.cells[lastO] && map.cells[lastO].kind !== 'boss-mark' ? t('{boss} marks the {node} square.', { boss: boss.name, node: NODE_NAME[map.cells[lastO].kind].toLowerCase() }) : '';
  const bonus = map.bonus;
  map.bonus = 0;
  map.news = null;
  if (bonus) setTimeout(() => toast(t('+{n} gold for pressing on past the open door.', { n: bonus }), 'good'), 50);
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
    h('div.door-rules', {}, (boss.rules ?? []).map((r) => ruleChip('rule', r, '.small'))),
    map.power ? h('div.power', {}, map.power >= 2 ? t('At full strength: it thinks harder, and brings its harder rules from the start.') : t('Grown stronger: it thinks harder.')) : null));
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
        : !R.xCount(run)
          ? t('The boss has made its first mark. Pick any square beside it; every mark reveals the paper around it. Rocks cut every line through them.')
          : R.pageFull(map) ? t('The page is full: only the boss is left.')
            : tp(R.PAGE - map.visited, 'Three Xs in a row open the door. {n} square left on this page.', 'Three Xs in a row open the door. {n} squares left on this page.')),
      threats.size ? h('div.map-help.red', {}, t('Dashed red circle: the boss would finish a line of Os there.')) : null));
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
    h('p', {}, t(['A summer camp. A field of stones that will not stay still.', 'The meadow is behind you. The ground turns to stone.', 'The air thins. Only the best players make it this far.'][act.n - 1])),
    h('div.rules-note', {}, t('This act is tic-tac-toe with {boss} on an endless page. It has made the first mark. Wherever you go you mark an X, and it answers with an O; every mark reveals the squares around it, and only those can be stepped on. Three Xs in a row open its door; each line of three Os makes it stronger. Rocks cut every line through them — and they turn up where your lines are about to close.', { boss: ENEMIES[run.map.boss].name })),
    run.act === 1 ? h('p.dim', {}, t('Somewhere beside it lies a gift: a special stone, free.')) : null,
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
  const canBack = duel.tier !== 'boss' && !duel.event;
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
        h('button.slot-plain', { onclick: () => infoStone({ type: 'pebble' }, 'O') }, stoneEl({ type: 'pebble' }, 'O')),
        duel.handO.map((s) => h('button.slot-plain', { onclick: () => infoStone(s, 'O') }, stoneEl(s, 'O')))),
      duel.tricksO.length ? h('div.enemy-tricks-pre', {}, t('Tricks: '), duel.tricksO.map((x) => h('button.link', { onclick: () => infoTrick(x) }, TRICKS[x].name))) : null,
      h('div.duel-facts.facts-card', {},
        (duel.rules ?? []).map((r) => h('div.fact.warn.rule-fact', {}, ruleChip('rule', r), h('span', {}, RULES[r].text))),
        (duel.conds ?? []).map((c) => h('div.fact.rule-fact', {}, ruleChip('cond', c), h('span', {}, CONDS[c].text))),
        h('div.fact', {}, (duel.rules ?? []).includes('patient') ? t('{enemy} opens', { enemy: enemy.name }) : t('{enemy} opens — a full board goes to you', { enemy: enemy.name })),
        duel.quirk ? h('div.fact.warn', {}, `${R.QUIRKS[duel.quirk].name}: ${R.QUIRKS[duel.quirk].text}`) : null,
        duel.tier === 'boss' && duel.bossWins === 0 && enemy.rules2 && enemy.rules2.join() !== duel.rules.join()
          ? h('div.fact.dim', {}, t('Once beaten, it rises again with: {rules}.', { rules: enemy.rules2.map((r) => RULES[r].name).join(', ') })) : null,
        h('div.fact.dim', {}, stakes)),
      h('div.section-label', {}, t('Bring your special stones '), count),
      h('div.dim.small', {}, t('Pebbles are always with you, as many as you like.')),
      run.pouch.length ? grid : h('p.dim', {}, t('Your pouch is empty: this one is Pebbles only. Win duels to find special stones.')),
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

function pickFromPouch(prompt, cb, { filter = () => true, cancel = t('Cancel') } = {}) {
  const list = run.pouch.filter(filter);
  const body = h('div.pouch-view', {}, h('h2', {}, prompt),
    list.length ? h('div.stone-grid', {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(s, 'X'), h('span', {}, stoneName(s)))))
      : h('p.dim', {}, t('Nothing to choose.')),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

// A map aid as a reward card.
function aidCard(kind, onclick) {
  return h('button.card.aid-card', { onclick },
    h('div.trick-token', { html: icon(kind === 'breach' ? 'mountain' : 'rule-headstart') }),
    h('div.card-name', {}, t(R.AIDS[kind].name)),
    h('div.card-text', {}, t(R.AIDS[kind].text)),
    h('div.dim.small', {}, t('map aid')));
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
  if (rw.taken.stone && rw.taken.stone !== true && !rw.taken.stone.startsWith('aid:')) parts.push(h('div.section-label', {}, t('You took the {stone}.', { stone: STONES[rw.taken.stone].name })), h('div.cards.one', {}, stoneCard({ type: rw.taken.stone }, {})));
  if (rw.taken.stone?.startsWith?.('aid:')) parts.push(h('div.section-label', {}, t('You took a map aid: {aid}.', { aid: t(R.AIDS[rw.taken.stone.slice(4)].name) })));
  if (rw.stones.length && !rw.taken.stone) {
    parts.push(h('div.section-label', {}, rw.aid ? t('Take a stone — or help on the map') : t('Take a stone')),
      h('div.cards', {}, rw.aid ? aidCard(rw.aid, () => { R.gainAid(run, rw.aid); rw.taken.stone = `aid:${rw.aid}`; sfx('coin'); save(); rewardScreen(); }) : null, rw.stones.map((s) => stoneCard(s, {
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

function shopScreen(redraw = false) {
  const shop = run.pending.shop;
  const buy = (cost, fn) => {
    if (run.gold < cost) { toast(t('Not enough gold.'), 'bad'); return; }
    fn(() => { run.gold -= cost; sfx('coin'); save(); shopScreen(true); });
  };
  screen(...(redraw ? [KEEP_SCROLL] : []), topBar(), h('div.page.shop', {},
    h('div.shop-head', {}, h('span.shop-emoji', { html: icon('shop') }), h('div', {}, h('h2', {}, t('The Travelling Merchant')), h('div.dim', {}, t('“Stones, tricks, trinkets. Gold only.”')))),
    h('div.section-label', {}, t('Stones')),
    h('div.cards.scroll', {}, shop.stones.map((s) => stoneCard(s, {
      price: s.price, sold: s.sold, dear: run.gold < s.price,
      onclick: () => buy(s.price, (pay) => takeStone(s, (ok) => { if (ok) { s.sold = true; pay(); } })),
    }))),
    h('div.section-label', {}, t('Tricks')),
    h('div.cards.scroll', {}, shop.tricks.map((x) => trickCard(x.trick, {
      price: x.price, sold: x.sold, dear: run.gold < x.price,
      onclick: () => buy(x.price, (pay) => takeTrick(x.trick, (ok) => { if (ok) { x.sold = true; pay(); } })),
    }))),
    shop.relics.length ? [h('div.section-label', {}, t('Relics')),
      h('div.cards.scroll', {}, shop.relics.map((r) => relicCard(r.relic, {
        price: r.price, sold: r.sold || R.has(run, r.relic), dear: run.gold < r.price,
        onclick: () => buy(r.price, (pay) => { R.gainRelic(run, r.relic); r.sold = true; pay(); }),
      })))] : null,
    h('div.section-label', {}, t('Services')),
    h('div.services', {},
      h('button.service', {
        disabled: shop.slotted || !R.canAddSlot(run) || undefined,
        onclick: () => buy(shop.slotPrice, (pay) => { run.slots++; shop.slotted = true; pay(); toast(t('You now bring {n} special stones into each duel.', { n: R.handSize(run) }), 'good'); }),
      }, h('b', {}, t('A new stone slot')), h('span.price' + (run.gold < shop.slotPrice ? '.dear' : ''), {}, iconEl('coin'), shop.slotPrice ?? '—'),
      h('span.dim', {}, shop.slotted ? t(' (done)') : R.canAddSlot(run) ? t(' bring {n} into each duel', { n: R.handSize(run) + 1 }) : t(' (as many as there can be)'))),
      h('button.service', {
        disabled: run.hearts >= run.maxHearts || shop.healed >= 2 || undefined,
        onclick: () => buy(shop.healPrice, (pay) => { run.hearts++; shop.healed++; sfx('heal'); pay(); }),
      }, h('b', {}, t('Bandage (+1 ❤)')), h('span.price' + (run.gold < shop.healPrice ? '.dear' : ''), {}, iconEl('coin'), shop.healPrice), h('span.dim', {}, t(' {n} left', { n: 2 - shop.healed })))),
    h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, t('Leave shop'))));
}

// ── Rest ────────────────────────────────────────────────────────────────────

function restScreen() {
  const heal = Math.max(2, Math.ceil(run.maxHearts * 0.4));
  const leave = () => { R.leaveNode(run); route(); };
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', { html: icon('fire') }),
    h('h2', {}, t('A quiet campfire')),
    h('p.dim', {}, run.hearts >= run.maxHearts ? t('Nothing to mend: you are at full hearts.') : t('Rest a while.')),
    h('button.btn.wide.big', {
      disabled: run.hearts >= run.maxHearts || undefined,
      onclick: () => { run.hearts = Math.min(run.maxHearts, run.hearts + heal); sfx('heal'); toast(`+${heal} ❤`, 'good'); flash = 'heal'; leave(); },
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
      h('div.stone-grid.pick', {}, run.pouch.map((x) => h('button.pouch-slot' + (picked.includes(x.uid) ? '.on' : ''), {
        onclick: () => {
          picked = picked.includes(x.uid) ? picked.filter((u) => u !== x.uid) : picked.length < 2 ? [...picked, x.uid] : [picked[1], x.uid];
          sfx('click'); drawPick();
        },
      }, stoneEl(x, 'X'), h('span', {}, stoneName(x)), h('span.slot-info', { onclick: (e) => { e.stopPropagation(); infoStone(x, 'X'); } }, 'ⓘ')))),
      h('p.dim', {}, b ? t('They become one {tier} stone, of two to choose from.', { tier: t(R.craftTier(a, b)) }) : t('Two stones become one of the next tier up from the humbler of them.')),
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
    h('h2', {}, t('A workshop in the woods')),
    h('p.dim', {}, made ?? (run.pouch.length >= 2 ? t('An anvil, a whetstone, and nobody about. Two stones could be worked into one finer.') : t('You would need two stones to work with.'))),
    !made && run.pouch.length >= 2 ? h('button.btn.wide.big', {
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
    trickRoom: () => !R.tricksFull(run),
    // `pay` is charged on the first pick, so backing out costs nothing.
    craft: () => new Promise((resolve) => craftFlow((text) => resolve(text ?? t('You change your mind.')))),
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
      const up = { common: 'uncommon', uncommon: 'rare', rare: 'rare' }[STONES[s.type].rarity];
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

// ── Help & codex ────────────────────────────────────────────────────────────

function showHelp(after) {
  const s = (x, p = 'X') => stoneEl({ type: x }, p, { mini: true });
  const pages = [
    h('div', {}, h('h2', {}, t('The duel')),
      h('p', {}, t('Tic-tac-toe on a 3×3 board: three of your stones in a row — across, down or diagonal — wins.')),
      h('p', {}, t('You are '), h('b.blue', {}, t('blue squares')), t(', the enemy is '), h('b.red', {}, t('red circles')), t('. The enemy always opens; then you take turns placing one stone each.')),
      h('p', {}, s('pebble'), ' ', h('b', {}, t('Pebbles never run out.')), t(' Both sides may always place another. Besides them you bring a few '), h('b', {}, t('special stones')), t(' that do something when placed — mostly move stones already on the board, yours and theirs alike. You start with none: you find them along the way, and bring two into a duel at first.'))),
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
      h('p', {}, t('Tap any stone, anywhere, to read what it does. At a workshop, two stones can be traded for one of a higher tier.'))),
    h('div', {}, h('h2', {}, t('The rules that decide')),
      h('p', {}, h('b', {}, t('A full board goes to you')), t(' — the enemy opened, so the tie is yours. Hold out, and you win.')),
      h('p', {}, t('Some duels carry a '), h('b', {}, t('condition')), t(' for both sides: gravity, a hollow centre, open hands.')),
      h('p', {}, t('Bosses bring no special stones at all. Instead each has '), h('b', {}, t('a rule in its favour')), t(' — it names the stone you play, closes a column, takes two turns at once… Read it before you choose your stones.'))),
    h('div', {}, h('h2', {}, t('The climb')),
      h('p', {}, t('Three acts. Each act is tic-tac-toe with its boss on an endless sheet of paper. It starts with a single O — the boss\'s first mark.')),
      h('p', {}, t('Wherever you go you mark an '), h('b.blue', {}, 'X'), t('; after each step the boss marks an '), h('b.red', {}, 'O'), t('. Every mark reveals the squares around it: duels, elites, shops, campfires, workshops, treasure, the unknown — and rocks, which nobody can mark and no line runs through.')),
      h('p', {}, h('b', {}, t('Three Xs in a row open the boss\'s door.')), t(' A lost duel scorches its square — only the boss may take it now — and you choose again. Each line of three Os, and filling the page, makes the boss stronger. Duels can also win map aids: a step the boss does not answer, or a pickaxe for a rock.')),
      h('p', {}, t('Every line of three is crossed through, and its marks are spent: they never count toward another line.')),
      h('p', {}, t('Before each duel you choose which special stones to bring. Shops sell more slots. Lose and it costs hearts; run out and the climb is over. Elites cost two hearts.'))),
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
      const order = ['pebble', ...STONE_TYPES.filter((x) => x !== 'pebble')];
      list = order.map((x) => h('div.codex-row', { onclick: () => infoStone({ type: x }, 'X'), style: { cursor: 'pointer' } }, stoneEl({ type: x }, 'X'), h('div', {},
        h('b', {}, STONES[x].name), h('span.info-rarity.' + STONES[x].rarity, {}, ' ' + t(STONES[x].rarity)),
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
