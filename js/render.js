// Everything is drawn with canvas primitives, in logical units (view is H tall).
import { H, GROUND_Y, ORES, METEOR_STYLE, PLANETS } from './config.js';
import { G } from './state.js';
import { input } from './input.js';
import { blastRadius, magnetRadius, GUN_Y, TOWER_Y, PLAYER_H } from './game.js';

const TAU = Math.PI * 2;

// Fixed star field in 0..1 space so it looks the same on every screen.
const stars = Array.from({ length: 90 }, (_, i) => {
  const f = n => { const s = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return s - Math.floor(s); };
  return { x: f(1), y: f(2), s: 0.5 + f(3) * 1.3, tw: f(4) * TAU };
});

function ridge(ctx, camX, vw, parallax, base, amp, color) {
  const off = camX * parallax;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let sx = 0; sx <= vw + 16; sx += 16) {
    const x = sx + off;
    const y = base - amp * (0.55 * Math.sin(x * 0.011) + 0.3 * Math.sin(x * 0.027 + 1.7) + 0.15 * Math.sin(x * 0.061 + 4.2));
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(vw + 16, GROUND_Y);
  ctx.fill();
}

function drawBackground(ctx, vw, camX, t, planet) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, planet.sky[0]);
  sky.addColorStop(0.6, planet.sky[1]);
  sky.addColorStop(1, planet.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, GROUND_Y);

  // a neighbouring world hanging in the sky, different on every planet
  const dx = ((vw * 0.74 - camX * 0.04) % (vw + 120) + vw + 120) % (vw + 120) - 60;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = planet.disc;
  ctx.beginPath();
  ctx.arc(dx, 170, 30, 0, TAU);
  ctx.fill();
  ctx.fillStyle = planet.sky[1];
  ctx.beginPath();
  ctx.arc(dx + 12, 163, 27, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  for (const s of stars) {
    const x = ((s.x * 1400 - camX * 0.08) % vw + vw) % vw;
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.5 + s.tw);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, s.y * (GROUND_Y - 120), s.s, s.s);
  }
  ctx.globalAlpha = 1;

  ridge(ctx, camX, vw, 0.25, GROUND_Y - 70, 50, planet.ridge[0]);
  ridge(ctx, camX + 300, vw, 0.5, GROUND_Y - 30, 34, planet.ridge[1]);
}

function drawGround(ctx, W, planet) {
  const [dirt, rim, band, pebble] = planet.ground;
  ctx.fillStyle = dirt;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = rim;
  ctx.fillRect(0, GROUND_Y, W, 3);
  ctx.fillStyle = band;
  ctx.fillRect(0, GROUND_Y + 3, W, 7);
  // pebbles, so scrolling is visible
  ctx.fillStyle = pebble;
  for (let x = 14; x < W; x += 46) {
    const y = GROUND_Y + 22 + ((x * 37) % 80);
    ctx.fillRect(x + ((x * 13) % 17), y, 6, 3);
  }
  // walls at the edge of the map
  ctx.fillStyle = '#05060e';
  ctx.fillRect(-2000, 0, 2000, H);
  ctx.fillRect(W, 0, 2000, H);
  ctx.fillStyle = rim;
  ctx.fillRect(-3, 0, 3, GROUND_Y);
  ctx.fillRect(W, 0, 3, GROUND_Y);
}

function drawLandingMarkers(ctx) {
  for (const m of G.meteors) {
    const t = (GROUND_Y - m.y) / m.vy;
    if (t > 3.2 && m.kind !== 'titan') continue;       // the titan's mark shows all the way down
    const x = m.x + m.vx * t;
    const near = Math.max(0, 1 - Math.max(0, t) / 3.2);
    ctx.fillStyle = `rgba(${G.cfg.harmless ? '111, 227, 154' : '255, 90, 60'}, ${0.12 + 0.45 * near})`;
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 2, blastRadius(m.r), 5, 0, 0, TAU);
    ctx.fill();
  }
}

