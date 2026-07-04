/**
 * Card — 클레이 카드 (PLAN §1.5). radius 32 + 클레이 볼륨 그림자.
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법:
 *   <Card>...</Card>
 *   <Card tone="sky" style={{ maxWidth: 420 }} data-testid="...">...</Card>
 *   <Card interactive onClick={...}>  // hover 시 떠오름 (게임 선택 카드용)
 *
 * tone: 'surface'(기본 아이보리) | 'sky'(게임2/온라인) | 'lilac'(온보딩 주변)
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'surface' | 'sky' | 'lilac';
  /** true면 hover 시 살짝 떠오르는 인터랙티브 카드 (게임 선택 등) */
  interactive?: boolean;
  children?: ReactNode;
}

const TONE_BG: Record<NonNullable<CardProps['tone']>, string> = {
  surface: 'var(--surface)',
  sky: 'var(--bg-sky)',
  lilac: 'var(--bg-lilac)',
};

export default function Card({
  tone = 'surface',
  interactive = false,
  children,
  style,
  className,
  ...rest
}: CardProps) {
  const base: CSSProperties = {
    background: TONE_BG[tone],
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-clay)',
    padding: 28,
    transition: interactive ? 'transform var(--dur-spring) var(--spring)' : undefined,
    cursor: interactive ? 'pointer' : undefined,
  };
  return (
    <div
      className={className}
      style={{ ...base, ...style }}
      onMouseEnter={
        interactive
          ? (e) => {
              e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
              rest.onMouseEnter?.(e);
            }
          : rest.onMouseEnter
      }
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.style.transform = '';
              rest.onMouseLeave?.(e);
            }
          : rest.onMouseLeave
      }
      {...rest}
    >
      {children}
    </div>
  );
}
