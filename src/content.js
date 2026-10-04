// Everything a run is made of that is not the duel itself: relics, enemies,
// acts, events. Numbers here are the balance; tools/balance.mjs measures them.

import { STONES, BASE_STONES, ONCE_STONES, PLUS_STONES } from './engine.js';
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
  'deep-pockets': { name: 'Second Wind', emoji: '🌬️', rarity: 'rare',
    text: '+1 energy: bring stones worth one more into every duel.' },
  satchel: { name: 'Satchel', emoji: '🎒', rarity: 'common',
    text: 'Shops sell one more stone.' },
  'lucky-coin': { name: 'Lucky Coin', emoji: '🪙', rarity: 'common',
    text: '+8 gold for every duel you win.' },
  herbs: { name: 'Herbal Pouch', emoji: '🌿', rarity: 'common',
    text: 'Heal 1 heart whenever you beat an elite or a boss.' },
  badge: { name: 'Merchant\'s Badge', emoji: '🏷️', rarity: 'common',
    text: 'Everything in shops costs 25% less.' },
  clover: { name: 'Four-Leaf Clover', emoji: '🍀', rarity: 'uncommon',
    text: 'Stone rewards offer 4 choices instead of 3, and rares turn up more.' },
  bell: { name: 'Hand Bell', emoji: '🛎️', rarity: 'common',
    text: 'Find a one-shot stone after every elite or boss you beat.' },
  phoenix: { name: 'Phoenix Feather', emoji: '🪶', rarity: 'rare',
    text: 'Once, when you would run out of hearts, rise again with 3.' },
  rematch: { name: 'Rematch Token', emoji: '🎟️', rarity: 'uncommon',
    text: 'The first duel you lose in each act is replayed instead of costing hearts.' },
  piggy: { name: 'Piggy Bank', emoji: '🐷', rarity: 'common',
    text: 'Gain 60 gold now.' },
  'war-chest': { name: 'War Chest', emoji: '💰', rarity: 'rare',
    text: 'Gain 150 gold now.' },
};
// + talismans: every stone of their kinds you bring is its + form. Kinds go
// together by what they do and how much their + form adds (docs/STONE-FAMILIES.md).
// Offered only when the pouch holds one of them. Text is read when shown, in
// the language in use.
const PLUS_TALISMANS = {
  'plus-turn': { stones: ['rotate', 'bonfire'], rarity: 'uncommon', emoji: '🌀', name: 'Weathervane' },
  'plus-slide': { stones: ['shift', 'gravity'], rarity: 'uncommon', emoji: '🛷', name: 'Sled' },
  'plus-reach': { stones: ['swap', 'lasso'], rarity: 'uncommon', emoji: '🪝', name: 'Long Arm' },
  'plus-blast': { stones: ['firecracker', 'bumper'], rarity: 'rare', emoji: '🧨', name: 'Fuse' },
  'plus-fence': { stones: ['magnet', 'stinky'], rarity: 'uncommon', emoji: '🪧', name: 'Boundary Stone' },
  'plus-trick': { stones: ['frog', 'parrot'], rarity: 'common', emoji: '🎩', name: 'Trickster\'s Hat' },
};
for (const [id, p] of Object.entries(PLUS_TALISMANS)) {
  RELICS[id] = {
    upgrades: p.stones, rarity: p.rarity, emoji: p.emoji, name: p.name,
    get text() {
      const names = p.stones.map((x) => STONES[x].name);
      return t('Your {stones} stones play as their + form.', { stones: names.join(t(' and ')) });
    },
  };
}
// Saves from when each stone had a talisman of its own.
export const OLD_PLUS_RELICS = Object.fromEntries(Object.entries(PLUS_TALISMANS).flatMap(([id, p]) => p.stones.map((x) => [`plus-${x}`, id])));
export const BOSS_RELICS = ['deep-pockets', 'echo', 'phoenix', 'war-chest'];
export const RELIC_TYPES = Object.keys(RELICS);

// ── Stone economy ───────────────────────────────────────────────────────────

export const STONE_PRICE = { common: 45, uncommon: 70, rare: 100 };
export const ONCE_PRICE = { common: 30, uncommon: 45, rare: 65 };
export const RELIC_PRICE = { common: 110, uncommon: 140, rare: 170 };

