/**
 * Toast — 스큐 네이비 칩 토스트 ("복사됨" 등 짧은 피드백).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법:
 *   const { toast, showToast } = useToast();
 *   ...
 *   <button onClick={() => { copy(); showToast('복사됨'); }}>복사</button>
 *   {toast}   // JSX 트리 아무 곳에나 렌더 (fixed 포지션)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const TOAST_MS = 1600;

export default function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="wipe-in"
      style={{
        position: 'fixed',
        bottom: 'calc(var(--ticker-h) + 20px)',
        left: '50%',
        transform: 'translateX(-50%) skewX(var(--skew))',
        background: 'var(--strip)',
        color: '#fff',
        padding: '8px 22px',
        boxShadow: 'var(--shadow)',
        zIndex: 200,
      }}
    >
      <span className="unskew" style={{ fontSize: 14, fontWeight: 500 }}>
        {message}
      </span>
    </div>
  );
}

export function useToast(): { toast: ReactNode; showToast: (msg: string) => void } {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast: msg ? <Toast message={msg} /> : null, showToast };
}
