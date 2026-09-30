// The app: title, run screens, persistence. One screen at a time, chosen by
// run.screen, rendered into #app.

import { STONES, TRICKS, STONE_TYPES, TRICK_TYPES, createGame, FIELDS } from './engine.js';
import { RELICS, RELIC_TYPES, ENEMIES, ACTS, EVENTS } from './content.js';
import * as R from './run.js';
import { h, scribbleX, scribbleO, stoneEl, iconEl, toast, modal, infoStone, infoTrick, infoRelic, infoSpace, infoField, stoneCard, trickCard, relicCard, stoneName } from './ui/common.js';
import { icon } from './icons.js';
import { mountDuel } from './ui/duel.js';
import { sfx, soundOn, setSound } from './sound.js';

const app = document.getElementById('app');
const SAVE = 'ppp-run-v1';
const META = 'ppp-meta-v1';

let run = null;
let duelState = null;   // the engine state of a duel in progress, saved with the run
let duelView = null;

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
  const hearts = h('div.hearts', {},
    h('span', { html: icon('heart') }), `${run.hearts}/${run.maxHearts}`);
  return h('div.topbar', {},
    hearts,
    h('div.gold', {}, h('span', { html: icon('coin') }), run.gold),
    h('div.where', {}, `Act ${run.act} · ${ACTS[run.act - 1].name}`),
    h('button.icon-btn', { onclick: showPouch, 'aria-label': 'Your pouch' }, h('span', { html: icon('hand') })),
    h('button.icon-btn', { onclick: showMenu, 'aria-label': 'Menu' }, h('span', { html: icon('gear') })));
}

function screen(...children) {
  const el = h('div.screen', {}, ...children);
  app.replaceChildren(el);
  app.scrollTop = 0;
  window.scrollTo(0, 0);
  return el;
}

function relicStrip() {
  if (!run.relics.length) return null;
  return h('div.relic-strip', {}, run.relics.map((r) => h('button.relic-mini', { onclick: () => infoRelic(r), title: RELICS[r].name }, RELICS[r].emoji)));
}

function showPouch() {
  const body = h('div.pouch-view', {},
    h('h2', {}, `Pouch · ${run.pouch.length}/${R.pouchCap(run)}`),
    h('div.stone-grid', {}, run.pouch.map((s) => h('button.pouch-slot', { onclick: () => infoStone(s, 'X') }, stoneEl(s, 'X'), h('span', {}, stoneName(s))))),
    h('h2', {}, `Tricks · ${run.tricks.length}/${R.trickCap(run)}`),
    run.tricks.length ? h('div.trick-list', {}, run.tricks.map((t) => h('button.trick-btn', { onclick: () => infoTrick(t) }, h('span.trick-ico', { html: icon(t) }), TRICKS[t].name))) : h('p.dim', {}, 'No tricks.'),
    h('h2', {}, 'Relics'),
    run.relics.length ? h('div.relic-list', {}, run.relics.map((r) => h('button.relic-row', { onclick: () => infoRelic(r) }, h('span.relic-token.small', {}, RELICS[r].emoji), h('span', {}, h('b', {}, RELICS[r].name), h('br'), RELICS[r].text)))) : h('p.dim', {}, 'No relics yet.'),
    h('p.dim', {}, `You bring ${R.handSize(run)} stones into each duel and may spend ${R.trickUses(run)} trick${R.trickUses(run) > 1 ? 's' : ''} per duel.`),
    h('button.btn.wide', { onclick: () => close() }, 'Close'));
  const close = modal(body, { cls: 'tall' });
}

function showMenu() {
  const body = h('div.menu', {},
    h('h2', {}, 'Menu'),
    h('button.btn.wide', { onclick: () => { close(); showHelp(); } }, 'How to play'),
    h('button.btn.wide', { onclick: () => { close(); showCodex(); } }, 'Codex'),
    h('button.btn.wide', { onclick: () => { setSound(!soundOn()); close(); toast(soundOn() ? 'Sound on' : 'Sound off'); } }, soundOn() ? 'Sound: on' : 'Sound: off'),
    h('button.btn.wide', { onclick: () => { close(); title(); } }, 'Save & quit to title'),
    h('button.btn.wide.danger', {
      onclick: () => {
        if (!confirm('Abandon this run? It will count as a loss.')) return;
        close();
        run.over = true; recordEnd(); duelState = null; save(); run = null; title();
      },
    }, 'Abandon run'),
    h('button.btn.wide.ghost', { onclick: () => close() }, 'Back'));
  const close = modal(body);
}

// ── Title ───────────────────────────────────────────────────────────────────

