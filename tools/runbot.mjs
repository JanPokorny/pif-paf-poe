// Plays whole runs headless with a simple bot, to catch flow bugs and to see
// how far a player of a given strength gets.
//
//   node tools/runbot.mjs --runs 8 --piters 150 --pblunder 0.1 [--heat 0] [--linedmg 2] [--each 1]
//   (--each 1 prints every run's story; the summary says where runs end and what hurts;
//   --relics echo,wings starts every run with those talismans; --pouch 4 caps the pouch;
//   --start rotate --energy 2 tries another start)

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { createGame, applyAction, allowedSquares, STONES } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
import { EVENTS } from '../src/content.js';
import * as R from '../src/run.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
// Roughly how much each stone wins: its mean over every enemy of every act,
// as `node tools/lab.mjs matrix` measures it.
const STRENGTH = { magpie: 42, bumper: 31, firecracker: 30, relocate: 26, stinky: 25, magnet: 24, swap: 24, shift: 24, muffle: 22, gravity: 18, lasso: 21, rotate: 20, frog: 20, twin: 20, parrot: 20, 'mind-control': 19, mountain: 19, bonfire: 18, pebble: 14 };
// --marbleval/--goldval: what the bot thinks marble or gold adds to a stone.
const MATVAL = { marble: 0, gold: 0 };
const value = (s) => (STRENGTH[s.type] ?? 22) / 25 + (MATVAL[s.mat] ?? 0);
// Marble and gold over a run: brought, placed, marble placed where plain
// could not go, gold paid by the line.
const mats = { marble: 0, gold: 0, broughtMarble: 0, broughtGold: 0, placedMarble: 0, placedGold: 0, freed: 0, paid: 0 };

function playDuel(run, cfg, piters, pblunder, rng) {
  const duel = run.pending.duel;
  // The strongest stones, but at least one that moves things. A boss holds
  // only Pebbles: nothing for a Magpie to steal or a Parrot to copy.
  const dead = duel.tier === 'boss' ? ['magpie', 'parrot', 'mind-control'] : [];
  const worth = (x) => (dead.includes(x.type) ? 0 : value(x));
  // The best set the energy pays for (every subset: the pouch is small), each
  // stone worth what it adds over the Pebble it replaces; a mover is worth a bonus.
  const energy = R.energyOf(run), P0 = value({ type: 'pebble' });
  let hand = [], best = 0;
  const pouch = run.pouch.slice(0, 12);
  for (let m = 1; m < 1 << pouch.length; m++) {
    const set = pouch.filter((_, i) => m & (1 << i));
    if (set.reduce((n, x) => n + R.costOf(x), 0) > energy) continue;
    const sc = set.reduce((n, x) => n + worth(x) - P0, 0) + (set.some((x) => STONES[x.type].kind === 'move') ? 0.2 : 0);
    if (sc > best) { best = sc; hand = set.map((x) => x.uid); }
  }
  const s = createGame({ ...R.gameConfig(run, duel, hand), log: false });
  let n = 0;
  while (!s.over && n++ < 300) {
    const me = s.player === 'X';
    const a = chooseAction(s, me ? { iterations: piters, blunder: pblunder, rng } : { iterations: duel.iters, blunder: duel.blunder, rng });
    if (me && a.type === 'place' && s.selected?.mat) {
      if (s.selected.mat === 'marble') {
        mats.placedMarble++;
        const m = s.selected.mat; delete s.selected.mat;
        if (!allowedSquares(s).includes(a.pos)) mats.freed++;
        s.selected.mat = m;
      } else mats.placedGold++;
    }
    applyAction(s, a);
  }
  if (!s.over) throw new Error('duel did not end');
  for (const u of hand) { const x = run.pouch.find((y) => y.uid === u); if (x?.mat === 'marble') mats.broughtMarble++; if (x?.mat === 'gold') mats.broughtGold++; }
  const bonus = R.goldFromLine(s);
  mats.paid += bonus;
  const before = run.pouch.length;
  R.spendOnce(run, hand, s.spent.X);
  return { bonus, glassPlayed: before - run.pouch.length, won: s.winner === 'X', draw: s.winner === 'X' && s.reason === 'full' };
}

