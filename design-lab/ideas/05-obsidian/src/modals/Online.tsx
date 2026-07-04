/**
 * S6 온라인 게임하기 패널 (modal-online). 소유: lobby 에이전트.
 * SPEC S6 + PLAN §2.S6 참조.
 * 필요 testid: modal-online(자동), btn-quickstart, btn-code-create,
 *              room-code-display, input-code, btn-code-join
 * 동작: 빠른 시작 → onQuickstart(→ S7) / 코드 생성 → 표시+복사 → 2.5초 후
 *       mock 상대 입장 → startOnlineMatch() → VS 와이프 → 인게임 /
 *       코드 입력+확인(형식 검증) → onJoinCode(→ S7) / 톱니 → onOpenSettings(S4 재사용) /
 *       배경 클릭 닫기. 코드 검증에 분반 조건 없음 (SPEC S6-7).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../components';
import { gamePath, getFlow, startOnlineMatch } from '../state/flow';
import { getSession } from '../state/session';
import { VSWipe } from './Matching';
import '../screens/lobby.css';

export interface OnlineProps {
  open: boolean;
  onClose: () => void;
  /** 빠른 시작 → S7 매칭 모달 */
  onQuickstart: () => void;
  /** 코드 입력 확인(형식 통과) → S7 매칭 플로우 */
  onJoinCode: () => void;
  /** 방 설정 톱니 → S4 설정 모달 재사용 */
  onOpenSettings: () => void;
}

const CODE_LEN = 6;
const OPPONENT_JOIN_MS = 2500;
const WIPE_MS = 1100;

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.3 5.3l2.2 2.2M16.5 16.5l2.2 2.2M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2" />
    </svg>
  );
}

/** 클립보드 복사 (secure context 실패 시 textarea 폴백) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function Online({
  open,
  onClose,
  onQuickstart,
  onJoinCode,
  onOpenSettings,
}: OnlineProps) {
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [vs, setVs] = useState<{ me: string; opponent: string } | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  // 닫힐 때: 일회성 상태 리셋 + 대기 중인 mock 입장 타이머 정리 (닫힘=취소)
  useEffect(() => {
    if (!open) {
      clearTimers();
      setCode(null);
      setCopied(false);
      setJoinValue('');
      setJoinError(null);
      setVs(null);
    }
  }, [open]);
  useEffect(() => clearTimers, []);

  const createCode = () => {
    const next = String(Math.floor(10 ** (CODE_LEN - 1) + Math.random() * 9 * 10 ** (CODE_LEN - 1)));
    setCode(next);
    setCopied(false);
    // mock: 코드 생성 n초 후 상대 입장 → VS 와이프 → 인게임 (QA-S6-06)
    timersRef.current.push(
      window.setTimeout(() => {
        const gameId = startOnlineMatch();
        setVs({
          me: getSession().user?.nickname ?? 'YOU',
          opponent: getFlow().opponent?.nickname ?? 'CHALLENGER',
        });
        timersRef.current.push(window.setTimeout(() => navigate(gamePath(gameId)), WIPE_MS));
      }, OPPONENT_JOIN_MS),
    );
  };

  const copy = async () => {
    if (!code) return;
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      timersRef.current.push(window.setTimeout(() => setCopied(false), 1800));
    }
  };

  const join = () => {
    const v = joinValue.trim();
    if (!/^\d{4,}$/.test(v)) {
      setJoinError('숫자 4자리 이상의 코드를 입력하세요');
      return;
    }
    setJoinError(null);
    onJoinCode();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        overline="PROTOCOL // ONLINE"
        title="온라인 게임하기"
        testId="modal-online"
        width={560}
      >
        {/* 히어로: 빠른 시작 (QA-S6-03) */}
        <Button
          variant="primary"
          overline="QUICK MATCH"
          testId="btn-quickstart"
          className="onl-quick"
          onClick={onQuickstart}
        >
          빠른 시작
        </Button>

        <div className="onl-divider">
          <span className="overline">{'// PRIVATE ROOM'}</span>
        </div>
        <div className="onl-section-title">게임 만들기 / 참가하기</div>

        {/* 1행: 코드 생성 + 표시 + 복사 + 방 설정 톱니 (QA-S6-02/04/05/08) */}
        <div className="onl-row">
          <Button
            variant="secondary"
            testId="btn-code-create"
            onClick={createCode}
            disabled={code !== null}
          >
            코드 생성하기
          </Button>
          <div
            className={`onl-code${code ? ' onl-code--set' : ''}`}
            data-testid="room-code-display"
            aria-label="방 코드"
          >
            {code ?? '— — — — — —'}
          </div>
          <Button
            variant="secondary"
            disabled={!code}
            onClick={copy}
            style={
              copied
                ? { padding: '8px 14px', borderColor: 'var(--ok)', color: 'var(--ok)' }
                : { padding: '8px 14px' }
            }
          >
            {copied ? '복사됨' : '복사'}
          </Button>
          <button
            type="button"
            className="hexbtn"
            title="방 설정"
            aria-label="방 설정"
            onClick={onOpenSettings}
          >
            <span className="hexbtn-border hex" />
            <span className="hexbtn-face hex">
              <GearIcon />
            </span>
          </button>
        </div>

        {/* 2행: 코드 입력 + 확인 (QA-S6-07) — 분반 조건 없음 (SPEC S6-7) */}
        <div className="onl-row" style={{ marginBottom: 0 }}>
          <span className="onl-row-label">코드 입력하기</span>
          <input
            className={`input onl-code-input num${joinError ? ' input--error' : ''}`}
            data-testid="input-code"
            placeholder="상대의 방 코드"
            inputMode="numeric"
            maxLength={11}
            value={joinValue}
            onChange={(e) => {
              setJoinValue(e.target.value);
              if (joinError) setJoinError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') join();
            }}
          />
          <Button variant="primary" testId="btn-code-join" onClick={join}>
            확인
          </Button>
        </div>
        {joinError && <div className="field-error">{joinError}</div>}
      </Modal>
      {open && vs && <VSWipe me={vs.me} opponent={vs.opponent} />}
    </>
  );
}
