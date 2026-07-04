/**
 * ResultOverlay — 라운드/매치 결과 클레이 오버레이 (game1 에이전트 소유.
 * props 계약 유지 — game2/game3 에이전트가 그대로 import한다. ARCHITECTURE §4.3)
 *
 * testid: result-overlay, result-text, btn-next-round(라운드 결과), btn-back-main(매치 결과)
 * 동작:
 *  - flow.phase === 'round-result' → 라운드 승자 발표 + btn-next-round
 *      클릭 시 nextRound() → 부모 게임 화면이 flow.currentRound 변화로 새 state 생성
 *      (onNextRound 콜백으로도 알림).
 *  - flow.phase === 'match-result' → matchResult(P1_WIN/P2_WIN/DRAW) 발표 + 컨페티
 *      + btn-back-main: exitMatch(); navigate('/')
 *  - 그 외 phase면 null.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayerRole } from '@shared';
import {
  exitMatch,
  getPlayerDisplays,
  getRoundWins,
  nextRound,
  useFlow,
} from '../../state/flow';
import { Button } from '../../components';
import './ResultOverlay.css';

export interface ResultOverlayProps {
  /** "다음 라운드" 클릭 직후 호출 — 게임 화면이 새 라운드 state를 만들 트리거 */
  onNextRound?: () => void;
}

// ---------------------------------------------------------------------------
// 컨페티 — 클레이 조각(원·별·초승달, 팔레트 5색) 통통 낙하 (PLAN §1.4)
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  'var(--p1)',
  'var(--p2)',
  'var(--pop)',
  'var(--lavender)',
  'var(--accent)',
];
const CONFETTI_SHAPES = ['circle', 'star', 'moon'] as const;

interface ConfettiPiece {
  left: number;
  size: number;
  delay: number;
  dur: number;
  color: string;
  shape: (typeof CONFETTI_SHAPES)[number];
}

function makeConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    left: 4 + Math.random() * 92,
    size: 12 + Math.round(Math.random() * 12),
    delay: Math.random() * 0.7,
    dur: 2.2 + Math.random() * 1.4,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    shape: CONFETTI_SHAPES[i % CONFETTI_SHAPES.length],
  }));
}

// ---------------------------------------------------------------------------

const ROLE_COLOR: Record<PlayerRole, string> = { P1: 'var(--p1)', P2: 'var(--p2)' };

export default function ResultOverlay({ onNextRound }: ResultOverlayProps) {
  const flow = useFlow();
  const navigate = useNavigate();
  const confetti = useMemo(() => makeConfetti(16), []);

  if (flow.phase !== 'round-result' && flow.phase !== 'match-result') return null;

  const isMatchEnd = flow.phase === 'match-result';
  const wins = getRoundWins(flow);
  const displays = getPlayerDisplays(flow);
  const lastRound = flow.roundResults[flow.roundResults.length - 1];

  const winner: PlayerRole | null = isMatchEnd
    ? flow.matchResult === 'P1_WIN'
      ? 'P1'
      : flow.matchResult === 'P2_WIN'
        ? 'P2'
        : null
    : (lastRound?.winner ?? null);

  const text = isMatchEnd
    ? winner
      ? `${winner} 승리!`
      : '무승부!'
    : winner
      ? `${winner} 라운드 승리!`
      : '라운드 무승부';

  const subText = winner
    ? `${displays[winner].name}${displays[winner].isYou ? ' (나!)' : ''}${
        isMatchEnd ? ' — 최종 우승!' : ''
      }`
    : isMatchEnd
      ? '둘 다 잘 빚었어요'
      : '이번 판은 아무도 못 가졌어요';

  return (
    <div data-testid="result-overlay" className="rov-backdrop">
      {/* 매치 승리 컨페티 (무승부는 없음 — 정직한 표현) */}
      {isMatchEnd && winner && (
        <div className="rov-confetti" aria-hidden="true">
          {confetti.map((p, i) => (
            <span
              key={i}
              className={`rov-piece rov-piece--${p.shape}`}
              style={
                {
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size,
                  color: p.color,
                  '--rov-delay': `${p.delay}s`,
                  '--rov-dur': `${p.dur}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="clay-lg pop-in rov-card">
        {/* 상단 클레이 오브젝트: 트로피 메달(승) / 납작 찰흙(무) */}
        {winner ? (
          <div
            className="rov-medal squash"
            style={{ background: isMatchEnd ? 'var(--win)' : ROLE_COLOR[winner] }}
            aria-hidden="true"
          >
            ★
          </div>
        ) : (
          <div className="rov-flat" aria-hidden="true">
            - ‿ -
          </div>
        )}

        <h2
          data-testid="result-text"
          className="rov-title"
          style={winner ? { color: ROLE_COLOR[winner] } : undefined}
        >
          {text}
        </h2>
        <p className="rov-sub">{subText}</p>

        <div className="num rov-score">
          <span className="rov-score-chip rov-score-chip--p1">P1</span>
          <span>
            {wins.P1} : {wins.P2}
          </span>
          <span className="rov-score-chip rov-score-chip--p2">P2</span>
        </div>

        {/* 라운드별 승자 점 — 진행 현황 */}
        <div className="rov-dots" aria-hidden="true">
          {flow.roundResults.map((r) => (
            <span
              key={r.roundIndex}
              className="rov-dot"
              style={{
                background: r.winner ? ROLE_COLOR[r.winner] : 'var(--surface-sunken)',
              }}
            />
          ))}
        </div>

        {isMatchEnd ? (
          <Button
            variant="primary"
            size="lg"
            data-testid="btn-back-main"
            onClick={() => {
              exitMatch();
              navigate('/');
            }}
          >
            메인으로
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            data-testid="btn-next-round"
            onClick={() => {
              nextRound();
              onNextRound?.();
            }}
          >
            다음 라운드
          </Button>
        )}
      </div>
    </div>
  );
}