function drawMeteor(ctx, m) {
  ctx.save();
  ctx.translate(m.x, m.y);
  // heat glow on the leading edge
  const glow = ctx.createRadialGradient(0, m.r * 0.3, m.r * 0.4, 0, 0, m.r * 1.7);
  const style = METEOR_STYLE[m.kind];
  glow.addColorStop(0, `rgba(${style.glow}, .55)`);
  glow.addColorStop(1, `rgba(${style.glow}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, m.r * 1.7, 0, TAU);
  ctx.fill();

  ctx.rotate(m.rot);
  ctx.beginPath();
  const n = m.shape.length;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, d = m.r * m.shape[i];
    i ? ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d) : ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = m.flash > 0 ? '#fff' : style.body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, m.r * (m.kind === 'iron' ? 0.16 : 0.08));
  ctx.strokeStyle = m.kind === 'iron' ? '#c9d2f2' : '#2c1c15';
  ctx.stroke();

  if (m.flash <= 0) {
    ctx.fillStyle = ORES[m.ore].color;
    for (const f of m.flecks) {
      ctx.beginPath();
      ctx.arc(Math.cos(f.a) * f.d * m.r, Math.sin(f.a) * f.d * m.r, Math.max(1.5, f.s * m.r), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  if (m.hp < m.maxHp && m !== G.boss) {
    const w = Math.max(18, m.r * 1.6), x = m.x - w / 2, y = m.y - m.r - 9;
    ctx.fillStyle = 'rgba(0, 0, 0, .6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#ff6b5e';
    ctx.fillRect(x, y, w * Math.max(0, m.hp / m.maxHp), 3);
  }
}

function drawUfo(ctx, u, time) {
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.rotate(Math.max(-0.25, Math.min(0.25, u.vx * 0.002)));
  if (u.boss) ctx.scale(2.4, 2.4);
  const lit = u.flash > 0;
  ctx.fillStyle = lit ? '#fff' : 'rgba(143, 233, 255, .75)';          // dome
  ctx.beginPath();
  ctx.ellipse(0, -5, 13, 12, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = lit ? '#fff' : '#8a93b8';                            // hull
  ctx.strokeStyle = '#23263f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = lit ? '#fff' : '#5d6486';
  ctx.beginPath();
  ctx.ellipse(0, 5, 14, 5, 0, 0, Math.PI);
  ctx.fill();
  for (let i = -2; i <= 2; i++) {                                      // running lights
    ctx.fillStyle = Math.floor(time * 6 + i + 100) % 2 ? '#ff7ad9' : '#ffe9a8';
    ctx.beginPath();
    ctx.arc(i * 11, 1, 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (u.hp < u.maxHp && !u.boss) {
    ctx.fillStyle = 'rgba(0, 0, 0, .6)';
    ctx.fillRect(u.x - 25, u.y - 26, 50, 5);
    ctx.fillStyle = '#ff7ad9';
    ctx.fillRect(u.x - 24, u.y - 25, 48 * Math.max(0, u.hp / u.maxHp), 3);
  }
}

// Ice and fire left behind by special meteors.
function drawPatches(ctx, time) {
  for (const q of G.patches) {
    const fade = Math.min(1, q.life / 1.2);
    if (q.kind === 'ice') {
      ctx.fillStyle = `rgba(170, 230, 255, ${0.75 * fade})`;
      ctx.fillRect(q.x - q.r, GROUND_Y - 1, q.r * 2, 6);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * fade})`;
      for (let x = q.x - q.r + 8; x < q.x + q.r - 6; x += 22) ctx.fillRect(x, GROUND_Y, 9, 1.5);
    } else {
      ctx.fillStyle = `rgba(255, 80, 30, ${0.55 * fade})`;
      ctx.fillRect(q.x - q.r, GROUND_Y - 1, q.r * 2, 6);
      for (let x = q.x - q.r + 5; x < q.x + q.r; x += 11) {
        const h = 10 + 9 * Math.abs(Math.sin(time * 9 + x));
        ctx.fillStyle = `rgba(255, ${140 + Math.floor(80 * Math.abs(Math.sin(time * 7 + x * 2)))}, 50, ${0.85 * fade})`;
        ctx.beginPath();
        ctx.moveTo(x - 5, GROUND_Y);
        ctx.lineTo(x, GROUND_Y - h);
        ctx.lineTo(x + 5, GROUND_Y);
        ctx.fill();
      }
    }
  }
}

