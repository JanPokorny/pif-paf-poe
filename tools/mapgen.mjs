// What the page generator lays out, ring by ring from the boss's first mark.
// Explores whole pages (stepping on every square in reach, nearest first) and
// reports, per ring: obstacles, empty ground, encounters, elites, enemy
// strength; how often a kind sits within two squares of its own kind; forks
// near the start; how far out anything but empty ground was found.
//
//   node tools/mapgen.mjs ['{"rock":0.34,"empty":0.13}']

import * as R from '../src/run.js';
import { ENEMIES } from '../src/content.js';

if (process.argv[2]) Object.assign(R.MAPGEN, JSON.parse(process.argv[2]));
const N = 120, RINGS = 13;
const per = Array.from({ length: RINGS }, () => ({ n: 0, rock: 0, empty: 0, enc: 0, elite: 0, good: 0, iters: 0, fights: 0 }));
let sameKind = 0, kinds = 0, sameOther = 0, others = 0, sameFoe = 0, foes = 0, furthest = 0, cells = 0;
for (let seed = 1; seed <= N; seed++) {
  const run = R.newRun({ seed: seed * 7 + 3 });
  run.act = 1 + (seed % 3);
  run.map = R.makeMap(run);
  const map = run.map;
  // Walk everything: step on the nearest open square until none is left in range.
  for (let guard = 0; guard < 500; guard++) {
    const open = Object.entries(map.cells).filter(([k, c]) => !c.mark && R.ringOf(...R.coords(k)) < RINGS - 1);
    if (!open.length) break;
    open.sort(([a], [b]) => R.ringOf(...R.coords(a)) - R.ringOf(...R.coords(b)));
    map.at = open[0][0];
    // Mark without the boss answering, so the walk covers the page.
    run.aids.double = 1; map.armed = 'double';
    R.settleCell(run, 'X');
    run.hearts = 99; run.over = false;
  }
  for (const [k, c] of Object.entries(map.cells)) {
    const [x, y] = R.coords(k); const d = R.ringOf(x, y);
    if (d >= RINGS || k === '0,0') continue;
    const r = per[d]; r.n++; cells++;
    if (c.kind === 'rock') r.rock++;
    else if (c.kind === 'empty') r.empty++;
    else {
      r.enc++; furthest = Math.max(furthest, d);
      if (c.kind === 'elite') r.elite++;
      if (['shop', 'rest', 'treasure', 'craft', 'gift'].includes(c.kind)) r.good++;
      if (c.kind === 'fight') { const pool = Object.keys(ENEMIES).filter((e) => ENEMIES[e].act === ENEMIES[c.duel.enemyId].act && ENEMIES[e].tier === 'normal').sort((a, b) => ENEMIES[a].iters - ENEMIES[b].iters); r.fights++; r.iters += pool.length > 1 ? pool.indexOf(c.duel.enemyId) / (pool.length - 1) : 0.5; }
      kinds++;
      let same = false, foe = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const o = map.cells[R.keyOf(x + dx, y + dy)];
        if (o && o.kind === c.kind) same = true;
        if (o && c.duel && o.duel && o.duel.enemyId === c.duel.enemyId) foe = true;
      }
      if (same) sameKind++;
      if (c.kind !== 'fight') { others++; if (same) sameOther++; }
      if (c.duel) { foes++; if (foe) sameFoe++; }
    }
  }
}
const pc = (a, b) => (b ? `${Math.round((100 * a) / b)}%`.padStart(5) : '    -');
console.log('ring  cells  rock empty  enc  elite good  strength(0 weakest..1 strongest)');
per.forEach((r, d) => { if (r.n) console.log(String(d).padStart(4), String(Math.round(r.n / N)).padStart(6), pc(r.rock, r.n), pc(r.empty, r.n), pc(r.enc, r.n), pc(r.elite, r.enc), pc(r.good, r.enc), r.fights ? (r.iters / r.fights).toFixed(2).padStart(9) : ''); });
console.log(`encounters per page ${Math.round(per.reduce((n, r) => n + r.enc, 0) / N)}; next to their own kind (within 2): ${pc(sameKind, kinds)}, not counting duels ${pc(sameOther, others)}; same enemy within 2: ${pc(sameFoe, foes)}; furthest encounter: ring ${furthest}`);
