/**
 * Modal — 오버레이 + 픽셀 모달 프리미티브 (PLAN §1.5).
 *
 * 배경: 검정 70% + 체커 도트 오버레이. 본체: 카드 스타일 + 8px 딥섀도 +
 * 상단 픽셀폰트 타이틀 바(--bg 띠). 등장은 스냅 팝(steps(2) 0.9→1).
 * ESC / 배경 클릭 = onClose (closeOnBackdrop=false로 끌 수 있음).
 *
 * 사용법:
 *   <Modal open={show} onClose={()=>setShow(false)} title="OPTIONS"
 *          testId="modal-settings" width={400}>
 *     ...본문...
 *   </Modal>
 *
 *   - testId는 "모달 본체" div에 붙는다 (QA 레지스트리: modal-login-required,
 *     modal-settings, modal-online, modal-matching)
 *   - open=false면 아무것도 렌더하지 않음
 *   - shake: 등장 시 1프레임 셰이크 (S3 거부감 연출용)
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  /** ESC/배경 클릭 시 호출. 닫기 버튼은 본문에서 직접 구현 */
  onClose?: () => void;
  /** 픽셀폰트 타이틀 바 텍스트 (영문 권장). 생략 시 타이틀 바 없음 */
  title?: ReactNode;
  /** 모달 본체 data-testid */
  testId?: string;
  /** 본체 폭 (px). 기본 400 */
  width?: number;
  /** 배경 클릭으로 닫기 허용 (기본 true) */
  closeOnBackdrop?: boolean;
  /** 등장 시 셰이크 연출 (기본 false) */
  shake?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  testId,
  width = 400,
  closeOnBackdrop = true,
  shake = false,
  children,
}: ModalProps) {
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
      className="px-overlay"
      onMouseDown={(e) => {
        if (closeOnBackdrop && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid={testId}
        className={['px-pop', shake ? 'px-shake' : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '2px solid var(--bg-deep)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        {title ? (
          <div
            className="px-font"
            style={{
              fontSize: 12,
              padding: '10px 16px',
              background: 'var(--bg)',
              borderBottom: '2px solid var(--bg-deep)',
              color: 'var(--text)',
            }}
          >
            {title}
          </div>
        ) : null}
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

export default Modal;
