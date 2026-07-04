/**
 * S3 로그인 요구 모달. 담당: auth 에이전트.
 * 본체 testid: modal-login-required / 부품: btn-google-login
 *
 * PLAN §2-S3: 소형 모달(~440px), 마퀴 "CREDIT REQUIRED"(옐로), 코인 슬롯 픽토그램 +
 *   "온라인 게임은 로그인이 필요합니다!" + [SIGN IN WITH GOOGLE] / [취소하기(error 보더)].
 * SPEC QA-S3-01~04:
 *   로그인 성공 → 기존 유저면 openModal('online')로 S6 연속 진입 (모달 교체),
 *                최초 유저면 closeModal() 후 /onboarding.
 *   취소하기 / 배경 클릭 / ESC → 모달 닫기 (메인 유지).
 * 열림 조건: flow.modal === 'login-required' (전역 호스트 상시 마운트 — App.tsx).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../components';
import { closeModal, openModal, useFlow } from '../state/flow';
import { mockGoogleLogin } from '../state/session';
import './login-required.css';

/** 구글 G 로고 (원색 유지 — PLAN §2-S1과 동일 문법) */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginRequiredModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);
  const open = flow.modal === 'login-required';

  // 모달이 닫히면 로그인 진행 상태 리셋 (다음 오픈 대비)
  useEffect(() => {
    if (!open) setSigningIn(false);
  }, [open]);

  const handleGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    const dest = await mockGoogleLogin();
    if (dest === 'onboarding') {
      // 최초 유저 — 모달 닫고 닉네임 온보딩(S5)으로
      closeModal();
      navigate('/onboarding');
    } else {
      // 기존 유저 — 원래 의도였던 온라인 패널(S6)로 연속 진입 (QA-S3-03)
      openModal('online');
    }
  };

  return (
    <Modal
      open={open}
      onClose={signingIn ? undefined : closeModal}
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
        <button
          type="button"
          className="s3-google-btn"
          data-testid="btn-google-login"
          onClick={handleGoogleLogin}
          disabled={signingIn}
        >
          <GoogleLogo />
          <span>{signingIn ? 'CONNECTING…' : 'SIGN IN WITH GOOGLE'}</span>
        </button>
        <Button variant="danger" block onClick={closeModal} disabled={signingIn}>
          취소하기
        </Button>
      </div>
    </Modal>
  );
}