function title() {
  duelView?.destroy();
  duelView = null;
  const saved = loadJSON(SAVE);
  const best = meta.best
    ? (meta.best.victory ? `Best: conquered the Summit${meta.bestHeatWon > 0 ? ` at heat ${meta.bestHeatWon}` : ''}` : `Best: reached act ${meta.best.act}`)
    : 'Tic-tac-toe where the pieces move.';
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
        h('div.subtitle', {}, 'a roguelike of moving stones')),
      h('div.title-buttons', {},
        saved?.run && !saved.run.over ? h('button.btn.primary.wide.big', { onclick: () => { run = saved.run; duelState = saved.duel; route(); } }, 'Continue run') : null,
        h('button.btn.wide.big' + (saved?.run ? '' : '.primary'), { onclick: chooseKit }, 'New run'),
        h('button.btn.wide', { onclick: startDaily }, `Daily climb${meta.daily?.[today()] ? ' ✓' : ''}`),
        h('button.btn.wide', { onclick: showHelp }, 'How to play'),
        h('button.btn.wide', { onclick: showCodex }, 'Codex'),
        h('button.btn.wide.ghost', { onclick: () => { setSound(!soundOn()); title(); } }, soundOn() ? '🔊 Sound on' : '🔇 Sound off')),
      h('div.title-foot', {}, best, h('br'), `${meta.runs} runs · ${meta.wins} wins`)));
}

const today = () => new Date().toISOString().slice(0, 10);

// Everyone gets the same seed and kit on the same day.
function startDaily() {
  const d = today();
  const seed = [...d].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) | 0, 7);
  const kits = Object.keys(R.KITS).filter((k) => !R.KITS[k].locked);
  const kit = kits[Math.abs(seed) % kits.length];
  const go = () => {
    run = R.newRun({ kit, seed: Math.abs(seed), heat: 0 });
    run.daily = d;
    duelState = null;
    save();
    route();
  };
  const body = h('div.menu', {}, h('h2', {}, `Daily climb · ${d}`),
    h('p', {}, `Today everyone climbs the same mountain as ${R.KITS[kit].name} ${R.KITS[kit].emoji}. Same maps, same enemies, same loot.`),
    meta.daily?.[d] ? h('p.dim', {}, `Your result today: ${meta.daily[d]}`) : null,
    h('button.btn.primary.wide', { onclick: () => { close(); go(); } }, 'Climb'),
    h('button.btn.ghost.wide', { onclick: () => close() }, 'Back'));
  const close = modal(body);
}

function chooseKit() {
  let heat = Math.min(meta.heat ?? 0, meta.maxHeat);
  const heatRow = h('div.heat-row');
  const drawHeat = () => {
    heatRow.replaceChildren(
      h('div.heat-label', {}, `Heat ${heat}`, h('span.dim', {}, ' — ' + R.HEAT.slice(1, heat + 1).map((x) => x.text).join(' ') || ' — ' + R.HEAT[0].text)),
      h('div.heat-btns', {},
        h('button.btn.small', { onclick: () => { if (heat > 0) { heat--; drawHeat(); } } }, '−'),
        h('button.btn.small', { onclick: () => { if (heat < meta.maxHeat) { heat++; drawHeat(); } else toast('Win a run to unlock more heat.'); } }, '+')));
  };
  drawHeat();
  screen(
    h('div.page', {},
      h('div.page-head', {}, h('button.icon-btn', { onclick: title, html: icon('back') }), h('h2', {}, 'Choose your kit')),
      h('div.kits', {}, Object.entries(R.KITS).map(([id, k]) => {
        const locked = k.locked && meta.wins === 0;
        return h('button.kit' + (locked ? '.locked' : ''), {
          onclick: () => {
            if (locked) { toast('Win a run to unlock the Gambler.'); return; }
            meta.heat = heat; saveMeta();
            run = R.newRun({ kit: id, heat });
            duelState = null;
            save();
            if (!meta.seenHelp) { meta.seenHelp = true; saveMeta(); showHelp(() => route()); }
            route();
          },
        },
        h('div.kit-head', {}, h('span.kit-emoji', {}, k.emoji), h('div', {}, h('div.kit-name', {}, k.name), h('div.kit-text', {}, k.text))),
        h('div.kit-stones', {}, k.pouch.map((t) => stoneEl({ type: t }, 'X', { mini: true })),
          k.tricks.map((t) => h('span.mini-trick', { html: icon(t) }))),
        h('div.kit-stats', {}, `❤ ${k.hearts}  ·  ${k.gold} gold${k.relics ? '  ·  ' + k.relics.map((r) => RELICS[r].emoji).join('') : ''}`),
        locked ? h('div.kit-lock', {}, '🔒 Win a run to unlock') : null);
      })),
      meta.maxHeat > 0 ? heatRow : null));
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
const NODE_NAME = { fight: 'Duel', elite: 'Elite', shop: 'Shop', rest: 'Campfire', event: 'Unknown', treasure: 'Treasure', boss: 'Boss' };
const NODE_TEXT = {
  fight: 'A duel. Win for gold and a new stone; lose and it costs a heart — and the boss takes the square.',
  elite: 'A tough duel. Win for a relic; lose and it costs 2 hearts.',
  shop: 'Stones, tricks, relics and services, for gold.',
  rest: 'Heal, or upgrade a stone.',
  event: 'Something happens. Who knows what.',
  treasure: 'A relic and some gold, free.',
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
          const why = c.mark === 'X' ? 'You have been here.' : c.mark === 'O' ? `${boss.name} took this square.` : 'Too far: go next to one of your Xs.';
          toast(`${NODE_NAME[c.kind]} — ${c.mark ? why : NODE_TEXT[c.kind] + ' ' + why}`);
          return;
        }
        sfx('click');
        R.enterNode(run, String(i));
        duelState = null;
        route();
      },
    }, h('span.doodle', { html: icon(NODE_ICON[c.kind]) }), h('span.label', {}, NODE_NAME[c.kind]));
    if (c.mark === 'X') el.insertAdjacentHTML('beforeend', scribbleX(freshX === i));
    if (c.mark === 'O') el.insertAdjacentHTML('beforeend', scribbleO(map.lastO === i));
    return el;
  });
  map.freshX = null;
  const lastO = map.lastO;
  map.lastO = null;
  const news = map.news === 'oline' ? `${boss.name} drew three in a row — it grows stronger!`
    : map.news === 'boxed' ? `Boxed in! The door opens, but ${boss.name} grows stronger.`
    : lastO !== null && lastO !== undefined ? `${boss.name} marks the ${NODE_NAME[map.cells[lastO].kind].toLowerCase()} square.` : '';
  map.news = null;
  const door = h('button.boss-door' + (map.open ? '.open' : ''), {
    onclick: () => {
      if (!map.open) { toast('Draw three Xs in a row — across, down or diagonal — to open the door.'); return; }
      R.enterNode(run, 'boss'); duelState = null; route();
    },
  },
  h('div.portrait', {}, h('div.photo', {}, boss.emoji)),
  h('div.door-text', {},
    h('div.door-name', {}, boss.name),
    map.open ? h('div', {}, 'The door is open. Tap to face the boss — or keep exploring.') : h('div', {}, 'Draw three in a row to open the door.'),
    map.power ? h('div.power', {}, `Power +${map.power}`) : null));
  const el = screen(topBar(), relicStrip(),
    h('div.map-page', {},
      door,
      h('div.map-grid' + (R.xCount(run) ? '' : '.first'), {}, h('div.board-lines', { html: lines }), h('div.map-cells', {}, cells)),
      h('div.map-news', {}, news),
      h('div.map-help', {}, !R.xCount(run)
        ? 'Pick any square to start. You mark X where you go; after each step the boss marks an O.'
        : 'Go to a highlighted square next to one of your Xs.')));
  void el;
}

