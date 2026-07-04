/**
 * ResultOverlay — 라운드/매치 결과 오버레이 (SPEC Q10 · PLAN §2 인게임 공통 셸).
 * 소유: game1 에이전트 (스타일/연출 구현). Game2·Game3은 import만 한다.
 *
 * ⚠️ props 계약은 동결 — game2/game3 에이전트가 이 시그니처에 의존한다.
 *    바꿔야 하면 아키텍트(ARCHITECTURE.md) 합의 없이 변경 금지.
 *
 * 렌더 요구 (data-testid):
 *   result-overlay — 오버레이 컨테이너 (open=false면 렌더 안 함)
 *   result-text    — 결과 문구 (예: ROUND WON — P1 / VICTORY // 닉네임 / DRAW)
 *   btn-next-round — matchResult=null(매치 진행 중)일 때만
 *   btn-back-main  — matchResult!=null(매치 종료)일 때만
 * 연출: 승자 진영색 radial 워시(600ms), 매치 승자에 골드 왕관 라인 (PLAN §1.4).
 * 부모(각 게임 스테이지)는 position:relative여야 한다 — 오버레이는 absolute inset:0.
 */
import type { MatchResult, PlayerRole } from '@shared';
import { Button } from '../../components';
import './result-overlay.css';

export interface ResultOverlayProps {
  open: boolean;
  /** 직전 라운드 승자 (null = 무승부 라운드) */
  roundWinner: PlayerRole | null;
  /** 매치 종료 시 결과, 진행 중이면 null */
  matchResult: MatchResult | null;
  /** 현재 라운드 번호 (1-based, 표기용) */
  roundNumber: number;
  p1Name: string;
  p2Name: string;
  /** 매치 진행 중 — 다음 라운드 (btn-next-round) */
  onNextRound: () => void;
  /** 매치 종료 — 메인으로 (btn-back-main). resetFlow()+navigate('/')는 호출측 책임 */
  onBackMain: () => void;
}

/** 매치 승자 전용 골드 왕관 라인 아이콘 (PLAN §2 인게임 공통 셸) */
function CrownIcon() {
  return (
    <svg
      className="ro-crown"
      width="46"
      height="32"
      viewBox="0 0 46 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 25 L3 6 L14 15 L23 3 L32 15 L43 6 L41 25 Z"
        stroke="var(--gold)"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <path d="M7 30 H39" stroke="var(--gold)" strokeWidth="1.5" />
    </svg>
  );
}

export function ResultOverlay({
  open,
  roundWinner,
  matchResult,
  roundNumber,
  p1Name,
  p2Name,
  onNextRound,
  onBackMain,
}: ResultOverlayProps) {
  if (!open) return null;

  // 승자 진영 (매치 종료 시 매치 승자 우선, 진행 중이면 라운드 승자)
  const winnerSide: 'p1' | 'p2' | null = matchResult
    ? matchResult === 'P1_WIN'
      ? 'p1'
      : matchResult === 'P2_WIN'
        ? 'p2'
        : null
    : roundWinner === 'P1'
      ? 'p1'
      : roundWinner === 'P2'
        ? 'p2'
        : null;

  const accent =
    winnerSide === 'p1' ? 'var(--p1)' : winnerSide === 'p2' ? 'var(--p2)' : 'var(--text-md)';
  const washColor =
    winnerSide === 'p1'
      ? 'rgba(0, 240, 255, 0.18)'
      : winnerSide === 'p2'
        ? 'rgba(255, 51, 88, 0.18)'
        : 'rgba(234, 240, 248, 0.06)'; // 무승부 — 중립 워시 (가짜 승자색 금지)

  const text = matchResult
    ? matchResult === 'DRAW'
      ? 'DRAW'
      : `VICTORY // ${matchResult === 'P1_WIN' ? p1Name : p2Name}`
    : roundWinner
      ? `ROUND ${roundNumber} WON — ${roundWinner}`
      : `ROUND ${roundNumber} — DRAW`;

  const sub = matchResult
    ? matchResult === 'DRAW'
      ? '매치 무승부'
      : `${matchResult === 'P1_WIN' ? p1Name : p2Name} 매치 승리!`
    : roundWinner
      ? `${roundWinner === 'P1' ? p1Name : p2Name} 라운드 승리`
      : '라운드 무승부';

  return (
    <div data-testid="result-overlay" className="ro">
      <div
        className="ro-wash"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${washColor} 0%, transparent 65%)`,
        }}
      />
      <div className="ro-body">
        <span className="overline" style={{ color: accent }}>
          {matchResult ? 'MATCH RESULT // FINAL' : `ROUND ${roundNumber} // RESULT`}
        </span>
        {matchResult !== null && matchResult !== 'DRAW' && <CrownIcon />}
        <div
          className="display ro-text"
          data-testid="result-text"
          style={{ textShadow: `0 0 32px ${accent}` }}
        >
          {text}
        </div>
        <div className="ro-sub">{sub}</div>
        <div className="ro-buttons">
          {matchResult === null ? (
            <Button
              variant="primary"
              overline="NEXT ROUND"
              testId="btn-next-round"
              onClick={onNextRound}
            >
              다음 라운드
            </Button>
          ) : (
            <Button
              variant="primary"
              overline="RETURN TO LOBBY"
              testId="btn-back-main"
              onClick={onBackMain}
            >
              메인으로
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
