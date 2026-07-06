/**
 * 8-bit synthesis core (pure — no AudioContext/DOM dependency). sfxr-style one-shot SFX + chiptune loop BGM.
 * Owner: audio agent. Synthesizes in real time in the browser with no external audio files.
 * (design and tone share the same lineage as the sound-lab presets — game SFX source of truth)
 */
export type Wave = 'square' | 'saw' | 'triangle' | 'sine' | 'noise';

export interface SfxParams {
  wave?: Wave;
  freq?: number;
  duty?: number;
  dutySweep?: number;
  attack?: number;
  sustain?: number;
  decay?: number;
  punch?: number;
  /** frequency slide (octaves/sec) */
  slide?: number;
  /** arpeggio: at this time (sec), multiply freq by arpMul */
  arpTime?: number;
  arpMul?: number;
  vibDepth?: number;
  vibSpeed?: number;
  /** 1 = low-pass off, <1 = filter strength */
  lpf?: number;
  hpf?: number;
  gain?: number;
}

export interface SeqNote {
  m: number;
  t: number;
  d: number;
  w?: Wave;
  g?: number;
  duty?: number;
}

export interface VampTrack {
  id: string;
  bpm: number;
  bars: number[][];
  density?: number;
  leadWave?: Wave;
  leadOct?: number;
}

export const SR = 44100;

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const clampf = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

/** render a one-shot SFX (sfxr-style) */
export function renderSFX(p: SfxParams, sr: number = SR, rng: () => number = Math.random): Float32Array {
  const atk = Math.max(0.0005, p.attack ?? 0.001);
  const sus = Math.max(0, p.sustain ?? 0.03);
  const dec = Math.max(0.005, p.decay ?? 0.1);
  const dur = Math.min(2.2, atk + sus + dec);
  const N = Math.max(1, Math.floor(dur * sr));
  const out = new Float32Array(N);
  let phase = 0;
  let freq = p.freq ?? 600;
  let duty = p.duty ?? 0.5;
  let noiseVal = rng() * 2 - 1;
  let noiseAcc = 0;
  let lp = 0;
  let hp = 0;
  let arpDone = false;
  const arpTime = p.arpTime ?? 0;
  const arpMul = p.arpMul ?? 1;
  const slide = p.slide ?? 0;
  const dutySweep = p.dutySweep ?? 0;
  const vibDepth = p.vibDepth ?? 0;
  const vibSpeed = p.vibSpeed ?? 0;
  const lpf = p.lpf ?? 1;
  const hpf = p.hpf ?? 0;
  const wave: Wave = p.wave ?? 'square';
  const punch = p.punch ?? 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    let env: number;
    if (t < atk) env = t / atk;
    else if (t < atk + sus) env = 1 + punch * (1 - (t - atk) / sus);
    else env = 1 - (t - atk - sus) / dec;
    if (env < 0) env = 0;
    if (arpTime > 0 && !arpDone && t >= arpTime) {
      freq *= arpMul;
      arpDone = true;
    }
    freq *= Math.pow(2, slide / sr);
    if (freq < 20) freq = 20;
    if (freq > 18000) freq = 18000;
    const f = freq * (1 + vibDepth * Math.sin(2 * Math.PI * vibSpeed * t));
    duty += dutySweep / sr;
    if (duty < 0.03) duty = 0.03;
    if (duty > 0.97) duty = 0.97;
    phase += f / sr;
    if (phase >= 1) phase -= 1;
    let s: number;
    if (wave === 'square') s = phase < duty ? 1 : -1;
    else if (wave === 'saw') s = 2 * phase - 1;
    else if (wave === 'triangle') s = 4 * Math.abs(phase - 0.5) - 1;
    else if (wave === 'sine') s = Math.sin(2 * Math.PI * phase);
    else {
      noiseAcc += f / sr;
      if (noiseAcc >= 1) {
        noiseAcc -= 1;
        noiseVal = rng() * 2 - 1;
      }
      s = noiseVal;
    }
    if (lpf < 1) {
      lp += (s - lp) * lpf;
      s = lp;
    }
    if (hpf > 0) {
      hp += (s - hp) * hpf;
      s = s - hp;
    }
    out[i] = s * env;
  }
  const g = p.gain ?? 0.35;
  for (let j = 0; j < N; j++) out[j] = clampf(out[j] * g);
  return out;
}

