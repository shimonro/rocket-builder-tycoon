import type { EventBus, GameEvent } from '../../core/events';

/**
 * One synthesized layer. `type: 'noise'` plays filtered white noise with a bandpass centered on
 * `freq` (sweeping to `to`); `attack` fades in instead of starting at full gain.
 */
type Tone = { freq: number; to?: number; duration: number; type?: OscillatorType | 'noise'; gain?: number; delay?: number; attack?: number };

/** Every sound is synthesized with WebAudio, so the game ships no audio files. */
const SOUNDS: Partial<Record<GameEvent['type'], Tone[]>> = {
  purchase: [
    { freq: 660, duration: 0.08, type: 'square', gain: 0.15 },
    { freq: 990, duration: 0.12, type: 'square', gain: 0.15, delay: 0.07 },
  ],
  sell: [{ freq: 520, to: 330, duration: 0.15, type: 'triangle' }],
  // Clunk (thump + metal click) as the part seats, a servo whirr, then a latch click (~0.45 s).
  equip: [
    { freq: 150, to: 50, duration: 0.14, type: 'sine', gain: 0.4 },
    { freq: 1800, duration: 0.05, type: 'noise', gain: 0.35 },
    { freq: 430, duration: 0.07, type: 'square', gain: 0.05 },
    { freq: 170, to: 480, duration: 0.26, type: 'sawtooth', gain: 0.035, delay: 0.1, attack: 0.05 },
    { freq: 700, to: 2600, duration: 0.26, type: 'noise', gain: 0.12, delay: 0.1, attack: 0.05 },
    { freq: 1250, duration: 0.04, type: 'square', gain: 0.06, delay: 0.39 },
    { freq: 3200, duration: 0.03, type: 'noise', gain: 0.15, delay: 0.39 },
  ],
  // Rising sparkle of high bell tones with a shimmer tail.
  gem: [
    { freq: 1568, duration: 0.16, type: 'sine', gain: 0.14 },
    { freq: 2093, duration: 0.16, type: 'sine', gain: 0.13, delay: 0.05 },
    { freq: 2637, duration: 0.18, type: 'sine', gain: 0.12, delay: 0.1 },
    { freq: 3136, duration: 0.3, type: 'sine', gain: 0.11, delay: 0.15 },
    { freq: 4186, duration: 0.35, type: 'triangle', gain: 0.04, delay: 0.18, attack: 0.03 },
    { freq: 6000, duration: 0.25, type: 'noise', gain: 0.05, delay: 0.15, attack: 0.04 },
  ],
  // Short brass-like fanfare: da-da-da-daaa ending on a C major chord.
  celebrate: [
    { freq: 392, duration: 0.11, type: 'square', gain: 0.08 },
    { freq: 523, duration: 0.11, type: 'square', gain: 0.08, delay: 0.12 },
    { freq: 659, duration: 0.11, type: 'square', gain: 0.08, delay: 0.24 },
    { freq: 1047, duration: 0.6, type: 'square', gain: 0.08, delay: 0.36 },
    { freq: 659, duration: 0.6, type: 'triangle', gain: 0.12, delay: 0.36 },
    { freq: 784, duration: 0.6, type: 'triangle', gain: 0.12, delay: 0.36 },
    { freq: 131, duration: 0.6, type: 'sine', gain: 0.2, delay: 0.36 },
  ],
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
  music: number;
  vibration: boolean;
}

export type MusicMode = 'menu' | 'flight' | 'off';

/** One bar: a bass root and the chord tones the arpeggio walks up and down (MIDI note numbers). */
type Bar = { bass: number; arp: number[] };
type Mood = { bpm: number; bars: Bar[]; arpEvery: number; bassEvery: number; hatEvery: number; hatOffset: number; hat: number };

/** Steps are 16th notes, 16 per bar. Menu: Am7–Fmaj7–C–G, slow. Flight: Dm–B♭–F–C, driving. */
const MOODS: Record<Exclude<MusicMode, 'off'>, Mood> = {
  menu: {
    bpm: 92, arpEvery: 2, bassEvery: 16, hatEvery: 4, hatOffset: 2, hat: 0.03,
    bars: [
      { bass: 45, arp: [57, 60, 64, 67] },
      { bass: 41, arp: [57, 60, 65, 69] },
      { bass: 48, arp: [55, 60, 64, 67] },
      { bass: 43, arp: [55, 59, 62, 67] },
    ],
  },
  flight: {
    bpm: 128, arpEvery: 1, bassEvery: 4, hatEvery: 2, hatOffset: 0, hat: 0.04,
    bars: [
      { bass: 38, arp: [62, 65, 69, 74] },
      { bass: 34, arp: [62, 65, 70, 74] },
      { bass: 41, arp: [60, 65, 69, 72] },
      { bass: 36, arp: [60, 64, 67, 72] },
    ],
  },
};

