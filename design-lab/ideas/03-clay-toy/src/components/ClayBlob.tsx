/**
 * ClayBlob — 화면 모서리 장식용 크고 흐린 클레이 블롭 (PLAN §1.3 장식 모티프).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 정보 영역과 겹치지 않게 z-index 최하단 + pointer-events 없음.
 * 화면당 1~2개만. shape: 'donut' | 'star' | 'drop'.
 *
 * 사용법 (.screen 컨테이너 안에서):
 *   <ClayBlob shape="donut" style={{ top: -60, left: -60 }} />
 *   <ClayBlob shape="star" size={180} style={{ bottom: -40, right: -30 }} />
 */
import type { CSSProperties } from 'react';

export interface ClayBlobProps {
  shape?: 'donut' | 'star' | 'drop';
  /** 대략적인 지름 px. 기본 220 */
  size?: number;
  /** 배경(--bg)보다 살짝 진한 톤. 기본 피치 계열 */
  color?: string;
  /** 위치 지정 (top/left/bottom/right) */
  style?: CSSProperties;
}

export default function ClayBlob({
  shape = 'donut',
  size = 220,
  color = '#F7E3D2',
  style,
}: ClayBlobProps) {
  const base: CSSProperties = {
    position: 'absolute',
    zIndex: 0,
    pointerEvents: 'none',
    width: size,
    height: size,
    ...style,
  };
  if (shape === 'star') {
    return (
      <svg viewBox="0 0 100 100" style={base} aria-hidden="true">
        <path
          d="M50 6 L61 36 L93 38 L68 58 L77 90 L50 71 L23 90 L32 58 L7 38 L39 36 Z"
          fill={color}
          stroke="none"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (shape === 'drop') {
    return (
      <div
        aria-hidden="true"
        style={{
          ...base,
          background: color,
          borderRadius: '60% 60% 60% 60% / 70% 70% 50% 50%',
        }}
      />
    );
  }
  // donut
  return (
    <div
      aria-hidden="true"
      style={{
        ...base,
        borderRadius: '50%',
        border: `${Math.round(size * 0.22)}px solid ${color}`,
        background: 'transparent',
      }}
    />
  );
}
