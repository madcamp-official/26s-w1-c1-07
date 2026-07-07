/**
 * Audio engine — AudioContext lifecycle + playback + mute/volume (local storage) + gesture unlock.
 * SFX: rendered once per id, then buffer-cached (only playback repeats; sfxr-style synthesis).
 * BGM: mp3 files (Suno) streamed on a loop via HTMLAudioElement (low memory). Zone-based track
 *      crossfade + in-game focus volume (much lower than lobby). Policy (which track/volume) lives
 *      in the controller; the engine only exposes setBgm.
 * Owner: audio agent. Never throws an exception into the game even on failure (all try/catch · no-op).
 */
import { renderSFX, renderSeq, mulberry32, hashStr, SR } from './synth';
import { PRESETS, SEQS, SPEC } from './registry';

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

const sfxCache = new Map<string, Float32Array>();
const lastPlayed = new Map<string, number>();
const warned = new Set<string>();

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

/** Play a one-shot SFX. Silently no-ops if muted / context not ready / not unlocked. */
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

// ───────────────────────── BGM (mp3 streaming + zone crossfade) ─────────────────────────
const FADE = 0.6; // crossfade / volume ramp (seconds)

interface Track {
  el: HTMLAudioElement;
  gain: GainNode;
}
const tracks = new Map<string, Track>();
let curUrl: string | null = null;
let desired: { url: string; vol: number } | null = null;

function ensureTrack(c: AudioContext, url: string): Track | null {
  let t = tracks.get(url);
  if (t) return t;
  if (!master) return null;
  try {
    const el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const srcNode = c.createMediaElementSource(el);
    const gain = c.createGain();
    gain.gain.value = 0;
    srcNode.connect(gain);
    gain.connect(master);
    t = { el, gain };
    tracks.set(url, t);
    return t;
  } catch {
    return null;
  }
}

function ramp(g: GainNode, c: AudioContext, to: number, time: number): void {
  const t = c.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(to, t + time);
}

/**
 * Set BGM — play the given track at `vol` (crossfade if different); pass null to stop.
 * No-ops and schedules into `desired` if before unlock / muted. The controller calls this
 * based on zone (lobby / in-game).
 */
export function setBgm(url: string | null, vol: number): void {
  try {
    if (url === null) {
      stopBgm();
      return;
    }
    desired = { url, vol };
    if (!unlocked || persist.muted) return;
    const c = getCtx();
    if (!c || !master) return;

    // Same track → just ramp the volume smoothly (e.g. lobby↔in-game focus level change)
    if (curUrl === url) {
      const cur = tracks.get(url);
      if (cur) ramp(cur.gain, c, vol, 0.5);
      return;
    }

    // Different track → crossfade
    const prevUrl = curUrl;
    const nt = ensureTrack(c, url);
    if (!nt) return;
    curUrl = url;
    void nt.el.play().catch(() => {});
    ramp(nt.gain, c, vol, FADE);

    if (prevUrl) {
      const old = tracks.get(prevUrl);
      if (old) {
        ramp(old.gain, c, 0, FADE);
        window.setTimeout(() => {
          // If the fade-out finished and it wasn't re-selected meanwhile, pause it (save resources)
          if (curUrl !== prevUrl) {
            try {
              old.el.pause();
            } catch {
              /* ignore */
            }
          }
        }, FADE * 1000 + 80);
      }
    }
  } catch {
    /* ignore */
  }
}

export function stopBgm(): void {
  desired = null;
  try {
    const c = getCtx();
    if (curUrl) {
      const cur = tracks.get(curUrl);
      if (cur) {
        if (c) ramp(cur.gain, c, 0, 0.2);
        const el = cur.el;
        window.setTimeout(() => {
          try {
            el.pause();
          } catch {
            /* ignore */
          }
        }, 240);
      }
    }
  } catch {
    /* ignore */
  }
  curUrl = null;
}

/** Called on the first user gesture — AudioContext resume + start any scheduled BGM. */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  const finish = (): void => {
    unlocked = true;
    if (desired && !persist.muted) {
      const d = desired;
      curUrl = null; // force start
      setBgm(d.url, d.vol);
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
  if (m) {
    // Pause tracks (save resources) — keep `desired` so unmute can restore
    const keep = desired;
    stopBgm();
    desired = keep;
  } else if (desired) {
    const d = desired;
    curUrl = null;
    setBgm(d.url, d.vol);
  }
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
