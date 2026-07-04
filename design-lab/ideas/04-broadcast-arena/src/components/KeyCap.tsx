/**
 * KeyCap — 온스크린 키 인디케이터 (인게임 공통 셸, PLAN §2).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 실제 배정 키(q/w, u/i)를 각인하고, 입력마다 팀 컬러로 점등 (SPEC Q2: 패드에 배정 키 표기).
 *
 * 사용법 (게임 화면에서):
 *   <KeyCap keyLabel="q" hint="↓" team="p1" active={pressed.q} />
 *   <KeyCap keyLabel="w" hint="발사" team="p1" active={pressed.w} size={56} />
 *   active는 attachKeyboardAdapter의 down/up 이벤트로 화면이 관리.
 */
import type { CSSProperties } from 'react';

export interface KeyCapProps {
  /** 각인할 실제 키 문자 ('q' 등) — 대문자로 표기됨 */
  keyLabel: string;
  /** 키 아래 보조 표기 (화살표 '↓' 또는 '발사' 등). 생략 가능 */
  hint?: string;
  /** 팀 컬러 점등 색 */
  team: 'p1' | 'p2';
  /** 현재 눌림(점등) 여부 */
  active?: boolean;
  /** 한 변 px. 기본 48 */
  size?: number;
  style?: CSSProperties;
}

export default function KeyCap({ keyLabel, hint, team, active = false, size = 48, style }: KeyCapProps) {
  const teamVar = team === 'p1' ? 'var(--p1)' : 'var(--p2)';
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: active ? `2px solid ${teamVar}` : '1px solid var(--line)',
          background: active ? teamVar : 'var(--surface)',
          color: active ? '#fff' : 'var(--ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: size * 0.4,
          boxShadow: active ? `0 0 12px ${teamVar}55` : '0 2px 0 var(--line)',
          translate: active ? '0 1px' : '0 0',
          transition: 'all 80ms var(--ease)',
          userSelect: 'none',
        }}
      >
        {keyLabel.toUpperCase()}
      </span>
      {hint && (
        <span className="label" style={{ color: 'var(--ink-sub)', fontSize: 10 }}>
          {hint}
        </span>
      )}
    </span>
  );
}
