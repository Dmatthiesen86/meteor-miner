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
    // Boulders the miner has to jump; none on the first small maps.
    obstacles: Math.max(0, Math.floor((worldW - 360) / 240)),
    // Every 5th stage UFOs join the shower and shoot back.
    ufos: n % 5 === 0 ? Math.min(3, n / 5) : 0,
    ufoHp: Math.round(30 * (1 + 0.3 * (n - 1))),
    oreWeights: {
      stone: 10,
      iron: 2 + n,
      gold: n >= 3 ? (n - 2) * 0.8 : 0,
      crystal: n >= 5 ? (n - 4) * 0.5 : 0,
    },
  };
}

// `cost(level)` is the price of the next purchase when `level` are already owned.
// `needs` is an item (or any one of a list) that must be owned first; `minStage` holds late-game gear back.
export const SHOP = [
  { group: 'Miner' },
  { id: 'boots',      name: 'Boots',          desc: 'Run faster.',                                   max: 6,  cost: l => Math.round(40 * Math.pow(1.6, l)) },
  { id: 'magnet',     name: 'Magnet',         desc: 'Pull in rocks from further away.',              max: 6,  cost: l => Math.round(35 * Math.pow(1.6, l)) },
  { id: 'armor',      name: 'Armor',          desc: '+1 heart.',                                     max: 5,  cost: l => Math.round(80 * Math.pow(1.8, l)) },
  { id: 'shield',     name: 'Shield',         desc: 'Absorbs 1 hit per level. Recharges every stage.', max: 5, cost: l => Math.round(100 * Math.pow(1.7, l)) },

  { group: 'Blaster' },
  { id: 'gun',        name: 'Blaster',        desc: 'Auto-fires wherever you point.',                max: 1,  cost: () => 50 },
  { id: 'damage',     name: 'Blaster damage', desc: '+1 damage per shot.',                           max: 10, cost: l => Math.round(60 * Math.pow(1.55, l)), needs: 'gun' },
  { id: 'rate',       name: 'Fire rate',      desc: 'Blaster shoots 20% faster.',                    max: 8,  cost: l => Math.round(70 * Math.pow(1.5, l)),  needs: 'gun' },
  { id: 'gunAuto',    name: 'Blaster auto-targeting', desc: 'Blaster tracks the nearest threat by itself. Touch the sky to take over.', max: 1, cost: () => 800, needs: 'gun', minStage: 6 },
  { id: 'gunRockets', name: 'Blaster rockets', desc: 'Blaster also fires an exploding rocket every 2.5s. Each level: bigger, harder-hitting blast.', max: 5, cost: l => Math.round(600 * Math.pow(1.6, l)), needs: 'gun', minStage: 6 },

  { group: 'Towers' },
  { id: 'towers',     name: 'Tower',          desc: 'Deployable turret. Fires non-stop the way you aim it.', max: 6, cost: l => 120 + 80 * l },
  { id: 'towerDamage', name: 'Tower damage',  desc: '+1 damage per shot for every tower.',           max: 10, cost: l => Math.round(80 * Math.pow(1.55, l)), needs: 'towers' },
  { id: 'towerRate',  name: 'Tower fire rate', desc: 'Every tower shoots 20% faster.',               max: 8,  cost: l => Math.round(90 * Math.pow(1.5, l)),  needs: 'towers' },
  { id: 'towerArmor', name: 'Tower armor',    desc: 'Every tower survives 1 more blast.',            max: 6,  cost: l => Math.round(70 * Math.pow(1.6, l)),  needs: 'towers' },
  { id: 'towerShield', name: 'Tower shield',  desc: 'Towers absorb 1 blast per level. Recharges 12s after a hit.', max: 4, cost: l => Math.round(110 * Math.pow(1.7, l)), needs: 'towers' },
  { id: 'towerRepair', name: 'Tower repair',  desc: l => `Towers mend 1 health every ${REPAIR_SECONDS[Math.min(l, REPAIR_SECONDS.length - 1)]}s.`, max: 5, cost: l => Math.round(100 * Math.pow(1.6, l)), needs: 'towers' },
  { id: 'towerInsurance', name: 'Tower insurance', desc: 'Replaces 1 destroyed tower per level for free when a stage ends.', max: 6, cost: l => Math.round(150 * Math.pow(1.5, l)), needs: 'towers' },
  { id: 'autoTarget', name: 'Auto-targeting', desc: 'Towers track and lead the nearest threat on their own.', max: 1, cost: () => 900, needs: 'towers', minStage: 6 },
  { id: 'rockets',    name: 'Rocket launcher', desc: 'Towers also fire exploding rockets. Each level: bigger, harder-hitting blast.', max: 5, cost: l => Math.round(700 * Math.pow(1.6, l)), needs: 'towers', minStage: 8 },
  { id: 'homing',     name: 'Homing rockets', desc: 'All rockets, blaster and tower, steer themselves onto the nearest target.', max: 1, cost: () => 1500, needs: ['rockets', 'gunRockets'], minStage: 6 },
];

// Seconds per point of tower repair at each level of the repair upgrade (index = level - 1).
export const REPAIR_SECONDS = [18, 15, 12, 9, 6];
