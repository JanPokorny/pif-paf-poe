// Everything a run is made of that is not the duel itself: relics, enemies,
// acts, events. Numbers here are the balance; tools/balance.mjs measures them.

import { STONES, BASE_STONES, TRICKS, TRICK_TYPES } from './engine.js';
import { t } from './i18n.js';

// ── Relics ──────────────────────────────────────────────────────────────────
//
// `mod` relics are passed straight into the duel engine (so the enemy's search
// knows about them); the rest are read by the run.

export const RELICS = {
  wings: { name: 'Wings', emoji: '🪽', rarity: 'common', mod: 'freeFirst',
    text: 'Your first stone each duel ignores the enemy\'s restrictions.' },
  echo: { name: 'Echo Chamber', emoji: '🔔', rarity: 'rare', mod: 'echo',
    text: 'The first stone each duel that does something does it twice.' },
  'iron-heart': { name: 'Iron Heart', emoji: '🫀', rarity: 'common',
    text: '+2 max hearts, and heal 2 now.' },
  'deep-pockets': { name: 'Deep Pockets', emoji: '👖', rarity: 'rare',
    text: 'One more stone slot: bring one more special stone into every duel.' },
  satchel: { name: 'Satchel', emoji: '🎒', rarity: 'common',
    text: 'Your pouch holds 2 more stones, and you can carry 1 more trick.' },
  gloves: { name: 'Juggler\'s Gloves', emoji: '🧤', rarity: 'rare',
    text: 'You may spend 2 tricks per duel instead of 1.' },
  'lucky-coin': { name: 'Lucky Coin', emoji: '🪙', rarity: 'common',
    text: '+8 gold for every duel you win.' },
  herbs: { name: 'Herbal Pouch', emoji: '🌿', rarity: 'common',
    text: 'Heal 1 heart whenever you beat an elite or a boss.' },
  badge: { name: 'Merchant\'s Badge', emoji: '🏷️', rarity: 'common',
    text: 'Everything in shops costs 25% less.' },
  clover: { name: 'Four-Leaf Clover', emoji: '🍀', rarity: 'uncommon',
    text: 'Stone rewards offer 4 choices instead of 3, and rares turn up more.' },
  bell: { name: 'Hand Bell', emoji: '🛎️', rarity: 'common',
    text: 'Gain a random trick after every elite or boss you beat.' },
  phoenix: { name: 'Phoenix Feather', emoji: '🪶', rarity: 'rare',
    text: 'Once, when you would run out of hearts, rise again with 3.' },
  anvil: { name: 'Tiny Anvil', emoji: '⚒️', rarity: 'uncommon',
    text: 'At a campfire, you may evolve a stone and still rest.' },
  rematch: { name: 'Rematch Token', emoji: '🎟️', rarity: 'uncommon',
    text: 'The first duel you lose in each act is replayed instead of costing hearts.' },
  piggy: { name: 'Piggy Bank', emoji: '🐷', rarity: 'common',
    text: 'Gain 60 gold now.' },
  'war-chest': { name: 'War Chest', emoji: '💰', rarity: 'rare',
    text: 'Gain 150 gold now.' },
  whetstone: { name: 'Whetstone', emoji: '🪨', rarity: 'uncommon',
    text: 'Evolving a stone costs half as much in shops.' },
};
export const BOSS_RELICS = ['deep-pockets', 'gloves', 'echo', 'phoenix', 'war-chest'];
export const RELIC_TYPES = Object.keys(RELICS);

// ── Stone and trick economy ─────────────────────────────────────────────────

export const STONE_PRICE = { common: 45, uncommon: 70, rare: 100 };
export const TRICK_PRICE = { common: 45, uncommon: 65, rare: 95 };
export const RELIC_PRICE = { common: 110, uncommon: 140, rare: 170 };

// Stones you can find: everything but the Pebble and the evolved forms.
export const REWARD_STONES = BASE_STONES;

// ── Enemies ─────────────────────────────────────────────────────────────────
//
// Everyone plays Pebbles as they like. An enemy's special stones are its
// `core` plus draws from its `pool` up to its act's hand size; later acts
// evolve some of them. `iters` and `blunder` are its brain. A `cond` is its
// home rule, for both sides; others may roll one.
//
// A boss brings no special stones at all: it has `rules` that favour it, and
// once beaten it rises with `rules2`.

