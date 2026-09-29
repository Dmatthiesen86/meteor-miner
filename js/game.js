// The simulation: player, meteors, rocks, bullets, towers and stage flow.
import { GROUND_Y, ORES, ORE_KEYS, stageConfig } from './config.js';
import { G, save, emptyCargo } from './state.js';
import { input } from './input.js';
import { sfx } from './audio.js';

const GRAVITY = 900;
const BULLET_SPEED = 640;
const TOWER_SPACING = 30;
const MAX_PARTS = 350;
const AIM_MARGIN = 0.12;          // keeps guns from firing flat along the ground

export const PLAYER_H = 36;
export const GUN_Y = GROUND_Y - 24;
export const TOWER_Y = GROUND_Y - 22;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const blastRadius = r => r * 1.5 + 14;
export const gunStats = up => ({ dmg: 1 + up.damage, interval: 0.3 / (1 + 0.2 * up.rate) });
export const towerStats = up => ({ dmg: 1 + up.towerDamage, interval: 0.55, hp: 3 + up.towerArmor });
export const magnetRadius = up => 34 + 20 * up.magnet;
export const maxHearts = up => 3 + up.armor;

export function startStage() {
  const p = G.profile, cfg = stageConfig(p.stage);
  G.cfg = cfg;
  G.worldW = cfg.worldW;
  G.player = { x: cfg.worldW / 2, vx: 0, hp: maxHearts(p.up), maxHp: maxHearts(p.up), inv: 0, walk: 0, face: 1 };
  G.meteors = []; G.rocks = []; G.bullets = []; G.towers = []; G.parts = []; G.floaters = [];
  G.towersLeft = p.up.towers;
  G.haul = emptyCargo();
  G.stats = { destroyed: 0, landed: 0 };
  G.time = 0;
  G.spawnT = 1.2;
  G.gunT = 0;
  G.shake = 0;
  G.aim = -Math.PI / 2;
  input.deploy = false;
  G.mode = 'playing';
  updateCamera();
}

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
    if (Math.abs(t.x - m.x) < blast * 0.8) {
      t.hp--;
      t.flash = 0.25;
      if (t.hp <= 0) {
        t.dead = true;
        burst(t.x, TOWER_Y, 16, 200, ['#6fe3ff', '#9aa3ad', '#ffb347'], 4, 600);
        floater(t.x, TOWER_Y - 24, 'Tower lost', '#ff6b5e');
      }
    }
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

function fire(x, y, angle, dmg, color) {
  G.bullets.push({ x, y, vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED, dmg, color, dead: false });
}

function deployTower() {
  const near = towerInReach();
  if (near) {
    near.angle = G.aim;
    near.flash = 0.2;
    sfx.deploy();
    floater(near.x, TOWER_Y - 26, 'Re-aimed', '#b9f1ff');
  } else if (G.towersLeft > 0) {
    G.towersLeft--;
    const hp = towerStats(G.profile.up).hp;
    G.towers.push({ x: G.player.x, angle: G.aim, cd: 0.3, hp, maxHp: hp, flash: 0.2, dead: false });
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
  const summary = { stage: p.stage, haul: G.haul, destroyed: G.stats.destroyed, landed: G.stats.landed, hp: G.player.hp };
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
  p.x = clamp(p.x + p.vx * dt, 10, W - 10);
  if (Math.abs(p.vx) > 8) {
    p.walk += Math.abs(p.vx) * dt * 0.09;
    p.face = Math.sign(p.vx);
    G.moved = true;
  }
  p.inv = Math.max(0, p.inv - dt);
  updateCamera();

  if (input.aimPoint) {
    G.aim = clampAim(Math.atan2(input.aimPoint.y - GUN_Y, input.aimPoint.x + G.view.camX - p.x));
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

  // guns only fire while there is something to shoot at
  if (G.meteors.length) {
    if (up.gun) {
      G.gunT -= dt;
      if (G.gunT <= 0) {
        const g = gunStats(up);
        G.gunT = g.interval;
        fire(p.x + Math.cos(G.aim) * 16, GUN_Y + Math.sin(G.aim) * 16, G.aim, g.dmg, '#ffe9a8');
        sfx.shoot();
      }
    }
    const ts = towerStats(up);
    for (const t of G.towers) {
      t.cd -= dt;
      if (t.cd <= 0) {
        t.cd = ts.interval;
        fire(t.x + Math.cos(t.angle) * 20, TOWER_Y + Math.sin(t.angle) * 20, t.angle, ts.dmg, '#8fe9ff');
        sfx.tower();
      }
    }
  }
  for (const t of G.towers) t.flash = Math.max(0, t.flash - dt);

  // bullets
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -40 || b.x < -40 || b.x > W + 40 || b.y > GROUND_Y) { b.dead = true; continue; }
    for (const m of G.meteors) {
      if (m.dead) continue;
      const dx = m.x - b.x, dy = m.y - b.y, rr = m.r + 3;
      if (dx * dx + dy * dy < rr * rr) {
        b.dead = true;
        damageMeteor(m, b.dmg, b.x, b.y);
        break;
      }
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
      const cx = clamp(m.x, p.x - 8, p.x + 8), cy = clamp(m.y, GROUND_Y - PLAYER_H, GROUND_Y);
      const dx = m.x - cx, dy = m.y - cy;
      if (dx * dx + dy * dy < m.r * m.r * 0.85) impact(m);
    }
  }

  // rocks
  const reach = clearing ? Infinity : magnetRadius(up);
  const pull = clearing ? 900 : 420;
  for (const r of G.rocks) {
    if (r.dead) continue;
    const dx = p.x - r.x, dy = GROUND_Y - 18 - r.y;
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

  G.bullets = G.bullets.filter(b => !b.dead);
  G.meteors = G.meteors.filter(m => !m.dead);
  G.rocks = G.rocks.filter(r => !r.dead);
  G.towers = G.towers.filter(t => !t.dead);
  G.parts = G.parts.filter(q => q.life > 0);
  G.floaters = G.floaters.filter(f => f.life > 0);

  // stage flow: once the shower ends, the leftover rocks fly in and the shop opens
  if (G.mode === 'playing' && G.time >= cfg.duration && G.meteors.length === 0) {
    G.mode = 'clearing';
    G.clearT = 0;
    sfx.clear();
  } else if (G.mode === 'clearing') {
    G.clearT += dt;
    if ((G.rocks.length === 0 && G.clearT > 1.2) || G.clearT > 4) finishStage();
  }
}
