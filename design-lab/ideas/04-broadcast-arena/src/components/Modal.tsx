/**
 * Modal — 네이비 딤 오버레이 + 로워서드 와이프 인 방송 카드 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 카드 상단에 스큐 헤더 탭(성격 구분: 안내=navy, 경고=live).
 *
 * 사용법 (모달 파일에서):
 *   const flow = useFlow();
 *   if (flow.modal !== 'settings') return null;
 *   return (
 *     <Modal testId="modal-settings" tab="MATCH RULES" onClose={closeModal} width={440}>
 *       ...내용...
 *     </Modal>
 *   );
 *
 * - 배경 클릭 + ESC → onClose 호출 (SPEC 관례). 닫기를 막아야 하면 onClose 생략.
 * - testId는 모달 본체(카드)에 부착 — QA가 modal-* testid로 찾는다.
 */
import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import SkewTab from './SkewTab';
import type { SkewTabTone } from './SkewTab';

export interface ModalProps {
  /** data-testid — 'modal-settings' 등. 본체 카드에 부착 */
  testId?: string;
  /** 배경 클릭/ESC 시 호출. 생략하면 그 경로로는 닫히지 않음 */
  onClose?: () => void;
  /** 본체 max-width (px). 기본 440 */
  width?: number;
  /** 스큐 헤더 탭 라벨 (예: 'MATCH RULES') */
  tab?: ReactNode;
  /** 탭 색 — 안내 navy(기본) / 경고 live */
  tabTone?: SkewTabTone;
  style?: CSSProperties;
  children: ReactNode;
}

export default function Modal({
  testId,
  onClose,
  width = 440,
  tab,
  tabTone = 'navy',
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
        background: 'var(--dim)',
        padding: 24,
      }}
    >
      <div
        data-testid={testId}
        className="wipe-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow)',
          padding: 28,
          paddingTop: tab != null ? 22 : 28,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          ...style,
        }}
      >
        {/* overflow는 카드가 아니라 내부 콘텐츠 래퍼가 담당 —
            카드에 overflowY:auto를 주면 marginTop:-34로 상단에 걸치는
            SkewTab이 클리핑되어 탭 글자 위쪽이 잘린다 (QA round1 V-1). */}
        {tab != null && (
          <div style={{ flex: 'none', marginTop: -34, marginBottom: 18 }}>
            <SkewTab tone={tabTone}>{tab}</SkewTab>
          </div>
        )}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
