/**
 * Toast — 하단 중앙 알약 토스트 ("코드 복사됨!" 등, PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법:
 *   const { toast, showToast } = useToast();
 *   ...
 *   <Button onClick={() => { copy(); showToast('코드 복사됨!'); }}>복사</Button>
 *   <Toast message={toast} />   // 화면/모달 루트 아무 데나 1회 렌더
 *
 * 뿅 등장 → 2초 후 자동 소멸. message가 null이면 렌더 안 함.
 */
import { useEffect, useRef, useState } from 'react';

const TOAST_MS = 2000;

export function useToast(): { toast: string | null; showToast: (msg: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return {
    toast,
    showToast(msg: string) {
      if (timer.current) clearTimeout(timer.current);
      setToast(msg);
      timer.current = setTimeout(() => setToast(null), TOAST_MS);
    },
  };
}

export default function Toast({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <div
      className="pop-in"
      role="status"
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        background: 'var(--ink)',
        color: 'var(--surface)',
        borderRadius: 24,
        padding: '10px 24px',
        fontSize: 16,
        boxShadow: 'var(--shadow-clay-lg)',
        pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
}