function drawObstacle(ctx, o) {
  ctx.save();
  ctx.translate(o.x, GROUND_Y);
  const n = o.shape.length;
  ctx.beginPath();
  ctx.moveTo(-o.w / 2 - 3, 0);
  for (let i = 0; i < n; i++) {
    const a = Math.PI - (i + 0.5) / n * Math.PI;
    ctx.lineTo(Math.cos(a) * o.w / 2 * o.shape[i], -Math.sin(a) * o.h * o.shape[i]);
  }
  ctx.lineTo(o.w / 2 + 3, 0);
  ctx.closePath();
  ctx.fillStyle = '#54486a';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1d1729';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, .13)';                        // lit top-left face
  ctx.beginPath();
  ctx.ellipse(-o.w * 0.14, -o.h * 0.62, o.w * 0.2, o.h * 0.16, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawRock(ctx, r) {
  if (r.life < 3 && Math.floor(r.life * 8) % 2 === 0) return;   // blink before vanishing
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.spin);
  ctx.fillStyle = ORES[r.ore].color;
  ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5, 1); ctx.lineTo(-2, -4); ctx.lineTo(4, -3); ctx.lineTo(5, 2); ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, .45)';
  ctx.fillRect(-2, -3, 3, 2);
  ctx.restore();
}

function drawTower(ctx, t) {
  ctx.save();
  ctx.translate(t.x, 0);
  ctx.strokeStyle = '#5d6b86';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11, GROUND_Y); ctx.lineTo(0, TOWER_Y);
  ctx.moveTo(11, GROUND_Y); ctx.lineTo(0, TOWER_Y);
  ctx.moveTo(0, GROUND_Y); ctx.lineTo(0, TOWER_Y);
  ctx.stroke();
  // barrel
  ctx.strokeStyle = t.flash > 0 ? '#fff' : '#8fe9ff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, TOWER_Y);
  ctx.lineTo(Math.cos(t.angle) * 20, TOWER_Y + Math.sin(t.angle) * 20);
  ctx.stroke();
  ctx.fillStyle = t.flash > 0 ? '#fff' : '#2f6f86';
  ctx.beginPath();
  ctx.arc(0, TOWER_Y, 7, 0, TAU);
  ctx.fill();
  if (t.shield > 0) {
    ctx.strokeStyle = 'rgba(143, 233, 255, .6)';
    ctx.fillStyle = 'rgba(143, 233, 255, .08)';
    ctx.lineWidth = 1 + 0.5 * t.shield;
    ctx.beginPath();
    ctx.arc(0, GROUND_Y, 27, Math.PI, TAU);
    ctx.fill();
    ctx.stroke();
  }
  // health pips, squeezed to fit under the tower however much armor it has
  const step = Math.min(7, 30 / t.maxHp);
  for (let i = 0; i < t.maxHp; i++) {
    ctx.fillStyle = i < t.hp ? '#6fe39a' : '#3a3f5c';
    ctx.fillRect(-step * t.maxHp / 2 + i * step + 1, GROUND_Y + 5, step - 2, 3);
  }
  ctx.restore();
}

