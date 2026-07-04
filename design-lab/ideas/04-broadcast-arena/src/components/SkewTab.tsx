/**
 * SkewTab — 스큐 -12° 섹션 헤더 탭 (PLAN §1.3 시그니처 형태).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 카드/모달/패널의 헤더 라벨. 대문자 12px Archivo 컨덴스드 + 역스큐 텍스트.
 *
 * 사용법:
 *   <SkewTab>MATCH RULES</SkewTab>                  // 기본 네이비 (안내)
 *   <SkewTab tone="live">SIGN-IN REQUIRED</SkewTab> // 경고/BREAKING (레드)
 *   <SkewTab tone="p1">P1</SkewTab>                 // 팀 컬러
 */
import type { CSSProperties, ReactNode } from 'react';

export type SkewTabTone = 'navy' | 'live' | 'gold' | 'p1' | 'p2';

export interface SkewTabProps {
  tone?: SkewTabTone;
  style?: CSSProperties;
  children: ReactNode;
}

const TONE_BG: Record<SkewTabTone, string> = {
  navy: 'var(--strip)',
  live: 'var(--live)',
  gold: 'linear-gradient(105deg, var(--gold), var(--gold-bright))',
  p1: 'var(--p1)',
  p2: 'var(--p2)',
};

export default function SkewTab({ tone = 'navy', style, children }: SkewTabProps) {
  return (
    <span
      className="skew"
      style={{
        display: 'inline-block',
        background: TONE_BG[tone],
        color: '#fff',
        padding: '4px 14px',
        ...style,
      }}
    >
      <span className="unskew label" style={{ color: '#fff' }}>
        {children}
      </span>
    </span>
  );
}
