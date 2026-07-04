/**
 * Modal — 오버레이 + 네온 패널 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * - 오버레이 rgba(13,2,33,.82) (스캔라인은 전역 .crt-overlay가 이미 덮음)
 * - 본체: --surface + 2px 포인트색 보더 + 코너 브래킷 + 상단 마퀴 스트립 제목
 * - 등장 sign-on 플리커 (§1.4)
 * - 배경 클릭/ESC → onClose (SPEC 관례). 닫기 불가 모달은 onClose 생략.
 *
 * 사용법:
 *   <Modal open={flow.modal === 'settings'} onClose={closeModal}
 *          marquee="설정 — OPERATOR MENU" accentColor="var(--accent)"
 *          testId="modal-settings" width={520}>
 *     ...본문...
 *   </Modal>
 *
 * testId는 모달 "본체" 요소에 붙는다 (QA 레지스트리: modal-*).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import './modal.css';

export interface ModalProps {
  open: boolean;
  /** 배경 클릭/ESC 시 호출. 생략하면 배경/ESC로 닫히지 않음 */
  onClose?: () => void;
  /** 상단 마퀴 스트립 제목 */
  marquee?: ReactNode;
  /** 보더·브래킷·마퀴 색 (기본 --accent2) */
  accentColor?: string;
  /** 본체 data-testid (QA 레지스트리 modal-*) */
  testId?: string;
  /** 본체 max-width (px, 기본 480) */
  width?: number;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  marquee,
  accentColor = 'var(--accent2)',
  testId,
  width = 480,
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
      className="nc-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="nc-modal corner-brackets anim-sign-on"
        style={
          {
            '--modal-accent': accentColor,
            '--bracket-color': accentColor,
            maxWidth: width,
          } as React.CSSProperties
        }
        data-testid={testId}
        role="dialog"
        aria-modal="true"
      >
        <i className="cb2" aria-hidden />
        {marquee !== undefined && (
          <div className="marquee-strip" style={{ color: accentColor }}>
            <span
              className="lamp lit"
              style={{ '--lamp-color': accentColor } as React.CSSProperties}
            />
            <span className="marquee-title glow-text">{marquee}</span>
            <span
              className="lamp lit"
              style={{ '--lamp-color': accentColor } as React.CSSProperties}
            />
          </div>
        )}
        <div className="nc-modal__body">{children}</div>
      </div>
    </div>
  );
}
