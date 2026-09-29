// All tuning lives here: world layout, ore values, stage scaling and shop prices.

// The view is always H logical units tall; width follows the screen's aspect ratio.
export const H = 720;
// Top of the ground. Everything below it is the touch strip used for movement.
export const GROUND_Y = 590;

// `from` is the first stage an ore can fall on; `k` is how common it is once it does.
// Each ore peaks a few stages after it appears and then thins out as richer ones arrive,
// which is what keeps income growing over a long run.
export const ORES = {
  stone:    { name: 'Stone',     value: 1,   color: '#9aa3ad', from: -5, k: 1 },
  iron:     { name: 'Iron',      value: 3,   color: '#d07a4f', from: 1,  k: 0.8 },
  gold:     { name: 'Gold',      value: 8,   color: '#f2c14e', from: 3,  k: 0.5 },
  crystal:  { name: 'Crystal',   value: 20,  color: '#6fe3ff', from: 5,  k: 0.4 },
  emerald:  { name: 'Emerald',   value: 50,  color: '#4fe08a', from: 12, k: 0.5 },
  ruby:     { name: 'Ruby',      value: 120, color: '#ff4f7a', from: 20, k: 0.5 },
  diamond:  { name: 'Diamond',   value: 300, color: '#e8f4ff', from: 30, k: 0.5 },
  starcore: { name: 'Star core', value: 800, color: '#c58bff', from: 45, k: 0.5 },
};
export const ORE_KEYS = Object.keys(ORES);

const TOP_ORE = ORE_KEYS[ORE_KEYS.length - 1];        // nothing richer replaces it, so it never thins out
const oreWeight = (o, n) => n < o.from ? 0
  : o.k * (n - o.from + 2) / (o === ORES[TOP_ORE] ? 1 : 1 + Math.pow((n - o.from) / 10, 2));

/** The most valuable ore that falls on stage n. */
export const bestOre = n => ORE_KEYS.filter(k => ORES[k].from <= n).pop();

// Special meteors, one new kind every 5 stages. `body`/`glow`/`trail` are how they look.
export const METEOR_STYLE = {
  normal:  { body: '#6b4a3a', glow: '255, 140, 60',  trail: ['#ff8a3c', '#ffd166'] },
  golden:  { body: '#d9a520', glow: '255, 215, 80',  trail: ['#ffe9a8', '#ffd166'] },
  cluster: { body: '#7d5a96', glow: '190, 120, 255', trail: ['#c58bff', '#ffd166'] },
  ice:     { body: '#7fb6d6', glow: '140, 220, 255', trail: ['#d9f8ff', '#8fe9ff'] },
  fire:    { body: '#a8402c', glow: '255, 70, 30',   trail: ['#ff4f2a', '#ffb347'] },
  iron:    { body: '#70788a', glow: '200, 210, 230', trail: ['#c9d2f2', '#9aa3ad'] },
  homing:  { body: '#8a2f6b', glow: '255, 80, 200',  trail: ['#ff7ad9', '#ffd6f3'] },
};
export const METEOR_KINDS = {
  cluster: { from: 3,  name: 'Cluster meteors', tip: 'They burst into a swarm on the way down.' },
  ice:     { from: 8,  name: 'Ice meteors',     tip: 'They leave slippery ice where they land.' },
  fire:    { from: 13, name: 'Fire meteors',    tip: 'They leave burning ground. Jump over it.' },
  iron:    { from: 18, name: 'Armored meteors', tip: 'Bullets barely scratch them. Rockets work.' },
  homing:  { from: 23, name: 'Seeker meteors',  tip: 'They drift toward you as they fall.' },
};
// Rare jackpot: pays out the best ore, but only if it is shot down.
export const GOLDEN = { from: 6, chance: 0.025, name: 'Golden meteors', tip: 'Rare. Shoot one down for a jackpot; it pays nothing if it lands.' };
const KIND_CHANCE = 0.09, KIND_CHANCE_MAX = 0.5;

