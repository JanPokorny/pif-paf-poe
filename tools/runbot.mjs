// Plays whole runs headless with a simple bot, to catch flow bugs and to see
// how far a player of a given strength gets.
//
//   node tools/runbot.mjs --runs 8 --piters 150 --pblunder 0.1 [--heat 0]

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { createGame, applyAction, STONES } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
import { EVENTS } from '../src/content.js';
import * as R from '../src/run.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
// Roughly how much each stone wins, from tools/stones.mjs.
const STRENGTH = { lighthouse: 81, electromagnet: 80, stench: 76, rail: 76, stinky: 74, magnet: 73, beacon: 69, magpie: 68, twin: 64, shift: 57, teleport: 56, '4096': 55, '2048': 53, swap: 50, mountain: 49, blast: 49, turncoat: 46, kaleidoscope: 45, flip: 44, parrot: 44, bumper: 43, cyclone: 43, pivot: 41, rotate: 39, whirl: 39, kangaroo: 34, frog: 30, bomb: 26, lasso: 25, firecracker: 25 };
const value = (s) => (STRENGTH[s.type] ?? 45) / 50 + (STONES[s.type].evolvesTo ? (STRENGTH[STONES[s.type].evolvesTo] - STRENGTH[s.type]) / 100 : 0);
const evolveBest = (run) => { const u = R.upgradeable(run).sort((a, b) => value(b) - value(a)); if (u[0]) R.evolve(u[0]); };

function playDuel(run, cfg, piters, pblunder, rng) {
  const duel = run.pending.duel;
  // The strongest stones, but at least one that moves things.
  const sorted = run.pouch.slice().sort((a, b) => value(b) - value(a));
  const picked = sorted.slice(0, R.handSize(run));
  const mover = sorted.find((x) => STONES[x.type].kind === 'move');
  if (mover && !picked.some((x) => STONES[x.type].kind === 'move')) picked[picked.length - 1] = mover;
  const hand = picked.map((x) => x.uid);
  const s = createGame({ ...R.gameConfig(run, duel, hand), log: false });
  let n = 0;
  while (!s.over && n++ < 300) {
    const me = s.player === 'X';
    applyAction(s, chooseAction(s, me ? { iterations: piters, blunder: pblunder, rng } : { iterations: duel.iters, blunder: duel.blunder, rng }));
  }
  if (!s.over) throw new Error('duel did not end');
  run.tricks = [...s.tricks.X];
  return s.winner === 'X';
}

function takeStone(run, st) {
  if (R.pouchFull(run)) {
    const worst = run.pouch.slice().sort((a, b) => value(a) - value(b))[0];
    if (value(worst) >= value(st)) return;
    run.pouch = run.pouch.filter((p) => p !== worst);
  }
  R.gainStone(run, st);
}

const api = (run) => ({
  rng: () => R.rand(run),
  pouchRoom: () => !R.pouchFull(run),
  trickRoom: () => !R.tricksFull(run),
  upgradeStone: (t, n = 1, pay) => { pay?.(); for (let i = 0; i < n; i++) evolveBest(run); return t; },
  pickTrick: () => 0,
  chooseStone: (r, pay) => { pay?.(); const c = R.stoneChoices(run, 'elite', r); takeStone(run, c[0]); return 'ok'; },
  gainRandomTrick: (r) => { if (!R.tricksFull(run)) run.tricks.push(R.randomTrick(run, r)); return 'ok'; },
  gainRandomRelic: (t) => { R.gainRelic(run, R.randomRelic(run)); return t; },
  transmute: () => { const p = run.pouch[0]; const n = R.randomStone(run, 'uncommon'); p.type = n.type; return 'ok'; },
  duplicate: () => { const b = run.pouch.slice().sort((a, b) => value(b) - value(a))[0]; R.gainStone(run, { type: b.type }); return 'ok'; },
  fight: (id) => { run.pending = { kind: 'duel', duel: R.prepareDuel(run, id, { tier: 'event', event: id }) }; run.screen = 'predual'; return null; },
});