const takeStone = (run, st) => R.gainStone(run, st);

const api = (run) => ({
  rng: () => R.rand(run),
  // Trade the two weakest stones, if that yields something better than both.
  craft: () => {
    const [a, b] = R.craftable(run).sort((x, y) => value(x) - value(y));
    if (!b) return 'no';
    const [c] = R.craftChoices(run, a, b).sort((x, y) => value(y) - value(x));
    if (c && value(c) > value(b)) R.craft(run, a.uid, b.uid, c);
    return 'ok';
  },
  pickOnce: () => run.pouch.find((x) => R.isOnce(x)) ?? null,
  chooseStone: (r, pay) => { pay?.(); const c = R.stoneChoices(run, 'elite', r); takeStone(run, c[0]); return 'ok'; },
  gainRandomOnce: (r) => { R.gainStone(run, R.randomOnce(run, r)); return 'ok'; },
  gainRandomRelic: (t) => { R.gainRelic(run, R.randomRelic(run)); return t; },
  transmute: () => { const p = run.pouch[0]; const n = R.randomStone(run, 'uncommon'); p.type = n.type; return 'ok'; },
  canPolish: () => R.polishable(run).length > 0,
  polish: (mat, cost) => { const s = R.polishable(run).sort((a, b) => value(b) - value(a))[0]; if (s) { run.gold -= cost; R.polish(run, s.uid, mat); } return 'ok'; },
  duplicate: () => { const b = run.pouch.slice().sort((a, b) => value(b) - value(a))[0]; R.gainStone(run, { type: b.type }); return 'ok'; },
  fight: (id) => { run.pending = { kind: 'duel', duel: R.prepareDuel(run, id, { tier: 'event', event: id }) }; run.screen = 'predual'; return null; },
});