function drawPlayer(ctx, p, up) {
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return;      // hit flicker
  const swing = p.jy > 0 ? 5 : Math.sin(p.walk * TAU) * (Math.abs(p.vx) > 8 ? 6 : 0);
  ctx.save();
  ctx.translate(p.x, GROUND_Y - p.jy);
  ctx.lineCap = 'round';

  ctx.strokeStyle = '#d8dcef';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-3, -13); ctx.lineTo(-3 + swing, -1);
  ctx.moveTo(3, -13); ctx.lineTo(3 - swing, -1);
  ctx.stroke();

  ctx.fillStyle = '#8a93b8';                                       // backpack
  ctx.fillRect(-p.face * 10 - 3, -27, 6, 13);
  ctx.fillStyle = '#ff9d3c';                                       // suit
  ctx.beginPath();
  ctx.roundRect(-7, -29, 14, 17, 4);
  ctx.fill();
  ctx.fillStyle = '#eef1ff';                                       // helmet
  ctx.beginPath();
  ctx.arc(0, -PLAYER_H + 6, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#23304f';                                       // visor
  ctx.beginPath();
  ctx.roundRect(p.face > 0 ? -2 : -6, -PLAYER_H + 3, 8, 6, 2.5);
  ctx.fill();
  ctx.restore();

  if (up.gun) {
    ctx.strokeStyle = '#c9d2f2';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, GUN_Y - p.jy);
    ctx.lineTo(p.x + Math.cos(G.aim) * 16, GUN_Y - p.jy + Math.sin(G.aim) * 16);
    ctx.stroke();
  }
}

function drawAimLine(ctx, p) {
  ctx.strokeStyle = 'rgba(255, 233, 168, .35)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(G.aim) * 20, GUN_Y - p.jy + Math.sin(G.aim) * 20);
  ctx.lineTo(p.x + Math.cos(G.aim) * 110, GUN_Y - p.jy + Math.sin(G.aim) * 110);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawParticles(ctx) {
  for (const q of G.parts) {
    const k = q.life / q.max;
    if (q.ring) {
      ctx.strokeStyle = `rgba(255, 190, 120, ${k * 0.8})`;
      ctx.lineWidth = 3 * k + 1;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, q.r * (1 - k * 0.7), q.r * 0.35 * (1 - k * 0.7), 0, Math.PI, TAU);
      ctx.stroke();
      continue;
    }
    ctx.globalAlpha = k;
    ctx.fillStyle = q.color;
    const s = q.size * (0.4 + 0.6 * k);
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawControls(ctx, vw) {
  const s = input.stick;
  if (s) {
    ctx.strokeStyle = 'rgba(255, 255, 255, .25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x0, s.y, 34, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, .35)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 16, 0, TAU);
    ctx.fill();
  } else if (!G.moved && G.mode === 'playing') {
    ctx.fillStyle = 'rgba(255, 255, 255, .55)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◀  drag anywhere to run  ▶', vw / 2, GROUND_Y + 58);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, .35)';
    ctx.fillText('tap anywhere to jump', vw / 2, GROUND_Y + 80);
    ctx.fillText('keyboard: A / D and Space', vw / 2, GROUND_Y + 100);
  }
}

// Boss name and health across the top of the screen.
function drawBossBar(ctx, vw) {
  const b = G.boss, w = vw - 60, x = 30, y = 84;
  ctx.fillStyle = 'rgba(0, 0, 0, .6)';
  ctx.fillRect(x - 2, y - 2, w + 4, 12);
  ctx.fillStyle = '#ff6b5e';
  ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 8);
  ctx.fillStyle = '#fff';
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(b.name.toUpperCase(), vw / 2, y + 22);
}

