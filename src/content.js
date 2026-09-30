// Everything a run is made of that is not the duel itself: relics, enemies,
// acts, events. Numbers here are the balance; tools/balance.mjs measures them.

import { STONES, STONE_TYPES, TRICKS, TRICK_TYPES } from './engine.js';

// ── Relics ──────────────────────────────────────────────────────────────────
//
// `mod` relics are passed straight into the duel engine (so the enemy's search
// knows about them); the rest are read by the run.

export const RELICS = {
  'home-turf': { name: 'Home Turf', emoji: '🏡', rarity: 'uncommon', mod: 'homeTurf',
    text: 'The space never switches your stones off. Only the enemy\'s.' },
  hourglass: { name: 'Hourglass', emoji: '⏳', rarity: 'uncommon', mod: 'hourglass',
    text: 'A full board, or a player out of stones, goes to you — whoever opened.' },
  wings: { name: 'Wings', emoji: '🪽', rarity: 'common', mod: 'freeFirst',
    text: 'Your first stone each duel ignores the enemy\'s restrictions.' },
  echo: { name: 'Echo Chamber', emoji: '🔔', rarity: 'rare', mod: 'echo',
    text: 'The first stone each duel that does something does it twice.' },
  'velvet-rope': { name: 'Velvet Rope', emoji: '🎗️', rarity: 'common', mod: 'velvetRope',
    text: 'The enemy\'s first stone each duel may not take the centre.' },
  'iron-heart': { name: 'Iron Heart', emoji: '🫀', rarity: 'common',
    text: '+2 max hearts, and heal 2 now.' },
  'deep-pockets': { name: 'Deep Pockets', emoji: '👖', rarity: 'rare',
    text: 'Bring 6 stones into every duel instead of 5.' },
  satchel: { name: 'Satchel', emoji: '🎒', rarity: 'common',
    text: 'Your pouch holds 2 more stones, and you can carry 1 more trick.' },
  gloves: { name: 'Juggler\'s Gloves', emoji: '🧤', rarity: 'rare',
    text: 'You may spend 2 tricks per duel instead of 1.' },
  'lucky-coin': { name: 'Lucky Coin', emoji: '🪙', rarity: 'common',
    text: '+8 gold for every duel you win.' },
  hammer: { name: 'Forge Hammer', emoji: '🔨', rarity: 'rare',
    text: 'Every stone you gain from now on comes upgraded.' },
  herbs: { name: 'Herbal Pouch', emoji: '🌿', rarity: 'common',
    text: 'Heal 1 heart whenever you beat an elite or a boss.' },
  badge: { name: 'Merchant\'s Badge', emoji: '📛', rarity: 'common',
    text: 'Everything in shops costs 25% less.' },
  clover: { name: 'Four-Leaf Clover', emoji: '🍀', rarity: 'uncommon',
    text: 'Stone rewards offer 4 choices instead of 3, and rares turn up more.' },
  bell: { name: 'Hand Bell', emoji: '🛎️', rarity: 'common',
    text: 'Gain a random trick after every elite or boss you beat.' },
  'opening-book': { name: 'Opening Book', emoji: '📖', rarity: 'uncommon',
    text: 'You always open in ordinary duels.' },
  phoenix: { name: 'Phoenix Feather', emoji: '🪶', rarity: 'rare',
    text: 'Once, when you would run out of hearts, rise again with 3.' },
  anvil: { name: 'Tiny Anvil', emoji: '⚒️', rarity: 'uncommon',
    text: 'Resting upgrades two stones instead of one.' },
  rematch: { name: 'Rematch Token', emoji: '🎟️', rarity: 'uncommon',
    text: 'The first duel you lose in each act is replayed instead of costing hearts.' },
  polisher: { name: 'Pebble Polisher', emoji: '✨', rarity: 'common',
    text: 'Your Pebbles are always Pebbles+ in a duel.' },
  piggy: { name: 'Piggy Bank', emoji: '🐷', rarity: 'common',
    text: 'Gain 60 gold now.' },
};
export const BOSS_RELICS = ['deep-pockets', 'gloves', 'echo', 'hourglass', 'home-turf', 'hammer', 'phoenix'];
export const RELIC_TYPES = Object.keys(RELICS);

// ── Stone and trick economy ─────────────────────────────────────────────────

export const STONE_PRICE = { starter: 25, common: 45, uncommon: 70, rare: 100 };
export const TRICK_PRICE = { common: 35, uncommon: 50, rare: 75 };
export const RELIC_PRICE = { common: 110, uncommon: 140, rare: 170 };

