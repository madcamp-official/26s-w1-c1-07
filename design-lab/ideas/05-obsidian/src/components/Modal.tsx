/**
 * Modal — 오버레이 포함 모달 프리미티브 (PLAN §1.5).
 * 배경 rgba(6,8,12,.78) + blur(6px), 본체 코너컷 surface + 1px 발광 톱라인.
 *
 * props:
 *   open            — false면 아무것도 렌더하지 않음
 *   onClose         — 배경 클릭/ESC 시 호출 (생략 시 닫히지 않음)
 *   closeOnBackdrop — 기본 true. false면 배경 클릭 무시 (예: S7 매칭 모달)
 *   topline         — 'cyan'(기본) | 'magenta'(경고 문맥 — S3 전용)
 *   overline        — 좌상단 OVERLINE (예: "PROTOCOL // ONLINE")
 *   title           — 한글 제목 (Noto Sans KR 700)
 *   width           — 본체 폭 px (기본 420)
 *   testId          — data-testid (모달 본체에 부착)
 *
 * 사용 예:
 *   <Modal open={open} onClose={close} overline="MATCH CONFIG" title="설정"
 *          testId="modal-settings" width={420}>...</Modal>
 */
import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  topline?: 'cyan' | 'magenta';
  overline?: string;
  title?: string;
  width?: number;
  testId?: string;
  children?: ReactNode;
}

export function Modal({
  open,
  onClose,
  closeOnBackdrop = true,
  topline = 'cyan',
  overline,
  title,
  width = 420,
  testId,
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
      className="modal-backdrop"
      onClick={() => {
        if (closeOnBackdrop && onClose) onClose();
      }}
    >
      <div
        className={`modal${topline === 'magenta' ? ' modal--warn' : ''}`}
        style={{ width }}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? overline}
      >
        {overline && (
          <div className="overline" style={{ marginBottom: 6 }}>
            {overline}
          </div>
        )}
        {title && (
          <h2 style={{ fontSize: 20, marginBottom: 18 }}>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