// Stones you can find as rewards: everything but the Pebble and the one-shot
// stones, which come on their own.
export const REWARD_STONES = BASE_STONES.filter((t) => !STONES[t].once);
export { ONCE_STONES, PLUS_STONES };

// ── Enemies ─────────────────────────────────────────────────────────────────
//
// An enemy's special stones are its `core` plus draws from its `pool` up to
// its act's hand size, and Pebbles make up the rest. `iters` and `blunder` are
// its brain. A `cond` is its home rule, for both sides; others may roll one.
// Tuned with `node tools/lab.mjs enemies` (see docs/STONES-REPORT.md).
//
// A boss brings no special stones at all: it has `rules` that favour it, and
// once beaten (or grown stronger on the map) it rises with `rules2`, thinking
// with `iters2` if it has one.

export const ENEMIES = {
  // Act 1 — the Meadow
  pip: { name: 'Pip the Novice', emoji: '🐣', act: 1, tier: 'normal',
    core: ['shift'], pool: ['shift', 'rotate'], size: 1, iters: 40, blunder: 0.45,
    quote: 'I just learned the rules!' },
  otter: { name: 'Slidey Otter', emoji: '🦦', act: 1, tier: 'normal',
    core: ['shift', 'shift'], pool: ['shift', 'rotate'], iters: 60, blunder: 0.45,
    quote: 'Wheee! Everything slides!' },
  clinger: { name: 'Clingy Crab', emoji: '🦀', act: 1, tier: 'normal',
    core: ['magnet'], pool: ['shift', 'mountain'], iters: 25, blunder: 0.6,
    quote: 'Come closer. Closer!' },
  rock: { name: 'Grumbling Rock', emoji: '🪨', act: 1, tier: 'normal',
    core: ['mountain'], pool: ['mountain', 'rotate', 'shift'], iters: 60, blunder: 0.3,
    quote: 'Hrmph. Not moving.' },
  top: { name: 'Spinning Top', emoji: '🌀', act: 1, tier: 'normal',
    core: ['rotate', 'rotate'], pool: ['rotate', 'lasso'], iters: 70, blunder: 0.38,
    quote: 'Round and round and round.' },
  skunk: { name: 'Stinky Skunk', emoji: '🦨', act: 1, tier: 'normal',
    core: ['stinky', 'lasso'], pool: ['stinky', 'shift', 'lasso'], iters: 25, blunder: 0.6,
    quote: 'Keep your distance.' },
  mole: { name: 'Bumbling Hamster', emoji: '🐹', act: 1, tier: 'normal',
    core: ['bumper', 'lasso'], pool: ['bumper', 'lasso'], iters: 70, blunder: 0.3,
    quote: 'Push, pull, push, pull!' },
  apple: { name: 'Falling Apple', emoji: '🍎', act: 1, tier: 'normal', cond: 'gravity',
    core: ['shift'], pool: ['shift', 'rotate', 'mountain'], iters: 50, blunder: 0.4,
    quote: 'What goes up…' },
  // elites
  twins: { name: 'The Twins', emoji: '👯', act: 1, tier: 'elite',
    core: ['twin', 'frog'], pool: ['shift', 'magnet'], iters: 50, blunder: 0.42,
    quote: 'Two for the price of one!' },
  stenchlord: { name: 'Lord of Stench', emoji: '🧅', act: 1, tier: 'elite',
    core: ['stinky', 'frog', 'magnet'], pool: ['shift', 'rotate', 'mountain'], iters: 40, blunder: 0.45,
    quote: 'You will stand where I let you.' },
  // bosses
  oak: { name: 'The Old Oak', emoji: '🌳', act: 1, tier: 'boss',
    rules: ['clinch'], rules2: ['clinch', 'reserved'], iters: 100, blunder: 0.22,
    quote: 'Stay close to me, little one.' },
  scarecrow: { name: 'The Scarecrow', emoji: '🌾', act: 1, tier: 'boss',
    rules: ['reserved'], rules2: ['reserved', 'spy'], iters: 40, blunder: 0.36,
    quote: 'The middle of the field is mine.' },

  // Act 2 — the Quarry
  bee: { name: 'Bumper Bee', emoji: '🐝', act: 2, tier: 'normal',
    core: ['bumper', 'magnet'], pool: ['bumper', 'magnet', 'shift', 'rotate'], iters: 130, blunder: 0.2,
    quote: 'Bzz! Out of my way!' },
  cowboy: { name: 'Lasso Lou', emoji: '🤠', act: 2, tier: 'normal',
    core: ['lasso', 'magnet'], pool: ['shift', 'mountain', 'magnet'], iters: 130, blunder: 0.05,
    quote: 'Yeehaw, git over here.' },
  frog: { name: 'Leapin\' Frog', emoji: '🐸', act: 2, tier: 'normal',
    core: ['frog', 'stinky'], pool: ['frog', 'stinky', 'rotate'], iters: 130, blunder: 0.05,
    quote: 'Ribbit. Hop. Ribbit.' },
  keeper: { name: 'Lighthouse Keeper', emoji: '🗼', act: 2, tier: 'normal',
    core: ['magnet+', 'magnet'], pool: ['magnet', 'shift', 'mountain', 'bumper'], iters: 130, blunder: 0.15,
    quote: 'Stay in the light.' },
  dolphin: { name: 'Flip Flop', emoji: '🐬', act: 2, tier: 'normal',
    core: ['bonfire', 'bonfire'], pool: ['bonfire', 'swap', 'magnet'], iters: 130, blunder: 0.15,
    quote: 'Round and round it goes!' },
  miner: { name: 'Quarry Miner', emoji: '⛏️', act: 2, tier: 'normal',
    core: ['gravity+', 'mountain', 'magnet'], pool: ['gravity', 'mountain', 'shift', 'stinky'], iters: 130, blunder: 0.05,
    quote: 'Dig, slide, dig.' },
  magpie: { name: 'Magpie Meg', emoji: '🐦', act: 2, tier: 'normal',
    core: ['magpie', 'shift'], pool: ['shift', 'rotate', 'magnet'], iters: 90, blunder: 0.28,
    quote: 'Ooh, shiny. That one\'s mine now.' },
  // elites
  witch: { name: 'Hollow Witch', emoji: '🕷️', act: 2, tier: 'elite', cond: 'nocentre',
    core: ['magnet', 'stinky', 'swap'], pool: ['magnet', 'shift', 'rotate'], iters: 350, blunder: 0.08,
    once: ['muffle'], quote: 'Nobody sits in the middle, dear.' },
  golem: { name: 'Stone Golem', emoji: '🗿', act: 2, tier: 'elite',
    core: ['mountain', 'mountain', 'magnet'], pool: ['gravity', 'shift', 'magnet'], iters: 350, blunder: 0.08,
    once: ['lasso+'], quote: 'I. DO. NOT. MOVE.' },
  // bosses
  colossus: { name: 'Clockwork Colossus', emoji: '⚙️', act: 2, tier: 'boss',
    rules: ['column'], rules2: ['column', 'spy'], iters: 60, blunder: 0.2,
    quote: 'TICK. TOCK. THAT COLUMN, PLEASE.' },
  mirrorknight: { name: 'The Mirror Knight', emoji: '🛡️', act: 2, tier: 'boss',
    rules: ['spy'], rules2: ['spy', 'reserved'], iters: 500, blunder: 0.04,
    quote: 'Your left is my right.' },
  carpenter: { name: 'The Carpenter', emoji: '🔨', act: 2, tier: 'boss',
    rules: ['elko'], rules2: ['elko', 'spy'], iters: 300, blunder: 0.1,
    quote: 'Straight lines are for amateurs.' },

  // Act 3 — the Summit
  fay: { name: 'Firecracker Fay', emoji: '🎆', act: 3, tier: 'normal',
    core: ['firecracker', 'firecracker'], pool: ['magnet', 'shift', 'rotate', 'bumper'], iters: 450, blunder: 0.06,
    quote: 'Boom! Back you go!' },
  fox: { name: 'Turncoat Fox', emoji: '🦊', act: 3, tier: 'normal',
    core: ['swap', 'lasso'], pool: ['magnet', 'stinky', 'shift', 'mountain'], iters: 400, blunder: 0.08,
    quote: 'Loyalty is for pebbles.' },
  parrot: { name: 'Captain Polly', emoji: '🦜', act: 3, tier: 'normal', cond: 'shared',
    core: ['parrot', 'parrot'], pool: ['magnet', 'shift', 'gravity', 'swap'], iters: 400, blunder: 0.18,
    quote: 'Squawk! What\'s yours is mine!' },
  jester: { name: 'The Jester', emoji: '🃏', act: 3, tier: 'normal',
    core: ['swap', 'bonfire'], pool: ['shift', 'swap', 'magnet', 'bonfire'], iters: 220, blunder: 0.14,
    quote: 'Now you see it, now you don\'t!' },
  robot: { name: 'Tile Bot 2048', emoji: '🤖', act: 3, tier: 'normal',
    core: ['gravity+', 'gravity+'], pool: ['mountain', 'magnet', 'stinky'], iters: 450, blunder: 0.05,
    quote: 'CALCULATING OPTIMAL SLIDE.' },
  yeti: { name: 'Summit Yeti', emoji: '🦍', act: 3, tier: 'normal', cond: 'gravity',
    core: ['mountain', 'magnet', 'stinky'], pool: ['lasso', 'frog', 'bonfire', 'mountain'], iters: 450, blunder: 0.02,
    once: ['muffle'], quote: 'ROAR. Everything falls down mountain.' },
  // elites
  owl: { name: 'Grand Tactician', emoji: '🦉', act: 3, tier: 'elite',
    core: ['magnet', 'shift', 'swap'], pool: ['rotate', 'swap', 'magnet+', 'firecracker'], iters: 300, blunder: 0.06,
    once: ['swap+'], quote: 'I have seen this position before.' },
  storm: { name: 'Storm Caller', emoji: '🦅', act: 3, tier: 'elite',
    core: ['bonfire', 'bonfire', 'magnet'], pool: ['gravity', 'bumper', 'shift'], iters: 450, blunder: 0.03,
    quote: 'The wind takes everything.' },
  // bosses
  grandmaster: { name: 'The Grandmaster', emoji: '♚', act: 3, tier: 'boss',
    rules: ['tactics'], rules2: ['tactics', 'spy'], iters: 300, iters2: 450, blunder: 0.05,
    quote: 'You will play what I tell you to play.' },
  // Double Time: plain stones cannot hold out. It wants restrictions and
  // something that moves; risen, it also names the stone you play.
  twinkings: { name: 'The Twin Kings', emoji: '🎭', act: 3, tier: 'boss',
    rules: ['double'], rules2: ['double', 'tactics'], iters: 600, blunder: 0.03,
    quote: 'Two crowns, two moves.' },
};

