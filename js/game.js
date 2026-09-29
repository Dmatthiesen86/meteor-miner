// The simulation: player, meteors, rocks, bullets, towers and stage flow.
import { GROUND_Y, ORES, ORE_KEYS, REPAIR_SECONDS, stageConfig } from './config.js';
import { G, save, emptyCargo } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';

const GRAVITY = 900;
const BULLET_SPEED = 640;
const TOWER_SPACING = 30;
const MAX_PARTS = 350;
const TOWER_SHIELD_RECHARGE = 12;   // seconds without a hit before a tower's shield refills
const TOWER_TURN = 4;                // rad/s an auto-targeting tower can swing its barrel
const ROCKET_SPEED = 380, ROCKET_INTERVAL = 3.2, GUN_ROCKET_INTERVAL = 2.5;
const ROCKET_TURN = 5;               // rad/s a homing rocket can steer
const HOMING_RANGE = 420;
const UFO_R = 20, UFO_SHOT_SPEED = 230;
const UFO_LINGER = 15;               // seconds after the shower before UFOs give up and leave
const JUMP_SPEED = 430, JUMP_GRAVITY = 1400;   // one fixed jump, ~66 high: clears every boulder
const GUN_TURN = 8;                  // rad/s the auto-targeting blaster swings
const AIM_MARGIN = 0.12;          // keeps guns from firing flat along the ground

export const PLAYER_H = 36;
export const GUN_Y = GROUND_Y - 24;
export const TOWER_Y = GROUND_Y - 22;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const blastRadius = r => r * 1.5 + 14;
export const gunStats = up => ({ dmg: 1 + up.damage, interval: 0.3 / (1 + 0.2 * up.rate) });
export const towerStats = up => ({ dmg: 1 + up.towerDamage, interval: 0.55 / (1 + 0.2 * up.towerRate), hp: 3 + up.towerArmor, shield: up.towerShield });
export const rocketStats = up => ({ dmg: (2 + up.rockets) * (1 + up.towerDamage), blast: 40 + 9 * up.rockets });
export const gunRocketStats = up => ({ dmg: (2 + up.gunRockets) * (1 + up.damage), blast: 40 + 9 * up.gunRockets });
export const magnetRadius = up => 34 + 20 * up.magnet;
export const maxHearts = up => 3 + up.armor;

export function startStage() {
  const p = G.profile, cfg = stageConfig(p.stage);
  G.cfg = cfg;
  G.worldW = cfg.worldW;
  G.player = { x: cfg.worldW / 2, vx: 0, hp: maxHearts(p.up), maxHp: maxHearts(p.up), shield: p.up.shield, inv: 0, walk: 0, face: 1, jy: 0, vjump: 0 };
  G.meteors = []; G.ufos = []; G.shots = []; G.rocks = []; G.bullets = []; G.towers = []; G.parts = []; G.floaters = [];
  G.obstacles = makeObstacles(cfg);
  G.towersLeft = p.up.towers;
  G.haul = emptyCargo();
  G.stats = { destroyed: 0, landed: 0, ufos: 0 };
  G.ufosToSpawn = cfg.ufos;
  G.nextUfoT = cfg.duration * 0.25;
  G.banner = cfg.obstacles && cfg.n <= 4 ? { text: 'JUMP THE BOULDERS', life: 3.5, color: '#ffd166' } : null;
  G.time = 0;
  G.spawnT = 1.2;
  G.gunT = 0;
  G.gunRocketT = 1;
  G.shake = 0;
  G.aim = -Math.PI / 2;
  input.deploy = false;
  input.jump = false;
  G.mode = 'playing';
  updateCamera();
}

// Boulders spread along the map, kept clear of the spot where the miner starts.
function makeObstacles(cfg) {
  const W = cfg.worldW, list = [];
  for (let i = 0; i < cfg.obstacles; i++) {
    let x = W * (i + 0.5) / cfg.obstacles + rand(-40, 40);
    if (Math.abs(x - W / 2) < 70) x += x < W / 2 ? -90 : 90;
    list.push({
      x: clamp(x, 70, W - 70), w: rand(26, 36), h: rand(22, 34),
      shape: Array.from({ length: 7 }, () => rand(0.8, 1.05)),
    });
  }
  return list;
}

