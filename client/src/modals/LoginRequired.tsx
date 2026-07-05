/**
 * S3 로그인 요구 모달. 담당: auth 에이전트.
 * 본체 testid: modal-login-required / 부품: btn-login
 *
 * PLAN §2-S3: 소형 모달(~440px), 마퀴 "CREDIT REQUIRED"(옐로), 코인 슬롯 픽토그램 +
 *   "온라인 게임은 로그인이 필요합니다!" + [로그인] / [취소하기(error 보더)].
 * 로그인 버튼 → 로스터 로그인 모달(분반 → 멤버 선택)로 교체 진입.
 *   로그인 성공 시 원래 의도였던 온라인 패널(S6)로 연속 진입 (QA-S3-03).
 * 취소하기 / 배경 클릭 / ESC → 모달 닫기 (메인 유지).
 * 열림 조건: flow.modal === 'login-required' (전역 호스트 상시 마운트 — App.tsx).
 */
import { Button, Modal } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { openLoginModal } from './Login';
import './login-required.css';

export default function LoginRequiredModal() {
  const flow = useFlow();
  const open = flow.modal === 'login-required';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="CREDIT REQUIRED"
      accentColor="var(--accent)"
      testId="modal-login-required"
      width={440}
    >
      <div className="s3-body">
        <div className="s3-coinslot" aria-hidden>
          <i />
        </div>
        <p className="s3-msg font-display">온라인 게임은 로그인이 필요합니다!</p>
        <Button variant="primary" block data-testid="btn-login" onClick={() => openLoginModal('online')}>
          로그인
        </Button>
        <Button variant="danger" block onClick={closeModal}>
          취소하기
        </Button>
      </div>
    </Modal>
  );
}
