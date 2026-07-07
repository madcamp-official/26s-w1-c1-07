/**
 * Game6(공룡 달리기) 테마별 렌더러 계약.
 * 각 테마는 자기 컨셉대로 씬 전체를 "처음부터" 그린다(drawScene). 좌표/판정은 절대 안 만든다 —
 * geom(테마 불변 기하) + @madpump/shared G6 상수만 기준(크로스플레이 불변). 여기 있는 건 '그리기'뿐.
 */
import type { Game6State } from '@madpump/shared';

/** 렌더 전용 이펙트 (게임 로직 비침범 — Game6.tsx가 상태 변화에서 생성해 넘긴다) */
export type Fx =
  | { kind: 'dust'; x: number; y: number; t: number } // 착지/점프 먼지
  | { kind: 'shards'; x: number; y: number; t: number } // 충돌 파편
  | { kind: 'spawn'; x: number; y: number; t: number } // P2 투척 섬광
  | { kind: 'caption'; text: string; color: string; x: number; y: number; t: number; life: number }
  | { kind: 'chroma'; t: number } // 충돌 순간 연출
  | { kind: 'rush'; t: number }; // 생존 승리 러쉬

/** 테마 불변 기하 — 논리(코어 800×450)→캔버스 픽셀 변환. 모든 테마가 동일하게 사용(공정성). */
export interface Geom {
  /** 캔버스 논리 폭(px) */
  CW: number;
  /** 캔버스 논리 높이(px) */
  CH: number;
  /** 스케일 (CW / G6.W) */
  SC: number;
  /** 논리 x → 캔버스 x */
  X: (u: number) => number;
  /** 논리 y → 캔버스 y */
  Y: (u: number) => number;
  /** 배경 별 배치(결정론적) */
  STARS: readonly { x: number; y: number; z: number; r: number }[];
}

/**
 * 테마별 씬 렌더러 — 배경/지면/장애물(선인장·새)/공룡(P1)/HUD 리로드게이지/플레이어 배지/이펙트까지
 * 한 프레임 전체를 그린다. drawEndFlash(종료 플래시)와 HUD 프레임은 Game6.tsx가 별도로 얹는다.
 * 색은 '역할'이 아니라 '플레이어'를 따른다 → functionColors()로 P1/P2 엔티티 색을 정한다(각 렌더러 내부).
 */
export type Game6DrawScene = (
  ctx: CanvasRenderingContext2D,
  s: Game6State,
  fx: readonly Fx[],
  now: number,
  p1IsYou: boolean,
  p2IsYou: boolean,
  geom: Geom,
) => void;
