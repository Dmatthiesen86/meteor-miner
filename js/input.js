// Touch + mouse + keyboard. The whole screen is one control surface:
//   Touch / mouse:  drag anywhere to run, tap anywhere to jump. While one thumb is steering,
//                   a tap from the other thumb jumps at once.
//   Keyboard:       A/D or arrow keys to run, Space / W / Up to jump, T / E for towers,
//                   1 / 2 / 3 for supplies.
// There is no aiming: the blaster fires straight up.
import { G } from './state.js';

export const input = {
  move: 0,          // -1 .. 1
  stick: null,      // { x0, x, y } while a movement drag is active (drawn by the renderer)
  deploy: false,    // one-shot: place or turn a tower
  jump: false,      // one-shot
  use: null,        // one-shot: id of a supply item to fire
};

const STICK_RANGE = 36, STICK_DEAD = 0.18;
const TAP_MS = 220, TAP_SLOP = 12;   // a touch this short and this still is a tap, not a drag
const keys = new Set();
let movePtr = null;
// Finger count from touch events, which report every finger on the glass. Not every browser
// sends them, so the count is only trusted once one has been seen.
let fingersDown = 0, touchEventsSeen = false;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function logical(e) {
  const s = G.view.scale;
  return { x: e.clientX / s, y: e.clientY / s };
}

function keyMove() {
  const r = keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0;
  const l = keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0;
  return r - l;
}

/**
 * Forget every finger the game thinks is down. A lift can go missing (it lands on a panel that
 * opened under the finger, the browser takes the touch for a system gesture, the app is
 * switched away), and a steering thumb that never "lifts" would leave the miner running.
 */
export function resetPointers() {
  movePtr = null;
  input.stick = null;
  input.move = keyMove();
}

export function initInput(canvas, handlers) {
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    handlers.unlock();
    // This is the only finger on the glass, so any finger still on the books is a ghost.
    if (e.pointerType === 'touch' && touchEventsSeen && fingersDown === 0) resetPointers();
    // A second finger while the first is steering: jump at once.
    if (movePtr !== null) { input.jump = true; return; }
    const p = logical(e);
    movePtr = e.pointerId;
    input.stick = { x0: p.x, x: p.x, y: p.y, startX: p.x, t: performance.now(), moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== movePtr) return;
    const p = logical(e), s = input.stick;
    s.x = p.x;
    if (Math.abs(p.x - s.startX) > TAP_SLOP) s.moved = true;
    // The anchor trails the finger so reversing direction never needs a long drag back.
    s.x0 = clamp(s.x0, s.x - STICK_RANGE * 1.4, s.x + STICK_RANGE * 1.4);
    const v = clamp((s.x - s.x0) / STICK_RANGE, -1, 1);
    input.move = Math.abs(v) < STICK_DEAD ? 0 : v;
  });

  const release = e => {
    if (e.pointerId !== movePtr) return;
    // A lone quick tap can only be told from a drag once the finger lifts.
    const s = input.stick;
    if (e.type === 'pointerup' && !s.moved && performance.now() - s.t < TAP_MS) input.jump = true;
    resetPointers();
  };
  // On window, not the canvas: the lift must count wherever it lands.
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  // Touch events fire after the matching pointer event, so at pointerdown `fingersDown`
  // still holds the count from before that finger landed.
  const countFingers = e => {
    touchEventsSeen = true;
    fingersDown = e.touches.length;
    if (fingersDown === 0) resetPointers();
  };
  for (const type of ['touchstart', 'touchend', 'touchcancel']) {
    window.addEventListener(type, countFingers, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); resetPointers(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    handlers.unlock();
    keys.add(e.code);
    if (movePtr === null) input.move = keyMove();
    if (e.code === 'KeyT' || e.code === 'KeyE') input.deploy = true;
    else if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { input.jump = true; e.preventDefault(); }
    else if (e.code === 'Digit1') input.use = 'nuke';
    else if (e.code === 'Digit2') input.use = 'slow';
    else if (e.code === 'Digit3') input.use = 'cell';
    else if (e.code === 'Escape' || e.code === 'KeyP') handlers.pause();
    else if (e.code === 'KeyM') handlers.mute();
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (movePtr === null) input.move = keyMove();
  });
  window.addEventListener('blur', () => {
    keys.clear();
    resetPointers();
  });
}
