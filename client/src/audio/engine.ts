/**
 * 오디오 엔진 — AudioContext 수명관리 + 재생 + 뮤트/볼륨(로컬 저장) + 제스처 unlock.
 * SFX는 id별로 1회 렌더 후 버퍼 캐시(재생만 반복). BGM은 gapless 루프.
 * 담당: audio 에이전트. 실패해도 게임에 예외를 던지지 않는다(전부 try/catch·no-op).
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

/** 한 방 SFX 재생. 뮤트/컨텍스트 미준비/미해제(unlock 전)면 조용히 no-op. */
export function sfx(id: string): void {
  try {
    if (persist.muted) return;
    const c = getCtx();
    if (!c || !master || c.state !== 'running') return;
    // 동일 id 초단시간 중복(프레임 스팸) 억제 — 15ms
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

/** BGM 전환 — 같은 트랙이면 no-op. unlock 전이면 예약(해제 시 시작). */
export function playBgm(key: BgmKey): void {
  try {
    if (curBgmKey === key && curBgmSrc) return;
    if (!unlocked || persist.muted) {
      pendingBgm = key;
      curBgmKey = key; // 원하는 트랙 기록(중복 예약 방지)
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
    // 짧은 페이드인(전환 클릭 방지)
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

/** 첫 사용자 제스처에서 호출 — AudioContext resume + 예약된 BGM 시작. */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  const finish = (): void => {
    unlocked = true;
    if (pendingBgm && !persist.muted) {
      const k = pendingBgm;
      pendingBgm = null;
      curBgmKey = null; // 강제 재시작
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

// ── 뮤트/볼륨 ──
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
