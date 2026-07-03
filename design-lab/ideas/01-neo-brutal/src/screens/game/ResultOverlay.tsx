/**
 * ResultOverlay — 라운드/매치 결과 오버레이 (SPEC Q10: 인게임 위 오버레이 / PLAN 인게임 공통)
 * [OWNER: game1 에이전트] — 이 파일은 game1 에이전트만 수정한다.
 *   단, props 계약(ResultOverlayProps)은 game2/game3 에이전트가 그대로 import해 쓰므로
 *   시그니처를 바꾸려면 ARCHITECTURE.md 갱신 + 두 에이전트에게 공지가 필요하다.
 *
 * PLAN §2 인게임 공통:
 *  - 해저드 스트라이프 프레임 오버레이 + result-text 초대형 스탬프
 *    (P1 WIN=블루, P2 WIN=핑크, DRAW=ink — <Stamp tone=...>)
 *  - kind='round': [다음 라운드](btn-next-round) + [메인으로](btn-back-main)
 *  - kind='match': [메인으로](btn-back-main)
 *
 * 배치 전제: game-stage(position: relative) 안에서 렌더 — absolute inset 0으로 스테이지를 덮는다.
 */
import type { PlayerRole } from '@shared';
import { Button, Stamp } from '../../components';

export interface ResultOverlayProps {
  /** round = 라운드 종료 (다음 라운드 버튼) / match = 매치 종료 (메인으로 버튼) */
  kind: 'round' | 'match';
  /** 승자. null = 무승부(DRAW) */
  winner: PlayerRole | null;
  p1Name: string;
  p2Name: string;
  /** kind='round'일 때 필수 */
  onNextRound?: () => void;
  onBackToMain: () => void;
}

const CSS = `
.ro-overlay {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 10, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.ro-frame {
  padding: 14px;
  box-shadow: var(--shadow-lg);
  animation: ro-in var(--dur-base) var(--ease-snap);
}
.ro-panel {
  background: var(--surface);
  border: var(--border-w-hero) solid var(--ink);
  padding: 36px 56px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  min-width: 380px;
}
.ro-kind {
  background: var(--ink);
  color: var(--bg);
  padding: 3px 14px;
}
.ro-vs {
  font-size: 13px;
  color: var(--ink-muted);
  letter-spacing: 0.08em;
}
.ro-buttons {
  display: flex;
  gap: 14px;
  margin-top: 4px;
}
@keyframes ro-in {
  from { transform: scale(0.95); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ro-frame { animation: none; }
}
`;

export default function ResultOverlay({
  kind,
  winner,
  p1Name,
  p2Name,
  onNextRound,
  onBackToMain,
}: ResultOverlayProps) {
  const text =
    winner === null ? 'DRAW' : `${winner === 'P1' ? p1Name : p2Name} WIN!`;
  const tone = winner === null ? 'ink' : winner === 'P1' ? 'p1' : 'p2';
  return (
    <div data-testid="result-overlay" className="ro-overlay">
      <style>{CSS}</style>
      {/* 해저드 스트라이프 프레임 (PLAN §2 인게임 공통) */}
      <div className="ro-frame hazard">
        <div className="ro-panel">
          <span className="label-caps ro-kind">
            {kind === 'round' ? 'ROUND RESULT' : 'MATCH RESULT'}
          </span>
          <span data-testid="result-text">
            <Stamp tone={tone} fontSize={64}>
              {text}
            </Stamp>
          </span>
          <span className="font-mono ro-vs">
            {p1Name} vs {p2Name}
          </span>
          <div className="ro-buttons">
            {kind === 'round' && (
              <Button variant="primary" data-testid="btn-next-round" onClick={onNextRound}>
                다음 라운드
              </Button>
            )}
            <Button
              variant={kind === 'match' ? 'primary' : 'secondary'}
              data-testid="btn-back-main"
              onClick={onBackToMain}
            >
              메인으로
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
