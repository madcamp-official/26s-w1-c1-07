/**
 * S6. 온라인 게임하기 패널 (modal-online) — 멀티플레이 로비 카트리지 (PLAN §2 S6)
 * [소유: lobby 에이전트]
 *
 * - btn-quickstart → Matching 모달(S7) (내부 렌더 — Online → Matching 배선)
 * - btn-code-create → 11자리 숫자 코드 생성(SPEC Q9) → room-code-display 옐로 표시
 *   + 복사(clipboard, COPIED! 토스트, 미생성 시 disabled) + 톱니 → Settings(S4) 재사용
 * - input-code + btn-code-join → 숫자 형식 검증 후 매칭 플로우(S7)
 * - 코드 생성 4초 후 가짜 상대 입장 → startMatch('online') + 인게임 (QA-S6-06)
 * - 배경 클릭 → onClose() (메인 복귀), 닫힐 때 타이머/상태 정리
 * - 코드에 분반 검증 없음 (SPEC S6 기능7 "코드는 분반 X")
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Modal } from '../components';
import { pickRandomGameId, startMatch } from '../state/flow';
import Matching from './Matching';
import Settings from './Settings';
import './Online.css';

export interface OnlineProps {
  open: boolean;
  onClose: () => void;
}

const CODE_LENGTH = 11; // 와이어프레임 16:1354 "34823501249" 11자리 그대로 (SPEC Q9)
const FAKE_JOIN_MS = 4000; // 코드 생성 후 가짜 상대 입장까지

function generateCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => Math.floor(Math.random() * 10)).join('');
}

/** 8x8 픽셀 번개 스프라이트 (빠른 시작 CTA 장식) */
function BoltSprite() {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true">
      <rect x="4" y="0" width="2" height="1" fill="var(--accent-2)" />
      <rect x="3" y="1" width="2" height="1" fill="var(--accent-2)" />
      <rect x="2" y="2" width="2" height="1" fill="var(--accent-2)" />
      <rect x="2" y="3" width="4" height="1" fill="var(--accent-2)" />
      <rect x="4" y="4" width="2" height="1" fill="var(--accent-2)" />
      <rect x="3" y="5" width="2" height="1" fill="var(--accent-2)" />
      <rect x="2" y="6" width="2" height="1" fill="var(--accent-2)" />
      <rect x="1" y="7" width="2" height="1" fill="var(--accent-2)" />
    </svg>
  );
}

/** 8x8 픽셀 톱니 스프라이트 (방 설정 키캡) */
function GearSprite() {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true">
      <rect x="3" y="0" width="2" height="1" fill="var(--text)" />
      <rect x="3" y="7" width="2" height="1" fill="var(--text)" />
      <rect x="0" y="3" width="1" height="2" fill="var(--text)" />
      <rect x="7" y="3" width="1" height="2" fill="var(--text)" />
      <rect x="1" y="1" width="1" height="1" fill="var(--text)" />
      <rect x="6" y="1" width="1" height="1" fill="var(--text)" />
      <rect x="1" y="6" width="1" height="1" fill="var(--text)" />
      <rect x="6" y="6" width="1" height="1" fill="var(--text)" />
      <rect x="2" y="2" width="4" height="4" fill="var(--text)" />
      <rect x="3" y="3" width="2" height="2" fill="var(--surface-3)" />
    </svg>
  );
}

