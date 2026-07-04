/**
 * 라운드/매치 결과 오버레이 (result-overlay) — 게임 3종 공용
 * [소유: game1 에이전트]
 *
 * PLAN §2 인게임 공통: 카트리지 라벨 스타일 카드 + 승자 진영색 타이틀 +
 * 픽셀 별 파편 폭발 + 라운드 스코어(★/☆ 도트) + 다음 라운드/메인으로.
 *
 * props 계약 (ARCHITECTURE §5 — 불변, game2/3이 그대로 import):
 *   winner: 'P1' | 'P2' | null (라운드 승자, null=무승부)
 *   matchOver: boolean / matchResult: MatchResult | null
 *   onNextRound: () => void — advanceRound()는 이 컴포넌트 내부에서 호출한 뒤
 *                게임 화면이 새 라운드 state를 만들도록 콜백한다.
 */
import { useNavigate } from 'react-router-dom';
import type { MatchResult, PlayerRole } from '@shared';
import { advanceRound, resetFlow, useFlow } from '../../state/flow';
import { Button } from '../../components';
import './ResultOverlay.css';

export interface ResultOverlayProps {
  winner: PlayerRole | null;
  matchOver: boolean;
  matchResult: MatchResult | null;
  onNextRound: () => void;
}

/** 진영색 (P1=블루 / P2=레드 절대 불변, 무승부=그레이) */
function roleColor(role: PlayerRole | null): string {
  if (role === 'P1') return 'var(--p1)';
  if (role === 'P2') return 'var(--p2)';
  return 'var(--text-dim)';
}

function matchWinnerRole(result: MatchResult | null): PlayerRole | null {
  if (result === 'P1_WIN') return 'P1';
  if (result === 'P2_WIN') return 'P2';
  return null;
}

export default function ResultOverlay({
  winner,
  matchOver,
  matchResult,
  onNextRound,
}: ResultOverlayProps) {
  const navigate = useNavigate();
  const flow = useFlow();

  const headlineRole = matchOver ? matchWinnerRole(matchResult) : winner;
  const headline = matchOver
    ? matchResult === 'DRAW' || matchResult === null
      ? 'MATCH DRAW'
      : `${matchWinnerRole(matchResult)} WINS THE MATCH!`
    : winner
      ? `${winner} WIN!`
      : 'DRAW';

  /** 라운드별 ★(승)/☆(패·무)/·(미진행) 도트 스코어 */
  const starsFor = (role: PlayerRole): string[] => {
    const out: string[] = [];
    for (let i = 0; i < flow.roundConfig.roundCount; i += 1) {
      const r = flow.roundResults[i];
      out.push(r === undefined ? '·' : r.winner === role ? '★' : '☆');
    }
    return out;
  };

  const handleNextRound = () => {
    advanceRound();
    onNextRound();
  };

  const handleBackToMain = () => {
    resetFlow();
    navigate('/');
  };

  return (
    <div data-testid="result-overlay" className="px-overlay">
      <div
        className="ro-card px-pop"
        style={{ ['--ro-accent' as string]: roleColor(headlineRole) }}
      >
        {/* 카트리지 라벨 타이틀 바 */}
        <div className="ro-titlebar px-font">
          {matchOver ? 'MATCH RESULT' : `ROUND ${flow.currentRound} RESULT`}
        </div>

        {/* 픽셀 별 파편 폭발 (3프레임 step) */}
        <div className="ro-burst" aria-hidden="true">
          <span className="ro-spark s1">✦</span>
          <span className="ro-spark s2">✦</span>
          <span className="ro-spark s3">✦</span>
          <span className="ro-spark s4">✦</span>
        </div>

        <h1 className="ro-headline px-font" data-testid="result-text">
          {headline}
        </h1>

        {/* 라운드 스코어 — P1 ★★☆ P2 도트 (PLAN 인게임 공통) */}
        <div className="ro-score">
          {(['P1', 'P2'] as const).map((role) => (
            <div key={role} className="ro-score-row">
              <span className="ro-score-role px-font" style={{ color: roleColor(role) }}>
                {role}
              </span>
              <span className="ro-score-name">{flow.playerNames[role]}</span>
              <span className="ro-score-stars px-font">
                {starsFor(role).map((s, i) => (
                  <span key={i} className={s === '★' ? 'is-win' : undefined}>
                    {s}
                  </span>
                ))}
              </span>
              <span className="ro-score-count px-font">
                {role === 'P1' ? flow.scores.p1Wins : flow.scores.p2Wins}
              </span>
            </div>
          ))}
        </div>

        <div className="ro-actions">
          {!matchOver ? (
            <Button
              data-testid="btn-next-round"
              variant="primary"
              size="lg"
              overline="NEXT ROUND"
              onClick={handleNextRound}
            >
              다음 라운드
            </Button>
          ) : null}
          <Button
            data-testid="btn-back-main"
            variant={matchOver ? 'primary' : 'ghost'}
            size={matchOver ? 'lg' : 'md'}
            overline="MAIN MENU"
            onClick={handleBackToMain}
          >
            메인으로
          </Button>
        </div>

        {/* 카트리지 하단 단자 빗살 장식 */}
        <div className="ro-pins" aria-hidden="true" />
      </div>
    </div>
  );
}