export const ENEMIES = {
  // Act 1 — the Meadow
  pip: { name: 'Pip the Novice', emoji: '🐣', act: 1, tier: 'normal',
    core: ['shift'], pool: ['shift', 'rotate'], size: 1, iters: 40, blunder: 0.45,
    quote: 'I just learned the rules!' },
  otter: { name: 'Slidey Otter', emoji: '🦦', act: 1, tier: 'normal',
    core: ['shift', 'shift'], pool: ['shift', 'rotate'], iters: 60, blunder: 0.35,
    quote: 'Wheee! Everything slides!' },
  clinger: { name: 'Clingy Crab', emoji: '🦀', act: 1, tier: 'normal',
    core: ['magnet', 'magnet'], pool: ['shift', 'magnet', 'mountain'], iters: 60, blunder: 0.35,
    quote: 'Come closer. Closer!' },
  rock: { name: 'Grumbling Rock', emoji: '🪨', act: 1, tier: 'normal',
    core: ['mountain'], pool: ['mountain', 'rotate', 'shift'], iters: 60, blunder: 0.3,
    quote: 'Hrmph. Not moving.' },
  top: { name: 'Spinning Top', emoji: '🌀', act: 1, tier: 'normal',
    core: ['rotate', 'rotate'], pool: ['rotate', 'stinky'], iters: 70, blunder: 0.3,
    quote: 'Round and round and round.' },
  skunk: { name: 'Stinky Skunk', emoji: '🦨', act: 1, tier: 'normal',
    core: ['stinky', 'stinky'], pool: ['stinky', 'shift', 'lasso'], iters: 70, blunder: 0.3,
    quote: 'Keep your distance.' },
  mole: { name: 'Bumbling Mole', emoji: '🐹', act: 1, tier: 'normal',
    core: ['bumper', 'lasso'], pool: ['bumper', 'lasso'], iters: 70, blunder: 0.3,
    quote: 'Push, pull, push, pull!' },
  apple: { name: 'Falling Apple', emoji: '🍎', act: 1, tier: 'normal', cond: 'gravity',
    core: ['shift'], pool: ['shift', 'rotate', 'mountain'], iters: 70, blunder: 0.3,
    quote: 'What goes up…' },
  // elites
  twins: { name: 'The Twins', emoji: '👯', act: 1, tier: 'elite',
    core: ['twin', 'twin'], pool: ['shift', 'magnet'], iters: 110, blunder: 0.22,
    quote: 'Two for the price of one!' },
  stenchlord: { name: 'Lord of Stench', emoji: '🧅', act: 1, tier: 'elite',
    core: ['stinky', 'stinky', 'magnet'], pool: ['shift', 'rotate', 'mountain'], iters: 140, blunder: 0.18,
    tricks: ['muffle'], quote: 'You will stand where I let you.' },
  // bosses
  oak: { name: 'The Old Oak', emoji: '🌳', act: 1, tier: 'boss',
    rules: ['clinch'], rules2: ['clinch'], iters: 320, blunder: 0.08,
    quote: 'Stay close to me, little one.' },
  scarecrow: { name: 'The Scarecrow', emoji: '🌾', act: 1, tier: 'boss',
    rules: ['reserved'], rules2: ['reserved', 'headstart'], iters: 320, blunder: 0.08,
    quote: 'The middle of the field is mine.' },

  // Act 2 — the Quarry
  bee: { name: 'Bumper Bee', emoji: '🐝', act: 2, tier: 'normal',
    core: ['bumper', 'bumper'], pool: ['bumper', 'magnet', 'shift', 'rotate'], iters: 130, blunder: 0.2,
    quote: 'Bzz! Out of my way!' },
  cowboy: { name: 'Lasso Lou', emoji: '🤠', act: 2, tier: 'normal',
    core: ['lasso', 'lasso'], pool: ['shift', 'mountain', 'magnet'], iters: 130, blunder: 0.2,
    quote: 'Yeehaw, git over here.' },
  frog: { name: 'Leapin\' Frog', emoji: '🐸', act: 2, tier: 'normal',
    core: ['frog', 'frog'], pool: ['frog', 'stinky', 'rotate'], iters: 130, blunder: 0.2,
    quote: 'Ribbit. Hop. Ribbit.' },
  keeper: { name: 'Lighthouse Keeper', emoji: '🗼', act: 2, tier: 'normal',
    core: ['beacon', 'beacon'], pool: ['beacon', 'shift', 'mountain', 'bumper'], iters: 130, blunder: 0.15,
    quote: 'Stay in the light.' },
  dolphin: { name: 'Flip Flop', emoji: '🐬', act: 2, tier: 'normal',
    core: ['flip', 'flip'], pool: ['flip', 'swap', 'magnet'], iters: 130, blunder: 0.15,
    quote: 'Everything is backwards!' },
  miner: { name: 'Quarry Miner', emoji: '⛏️', act: 2, tier: 'normal', cond: 'gravity',
    core: ['2048', 'mountain'], pool: ['2048', 'mountain', 'shift', 'stinky'], iters: 130, blunder: 0.15,
    quote: 'Dig, slide, dig.' },
  magpie: { name: 'Magpie Meg', emoji: '🐦', act: 2, tier: 'normal',
    core: ['magpie', 'magpie'], pool: ['shift', 'rotate', 'magnet'], iters: 130, blunder: 0.15,
    quote: 'Ooh, shiny. That one\'s mine now.' },
  // elites
  witch: { name: 'Hollow Witch', emoji: '🕷️', act: 2, tier: 'elite', cond: 'nocentre',
    core: ['magnet', 'stinky', 'swap'], pool: ['magnet', 'shift', 'rotate'], iters: 350, blunder: 0.08,
    tricks: ['muffle'], quote: 'Nobody sits in the middle, dear.' },
  golem: { name: 'Stone Golem', emoji: '🗿', act: 2, tier: 'elite',
    core: ['mountain', 'mountain', 'electromagnet'], pool: ['2048', 'shift', 'magnet'], iters: 350, blunder: 0.08,
    tricks: ['anchor'], quote: 'I. DO. NOT. MOVE.' },
  // bosses
  colossus: { name: 'Clockwork Colossus', emoji: '⚙️', act: 2, tier: 'boss',
    rules: ['column'], rules2: ['column'], iters: 250, blunder: 0.04,
    quote: 'TICK. TOCK. THAT COLUMN, PLEASE.' },
  mirrorknight: { name: 'The Mirror Knight', emoji: '🛡️', act: 2, tier: 'boss',
    rules: ['spy'], rules2: ['spy', 'headstart'], iters: 350, blunder: 0.04,
    quote: 'Your left is my right.' },
  carpenter: { name: 'The Carpenter', emoji: '🪚', act: 2, tier: 'boss',
    rules: ['elko'], rules2: ['elko', 'patient'], iters: 350, blunder: 0.04,
    quote: 'Straight lines are for amateurs.' },

  // Act 3 — the Summit
  fay: { name: 'Firecracker Fay', emoji: '🎆', act: 3, tier: 'normal',
    core: ['firecracker', 'firecracker'], pool: ['magnet', 'shift', 'rotate', 'bumper'], iters: 450, blunder: 0.06,
    quote: 'Boom! Back you go!' },
  fox: { name: 'Turncoat Fox', emoji: '🦊', act: 3, tier: 'normal',
    core: ['turncoat', 'turncoat'], pool: ['magnet', 'stinky', 'shift', 'mountain'], iters: 400, blunder: 0.08,
    quote: 'Loyalty is for pebbles.' },
  parrot: { name: 'Captain Polly', emoji: '🦜', act: 3, tier: 'normal', cond: 'shared',
    core: ['parrot', 'parrot'], pool: ['magnet', 'shift', '2048', 'swap'], iters: 400, blunder: 0.08,
    quote: 'Squawk! What\'s yours is mine!' },
  jester: { name: 'The Jester', emoji: '🃏', act: 3, tier: 'normal',
    core: ['swap', 'flip'], pool: ['shift', 'swap', 'magnet', 'whirl'], iters: 220, blunder: 0.14,
    quote: 'Now you see it, now you don\'t!' },
  robot: { name: 'Tile Bot 4096', emoji: '🤖', act: 3, tier: 'normal',
    core: ['4096', '2048'], pool: ['mountain', 'magnet', 'stinky'], iters: 450, blunder: 0.05,
    quote: 'CALCULATING OPTIMAL SLIDE.' },
  yeti: { name: 'Summit Yeti', emoji: '🦍', act: 3, tier: 'normal', cond: 'gravity',
    core: ['mountain', 'bumper'], pool: ['lasso', 'frog', 'whirl', 'mountain'], iters: 450, blunder: 0.05,
    quote: 'ROAR. Everything falls down mountain.' },
  // elites
  owl: { name: 'Grand Tactician', emoji: '🦉', act: 3, tier: 'elite',
    core: ['electromagnet', 'rail', 'swap'], pool: ['rotate', 'swap', 'beacon', 'firecracker'], iters: 300, blunder: 0.06,
    tricks: ['mirror'], quote: 'I have seen this position before.' },
  storm: { name: 'Storm Caller', emoji: '⛈️', act: 3, tier: 'elite',
    core: ['cyclone', 'flip', 'magnet'], pool: ['2048', 'bumper', 'shift'], iters: 300, blunder: 0.06,
    quote: 'The wind takes everything.' },
  // bosses
  grandmaster: { name: 'The Grandmaster', emoji: '👑', act: 3, tier: 'boss',
    rules: ['tactics'], rules2: ['tactics', 'reserved'], iters: 400, blunder: 0.03,
    quote: 'You will play what I tell you to play.' },
  twinkings: { name: 'The Twin Kings', emoji: '🎭', act: 3, tier: 'boss',
    rules: ['headstart'], rules2: ['headstart', 'reserved'], tricks: ['nudge'], iters: 450, blunder: 0.03,
    quote: 'Two crowns, two moves.' },
};

