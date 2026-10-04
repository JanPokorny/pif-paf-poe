// How hard is three in a row on the map? A bot that builds lines, losing a
// quarter of its duels, against the boss, for map settings given as JSON:
//
//   node tools/maprocks.mjs '[{"rock":0.34}, {"rock":0.25}]'   (MAPGEN settings)

import * as R from '../src/run.js';
const cfgs = JSON.parse(process.argv[2]);
for (const cfg of cfgs) {
  Object.assign(R.MAPGEN, cfg); R.MAPCFG.sees = cfg.sees ?? 0.75;
  let opened = 0, steps = 0, rocks = 0, cells = 0, olines = 0;
  const N = 300;
  for (let seed = 1; seed <= N; seed++) {
    const run = R.newRun({ seed }); run.hearts = 99;
    let n = 0;
    while (!run.map.open && n < 40) {
      const o = R.reachable(run).filter((k) => k !== 'boss');
      if (!o.length) break;
      const score = (k) => { const m = R.lineReach(run.map, k), t = R.lineReach(run.map, k, 'O'); return (m >= 2 ? 100 : 0) + (t >= 2 ? 50 : 0) + m * 4 + t * 2 + R.rand(run); };
      run.map.at = o.sort((a, b) => score(b) - score(a))[0];
      R.settleCell(run, R.rand(run) < 0.25 ? 'O' : 'X'); n++;
    }
    if (run.map.open) { opened++; steps += run.map.visited; }
    olines += run.map.oLines;
    const c = Object.values(run.map.cells); rocks += c.filter((x) => x.kind === 'rock').length; cells += c.length;
  }
  console.log(JSON.stringify(cfg).padEnd(52), 'door open within 40 steps', String(Math.round(100 * opened / N)).padStart(3) + '%', 'in', (steps / opened).toFixed(1), 'steps; boss lines on the way', (olines / N).toFixed(2), 'rocks', (100 * rocks / cells).toFixed(0) + '%');
}
