/**
 * S3 로그인 요구 모달 (canonical 16:1276). 담당: auth 에이전트.
 *
 * PLAN §2 S3 "BREAKING 스타일 알림 카드" — LIVE 레드 스큐 탭 "SIGN-IN REQUIRED",
 * 문구 "온라인 게임은 로그인이 필요합니다!", Google 버튼 + secondary "취소하기".
 * ESC/배경 클릭 = 취소 (QA-S3-04).
 *
 * 로그인 성공 시(QA-S3-03):
 *  - 기존 유저('main') → openModal('online')로 S6 연속 진입 (S2 위에 열림)
 *  - 최초 로그인('onboarding') → 모달 닫고 navigate('/onboarding')
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button } from '../components';
import { useFlow, closeModal, openModal } from '../state/flow';
import { mockGoogleLogin } from '../state/session';

export default function LoginRequiredModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  if (flow.modal !== 'login-required') return null;

  const handleGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    const dest = await mockGoogleLogin();
    setSigningIn(false);
    if (dest === 'main') {
      // 기존 유저 — 원래 의도한 온라인 패널(S6)로 연속 진입
      openModal('online');
    } else {
      // 최초 로그인 — 닉네임 온보딩(S5) 먼저
      closeModal();
      navigate('/onboarding');
    }
  };

  const handleCancel = () => {
    if (signingIn) return;
    closeModal();
  };

  return (
    <Modal
      testId="modal-login-required"
      tab="SIGN-IN REQUIRED"
      tabTone="live"
      onClose={handleCancel}
      width={420}
    >
      <p
        style={{
          margin: '2px 0 20px',
          fontSize: 17,
          fontWeight: 700,
          color: 'var(--ink)',
        }}
      >
        온라인 게임은 로그인이 필요합니다!
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
        <Button
          variant="google"
          disabled={signingIn}
          onClick={handleGoogleLogin}
          style={{ justifyContent: 'center' }}
        >
          {signingIn ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}
        </Button>
        <Button variant="secondary" disabled={signingIn} onClick={handleCancel}>
          취소하기
        </Button>
      </div>
    </Modal>
  );
}
