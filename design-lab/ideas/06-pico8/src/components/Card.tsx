/**
 * Card — 픽셀 노치 코너 패널 프리미티브 (PLAN §1.3/1.5).
 *
 * 검정 2px 아웃라인 + 4px 하드섀도. tone으로 문맥색 선택.
 * title을 주면 상단에 픽셀폰트 오버라인 헤더(검정 2px 라인 아래) 렌더.
 *
 * 사용법:
 *   <Card tone="purple" title="RANKING · 1분반">...</Card>
 *   <Card tone="green" style={{width: 320}}>...</Card>
 *   <Card tone="gray" notch={false}>...</Card>       // 노치 없는 사각 패널
 *   <Card data-testid="..." className="...">          // div 속성 전부 통과
 *
 * tone: 'purple'(--surface, 기본) | 'green'(--surface-2) | 'gray'(--surface-3) | 'black'(--bg-deep)
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export type CardTone = 'purple' | 'green' | 'gray' | 'black';

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CardTone;
  /** 픽셀폰트 헤더 (영문 오버라인 관례 — HTML title 속성 아님) */
  title?: ReactNode;
  /** 4px 픽셀 노치 코너 적용 여부 (기본 true) */
  notch?: boolean;
  /** 부유 레이어용 딥섀도 (기본 false = 4px 하드섀도) */
  floating?: boolean;
}

const TONE_BG: Record<CardTone, string> = {
  purple: 'var(--surface)',
  green: 'var(--surface-2)',
  gray: 'var(--surface-3)',
  black: 'var(--bg-deep)',
};

export function Card({
  tone = 'purple',
  title,
  notch = true,
  floating = false,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={className}
      style={{
        // clip-path는 box-shadow를 잘라먹으므로 섀도는 바깥 래퍼에, 노치는 안쪽에
        filter: undefined,
        boxShadow: floating ? 'var(--shadow-float)' : 'var(--shadow-hard)',
        border: '2px solid var(--bg-deep)',
        background: TONE_BG[tone],
        ...style,
      }}
      {...rest}
    >
      <div style={notch ? { clipPath: 'var(--notch-4)', background: 'inherit' } : undefined}>
        {title ? (
          <div
            className="px-font"
            style={{
              fontSize: 10,
              padding: '8px 12px',
              borderBottom: '2px solid var(--bg-deep)',
              background: 'var(--bg)',
              color: 'var(--text-dim)',
            }}
          >
            {title}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export default Card;
