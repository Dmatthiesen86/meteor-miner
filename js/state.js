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
    up: { gun: 0, damage: 0, rate: 0, gunAuto: 0, gunRockets: 0, shield: 0, towers: 0, towerDamage: 0, towerRate: 0, towerArmor: 0, towerShield: 0, towerRepair: 0, towerInsurance: 0, autoTarget: 0, rockets: 0, homing: 0, boots: 0, magnet: 0, armor: 0 },
    muted: false,
    boons: {},               // bonus picks held this run: id -> how many
    pendingBoon: null,       // the 3 ids on offer, until one is chosen
    // permanent: survive both "New game" and a new expedition
    shards: 0,
    expeditions: 0,
    perks: { value: 0, power: 0, luck: 0, start: 0 },
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
    return { ...base, ...s, up, cargo: { ...base.cargo, ...s.cargo }, perks: { ...base.perks, ...s.perks } };
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
/** How many of a bonus pick the player holds. */
export const boon = id => G.profile.boons[id] || 0;

/** What the cargo sells for, including the Rich veins perk and Prospector picks. */
export function saleValue(cargo) {
  return Math.round(cargoValue(cargo) * (1 + 0.15 * G.profile.perks.value) * (1 + 0.2 * boon('prospector')));
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
  obstacles: [], meteors: [], ufos: [], shots: [], rocks: [], bullets: [], towers: [], parts: [], floaters: [],
  towersLeft: 0,
  haul: emptyCargo(),
  stats: { destroyed: 0, landed: 0, ufos: 0, boss: false },
  boss: null,              // the boss in play, for the health bar
  wind: 0,
  banner: null,
  patches: [],             // ice and fire left on the ground by special meteors
  time: 0,
  shake: 0,
  moved: false,
  // Set by the UI so the simulation can hand control back without importing it.
  on: { clear() {}, dead() {} },
};