function playRun(spec) {
  // --start rotate,stinky / --energy 2: try another start (an experiment).
  if (spec.start) R.START.pouch = spec.start;
  if (spec.energy) R.START.energy = spec.energy;
  if (spec.sees != null) R.MAPCFG.sees = spec.sees;   // --sees 0.5: how often the boss blocks your two
  if (spec.strict) R.MAPCFG.strict = true;            // --strict 1: and only then
  const run = R.newRun({ seed: spec.seed, heat: spec.heat });
  for (const id of spec.relics ?? []) R.gainRelic(run, id);   // --relics a,b: start with them
  const rng = makeRng(spec.seed);
  const log = [];
  // Where the run hurt: every duel fought, and every heart lost and to what.
  const duels = [], hurts = [];
  let blow = null;   // what took the last heart
  let guard = 0, lines = 0, lineDeath = false;
  const glass = { seen: new Set(), dropped: 0, played: 0 };
  const matSeen = new Set();
  for (const k in mats) mats[k] = 0;
  MATVAL.marble = spec.marbleval; MATVAL.gold = spec.goldval;
  R.MAPCFG.enemyMarble = spec.enemymarble;
  if (spec.linedmg != null) R.MAPCFG.lineDamage = spec.linedmg;
  while (!run.over && guard++ < 3000) {
    const page = run.map, seen = page?.oLines ?? 0, hearts = run.hearts, screen = run.screen, act = run.act;
    const d = run.pending?.duel;
    const what = (screen === 'predual' || screen === 'duel') && d ? `${d.enemyId}${d.tier === 'boss' ? `(boss${d.bossWins ? ', undead' : ''})` : d.tier !== 'normal' ? `(${d.tier})` : ''}`
      : screen === 'event' ? `event ${run.pending?.id}` : 'boss line on the map';
    step(screen);
    // --pouch N: an experiment, a pouch of at most N stones; past that the
    // weakest goes (the bot's judgement), so a run is a build, not a hoard.
    // --pouchglass 0: glass stones sit outside the cap. --glass 0: no glass at
    // all (what glass is worth). Counted: glass gained, played, dropped.
    if (!spec.glass) run.pouch = run.pouch.filter((x) => !R.isOnce(x));
    for (const x of run.pouch) if (R.isOnce(x) && !glass.seen.has(x.uid)) glass.seen.add(x.uid);
    // --mats none|marble|gold: only those materials (the rest turn plain).
    for (const x of run.pouch) if (x.mat && !spec.mats.includes(x.mat)) delete x.mat;
    for (const x of run.pouch) if (x.mat && !matSeen.has(x.uid)) { matSeen.add(x.uid); mats[x.mat]++; }
    const counted = () => run.pouch.filter((x) => spec.pouchglass || !R.isOnce(x));
    if (spec.pouch) while (counted().length > spec.pouch) {
      const worst = counted().sort((a, b) => value(a) - value(b))[0];
      if (R.isOnce(worst)) glass.dropped++;
      run.pouch = run.pouch.filter((x) => x !== worst);
    }
    // --glasscap N: a limit of its own for glass (with --pouchglass 0).
    if (spec.glasscap) while (run.pouch.filter((x) => R.isOnce(x)).length > spec.glasscap) {
      const worst = run.pouch.filter((x) => R.isOnce(x)).sort((a, b) => value(a) - value(b))[0];
      glass.dropped++;
      run.pouch = run.pouch.filter((x) => x !== worst);
    }
    if (run.map === page && page && page.oLines > seen) { lines += page.oLines - seen; if (run.over) lineDeath = true; }
    if (run.hearts < hearts || (run.over && !run.victory && hearts > 0)) { hurts.push({ act, what, n: hearts - run.hearts }); blow = what; }
  }
  function step(screen) {
    switch (screen) {
      case 'map': case 'actintro': {
        run.screen = 'map';
        let opts = R.reachable(run);
        // Take the boss once the door is open and a few squares have paid.
        if (opts.includes('boss') && (run.map.visited >= 8 || opts.length === 1)) { log.push(`[p${run.map.power} v${run.map.visited}]`); R.enterNode(run, 'boss'); break; }
        opts = opts.filter((k) => k !== 'boss');
        if (!opts.length) throw new Error('nowhere to step');
        // Finish a line, block the boss's, build towards one; then what the hearts want.
        const want = run.hearts <= 2 ? { rest: 3, shop: 2, event: 1 } : run.hearts >= run.maxHearts - 1 ? { elite: 1, treasure: 2, fight: 1 } : { treasure: 2, fight: 1, event: 1 };
        const score = (k) => {
          const mine = R.lineReach(run.map, k), theirs = R.lineReach(run.map, k, 'O');
          return (mine >= 2 ? 100 : 0) + (theirs >= 2 ? 50 : 0) + mine * 4 + theirs * 2 + (want[R.cellAt(run.map, k).kind] ?? 0) * 2 + R.rand(run);
        };
        R.enterNode(run, opts.sort((a, b) => score(b) - score(a))[0]);
        break;
      }
      case 'predual': case 'duel': {
        const d = run.pending.duel;
        const { won, draw, glassPlayed, bonus } = playDuel(run, null, spec.piters, spec.pblunder, rng);
        glass.played += glassPlayed;
        duels.push({ act: run.act, enemy: d.enemyId, tier: d.tier, undead: d.tier === 'boss' && d.bossWins > 0, won });
        log.push(`${run.act}:${d.enemyId}${d.tier !== 'normal' ? '(' + d.tier + ')' : ''}${won ? '+' : '-'}`);
        if (won) R.duelWon(run, bonus, draw); else R.duelLost(run);
        break;
      }
      case 'reward': {
        const rw = run.pending;
        if (rw.relic) R.gainRelic(run, rw.relic);
        if (rw.relicChoice?.length) R.gainRelic(run, rw.relicChoice[0]);
        if (rw.once) R.gainStone(run, rw.once);
        if (rw.stones.length) takeStone(run, rw.stones.slice().sort((a, b) => value(b) - value(a))[0]);
        R.leaveNode(run);
        break;
      }
      case 'shop': {
        const shop = run.pending.shop;
        const wants = () => run.pouch.reduce((n, x) => n + R.costOf(x), 0) > R.energyOf(run);
        const energize = () => { if (!shop.energized && run.gold >= shop.energyPrice && wants()) { run.gold -= shop.energyPrice; run.energy++; shop.energized = true; } };
        energize();
        if (run.hearts < run.maxHearts && run.gold >= shop.healPrice) { run.gold -= shop.healPrice; run.hearts++; }
        for (const r of shop.relics) if (!r.sold && run.gold >= r.price) { run.gold -= r.price; R.gainRelic(run, r.relic); r.sold = true; }
        for (const s of shop.stones.slice().sort((a, b) => value(b) - value(a))) if (!s.sold && run.gold >= s.price && value(s) > 1.2) { run.gold -= s.price; takeStone(run, s); s.sold = true; }
        energize();
        R.leaveNode(run);
        break;
      }
      case 'rest': {
        run.hearts = Math.min(run.maxHearts, run.hearts + Math.max(2, Math.ceil(run.maxHearts * 0.4)));
        R.leaveNode(run);
        break;
      }
      case 'craft': api(run).craft(); R.leaveNode(run); break;
      case 'treasure': if (run.pending.choices?.[0]) R.gainRelic(run, run.pending.choices[0]); R.leaveNode(run); break;
      case 'event': {
        const ev = EVENTS.find((e) => e.id === run.pending.id);
        const a = api(run);
        const ok = ev.choices.filter((c) => !c.can || c.can(run, a));
        const c = ok[(R.rand(run) * ok.length) | 0];
        const out = c.act(run, a);
        if (out !== null) R.leaveNode(run);
        break;
      }
      default: throw new Error('unknown screen ' + run.screen);
    }
  }
  if (!run.over) throw new Error('run did not end: ' + run.screen);
  // JSON round trip must survive (the save format).
  JSON.parse(JSON.stringify(run));
  return { seed: spec.seed, victory: run.victory, act: run.act, row: run.map.visited, duels, hurts, blow, hearts: run.hearts, lines, lineDeath, log: log.join(' '), relics: run.relics.join(','), pouch: run.pouch.map((s) => s.type).join(',') + ` energy ${R.energyOf(run)}`, energy: R.energyOf(run), glass: { gained: glass.seen.size, played: glass.played, dropped: glass.dropped }, mats: { ...mats }, gold: run.gold };
}

