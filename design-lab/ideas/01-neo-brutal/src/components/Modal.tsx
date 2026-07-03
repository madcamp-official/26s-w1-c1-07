/**
 * Modal — 오버레이 포함 모달 (PLAN §1.5).
 * rgba(10,10,10,0.55) 오버레이 + 4px 보더/10px 섀도 본체 + 상단 검정 타이틀 바(장식 사각 3개).
 * 등장 scale(0.95)→1 스냅은 theme.css의 .modal-body가 처리.
 *
 * 사용법:
 *   <Modal open={flow.modal === 'settings'} title="설정 / RULES"
 *          onClose={closeModal} testId="modal-settings" width={480}>
 *     ...본문...
 *   </Modal>
 *
 * - open=false면 아무것도 렌더하지 않는다.
 * - onClose: 배경 클릭 + ESC에서 호출. 배경 클릭으로 닫히면 안 되는 모달(S7 접속 중 등)은
 *   onClose를 생략하면 된다.
 * - testId는 모달 본체(data-testid)에 붙는다 (modal-* 레지스트리).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  /** 상단 검정 타이틀 바 텍스트 */
  title: string;
  /** 배경 클릭/ESC 닫기 콜백. 생략 시 배경으로 닫히지 않음 */
  onClose?: () => void;
  /** data-testid (modal-login-required 등) */
  testId: string;
  /** 본체 폭 (px). 기본 440 */
  width?: number;
  children?: ReactNode;
}

const DECO_COLORS = ['var(--p1)', 'var(--p2)', 'var(--highlight)'];

export function Modal({ open, title, onClose, testId, width = 440, children }: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="modal-body"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <div className="title-strip">
          <span>{title}</span>
          <span className="title-strip__deco" aria-hidden>
            {DECO_COLORS.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