// Strip along the top showing the whole map once it is wider than the screen.
function drawMinimap(ctx, vw, camX) {
  const W = G.worldW;
  if (W <= vw + 1) return;
  const x0 = 16, w = vw - 32, y = 62, k = w / W;
  ctx.fillStyle = 'rgba(255, 255, 255, .12)';
  ctx.fillRect(x0, y, w, 5);
  ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + camX * k, y - 2, vw * k, 9);
  for (const r of G.rocks) { ctx.fillStyle = ORES[r.ore].color; ctx.fillRect(x0 + r.x * k - 1, y + 3, 2, 2); }
  ctx.fillStyle = '#9a8fb5';
  for (const o of G.obstacles) ctx.fillRect(x0 + o.x * k - 1.5, y - 1, 3, 7);
  ctx.fillStyle = '#8fe9ff';
  for (const t of G.towers) ctx.fillRect(x0 + t.x * k - 1.5, y, 3, 5);
  ctx.fillStyle = '#ff6b5e';
  for (const m of G.meteors) {
    const s = Math.max(2, m.r * k);
    ctx.fillRect(x0 + m.x * k - s / 2, y - 1, s, 3);
  }
  ctx.fillStyle = '#ff7ad9';
  for (const u of G.ufos) ctx.fillRect(x0 + u.x * k - 3, y - 3, 6, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 + G.player.x * k - 1.5, y - 2, 3, 9);
}

export function render(ctx, time) {
  const v = G.view, vw = v.w;
  ctx.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, 0, 0);
  const inGame = !!G.player && G.mode !== 'menu';
  const camX = inGame ? v.camX : 0;
  const planet = inGame && G.cfg ? G.cfg.planet : PLANETS[0];

  drawBackground(ctx, vw, camX, time, planet);

  ctx.save();
  const sh = G.shake;
  ctx.translate(-camX + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  drawGround(ctx, inGame ? G.worldW : vw, planet);

  if (inGame) {
    const p = G.player, up = G.profile.up;
    drawLandingMarkers(ctx);

    if (up.magnet > 0) {
      ctx.strokeStyle = 'rgba(111, 227, 255, .12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, GROUND_Y - 18, magnetRadius(up), Math.PI, TAU);
      ctx.stroke();
    }

    drawPatches(ctx, time);
    for (const o of G.obstacles) drawObstacle(ctx, o);
    for (const t of G.towers) drawTower(ctx, t);
    for (const r of G.rocks) drawRock(ctx, r);
    if (G.mode !== 'dead' && p.shield > 0) {
      const pulse = 0.5 + 0.2 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(143, 233, 255, ${pulse})`;
      ctx.fillStyle = 'rgba(143, 233, 255, .08)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, GROUND_Y - 19 - p.jy, 17, 25, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    if (G.mode !== 'dead') {
      if (up.gun || G.towersLeft > 0 || G.towers.length) drawAimLine(ctx, p);
      drawPlayer(ctx, p, up);
    }
    for (const m of G.meteors) drawMeteor(ctx, m);
    for (const u of G.ufos) drawUfo(ctx, u, time);
    for (const s of G.shots) {
      ctx.fillStyle = 'rgba(255, 122, 217, .35)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd6f3';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, TAU);
      ctx.fill();
    }

    ctx.lineCap = 'round';
    for (const b of G.bullets) {
      ctx.lineWidth = b.blast ? 6 : 3;
      ctx.strokeStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.stroke();
    }

    drawParticles(ctx);

    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of G.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (inGame && G.slowT > 0) {
    ctx.fillStyle = `rgba(120, 200, 255, ${0.12 * Math.min(1, G.slowT)})`;
    ctx.fillRect(0, 0, vw, GROUND_Y);
  }
  if (inGame && G.flashT > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, G.flashT * 2)})`;
    ctx.fillRect(0, 0, vw, H);
  }
  if (inGame) {
    drawControls(ctx, vw);
    drawMinimap(ctx, vw, camX);
    if (G.boss) drawBossBar(ctx, vw);
    if (G.banner) {
      ctx.globalAlpha = Math.min(1, G.banner.life) * (0.6 + 0.4 * Math.sin(time * 14));
      ctx.fillStyle = G.banner.color;
      ctx.font = `800 ${Math.min(24, Math.floor(vw * 1.75 / G.banner.text.length))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(G.banner.text, vw / 2, G.boss ? 140 : 110);
      ctx.globalAlpha = 1;
    }
    if (G.mode === 'clearing') {
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STAGE CLEAR', vw / 2, 250);
    }
  }
}