// Where runs end and what hurts: the hard parts of a climb.
function report(ok) {
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
  const table = (title, rows, head) => {
    console.log(`\n${title}`);
    console.log(head);
    for (const r of rows) console.log(r);
  };
  // How far runs get.
  const reach = [1, 2, 3].map((a) => ok.filter((r) => r.act >= a).length);
  console.log(`\nruns reaching act 1 / 2 / 3: ${reach.join(' / ')}; won ${ok.filter((r) => r.victory).length}`);
  // What dealt the last blow, by act.
  const deaths = {};
  for (const r of ok) if (!r.victory) { const k = `act ${r.act}: ${r.blow ?? '?'}`; deaths[k] = (deaths[k] ?? 0) + 1; }
  table('where runs end (the last heart)', Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(3)}  ${k}`), '  runs  act: cause');
  // Hearts lost, by cause.
  const hurt = {};
  for (const r of ok) for (const h of r.hurts) { const k = `act ${h.act}: ${h.what}`; hurt[k] = (hurt[k] ?? 0) + h.n; }
  table('hearts lost, per run (top 15)', Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `  ${(n / ok.length).toFixed(2).padStart(5)}  ${k}`), '  ❤/run  act: cause');
  // Every enemy: how often it is fought and beaten.
  const foes = {};
  for (const r of ok) for (const d of r.duels) {
    const k = `act ${d.act}: ${d.enemy}${d.tier === 'boss' ? (d.undead ? ' (boss, undead)' : ' (boss)') : d.tier !== 'normal' ? ` (${d.tier})` : ''}`;
    const f = (foes[k] ??= { n: 0, won: 0 }); f.n++; if (d.won) f.won++;
  }
  table('duels by enemy (hardest first, at least 5 fought)', Object.entries(foes).filter(([, f]) => f.n >= 5).sort((a, b) => a[1].won / a[1].n - b[1].won / b[1].n)
    .map(([k, f]) => `  ${pct(f.won, f.n).padStart(4)}  ${String(f.n).padStart(4)}  ${k}`), '   won  fought  act: enemy');
}

if (!isMainThread) {
  const out = [];
  for (const s of workerData) { try { out.push(playRun(s)); } catch (e) { out.push({ seed: s.seed, error: e.stack }); } }
  parentPort.postMessage(out);
} else {
  const runs = +arg('runs', 8), piters = +arg('piters', 150), pblunder = +arg('pblunder', 0.1), heat = +arg('heat', 0);
  const specs = Array.from({ length: runs }, (_, i) => ({ seed: +arg('seed', 100) + i, piters, pblunder, heat, stay: arg('stay', 8), linedmg: arg('linedmg', null) == null ? null : +arg('linedmg'), relics: arg('relics', '') ? arg('relics').split(',') : [], pouch: +arg('pouch', 0), start: arg('start', '') ? arg('start').split(',') : null, energy: +arg('energy', 0), sees: arg('sees', null) == null ? null : +arg('sees'), strict: !!+arg('strict', 0), glass: !!+arg('glass', 1), pouchglass: !!+arg('pouchglass', 1), mats: arg('mats', 'marble,gold').split(','), marbleval: +arg('marbleval', 0), goldval: +arg('goldval', 0), enemymarble: !!+arg('enemymarble', 1), glasscap: +arg('glasscap', 0) }));
  const W = Math.min(cpus().length, runs);
  const chunks = Array.from({ length: W }, () => []);
  specs.forEach((s, i) => chunks[i % W].push(s));
  const t0 = Date.now();
  const res = (await Promise.all(chunks.map((c) => new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: c }); w.on('message', ok); w.on('error', bad); })))).flat();
  for (const r of res) {
    if (r.error) { console.log(`seed ${r.seed}: ERROR ${r.error}`); continue; }
    if (arg('each', null) === null) continue;   // --each 1: every run's story
    console.log(`seed ${r.seed}: ${r.victory ? 'VICTORY' : `died act ${r.act} after ${r.row} squares`}  | ${r.log}\n    relics ${r.relics}\n    pouch ${r.pouch}`);
  }
  const ok = res.filter((r) => !r.error);
  const byAct = [1, 2, 3].map((a) => { const r = ok.filter((x) => x.act >= a); return r.length ? (r.reduce((n, x) => n + (x.act === a ? x.energy : 0), 0) / Math.max(1, r.filter((x) => x.act === a).length)).toFixed(1) : '-'; });
  console.log(`\nenergy where runs ended, by act: ${byAct.join(' / ')}`);
  report(ok);
  const g = (k) => (ok.reduce((n, r) => n + r.glass[k], 0) / ok.length).toFixed(2);
  const m = (k) => (ok.reduce((n, r) => n + r.mats[k], 0) / ok.length).toFixed(2);
  console.log(`\nmarble a run: gained ${m('marble')}, brought ${m('broughtMarble')}, placed ${m('placedMarble')}, where plain could not ${m('freed')}`);
  console.log(`gold stones a run: gained ${m('gold')}, brought ${m('broughtGold')}, placed ${m('placedGold')}, gold paid ${m('paid')}`);
  console.log(`\nglass a run: gained ${g('gained')}, played ${g('played')}, dropped by the cap ${g('dropped')}`);
  console.log(`\n${ok.filter((r) => r.victory).length}/${ok.length} victories; mean act reached ${(ok.reduce((a, r) => a + r.act, 0) / ok.length).toFixed(2)}; boss lines ${(ok.reduce((a, r) => a + r.lines, 0) / ok.length).toFixed(1)} a run, the last blow in ${ok.filter((r) => r.lineDeath).length}; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
