/**
 * KeyCap — 완전 원형 클레이 키캡 (PLAN §1.5). 온스크린 패드용.
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 위에 화살표/아이콘, 아래 Baloo 2로 실제 배정 키(Q/W/U/I) 각인.
 * 소속 플레이어 tint 배경. pressed=true면 젤리 눌림 (실제 키 입력과 1:1 연동 —
 * 게임 화면이 keydown/keyup으로 pressed를 제어).
 *
 * 사용법:
 *   <KeyCap role="P1" keyLabel="W" icon="↑" pressed={p1UpPressed} />
 *   <KeyCap role="P2" keyLabel="U" icon="←" pressed={...} size={72} />
 */
import type { CSSProperties, ReactNode } from 'react';
import type { PlayerRole } from '@shared';

export interface KeyCapProps {
  role: PlayerRole;
  /** 각인할 실제 키 — 'Q' | 'W' | 'U' | 'I' (SPEC 행10 키셋) */
  keyLabel: string;
  /** 키캡 위 화살표/아이콘 (예: '↑', '↓', '←', '→', '⟲', 검/방패 이모지 등) */
  icon: ReactNode;
  /** 실제 키가 눌려 있는 동안 true → 젤리 눌림 */
  pressed?: boolean;
  /** 지름 px. 기본 64 */
  size?: number;
  style?: CSSProperties;
}

export default function KeyCap({
  role,
  keyLabel,
  icon,
  pressed = false,
  size = 64,
  style,
}: KeyCapProps) {
  const tint = role === 'P1' ? 'var(--p1-tint)' : 'var(--p2-tint)';
  const color = role === 'P1' ? 'var(--p1)' : 'var(--p2)';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        className={`jelly ${pressed ? 'is-pressed' : ''}`}
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: tint,
          boxShadow: pressed ? 'var(--shadow-clay-pressed)' : 'var(--shadow-clay-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.42,
          color,
          userSelect: 'none',
          ...style,
        }}
      >
        {icon}
      </div>
      <span
        className="num"
        style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink-muted)', letterSpacing: 1 }}
      >
        {keyLabel}
      </span>
    </div>
  );
}
