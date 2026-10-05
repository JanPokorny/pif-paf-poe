// Random duels with every stone, condition and boss rule, then a
// timing of the enemy's search.
import { createGame, legalActions, applyAction, STONE_TYPES, CONDS, RULES, render } from '../src/engine.js';
import { chooseAction, makeRng } from '../src/ai.js';
const rng = makeRng(7);
const SPECIALS = STONE_TYPES.filter((t) => t !== 'pebble');
const hand = (n = 3) => Array.from({ length: n }, () => SPECIALS[(rng() * SPECIALS.length) | 0]);
const COND = Object.keys(CONDS), RULE = Object.keys(RULES);
const wins = { X: 0, O: 0 }, reasons = {};
for (let g = 0; g < 3000; g++) {
  const boss = g % 3 === 0;
  const s = createGame({
    handX: [...hand(), ...Array(4).fill('pebble')], handO: [...(boss ? [] : hand()), ...Array(5).fill('pebble')],
    modsX: { freeFirst: g % 4 === 0 },
    conds: !boss && g % 2 ? [COND[g % COND.length]] : [], rules: boss ? [RULE[g % RULE.length]] : [],
  });
  let n = 0;
  while (!s.over) {
    const a = legalActions(s);
    if (!a.length) { console.log('STUCK', s.phase, render(s)); break; }
    applyAction(s, a[(rng() * a.length) | 0]);
    if (++n > 300) { console.log('LOOP'); break; }
  }
  wins[s.winner]++; reasons[s.reason] = (reasons[s.reason] || 0) + 1;
}
console.log(wins, reasons);
for (const iters of [100, 400, 1500]) {
  const s = createGame({ handX: hand(), handO: hand() });
  const t = performance.now(); let plies = 0;
  while (!s.over) { applyAction(s, chooseAction(s, { iterations: iters, rng })); plies++; }
  console.log(iters, 'iters', ((performance.now() - t) / plies).toFixed(1), 'ms/ply', s.winner);
}
