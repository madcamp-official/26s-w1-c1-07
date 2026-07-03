/**
 * KeyCap — 온스크린 키캡 (PLAN §1.5). 실제 배정 키 표기(SPEC Q2: q/w, u/i).
 * pressed=true면 translateY(4px)+섀도 소멸 (다운 즉발 / 업 80ms — theme.css).
 *
 * 사용법 (게임 화면에서 keydown/keyup으로 pressed 상태 관리):
 *   <KeyCap side="P1" keyChar="q" icon="↓" pressed={pressed.has('q')} />
 *   <KeyCap side="P2" keyChar="i" icon="→" pressed={pressed.has('i')} />
 */
import type { CSSProperties } from 'react';

export interface KeyCapProps {
  /** P1=블루 틴트, P2=핑크 틴트 */
  side: 'P1' | 'P2';
  /** 실제 물리 키 문자 (q/w/u/i) — 대문자로 표기됨 */
  keyChar: string;
  /** 키 위 화살표/아이콘 라벨 (↓ ↑ ← → ⚔ 🛡 등) */
  icon?: string;
  pressed?: boolean;
  style?: CSSProperties;
}

export function KeyCap({ side, keyChar, icon, pressed = false, style }: KeyCapProps) {
  const sideClass = side === 'P1' ? 'keycap--p1' : 'keycap--p2';
  return (
    <span className={`keycap ${sideClass}${pressed ? ' keycap--pressed' : ''}`} style={style}>
      {icon && <span className="keycap__icon">{icon}</span>}
      <span className="keycap__key">{keyChar}</span>
    </span>
  );
}
