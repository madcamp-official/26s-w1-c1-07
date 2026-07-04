/**
 * ResultOverlay — 라운드/매치 결과 오버레이 (game1 에이전트 정식 구현, 전 게임 공용).
 * game2·game3 에이전트는 import만 하고 수정 금지.
 *
 * SPEC 인게임 공통(결과 오버레이, Q10) + PLAN §1.4 승부 순간:
 *  - 화이트 플래시 → 0.5s 슬로모션 카드 등장 → 승자 쪽 골드 파티클 + MVP 라인.
 *  - phase==='round-result' → "ROUND N" 탭 + 라운드 결과 + btn-next-round / btn-back-main
 *  - phase==='match-result' → "FULL TIME" 골드 탭 + 매치 결과 + btn-back-main만
 *  - result-text에 P1/P2 승리·무승부가 판별 가능한 텍스트 포함 (QA 파싱).
 *
 * 사용법 (게임 화면에서):
 *   {flow.phase !== 'playing' && (
 *     <ResultOverlay
 *       flow={flow}
 *       players={getPlayerDisplays(flow)}
 *       onNextRound={() => { nextRound(); restartRound(); }}
 *       onBackMain={() => { exitMatch(); navigate('/'); }}
 *       stats={<span>생존 12.4s · 회피 8회</span>}  // 선택 — 게임별 스탯 라인
 *     />
 *   )}
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { PlayerRole } from '@shared';
import type { FlowState, PlayerDisplay } from '../../state/flow';
import { getRoundWins } from '../../state/flow';
import { Button, SkewTab } from '../../components';
import './result-overlay.css';

export interface ResultOverlayProps {
  flow: FlowState;
  players: Record<PlayerRole, PlayerDisplay>;
  /** phase==='round-result'에서 "다음 라운드" 클릭 */
  onNextRound: () => void;
  /** "메인으로" 클릭 (양 phase 공통 제공 권장, match-result에선 필수) */
  onBackMain: () => void;
  /** 선택 — 게임별 MVP/스탯 라인 (예: 생존 시간·회피 횟수) */
  stats?: ReactNode;
}

function resultLabel(
  winner: PlayerRole | null,
  players: Record<PlayerRole, PlayerDisplay>,
): string {
  if (winner === null) return '무승부';
  return `${winner} ${players[winner].name} 승리`;
}

/** 골드 파티클 스펙 (렌더마다 위치·딜레이 랜덤, 결과 키가 바뀔 때만 재생성) */
function useParticles(seedKey: string, enabled: boolean) {
  return useMemo(() => {
    if (!enabled) return [];
    return Array.from({ length: 14 }, (_, i) => ({
      left: `${4 + Math.random() * 92}%`,
      delay: `${(i % 7) * 0.18 + Math.random() * 0.3}s`,
      duration: `${1.3 + Math.random() * 0.8}s`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, enabled]);
}

export default function ResultOverlay({
  flow,
  players,
  onNextRound,
  onBackMain,
  stats,
}: ResultOverlayProps) {
  const isRoundEnd = flow.phase === 'round-result';
  const isMatchEnd = flow.phase === 'match-result';
  const lastRound = flow.roundResults[flow.roundResults.length - 1];
  const wins = getRoundWins(flow);
  const matchWinner: PlayerRole | null =
    flow.matchResult === 'P1_WIN' ? 'P1' : flow.matchResult === 'P2_WIN' ? 'P2' : null;
  const winner: PlayerRole | null = isMatchEnd ? matchWinner : (lastRound?.winner ?? null);

  const seedKey = `${flow.phase}-${flow.currentRound}-${winner ?? 'draw'}`;
  const particles = useParticles(seedKey, (isRoundEnd || isMatchEnd) && winner !== null);

  if (!isRoundEnd && !isMatchEnd) return null;

  const winnerVar =
    winner === 'P1' ? 'var(--p1)' : winner === 'P2' ? 'var(--p2)' : 'var(--ink-sub)';

  return (
    <>
      {/* 승부 순간 화이트 플래시 (결과 키가 바뀔 때마다 1회 재생) */}
      <div key={`flash-${seedKey}`} className="ro-flash" aria-hidden="true" />
      <div data-testid="result-overlay" className="ro-overlay">
        <div className="ro-card-wrap">
          <div key={`card-${seedKey}`} className="ro-card">
            {/* 승자 쪽 골드 파티클 */}
            {winner !== null && (
              <span className="ro-particles" aria-hidden="true">
                {particles.map((p, i) => (
                  <span
                    key={i}
                    className="ro-particle"
                    style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
                  />
                ))}
              </span>
            )}
            <span className="ro-tab">
              <SkewTab tone={isMatchEnd ? (matchWinner ? 'gold' : 'navy') : 'navy'}>
                {isMatchEnd ? 'FULL TIME' : `ROUND ${flow.currentRound} RESULT`}
              </SkewTab>
            </span>

            <p
              data-testid="result-text"
              className="display"
              style={{
                fontSize: 30,
                fontWeight: 900,
                fontStretch: '110%',
                fontStyle: 'italic',
                margin: '6px 0 4px',
                color: isMatchEnd && matchWinner ? 'var(--gold)' : winnerVar,
              }}
            >
              {isMatchEnd
                ? matchWinner === null
                  ? '매치 무승부'
                  : `매치 ${resultLabel(matchWinner, players)}`
                : resultLabel(winner, players)}
            </p>

            {/* 라운드 스코어 라인 */}
            <p className="ro-score tnum" style={{ margin: '0 0 6px' }}>
              <span style={{ color: 'var(--p1)' }}>{wins.P1}</span>
              <span style={{ color: 'var(--ink-sub)', margin: '0 10px', fontWeight: 500 }}>:</span>
              <span style={{ color: 'var(--p2)' }}>{wins.P2}</span>
            </p>
            <p className="label" style={{ margin: '0 0 10px', color: 'var(--ink-sub)', fontSize: 10 }}>
              ROUND {Math.min(flow.currentRound, flow.roundConfig.roundCount)} /{' '}
              {flow.roundConfig.roundCount}
            </p>

            {/* MVP 스탯 라인 (승자 있을 때) + 게임별 스탯(선택) */}
            {winner !== null && (
              <p className="ro-mvp">
                <span className="label" style={{ color: 'var(--gold)' }}>
                  ★ MVP
                </span>
                <span style={{ fontWeight: 700 }}>{players[winner].name}</span>
              </p>
            )}
            {stats && (
              <p style={{ margin: '2px 0 8px', color: 'var(--ink-sub)', fontSize: 13 }}>{stats}</p>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14 }}>
              {!isMatchEnd && (
                <Button testId="btn-next-round" variant="primary" onClick={onNextRound}>
                  다음 라운드
                </Button>
              )}
              <Button
                testId="btn-back-main"
                variant={isMatchEnd ? 'primary' : 'secondary'}
                onClick={onBackMain}
              >
                메인으로
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
