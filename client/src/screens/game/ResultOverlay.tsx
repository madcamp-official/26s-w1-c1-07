/**
 * ResultOverlay — round/match result overlay. Owner: game1 agent (shared across all games S9~S12).
 * parts testid: result-overlay, result-text, btn-next-round, btn-back-main
 *
 * PLAN in-game shared: WINNER neon sign sign-on flicker (P1 win=cyan / P2 win=pink,
 *   match final winner=--win green), DRAW=purple. "CONTINUE? ▶" blinking caption.
 *   Glitch (chromatic aberration) once at the moment of decision. Match end has the high-score
 *   registration screen mood (per-round results + final score ordered in the ranking-table frame).
 *
 * Contract (ARCHITECTURE §3.4 — every game screen only needs to drop in <ResultOverlay />):
 *   flow.phase === 'round-result' → show + [Next round](btn-next-round) → nextRound()
 *     (the game screen detects the flow.currentRound change and creates new game state)
 *   flow.phase === 'match-result' → show + [To main](btn-back-main) → exitMatch(); navigate('/')
 *   any other phase → render null. No props — a generic component that only reads the flow store.
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
  // color: round winner=player color / match final winner=--win green / draw=purple (PLAN)
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
            {winnerName} {isMatchEnd ? 'wins the match!' : 'wins the round!'}
          </span>
        )}
        {winner === 'DRAW' && <span className="rov__winner-name font-display">Draw</span>}

        {/* score line — P1 cyan / P2 pink fixed */}
        <div className="rov__score font-arcade">
          <span className="c-p1">P1 {wins.P1}</span>
          <span className="rov__score-sep">:</span>
          <span className="c-p2">{wins.P2} P2</span>
        </div>

        {/* match final: high-score registration screen mood — per-round results ranking-table frame */}
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
              Next round
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
            To main
          </Button>
        )}
      </div>
    </div>
  );
}
