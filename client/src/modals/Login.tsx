/**
 * 로그인 모달 — 로스터 로그인 2단계 (docs/AUTH.md).
 * 본체 testid: modal-login / 부품: btn-group-<분반명>, btn-member-<닉네임>
 *
 * 1단계 "몇 분반인가요?": 1분반/2분반/3분반 버튼 (GET /api/roster 로 서버 명단 로드)
 * 2단계 "유저 선택":      선택한 분반의 멤버 버튼 그리드 — 누르면 즉시 로그인 (인증 절차 없음)
 *
 * 진입 경로:
 *   openLoginModal()          — S1 "로그인" 버튼 (성공 시 모달 닫힘 → MainGate가 S2로 전환)
 *   openLoginModal('online')  — S3 로그인 요구 모달 경유 (성공 시 온라인 패널로 연속 진입 — QA-S3-03)
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import { closeModal, openModal, useFlow } from '../state/flow';
import { fetchRoster, loginAs } from '../state/session';
import type { RosterGroup } from '../state/session';
import './login.css';

/** 로그인 성공 후 이어갈 동작 — login-required 경유 시 'online' */
let afterLogin: 'online' | null = null;

/** 로그인 모달 열기 (next: 성공 후 열 모달) */
export function openLoginModal(next?: 'online'): void {
  afterLogin = next ?? null;
  openModal('login');
}

export default function LoginModal() {
  const flow = useFlow();
  const open = flow.modal === 'login';

  const [groups, setGroups] = useState<RosterGroup[] | null>(null);
  const [picked, setPicked] = useState<RosterGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 모달이 열릴 때 명단 로드, 닫히면 상태 리셋
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setError(null);
      setBusy(false);
      return;
    }
    let alive = true;
    setGroups(null);
    fetchRoster()
      .then((gs) => {
        if (alive) setGroups(gs);
      })
      .catch(() => {
        if (alive) setError('명단을 불러오지 못했습니다 — 서버 연결을 확인해주세요');
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const handleMember = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await loginAs(userId);
    setBusy(false);
    if (!ok) {
      setError('로그인 실패 — 다시 시도해주세요');
      return;
    }
    if (afterLogin === 'online') openModal('online');
    else closeModal();
    afterLogin = null;
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : closeModal}
      marquee={picked ? '유저 선택' : 'WHO ARE YOU?'}
      accentColor="var(--accent)"
      testId="modal-login"
      width={picked ? 560 : 440}
    >
      {!picked ? (
        // ── 1단계: 분반 선택 ──
        <div className="lg-body">
          <p className="lg-title font-display">몇 분반인가요?</p>
          {error && (
            <p className="lg-err" role="alert">
              {error}
            </p>
          )}
          {!groups && !error && <p className="lg-loading font-arcade">LOADING…</p>}
          <div className="lg-groups">
            {groups?.map((g) => (
              <Button
                key={g.id}
                variant="primary"
                block
                data-testid={`btn-group-${g.name}`}
                onClick={() => setPicked(g)}
              >
                {g.name}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        // ── 2단계: 멤버 선택 ──
        <div className="lg-body">
          <p className="lg-title font-display">
            <span className="c-accent">{picked.name}</span> — 자신을 선택하세요
          </p>
          {error && (
            <p className="lg-err" role="alert">
              {error}
            </p>
          )}
          <div className="lg-members">
            {picked.members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="lg-member font-display"
                data-testid={`btn-member-${m.nickname}`}
                disabled={busy}
                onClick={() => handleMember(m.id)}
              >
                {m.nickname}
              </button>
            ))}
          </div>
          <Button variant="tertiary" block onClick={() => setPicked(null)} disabled={busy}>
            ← 분반 다시 선택
          </Button>
        </div>
      )}
    </Modal>
  );
}
