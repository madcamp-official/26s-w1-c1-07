/**
 * Audio engine — AudioContext lifecycle management + playback + mute/volume (local storage) + gesture unlock.
 * SFX renders once per id, then caches the buffer (only playback repeats). BGM is a gapless loop.
 * Owner: audio agent. Never throws an exception into the game even on failure (all try/catch · no-op).
 */
import { renderSFX, renderSeq, renderVamp, mulberry32, hashStr, SR } from './synth';
import { PRESETS, SEQS, SPEC, BGM, type BgmKey } from './registry';

interface Persist {
  muted: boolean;
  volume: number;
}
const LS_KEY = 'madpump:audio';
function loadPersist(): Persist {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persist>;
      return { muted: !!p.muted, volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 0.6 };
    }
  } catch {
    /* ignore */
  }
  return { muted: false, volume: 0.6 };
}
function savePersist(p: Persist): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

let persist = loadPersist();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let pendingBgm: BgmKey | null = null;

const sfxCache = new Map<string, Float32Array>();
const bgmFloatCache = new Map<BgmKey, Float32Array>();
const bgmBufCache = new Map<BgmKey, AudioBuffer>();
const lastPlayed = new Map<string, number>();
const warned = new Set<string>();

let curBgmKey: BgmKey | null = null;
let curBgmSrc: AudioBufferSourceNode | null = null;
let curBgmGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = persist.muted ? 0 : persist.volume;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      return null;
    }
  }
  return ctx;
}

function toBuffer(c: AudioContext, f32: Float32Array): AudioBuffer {
  const b = c.createBuffer(1, f32.length, SR);
  b.getChannelData(0).set(f32);
  return b;
}

function renderCue(id: string): Float32Array | null {
  const cached = sfxCache.get(id);
  if (cached) return cached;
  const spec = SPEC[id];
  let buf: Float32Array;
  if (spec?.seq) buf = renderSeq(SEQS[spec.seq]);
  else {
    const presetName = spec?.preset ?? 'blip';
    if (!spec && !warned.has(id)) {
      warned.add(id);
      if (import.meta.env?.DEV) console.warn(`[audio] unknown sfx id "${id}" → blip fallback`);
    }
    const fn = PRESETS[presetName] ?? PRESETS.blip;
    buf = renderSFX(fn(mulberry32(hashStr(id))), SR, mulberry32(hashStr(id)));
  }
  sfxCache.set(id, buf);
  return buf;
}

/** Play a one-shot SFX. Silently no-ops if muted / context not ready / not unlocked (before unlock). */
export function sfx(id: string): void {
  try {
    if (persist.muted) return;
    const c = getCtx();
    if (!c || !master || c.state !== 'running') return;
    // Suppress ultra-short-interval duplicates of the same id (frame spam) — 15ms
    const now = c.currentTime;
    const prev = lastPlayed.get(id) ?? -1;
    if (prev >= 0 && now - prev < 0.015) return;
    lastPlayed.set(id, now);
    const f32 = renderCue(id);
    if (!f32) return;
    const src = c.createBufferSource();
    src.buffer = toBuffer(c, f32);
    src.connect(master);
    src.start();
  } catch {
    /* never throw into game */
  }
}

function bgmBuffer(c: AudioContext, key: BgmKey): AudioBuffer {
  let b = bgmBufCache.get(key);
  if (b) return b;
  let f = bgmFloatCache.get(key);
  if (!f) {
    f = renderVamp(BGM[key]);
    bgmFloatCache.set(key, f);
  }
  b = toBuffer(c, f);
  bgmBufCache.set(key, b);
  return b;
}

/** BGM switch — no-op if it's the same track. Schedules if before unlock (starts on unlock). */
export function playBgm(key: BgmKey): void {
  try {
    if (curBgmKey === key && curBgmSrc) return;
    if (!unlocked || persist.muted) {
      pendingBgm = key;
      curBgmKey = key; // Record the desired track (avoid duplicate scheduling)
      return;
    }
    const c = getCtx();
    if (!c || !master) return;
    stopBgm();
    curBgmKey = key;
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(master);
    const src = c.createBufferSource();
    src.buffer = bgmBuffer(c, key);
    src.loop = true;
    src.connect(g);
    src.start();
    // Short fade-in (prevent switch click)
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.25);
    curBgmSrc = src;
    curBgmGain = g;
    pendingBgm = null;
  } catch {
    /* ignore */
  }
}

export function stopBgm(): void {
  try {
    if (curBgmSrc) {
      const src = curBgmSrc;
      const g = curBgmGain;
      const c = getCtx();
      if (c && g) {
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.12);
        try {
          src.stop(t + 0.14);
        } catch {
          /* ignore */
        }
      } else {
        try {
          src.stop();
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  curBgmSrc = null;
  curBgmGain = null;
  curBgmKey = null;
}

/** Called on the first user gesture — AudioContext resume + start any scheduled BGM. */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  const finish = (): void => {
    unlocked = true;
    if (pendingBgm && !persist.muted) {
      const k = pendingBgm;
      pendingBgm = null;
      curBgmKey = null; // Force restart
      playBgm(k);
    }
  };
  if (c.state === 'suspended') {
    c.resume().then(finish, finish);
  } else {
    finish();
  }
}

export function isUnlocked(): boolean {
  return unlocked;
}

// ── Mute/Volume ──
export function setMuted(m: boolean): void {
  persist = { ...persist, muted: m };
  savePersist(persist);
  if (master && ctx) master.gain.value = m ? 0 : persist.volume;
  if (m) stopBgm();
}
export function toggleMuted(): boolean {
  setMuted(!persist.muted);
  return persist.muted;
}
export function isMuted(): boolean {
  return persist.muted;
}
export function setVolume(v: number): void {
  const vol = Math.min(1, Math.max(0, v));
  persist = { ...persist, volume: vol };
  savePersist(persist);
  if (master && ctx && !persist.muted) master.gain.value = vol;
}
export function getVolume(): number {
  return persist.volume;
}
