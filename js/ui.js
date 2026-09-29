// DOM side of the game: HUD, tower button, and the menu / shop / pause / game-over panels.
import { ORES, ORE_KEYS, SHOP, PERKS, BOONS, PRESTIGE_STAGE, START_CASH_PER_LEVEL, stageConfig, priceOf, perkCost, shardsFor } from './config.js';
import { G, save, newProfile, cargoValue, saleValue, cargoCount, boon } from './state.js';
import { input } from './input.js';
import { startStage, towerInReach } from './game.js';
import { sfx, setMuted, unlock } from './audio.js';

const $ = id => document.getElementById(id);
const overlay = $('overlay'), hud = $('hud'), towerBtn = $('towerBtn'), jumpBtn = $('jumpBtn');
// Whole dollars below `compactFrom`, then 3 significant figures: $125K, $1.87M.
function money(n, compactFrom = 100000) {
  if (n < compactFrom) return '$' + Math.round(n).toLocaleString();
  const units = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return '$' + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + units[i];
}
// Tighter, for the top bar on a phone.
const short = n => money(n, 10000);

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
  jumpBtn.hidden = true;
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
      <b>Jump</b> - Jump button, or Space / W. Bigger maps have boulders to hop over.<br>
      <b>Aim</b> - touch the sky or move the mouse. Your blaster fires on its own.<br>
      <b>Towers</b> - aim, then tap the tower button (or T) to plant one. Stand on it and tap again to re-aim.<br>
      <b>UFOs</b> shoot back on stages 5, 15, 25... and a <b>boss</b> arrives every 10th stage.<br>
      <b>Red marks</b> on the ground show where a meteor will land and how wide the blast is.
    </div>
    ${G.hasSave ? `<button class="btn primary" id="continueBtn">Continue - Stage ${p.stage}</button>` : ''}
    <button class="btn ${G.hasSave ? '' : 'primary'}" id="newBtn">New game</button>
    ${p.best > 1 ? `<p class="tag" style="margin-top:12px">Best stage reached: ${p.best}${p.expeditions ? ` · Expeditions: ${p.expeditions} · Star shards: ${p.shards}` : ''}</p>` : ''}
  `);
  if (G.hasSave) on('continueBtn', showShop);
  on('newBtn', () => {
    if (G.hasSave && !confirm('Start over from stage 1? Cash and gear are erased. Star shards and perks are kept.')) return;
    G.profile = freshRun(p);
    G.hasSave = false;
    play();
  });
}

// A stage-1 profile that keeps everything permanent from the old one.
function freshRun(old) {
  const fresh = newProfile();
  fresh.muted = old.muted;
  fresh.best = old.best;
  fresh.shards = old.shards;
  fresh.expeditions = old.expeditions;
  fresh.perks = { ...old.perks };
  fresh.money = START_CASH_PER_LEVEL * old.perks.start;
  return fresh;
}

function cargoHtml(cargo) {
  return ORE_KEYS.filter(k => cargo[k] > 0).map(k => `
    <div class="cargo-line">
      <span class="dot" style="background:${ORES[k].color}"></span>
      <span>${cargo[k]} &times; ${ORES[k].name}</span>
      <span class="v">${money(cargo[k] * ORES[k].value)}</span>
    </div>`).join('');
}

// After every 5th stage: pick 1 of 3 bonuses before the trading post opens.
function showBoonPick(summary) {
  G.mode = 'shop';
  const p = G.profile;
  const cards = p.pendingBoon.map(id => {
    const b = BOONS.find(x => x.id === id), have = boon(id);
    return `
      <button class="boon-card" data-boon="${id}">
        <span class="name">${b.name}${have ? `<span class="lvl">Have ${have}</span>` : ''}</span>
        <span class="desc">${b.desc}</span>
      </button>`;
  }).join('');
  panel(`
    <h2>Pick a bonus</h2>
    <p class="tag">Stage ${p.stage - 1} cleared. Choose one. Bonuses stack and last until your next expedition.</p>
    ${cards}
  `);
  overlay.querySelectorAll('[data-boon]').forEach(btn => btn.addEventListener('click', () => {
    unlock();
    p.boons[btn.dataset.boon] = boon(btn.dataset.boon) + 1;
    p.pendingBoon = null;
    save();
    sfx.buy();
    showShop(summary);
  }));
}

export function showShop(summary) {
  if (G.profile.pendingBoon && G.profile.pendingBoon.length) return showBoonPick(summary);
  G.mode = 'shop';
  const p = G.profile, up = p.up;
  const held = BOONS.filter(b => boon(b.id)).map(b => `${b.name}${boon(b.id) > 1 ? ' ×' + boon(b.id) : ''}`);
  const value = saleValue(p.cargo);
  const bonus = value - cargoValue(p.cargo);
  const next = stageConfig(p.stage);
  const shards = shardsFor(p.stage);

  const items = SHOP.map(it => {
    if (it.group) return `<div class="shop-group">${it.group}</div>`;
    const lvl = up[it.id];
    const tooEarly = it.minStage && p.stage < it.minStage;
    const needs = [].concat(it.needs || []);
    const locked = tooEarly || (needs.length > 0 && !needs.some(id => up[id]));
    const maxed = !it.endless && lvl >= it.max;
    const cost = priceOf(it, lvl);
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
        ${summary.boss ? `<span>${summary.boss.name}</span><span>${summary.boss.beaten ? 'Defeated · +1 ★' : 'Got away'}</span>` : ''}
        ${summary.lost ? `<span>Towers destroyed</span><span>${summary.lost}${summary.replaced ? ` (${summary.replaced} replaced by insurance)` : ''}</span>` : ''}
      </div>` : ''}
    <div class="wallet"><span>Cash</span><span class="cash">${money(p.money)}</span></div>
    <div class="cargo-box">
      ${value > 0
        ? `${cargoHtml(p.cargo)}${bonus ? `<div class="cargo-line"><span>Rich veins bonus</span><span class="v">+${money(bonus)}</span></div>` : ''}<button class="btn good" id="sellBtn">Sell rocks for ${money(value)}</button>`
        : '<p style="margin:0">No rocks to sell.</p>'}
    </div>
    ${held.length ? `<p class="tag boons-held"><b>Bonuses:</b> ${held.join(', ')}</p>` : ''}
    ${items}
    <button class="btn primary" id="goBtn">Start stage ${p.stage}</button>
    <p class="tag" style="margin:8px 0 0;font-size:12.5px">${next.planet.name} · Map width ${next.worldW} · shower lasts ${next.duration}s${next.obstacles ? ` · ${next.obstacles} boulder${next.obstacles > 1 ? 's' : ''} to jump` : ''}</p>
    ${next.newPlanet ? `<p class="tag planet-warn">New planet: ${next.planet.name}. ${next.planet.tip}</p>` : ''}
    ${next.boss ? `<p class="tag ufo-warn">Boss stage: ${next.boss.name}. ${next.boss.tip}</p>` : ''}
    ${next.newThreat ? `<p class="tag threat-warn">New threat: ${next.newThreat.name}. ${next.newThreat.tip}</p>` : ''}
    ${next.ufos ? `<p class="tag ufo-warn">UFO sighted! ${next.ufos > 1 ? next.ufos + ' saucers' : 'A saucer'} will shoot back this stage.</p>` : ''}
    ${p.shards > 0 || p.expeditions > 0 ? `<button class="btn shard" id="perksBtn">Star perks · ${p.shards} shard${p.shards === 1 ? '' : 's'}</button>` : ''}
    ${p.stage >= PRESTIGE_STAGE
      ? `<button class="btn shard" id="prestigeBtn">New expedition · +${shards} star shards</button>
         <p class="tag" style="margin:6px 0 0;font-size:12.5px">Restart at stage 1 without cash or gear. Shards buy permanent perks. Going deeper first earns more.</p>`
      : `<p class="tag" style="margin:10px 0 0;font-size:12.5px">Reach stage ${PRESTIGE_STAGE} to unlock expeditions and permanent perks.</p>`}
  `);

  if ($('perksBtn')) on('perksBtn', showPerks);
  if ($('prestigeBtn')) on('prestigeBtn', () => {
    if (!confirm(`Start a new expedition? You go back to stage 1 and lose your cash, rocks and gear. You gain ${shards} star shards.`)) return;
    p.shards += shards;
    p.expeditions++;
    G.profile = freshRun(p);
    save();
    sfx.clear();
    showPerks();
  });
  if (value > 0) on('sellBtn', () => {
    p.money += value;
    for (const k of ORE_KEYS) p.cargo[k] = 0;
    G.hasSave = true;
    save();
    sfx.sell();
    showShop(summary);
  });
  overlay.querySelectorAll('[data-buy]').forEach(btn => btn.addEventListener('click', () => {
    unlock();
    const it = SHOP.find(s => s.id === btn.dataset.buy);
    const cost = priceOf(it, up[it.id]);
    if (p.money < cost || (!it.endless && up[it.id] >= it.max) || (it.minStage && p.stage < it.minStage)) { sfx.deny(); return; }
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

function showPerks() {
  G.mode = 'shop';
  const p = G.profile;
  const rows = PERKS.map(k => {
    const lvl = p.perks[k.id], maxed = lvl >= k.max, cost = perkCost(lvl);
    return `
      <div class="shop-item">
        <div class="info">
          <div><span class="name">${k.name}</span><span class="lvl">${lvl ? `Lv ${lvl}` : ''}</span></div>
          <div class="desc">${k.desc}</div>
        </div>
        <button class="shard" data-perk="${k.id}" ${maxed || p.shards < cost ? 'disabled' : ''}>${maxed ? 'MAX' : '★ ' + cost}</button>
      </div>`;
  }).join('');
  panel(`
    <h2>Star perks</h2>
    <p class="tag">Permanent. They carry over to every expedition.</p>
    <div class="wallet"><span>Star shards</span><span class="cash shard-count">★ ${p.shards}</span></div>
    ${rows}
    <button class="btn primary" id="backBtn">Trading post</button>
  `);
  overlay.querySelectorAll('[data-perk]').forEach(btn => btn.addEventListener('click', () => {
    unlock();
    const k = PERKS.find(x => x.id === btn.dataset.perk), cost = perkCost(p.perks[k.id]);
    if (p.shards < cost || p.perks[k.id] >= k.max) { sfx.deny(); return; }
    p.shards -= cost;
    p.perks[k.id]++;
    if (k.id === 'start' && p.stage === 1) p.money += START_CASH_PER_LEVEL;   // counts for the run about to begin
    G.hasSave = true;
    save();
    sfx.buy();
    showPerks();
  }));
  on('backBtn', () => showShop());
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
  const lost = saleValue(G.haul);
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
  // past 5 hearts a row of icons would push the rest of the bar off a phone screen
  setText('hearts', (p.maxHp > 5 ? `♥<span class="num"> ${Math.max(0, p.hp)}/${p.maxHp}</span>`
    : '♥'.repeat(Math.max(0, p.hp)) + `<span class="lost">${'♥'.repeat(Math.max(0, p.maxHp - p.hp))}</span>`)
    + (p.shield > 0 ? `<span class="shield">◆<span class="num">${p.shield}</span></span>` : ''));
  setText('stage', `Stage ${prof.stage} · ${G.cfg.planet.name}`);
  setText('money', short(prof.money));
  setText('cargo', `${cargoCount(G.haul)} · ${short(saleValue(G.haul))}`);
  setText('muteBtn', '♪');
  $('muteBtn').classList.toggle('off', prof.muted);
  $('progress').style.width = (Math.min(1, G.time / G.cfg.duration) * 100).toFixed(1) + '%';

  jumpBtn.hidden = G.obstacles.length === 0;
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
  jumpBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    unlock();
    input.jump = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') togglePause();
  });
  showMenu();
}
