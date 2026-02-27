const isBrowser = typeof window !== 'undefined';

let ctx = null;
let enabled = true;
let masterVolume = 0.08;

function getContext() {
  if (!isBrowser) return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function tone({ freq = 440, duration = 0.12, type = 'sine', gain = masterVolume, at = 0 }) {
  const ac = getContext();
  if (!ac || !enabled) return;

  const now = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(g);
  g.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function setSoundEnabled(next) {
  enabled = !!next;
}

export function setSoundVolume(next) {
  const safe = Number(next);
  if (!Number.isFinite(safe)) return;
  masterVolume = Math.min(0.3, Math.max(0.01, safe));
}

export function playSound(kind) {
  if (!enabled) return;

  switch (kind) {
    case 'invoice':
      tone({ freq: 540, type: 'triangle', duration: 0.08, gain: 0.09, at: 0 });
      tone({ freq: 820, type: 'triangle', duration: 0.12, gain: 0.11, at: 0.08 });
      break;
    case 'success':
      tone({ freq: 520, type: 'sine', duration: 0.09, at: 0 });
      tone({ freq: 700, type: 'sine', duration: 0.11, at: 0.09 });
      break;
    case 'warn':
      tone({ freq: 280, type: 'square', duration: 0.1, gain: 0.07, at: 0 });
      tone({ freq: 240, type: 'square', duration: 0.12, gain: 0.07, at: 0.11 });
      break;
    case 'error':
      tone({ freq: 220, type: 'sawtooth', duration: 0.13, gain: 0.08, at: 0 });
      tone({ freq: 180, type: 'sawtooth', duration: 0.15, gain: 0.08, at: 0.14 });
      break;
    case 'notify':
      tone({ freq: 880, type: 'sine', duration: 0.08, gain: 0.08, at: 0 });
      break;
    case 'action':
    default:
      tone({ freq: 640, type: 'triangle', duration: 0.05, gain: 0.06, at: 0 });
      break;
  }
}

