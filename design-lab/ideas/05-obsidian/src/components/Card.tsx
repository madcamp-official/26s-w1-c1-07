/**
 * Card — 45° 코너컷 surface 패널 (PLAN §1.3/§1.5).
 *
 * props:
 *   overline  — 상단 OVERLINE 레이블 행 (예: "DIVISION RANKING // 1분반")
 *   accent    — 'p1' | 'p2' 발광 보더 (기본 none). 게임 선택 카드는 전부 'p1'(시안)
 *   hoverable — 호버 시 부상 + 시안 발광 (클릭 가능한 카드)
 *   testId    — data-testid
 *
 * 사용 예:
 *   <Card overline="DIVISION RANKING // 1분반">...</Card>
 *   <Card hoverable testId="card-game1" onClick={...}>...</Card>
 */
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  overline?: string;
  accent?: 'none' | 'p1' | 'p2';
  hoverable?: boolean;
  testId?: string;
  children?: ReactNode;
}

export function Card({
  overline,
  accent = 'none',
  hoverable = false,
  testId,
  children,
  className,
  ...rest
}: CardProps) {
  const cls = [
    'card',
    accent !== 'none' ? `card--accent-${accent}` : '',
    hoverable ? 'card--hoverable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-testid={testId} {...rest}>
      {overline && (
        <div className="overline" style={{ marginBottom: 12 }}>
          {overline}
        </div>
      )}
      {children}
    </div>
  );
}
