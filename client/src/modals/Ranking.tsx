/**
 * 분반 전체 랭킹 모달 — 메인 리더보드 패널 클릭으로 진입 (docs/COINS.md).
 * 본체 testid: modal-ranking / 부품: ranking-me, ranking-list, btn-ranking-close
 *
 * 구성 (위→아래):
 *   ① 내 정보 행 (하이라이트)
 *   ② 간격
 *   ③ 1등부터 꼴등까지 분반 전체 인원 (코인순, 공동 등수 표기 그대로 — 스크롤)
 *   ④ "닫기" 버튼
 * 데이터: GET /api/leaderboard (열릴 때마다 재조회 — 코인 변동 반영).
 */
import { useEffect, useState } from 'react';
import { Button, Modal, ordinal, rankColor } from '../components';
import type { LeaderboardRow } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { fetchLeaderboard } from '../net/leaderboard';
import type { LeaderboardData } from '../net/leaderboard';
import './ranking.css';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Row({ row, me }: { row: LeaderboardRow; me?: boolean }) {
  return (
    <div className={`rk-row${me ? ' rk-row--me' : ''}`}>
      {/* 1·2·3등은 금/은/동 (rankColor), 그 외는 CSS 기본색 */}
      <span className="rk-rank font-arcade glow-text" style={{ color: rankColor(row.rank) }}>
        {ordinal(row.rank)}
      </span>
      <span className="rk-name font-display">
        {row.nickname}
        {me && <span className="rk-you font-arcade anim-blink"> YOU</span>}
      </span>
      <span className="rk-coin font-arcade c-accent">🪙 {row.coins}</span>
      <span className="rk-stat font-arcade c-muted">{row.plays}P</span>
      <span className="rk-stat font-arcade c-muted">{row.wins}W</span>
      <span className="rk-stat font-arcade c-muted">{pct(row.winRate)}</span>
    </div>
  );
}

export default function RankingModal() {
  const flow = useFlow();
  const open = flow.modal === 'ranking';

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);

  // 열릴 때마다 최신 랭킹 재조회
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void fetchLeaderboard().then((lb) => {
      if (!alive) return;
      setData(lb);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee={`${data?.groupName ?? '분반'} 전체 랭킹 — FULL RANKING`}
      accentColor="var(--accent)"
      testId="modal-ranking"
      width={560}
    >
      <div className="rk-body">
        {loading && <p className="rk-empty font-arcade c-muted">LOADING…</p>}

        {!loading && (!data || data.rows.length === 0) && (
          <p className="rk-empty c-muted">NO RECORD — 랭킹 정보가 없습니다</p>
        )}

        {!loading && data && data.rows.length > 0 && (
          <>
            {/* ① 최상단: 내 정보 */}
            {data.me && (
              <div className="rk-me" data-testid="ranking-me">
                <Row row={data.me} me />
              </div>
            )}

            {/* ② 간격 후 ③ 전체 목록 (1등 → 꼴등) */}
            <div className="rk-list" data-testid="ranking-list">
              <div className="rk-head font-arcade c-muted" aria-hidden>
                <span className="rk-rank">RANK</span>
                <span className="rk-name">NAME</span>
                <span className="rk-coin">COIN</span>
                <span className="rk-stat">PLAY</span>
                <span className="rk-stat">WIN</span>
                <span className="rk-stat">RATE</span>
              </div>
              {data.rows.map((r) => (
                <Row key={r.userId} row={r} me={r.userId === data.me?.userId} />
              ))}
            </div>
          </>
        )}

        {/* ④ 최하단: 닫기 */}
        <Button variant="tertiary" block data-testid="btn-ranking-close" onClick={closeModal}>
          닫기
        </Button>
      </div>
    </Modal>
  );
}
