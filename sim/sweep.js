'use strict';
// Run the hand-archetype round robin under several rule sets and compare the
// balance metrics side by side.
//
//   node sim/sweep.js --games 140 --iters 350

const { runArchetypes } = require('./hands');
const { arg } = require('./tourney');

const PRESETS = {
  round1: [
    ['base',                   {}],
    ['deferred-effect-win',    { effectWin: false }],
    ['restriction-fizzle',     { restrictionFizzle: true }],
    ['chain-1-pull',           { chainPulls: 1 }],
    ['no-centre-opening',      { openCentre: false }],
    ['fizzle+deferred',        { restrictionFizzle: true, effectWin: false }],
    ['fizzle+chain1',          { restrictionFizzle: true, chainPulls: 1 }],
    ['deferred+chain1',        { effectWin: false, chainPulls: 1 }],
    ['fizzle+deferred+chain1', { restrictionFizzle: true, effectWin: false, chainPulls: 1 }],
    ['all four',               { restrictionFizzle: true, effectWin: false, chainPulls: 1, openCentre: false }],
  ],
  round3: [
    ['base',                     {}],
    ['chain: 0 pulls',           { chainPulls: 0 }],
    ['chain: 1 pull',            { chainPulls: 1 }],
    ['no effect-lines',          { effectLineForbidden: true }],
    ['no eff-lines + chain0',    { effectLineForbidden: true, chainPulls: 0 }],
    ['no eff-lines + chain1',    { effectLineForbidden: true, chainPulls: 1 }],
    ['no eff + chain0 + persist',{ effectLineForbidden: true, chainPulls: 0, persistentRestriction: true }],
    ['no eff + chain0 + fizzle', { effectLineForbidden: true, chainPulls: 0, restrictionFizzle: true }],
  ],
  round4: [
    ['base',                      {}],
    ['chain0',                    { chainPulls: 0 }],
    ['chain0+fizzle',             { chainPulls: 0, restrictionFizzle: true }],
    ['chain0+persistent',         { chainPulls: 0, persistentRestriction: true }],
    ['chain0+persist+fizzle',     { chainPulls: 0, persistentRestriction: true, restrictionFizzle: true }],
    ['persist+fizzle',            { persistentRestriction: true, restrictionFizzle: true }],
  ],
  round2: [
    ['base',                   {}],
    ['persistent',             { persistentRestriction: true }],
    ['persistent+fizzle',      { persistentRestriction: true, restrictionFizzle: true }],
    ['persistent+chain1',      { persistentRestriction: true, chainPulls: 1 }],
    ['persistent+fizzle+chain1', { persistentRestriction: true, restrictionFizzle: true, chainPulls: 1 }],
    ['persistent+deferred',    { persistentRestriction: true, effectWin: false }],
  ],
};
const round = ['round1', 'round2', 'round3', 'round4'].find(r => process.argv.includes('--' + r)) || 'round1';
const VARIANTS = PRESETS[round];

async function main() {
  const games = parseInt(arg('games', '140'), 10);
  const iters = parseInt(arg('iters', '350'), 10);
  const seed = parseInt(arg('seed', '424200'), 10);
  const rows = [];
  for (const [label, rules] of VARIANTS) {
    const t0 = Date.now();
    const s = await runArchetypes({ games, iters, seed, label, rules, set: arg('set', 'mono'), workers: undefined }, true);
    rows.push(s);
    console.error(`${label} done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  const pad = (s, n) => String(s).padEnd(n);
  const p3 = x => (x * 100).toFixed(1).padStart(5);
  console.log('\n' + pad('rules', 24) + pad('top archetype', 20) + pad('spread', 9) +
    pad('cycles', 9) + pad('unbeaten', 10) + pad('1st edge', 10) + 'turns');
  console.log('-'.repeat(102));
  for (const r of rows) {
    console.log(pad(r.label, 24) + pad(r.top + ' ' + p3(r.topScore) + '%', 20) +
      pad((r.spread * 100).toFixed(1) + 'pp', 9) +
      pad(r.cycles + '/' + r.triples, 9) +
      pad(r.unbeaten, 10) +
      pad(p3(r.firstAdv) + '%', 10) +
      r.turns.toFixed(1));
  }
  console.log('\nset=' + arg('set', 'mono') + '; lower spread, lower 1st edge and more cycles are better; ' + games + ' games/pair, ' + iters + ' iters');
}

main();