function actIntro() {
  const act = ACTS[run.act - 1];
  screen(h('div.act-intro', {},
    h('div.act-n', {}, `Act ${act.n}`),
    h('h1', {}, act.name),
    h('p', {}, ['', 'The meadow is behind you. The ground turns to stone.', 'The air thins. Only the best players make it this far.'][act.n - 1]),
    h('div.rules-note', {}, `This act is a game of tic-tac-toe against ${ENEMIES[act.boss].name} ${ENEMIES[act.boss].emoji}. Each square is an encounter: clear it and mark your X. After each of your steps, the boss marks an O. Draw three in a row to open its door.`),
    h('button.btn.primary.wide.big', { onclick: () => { run.screen = 'map'; route(); } }, 'Onward')));
}

// ── Before a duel: see the enemy, choose your stones ────────────────────────

function preDuel() {
  const duel = run.pending.duel;
  const enemy = ENEMIES[duel.enemyId];
  const size = R.handSize(run);
  let chosen = R.defaultHand(run);
  const grid = h('div.stone-grid.pick');
  const count = h('span.count');
  const fight = h('button.btn.primary.wide.big', { onclick: begin }, 'Fight!');
  const draw = () => {
    grid.replaceChildren(...run.pouch.map((s) => {
      const on = chosen.includes(s.uid);
      const dead = duel.disabled === s.type && !R.has(run, 'home-turf');
      return h('button.pouch-slot' + (on ? '.on' : ''), {
        onclick: () => {
          if (on) chosen = chosen.filter((u) => u !== s.uid);
          else if (chosen.length < size) chosen.push(s.uid);
          else { toast(`You can bring ${size}. Tap one to leave it behind.`); return; }
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
  };
  draw();

  const tierLabel = { normal: '', elite: 'Elite', boss: 'Boss', event: 'Challenge' }[duel.tier];
  const stakes = duel.tier === 'boss'
    ? `Beat it twice to pass (${duel.bossWins}/2). Each loss costs 1 ❤.`
    : `Lose and it costs ${R.heartsLost(duel)} ❤.`;
  screen(topBar(),
    h('div.page', {},
      h('div.enemy-card.' + duel.tier, {},
        h('div.portrait.big', {}, h('div.photo', {}, enemy.emoji)),
        h('div', {},
          tierLabel ? h('div.tier.' + duel.tier, {}, tierLabel) : null,
          h('div.enemy-name.big', {}, enemy.name),
          h('div.quote', {}, `“${enemy.quote}”`))),
      h('div.section-label', {}, 'Their stones'),
      h('div.hand.enemy-hand.show', {}, duel.handO.map((s) => h('button.slot-plain', { onclick: () => infoStone(s, 'O') }, stoneEl(s, 'O', { dead: duel.disabled === s.type && !duel.modsO.homeTurf })))),
      duel.tricksO.length ? h('div.enemy-tricks-pre', {}, 'Tricks: ', duel.tricksO.map((t) => h('button.link', { onclick: () => infoTrick(t) }, TRICKS[t].name))) : null,
      h('div.duel-facts', {},
        h('button.fact', { onclick: () => infoSpace(duel.disabled) },
          duel.disabled ? h('span.chip-ico.crossed', { html: icon(duel.disabled) }) : '◻',
          duel.disabled ? ` No ${STONES[duel.disabled].name} here` : ' Neutral space'),
        h('div.fact', {}, duel.first === 'X' ? '▶ You open' : `▶ ${enemy.name} opens — a full board goes to you`),
        duel.field ? h('button.fact.warn', { onclick: () => infoField(duel.field) }, `⚠ ${FIELDS[duel.field].name}: ${FIELDS[duel.field].text}`) : null,
        h('div.fact.dim', {}, stakes)),
      h('div.section-label', {}, 'Bring your stones ', count),
      grid,
      run.tricks.length ? h('div.dim.small', {}, 'Tricks: ' + run.tricks.map((t) => TRICKS[t].name).join(', ')) : null,
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
    h('button.icon-btn.small', { onclick: showDuelMenu, 'aria-label': 'Menu' }, h('span', { html: icon('gear') })),
    h('div.hearts.small', {}, h('span', { html: icon('heart') }), `${run.hearts}`),
    duel.tier === 'boss' ? h('div.boss-score', {}, `${duel.bossWins}/2`) : null);
  duelView = mountDuel(holder.querySelector('.duel-host'), {
    state: duelState, enemy, extra,
    onSave: (s) => { duelState = s; save(); },
    onEnd: (winner) => {
      // Tricks spent in the duel are gone from the run.
      run.tricks = [...duelState.tricks.X].filter((t) => TRICKS[t]);
      duelState = null;
      if (winner === 'X') {
        const res = R.duelWon(run);
        if (res.kind === 'boss-continue') toast('One down. It rises again!');
      } else {
        const res = R.duelLost(run);
        if (res.kind === 'rematch') toast('🎟️ Rematch Token: try again!');
        else if (res.kind === 'dead') { /* recorded by the end screen */ }
        else if (res.kind === 'lost') toast(`−${R.heartsLost(duel)} ❤`, 'bad');
        else if (res.kind === 'boss-retry') toast(`−1 ❤. Again!`, 'bad');
      }
      route();
    },
  });
}

function showDuelMenu() {
  const body = h('div.menu', {},
    h('h2', {}, 'Paused'),
    h('button.btn.wide', { onclick: () => { close(); showHelp(); } }, 'How to play'),
    h('button.btn.wide', { onclick: () => { close(); showCodex(); } }, 'Codex'),
    h('button.btn.wide', { onclick: () => { close(); showPouch(); } }, 'Pouch & relics'),
    h('button.btn.wide', { onclick: () => { setSound(!soundOn()); close(); toast(soundOn() ? 'Sound on' : 'Sound off'); } }, soundOn() ? 'Sound: on' : 'Sound: off'),
    h('button.btn.wide', { onclick: () => { close(); title(); } }, 'Save & quit to title'),
    h('button.btn.wide.ghost', { onclick: () => close() }, 'Resume'));
  const close = modal(body);
}

// ── Rewards ─────────────────────────────────────────────────────────────────

// Take a stone into the pouch, asking what to drop if it is full.
function takeStone(s, done) {
  if (!R.pouchFull(run)) { R.gainStone(run, s); sfx('coin'); done(true); return; }
  pickFromPouch(`Your pouch is full. Drop a stone to take the ${stoneName(s)}?`, (victim) => {
    if (!victim) { done(false); return; }
    run.pouch = run.pouch.filter((p) => p.uid !== victim.uid);
    R.gainStone(run, s);
    done(true);
  }, { cancel: 'Keep my pouch' });
}

function takeTrick(t, done) {
  if (!R.tricksFull(run)) { run.tricks.push(t); done(true); return; }
  const body = h('div.menu', {}, h('h2', {}, 'Too many tricks'), h('p', {}, `Drop one to take ${TRICKS[t].name}?`),
    run.tricks.map((x, k) => h('button.btn.wide', { onclick: () => { run.tricks.splice(k, 1); run.tricks.push(t); close(); done(true); } }, `Drop ${TRICKS[x].name}`)),
    h('button.btn.wide.ghost', { onclick: () => { close(); done(false); } }, 'Keep mine'));
  const close = modal(body, { dismissable: false });
}

function pickFromPouch(prompt, cb, { filter = () => true, cancel = 'Cancel' } = {}) {
  const list = run.pouch.filter(filter);
  const body = h('div.pouch-view', {}, h('h2', {}, prompt),
    list.length ? h('div.stone-grid', {}, list.map((s) => h('button.pouch-slot', { onclick: () => { close(); cb(s); } }, stoneEl(s, 'X'), h('span', {}, stoneName(s)))))
      : h('p.dim', {}, 'Nothing to choose.'),
    h('button.btn.wide.ghost', { onclick: () => { close(); cb(null); } }, cancel));
  const close = modal(body, { dismissable: false, cls: 'tall' });
}

function rewardScreen() {
  const rw = run.pending;
  const done = () => { R.leaveNode(run); route(); };
  const parts = [h('h1.reward-title', {}, rw.tier === 'boss' ? 'Boss defeated!' : 'Victory!')];
  parts.push(h('div.reward-gold', {}, h('span', { html: icon('coin') }), `+${rw.gold} gold`));
  if (rw.relic && !rw.taken.relic) {
    R.gainRelic(run, rw.relic);
    rw.taken.relic = true;
    save();
  }
  if (rw.relic) parts.push(h('div.section-label', {}, 'Relic found'), relicCard(rw.relic, { onclick: () => infoRelic(rw.relic) }));
  if (rw.relicChoice?.length && !rw.taken.boss) {
    parts.push(h('div.section-label', {}, 'Choose a boss relic'),
      h('div.cards', {}, rw.relicChoice.map((id) => relicCard(id, {
        onclick: () => { R.gainRelic(run, id); rw.taken.boss = id; sfx('coin'); save(); rewardScreen(); },
      }))));
  } else if (rw.taken.boss) parts.push(h('div.section-label', {}, 'Boss relic'), relicCard(rw.taken.boss, { onclick: () => infoRelic(rw.taken.boss) }));
  if (rw.trick && !rw.taken.trick) {
    parts.push(h('div.section-label', {}, 'A trick'), h('div.cards.one', {}, trickCard(rw.trick, {
      onclick: () => takeTrick(rw.trick, (ok) => { if (ok) { rw.taken.trick = true; sfx('coin'); save(); rewardScreen(); } }),
    })));
  }
  if (rw.stones.length && !rw.taken.stone) {
    parts.push(h('div.section-label', {}, 'Take a stone'),
      h('div.cards', {}, rw.stones.map((s) => stoneCard(s, {
        onclick: () => takeStone(s, (ok) => { if (ok) { rw.taken.stone = true; save(); rewardScreen(); } }),
      }))));
  }
  const pendingBoss = rw.relicChoice?.length && !rw.taken.boss;
  parts.push(h('button.btn.wide.big' + (pendingBoss ? '' : '.primary'), {
    onclick: () => { if (pendingBoss && !confirm('Leave without a boss relic?')) return; done(); },
  }, (rw.stones.length && !rw.taken.stone) || (rw.trick && !rw.taken.trick) ? 'Skip' : 'Continue'));
  screen(topBar(), h('div.page.reward', {}, parts));
}

function treasureScreen() {
  const t = run.pending;
  screen(topBar(), h('div.page.reward', {},
    h('h1.reward-title', {}, 'Treasure!'),
    h('div.reward-gold', {}, h('span', { html: icon('coin') }), `+${t.gold} gold`),
    t.relic ? [h('div.section-label', {}, 'Inside the chest'), relicCard(t.relic, { onclick: () => infoRelic(t.relic) })] : h('p', {}, 'The chest is otherwise empty.'),
    h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, 'Continue')));
}

// ── Shop ────────────────────────────────────────────────────────────────────

function shopScreen() {
  const shop = run.pending.shop;
  const buy = (cost, fn) => {
    if (run.gold < cost) { toast('Not enough gold.', 'bad'); return; }
    fn(() => { run.gold -= cost; sfx('coin'); save(); shopScreen(); });
  };
  screen(topBar(), h('div.page.shop', {},
    h('div.shop-head', {}, h('span.shop-emoji', {}, '🧑‍🌾'), h('div', {}, h('h2', {}, 'The Travelling Merchant'), h('div.dim', {}, '“Stones, tricks, trinkets. Gold only.”'))),
    h('div.section-label', {}, 'Stones'),
    h('div.cards.scroll', {}, shop.stones.map((s) => stoneCard(s, {
      price: s.price, sold: s.sold,
      onclick: () => buy(s.price, (pay) => takeStone(s, (ok) => { if (ok) { s.sold = true; pay(); } })),
    }))),
    h('div.section-label', {}, 'Tricks'),
    h('div.cards.scroll', {}, shop.tricks.map((t) => trickCard(t.trick, {
      price: t.price, sold: t.sold,
      onclick: () => buy(t.price, (pay) => takeTrick(t.trick, (ok) => { if (ok) { t.sold = true; pay(); } })),
    }))),
    shop.relics.length ? [h('div.section-label', {}, 'Relics'),
      h('div.cards.scroll', {}, shop.relics.map((r) => relicCard(r.relic, {
        price: r.price, sold: r.sold || R.has(run, r.relic),
        onclick: () => buy(r.price, (pay) => { R.gainRelic(run, r.relic); r.sold = true; pay(); }),
      })))] : null,
    h('div.section-label', {}, 'Services'),
    h('div.services', {},
      h('button.service', {
        disabled: shop.upgraded || !R.upgradeable(run).length || undefined,
        onclick: () => buy(shop.upgradePrice, (pay) => pickFromPouch('Upgrade which stone?', (s) => { if (s) { s.plus = true; shop.upgraded = true; pay(); } }, { filter: (s) => !s.plus })),
      }, h('b', {}, 'Upgrade a stone'), h('span.price', {}, iconEl('coin'), shop.upgradePrice), shop.upgraded ? h('span.dim', {}, ' (done)') : null),
      h('button.service', {
        disabled: run.pouch.length <= 5 || undefined,
        onclick: () => buy(shop.removePrice, (pay) => pickFromPouch('Remove which stone?', (s) => {
          if (s) { run.pouch = run.pouch.filter((p) => p.uid !== s.uid); run.removals++; shop.removePrice = R.price(run, 50 + 25 * run.removals); pay(); }
        })),
      }, h('b', {}, 'Remove a stone'), h('span.price', {}, iconEl('coin'), shop.removePrice), run.pouch.length <= 5 ? h('span.dim', {}, ' (keep 5)') : null),
      h('button.service', {
        disabled: run.hearts >= run.maxHearts || shop.healed >= 2 || undefined,
        onclick: () => buy(shop.healPrice, (pay) => { run.hearts++; shop.healed++; sfx('heal'); pay(); }),
      }, h('b', {}, 'Bandage (+1 ❤)'), h('span.price', {}, iconEl('coin'), shop.healPrice), h('span.dim', {}, ` ${2 - shop.healed} left`))),
    h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, 'Leave shop')));
}

// ── Rest ────────────────────────────────────────────────────────────────────

function restScreen() {
  const n = R.has(run, 'anvil') ? 2 : 1;
  const heal = Math.max(2, Math.ceil(run.maxHearts * 0.4));
  const leave = () => { R.leaveNode(run); route(); };
  screen(topBar(), h('div.page.rest', {},
    h('div.campfire', {}, '🔥'),
    h('h2', {}, 'A quiet campfire'),
    h('p.dim', {}, 'Rest a while, or sharpen your stones.'),
    h('button.btn.wide.big', {
      disabled: run.hearts >= run.maxHearts || undefined,
      onclick: () => { run.hearts = Math.min(run.maxHearts, run.hearts + heal); sfx('heal'); toast(`+${heal} ❤`, 'good'); leave(); },
    }, `Rest: heal ${heal} ❤`),
    h('button.btn.wide.big', {
      disabled: !R.upgradeable(run).length || undefined,
      onclick: () => {
        let left = n;
        const one = () => pickFromPouch(left > 1 ? `Upgrade a stone (${left} left)` : 'Upgrade which stone?', (s) => {
          if (!s) { if (left < n) leave(); return; }
          s.plus = true; left--; sfx('coin');
          if (left > 0 && R.upgradeable(run).length) one(); else leave();
        }, { filter: (s) => !s.plus, cancel: left < n ? 'Done' : 'Cancel' });
        one();
      },
    }, `Sharpen: upgrade ${n > 1 ? 'two stones' : 'a stone'}`),
    h('button.btn.wide.ghost', { onclick: leave }, 'Move on')));
}

// ── Events ──────────────────────────────────────────────────────────────────

function eventScreen() {
  const ev = EVENTS.find((e) => e.id === run.pending.id);
  const result = run.pending.result;
  const api = {
    rng: () => R.rand(run),
    pouchRoom: () => !R.pouchFull(run),
    trickRoom: () => !R.tricksFull(run),
    upgradeStone: (text, n = 1) => new Promise((resolve) => {
      let left = n;
      const one = () => pickFromPouch('Upgrade which stone?', (s) => {
        if (s) { s.plus = true; left--; }
        if (s && left > 0 && R.upgradeable(run).length) one(); else resolve(text);
      }, { filter: (s) => !s.plus, cancel: 'Done' });
      one();
    }),
    chooseStone: (rarity) => new Promise((resolve) => {
      const opts = R.stoneChoices(run, 'elite', rarity);
      const body = h('div.pouch-view', {}, h('h2', {}, 'Choose a stone'),
        h('div.cards', {}, opts.map((s) => stoneCard(s, { onclick: () => { close(); takeStone(s, () => resolve(`You take the ${stoneName(s)}.`)); } }))),
        h('button.btn.wide.ghost', { onclick: () => { close(); resolve('You take nothing.'); } }, 'None'));
      const close = modal(body, { dismissable: false, cls: 'tall' });
    }),
    gainRandomTrick: (rarity) => {
      const t = R.randomTrick(run, rarity);
      if (R.tricksFull(run)) return `You find ${TRICKS[t].name}, but have no room for it.`;
      run.tricks.push(t);
      return `You gain the trick ${TRICKS[t].name}.`;
    },
    gainRandomRelic: (text) => {
      const id = R.randomRelic(run);
      if (!id) return text + ' nothing.';
      R.gainRelic(run, id);
      return `${text} ${RELICS[id].emoji} ${RELICS[id].name}! ${RELICS[id].text}`;
    },
    transmute: () => new Promise((resolve) => pickFromPouch('Transmute which stone?', (s) => {
      if (!s) return resolve('You change your mind.');
      const up = { starter: 'common', common: 'uncommon', uncommon: 'rare', rare: 'rare' }[STONES[s.type].rarity];
      let n;
      for (let g = 0; g < 20; g++) { n = R.randomStone(run, up); if (n.type !== s.type) break; }
      s.type = n.type;
      s.plus = s.plus || n.plus;
      resolve(`It bubbles and hisses… and becomes a ${stoneName(s)}!`);
    })),
    duplicate: () => new Promise((resolve) => pickFromPouch('Duplicate which stone?', (s) => {
      if (!s) return resolve('The reflection fades.');
      R.gainStone(run, { type: s.type, plus: s.plus });
      resolve(`A second ${stoneName(s)} climbs out of the pond.`);
    })),
    removeStone: (heal) => new Promise((resolve) => pickFromPouch('Let go of which stone?', (s) => {
      if (!s) return resolve('You keep everything.');
      run.pouch = run.pouch.filter((p) => p.uid !== s.uid);
      if (heal) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
      resolve(`The ${stoneName(s)} sinks out of sight. You feel lighter.`);
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
    ? [h('p.event-result', {}, result), h('button.btn.primary.wide.big', { onclick: () => { R.leaveNode(run); route(); } }, 'Continue')]
    : ev.choices.map((c) => {
      const ok = !c.can || c.can(run, api);
      return h('button.choice' + (ok ? '' : '.disabled'), {
        disabled: !ok || undefined,
        onclick: async () => {
          const out = await c.act(run, api);
          if (out === null) return;   // it started a duel
          run.pending.result = out;
          save();
          eventScreen();
        },
      }, h('b', {}, c.label), c.detail ? h('span.dim', {}, ' — ' + c.detail) : null);
    });
  screen(topBar(), h('div.page.event', {},
    h('div.event-emoji', {}, ev.emoji),
    h('h2', {}, ev.title),
    h('p', {}, ev.text),
    h('div.choices', {}, choices)));
}

// ── The end ─────────────────────────────────────────────────────────────────

function endScreen(victory) {
  recordEnd();
  const st = run.stats;
  const mins = Math.round((Date.now() - st.started) / 60000);
  const kit = R.KITS[run.kit];
  screen(h('div.page.end', {},
    h('div.end-emoji', {}, victory ? '🏆' : '🪦'),
    h('h1', {}, victory ? 'You conquered the Summit!' : 'Your climb ends here'),
    h('p', {}, victory ? `The Grandmaster bows. ${kit.name} ${kit.emoji} is the champion${run.heat ? ` at heat ${run.heat}` : ''}.`
      : `Fallen in act ${run.act}, ${ACTS[run.act - 1].name}.`),
    h('div.stats', {},
      h('div', {}, h('b', {}, st.won), ' duels won'),
      h('div', {}, h('b', {}, st.lost), ' duels lost'),
      h('div', {}, h('b', {}, st.elites), ' elites beaten'),
      h('div', {}, h('b', {}, st.bosses), ' bosses beaten'),
      h('div', {}, h('b', {}, st.gold), ' gold earned'),
      h('div', {}, h('b', {}, mins), ' minutes')),
    h('div.section-label', {}, 'Final pouch'),
    h('div.hand.show', {}, run.pouch.map((s) => stoneEl(s, 'X', { mini: true }))),
    relicStrip(),
    victory && meta.maxHeat > run.heat ? h('p.good', {}, `Heat ${run.heat + 1} unlocked!`) : null,
    h('button.btn.primary.wide.big', { onclick: () => { run = null; duelState = null; chooseKit(); } }, 'New run'),
    h('button.btn.wide', { onclick: () => { run = null; title(); } }, 'Title')));
  try { localStorage.removeItem(SAVE); } catch { /* ignore */ }
}

// ── Help & codex ────────────────────────────────────────────────────────────

function showHelp(after) {
  const s = (t, p = 'X') => stoneEl({ type: t }, p, { mini: true });
  const pages = [
    h('div', {}, h('h2', {}, 'The duel'),
      h('p', {}, 'Tic-tac-toe on a 3×3 board: three of your stones in a row — across, down or diagonal — wins.'),
      h('p', {}, 'You are ', h('b.blue', {}, 'blue squares'), ', the enemy is ', h('b.red', {}, 'red circles'), '. You take turns placing one stone from your hand.'),
      h('p', {}, 'The twist: most stones ', h('b', {}, 'do something when placed'), ' — and what they do is move stones already on the board, yours and theirs alike. A line can be made by sliding a stone into it, and broken by the next stone played.')),
    h('div', {}, h('h2', {}, 'A turn'),
      h('p', {}, '1. Tap a stone in your hand. Glowing squares show where it may go.'),
      h('p', {}, '2. Tap a square. If the stone does something, you will see what — tap again or ✓ to confirm. If it can do it several ways, arrows and targets appear: tap one to preview it.'),
      h('p', {}, '3. If you hold tricks, you may spend one before ending your turn.'),
      h('p', {}, 'Until your turn ends, ↩ Undo takes the whole turn back.')),
    h('div', {}, h('h2', {}, 'Some stones'),
      h('p', {}, s('shift'), ' ', h('b', {}, 'Shift'), ' slides its row or column one step, wrapping around.'),
      h('p', {}, s('rotate'), ' ', h('b', {}, 'Rotate'), ' turns a 2×2 block clockwise.'),
      h('p', {}, s('magnet'), ' ', h('b', {}, 'Magnet'), ': the enemy must place next to it. ', s('stinky'), ' ', h('b', {}, 'Stinky'), ': must not.'),
      h('p', {}, s('mountain'), ' ', h('b', {}, 'Mountain'), ' is never moved — it is a wall for everything else.'),
      h('p', {}, 'Tap any stone, anywhere, to read what it does. Upgraded stones (with a ', h('b.gold', {}, '+'), ') do more.')),
    h('div', {}, h('h2', {}, 'The rules that decide'),
      h('p', {}, h('b', {}, 'A full board goes to whoever moved second'), ' — and so does a game where the player to move has no stones left. Opening is an advantage; the tiebreak is the second player\'s consolation.'),
      h('p', {}, 'Each duel is fought on a ', h('b', {}, 'space'), ' that may switch one stone type off, for both sides. Switched-off stones still count for lines, they just do nothing.'),
      h('p', {}, 'Several Magnets and Stinkies all pull at once: you must place where you satisfy as many as any square can.')),
    h('div', {}, h('h2', {}, 'The climb'),
      h('p', {}, 'Three acts. Each act is itself a game of tic-tac-toe against its boss, on a 4×4 grid of encounters: duels ⚔, elites 💀, shops, campfires, treasure and the unknown.'),
      h('p', {}, 'Wherever you go you mark an ', h('b.blue', {}, 'X'), ' — next to one you already have. After each step the boss marks an ', h('b.red', {}, 'O'), ', taking that square away. Lose a duel and the boss takes that square too.'),
      h('p', {}, h('b', {}, 'Three Xs in a row open the boss\'s door.'), ' If the boss draws its own line first, or boxes you in, it grows stronger.'),
      h('p', {}, 'Before each duel you see the enemy\'s stones and the space, and choose which 5 of your pouch to bring. Lose and it costs hearts; run out and the climb is over. Bosses must be beaten twice.')),
  ];
  let k = 0;
  const holder = h('div.help-page');
  const dots = h('div.dots');
  const next = h('button.btn.primary', {}, 'Next');
  const prev = h('button.btn.ghost', {}, 'Back');
  const draw = () => {
    holder.replaceChildren(pages[k]);
    dots.replaceChildren(...pages.map((_, i) => h('span.dot' + (i === k ? '.on' : ''))));
    next.textContent = k === pages.length - 1 ? 'Play' : 'Next';
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
    const tabs = h('div.tabs', {}, ['stones', 'tricks', 'relics', 'enemies'].map((t) => h('button.tab' + (t === tab ? '.on' : ''), { onclick: () => { tab = t; draw(); } }, t)));
    let list;
    if (tab === 'stones') {
      list = STONE_TYPES.map((t) => h('div.codex-row', {}, stoneEl({ type: t }, 'X'), h('div', {},
        h('b', {}, STONES[t].name), h('span.info-rarity.' + STONES[t].rarity, {}, ' ' + STONES[t].rarity),
        h('div', {}, STONES[t].text), h('div.dim', {}, '+ ' + STONES[t].plusText))));
    } else if (tab === 'tricks') {
      list = TRICK_TYPES.map((t) => h('div.codex-row', {}, h('div.trick-token', { html: icon(t) }), h('div', {},
        h('b', {}, TRICKS[t].name), h('span.info-rarity.' + TRICKS[t].rarity, {}, ' ' + TRICKS[t].rarity), h('div', {}, TRICKS[t].text))));
    } else if (tab === 'relics') {
      list = RELIC_TYPES.map((r) => h('div.codex-row', {}, h('div.relic-token.small', {}, RELICS[r].emoji), h('div', {},
        h('b', {}, RELICS[r].name), h('span.info-rarity.' + RELICS[r].rarity, {}, ' ' + RELICS[r].rarity), h('div', {}, RELICS[r].text))));
    } else {
      list = Object.values(ENEMIES).filter((e) => e.act > 0).map((e) => h('div.codex-row', {}, h('div.relic-token.small', {}, e.emoji), h('div', {},
        h('b', {}, e.name), h('span.dim', {}, ` · act ${e.act} ${e.tier}`),
        h('div.hand.show.tiny', {}, e.core.map((t) => stoneEl({ type: t }, 'O', { mini: true }))),
        e.field ? h('div.dim', {}, `Boss rule — ${FIELDS[e.field].name}: ${FIELDS[e.field].text}`) : null)));
    }
    body.replaceChildren(tabs, h('div.codex-list', {}, list), h('button.btn.wide', { onclick: () => close() }, 'Close'));
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
