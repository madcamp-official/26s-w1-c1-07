/**
 * KeyCap — 온스크린 키캡 (radius 6px, 플레이어색 보더, 아이콘 + 키 문자) (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * SPEC Q2: 패드에 실제 배정 키(q/w/u/i)를 표기해야 한다.
 * lit=true로 입력 순간 램프 점등(즉발 점등 → 80ms 후 소등은 호출측 state로).
 *
 * 사용법 (게임 에이전트):
 *   <KeyCap role="P1" keyChar="Q" icon="▼" lit={qPressed} label="내리기" />
 *   <KeyCap role="P2" keyChar="I" icon="▶" lit={iPressed} />
 *
 * 입력 순간 점등 훅(useKeyLamp)도 함께 제공:
 *   const [lit, flash] = useKeyLamp();  // flash() 호출 시 80ms 점등
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerRole } from '@/shell';
import './keycap.css';

export interface KeyCapProps {
  role: PlayerRole;
  /** 키 문자 (Q/W/U/I) — Press Start 2P로 표기 */
  keyChar: string;
  /** 키 위 화살표/아이콘 (▲▼◀▶ ⚔ 등) */
  icon?: string;
  /** 입력 순간 점등 */
  lit?: boolean;
  /** 아이콘 아래 작은 한글 라벨 (선택) */
  label?: string;
  className?: string;
}

export function KeyCap({ role, keyChar, icon, lit = false, label, className = '' }: KeyCapProps) {
  const cls = [
    'nc-keycap',
    role === 'P1' ? 'nc-keycap--p1' : 'nc-keycap--p2',
    lit ? 'lit' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      {icon && (
        <span className="nc-keycap__icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="nc-keycap__char font-arcade">{keyChar}</span>
      {label && <span className="nc-keycap__label">{label}</span>}
    </div>
  );
}

/**
 * 입력 순간 램프 점등 훅 — flash() 호출 시 80ms 동안 lit=true (§1.4 키 입력 피드백).
 */
export function useKeyLamp(durationMs = 80): [boolean, () => void] {
  const [lit, setLit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(() => {
    setLit(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLit(false), durationMs);
  }, [durationMs]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [lit, flash];
}
