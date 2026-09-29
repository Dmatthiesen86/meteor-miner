import { H } from './config.js';
import { G } from './state.js';
import { initInput } from './input.js';
import { update, updateCamera } from './game.js';
import { render } from './render.js';
import { initUI, updateHUD, togglePause, toggleMute } from './ui.js';
import { unlock } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  // A hidden or not-yet-laid-out window reports 0; keep the scale finite until it resizes.
  const w = window.innerWidth || 360, h = window.innerHeight || H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // cap for phone performance
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  G.view.dpr = dpr;
  G.view.scale = h / H;
  G.view.w = w / G.view.scale;
  if (G.player) updateCamera();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

initInput(canvas, { unlock, pause: togglePause, mute: toggleMute });
initUI();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (G.mode === 'playing' || G.mode === 'clearing') update(dt);
  render(ctx, now / 1000);
  updateHUD();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Offline play: the service worker caches the whole game on first visit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Handy in the browser console while tuning: G.profile.money = 5000, etc.
window.G = G;
