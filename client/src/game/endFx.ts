/**
 * 게임 종료 연출 공용 뼈대 — 온라인/오프라인 공통.
 *
 * 문제: 라운드가 끝나면(state.result 확정) 화면이 종료 프레임에 '얼어붙어' 어중간하게 끊긴다.
 *       (특히 온라인은 서버가 틱을 멈춰 마지막 스냅샷에서 정지)
 * 해결: 각 게임 렌더 루프가 'result가 null→승패로 바뀌는 프레임'을 감지해 종료 연출 단계로 진입,
 *       그 동안 게임별 FX(폭발 등)나 기본 FX(플래시)를 캔버스에 그린다. 서버 라운드 간격(2.5s)
 *       안에 충분히 들어간다.
 *
 * 사용:
 *   const endRef = useRef(createEndTracker());
 *   // 렌더 루프에서 drawScene 뒤:
 *   const started = endRef.current.update(state.result, now); // 방금 끝났으면 true(폭발 스폰 등 트리거)
 *   drawEndFlash(ctx, CW, CH, endRef.current.age(now));       // 기본 default 연출(플래시)
 */
import type { GameResult } from '@madpump/shared';

/** 기본 플래시 지속(ms) — 결정 순간 흰 섬광이 빠르게 페이드 */
export const FLASH_MS = 320;
/** 종료 연출 전체 창(ms) — 폭발 파편 등 리치 연출의 수명 */
export const END_ANIM_MS = 900;

export interface EndTracker {
  /** 매 프레임 호출. result가 방금 null→승패로 바뀐 프레임이면 true(연출 시작 트리거용). */
  update(result: GameResult, now: number): boolean;
  /** 종료 연출 경과(ms). 아직 진행 중(result=null)이면 null. */
  age(now: number): number | null;
  /** 현재 확정된 결과(연출 중이면 승패, 아니면 null). */
  readonly result: GameResult;
  reset(): void;
}

/** 게임 인스턴스당 하나. result 전환 시점을 기억해 경과 시간을 준다. 새 라운드(result=null)면 자동 리셋. */
export function createEndTracker(): EndTracker {
  let prev: GameResult = null;
  let at = 0;
  return {
    update(result, now) {
      if (result && !prev) {
        prev = result;
        at = now;
        return true; // 전환 프레임
      }
      if (!result && prev) {
        prev = null;
        at = 0;
      }
      return false;
    },
    age(now) {
      return prev ? now - at : null;
    },
    get result() {
      return prev;
    },
    reset() {
      prev = null;
      at = 0;
    },
  };
}

/**
 * 기본 종료 플래시(전 게임 default) — 결정 순간 흰 섬광이 빠르게 페이드.
 * 뷰어 관점(승/패) 불필요 — 어느 화면에서든 "결정적 순간"을 알린다. drawScene 마지막에 호출.
 * @param ageMs createEndTracker.age(now) 반환값(진행 전이면 null → 아무것도 안 그림)
 */
export function drawEndFlash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ageMs: number | null,
): void {
  if (ageMs === null || ageMs < 0 || ageMs > FLASH_MS) return;
  const a = 0.6 * (1 - ageMs / FLASH_MS); // 0.6 → 0
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── 폭발 연출 (게임5 등 충돌 게임용 재사용 헬퍼) ────────────────────────────
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** (cx,cy) 중심에서 방사하는 폭발 파편 생성. count개, 각도·속도 분산(약간의 랜덤). */
export function makeExplosion(cx: number, cy: number, count = 20): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const spd = 140 + Math.random() * 220;
    out.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd });
  }
  return out;
}

/**
 * 폭발 그리기 — 코어 흰 섬광 + 방사 파편(중력 낙하) + 페이드. END_ANIM_MS 후 사라짐.
 * @param ageMs 폭발 시작 후 경과(ms)
 */
export function drawExplosion(
  ctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  cx: number,
  cy: number,
  ageMs: number,
  color = '#ffb020',
): void {
  if (ageMs < 0 || ageMs > END_ANIM_MS) return;
  const t = ageMs / 1000;
  const fade = Math.max(0, 1 - ageMs / END_ANIM_MS);
  ctx.save();
  // 코어 섬광 링(초반 220ms)
  const flash = Math.max(0, 1 - ageMs / 220);
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 10 + ageMs * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // 파편(방사 + 약한 중력)
  ctx.globalAlpha = fade;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  for (const p of particles) {
    const px = p.x + p.vx * t;
    const py = p.y + p.vy * t + 240 * t * t;
    const sz = 5 * fade + 1;
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.restore();
}

/** 종료 연출용 화면 흔들림 오프셋(감쇠). drawScene 전 ctx.translate에 사용. */
export function shakeOffset(ageMs: number | null, mag = 8): { x: number; y: number } {
  if (ageMs === null || ageMs > 260) return { x: 0, y: 0 };
  const decay = 1 - ageMs / 260;
  return { x: (Math.random() - 0.5) * 2 * mag * decay, y: (Math.random() - 0.5) * 2 * mag * decay };
}
