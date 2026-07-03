/**
 * S3. 로그인 요구 모달 (modal-login-required)
 * [OWNER: auth 에이전트] — 이 파일은 auth 에이전트만 수정한다.
 *
 * 구현 (SPEC S3 / PLAN §2-S3):
 *  - "온라인 게임은 로그인이 필요합니다!" + SIGN IN WITH GOOGLE(btn-google-login) + 취소하기
 *  - 로그인 성공 시: openModal('online') — S6이 곧바로 열림 (QA-S3-03)
 *    (mockGoogleLogin()이 'onboarding'을 반환하면 navigate('/onboarding') 우선)
 *  - 취소하기/ESC/배경 클릭: closeModal() (S1 유지)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Stamp } from '../components';
import { useFlow, closeModal, openModal } from '../state/flow';
import { mockGoogleLogin } from '../state/session';
import { GoogleG } from '../screens/MainLoggedOut';

export default function LoginRequiredModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  const onGoogleLogin = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const dest = await mockGoogleLogin();
      if (dest === 'onboarding') {
        closeModal();
        navigate('/onboarding');
      } else {
        // 기존 유저: 원래 의도했던 온라인 패널(S6)로 곧장 (QA-S3-03)
        openModal('online');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <Modal
      open={flow.modal === 'login-required'}
      title="HOLD UP!"
      onClose={closeModal}
      testId="modal-login-required"
      width={440}
    >
      <style>{S3_CSS}</style>
      <div className="s3-body">
        <div className="s3-stamp-row">
          <Stamp tone="error" tilt={-8} fontSize={30}>
            GUEST
          </Stamp>
        </div>
        <p className="s3-message font-display">온라인 게임은 로그인이 필요합니다!</p>
        <div className="s3-actions">
          <Button
            data-testid="btn-google-login"
            onClick={onGoogleLogin}
            disabled={signingIn}
            aria-label="SIGN IN WITH GOOGLE"
            style={{ width: '100%' }}
          >
            <GoogleG />
            <span className="s3-google-label">
              {signingIn ? 'SIGNING IN…' : 'SIGN IN WITH GOOGLE'}
            </span>
          </Button>
          <Button variant="danger" onClick={closeModal} style={{ width: '100%' }}>
            취소하기
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const S3_CSS = `
.s3-body {
  padding: 26px 28px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.s3-stamp-row {
  margin-top: 4px;
}
.s3-message {
  font-size: 26px;
  line-height: 1.35;
  text-align: center;
  word-break: keep-all;
}
.s3-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}
.s3-google-label {
  font-size: 15px;
  letter-spacing: 0.02em;
}
`;
