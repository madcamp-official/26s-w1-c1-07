/**
 * S3 로그인 요구 모달 (auth 에이전트 소유)
 *
 * 모달 testid: modal-login-required / 내부 testid: btn-google-login
 * SPEC S3 / PLAN §2-S3:
 *  - 열림 조건: flow.modal === 'login-required'
 *  - 상단 자물쇠 라벤더 클레이 오브젝트 + "온라인 게임은 로그인이 필요합니다!"
 *  - 로그인 성공: needsOnboarding이면 navigate('/onboarding'),
 *    아니면 openModal('online') — S6 연속 진입 (QA-S3-03)
 *  - 취소하기/배경/ESC: closeModal() → 메인 유지 (QA-S3-04)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { closeModal, getFlow, openModal, useFlow } from '../state/flow';
import { mockGoogleLogin } from '../state/session';
import { Button, Modal } from '../components';

/** 라벤더 자물쇠 클레이 오브젝트 */
function LockBadge() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 84,
        height: 84,
        borderRadius: '50%',
        background: 'var(--bg-lilac)',
        boxShadow: 'var(--shadow-clay-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
    >
      <svg width="46" height="46" viewBox="0 0 48 48">
        <path
          d="M15 22v-6a9 9 0 0 1 18 0v6"
          stroke="var(--lavender)"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="10" y="21" width="28" height="22" rx="9" fill="var(--lavender)" />
        <circle cx="24" cy="30" r="3.4" fill="#FFF9F4" />
        <rect x="22.4" y="31" width="3.2" height="6.5" rx="1.6" fill="#FFF9F4" />
      </svg>
    </div>
  );
}

export default function LoginRequiredModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const [loggingIn, setLoggingIn] = useState(false);

  if (flow.modal !== 'login-required') return null;

  const handleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const dest = await mockGoogleLogin();
      // 로그인 대기 중 사용자가 ESC/배경으로 모달을 닫았으면 연속 진입하지 않음
      if (getFlow().modal !== 'login-required') return;
      if (dest === 'onboarding') {
        // 최초 로그인 — 온보딩 우선 (ARCHITECTURE §2.2)
        closeModal();
        navigate('/onboarding');
      } else {
        // 기존 유저 — 원래 의도한 S6으로 연속 진입 (QA-S3-03)
        openModal('online');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <Modal testId="modal-login-required" onClose={closeModal} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, textAlign: 'center' }}>
        <LockBadge />
        <h2
          style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 400,
            fontSize: 24,
            lineHeight: 1.4,
            color: 'var(--ink)',
          }}
        >
          온라인 게임은
          <br />
          로그인이 필요합니다!
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button
            variant="google"
            data-testid="btn-google-login"
            onClick={handleLogin}
            disabled={loggingIn}
            style={loggingIn ? { opacity: 0.6 } : undefined}
          >
            {loggingIn ? '로그인 중…' : 'SIGN IN WITH GOOGLE'}
          </Button>
          <Button variant="cancel" onClick={closeModal}>
            취소하기
          </Button>
        </div>
      </div>
    </Modal>
  );
}