export function pickKind(cfg) {
  if (cfg.n >= GOLDEN.from && Math.random() < GOLDEN.chance) return 'golden';
  const share = Math.min(KIND_CHANCE_MAX, cfg.kinds.length * KIND_CHANCE);
  if (!cfg.kinds.length || Math.random() >= share) return 'normal';
  return cfg.kinds[Math.floor(Math.random() * cfg.kinds.length)];
}

// Growth is fast over the first ~20 stages, then keeps creeping up so stage 60 is still
// harder than stage 40.
export function stageConfig(n) {
  const late = Math.max(0, n - 20);
  const worldW = n <= 18 ? 360 + 120 * (n - 1) : Math.min(2400 + 40 * (n - 18), 4000);
  const hpMul = 1 + 0.3 * (n - 1) + 0.01 * late * late;
  const newKind = Object.keys(METEOR_KINDS).find(k => METEOR_KINDS[k].from === n);
  return {
    n,
    worldW,
    duration: 35 + 5 * Math.min(n, 10),
    // Wider maps get more meteors so the sky above the player stays about as busy.
    interval: (n <= 15 ? 1.15 - 0.05 * n : Math.max(0.28, 0.4 - 0.003 * (n - 15))) / Math.pow(worldW / 360, 0.8),
    speedMin: Math.min(80 + 8 * n, 260) + Math.min(80, late * 1.5),
    speedMax: Math.min(150 + 14 * n, 420) + Math.min(100, late * 2),
    minR: 9,
    maxR: Math.min(23 + 5 * n, 72) + Math.min(23, Math.max(0, n - 10) * 0.4),
    hpMul,
    // Boulders the miner has to jump; none on the first small maps.
    obstacles: Math.max(0, Math.floor((worldW - 360) / 240)),
    // Every 5th stage UFOs join the shower and shoot back.
    ufos: n % 5 !== 0 ? 0 : n <= 15 ? n / 5 : Math.min(6, 3 + Math.floor((n - 15) / 15)),
    ufoHp: Math.round(30 * hpMul),
    kinds: Object.keys(METEOR_KINDS).filter(k => METEOR_KINDS[k].from <= n),
    newThreat: newKind ? METEOR_KINDS[newKind] : n === GOLDEN.from ? GOLDEN : null,
    oreWeights: Object.fromEntries(ORE_KEYS.map(k => [k, oreWeight(ORES[k], n)])),
  };
}