const obstacleAt = (x, pad) => G.obstacles.find(o => Math.abs(x - o.x) < o.w / 2 + pad) || null;

export function updateCamera() {
  const v = G.view, W = G.worldW;
  // Narrow maps are centred on wide screens; wide maps scroll with the player.
  v.camX = v.w >= W ? -(v.w - W) / 2 : clamp(G.player.x - v.w / 2, 0, W - v.w);
}

/** The tower the player is standing at, if any (re-aim target). */
export function towerInReach() {
  return G.towers.find(t => Math.abs(t.x - G.player.x) < TOWER_SPACING) || null;
}

function clampAim(a) {
  if (a > -AIM_MARGIN && a <= Math.PI / 2) return -AIM_MARGIN;
  if (a > Math.PI / 2 || a < -Math.PI + AIM_MARGIN) return -Math.PI + AIM_MARGIN;
  return a;
}

// ---------- spawning ----------

function pickOre(weights) {
  let total = 0;
  for (const k of ORE_KEYS) total += weights[k];
  let roll = Math.random() * total;
  for (const k of ORE_KEYS) {
    roll -= weights[k];
    if (roll <= 0) return k;
  }
  return 'stone';
}

function makeMeteor(x, y, vx, vy, r, ore) {
  const hp = Math.max(1, Math.round(Math.pow(r / 11, 2) * G.cfg.hpMul));
  const n = 9 + Math.floor(Math.random() * 4);
  return {
    x, y, vx, vy, r, ore, hp, maxHp: hp,
    rot: rand(0, Math.PI * 2), spin: rand(-1.5, 1.5),
    shape: Array.from({ length: n }, () => rand(0.78, 1.12)),
    flecks: Array.from({ length: 3 + Math.floor(r / 10) }, () => ({ a: rand(0, Math.PI * 2), d: rand(0.15, 0.7), s: rand(0.08, 0.16) })),
    flash: 0, trail: 0, dead: false,
  };
}

function spawnMeteor() {
  const c = G.cfg, W = G.worldW;
  const r = c.minR + Math.pow(Math.random(), 2.2) * (c.maxR - c.minR);
  const x = rand(r, W - r);
  const tx = clamp(x + rand(-160, 160), r, W - r);
  // Bigger rocks fall slower so there is time to get clear of the larger blast.
  const bigness = (r - c.minR) / (c.maxR - c.minR);
  const vy = rand(c.speedMin, c.speedMax) * (1 - 0.35 * bigness);
  const y = -r - 10;
  const t = (GROUND_Y - y) / vy;
  G.meteors.push(makeMeteor(x, y, (tx - x) / t, vy, r, pickOre(c.oreWeights)));
}

function spawnUfo() {
  const W = G.worldW, fromLeft = Math.random() < 0.5;
  G.ufos.push({
    x: fromLeft ? -40 : W + 40, y: 70, vx: 0, homeY: rand(105, 190), speed: rand(80, 120),
    hp: G.cfg.ufoHp, maxHp: G.cfg.ufoHp, cd: rand(2, 3), phase: rand(0, 6),
    flash: 0, leaving: false, dead: false,
  });
  G.banner = { text: 'UFO INCOMING', life: 2.5, color: '#ff7ad9' };
  sfx.alarm();
}

// ---------- effects ----------

function particle(x, y, vx, vy, life, color, size, grav = 0) {
  if (G.parts.length >= MAX_PARTS) return;
  G.parts.push({ x, y, vx, vy, life, max: life, color, size, grav });
}

function burst(x, y, n, speed, colors, size, grav, upOnly = false) {
  for (let i = 0; i < n; i++) {
    const a = upOnly ? rand(-Math.PI, 0) : rand(0, Math.PI * 2);
    const s = rand(speed * 0.25, speed);
    particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.8), colors[i % colors.length], rand(size * 0.5, size), grav);
  }
}

