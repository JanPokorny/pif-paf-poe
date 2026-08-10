// How much is a Counterattack worth? Each item is measured as the swing it
// gives the player who moves second, against the same games played without it.
//
//   node items.js --pairs 1000 --only none,super-shift,super-2048 --out results/items.json
//   node items.js --report --out results/items.json
//
// Every arm replays the same list of (opening hand, replying hand, seed), so a
// pairing differs between two arms only where the item actually changed a
// decision. The comparison is therefore paired: the interval below is on the
// per-pairing difference, not on the difference of two independent rates.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createGame, applyAction, cloneState, hasLine, other, toMove, ITEMS, LINES,
} from './engine.js';
import { chooseAction, makeRng } from './ai.js';
import { arg, pad, pct, randomHand, wilson } from './sim.js';

const ARMS = ['none', ...ITEMS];

// X opens, O replies, so the item under test is always O's.
function playGame(spec) {
  const rng = makeRng(spec.seed);
  const s = createGame({
    handX: spec.opener, handO: spec.replier, first: 'X',
    itemO: spec.item === 'none' ? null : spec.item,
  });
  let plies = 0;
  while (!s.over && plies++ < 200) {
    applyAction(s, chooseAction(s, { iterations: spec.iters, rng }));
  }
  return { k: spec.k, replierWon: s.winner === 'O' ? 1 : 0, spent: s.spent.O, turns: s.turns };
}

if (!isMainThread && workerData?.kind === 'items') {
  parentPort.postMessage(workerData.specs.map(playGame));
}

function runSpecs(specs, workers) {
  const chunks = Array.from({ length: workers }, () => []);
  specs.forEach((spec, i) => chunks[i % workers].push(spec));
  return Promise.all(chunks.filter((c) => c.length).map((specs) =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { kind: 'items', specs } });
      w.on('message', resolve);
      w.on('error', reject);
    })
  )).then((r) => r.flat());
}

// ── What a once-per-game item is actually doing ─────────────────────────────

// Is this stone part of an enemy two-in-a-row that still has its third square?
function inLiveThreat(board, pos) {
  const p = board[pos].player;
  return LINES.some((line) => line.includes(pos)
    && line.filter((i) => board[i]?.player === p).length === 2
    && line.some((i) => !board[i]));
}

// Plays the item out and counts what it was spent on, because a swing on its
// own does not say which mechanism produced it.
function diagnose(item, opts) {
  const rng = makeRng(opts.seed);
  const tally = { games: 0, offered: 0, spent: 0, turnSum: 0, notes: {} };
  const note = (k) => { tally.notes[k] = (tally.notes[k] ?? 0) + 1; };
  // A once-per-game item can be spent too early. This keeps the holder's record
  // by the turn they spent it on, with `never` for the games they did not.
  const byTurn = new Map();
  const record = (when, won) => {
    const at = byTurn.get(when) ?? { n: 0, wins: 0 };
    at.n++;
    at.wins += won;
    byTurn.set(when, at);
  };

  for (let g = 0; g < opts.pairs; g++) {
    const s = createGame({
      handX: randomHand(rng), handO: randomHand(rng), first: 'X', itemO: item,
    });
    let plies = 0, spentOn = null;
    while (!s.over && plies++ < 200) {
      const action = chooseAction(s, { iterations: opts.iters, rng });

      if (action.type === 'reverse' || action.type === 'encore') tally.offered++;
      // A passive item is never spent; what it does shows up in the choices the
      // opponent is left with instead.
      if (item === 'bipolar' && action.type === 'place' && s.repel?.player === s.player) {
        note('a placement of theirs was pushed off their own Magnet');
      }
      const spending = action.type === 'encore'
        ? action.use !== 'none'
        : action.use && action.use !== 'pass' && action.use !== 'none';

      if (spending) {
        tally.spent++;
        tally.turnSum += s.turns;
        spentOn ??= s.turns;
        if (action.type === 'encore') {
          // Encore runs after the effect but before the win check, so a line
          // that has just appeared is still on the board and can be broken up.
          const owner = other(toMove(s));
          const after = cloneState(s);
          applyAction(after, action);
          if (hasLine(s.board, owner) && !hasLine(after.board, owner)) {
            note('unmade a line that had just won the opponent the game');
          } else if (hasLine(after.board, toMove(s))) note('made a line of the holder\'s own');
        } else if (action.use === 'obstruction') {
          if (s.turns === 1) note('spent on the holder\'s first turn');
        } else if (action.use === 'overtake') {
          if (s.turns === 1) note('spent on the holder\'s first turn');
          if (hasLine(s.board, other(s.player))) note('undid a line the holder\'s own effect gave away');
          else if (inLiveThreat(s.board, action.pos)) note('took a stone out of a live two-in-a-row');
          const after = cloneState(s);
          applyAction(after, action);
          if (!after.board.some((c) => c?.player === other(s.player))) {
            note('left the opponent with nothing on the board');
          }
        } else if (action.type === 'reverse') {
          const asIs = cloneState(s);
          applyAction(asIs, { type: 'reverse', use: 'none' });
          if (asIs.over && asIs.winner === s.player) note('denied a move that would have won on the spot');
        }
      }
      applyAction(s, action);
    }
    // Obstruction hands the game to the holder while the loser's own line sits
    // finished on the board -- that is the ban having actually bitten.
    if (item === 'obstruction' && s.reason === 'line' && hasLine(s.board, other(s.winner))) {
      note('the banned line was completed anyway, and lost');
    }
    record(spentOn ?? 'never', s.winner === 'O' ? 1 : 0);
    tally.games++;
  }

  // A passive item has no spends to divide by, so its counts are per game.
  const base = tally.spent || tally.games;
  console.log(`\n${item}: ${tally.games} games, spent in ${tally.spent}` +
    (tally.offered ? ` of ${tally.offered} chances` : '') +
    (tally.spent ? `, mean turn ${(tally.turnSum / tally.spent).toFixed(1)}` : '') +
    `\nshares below are of ${tally.spent ? 'the spends' : 'the games'}\n`);
  for (const [k, v] of Object.entries(tally.notes).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + pad((v / base * 100).toFixed(1) + '%', 8) + k);
  }

  const order = [...byTurn.keys()].sort((a, b) =>
    (a === 'never' ? 99 : a) - (b === 'never' ? 99 : b));
  if (order.length > 1) {
    console.log('\n  ' + pad('spent on turn', 16) + pad('games', 8) + 'holder won');
    for (const when of order) {
      const at = byTurn.get(when);
      console.log('  ' + pad(when, 16) + pad(at.n, 8) + pct(at.wins / at.n) + '%');
    }
  }
}

