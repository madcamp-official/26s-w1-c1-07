/**
 * Modal — 라일락 딤 오버레이 + '뿅' 스프링 등장 클레이 카드 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 사용법 (모달 파일에서):
 *   const flow = useFlow();
 *   if (flow.modal !== 'settings') return null;
 *   return (
 *     <Modal testId="modal-settings" onClose={closeModal} width={420}>
 *       ...내용...
 *     </Modal>
 *   );
 *
 * - 배경 클릭 + ESC → onClose 호출 (SPEC 관례). 닫기를 막아야 하면 onClose 생략.
 * - testId는 모달 본체(카드)에 부착 — QA가 modal-* testid로 찾는다.
 */
import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface ModalProps {
  /** data-testid — 'modal-settings' 등. 본체 카드에 부착 */
  testId?: string;
  /** 배경 클릭/ESC 시 호출. 생략하면 그 경로로는 닫히지 않음 */
  onClose?: () => void;
  /** 본체 max-width (px). 기본 440 */
  width?: number;
  /** 본체 배경 톤 — 기본 surface, 온라인 패널은 'sky' */
  tone?: 'surface' | 'sky';
  style?: CSSProperties;
  children: ReactNode;
}

export default function Modal({
  testId,
  onClose,
  width = 440,
  tone = 'surface',
  style,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* 딤: 플럼 반투명 + 살짝 라일락 (PLAN §1.5) */
        background:
          'linear-gradient(rgba(183, 156, 240, 0.12), rgba(183, 156, 240, 0.12)), var(--dim)',
        padding: 24,
      }}
    >
      <div
        data-testid={testId}
        className="pop-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tone === 'sky' ? 'var(--bg-sky)' : 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-clay-lg)',
          padding: 32,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflowY: 'auto',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
