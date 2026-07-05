/**
 * ResultOverlay — 라운드/매치 결과 오버레이. 담당: game1 에이전트 (전 게임 S9~S12 공용).
 * 부품 testid: result-overlay, result-text, btn-next-round, btn-back-main
 *
 * PLAN 인게임 공통: WINNER 네온 사인 sign-on 플리커(P1 승=시안 / P2 승=핑크,
 *   매치 최종 승자=--win 그린), DRAW=퍼플. "CONTINUE? ▶" 점멸 캡션.
 *   판정 순간 글리치(크로마틱 어버레이션) 1회. 매치 종료는 하이스코어 등록 화면 무드
 *   (순위표 프레임에 라운드별 결과 + 최종 스코어 정렬).
 *
 * 계약 (ARCHITECTURE §3.4 — 모든 게임 화면이 <ResultOverlay />를 넣기만 하면 됨):
 *   flow.phase === 'round-result' → 표시 + [다음 라운드](btn-next-round) → nextRound()
 *     (게임 화면이 flow.currentRound 변화를 감지해 새 게임 state 생성)
 *   flow.phase === 'match-result' → 표시 + [메인으로](btn-back-main) → exitMatch(); navigate('/')
 *   그 외 phase → null 렌더. props 없음 — flow store만 읽는 범용 컴포넌트.
 */
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components';
import { exitMatch, getPlayerDisplays, getRoundWins, nextRound, useFlow } from '../../state/flow';
import './resultoverlay.css';

export default function ResultOverlay() {
  const flow = useFlow();
  const navigate = useNavigate();
  if (flow.phase !== 'round-result' && flow.phase !== 'match-result') return null;

  const isMatchEnd = flow.phase === 'match-result';
  const lastRound = flow.roundResults[flow.roundResults.length - 1];
  const winner = isMatchEnd
    ? flow.matchResult
    : lastRound?.winner === 'P1'
      ? 'P1_WIN'
      : lastRound?.winner === 'P2'
        ? 'P2_WIN'
        : 'DRAW';
  const text = winner === 'P1_WIN' ? 'P1 WINNER' : winner === 'P2_WIN' ? 'P2 WINNER' : 'DRAW';
  // 색: 라운드 승자=플레이어색 / 매치 최종 승자=--win 그린 / 무승부=퍼플 (PLAN)
  const color = isMatchEnd
    ? winner === 'DRAW'
      ? 'var(--accent2)'
      : 'var(--win)'
    : winner === 'P1_WIN'
      ? 'var(--p1)'
      : winner === 'P2_WIN'
        ? 'var(--p2)'
        : 'var(--accent2)';
  const wins = getRoundWins(flow);
  const displays = getPlayerDisplays(flow);
  const winnerName =
    winner === 'P1_WIN' ? displays.P1.name : winner === 'P2_WIN' ? displays.P2.name : null;

  return (
    <div data-testid="result-overlay" className="rov">
      <div
        className="rov__panel corner-brackets anim-sign-on"
        style={{ '--rov-color': color } as CSSProperties}
      >
        <i className="cb2" />

        <span className="rov__stage-cap font-arcade">
          {isMatchEnd
            ? 'FINAL RESULT'
            : `ROUND ${flow.currentRound}/${flow.roundConfig.roundCount}`}
        </span>

        <div data-testid="result-text" className="rov__text font-arcade rov__text--glitch">
          {text}
        </div>

        {winnerName && (
          <span className="rov__winner-name font-display">
            {winnerName} {isMatchEnd ? '매치 승리!' : '라운드 승리!'}
          </span>
        )}
        {winner === 'DRAW' && <span className="rov__winner-name font-display">무승부</span>}

        {/* 스코어 라인 — P1 시안 / P2 핑크 고정 */}
        <div className="rov__score font-arcade">
          <span className="c-p1">P1 {wins.P1}</span>
          <span className="rov__score-sep">:</span>
          <span className="c-p2">{wins.P2} P2</span>
        </div>

        {/* 매치 최종: 하이스코어 등록 화면 무드 — 라운드별 결과 순위표 프레임 */}
        {isMatchEnd && (
          <table className="rov__table font-arcade">
            <thead>
              <tr>
                <th>ROUND</th>
                <th>WIN</th>
              </tr>
            </thead>
            <tbody>
              {flow.roundResults.map((r) => (
                <tr key={r.roundIndex}>
                  <td>R{r.roundIndex + 1}</td>
                  <td className={r.winner === 'P1' ? 'c-p1' : r.winner === 'P2' ? 'c-p2' : 'c-muted'}>
                    {r.winner ?? 'DRAW'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isMatchEnd && (
          <>
            <span className="rov__continue font-arcade c-accent anim-blink">CONTINUE? ▶</span>
            <Button variant="primary" data-testid="btn-next-round" onClick={() => nextRound()}>
              다음 라운드
            </Button>
          </>
        )}
        {isMatchEnd && (
          <Button
            variant="secondary"
            data-testid="btn-back-main"
            onClick={() => {
              exitMatch();
              navigate('/');
            }}
          >
            메인으로
          </Button>
        )}
      </div>
    </div>
  );
}