const LOOKAHEAD = 0.12;
const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const unit = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

// Module singletons so the exported controls work from any screen once connectAudio ran.
let getSettings: (() => AudioSettings) | null = null;
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let musicBus: GainNode | null = null;
let musicLevel = -1;
let musicMode: MusicMode = 'off';
let track: { mood: Mood; out: GainNode; step: number; next: number } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let engine: { gain: GainNode; filter: BiquadFilterNode; saw: OscillatorNode; tri: OscillatorNode; src: AudioBufferSourceNode } | null = null;

function effectsLevel(): number {
  const s = getSettings?.();
  return !s || s.muted ? 0 : unit(s.volume);
}

/** Lazily creates (and resumes) the shared context; null before connectAudio or without WebAudio. */
function audio(): AudioContext | null {
  if (!getSettings || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Music: per-mood gains → musicBus (settings level) → soft echo + gentle lowpass → speakers.
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 5500;
    const echo = ctx.createDelay();
    echo.delayTime.value = 0.33;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.25;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(lowpass).connect(ctx.destination);
    musicBus.connect(echo).connect(feedback).connect(echo).connect(lowpass);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function voice(c: AudioContext, dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + Math.min(0.04, dur / 8));
  gain.gain.setTargetAtTime(0, t + Math.min(0.04, dur / 8), dur / 4);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.1);
}

function hat(c: AudioContext, dest: AudioNode, t: number, peak: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const highpass = c.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 3500;
  const gain = c.createGain();
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(highpass).connect(gain).connect(dest);
  src.start(t, Math.random() * 0.9, 0.06);
}

function scheduleStep(c: AudioContext, tr: NonNullable<typeof track>, t: number) {
  const { mood, out } = tr;
  const bar = mood.bars[Math.floor(tr.step / 16) % mood.bars.length];
  const s = tr.step % 16;
  const sixteenth = 60 / mood.bpm / 4;
  if (s % mood.bassEvery === 0) voice(c, out, t, midiHz(bar.bass), sixteenth * mood.bassEvery * 0.9, 'sine', 0.25);
  if (s % mood.arpEvery === 0) {
    const walk = [...bar.arp, ...bar.arp.slice(1, -1).reverse()];
    voice(c, out, t, midiHz(walk[(s / mood.arpEvery) % walk.length]), sixteenth * mood.arpEvery * 1.5, 'triangle', 0.07);
  }
  if (s % mood.hatEvery === mood.hatOffset) hat(c, out, t, s % 4 === 2 ? mood.hat : mood.hat / 2);
}

/** Look-ahead scheduler tick: polls settings for the music level, then queues notes due within LOOKAHEAD. */
function tick() {
  const c = ctx;
  if (!c || !musicBus || !getSettings) return;
  const s = getSettings();
  const level = s.muted ? 0 : unit(s.music) * unit(s.volume);
  if (level !== musicLevel) musicBus.gain.setTargetAtTime(level * 0.6, c.currentTime, 0.15);
  musicLevel = level;
  if (!track) return;
  if (track.next < c.currentTime) track.next = c.currentTime + 0.05;
  while (track.next < c.currentTime + LOOKAHEAD) {
    if (level > 0) scheduleStep(c, track, track.next);
    track.next += 60 / track.mood.bpm / 4;
    track.step++;
  }
}

