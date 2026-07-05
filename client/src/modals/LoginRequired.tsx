/**
 * S3 로그인 요구 모달. 담당: auth 에이전트.
 * 본체 testid: modal-login-required / 부품: btn-google-login
 *
 * PLAN §2-S3: 소형 모달(~440px), 마퀴 "CREDIT REQUIRED"(옐로), 코인 슬롯 픽토그램 +
 *   "온라인 게임은 로그인이 필요합니다!" + [구글 로그인 버튼] / [취소하기(error 보더)].
 * SPEC QA-S3-01~04:
 *   로그인 성공 → 기존 유저면 openModal('online')로 S6 연속 진입 (모달 교체),
 *                최초 유저면 closeModal() 후 /onboarding.
 *   취소하기 / 배경 클릭 / ESC → 모달 닫기 (메인 유지).
 * 열림 조건: flow.modal === 'login-required' (전역 호스트 상시 마운트 — App.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../components';
import { closeModal, openModal, useFlow } from '../state/flow';
import { googleLogin } from '../state/session';
import { renderGoogleButton } from '../auth/google';
import './login-required.css';

export default function LoginRequiredModal() {
  const flow = useFlow();
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [loginError, setLoginError] = useState(false);
  const open = flow.modal === 'login-required';

  // 모달이 열릴 때마다 구글 버튼 렌더 (닫히면 cleanup으로 제거)
  useEffect(() => {
    if (!open) {
      setLoginError(false);
      return;
    }
    if (!googleBtnRef.current) return;
    return renderGoogleButton(googleBtnRef.current, async (credential) => {
      try {
        setLoginError(false);
        const dest = await googleLogin(credential);
        if (dest === 'onboarding') {
          // 최초 유저 — 모달 닫고 닉네임 온보딩(S5)으로
          closeModal();
          navigate('/onboarding');
        } else {
          // 기존 유저 — 원래 의도였던 온라인 패널(S6)로 연속 진입 (QA-S3-03)
          openModal('online');
        }
      } catch {
        setLoginError(true);
      }
    });
  }, [open, navigate]);

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
        <div className="s3-google-slot">
          <div ref={googleBtnRef} data-testid="btn-google-login" />
          {loginError && (
            <p className="s3-login-err" role="alert">
              로그인 실패 — 다시 시도해주세요
            </p>
          )}
        </div>
        <Button variant="danger" block onClick={closeModal}>
          취소하기
        </Button>
      </div>
    </Modal>
  );
}
