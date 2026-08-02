'use strict';
// Shared tournament plumbing: play one game, and fan a list of game specs out
// over one worker process per core.

const { fork } = require('child_process');
const os = require('os');
const path = require('path');
const { initGameState, getLegalActions, doAction } = require('./engine');
const { makeRng, mctsSearchIter } = require('./mcts');

// spec: {handX, handO, skillX, skillO, first, iters, seed, smart, rules}
function playGame(spec) {
  const { handX, handO, hand, skillX, skillO, first, iters, seed, smart, rules } = spec;
  const rng = makeRng(seed);
  const s = initGameState(handX || hand, handO || hand, first, { X: skillX, O: skillO }, rules);
  let moves = 0, turns = 0;
  while (s.phase !== 'gameOver' && moves < 400) {
    const acts = getLegalActions(s);
    if (!acts.length) break;
    const before = s.currentPlayer;
    doAction(s, acts.length === 1 ? acts[0] : mctsSearchIter(s, iters, rng, { smart }));
    if (s.currentPlayer !== before) turns++;
    moves++;
  }
  return { winner: s.winner, reason: s.winReason || 'cap', turns, stats: s.stats };
}

function defaultWorkers() { return Math.max(1, Math.min(os.cpus().length, 8)); }

async function runSpecs(specs, workers) {
  const n = workers || defaultWorkers();
  const chunks = Array.from({ length: n }, () => []);
  specs.forEach((s, i) => chunks[i % n].push(s));
  const results = await Promise.all(chunks.map(chunk => new Promise((res, rej) => {
    const child = fork(path.join(__dirname, 'worker.js'), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', m => { if (m.type === 'done') { child.kill(); res(m.out); } });
    child.on('error', rej);
    child.send({ type: 'chunk', specs: chunk });
  })));
  return results.flat();
}

// 95% Wilson interval for a proportion.
function wilson(w, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = w / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

module.exports = { playGame, runSpecs, wilson, arg, defaultWorkers };
