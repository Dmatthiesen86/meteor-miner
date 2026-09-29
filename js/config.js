// All tuning lives here: world layout, ore values, stage scaling and shop prices.

// The view is always H logical units tall; width follows the screen's aspect ratio.
export const H = 720;
// Top of the ground. Everything below it is the touch strip used for movement.
export const GROUND_Y = 590;

export const ORES = {
  stone:   { name: 'Stone',   value: 1,  color: '#9aa3ad' },
  iron:    { name: 'Iron',    value: 3,  color: '#d07a4f' },
  gold:    { name: 'Gold',    value: 8,  color: '#f2c14e' },
  crystal: { name: 'Crystal', value: 20, color: '#6fe3ff' },
};
export const ORE_KEYS = Object.keys(ORES);

export function stageConfig(n) {
  const worldW = Math.min(360 + 120 * (n - 1), 2400);
  return {
    n,
    worldW,
    duration: 35 + 5 * Math.min(n, 10),
    // Wider maps get more meteors so the sky above the player stays about as busy.
    interval: Math.max(0.4, 1.15 - 0.05 * n) / Math.pow(worldW / 360, 0.8),
    speedMin: Math.min(80 + 8 * n, 260),
    speedMax: Math.min(150 + 14 * n, 420),
    minR: 9,
    maxR: Math.min(23 + 5 * n, 72),
    hpMul: 1 + 0.3 * (n - 1),
    oreWeights: {
      stone: 10,
      iron: 2 + n,
      gold: n >= 3 ? (n - 2) * 0.8 : 0,
      crystal: n >= 5 ? (n - 4) * 0.5 : 0,
    },
  };
}

// `cost(level)` is the price of the next purchase when `level` are already owned.
export const SHOP = [
  { id: 'gun',        name: 'Blaster',        desc: 'Auto-fires wherever you point.',                max: 1,  cost: () => 50 },
  { id: 'damage',     name: 'Blaster damage', desc: '+1 damage per shot.',                           max: 10, cost: l => Math.round(60 * Math.pow(1.55, l)), needs: 'gun' },
  { id: 'rate',       name: 'Fire rate',      desc: 'Blaster shoots 20% faster.',                    max: 8,  cost: l => Math.round(70 * Math.pow(1.5, l)),  needs: 'gun' },
  { id: 'towers',     name: 'Tower',          desc: 'Deployable turret. Fires non-stop the way you aim it.', max: 6, cost: l => 120 + 80 * l },
  { id: 'towerDamage', name: 'Tower damage',  desc: '+1 damage per shot for every tower.',           max: 10, cost: l => Math.round(80 * Math.pow(1.55, l)), needs: 'towers' },
  { id: 'towerArmor', name: 'Tower armor',    desc: 'Every tower survives 1 more blast.',            max: 6,  cost: l => Math.round(70 * Math.pow(1.6, l)),  needs: 'towers' },
  { id: 'boots',      name: 'Boots',          desc: 'Run faster.',                                   max: 6,  cost: l => Math.round(40 * Math.pow(1.6, l)) },
  { id: 'magnet',     name: 'Magnet',         desc: 'Pull in rocks from further away.',              max: 6,  cost: l => Math.round(35 * Math.pow(1.6, l)) },
  { id: 'armor',      name: 'Armor',          desc: '+1 heart.',                                     max: 5,  cost: l => Math.round(80 * Math.pow(1.8, l)) },
];