// `cost(level)` is the price of the next purchase when `level` are already owned.
// `needs` is an item (or any one of a list) that must be owned first; `minStage` holds late-game gear back.
// `endless` items can be bought past `max`; see priceOf().
export const SHOP = [
  { group: 'Miner' },
  { id: 'boots',      name: 'Boots',          desc: 'Run faster.',                                   max: 6,  cost: l => Math.round(40 * Math.pow(1.6, l)) },
  { id: 'magnet',     name: 'Magnet',         desc: 'Pull in rocks from further away.',              max: 6,  cost: l => Math.round(35 * Math.pow(1.6, l)) },
  { id: 'armor',      name: 'Armor',          desc: '+1 heart.',                                     max: 5,  cost: l => Math.round(80 * Math.pow(1.8, l)), endless: true },
  { id: 'shield',     name: 'Shield',         desc: 'Absorbs 1 hit per level. Recharges every stage.', max: 5, cost: l => Math.round(100 * Math.pow(1.7, l)) },

  { group: 'Blaster' },
  { id: 'gun',        name: 'Blaster',        desc: 'Auto-fires wherever you point.',                max: 1,  cost: () => 50 },
  { id: 'damage',     name: 'Blaster damage', desc: '+1 damage per shot.',                           max: 10, cost: l => Math.round(60 * Math.pow(1.55, l)), needs: 'gun', endless: true },
  { id: 'rate',       name: 'Blaster fire rate', desc: 'Blaster shoots 20% faster.',                 max: 8,  cost: l => Math.round(70 * Math.pow(1.5, l)),  needs: 'gun' },
  { id: 'gunAuto',    name: 'Blaster auto-targeting', desc: 'Blaster tracks the nearest threat by itself. Touch the sky to take over.', max: 1, cost: () => 800, needs: 'gun', minStage: 6 },
  { id: 'gunRockets', name: 'Blaster rockets', desc: 'Blaster also fires an exploding rocket every 2.5s. Each level: bigger, harder-hitting blast.', max: 5, cost: l => Math.round(600 * Math.pow(1.6, l)), needs: 'gun', minStage: 6 },

  { group: 'Towers' },
  { id: 'towers',     name: 'Tower',          desc: 'Deployable turret. Fires non-stop the way you aim it.', max: 6, cost: l => 120 + 80 * l },
  { id: 'towerDamage', name: 'Tower damage',  desc: '+1 damage per shot for every tower.',           max: 10, cost: l => Math.round(80 * Math.pow(1.55, l)), needs: 'towers', endless: true },
  { id: 'towerRate',  name: 'Tower fire rate', desc: 'Every tower shoots 20% faster.',               max: 8,  cost: l => Math.round(90 * Math.pow(1.5, l)),  needs: 'towers' },
  { id: 'towerArmor', name: 'Tower armor',    desc: 'Every tower survives 1 more blast.',            max: 6,  cost: l => Math.round(70 * Math.pow(1.6, l)),  needs: 'towers', endless: true },
  { id: 'towerShield', name: 'Tower shield',  desc: 'Towers absorb 1 blast per level. Recharges 12s after a hit.', max: 4, cost: l => Math.round(110 * Math.pow(1.7, l)), needs: 'towers' },
  { id: 'towerRepair', name: 'Tower repair',  desc: l => `Towers mend 1 health every ${REPAIR_SECONDS[Math.min(l, REPAIR_SECONDS.length - 1)]}s.`, max: 5, cost: l => Math.round(100 * Math.pow(1.6, l)), needs: 'towers' },
  { id: 'towerInsurance', name: 'Tower insurance', desc: 'Replaces 1 destroyed tower per level for free when a stage ends.', max: 6, cost: l => Math.round(150 * Math.pow(1.5, l)), needs: 'towers' },
  { id: 'autoTarget', name: 'Auto-targeting', desc: 'Towers track and lead the nearest threat on their own.', max: 1, cost: () => 900, needs: 'towers', minStage: 6 },
  { id: 'rockets',    name: 'Rocket launcher', desc: 'Towers also fire exploding rockets. Each level: bigger, harder-hitting blast.', max: 5, cost: l => Math.round(700 * Math.pow(1.6, l)), needs: 'towers', minStage: 8 },
  { id: 'homing',     name: 'Homing rockets', desc: 'All rockets, blaster and tower, steer themselves onto the nearest target.', max: 1, cost: () => 1500, needs: ['rockets', 'gunRockets'], minStage: 6 },
];

// Past its normal max an endless item keeps going, with the price rising 22% a level
// instead of the steeper early curve, so there is always something worth saving for.
export function priceOf(item, level) {
  if (level <= item.max) return item.cost(level);
  return Math.round(item.cost(item.max) * Math.pow(1.22, level - item.max));
}

// Seconds per point of tower repair at each level of the repair upgrade (index = level - 1).
export const REPAIR_SECONDS = [18, 15, 12, 9, 6];

// ---------- expeditions (prestige) ----------
// From PRESTIGE_STAGE on, the run can be cashed in for star shards. Stage, cash and gear
// reset; shards and the perks bought with them are permanent.
export const PRESTIGE_STAGE = 15;
export const shardsFor = stage => Math.floor(stage / 5) + Math.floor(Math.pow(stage / 10, 2));

export const PERKS = [
  { id: 'value', name: 'Rich veins', desc: '+15% cash for every rock sold.',               max: 20 },
  { id: 'power', name: 'Hot rounds', desc: '+10% damage for blaster, towers and rockets.', max: 20 },
  { id: 'luck',  name: 'Lucky pick', desc: '+5% chance a rock counts double.',             max: 10 },
  { id: 'start', name: 'Head start', desc: 'Begin every expedition with $250 more.',       max: 10 },
];
export const perkCost = level => level + 1;
export const START_CASH_PER_LEVEL = 250;
