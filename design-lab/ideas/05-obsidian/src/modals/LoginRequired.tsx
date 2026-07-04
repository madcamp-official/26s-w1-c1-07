/**
 * S3 로그인 요구 모달 (modal-login-required). 소유: auth 에이전트.
 * SPEC S3 + PLAN §2.S3 — 마젠타 톱라인(유일한 경고 모달), OVERLINE "ACCESS RESTRICTED".
 *
 * props 계약 동결: { open; onClose; onLoggedIn } — App 분기와 맞물림.
 *
 * 로그인 성공 시 requestOnlinePanel()을 호출한 뒤 onLoggedIn(dest)를 부른다.
 *   - dest==='main'      → S2 마운트 시 온라인 패널(S6) 즉시 오픈 (QA-S3-03)
 *   - dest==='onboarding'→ 온보딩 완료 후 S2 마운트 시점에 신호가 소비되어
 *                          "원래 의도한 S6으로 이어서 진입"(SPEC S3 기능 2)이 성립한다.
 * 취소하기/ESC/배경 클릭 = onClose (QA-S3-04).
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import { loginWithGoogle } from '../state/session';
import { requestOnlinePanel } from '../state/flow';

export interface LoginRequiredProps {
  open: boolean;
  /** 취소하기/ESC/배경 클릭 */
  onClose: () => void;
  /** mock 로그인 완료 후 호출 — 'onboarding'이면 /onboarding, 'main'이면 그대로(세션 전환) */
  onLoggedIn: (dest: 'onboarding' | 'main') => void;
}

export default function LoginRequired({ open, onClose, onLoggedIn }: LoginRequiredProps) {
  const [busy, setBusy] = useState(false);

  // 다시 열릴 때 로그인 진행 상태 초기화
  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  const handleLogin = async () => {
    if (busy) return;
    setBusy(true);
    const dest = await loginWithGoogle();
    // 로그인 가드를 통과했으므로 원래 의도(온라인 패널)를 이어서 연다
    requestOnlinePanel();
    onLoggedIn(dest);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      topline="magenta"
      overline="ACCESS RESTRICTED"
      testId="modal-login-required"
      width={380}
    >
      <p className="auth-guard-body">온라인 게임은 로그인이 필요합니다!</p>
      <div className="auth-guard-actions">
        <Button
          variant="google"
          testId="btn-google-login"
          onClick={handleLogin}
          disabled={busy}
          aria-busy={busy}
        />
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          취소하기
        </Button>
      </div>
    </Modal>
  );
}
