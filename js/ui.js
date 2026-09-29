// DOM side of the game: HUD, tower button, and the menu / shop / pause / game-over panels.
import { ORES, ORE_KEYS, SHOP, stageConfig } from './config.js';
import { G, save, newProfile, cargoValue, cargoCount } from './state.js';
import { input } from './input.js';
import { startStage, towerInReach } from './game.js';
import { sfx, setMuted, unlock } from './audio.js';

const $ = id => document.getElementById(id);
const overlay = $('overlay'), hud = $('hud'), towerBtn = $('towerBtn');
const money = n => '$' + n.toLocaleString();

// Only touch the DOM when a value actually changes.
const shown = {};
function setText(id, text) {
  if (shown[id] !== text) { shown[id] = text; $(id).innerHTML = text; }
}

function panel(html) {
  overlay.innerHTML = `<div class="panel">${html}</div>`;
  overlay.hidden = false;
  hud.hidden = true;
  towerBtn.hidden = true;
}

function on(id, fn) {
  $(id).addEventListener('click', () => { unlock(); fn(); });
}

function play() {
  overlay.hidden = true;
  hud.hidden = false;
  startStage();
}

// ---------- panels ----------

export function showMenu() {
  G.mode = 'menu';
  const p = G.profile;
  panel(`
    <h1>Meteor Miner</h1>
    <p class="tag">Dodge the meteors. Grab the rocks. Sell. Gear up.</p>
    <div class="how">
      <b>Run</b> - drag along the bottom strip, or A / D / arrow keys.<br>
      <b>Aim</b> - touch the sky or move the mouse. Your blaster fires on its own.<br>
      <b>Towers</b> - aim, then tap the tower button (or T) to plant one. Stand on it and tap again to re-aim.<br>
      <b>UFOs</b> show up every 5th stage and shoot back. Shoot them down for crystals.<br>
      <b>Red marks</b> on the ground show where a meteor will land and how wide the blast is.
    </div>
    ${G.hasSave ? `<button class="btn primary" id="continueBtn">Continue - Stage ${p.stage}</button>` : ''}
    <button class="btn ${G.hasSave ? '' : 'primary'}" id="newBtn">New game</button>
    ${p.best > 1 ? `<p class="tag" style="margin-top:12px">Best stage reached: ${p.best}</p>` : ''}
  `);
  if (G.hasSave) on('continueBtn', showShop);
  on('newBtn', () => {
    if (G.hasSave && !confirm('Start over? This erases your saved progress.')) return;
    const fresh = newProfile();
    fresh.muted = p.muted;
    fresh.best = p.best;
    G.profile = fresh;
    G.hasSave = false;
    play();
  });
}

function cargoHtml(cargo) {
  return ORE_KEYS.filter(k => cargo[k] > 0).map(k => `
    <div class="cargo-line">
      <span class="dot" style="background:${ORES[k].color}"></span>
      <span>${cargo[k]} &times; ${ORES[k].name}</span>
      <span class="v">${money(cargo[k] * ORES[k].value)}</span>
    </div>`).join('');
}

export function showShop(summary) {
  G.mode = 'shop';
  const p = G.profile, up = p.up;
  const value = cargoValue(p.cargo);
  const next = stageConfig(p.stage);

  const items = SHOP.map(it => {
    if (it.group) return `<div class="shop-group">${it.group}</div>`;
    const lvl = up[it.id];
    const tooEarly = it.minStage && p.stage < it.minStage;
    const needs = [].concat(it.needs || []);
    const locked = tooEarly || (needs.length > 0 && !needs.some(id => up[id]));
    const maxed = lvl >= it.max;
    const cost = it.cost(lvl);
    const label = maxed ? 'MAX' : locked ? 'Locked' : money(cost);
    const desc = tooEarly ? `Unlocks at stage ${it.minStage}.`
      : locked ? `Requires ${needs.map(id => SHOP.find(s => s.id === id).name.toLowerCase()).join(' or ')}.`
      : typeof it.desc === 'function' ? it.desc(lvl) : it.desc;
    const level = it.max === 1 ? (lvl ? 'Owned' : '') : it.id === 'towers' ? `Owned ${lvl}/${it.max}` : lvl ? `Lv ${lvl}` : '';
    return `
      <div class="shop-item">
        <div class="info">
          <div><span class="name">${it.name}</span><span class="lvl">${level}</span></div>
          <div class="desc">${desc}</div>
        </div>
        <button data-buy="${it.id}" ${maxed || locked || p.money < cost ? 'disabled' : ''}>${label}</button>
      </div>`;
  }).join('');

  panel(`
    <h2>${summary ? `Stage ${summary.stage} clear!` : 'Trading post'}</h2>
    ${summary ? `
      <div class="stats">
        <span>Rocks collected</span><span>${cargoCount(summary.haul)}</span>
        <span>Meteors shot down</span><span>${summary.destroyed}</span>
        <span>Meteors landed</span><span>${summary.landed}</span>
        ${summary.ufos ? `<span>UFOs shot down</span><span>${summary.ufos}</span>` : ''}
      </div>` : ''}
    <div class="wallet"><span>Cash</span><span class="cash">${money(p.money)}</span></div>
    <div class="cargo-box">
      ${value > 0
        ? `${cargoHtml(p.cargo)}<button class="btn good" id="sellBtn">Sell rocks for ${money(value)}</button>`
        : '<p style="margin:0">No rocks to sell.</p>'}
    </div>
    ${items}
    <button class="btn primary" id="goBtn">Start stage ${p.stage}</button>
    <p class="tag" style="margin:8px 0 0;font-size:12.5px">Map width ${next.worldW} · shower lasts ${next.duration}s</p>
    ${next.ufos ? `<p class="tag ufo-warn">UFO sighted! ${next.ufos > 1 ? next.ufos + ' saucers' : 'A saucer'} will shoot back this stage.</p>` : ''}
  `);

  if (value > 0) on('sellBtn', () => {
    p.money += value;
    for (const k of ORE_KEYS) p.cargo[k] = 0;
    save();
    sfx.sell();
    showShop(summary);
  });
  overlay.querySelectorAll('[data-buy]').forEach(btn => btn.addEventListener('click', () => {
    unlock();
    const it = SHOP.find(s => s.id === btn.dataset.buy);
    const cost = it.cost(up[it.id]);
    if (p.money < cost || up[it.id] >= it.max || (it.minStage && p.stage < it.minStage)) { sfx.deny(); return; }
    p.money -= cost;
    up[it.id]++;
    save();
    sfx.buy();
    const scroll = overlay.firstElementChild.scrollTop;
    showShop(summary);
    overlay.firstElementChild.scrollTop = scroll;
  }));
  on('goBtn', play);
}

