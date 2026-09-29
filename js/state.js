// Shared game state (G) plus the saved profile that survives between sessions.
import { ORES, ORE_KEYS } from './config.js';

const SAVE_KEY = 'meteor-miner-save-v1';

export const emptyCargo = () => Object.fromEntries(ORE_KEYS.map(k => [k, 0]));

export function newProfile() {
  return {
    stage: 1,
    best: 1,
    money: 0,
    cargo: emptyCargo(),
    up: { gun: 0, damage: 0, rate: 0, towers: 0, towerDamage: 0, towerArmor: 0, boots: 0, magnet: 0, armor: 0 },
    muted: false,
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !s.up) return null;
    const base = newProfile();
    const up = { ...base.up, ...s.up };
    // Saves from before tower power was split into damage and armor.
    if (up.towerPower) { up.towerDamage = Math.max(up.towerDamage, up.towerPower); }
    delete up.towerPower;
    return { ...base, ...s, up, cargo: { ...base.cargo, ...s.cargo } };
  } catch {
    return null;
  }
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.profile)); } catch { /* private mode etc. */ }
}

export function cargoValue(cargo) {
  return ORE_KEYS.reduce((sum, k) => sum + cargo[k] * ORES[k].value, 0);
}
export function cargoCount(cargo) {
  return ORE_KEYS.reduce((sum, k) => sum + cargo[k], 0);
}

const loaded = load();

export const G = {
  mode: 'menu',            // menu | playing | clearing | paused | shop | dead
  hasSave: !!loaded,
  profile: loaded ?? newProfile(),
  view: { w: 360, scale: 1, dpr: 1, camX: 0 },
  worldW: 360,
  cfg: null,
  aim: -Math.PI / 2,
  player: null,
  meteors: [], rocks: [], bullets: [], towers: [], parts: [], floaters: [],
  towersLeft: 0,
  haul: emptyCargo(),
  stats: { destroyed: 0, landed: 0 },
  time: 0,
  shake: 0,
  moved: false,
  // Set by the UI so the simulation can hand control back without importing it.
  on: { clear() {}, dead() {} },
};
