/**
 * Card — 방송 패널 카드: 흰 표면 + 1px 보더 + 4px 컬러 바 + 소프트 섀도 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법:
 *   <Card accent="navy" tab="STANDINGS — 1분반">...</Card>   // 스큐 헤더 탭 포함
 *   <Card accent="p1" accentSide="left">...</Card>           // 좌측 4px 팀 블루 바
 *   <Card testId="card-game1" onClick={...} hoverGold>...</Card>  // S8 대진 카드
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import SkewTab from './SkewTab';
import type { SkewTabTone } from './SkewTab';

export type CardAccent = 'navy' | 'gold' | 'p1' | 'p2' | 'none';

export interface CardProps {
  testId?: string;
  /** 4px 컬러 바 색 (기본 navy, 'none'이면 바 없음) */
  accent?: CardAccent;
  /** 컬러 바 위치 (기본 top) */
  accentSide?: 'top' | 'left';
  /** 스큐 헤더 탭 라벨 (카드 상단에 겹쳐 표시) */
  tab?: ReactNode;
  tabTone?: SkewTabTone;
  /** hover 시 골드 엣지 점등 (S8 대진 카드용) */
  hoverGold?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  children: ReactNode;
}

const ACCENT_COLOR: Record<Exclude<CardAccent, 'none'>, string> = {
  navy: 'var(--strip)',
  gold: 'linear-gradient(90deg, var(--gold), var(--gold-bright))',
  p1: 'var(--p1)',
  p2: 'var(--p2)',
};

export default function Card({
  testId,
  accent = 'navy',
  accentSide = 'top',
  tab,
  tabTone = 'navy',
  hoverGold = false,
  onClick,
  style,
  children,
}: CardProps) {
  const [hover, setHover] = useState(false);
  const gold = hoverGold && hover;
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: gold ? '1px solid var(--gold)' : '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        boxShadow: gold ? '0 8px 24px rgba(201, 147, 18, 0.25)' : 'var(--shadow)',
        padding: 20,
        cursor: onClick ? 'pointer' : undefined,
        transition: `border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)`,
        ...style,
      }}
    >
      {accent !== 'none' && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            background: gold ? ACCENT_COLOR.gold : ACCENT_COLOR[accent],
            ...(accentSide === 'top'
              ? {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  borderRadius: 'var(--radius) var(--radius) 0 0',
                }
              : {
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: 4,
                  borderRadius: 'var(--radius) 0 0 var(--radius)',
                }),
          }}
        />
      )}
      {tab != null && (
        <div style={{ marginBottom: 14, marginLeft: accentSide === 'left' ? 6 : 0 }}>
          <SkewTab tone={tabTone}>{tab}</SkewTab>
        </div>
      )}
      {children}
    </div>
  );
}
