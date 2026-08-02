'use strict';
const { playGame } = require('./tourney');

process.on('message', msg => {
  if (msg.type !== 'chunk') return;
  const out = msg.specs.map(sp => {
    const r = playGame(sp);
    return { key: sp.key, a: sp.a, b: sp.b, label: sp.label, first: sp.first, ...r };
  });
  process.send({ type: 'done', out });
});
