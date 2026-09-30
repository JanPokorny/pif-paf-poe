import { createGame, legalActions, applyAction, STONE_TYPES, TRICK_TYPES, render } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
const rng = makeRng(7);
const hand = () => Array.from({length:5}, () => ({type: STONE_TYPES[(rng()*STONE_TYPES.length)|0], plus: rng()<0.4}));
let wins = {X:0,O:0}, reasons = {};
for (let g = 0; g < 3000; g++) {
  const s = createGame({ handX: hand(), handO: hand(), first: rng()<.5?'X':'O',
    tricksX: [TRICK_TYPES[g%TRICK_TYPES.length]], tricksO:[TRICK_TYPES[(g*7)%TRICK_TYPES.length]],
    disabled: rng()<.5? STONE_TYPES[(rng()*STONE_TYPES.length)|0] : null,
    modsX: {echo: g%5==0, homeTurf: g%3==0, freeFirst: g%4==0, hourglass: g%7==0},
    field: ['gravity','carousel','tide','quake',null][g%5] });
  let n = 0;
  while (!s.over) { const a = legalActions(s); if (!a.length) { console.log('STUCK', s.phase, render(s)); break; } applyAction(s, a[(rng()*a.length)|0]); if (++n > 300) { console.log('LOOP'); break; } }
  wins[s.winner]++; reasons[s.reason]=(reasons[s.reason]||0)+1;
}
console.log(wins, reasons);
for (const iters of [100, 400, 1500]) {
  const s = createGame({ handX: hand(), handO: hand() });
  const t = performance.now(); let plies = 0;
  while (!s.over) { applyAction(s, chooseAction(s, { iterations: iters, rng })); plies++; }
  console.log(iters, 'iters', ((performance.now()-t)/plies).toFixed(1), 'ms/ply', s.winner);
}