function addTone(
  out: Float32Array,
  sr: number,
  start: number,
  freq: number,
  dur: number,
  wave: Wave,
  gain: number,
  duty = 0.5,
): void {
  const s0 = Math.floor(start * sr);
  const N = Math.floor(dur * sr);
  const atk = 0.004;
  const rel = Math.min(0.05, dur * 0.5);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    let env: number;
    if (t < atk) env = t / atk;
    else if (t > dur - rel) env = Math.max(0, (dur - t) / rel);
    else env = 1;
    phase += freq / sr;
    if (phase >= 1) phase -= 1;
    const w =
      wave === 'triangle'
        ? 4 * Math.abs(phase - 0.5) - 1
        : wave === 'saw'
          ? 2 * phase - 1
          : wave === 'sine'
            ? Math.sin(2 * Math.PI * phase)
            : phase < duty
              ? 1
              : -1;
    const idx = s0 + i;
    if (idx >= 0 && idx < out.length) out[idx] += w * env * gain;
  }
}

function addNoise(
  out: Float32Array,
  sr: number,
  start: number,
  dur: number,
  gain: number,
  rng: () => number,
): void {
  const s0 = Math.floor(start * sr);
  const N = Math.floor(dur * sr);
  const atk = 0.001;
  const rel = Math.min(0.02, dur * 0.6);
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    let env: number;
    if (t < atk) env = t / atk;
    else if (t > dur - rel) env = Math.max(0, (dur - t) / rel);
    else env = 1;
    const idx = s0 + i;
    if (idx >= 0 && idx < out.length) out[idx] += (rng() * 2 - 1) * env * gain;
  }
}

/** short multi-note jingle (WIN/LOSE/DRAW/GO, etc.) */
export function renderSeq(notes: SeqNote[], sr: number = SR): Float32Array {
  let end = 0;
  for (const n of notes) {
    const e = n.t + n.d;
    if (e > end) end = e;
  }
  end += 0.03;
  const out = new Float32Array(Math.max(1, Math.floor(end * sr)));
  for (const no of notes) addTone(out, sr, no.t, mtof(no.m), no.d, no.w ?? 'square', no.g ?? 0.24, no.duty);
  for (let i = 0; i < out.length; i++) out[i] = clampf(out[i]);
  return out;
}

/** chord vamp → seamless chiptune loop (buffer length = exact multiple of bars) */
export function renderVamp(track: VampTrack, sr: number = SR): Float32Array {
  const bpm = track.bpm;
  const density = track.density ?? 16;
  const leadWave: Wave = track.leadWave ?? 'square';
  const leadOct = track.leadOct ?? 0;
  const stepDur = ((60 / bpm) * 4) / density;
  const rng = mulberry32(hashStr(track.id));
  let total = 0;
  for (let b = 0; b < track.bars.length; b++) total += density * stepDur;
  const N = Math.max(1, Math.floor(total * sr));
  const out = new Float32Array(N);
  let t = 0;
  for (let b = 0; b < track.bars.length; b++) {
    const ch = track.bars[b];
    const pool = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12];
    for (let s = 0; s < density; s++) {
      addTone(out, sr, t, mtof(pool[s % pool.length] + 12 * leadOct), stepDur * 0.92, leadWave, 0.15);
      if (s % (density / 4) === 0) addTone(out, sr, t, mtof(ch[0] - 12), (60 / bpm) * 0.9, 'triangle', 0.26);
      if (s % 2 === 0) addNoise(out, sr, t, 0.028, 0.05, rng);
      t += stepDur;
    }
  }
  for (let j = 0; j < N; j++) out[j] = clampf(out[j] * 0.9);
  return out;
}