export const REWARD_STONES = STONE_TYPES.filter((t) => STONES[t].rarity !== 'starter');
export const SHOP_STONES = STONE_TYPES;

// ── Enemies ─────────────────────────────────────────────────────────────────
//
// An enemy's hand is its `core` plus draws from its `pool` up to `size`; each
// stone is upgraded with chance `plus`. `iters` and `blunder` are its brain.

export const ENEMIES = {
  // Act 1 — the Meadow
  pip: { name: 'Pip the Novice', emoji: '🐣', act: 1, tier: 'normal',
    core: ['pebble', 'pebble'], pool: ['pebble', 'shift', 'rotate'], iters: 40, blunder: 0.45,
    quote: 'I just learned the rules!' },
  otter: { name: 'Slidey Otter', emoji: '🦦', act: 1, tier: 'normal',
    core: ['shift', 'shift'], pool: ['shift', 'pebble', 'rotate'], iters: 60, blunder: 0.35,
    quote: 'Wheee! Everything slides!' },
  clinger: { name: 'Clingy Crab', emoji: '🦀', act: 1, tier: 'normal',
    core: ['magnet', 'magnet'], pool: ['pebble', 'shift', 'magnet', 'mountain'], iters: 60, blunder: 0.35,
    quote: 'Come closer. Closer!' },
  rock: { name: 'Grumbling Rock', emoji: '🪨', act: 1, tier: 'normal',
    core: ['mountain', 'mountain'], pool: ['mountain', 'pebble', 'rotate', 'shift'], iters: 60, blunder: 0.3,
    quote: 'Hrmph. Not moving.' },
  top: { name: 'Spinning Top', emoji: '🌀', act: 1, tier: 'normal',
    core: ['rotate', 'rotate'], pool: ['rotate', 'pebble', 'stinky'], iters: 70, blunder: 0.3,
    quote: 'Round and round and round.' },
  skunk: { name: 'Stinky Skunk', emoji: '🦨', act: 1, tier: 'normal',
    core: ['stinky', 'stinky'], pool: ['stinky', 'pebble', 'shift', 'lasso'], iters: 70, blunder: 0.3,
    quote: 'Keep your distance.' },
  mole: { name: 'Bumbling Mole', emoji: '🐹', act: 1, tier: 'normal',
    core: ['bumper', 'lasso'], pool: ['bumper', 'lasso', 'pebble'], iters: 70, blunder: 0.3,
    quote: 'Push, pull, push, pull!' },
  // elites
  twins: { name: 'The Twins', emoji: '👯', act: 1, tier: 'elite',
    core: ['twin', 'twin', 'pebble', 'pebble'], pool: ['shift', 'magnet'], iters: 250, blunder: 0.1,
    quote: 'Two for the price of one!' },
  stenchlord: { name: 'Lord of Stench', emoji: '🧅', act: 1, tier: 'elite',
    core: ['stinky', 'stinky', 'magnet'], pool: ['shift', 'rotate', 'mountain'], iters: 250, blunder: 0.1,
    tricks: ['muffle'], quote: 'You will stand where I let you.' },
  // boss
  oak: { name: 'The Old Oak', emoji: '🌳', act: 1, tier: 'boss',
    core: ['mountain', 'magnet', 'shift'], pool: ['pebble', 'rotate', 'bumper', 'stinky'], iters: 400, blunder: 0.05,
    field: 'gravity', quote: 'All things fall, little one.' },

  // Act 2 — the Quarry
  bee: { name: 'Bumper Bee', emoji: '🐝', act: 2, tier: 'normal',
    core: ['bumper', 'bumper'], pool: ['bumper', 'magnet', 'shift', 'rotate'], iters: 150, blunder: 0.2,
    quote: 'Bzz! Out of my way!' },
  cowboy: { name: 'Lasso Lou', emoji: '🤠', act: 2, tier: 'normal',
    core: ['lasso', 'lasso', 'magnet'], pool: ['shift', 'mountain', 'pebble'], iters: 150, blunder: 0.2,
    quote: 'Yeehaw, git over here.' },
  frog: { name: 'Leapin\' Frog', emoji: '🐸', act: 2, tier: 'normal',
    core: ['frog', 'frog'], pool: ['frog', 'stinky', 'rotate', 'pebble'], iters: 150, blunder: 0.2,
    quote: 'Ribbit. Hop. Ribbit.' },
  keeper: { name: 'Lighthouse Keeper', emoji: '🗼', act: 2, tier: 'normal',
    core: ['beacon', 'beacon'], pool: ['beacon', 'shift', 'mountain', 'bumper'], iters: 180, blunder: 0.15,
    quote: 'Stay in the light.' },
  dolphin: { name: 'Flip Flop', emoji: '🐬', act: 2, tier: 'normal',
    core: ['flip', 'flip'], pool: ['flip', 'swap', 'magnet', 'pebble'], iters: 180, blunder: 0.15,
    quote: 'Everything is backwards!' },
  miner: { name: 'Quarry Miner', emoji: '⛏️', act: 2, tier: 'normal',
    core: ['2048', 'mountain'], pool: ['2048', 'mountain', 'shift', 'stinky'], iters: 180, blunder: 0.15,
    quote: 'Dig, slide, dig.' },
  // elites
  witch: { name: 'Snare Witch', emoji: '🕷️', act: 2, tier: 'elite',
    core: ['snare', 'snare', 'hush'], pool: ['magnet', 'shift', 'rotate'], iters: 600, blunder: 0.05,
    tricks: ['muffle'], quote: 'Tread carefully, dear.' },
  golem: { name: 'Glue Golem', emoji: '🗿', act: 2, tier: 'elite',
    core: ['glue', 'glue', 'mountain'], pool: ['2048', 'shift', 'magnet'], iters: 600, blunder: 0.05,
    tricks: ['anchor'], quote: 'STUCK. FOREVER.' },
  // boss
  colossus: { name: 'Clockwork Colossus', emoji: '⚙️', act: 2, tier: 'boss',
    core: ['whirl', 'mountain', 'magnet'], pool: ['whirl', 'rotate', 'beacon', 'swap', 'shift'], iters: 900, blunder: 0,
    field: 'carousel', tricks: ['nudge'], quote: 'TICK. TOCK. YOUR TURN IS WOUND.' },

  // Act 3 — the Summit
  fay: { name: 'Firecracker Fay', emoji: '🎆', act: 3, tier: 'normal',
    core: ['firecracker', 'firecracker'], pool: ['magnet', 'shift', 'rotate', 'bumper'], iters: 400, blunder: 0.08,
    quote: 'Boom! Back you go!' },
  fox: { name: 'Turncoat Fox', emoji: '🦊', act: 3, tier: 'normal',
    core: ['turncoat', 'turncoat'], pool: ['magnet', 'stinky', 'shift', 'mountain'], iters: 400, blunder: 0.08,
    quote: 'Loyalty is for pebbles.' },
  parrot: { name: 'Captain Polly', emoji: '🦜', act: 3, tier: 'normal',
    core: ['parrot', 'parrot'], pool: ['magnet', 'shift', '2048', 'swap'], iters: 400, blunder: 0.08,
    quote: 'Squawk! Anything you can do!' },
  jester: { name: 'The Jester', emoji: '🃏', act: 3, tier: 'normal',
    core: ['joker', 'joker'], pool: ['shift', 'swap', 'hush', 'magnet'], iters: 400, blunder: 0.08,
    quote: 'Heads you lose, tails I win!' },
  robot: { name: 'Tile Bot 2048', emoji: '🤖', act: 3, tier: 'normal',
    core: ['2048', '2048'], pool: ['mountain', 'glue', 'magnet', 'stinky'], iters: 450, blunder: 0.05,
    quote: 'CALCULATING OPTIMAL SLIDE.' },
  yeti: { name: 'Summit Yeti', emoji: '🦍', act: 3, tier: 'normal',
    core: ['mountain', 'bumper', 'magnet'], pool: ['lasso', 'frog', 'whirl', 'mountain'], iters: 450, blunder: 0.05,
    quote: 'ROAR. Mine mountain.' },
  // elites
  owl: { name: 'Grand Tactician', emoji: '🦉', act: 3, tier: 'elite',
    core: ['magnet', 'stinky', 'shift'], pool: ['rotate', 'swap', 'beacon', 'firecracker'], iters: 1400, blunder: 0,
    tricks: ['mirror'], quote: 'I have seen this position before.' },
  storm: { name: 'Storm Caller', emoji: '⛈️', act: 3, tier: 'elite',
    core: ['whirl', 'flip', 'magnet'], pool: ['2048', 'bumper', 'shift', 'hush'], iters: 1100, blunder: 0,
    field: 'tide', quote: 'The tide takes everything.' },
  // bosses
  grandmaster: { name: 'The Grandmaster', emoji: '👑', act: 3, tier: 'boss',
    core: ['magnet', 'stinky', 'shift', 'rotate'], pool: ['firecracker', 'turncoat', 'swap', 'mountain', 'beacon'],
    iters: 2200, blunder: 0, tricks: ['overtake', 'mirror'], size: 6, mods: { homeTurf: true },
    quote: 'Every stone you own, I have mastered.' },
};

