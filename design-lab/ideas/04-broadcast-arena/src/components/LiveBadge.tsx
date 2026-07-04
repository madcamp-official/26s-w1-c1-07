/**
 * LiveBadge — 레드 점 펄스 + "LIVE" pill (인게임 공통 셸, PLAN §2).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법: <LiveBadge />  /  <LiveBadge label="REPLAY" />
 */
import type { CSSProperties } from 'react';

export interface LiveBadgeProps {
  /** 기본 'LIVE' */
  label?: string;
  style?: CSSProperties;
}

export default function LiveBadge({ label = 'LIVE', style }: LiveBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'var(--strip)',
        color: '#fff',
        borderRadius: 'var(--radius-pill)',
        padding: '4px 14px',
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        data-anim="live"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--live)',
          animation: 'live-pulse 1s ease-in-out infinite',
        }}
      />
      <span className="label" style={{ color: '#fff', fontSize: 11 }}>
        {label}
      </span>
    </span>
  );
}