export const ACTS = [
  { n: 1, name: 'The Meadow', bosses: ['oak', 'scarecrow'], size: 2, evolve: 0.0, cond: 0.25, gold: [14, 22] },
  { n: 2, name: 'The Quarry', bosses: ['colossus', 'mirrorknight', 'carpenter'], size: 3, evolve: 0.15, cond: 0.35, gold: [18, 28] },
  { n: 3, name: 'The Summit', bosses: ['grandmaster', 'twinkings'], size: 3, evolve: 0.4, cond: 0.4, gold: [22, 34] },
];

export const enemiesOf = (act, tier) => Object.keys(ENEMIES)
  .filter((k) => ENEMIES[k].act === act && ENEMIES[k].tier === tier);

// The first couple of fights of act 1 are the gentlest ones.
export const EASY_OPENERS = ['pip', 'otter', 'rock'];

// ── Events ──────────────────────────────────────────────────────────────────
//
// Each choice is { label, detail?, can?(run), run(run, api) -> text }. The api
// (from run.js) offers the helpers a choice needs: gain stone, pick a stone, etc.

// Stones in a pouch that have an evolved form.
export const evolvable = (run) => run.pouch.filter((s) => STONES[s.type].evolvesTo);

export const EVENTS = [
  {
    id: 'stonemason', title: 'The Wandering Stonemason', emoji: '🧑‍🔧',
    text: 'A dusty stonemason sets down her chisel. "Fine stones you carry. I could make one into something else entirely — for a price."',
    choices: [
      { label: 'Pay 35 gold', detail: 'Evolve a stone.', can: (r) => r.gold >= 35 && evolvable(r).length > 0,
        act: (r, api) => api.upgradeStone(t('The stonemason gets to work.'), 1, () => { r.gold -= 35; }) },
      { label: 'Pay 2 hearts', detail: 'Evolve two stones.', can: (r) => r.hearts > 2 && evolvable(r).length >= 2,
        act: (r, api) => api.upgradeStone(t('Blood and granite.'), 2, () => { r.hearts -= 2; }) },
      { label: 'Leave', act: () => t('You nod politely and move on.') },
    ],
  },
  {
    id: 'shrine', title: 'Shrine of Rarities', emoji: '⛩️',
    text: 'An old shrine hums quietly. Offerings of heart-shaped stones lie at its foot.',
    choices: [
      { label: 'Offer a max heart', detail: 'Lose 1 max heart. Choose a rare stone.', can: (r) => r.maxHearts > 2,
        act: (r, api) => api.chooseStone('rare', () => { r.maxHearts--; r.hearts = Math.min(r.hearts, r.maxHearts); }) },
      { label: 'Pray', detail: 'Heal 1 heart.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 1); return t('A warmth settles in your chest.'); } },
    ],
  },
  {
    id: 'gambler', title: 'The Gambler\'s Table', emoji: '🎲',
    text: 'A grinning fox shuffles three cups. "Double or nothing, friend?"',
    choices: [
      { label: 'Bet 30 gold', detail: '50%: +30 gold. 50%: −30 gold.', can: (r) => r.gold >= 30,
        act: (r, api) => { if (api.rng() < 0.5) { r.gold += 30; return t('The pebble is under your cup! +30 gold.'); } r.gold -= 30; return t('Empty. The fox chuckles. −30 gold.'); } },
      { label: 'Bet everything', detail: '50%: double your gold.', can: (r) => r.gold > 0,
        act: (r, api) => { if (api.rng() < 0.5) { r.gold *= 2; return t('Fortune smiles! You now have {n} gold.', { n: r.gold }); } r.gold = 0; return t('Gone. All of it.'); } },
      { label: 'Walk away', act: () => t('The fox shrugs and pockets the cups.') },
    ],
  },
  {
    id: 'well', title: 'The Wishing Well', emoji: '🪣',
    text: 'Coins glitter at the bottom of a mossy well.',
    choices: [
      { label: 'Drink', detail: 'Heal 2 hearts.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 2); return t('Cool, clear water. You feel restored.'); } },
      { label: 'Fish for coins', detail: 'Gain 25–50 gold.', act: (r, api) => { const g = 25 + ((api.rng() * 26) | 0); r.gold += g; return t('You fish out {n} gold.', { n: g }); } },
      { label: 'Toss a coin', detail: 'Pay 10 gold, gain a random trick.', can: (r, api) => r.gold >= 10 && api.trickRoom(),
        act: (r, api) => { r.gold -= 10; return api.gainRandomTrick(); } },
    ],
  },
  {
    id: 'hermit', title: 'The Hermit\'s Challenge', emoji: '🧙',
    text: '"A duel, traveller? Beat me and take my trinket. Lose, and it costs you a heart."',
    choices: [
      { label: 'Accept the duel', detail: 'Win: a relic. Lose: −1 heart.', act: (r, api) => api.fight('hermit') },
      { label: 'Decline', act: () => t('The hermit returns to his tea.') },
    ],
  },
  {
    id: 'transmuter', title: 'The Transmuter', emoji: '⚗️',
    text: 'Bubbling flasks line a cart. "Give me a stone, and I\'ll give you back something… different."',
    choices: [
      { label: 'Transmute a stone', detail: 'Replace a stone with a random one of higher rarity.', can: (r) => r.pouch.length > 0,
        act: (r, api) => api.transmute() },
      { label: 'Leave', act: () => t('The flasks keep bubbling.') },
    ],
  },
  {
    id: 'chest', title: 'The Suspicious Chest', emoji: '🧰',
    text: 'A chest sits alone in the grass. It is almost certainly trapped.',
    choices: [
      { label: 'Open it', detail: 'Gain a relic. Lose 1 heart.', can: (r) => r.hearts > 1,
        act: (r, api) => { r.hearts--; return api.gainRandomRelic(t('A needle pricks your thumb, but inside…')); } },
      { label: 'Leave it', act: () => t('Wise, probably.') },
    ],
  },
  {
    id: 'mirror', title: 'The Duplicating Pond', emoji: '🪞',
    text: 'The pond reflects your pouch. The reflection looks… real.',
    choices: [
      { label: 'Reach in', detail: 'Duplicate a stone.', can: (r, api) => api.pouchRoom() && r.pouch.length > 0,
        act: (r, api) => api.duplicate() },
      { label: 'Wash your face', detail: 'Heal 1 heart.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 1); return t('Refreshing.'); } },
    ],
  },
  {
    id: 'thief', title: 'A Pickpocket!', emoji: '🥷',
    text: 'A shadow bumps into you and reaches for your coin purse…',
    choices: [
      { label: 'Chase him', detail: 'Duel him. Win: get it back with interest. Lose: −1 heart.', act: (r, api) => api.fight('thief') },
      { label: 'Let it go', detail: 'Lose 20 gold.', act: (r) => { r.gold = Math.max(0, r.gold - 20); return t('Easy come, easy go.'); } },
    ],
  },
  {
    id: 'fountain', title: 'The Wishing Fountain', emoji: '⛲',
    text: 'Coins glint under the water. A sign reads: "One wish per traveller."',
    choices: [
      { label: 'Wish for strength', detail: 'Evolve a random stone. Lose 1 heart.', can: (r) => r.hearts > 1 && evolvable(r).length > 0,
        act: (r, api) => {
          const plain = evolvable(r);
          const s = plain[(api.rng() * plain.length) | 0];
          const was = STONES[s.type].name;
          s.type = STONES[s.type].evolvesTo;
          r.hearts--;
          return t('The water boils for a moment. Your {stone} comes out a {evolved}.', { stone: was, evolved: STONES[s.type].name });
        } },
      { label: 'Wish for health', detail: 'Pay 20 gold, heal 2 hearts.', can: (r) => r.gold >= 20,
        act: (r) => { r.gold -= 20; r.hearts = Math.min(r.maxHearts, r.hearts + 2); return t('You feel much better.'); } },
      { label: 'Move on', act: () => t('You keep your coins.') },
    ],
  },
  {
    id: 'trader', title: 'The Trick Trader', emoji: '🎩',
    text: 'A magician fans out a deck of tricks. "Swap one, any one."',
    choices: [
      { label: 'Trade a trick', detail: 'Swap a trick for a random rare one.', can: (r) => r.tricks.length > 0,
        act: async (r, api) => {
          const k = await api.pickTrick(t('Trade which trick?'));
          if (k < 0) return t('He shrugs and shuffles the deck.');
          r.tricks.splice(k, 1);
          return api.gainRandomTrick('rare');
        } },
      { label: 'Buy a trick', detail: 'Pay 25 gold for a random trick.', can: (r, api) => r.gold >= 25 && api.trickRoom(),
        act: (r, api) => { r.gold -= 25; return api.gainRandomTrick(); } },
      { label: 'No thanks', act: () => t('He vanishes in a puff of smoke.') },
    ],
  },
  {
    id: 'library', title: 'The Rulebook Library', emoji: '📚',
    text: 'Shelves of dog-eared rulebooks. Someone has scribbled strategies in every margin.',
    choices: [
      { label: 'Study', detail: 'Evolve a random stone.', can: (r) => evolvable(r).length > 0,
        act: (r, api) => {
          const plain = evolvable(r);
          const s = plain[(api.rng() * plain.length) | 0];
          const was = STONES[s.type].name;
          s.type = STONES[s.type].evolvesTo;
          return t('You read up on the {stone}. It is now a {evolved}.', { stone: was, evolved: STONES[s.type].name });
        } },
      { label: 'Borrow a book', detail: 'Gain a random uncommon trick.', can: (r, api) => api.trickRoom(),
        act: (r, api) => api.gainRandomTrick('uncommon') },
    ],
  },
  {
    id: 'bridge', title: 'The Rickety Bridge', emoji: '🌉',
    text: 'A rope bridge sways over a gorge. On the far side, something glints.',
    choices: [
      { label: 'Cross it', detail: 'Lose 1 heart, gain 50 gold.', can: (r) => r.hearts > 1,
        act: (r) => { r.hearts--; r.gold += 50; return t('A plank snaps under you — but you make it, and pocket 50 gold.'); } },
      { label: 'Go around', act: () => t('The long way round. Nothing lost, nothing found.') },
    ],
  },
  {
    id: 'nightowl', title: 'The Night Owl', emoji: '🦉',
    text: '"Hoo. A late game, traveller? I play only the best — and I pay the best."',
    choices: [
      { label: 'Play the Owl', detail: 'A hard duel. Win: a relic and gold. Lose: −1 heart.', act: (r, api) => api.fight('nightowl') },
      { label: 'Get some sleep', detail: 'Heal 1 heart.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 1); return t('You sleep soundly.'); } },
    ],
  },
  {
    id: 'storyteller', title: 'The Storyteller', emoji: '🧓',
    text: 'An old camper tells of the summer the stones first learned to move.',
    choices: [
      { label: 'Listen', detail: 'Heal 1 heart and gain a random trick.', act: (r, api) => {
        const healed = r.hearts < r.maxHearts;
        r.hearts = Math.min(r.maxHearts, r.hearts + 1);
        const extra = api.trickRoom() ? ` ${api.gainRandomTrick()}` : '';
        return `${healed ? t('You feel better.') : t('A fine story.')}${extra}`;
      } },
      { label: 'Tell your own', detail: 'Gain 20 gold for a good yarn.', act: (r) => { r.gold += 20; return t('They toss you 20 gold. Not bad!'); } },
    ],
  },
];

// Event duels.
ENEMIES.hermit = { name: 'The Hermit', emoji: '🧙', act: 0, tier: 'event',
  core: ['swap', 'frog', 'mountain'], pool: ['shift', 'rotate', 'magnet', 'stinky'], iters: 300, blunder: 0.1,
  quote: 'Show me what you have learned.' };
ENEMIES.nightowl = { name: 'The Night Owl', emoji: '🦉', act: 0, tier: 'event',
  core: ['magnet', 'stinky', 'swap'], pool: ['shift', 'rotate', 'beacon', 'bumper'], iters: 700, blunder: 0,
  quote: 'Hoo. Your move.' };
ENEMIES.thief = { name: 'The Pickpocket', emoji: '🥷', act: 0, tier: 'event',
  core: ['firecracker', 'swap'], pool: ['shift', 'pebble', 'stinky'], iters: 150, blunder: 0.2,
  quote: 'Catch me if you can!' };

export { STONES, TRICKS, TRICK_TYPES };