export const ACTS = [
  { n: 1, name: 'The Meadow', bosses: ['oak', 'scarecrow'], size: 1, cond: 0.25, gold: [14, 22] },
  { n: 2, name: 'The Quarry', bosses: ['colossus', 'mirrorknight', 'carpenter'], size: 2, cond: 0.35, gold: [18, 28] },
  { n: 3, name: 'The Summit', bosses: ['grandmaster', 'twinkings'], size: 3, cond: 0.4, gold: [22, 34] },
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
    text: 'A dusty stonemason sets down her chisel. "Give me two of those stones, and I\'ll carve you one finer."',
    choices: [
      { label: 'Trade two stones', detail: 'Two stones for one of a higher tier.', can: (r) => r.pouch.length >= 2,
        act: (r, api) => api.craft() },
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
      { label: 'Toss a coin', detail: 'Pay 10 gold, gain a random one-shot stone.', can: (r) => r.gold >= 10,
        act: (r, api) => { r.gold -= 10; return api.gainRandomOnce(); } },
    ],
  },
  {
    id: 'hermit', title: 'The Hermit\'s Challenge', emoji: '🧙',
    text: '"A duel, traveller? Beat me and take my trinket. Lose, and it costs you a heart."',
    choices: [
      { label: 'Accept the duel', detail: 'Win: a talisman. Lose: −1 heart.', act: (r, api) => api.fight('hermit') },
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
      { label: 'Open it', detail: 'Gain a talisman. Lose 1 heart.', can: (r) => r.hearts > 1,
        act: (r, api) => { r.hearts--; return api.gainRandomRelic(t('A needle pricks your thumb, but inside…')); } },
      { label: 'Leave it', act: () => t('Wise, probably.') },
    ],
  },
  {
    id: 'mirror', title: 'The Duplicating Pond', emoji: '🪞',
    text: 'The pond reflects your pouch. The reflection looks… real.',
    choices: [
      { label: 'Reach in', detail: 'Duplicate a stone.', can: (r) => r.pouch.length > 0,
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
      { label: 'Wish for strength', detail: 'Choose a stone. Lose 1 heart.', can: (r) => r.hearts > 1,
        act: (r, api) => api.chooseStone(null, () => { r.hearts--; }) },
      { label: 'Wish for health', detail: 'Pay 20 gold, heal 2 hearts.', can: (r) => r.gold >= 20,
        act: (r) => { r.gold -= 20; r.hearts = Math.min(r.maxHearts, r.hearts + 2); return t('You feel much better.'); } },
      { label: 'Move on', act: () => t('You keep your coins.') },
    ],
  },
  {
    id: 'trader', title: 'The Trick Trader', emoji: '🎩',
    text: 'A magician fans out a deck of one-shot stones. "Swap one, any one."',
    choices: [
      { label: 'Trade one', detail: 'Swap a one-shot stone for a random rare one.', can: (r) => r.pouch.some((x) => STONES[x.type].once),
        act: async (r, api) => {
          const k = await api.pickOnce(t('Trade which one?'));
          if (!k) return t('He shrugs and shuffles the deck.');
          r.pouch = r.pouch.filter((x) => x !== k);
          return api.gainRandomOnce('rare');
        } },
      { label: 'Buy one', detail: 'Pay 25 gold for a random one-shot stone.', can: (r) => r.gold >= 25,
        act: (r, api) => { r.gold -= 25; return api.gainRandomOnce(); } },
      { label: 'No thanks', act: () => t('He vanishes in a puff of smoke.') },
    ],
  },
  {
    id: 'library', title: 'The Rulebook Library', emoji: '📚',
    text: 'Shelves of dog-eared rulebooks. Someone has scribbled strategies in every margin.',
    choices: [
      { label: 'Study', detail: 'Pay 30 gold, choose an uncommon stone.', can: (r) => r.gold >= 30,
        act: (r, api) => api.chooseStone('uncommon', () => { r.gold -= 30; }) },
      { label: 'Borrow a book', detail: 'Gain a random uncommon one-shot stone.',
        act: (r, api) => api.gainRandomOnce('uncommon') },
      { label: 'Leave', act: () => t('You put the books back.') },
    ],
  },
  {
    id: 'monk', title: 'The Meditating Monk', emoji: '🧘',
    text: 'A monk sits still as a stone on a mossy rock. "Breathe with me, traveller."',
    choices: [
      { label: 'Breathe deeply', detail: '+1 energy. Lose 1 max heart.', can: (r) => r.maxHearts > 2,
        act: (r) => { r.energy = (r.energy ?? 1) + 1; r.maxHearts--; r.hearts = Math.min(r.hearts, r.maxHearts); return t('Your mind clears. +1 energy.'); } },
      { label: 'Donate 40 gold', detail: '+1 energy.', can: (r) => r.gold >= 40,
        act: (r) => { r.gold -= 40; r.energy = (r.energy ?? 1) + 1; return t('The monk bows. +1 energy.'); } },
      { label: 'Tiptoe past', act: () => t('You leave the monk to the quiet.') },
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
      { label: 'Play the Owl', detail: 'A hard duel. Win: a talisman and gold. Lose: −1 heart.', act: (r, api) => api.fight('nightowl') },
      { label: 'Get some sleep', detail: 'Heal 1 heart.', act: (r) => { r.hearts = Math.min(r.maxHearts, r.hearts + 1); return t('You sleep soundly.'); } },
    ],
  },
  {
    id: 'storyteller', title: 'The Storyteller', emoji: '🧓',
    text: 'An old camper tells of the summer the stones first learned to move.',
    choices: [
      { label: 'Listen', detail: 'Heal 1 heart and gain a random one-shot stone.', act: (r, api) => {
        const healed = r.hearts < r.maxHearts;
        r.hearts = Math.min(r.maxHearts, r.hearts + 1);
        const extra = ` ${api.gainRandomOnce()}`;
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
  core: ['magnet', 'stinky', 'swap'], pool: ['shift', 'rotate', 'magnet+', 'bumper'], iters: 700, blunder: 0,
  quote: 'Hoo. Your move.' };
ENEMIES.thief = { name: 'The Pickpocket', emoji: '🥷', act: 0, tier: 'event',
  core: ['firecracker', 'swap'], pool: ['shift', 'pebble', 'stinky'], iters: 150, blunder: 0.2,
  quote: 'Catch me if you can!' };

export { STONES };