function floater(x, y, text, color) {
  G.floaters.push({ x, y, text, color, life: 0.9 });
}

function dropRocks(m, count, onGround) {
  for (let i = 0; i < count; i++) {
    // Mostly the meteor's own ore, with some plain stone mixed in.
    const ore = Math.random() < 0.7 ? m.ore : 'stone';
    G.rocks.push({
      x: m.x + rand(-m.r, m.r) * 0.6,
      y: onGround ? GROUND_Y - 6 : m.y + rand(-m.r, m.r) * 0.5,
      vx: rand(-1, 1) * (onGround ? 60 + m.r * 3 : 50),
      vy: onGround ? rand(-320, -140) : m.vy * 0.4 + rand(-120, 20),
      ore, life: 16, spin: rand(0, 6), resting: false,
    });
  }
}

// ---------- combat ----------

function hurtPlayer() {
  const p = G.player;
  if (p.inv > 0 || G.mode !== 'playing') return;
  if (p.shield > 0) {
    p.shield--;
    p.inv = 1;
    G.shake = Math.max(G.shake, 8);
    burst(p.x, GROUND_Y - 20, 16, 240, ['#8fe9ff', '#d9f8ff'], 4, 200);
    floater(p.x, GROUND_Y - PLAYER_H - 14, p.shield ? 'Shield hit' : 'Shield down', '#8fe9ff');
    sfx.shield();
    return;
  }
  p.hp--;
  p.inv = 1.4;
  G.shake = Math.max(G.shake, 14);
  burst(p.x, GROUND_Y - 20, 14, 220, ['#ff6b5e', '#ffd166'], 4, 500);
  if (p.hp <= 0) {
    sfx.dead();
    G.mode = 'dead';
    G.on.dead();
  } else {
    sfx.hurt();
  }
}

// A meteor reaching the ground (or the player): blast, debris, and a partial ore yield.
function impact(m) {
  m.dead = true;
  G.stats.landed++;
  const blast = blastRadius(m.r);
  const y = Math.min(m.y + m.r * 0.6, GROUND_Y);
  G.shake = Math.max(G.shake, Math.min(18, 3 + m.r * 0.3));
  sfx.impact(m.r);
  burst(m.x, y, 10 + Math.floor(m.r * 0.6), 160 + m.r * 5, ['#ffb347', '#ff6b3c', '#ffe9a8'], 5, 300, true);
  burst(m.x, y, 8 + Math.floor(m.r * 0.4), 120 + m.r * 3, ['#5b4636', '#7a6150'], 5, 900, true);
  G.parts.push({ ring: true, x: m.x, y: GROUND_Y, r: blast, life: 0.35, max: 0.35 });
  dropRocks(m, Math.max(1, Math.round(m.r / 9)), true);

  if (Math.abs(G.player.x - m.x) < blast + 8) hurtPlayer();
  for (const t of G.towers) {
    if (Math.abs(t.x - m.x) < blast * 0.8) damageTower(t);
  }
}

function damageTower(t) {
  t.flash = 0.25;
  t.recharge = TOWER_SHIELD_RECHARGE;
  t.repairT = 0;
  if (t.shield > 0) {
    t.shield--;
    burst(t.x, TOWER_Y, 12, 200, ['#8fe9ff', '#d9f8ff'], 4, 200);
    sfx.shield();
    return;
  }
  t.hp--;
  if (t.hp <= 0) {
    t.dead = true;
    burst(t.x, TOWER_Y, 16, 200, ['#6fe3ff', '#9aa3ad', '#ffb347'], 4, 600);
    floater(t.x, TOWER_Y - 24, 'Tower lost', '#ff6b5e');
  }
}

// A meteor shot apart in the air: big ones split, small ones pay out a bonus yield.
function shatter(m) {
  m.dead = true;
  G.stats.destroyed++;
  sfx.shatter(m.r);
  burst(m.x, m.y, 8 + Math.floor(m.r * 0.5), 140 + m.r * 3, ['#7a6150', '#5b4636', ORES[m.ore].color], 4, 500);
  if (m.r >= 26) {
    const r2 = m.r * 0.62;
    for (const dir of [-1, 1]) {
      G.meteors.push(makeMeteor(m.x + dir * r2 * 0.6, m.y, m.vx + dir * rand(30, 70), m.vy * 0.85, r2, m.ore));
    }
    dropRocks(m, Math.max(1, Math.round(m.r / 18)), false);
  } else {
    dropRocks(m, Math.max(1, Math.round(m.r / 9 * 1.5)), false);
  }
}