/** Crossfades from the playing mood to `musicMode` and starts/stops the scheduler interval. */
function applyMusic() {
  const c = ctx;
  const mood = musicMode === 'off' || !getSettings ? null : MOODS[musicMode];
  if (!c || !musicBus || track?.mood === mood) return;
  if (track) {
    const old = track.out;
    old.gain.setTargetAtTime(0, c.currentTime, 0.4);
    setTimeout(() => old.disconnect(), 3000);
  }
  track = null;
  if (mood) {
    const out = c.createGain();
    out.gain.setValueAtTime(0, c.currentTime);
    out.gain.setTargetAtTime(1, c.currentTime, 0.4);
    out.connect(musicBus);
    track = { mood, out, step: 0, next: c.currentTime + 0.1 };
    timer ??= setInterval(tick, 25);
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Selects the background music mood. Safe to call any time; plays once audio is connected and unlocked. */
export function setMusicMode(mode: MusicMode): void {
  musicMode = mode;
  if (mode !== 'off') audio();
  applyMusic();
}

/** Engine hum; throttle -0.3…1 (0 = silent, negative = braking). Call repeatedly (~12×/s) while flying. */
export function setEngineSound(throttle: number, boost: boolean): void {
  const volume = effectsLevel();
  if (!engine && (throttle === 0 || volume === 0)) return;
  const c = audio();
  if (!c || !noise) return;
  if (!engine) {
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.connect(gain).connect(c.destination);
    const osc = (type: OscillatorType) => {
      const o = c.createOscillator();
      o.type = type;
      o.connect(filter);
      o.start();
      return o;
    };
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    src.connect(band).connect(filter);
    src.start();
    engine = { gain, filter, saw: osc('sawtooth'), tri: osc('triangle'), src };
  }
  const now = c.currentTime;
  const push = Math.max(0, throttle);
  const brake = Math.max(0, -throttle);
  const pitch = (brake > 0 ? 42 : 55 + 50 * push) * (boost ? 1.5 : 1);
  const loudness = throttle === 0 ? 0 : Math.min(1, 0.35 + 0.55 * push + brake + (boost ? 0.1 : 0));
  engine.saw.frequency.setTargetAtTime(pitch, now, 0.08);
  engine.tri.frequency.setTargetAtTime(pitch * 2.01, now, 0.08);
  engine.filter.frequency.setTargetAtTime(300 + 1500 * push + (boost ? 1800 : 0), now, 0.1);
  engine.gain.gain.setTargetAtTime(0.06 * volume * loudness, now, 0.08);
}

/** Fades out and releases the engine hum (flight ended or screen unmounted). */
export function stopEngineSound(): void {
  const e = engine;
  engine = null;
  if (!e || !ctx) return;
  const now = ctx.currentTime;
  e.gain.gain.setTargetAtTime(0, now, 0.05);
  for (const node of [e.saw, e.tri, e.src]) node.stop(now + 0.4);
}

function vibrate(ms: number) {
  if (getSettings?.().vibration && typeof navigator !== 'undefined') navigator.vibrate?.(ms);
}

export function connectAudio(bus: EventBus<GameEvent>, settings: () => AudioSettings): () => void {
  getSettings = settings;

  function play(tones: Tone[]) {
    const volume = effectsLevel();
    if (volume <= 0) return;
    const c = audio();
    if (!c) return;
    const now = c.currentTime;
    for (const tone of tones) {
      const start = now + (tone.delay ?? 0);
      const end = start + tone.duration;
      const peak = (tone.gain ?? 0.2) * volume;
      const gain = c.createGain();
      if (tone.attack) {
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + tone.attack);
      } else {
        gain.gain.setValueAtTime(peak, start);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(c.destination);
      let source: AudioScheduledSourceNode;
      let pitch: AudioParam;
      if (tone.type === 'noise') {
        const src = c.createBufferSource();
        src.buffer = noise;
        const band = c.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = 1.5;
        src.connect(band).connect(gain);
        src.start(start, Math.random() * 0.5);
        source = src;
        pitch = band.frequency;
      } else {
        const osc = c.createOscillator();
        osc.type = tone.type ?? 'sine';
        osc.connect(gain);
        osc.start(start);
        source = osc;
        pitch = osc.frequency;
      }
      pitch.setValueAtTime(tone.freq, start);
      if (tone.to) pitch.exponentialRampToValueAtTime(tone.to, end);
      source.stop(end + 0.02);
    }
  }

  // Browsers only start audio after a user gesture: unlock on the first one, then start pending music.
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    audio();
    applyMusic();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  if (ctx) applyMusic();

  const off = bus.on((event) => {
    const tones = SOUNDS[event.type];
    if (tones) play(tones);
    if (event.type === 'hit') vibrate(Math.min(120, 60 + event.damage * 1.5));
    if (event.type === 'obstacleDestroyed') vibrate(30);
  });

  return () => {
    off();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    stopEngineSound();
    const mode = musicMode;
    musicMode = 'off';
    applyMusic();
    musicMode = mode; // remembered so a reconnect (e.g. React StrictMode) resumes the same mood
    musicLevel = -1;
    getSettings = null;
  };
}
