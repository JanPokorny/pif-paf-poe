// How hard is three in a row on the map? A bot that builds lines, losing a
// quarter of its duels, against the boss, for rock settings given as JSON:
//
//   node tools/maprocks.mjs '[{"m":7,"a":1,"b":3,"set":[0,1],"byReach":[0.04,0.08,0.15]}]'

import * as R from '../src/run.js';
const cfgs = JSON.parse(process.argv[2]);
for (const cfg of cfgs) {
  Object.assign(R.ROCKS, cfg); R.MAPCFG.sees = cfg.sees ?? 0.75;
  let opened = 0, steps = 0, rocks = 0, cells = 0, lost = 0, olines = 0;
  const N = 300;
  for (let seed = 1; seed <= N; seed++) {
    const run = R.newRun({ seed });
    let n = 0;
    while (!run.map.open && n < 40) {
      const o = R.reachable(run).filter((k) => k !== 'boss');
      if (!o.length) break;
      const score = (k) => { const m = R.lineReach(run.map, k), t = R.lineReach(run.map, k, 'O'); return (m >= 2 ? 100 : 0) + (t >= 2 ? 50 : 0) + m * 4 + t * 2 + R.rand(run); };
      run.map.at = o.sort((a, b) => score(b) - score(a))[0];
      R.settleCell(run, R.rand(run) < 0.25 ? 'O' : 'X'); n++;
    }
    if (run.map.open && run.map.visited < 12) { opened++; steps += run.map.visited; }
    olines += run.map.power;
    const c = Object.values(run.map.cells); rocks += c.filter((x) => x.kind === 'rock').length; cells += c.length;
  }
  console.log(JSON.stringify(cfg).padEnd(52), 'line before page full', String(Math.round(100 * opened / N)).padStart(3) + '%', 'steps', (steps / opened).toFixed(1), 'boss power', (olines / N).toFixed(2), 'rocks', (100 * rocks / cells).toFixed(0) + '%');
}