function damageMeteor(m, dmg, bx, by) {
  m.hp -= dmg;
  m.flash = 0.08;
  burst(bx, by, 3, 120, ['#ffe9a8', ORES[m.ore].color], 3, 300);
  if (m.hp <= 0) shatter(m);
  else sfx.hit();
}

function damageUfo(u, dmg, bx, by) {
  u.hp -= dmg;
  u.flash = 0.08;
  burst(bx, by, 3, 140, ['#ff7ad9', '#ffe9a8'], 3, 300);
  if (u.hp > 0) { sfx.hit(); return; }
  u.dead = true;
  G.stats.ufos++;
  G.shake = Math.max(G.shake, 12);
  sfx.impact(30);
  burst(u.x, u.y, 30, 300, ['#ff7ad9', '#8fe9ff', '#ffe9a8', '#9aa3ad'], 5, 400);
  G.parts.push({ ring: true, x: u.x, y: u.y + 20, r: 60, life: 0.4, max: 0.4 });
  floater(u.x, u.y - 24, 'UFO down!', '#ff7ad9');
  // wreckage is the best loot in the game
  dropRocks({ x: u.x, y: u.y, r: 26, vy: 0, ore: 'crystal' }, 6 + 2 * G.cfg.ufos, false);
  dropRocks({ x: u.x, y: u.y, r: 26, vy: 0, ore: 'gold' }, 4, false);
}

function fire(x, y, angle, dmg, color) {
  G.bullets.push({ x, y, vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED, dmg, color, dead: false });
}

function fireRocket(x, y, angle, stats, homing) {
  G.bullets.push({
    x, y, vx: Math.cos(angle) * ROCKET_SPEED, vy: Math.sin(angle) * ROCKET_SPEED,
    dmg: stats.dmg, blast: stats.blast, homing, color: '#ffb347', trail: 0, dead: false,
  });
}

// Swing a homing rocket toward the closest thing in the sky, keeping its speed.
function steerRocket(b, dt) {
  let best = null, bestD = HOMING_RANGE;
  for (const list of [G.meteors, G.ufos]) {
    for (const m of list) {
      if (m.dead || m.leaving || m.y > GROUND_Y - 30) continue;
      const d = Math.hypot(m.x - b.x, m.y - b.y);
      if (d < bestD) { bestD = d; best = m; }
    }
  }
  if (!best) return;
  const lead = bestD / ROCKET_SPEED;
  const want = Math.atan2(best.y + (best.vy || 0) * lead - b.y, best.x + best.vx * lead - b.x);
  const now = Math.atan2(b.vy, b.vx);
  let diff = want - now;
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  const a = now + clamp(diff, -ROCKET_TURN * dt, ROCKET_TURN * dt);
  b.vx = Math.cos(a) * ROCKET_SPEED;
  b.vy = Math.sin(a) * ROCKET_SPEED;
}

// A rocket going off: everything inside the blast takes the full damage.
function explode(b) {
  G.shake = Math.max(G.shake, 5);
  sfx.shatter(b.blast * 0.5);
  burst(b.x, b.y, 18, 260, ['#ffb347', '#ff6b3c', '#ffe9a8'], 5, 200);
  G.parts.push({ ring: true, x: b.x, y: b.y + b.blast * 0.35, r: b.blast, life: 0.3, max: 0.3 });
  const n = G.meteors.length;               // pieces that split off are spared this blast
  for (let i = 0; i < n; i++) {
    const m = G.meteors[i];
    if (!m.dead && Math.hypot(m.x - b.x, m.y - b.y) < b.blast + m.r) damageMeteor(m, b.dmg, m.x, m.y);
  }
  for (const u of G.ufos) {
    if (!u.dead && Math.hypot(u.x - b.x, u.y - b.y) < b.blast + UFO_R) damageUfo(u, b.dmg, u.x, u.y);
  }
}