export default function Online({ open, onClose }: OnlineProps) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchingOpen, setMatchingOpen] = useState(false);
  const timersRef = useRef<number[]>([]);
  const enteredRef = useRef(false);
  const navigate = useNavigate();

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  // 패널이 닫히면 진행 중 mock 타이머/상태 전부 정리 (유령 매칭 방지)
  useEffect(() => {
    if (open) {
      enteredRef.current = false;
      return clearTimers;
    }
    clearTimers();
    setCode(null);
    setCopied(false);
    setJoinCode('');
    setJoinError(null);
    setSettingsOpen(false);
    setMatchingOpen(false);
    return undefined;
  }, [open]);

  /** 매칭 성사 → 인게임 (중복 진입 가드) */
  const enterGame = () => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    const gameId = pickRandomGameId();
    startMatch('online', gameId);
    navigate(`/game/${gameId}`);
  };

  const handleQuickstart = () => {
    clearTimers(); // 코드 방 가짜 입장 타이머와 경합 방지
    setMatchingOpen(true);
  };

  const handleCreateCode = () => {
    const next = generateCode();
    setCode(next);
    setCopied(false);
    // n초 후 가짜 상대 입장 → 인게임 (QA-S6-06)
    clearTimers();
    timersRef.current.push(window.setTimeout(enterGame, FAKE_JOIN_MS));
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard 권한 실패 시에도 mock 피드백은 유지 */
    }
    setCopied(true);
    timersRef.current.push(window.setTimeout(() => setCopied(false), 1500));
  };

  const handleJoin = () => {
    const trimmed = joinCode.trim();
    if (!/^\d{4,}$/.test(trimmed)) {
      // 형식만 검증 — 분반 제한 없음 (SPEC S6 기능7)
      setJoinError('숫자 코드를 정확히 입력해 주세요');
      return;
    }
    setJoinError(null);
    clearTimers();
    setMatchingOpen(true); // 매칭 성사 플로우로 (QA-S6-07)
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="ONLINE MATCH" testId="modal-online" width={560}>
        <h2 className="onl-heading">온라인 게임하기</h2>

        {/* ① 빠른 시작 — 초대형 오렌지 CTA */}
        <Button
          data-testid="btn-quickstart"
          variant="primary"
          size="lg"
          overline="QUICK START"
          onClick={handleQuickstart}
          style={{ width: '100%', marginBottom: 24 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <BoltSprite />
            빠른 시작
            <BoltSprite />
          </span>
        </Button>

        {/* ② 게임 만들기 / 참가하기 — 그린 서브패널 */}
        <Card tone="green" title="CREATE / JOIN ROOM">
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 16, marginBottom: 16, color: 'var(--text)' }}>
              게임 만들기 / 참가하기
            </p>

            {/* 1행: 코드 생성 + 코드 슬롯 + 복사 + 톱니 */}
            <div className="onl-row">
              <Button data-testid="btn-code-create" variant="surface" size="md" onClick={handleCreateCode}>
                코드 생성하기
              </Button>
              <div className="onl-code-slot" data-testid="room-code-display" aria-live="polite">
                {code ? (
                  <span className="onl-code-value">{code}</span>
                ) : (
                  <span className="onl-code-empty px-blink" aria-label="코드 미생성">
                    ___________
                  </span>
                )}
              </div>
              <Button variant="ghost" size="md" disabled={!code} onClick={handleCopy} aria-label="코드 복사">
                복사
              </Button>
              {copied ? <span className="onl-copied">COPIED!</span> : null}
              <button
                type="button"
                className="px-keycap"
                aria-label="방 설정"
                title="방 설정"
                onClick={() => setSettingsOpen(true)}
                style={{ width: 40, height: 40, flex: 'none' }}
              >
                <GearSprite />
              </button>
            </div>

            {/* 2행: 코드 입력 + 확인 */}
            <div className="onl-row" style={{ marginBottom: 0 }}>
              <span className="onl-row-label">코드 입력하기</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  data-testid="input-code"
                  className={joinError ? 'px-input is-error' : 'px-input'}
                  value={joinCode}
                  placeholder="상대의 코드를 입력"
                  inputMode="numeric"
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    if (joinError) setJoinError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoin();
                  }}
                  style={{ height: 40 }}
                />
              </div>
              <Button data-testid="btn-code-join" variant="primary" size="md" onClick={handleJoin}>
                확인
              </Button>
            </div>
            {joinError ? (
              <p className={'onl-join-error px-shake'} role="alert">
                {joinError}
              </p>
            ) : null}
          </div>
        </Card>
      </Modal>

      {/* 톱니 → S4 설정 모달 재사용 (방장 설정 전제) */}
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* 빠른 시작/코드 참가 → S7 매칭 모달. 취소하면 S6(이 패널)으로 복귀 */}
      <Matching open={matchingOpen} onCancel={() => setMatchingOpen(false)} />
    </>
  );
}
