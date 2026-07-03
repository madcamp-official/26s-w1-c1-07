/**
 * Stamp — WIN/LOSE/TOUCHÉ/BUST 판정 스탬프 (PLAN §1.3·§1.4).
 * scale(1.6)→1 등장 애니메이션은 theme.css의 .stamp가 처리.
 *
 * 사용법:
 *   <Stamp tone="win" tilt={-10}>P1 WIN!</Stamp>
 *   <Stamp tone="ink">DRAW</Stamp>
 *   <Stamp tone="error" tilt={-12} fontSize={40}>HIT!</Stamp>
 *   <Stamp tone="p1">TOUCHÉ!</Stamp>
 *
 * tone: win(그린) | error(레드) | accent(오렌지) | p1(블루) | p2(핑크) | ink(검정, 무승부)
 */
import type { CSSProperties, ReactNode } from 'react';

const TONES = {
  win: 'var(--win)',
  error: 'var(--error)',
  accent: 'var(--accent)',
  p1: 'var(--p1)',
  p2: 'var(--p2)',
  ink: 'var(--ink)',
} as const;

export interface StampProps {
  children: ReactNode;
  tone?: keyof typeof TONES;
  /** 기울기(도). 기본 -10 (PLAN: -8°~-15°) */
  tilt?: number;
  /** 폰트 크기 px. 기본 56 */
  fontSize?: number;
  style?: CSSProperties;
}

export function Stamp({ children, tone = 'ink', tilt = -10, fontSize, style }: StampProps) {
  return (
    <span
      className="stamp"
      style={{ color: TONES[tone], transform: `rotate(${tilt}deg)`, fontSize, ...style }}
    >
      {children}
    </span>
  );
}