// ── Reporting ───────────────────────────────────────────────────────────────

function report(state) {
  const base = state.arms.none;
  const n = state.pairs;
  console.log(`\ncounterattack: ${n} hand pairings per arm, ` +
    `${Object.keys(state.arms).length} arms, ${state.games} games, iters=${state.iters}`);
  if (!base) { console.log('\nno baseline arm yet -- run `--only none` first'); return; }
  console.log(`the second player wins ${pct(base.wins.reduce((a, b) => a + b, 0) / n)}% ` +
    `of these pairings with no Counterattack at all\n`);

  const rows = [];
  for (const arm of ARMS) {
    const a = state.arms[arm];
    if (!a || arm === 'none') continue;
    const diffs = a.wins.map((w, k) => w - base.wins[k]);
    const delta = diffs.reduce((x, y) => x + y, 0) / n;
    const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - delta) ** 2, 0) / (n - 1));
    const half = 1.96 * sd / Math.sqrt(n);
    const rate = a.wins.reduce((x, y) => x + y, 0) / n;
    // How often the item changed the outcome at all, either way.
    const flips = diffs.filter((d) => d !== 0).length;
    rows.push({
      arm, rate, delta, half, flips,
      used: a.spent / n,
      ci: wilson(a.wins.reduce((x, y) => x + y, 0), n),
    });
  }
  rows.sort((x, y) => y.delta - x.delta);

  console.log(pad('counterattack', 16) + pad('2nd wins', 10) + pad('95% CI', 17) +
    pad('swing', 9) + pad('95% CI', 16) + pad('flipped', 9) + 'used');
  console.log('-'.repeat(86));
  for (const r of rows) {
    const sign = r.delta >= 0 ? '+' : '';
    console.log(pad(r.arm, 16) + pad(pct(r.rate) + '%', 10) +
      pad('[' + pct(r.ci[0]) + ',' + pct(r.ci[1]) + ']', 17) +
      pad(sign + (r.delta * 100).toFixed(1) + 'pp', 9) +
      pad('[' + ((r.delta - r.half) * 100).toFixed(1) + ',' +
        ((r.delta + r.half) * 100).toFixed(1) + ']', 16) +
      pad((r.flips / n * 100).toFixed(1) + '%', 9) +
      (r.used ? (r.used * 100).toFixed(0) + '%' : '-'));
  }
  console.log('\n  swing    change in the second player\'s win rate, same pairings with and without');
  console.log('  flipped  pairings whose winner changed, in either direction');
  console.log('  used     once-per-game items that were actually spent');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = {
    pairs: parseInt(arg('pairs', '1000'), 10),
    iters: parseInt(arg('iters', '300'), 10),
    seed: parseInt(arg('seed', '54321'), 10),
    workers: parseInt(arg('workers', String(Math.max(1, cpus().length - 1))), 10),
    only: arg('only', null)?.split(','),
    out: arg('out', 'results/items.json'),
    reportOnly: process.argv.includes('--report'),
    diagnose: arg('diagnose', null),
  };

  if (opts.diagnose) { diagnose(opts.diagnose, opts); return; }

  let state = existsSync(opts.out) ? JSON.parse(readFileSync(opts.out, 'utf8')) : null;
  if (state && (state.pairs !== opts.pairs || state.iters !== opts.iters) && !opts.reportOnly) {
    throw new Error(`${opts.out} was built with pairs=${state.pairs} iters=${state.iters}`);
  }
  state ??= { pairs: opts.pairs, iters: opts.iters, seed: opts.seed, games: 0, arms: {} };

  if (!opts.reportOnly) {
    // One fixed list of pairings, shared by every arm.
    const rng = makeRng(opts.seed);
    const pairings = Array.from({ length: opts.pairs }, (_, k) => ({
      k, opener: randomHand(rng), replier: randomHand(rng), seed: opts.seed + k * 7919,
    }));

    const arms = (opts.only ?? ARMS).filter((a) => !state.arms[a]);
    if (!arms.length) throw new Error('every requested arm is already in the file');
    console.error(`${arms.length} arms x ${opts.pairs} pairings on ${opts.workers} workers...`);

    for (const item of arms) {
      const t0 = Date.now();
      const games = await runSpecs(
        pairings.map((p) => ({ ...p, item, iters: opts.iters })), opts.workers);
      const wins = Array(opts.pairs).fill(0);
      let spent = 0;
      for (const g of games) {
        wins[g.k] = g.replierWon;
        if (g.spent) spent++;
      }
      state.arms[item] = { wins, spent };
      state.games += games.length;
      console.error(`  ${pad(item, 15)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, JSON.stringify(state));
    }
  }

  report(state);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainThread && isEntryPoint) await main();
