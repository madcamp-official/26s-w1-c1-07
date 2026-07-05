/**
 * Card — 다크 표면 + 퍼플 헤어라인 + 상단 마퀴 스트립 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 마퀴 스트립: 캐비닛 상단 간판 인용 — 어두운 띠에 네온 제목 + 좌우 끝 소형 램프 2개.
 *
 * 사용법:
 *   <Card marquee="1분반 HI-SCORE" marqueeColor="var(--accent)">
 *     ...본문...
 *   </Card>
 *   marquee 생략 시 민무늬 카드. brackets로 코너 브래킷 추가(히어로 패널용).
 */
import type { HTMLAttributes, ReactNode } from 'react';
import './card.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 상단 마퀴 스트립 제목 (생략 시 스트립 없음) */
  marquee?: ReactNode;
  /** 마퀴 제목·램프 색 (기본 --accent2) */
  marqueeColor?: string;
  /** 네 모서리 L자 브래킷 (히어로 패널) */
  brackets?: boolean;
  /** 브래킷 색 (기본 --accent2) */
  bracketColor?: string;
  children: ReactNode;
}

export function Card({
  marquee,
  marqueeColor = 'var(--accent2)',
  brackets = false,
  bracketColor = 'var(--accent2)',
  className = '',
  children,
  ...rest
}: CardProps) {
  const cls = ['nc-card', brackets ? 'corner-brackets' : '', className].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      style={brackets ? ({ '--bracket-color': bracketColor } as React.CSSProperties) : undefined}
      {...rest}
    >
      {brackets && <i className="cb2" aria-hidden />}
      {marquee !== undefined && (
        <div className="marquee-strip" style={{ color: marqueeColor }}>
          <span className="lamp lit" style={{ '--lamp-color': marqueeColor } as React.CSSProperties} />
          <span className="marquee-title glow-text">{marquee}</span>
          <span className="lamp lit" style={{ '--lamp-color': marqueeColor } as React.CSSProperties} />
        </div>
      )}
      <div className="nc-card__body">{children}</div>
    </div>
  );
}