export function togglePause() {
  if (G.mode === 'playing') {
    G.mode = 'paused';
    panel(`
      <h2>Paused</h2>
      <button class="btn primary" id="resumeBtn">Resume</button>
      <button class="btn" id="quitBtn">Quit to menu</button>
      <p class="tag" style="margin-top:10px;font-size:12.5px">Quitting loses the rocks from this stage.</p>
    `);
    on('resumeBtn', togglePause);
    on('quitBtn', showMenu);
  } else if (G.mode === 'paused') {
    overlay.hidden = true;
    hud.hidden = false;
    G.mode = 'playing';
  }
}

function showGameOver() {
  const lost = cargoValue(G.haul);
  // Give the death a moment to land before covering the screen.
  setTimeout(() => {
    if (G.mode !== 'dead') return;
    panel(`
      <h2>Flattened on stage ${G.profile.stage}</h2>
      <p class="tag">${lost > 0 ? `You dropped ${money(lost)} worth of rocks.` : 'Nothing lost but pride.'}
        Your cash, gear and towers are safe.</p>
      <button class="btn primary" id="retryBtn">Retry stage ${G.profile.stage}</button>
      <button class="btn" id="shopBtn">Trading post</button>
      <button class="btn" id="menuBtn">Menu</button>
    `);
    on('retryBtn', play);
    on('shopBtn', () => showShop());
    on('menuBtn', showMenu);
  }, 900);
}

export function toggleMute() {
  G.profile.muted = !G.profile.muted;
  setMuted(G.profile.muted);
  if (G.hasSave) save();
}

// ---------- HUD ----------

export function updateHUD() {
  if (hud.hidden || !G.player) return;
  const p = G.player, prof = G.profile;
  setText('hearts', '♥'.repeat(Math.max(0, p.hp)) + `<span class="lost">${'♥'.repeat(Math.max(0, p.maxHp - p.hp))}</span>`
    + (p.shield > 0 ? `<span class="shield">${'◆'.repeat(p.shield)}</span>` : ''));
  setText('stage', 'Stage ' + prof.stage);
  setText('money', money(prof.money));
  setText('cargo', `${cargoCount(G.haul)} rocks · ${money(cargoValue(G.haul))}`);
  setText('muteBtn', '♪');
  $('muteBtn').classList.toggle('off', prof.muted);
  $('progress').style.width = (Math.min(1, G.time / G.cfg.duration) * 100).toFixed(1) + '%';

  const hasTowers = prof.up.towers > 0;
  towerBtn.hidden = !hasTowers;
  if (hasTowers) {
    const reaim = !prof.up.autoTarget && !!towerInReach();
    setText('towerBtn', reaim ? 'Re-aim tower' : `Place tower · ${G.towersLeft}`);
    towerBtn.classList.toggle('empty', !reaim && G.towersLeft === 0);
  }
}

export function initUI() {
  G.on.clear = showShop;
  G.on.dead = showGameOver;
  setMuted(G.profile.muted);
  on('pauseBtn', togglePause);
  on('muteBtn', toggleMute);
  towerBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    unlock();
    input.deploy = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') togglePause();
  });
  showMenu();
}