function playRun(spec) {
  const run = R.newRun({ seed: spec.seed, heat: spec.heat });
  const rng = makeRng(spec.seed);
  const log = [];
  let guard = 0;
  while (!run.over && guard++ < 3000) {
    switch (run.screen) {
      case 'map': case 'actintro': {
        run.screen = 'map';
        let opts = R.reachable(run);
        // A page lost or drawn turns; a page won opens the boss's door.
        if (run.map.result === 'lost' || run.map.result === 'draw') { log.push(run.map.result === 'lost' ? '[O]' : '[=]'); R.nextPage(run); break; }
        if (opts.includes('boss')) { log.push(`[X p${run.map.page}]`); R.enterNode(run, 'boss'); break; }
        // Tic-tac-toe first: win, block, fork; then corners; then what the
        // hearts want.
        const want = run.hearts <= 2 ? { rest: 3, shop: 2, event: 1 } : run.hearts >= run.maxHearts - 1 ? { elite: 1, treasure: 2, fight: 1 } : { treasure: 2, fight: 1, event: 1 };
        const score = (k) => {
          const mine = R.lineReach(run.map, k), theirs = R.lineReach(run.map, k, 'O');
          const [x, y] = R.coords(k);
          return (mine >= 2 ? 100 : 0) + (theirs >= 2 ? 50 : 0) + mine * 3 + theirs * 2 + (x !== 1 && y !== 1 ? 2 : 0)
            + (want[run.map.cells[k].kind] ?? 0) + R.rand(run);
        };
        R.enterNode(run, opts.sort((a, b) => score(b) - score(a))[0]);
        break;
      }
      case 'predual': case 'duel': {
        const d = run.pending.duel;
        const won = playDuel(run, null, spec.piters, spec.pblunder, rng);
        log.push(`${run.act}:${d.enemyId}${d.tier !== 'normal' ? '(' + d.tier + ')' : ''}${won ? '+' : '-'}`);
        if (won) R.duelWon(run); else R.duelLost(run);
        break;
      }
      case 'reward': {
        const rw = run.pending;
        if (rw.relic) R.gainRelic(run, rw.relic);
        if (rw.relicChoice?.length) R.gainRelic(run, rw.relicChoice[0]);
        if (rw.trick && !R.tricksFull(run)) run.tricks.push(rw.trick);
        if (rw.stones.length) takeStone(run, rw.stones.slice().sort((a, b) => value(b) - value(a))[0]);
        R.leaveNode(run);
        break;
      }
      case 'shop': {
        const shop = run.pending.shop;
        if (run.gold >= shop.slotPrice && R.canAddSlot(run) && run.pouch.length > R.handSize(run)) { run.gold -= shop.slotPrice; run.slots++; }
        if (run.hearts < run.maxHearts && run.gold >= shop.healPrice) { run.gold -= shop.healPrice; run.hearts++; }
        for (const r of shop.relics) if (!r.sold && run.gold >= r.price) { run.gold -= r.price; R.gainRelic(run, r.relic); r.sold = true; }
        for (const s of shop.stones.slice().sort((a, b) => value(b) - value(a))) if (!s.sold && run.gold >= s.price && value(s) > 1.2) { run.gold -= s.price; takeStone(run, s); s.sold = true; }
        if (run.gold >= shop.slotPrice && R.canAddSlot(run) && run.pouch.length > R.handSize(run)) { run.gold -= shop.slotPrice; run.slots++; }
        if (run.gold >= shop.upgradePrice && R.upgradeable(run).length) { run.gold -= shop.upgradePrice; evolveBest(run); }
        R.leaveNode(run);
        break;
      }
      case 'rest': {
        if (run.hearts <= run.maxHearts / 2 || !R.upgradeable(run).length) run.hearts = Math.min(run.maxHearts, run.hearts + Math.max(2, Math.ceil(run.maxHearts * 0.4)));
        else evolveBest(run);
        R.leaveNode(run);
        break;
      }
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
  return { seed: spec.seed, victory: run.victory, act: run.act, row: run.map.page, hearts: run.hearts, log: log.join(' '), relics: run.relics.join(','), pouch: run.pouch.map((s) => s.type).join(',') + ` slots ${run.slots}` };
}

if (!isMainThread) {
  const out = [];
  for (const s of workerData) { try { out.push(playRun(s)); } catch (e) { out.push({ seed: s.seed, error: e.stack }); } }
  parentPort.postMessage(out);
} else {
  const runs = +arg('runs', 8), piters = +arg('piters', 150), pblunder = +arg('pblunder', 0.1), heat = +arg('heat', 0);
  const specs = Array.from({ length: runs }, (_, i) => ({ seed: +arg('seed', 100) + i, piters, pblunder, heat, stay: arg('stay', 8) }));
  const W = Math.min(cpus().length, runs);
  const chunks = Array.from({ length: W }, () => []);
  specs.forEach((s, i) => chunks[i % W].push(s));
  const t0 = Date.now();
  const res = (await Promise.all(chunks.map((c) => new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: c }); w.on('message', ok); w.on('error', bad); })))).flat();
  for (const r of res) {
    if (r.error) { console.log(`seed ${r.seed}: ERROR ${r.error}`); continue; }
    console.log(`seed ${r.seed}: ${r.victory ? 'VICTORY' : `died act ${r.act} on page ${r.row}`}  | ${r.log}\n    relics ${r.relics}\n    pouch ${r.pouch}`);
  }
  const ok = res.filter((r) => !r.error);
  console.log(`\n${ok.filter((r) => r.victory).length}/${ok.length} victories; mean act reached ${(ok.reduce((a, r) => a + r.act, 0) / ok.length).toFixed(2)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