// Angle that leads the target for a gun at (x, y), or null if the sky is clear. A meteor
// about to land on the gun comes first (lowest one wins); otherwise the nearest threat.
function targetAngle(x, y) {
  let best = null, bestD = Infinity, danger = null;
  for (const m of G.meteors) {
    if (m.dead || m.y < 0 || m.y > GROUND_Y - 30) continue;
    const landX = m.x + m.vx * (GROUND_Y - m.y) / m.vy;
    if (Math.abs(landX - x) < blastRadius(m.r) * 0.8 + 10 && (!danger || m.y > danger.y)) danger = m;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bestD) { bestD = d; best = m; }
  }
  for (const u of G.ufos) {
    if (u.dead || u.leaving || u.y < 0) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bestD) { bestD = d; best = u; }
  }
  if (danger) { best = danger; bestD = Math.hypot(danger.x - x, danger.y - y); }
  if (!best) return null;
  const lead = bestD / BULLET_SPEED;
  return clampAim(Math.atan2(best.y + (best.vy || 0) * lead - y, best.x + best.vx * lead - x));
}

function deployTower() {
  const near = towerInReach();
  if (near && G.profile.up.autoTarget) {
    sfx.deny();
    floater(near.x, TOWER_Y - 26, 'Auto-aiming', '#b9f1ff');
  } else if (near) {
    near.angle = G.aim;
    near.flash = 0.2;
    sfx.deploy();
    floater(near.x, TOWER_Y - 26, 'Re-aimed', '#b9f1ff');
  } else if (G.towersLeft > 0 && obstacleAt(G.player.x, 14)) {
    sfx.deny();
    floater(G.player.x, TOWER_Y - 26, 'No room here', '#ff6b5e');
  } else if (G.towersLeft > 0) {
    G.towersLeft--;
    const { hp, shield } = towerStats(G.profile.up);
    G.towers.push({
      x: G.player.x, angle: G.aim, cd: 0.3, rocketCd: 1.5, hp, maxHp: hp, shield, maxShield: shield,
      recharge: 0, repairT: 0, flash: 0.2, dead: false,
    });
    sfx.deploy();
  } else {
    sfx.deny();
  }
}

// ---------- stage flow ----------

function collect(rock) {
  rock.dead = true;
  G.haul[rock.ore]++;
  const o = ORES[rock.ore];
  sfx.pickup(o.value);
  floater(rock.x, rock.y - 10, '+$' + o.value, o.color);
}

function finishStage() {
  const p = G.profile;
  for (const r of G.rocks) G.haul[r.ore]++;          // anything still lying around is swept up
  G.rocks = [];
  for (const k of ORE_KEYS) p.cargo[k] += G.haul[k];
  p.up.towers = G.towersLeft + G.towers.length;       // destroyed towers are gone for good
  const summary = { stage: p.stage, haul: G.haul, destroyed: G.stats.destroyed, landed: G.stats.landed, ufos: G.stats.ufos, hp: G.player.hp };
  p.stage++;
  p.best = Math.max(p.best, p.stage);
  G.hasSave = true;
  save();
  G.mode = 'shop';
  G.on.clear(summary);
}

// ---------- update ----------

