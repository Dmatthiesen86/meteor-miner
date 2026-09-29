// Tiny synthesized sound effects (no audio files). Browsers only allow sound after a
// tap or key press, so unlock() is called from the first input.
let ctx = null, master = null, muted = false;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(freq, dur, { type = 'square', vol = 0.2, to = freq, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, vol, cutoff) {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  shoot:  () => tone(720, 0.07, { vol: 0.05, to: 380 }),
  tower:  () => tone(520, 0.06, { vol: 0.035, to: 300, type: 'triangle' }),
  hit:    () => tone(210, 0.05, { vol: 0.06, to: 140, type: 'triangle' }),
  shatter: r => noise(0.18 + r * 0.004, 0.22, 2400),
  impact: r => { noise(0.25 + r * 0.008, 0.35 + Math.min(0.3, r * 0.006), 900); tone(90, 0.25, { type: 'sine', vol: 0.3, to: 40 }); },
  pickup: v => tone(640 + Math.min(600, v * 40), 0.09, { type: 'sine', vol: 0.12, to: 1100 + Math.min(600, v * 40) }),
  hurt:   () => { tone(300, 0.3, { type: 'sawtooth', vol: 0.2, to: 70 }); noise(0.2, 0.2, 1500); },
  shield: () => { tone(900, 0.25, { type: 'sine', vol: 0.18, to: 220 }); noise(0.12, 0.12, 3000); },
  alarm:  () => { [0, 0.3, 0.6].forEach(d => tone(440, 0.22, { type: 'sawtooth', vol: 0.12, to: 880, delay: d })); },
  ufoShot: () => tone(1200, 0.18, { type: 'sawtooth', vol: 0.07, to: 300 }),
  rocket: () => { noise(0.3, 0.12, 1800); tone(180, 0.3, { type: 'sawtooth', vol: 0.06, to: 420 }); },
  buy:    () => { tone(660, 0.08, { type: 'triangle', vol: 0.15 }); tone(990, 0.12, { type: 'triangle', vol: 0.15, delay: 0.08 }); },
  sell:   () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.13, delay: i * 0.06 })); },
  deny:   () => tone(160, 0.15, { type: 'square', vol: 0.1, to: 110 }),
  deploy: () => { tone(300, 0.1, { type: 'square', vol: 0.1, to: 600 }); },
  clear:  () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.16, delay: i * 0.11 })); },
  dead:   () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', vol: 0.14, delay: i * 0.16 })); },
};
