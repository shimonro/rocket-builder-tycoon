import type { EventBus, GameEvent } from '../../core/events';

type Tone = { freq: number; to?: number; duration: number; type?: OscillatorType; gain?: number; delay?: number };

/** Every sound is synthesized with WebAudio, so the game ships no audio files. */
const SOUNDS: Partial<Record<GameEvent['type'], Tone[]>> = {
  purchase: [
    { freq: 660, duration: 0.08, type: 'square', gain: 0.15 },
    { freq: 990, duration: 0.12, type: 'square', gain: 0.15, delay: 0.07 },
  ],
  sell: [{ freq: 520, to: 330, duration: 0.15, type: 'triangle' }],
  equip: [{ freq: 220, to: 440, duration: 0.1, type: 'triangle' }],
  unlock: [
    { freq: 523, duration: 0.1, type: 'triangle' },
    { freq: 659, duration: 0.1, type: 'triangle', delay: 0.1 },
    { freq: 784, duration: 0.25, type: 'triangle', delay: 0.2 },
  ],
  launch: [{ freq: 80, to: 300, duration: 0.6, type: 'sawtooth', gain: 0.12 }],
  turbo: [{ freq: 200, to: 900, duration: 0.35, type: 'sawtooth', gain: 0.1 }],
  fire: [{ freq: 900, to: 200, duration: 0.09, type: 'square', gain: 0.08 }],
  hoop: [
    { freq: 880, duration: 0.08, type: 'sine', gain: 0.25 },
    { freq: 1320, duration: 0.15, type: 'sine', gain: 0.25, delay: 0.06 },
  ],
  hit: [{ freq: 120, to: 40, duration: 0.3, type: 'sawtooth', gain: 0.3 }],
  obstacleDestroyed: [{ freq: 300, to: 60, duration: 0.25, type: 'square', gain: 0.15 }],
  targetReached: [
    { freq: 523, duration: 0.12, type: 'square', gain: 0.12 },
    { freq: 784, duration: 0.12, type: 'square', gain: 0.12, delay: 0.12 },
    { freq: 1047, duration: 0.3, type: 'square', gain: 0.12, delay: 0.24 },
  ],
  payout: [
    { freq: 1200, duration: 0.05, type: 'square', gain: 0.1 },
    { freq: 1600, duration: 0.1, type: 'square', gain: 0.1, delay: 0.06 },
  ],
  error: [{ freq: 160, duration: 0.15, type: 'square', gain: 0.1 }],
};

export interface AudioSettings {
  volume: number;
  muted: boolean;
}

export function connectAudio(bus: EventBus<GameEvent>, getSettings: () => AudioSettings): () => void {
  let ctx: AudioContext | null = null;

  function play(tones: Tone[]) {
    const { volume, muted } = getSettings();
    if (muted || volume <= 0 || typeof AudioContext === 'undefined') return;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const tone of tones) {
      const start = now + (tone.delay ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration);
      gain.gain.setValueAtTime((tone.gain ?? 0.2) * volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.duration + 0.02);
    }
  }

  return bus.on((event) => {
    const tones = SOUNDS[event.type];
    if (tones) play(tones);
  });
}