export function update(dt) {
  const p = G.player, up = G.profile.up, W = G.worldW, cfg = G.cfg;
  const clearing = G.mode === 'clearing';
  G.time += dt;
  G.shake = Math.max(0, G.shake - dt * 40);

  // player
  const speed = 170 + 26 * up.boots;
  p.vx += (input.move * speed - p.vx) * Math.min(1, dt * 14);
  const fromX = p.x;
  p.x = clamp(p.x + p.vx * dt, 10, W - 10);

  if (input.jump) {
    input.jump = false;
    if (p.jy === 0 && !clearing) { p.vjump = JUMP_SPEED; sfx.jump(); }
  }
  if (p.vjump !== 0 || p.jy > 0) {
    p.jy += p.vjump * dt;
    p.vjump -= JUMP_GRAVITY * dt;
    if (p.jy <= 0) { p.jy = 0; p.vjump = 0; }
  }
  // boulders block the way unless the miner is above them
  for (const o of G.obstacles) {
    const half = o.w / 2 + 8;
    if (p.jy < o.h && Math.abs(p.x - o.x) < half) {
      p.x = o.x + (fromX < o.x ? -half : half);
      p.vx = 0;
    }
  }
  const gunY = GUN_Y - p.jy;
  if (Math.abs(p.vx) > 8) {
    p.walk += Math.abs(p.vx) * dt * 0.09;
    p.face = Math.sign(p.vx);
    G.moved = true;
  }
  p.inv = Math.max(0, p.inv - dt);
  updateCamera();

  if (up.gunAuto && !input.aimHeld) {
    const want = targetAngle(p.x, gunY);
    if (want !== null) G.aim += clamp(want - G.aim, -GUN_TURN * dt, GUN_TURN * dt);
  } else if (input.aimPoint) {
    G.aim = clampAim(Math.atan2(input.aimPoint.y - gunY, input.aimPoint.x + G.view.camX - p.x));
  }
  if (input.deploy) {
    input.deploy = false;
    if (!clearing) deployTower();
  }

  // meteor spawning ramps up over the stage
  if (!clearing && G.time < cfg.duration) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      spawnMeteor();
      const ramp = 1.3 - 0.5 * (G.time / cfg.duration);
      G.spawnT = cfg.interval * ramp * rand(0.6, 1.4);
    }
  }

  // UFOs arrive part-way through the shower, hover over the player and shoot back
  if (!clearing && G.ufosToSpawn > 0 && G.time >= G.nextUfoT) {
    G.ufosToSpawn--;
    G.nextUfoT = G.time + 12;
    spawnUfo();
  }
  for (const u of G.ufos) {
    u.flash = Math.max(0, u.flash - dt);
    if (G.time > cfg.duration + UFO_LINGER) u.leaving = true;
    if (u.leaving) {
      u.y -= 170 * dt;
      if (u.y < -60) u.dead = true;
      continue;
    }
    u.y += (u.homeY + Math.sin(G.time * 2 + u.phase) * 6 - u.y) * Math.min(1, dt * 1.5);
    const want = clamp(p.x + Math.sin(G.time * 0.6 + u.phase) * 150, 30, W - 30);
    u.vx += (clamp((want - u.x) * 1.5, -u.speed, u.speed) - u.vx) * Math.min(1, dt * 3);
    u.x += u.vx * dt;
    u.cd -= dt;
    if (u.cd <= 0 && u.x > 0 && u.x < W && !clearing) {
      u.cd = rand(1.5, 2.4);
      const t = G.towers.length && Math.random() < 0.35 ? G.towers[Math.floor(Math.random() * G.towers.length)] : null;
      const a = Math.atan2((t ? TOWER_Y : GROUND_Y - 18) - (u.y + 10), (t ? t.x : p.x) - u.x);
      G.shots.push({ x: u.x, y: u.y + 10, vx: Math.cos(a) * UFO_SHOT_SPEED, vy: Math.sin(a) * UFO_SHOT_SPEED, dead: false });
      sfx.ufoShot();
    }
  }
  for (const s of G.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.y >= GROUND_Y) {
      s.dead = true;
      burst(s.x, GROUND_Y, 6, 120, ['#ff7ad9', '#ffe9a8'], 3, 400, true);
    } else if (p.inv <= 0 && !clearing && Math.abs(s.x - p.x) < 10 && s.y > GROUND_Y - PLAYER_H - p.jy && s.y < GROUND_Y - p.jy) {
      s.dead = true;
      hurtPlayer();
    } else {
      const t = G.towers.find(t => !t.dead && Math.abs(s.x - t.x) < 12 && s.y > TOWER_Y - 10);
      if (t) { s.dead = true; damageTower(t); }
    }
  }

  // guns only fire while there is something to shoot at
  const hostile = G.meteors.length > 0 || G.ufos.length > 0;
  if (hostile) {
    if (up.gun) {
      G.gunT -= dt;
      if (G.gunT <= 0) {
        const g = gunStats(up);
        G.gunT = g.interval;
        fire(p.x + Math.cos(G.aim) * 16, gunY + Math.sin(G.aim) * 16, G.aim, g.dmg, '#ffe9a8');
        sfx.shoot();
      }
      if (up.gunRockets) {
        G.gunRocketT -= dt;
        if (G.gunRocketT <= 0) {
          G.gunRocketT = GUN_ROCKET_INTERVAL;
          fireRocket(p.x + Math.cos(G.aim) * 16, gunY + Math.sin(G.aim) * 16, G.aim, gunRocketStats(up), !!up.homing);
          sfx.rocket();
        }
      }
    }
  }
  const ts = towerStats(up);
  for (const t of G.towers) {
    let armed = hostile;
    if (up.autoTarget) {
      const want = targetAngle(t.x, TOWER_Y);
      if (want === null) armed = false;
      else {
        t.angle += clamp(want - t.angle, -TOWER_TURN * dt, TOWER_TURN * dt);
        armed = Math.abs(want - t.angle) < 0.15;      // hold fire until the barrel is on target
      }
    }
    t.cd = Math.max(0, t.cd - dt);
    t.rocketCd = Math.max(0, t.rocketCd - dt);
    if (armed && t.cd <= 0) {
      t.cd = ts.interval;
      fire(t.x + Math.cos(t.angle) * 20, TOWER_Y + Math.sin(t.angle) * 20, t.angle, ts.dmg, '#8fe9ff');
      sfx.tower();
    }
    if (armed && up.rockets && t.rocketCd <= 0) {
      t.rocketCd = ROCKET_INTERVAL;
      fireRocket(t.x + Math.cos(t.angle) * 20, TOWER_Y + Math.sin(t.angle) * 20, t.angle, rocketStats(up), !!up.homing);
      sfx.rocket();
    }

    t.flash = Math.max(0, t.flash - dt);
    if (up.towerRepair && t.hp < t.maxHp) {
      t.repairT += dt;
      if (t.repairT >= REPAIR_SECONDS[up.towerRepair - 1]) {
        t.repairT = 0;
        t.hp++;
        floater(t.x, TOWER_Y - 30, '+1 repair', '#6fe39a');
      }
    }
    if (t.shield < t.maxShield) {
      t.recharge -= dt;
      if (t.recharge <= 0) {
        t.shield = t.maxShield;
        floater(t.x, TOWER_Y - 30, 'Shield up', '#8fe9ff');
      }
    }
  }

  // bullets
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -40 || b.x < -40 || b.x > W + 40 || b.y > GROUND_Y) { b.dead = true; continue; }
    if (b.blast) {
      if (b.homing) steerRocket(b, dt);
      b.trail -= dt;
      if (b.trail <= 0) {
        b.trail = 0.03;
        particle(b.x, b.y, rand(-20, 20), rand(-20, 20), 0.35, Math.random() < 0.5 ? '#9aa3ad' : '#ffb347', 4);
      }
    }
    let hit = null, isUfo = false;
    for (const m of G.meteors) {
      if (m.dead) continue;
      const dx = m.x - b.x, dy = m.y - b.y, rr = m.r + 3;
      if (dx * dx + dy * dy < rr * rr) { hit = m; break; }
    }
    if (!hit) {
      for (const u of G.ufos) {
        if (u.dead) continue;
        const dx = (u.x - b.x) / 1.5, dy = u.y - b.y;          // saucers are wider than tall
        if (dx * dx + dy * dy < UFO_R * UFO_R) { hit = u; isUfo = true; break; }
      }
    }
    if (hit) {
      b.dead = true;
      if (b.blast) explode(b);
      else if (isUfo) damageUfo(hit, b.dmg, b.x, b.y);
      else damageMeteor(hit, b.dmg, b.x, b.y);
    }
  }

  // meteors (children spawned by shatter() are appended and picked up next frame)
  const count = G.meteors.length;
  for (let i = 0; i < count; i++) {
    const m = G.meteors[i];
    if (m.dead) continue;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.rot += m.spin * dt;
    m.flash = Math.max(0, m.flash - dt);
    if (m.x < m.r) { m.x = m.r; m.vx = Math.abs(m.vx); }
    if (m.x > W - m.r) { m.x = W - m.r; m.vx = -Math.abs(m.vx); }

    m.trail -= dt;
    if (m.trail <= 0) {
      m.trail = 0.045;
      particle(m.x + rand(-m.r, m.r) * 0.5, m.y - m.r * 0.6, -m.vx * 0.2 + rand(-15, 15), -m.vy * 0.25,
        rand(0.25, 0.5), Math.random() < 0.5 ? '#ff8a3c' : '#ffd166', m.r * rand(0.25, 0.5));
    }

    if (m.y + m.r * 0.8 >= GROUND_Y) { impact(m); continue; }

    // direct hit on the player (circle vs. the player's box)
    if (p.inv <= 0 && !clearing) {
      const cx = clamp(m.x, p.x - 8, p.x + 8), cy = clamp(m.y, GROUND_Y - PLAYER_H - p.jy, GROUND_Y - p.jy);
      const dx = m.x - cx, dy = m.y - cy;
      if (dx * dx + dy * dy < m.r * m.r * 0.85) impact(m);
    }
  }

  // rocks
  const reach = clearing ? Infinity : magnetRadius(up);
  const pull = clearing ? 900 : 420;
  for (const r of G.rocks) {
    if (r.dead) continue;
    const dx = p.x - r.x, dy = GROUND_Y - 18 - p.jy - r.y;
    const d = Math.hypot(dx, dy);
    if (d < 18) { collect(r); continue; }
    if (d < reach) {
      r.x += dx / d * pull * dt;
      r.y += dy / d * pull * dt;
      r.resting = false;
      r.vx = 0; r.vy = 0;
      continue;
    }
    if (!r.resting) {
      r.vy += GRAVITY * dt;
      r.x = clamp(r.x + r.vx * dt, 6, W - 6);
      r.y += r.vy * dt;
      r.spin += r.vx * dt * 0.05;
      if (r.y >= GROUND_Y - 5) {
        r.y = GROUND_Y - 5;
        const o = obstacleAt(r.x, 4);             // never leave loot buried inside a boulder
        if (o) r.x = o.x + (r.x < o.x ? -1 : 1) * (o.w / 2 + 6);
        if (Math.abs(r.vy) > 90) { r.vy *= -0.35; r.vx *= 0.6; }
        else { r.vy = 0; r.vx = 0; r.resting = true; }
      }
    }
    r.life -= dt;
    if (r.life <= 0) r.dead = true;
  }

  // particles and floating text
  for (const q of G.parts) {
    q.life -= dt;
    if (q.ring) continue;
    q.vy += q.grav * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
  for (const f of G.floaters) { f.life -= dt; f.y -= 34 * dt; }
  if (G.banner && (G.banner.life -= dt) <= 0) G.banner = null;

  G.bullets = G.bullets.filter(b => !b.dead);
  G.meteors = G.meteors.filter(m => !m.dead);
  G.ufos = G.ufos.filter(u => !u.dead);
  G.shots = G.shots.filter(s => !s.dead);
  G.rocks = G.rocks.filter(r => !r.dead);
  G.towers = G.towers.filter(t => !t.dead);
  G.parts = G.parts.filter(q => q.life > 0);
  G.floaters = G.floaters.filter(f => f.life > 0);

  // stage flow: once the shower ends, the leftover rocks fly in and the shop opens
  if (G.mode === 'playing' && G.time >= cfg.duration && G.meteors.length === 0 && G.ufos.length === 0 && G.ufosToSpawn === 0) {
    G.mode = 'clearing';
    G.clearT = 0;
    G.shots = [];
    sfx.clear();
  } else if (G.mode === 'clearing') {
    G.clearT += dt;
    if ((G.rocks.length === 0 && G.clearT > 1.2) || G.clearT > 4) finishStage();
  }
}