export const ACTS = [
  { n: 1, name: 'The Meadow', boss: 'oak', plus: 0.0, bossPlus: 0.2, gold: [14, 22] },
  { n: 2, name: 'The Quarry', boss: 'colossus', plus: 0.2, bossPlus: 0.45, gold: [18, 28] },
  { n: 3, name: 'The Summit', boss: 'grandmaster', plus: 0.45, bossPlus: 0.8, gold: [22, 34] },
];

export const enemiesOf = (act, tier) => Object.keys(ENEMIES)
  .filter((k) => ENEMIES[k].act === act && ENEMIES[k].tier === tier);

// The first couple of fights of act 1 are the gentlest ones.
export const EASY_OPENERS = ['pip', 'otter', 'rock'];

// ── Events ──────────────────────────────────────────────────────────────────
//
// Each choice is { label, detail?, can?(run), run(run, api) -> text }. The api
// (from run.js) offers the helpers a choice needs: gain stone, pick a stone, etc.

export const EVENTS = [
  {
    id: 'stonemason', title: 'The Wandering Stonemason', emoji: '🧑‍🔧',
    text: 'A dusty stonemason sets down her chisel. "Fine stones you carry. I could make one finer — for a price."',
    choices: [
      { label: 'Pay 35 gold', detail: 'Upgrade a stone.', can: (r) => r.gold >= 35 && r.pouch.some((s) => !s.plus),
        act: (r, api) => { r.gold -= 35; return api.upgradeStone('The stonemason gets to work.'); } },
      { label: 'Pay 2 hearts', detail: 'Upgrade two stones.', can: (r) => r.hearts > 2 && r.pouch.filter((s) => !s.plus).length >= 2,
        act: (r, api) => { r.hearts -= 2; return api.upgradeStone('Blood and granite.', 2); } },
      { label: 'Leave', act: () => 'You nod politely and move on.' },
    ],
  },
  {
    id: 'shrine', title: 'Shrine of Rarities', emoji: '⛩️',
    text: 'An old shrine hums quietly. Offerings of heart-shaped stones lie at its foot.',
    choices: [
      { label: 'Offer a max heart', detail: 'Lose 1 max heart. Choose a rare stone.', can: (r) => r.maxHearts > 2,
        act: (r, api) => { r.maxHearts--; r.hearts = Math.min(r.hearts, r.maxHearts); return api.chooseStone('rare'); } },
      { label: 'Pray', detail: 'Heal 1 heart.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 1); return 'A warmth settles in your chest.'; } },
    ],
  },
  {
    id: 'gambler', title: 'The Gambler\'s Table', emoji: '🎲',
    text: 'A grinning fox shuffles three cups. "Double or nothing, friend?"',
    choices: [
      { label: 'Bet 30 gold', detail: '50%: win 60. 50%: lose it.', can: (r) => r.gold >= 30,
        act: (r, api) => { if (api.rng() < 0.5) { r.gold += 30; return 'The pebble is under your cup! +30 gold.'; } r.gold -= 30; return 'Empty. The fox chuckles. −30 gold.'; } },
      { label: 'Bet everything', detail: '50%: double your gold.', can: (r) => r.gold > 0,
        act: (r, api) => { if (api.rng() < 0.5) { r.gold *= 2; return `Fortune smiles! You now have ${r.gold} gold.`; } r.gold = 0; return 'Gone. All of it.'; } },
      { label: 'Walk away', act: () => 'The fox shrugs and pockets the cups.' },
    ],
  },
  {
    id: 'well', title: 'The Wishing Well', emoji: '🪣',
    text: 'Coins glitter at the bottom of a mossy well.',
    choices: [
      { label: 'Drink', detail: 'Heal 2 hearts.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 2); return 'Cool, clear water. You feel restored.'; } },
      { label: 'Fish for coins', detail: 'Gain 25–50 gold.', act: (r, api) => { const g = 25 + ((api.rng() * 26) | 0); r.gold += g; return `You fish out ${g} gold.`; } },
      { label: 'Toss a coin', detail: 'Pay 10 gold, gain a random trick.', can: (r, api) => r.gold >= 10 && api.trickRoom(),
        act: (r, api) => { r.gold -= 10; return api.gainRandomTrick(); } },
    ],
  },
  {
    id: 'hermit', title: 'The Hermit\'s Challenge', emoji: '🧙',
    text: '"A duel, traveller? Beat me and take my trinket. Lose, and it costs you a heart."',
    choices: [
      { label: 'Accept the duel', detail: 'Win: a relic. Lose: −1 heart.', act: (r, api) => api.fight('hermit') },
      { label: 'Decline', act: () => 'The hermit returns to his tea.' },
    ],
  },
  {
    id: 'transmuter', title: 'The Transmuter', emoji: '⚗️',
    text: 'Bubbling flasks line a cart. "Give me a stone, and I\'ll give you back something… different."',
    choices: [
      { label: 'Transmute a stone', detail: 'Replace a stone with a random one of higher rarity.', can: (r) => r.pouch.length > 0,
        act: (r, api) => api.transmute() },
      { label: 'Leave', act: () => 'The flasks keep bubbling.' },
    ],
  },
  {
    id: 'chest', title: 'The Suspicious Chest', emoji: '🧰',
    text: 'A chest sits alone in the grass. It is almost certainly trapped.',
    choices: [
      { label: 'Open it', detail: 'Gain a relic. Lose 1 heart.', can: (r) => r.hearts > 1,
        act: (r, api) => { r.hearts--; return api.gainRandomRelic('A needle pricks your thumb, but inside…'); } },
      { label: 'Leave it', act: () => 'Wise, probably.' },
    ],
  },
  {
    id: 'mirror', title: 'The Duplicating Pond', emoji: '🪞',
    text: 'The pond reflects your pouch. The reflection looks… real.',
    choices: [
      { label: 'Reach in', detail: 'Duplicate a stone.', can: (r, api) => api.pouchRoom() && r.pouch.length > 0,
        act: (r, api) => api.duplicate() },
      { label: 'Wash your face', detail: 'Heal 1 heart.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 1); return 'Refreshing.'; } },
    ],
  },
  {
    id: 'thief', title: 'A Pickpocket!', emoji: '🥷',
    text: 'A shadow bumps into you. Your coin purse feels lighter…',
    choices: [
      { label: 'Chase him', detail: 'Duel him. Win: get it back with interest. Lose: −1 heart.', act: (r, api) => api.fight('thief') },
      { label: 'Let it go', detail: 'Lose 20 gold.', act: (r) => { r.gold = Math.max(0, r.gold - 20); return 'Easy come, easy go.'; } },
    ],
  },
  {
    id: 'fountain', title: 'The Fountain of Letting Go', emoji: '⛲',
    text: 'A sign reads: "Leave behind what weighs you down."',
    choices: [
      { label: 'Toss a stone in', detail: 'Remove a stone from your pouch. Heal 1.', can: (r) => r.pouch.length > 5,
        act: (r, api) => api.removeStone(true) },
      { label: 'Move on', act: () => 'You keep what you have.' },
    ],
  },
  {
    id: 'trader', title: 'The Trick Trader', emoji: '🎩',
    text: 'A magician fans out a deck of tricks. "Swap one, any one."',
    choices: [
      { label: 'Trade a trick', detail: 'Swap a trick for a random rare one.', can: (r) => r.tricks.length > 0,
        act: (r, api) => { r.tricks.pop(); return api.gainRandomTrick('rare'); } },
      { label: 'Buy a trick', detail: 'Pay 25 gold for a random trick.', can: (r, api) => r.gold >= 25 && api.trickRoom(),
        act: (r, api) => { r.gold -= 25; return api.gainRandomTrick(); } },
      { label: 'No thanks', act: () => 'He vanishes in a puff of smoke.' },
    ],
  },
];

// Event duels.
ENEMIES.hermit = { name: 'The Hermit', emoji: '🧙', act: 0, tier: 'event',
  core: ['swap', 'frog', 'mountain'], pool: ['shift', 'rotate', 'magnet', 'stinky'], iters: 300, blunder: 0.1,
  quote: 'Show me what you have learned.' };
ENEMIES.thief = { name: 'The Pickpocket', emoji: '🥷', act: 0, tier: 'event',
  core: ['firecracker', 'swap'], pool: ['shift', 'pebble', 'stinky'], iters: 150, blunder: 0.2,
  quote: 'Catch me if you can!' };

export { STONES, TRICKS, TRICK_TYPES };
