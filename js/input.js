// Touch + mouse + keyboard.
//   Touch:    drag in the strip below the ground to run, touch the sky to aim.
//   Desktop:  A/D or arrow keys to run, Space / W / Up to jump, mouse to aim, T / E for towers, 1 / 2 / 3 for supplies.
import { G } from './state.js';
import { GROUND_Y } from './config.js';

export const input = {
  move: 0,          // -1 .. 1
  aimPoint: null,   // where the player is pointing, in logical view units
  stick: null,      // { x0, x, y } while a movement drag is active (drawn by the renderer)
  aimHeld: false,   // a finger or mouse button is down on the sky (overrides auto-targeting)
  deploy: false,    // one-shot: place or re-aim a tower
  jump: false,      // one-shot
  use: null,        // one-shot: id of a supply item to fire
};

const STICK_RANGE = 36, STICK_DEAD = 0.18;
const keys = new Set();
let movePtr = null, aimPtr = null;

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

export function initInput(canvas, handlers) {
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    handlers.unlock();
    const p = logical(e);
    if (p.y > GROUND_Y) {
      if (movePtr !== null) return;
      movePtr = e.pointerId;
      input.stick = { x0: p.x, x: p.x, y: p.y };
    } else {
      aimPtr = e.pointerId;
      input.aimPoint = p;
      input.aimHeld = true;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });

  canvas.addEventListener('pointermove', e => {
    const p = logical(e);
    if (e.pointerId === movePtr) {
      const s = input.stick;
      s.x = p.x;
      // The anchor trails the finger so reversing direction never needs a long drag back.
      s.x0 = clamp(s.x0, s.x - STICK_RANGE * 1.4, s.x + STICK_RANGE * 1.4);
      const v = clamp((s.x - s.x0) / STICK_RANGE, -1, 1);
      input.move = Math.abs(v) < STICK_DEAD ? 0 : v;
    } else if (e.pointerId === aimPtr || (e.pointerType === 'mouse' && aimPtr === null)) {
      input.aimPoint = p;
    }
  });

  const release = e => {
    if (e.pointerId === movePtr) {
      movePtr = null;
      input.stick = null;
      input.move = keyMove();
    } else if (e.pointerId === aimPtr) {
      aimPtr = null;
      input.aimHeld = false;
      // A finger leaves the screen, so keep the last angle. A mouse is still hovering.
      if (e.pointerType !== 'mouse') input.aimPoint = null;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
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
    if (movePtr === null) input.move = 0;
  });
}
