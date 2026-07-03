/**
 * Card — 3px 보더 + 6px 하드섀도 표면 (PLAN §1.5).
 * title을 주면 상단 검정 스트립 바(ink 배경 + 크림 텍스트 + 우측 장식 사각 3개).
 *
 * 사용법:
 *   <Card title="1분반 리더보드" style={{ width: 420 }}>...</Card>
 *   <Card hero>...</Card>            // 4px 보더 + 10px 섀도 (히어로 요소)
 *   <Card title="PLAYER REGISTRATION" deco={false}>...</Card>  // 장식 사각 없이
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 상단 검정 타이틀 스트립 텍스트 (생략 시 스트립 없음) */
  title?: string;
  /** 타이틀 스트립 우측 장식 사각 3개(블루·핑크·옐로) 표시 여부 */
  deco?: boolean;
  /** true면 히어로 급 (4px 보더 + 10px 섀도) */
  hero?: boolean;
  children?: ReactNode;
}

const DECO_COLORS = ['var(--p1)', 'var(--p2)', 'var(--highlight)'];

export function Card({ title, deco = true, hero = false, children, style, ...rest }: CardProps) {
  const boxStyle: CSSProperties = { ...style };
  return (
    <div className={hero ? 'nb-box--hero' : 'nb-box'} style={boxStyle} {...rest}>
      {title !== undefined && (
        <div className="title-strip">
          <span>{title}</span>
          {deco && (
            <span className="title-strip__deco" aria-hidden>
              {DECO_COLORS.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
