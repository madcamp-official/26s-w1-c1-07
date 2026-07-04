/**
 * LeaderboardTable — 방송 순위표(STANDINGS) (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * SPEC S2 리더보드: TOP3(플레이 수/승리 수/승률) + 내 등수. 빈 상태는 정직하게(§0.4).
 * testid 'lb-top3'는 TOP3 목록 컨테이너, 'lb-myrank'는 내 행에 부착돼 있다.
 * 좌측 순위 번호 네이비 블록(1위만 골드), 1px 로우 디바이더, 내 행 블루 틴트 + YOU 태그.
 *
 * 사용법 (S2에서):
 *   import { computeLeaderboard, mockUsers, mockMatches, scoreConfig } from '@shared';
 *   const lb = computeLeaderboard(mockUsers, mockMatches, scoreConfig);
 *   // 내 mock 신원은 시안 관례상 'u1'(같은 분반 첫 유저) 또는 자유 — 화면 에이전트 재량.
 *   <LeaderboardTable top3={lb.top3} my={lb.entryOf('u1')} />
 *   // 빈 상태 테스트: <LeaderboardTable top3={[]} my={null} />
 */
import type { LeaderboardEntry } from '@shared';

export interface LeaderboardTableProps {
  /** 상위 3명 (없으면 빈 배열 → 빈 상태 렌더) */
  top3: readonly LeaderboardEntry[];
  /** 내 엔트리 — 리더보드에 내가 없으면 null (내 행 미표시) */
  my: LeaderboardEntry | null;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Row({ entry, isMe }: { entry: LeaderboardEntry; isMe?: boolean }) {
  const isFirst = entry.rank === 1;
  return (
    <div
      data-testid={isMe ? 'lb-myrank' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        borderTop: '1px solid var(--line)',
        background: isMe ? 'var(--p1-tint)' : 'transparent',
      }}
    >
      {/* 순위 번호 블록 — 1위만 골드 */}
      <span
        className="skew"
        style={{
          width: 26,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isFirst
            ? 'linear-gradient(105deg, var(--gold), var(--gold-bright))'
            : 'var(--strip)',
          flexShrink: 0,
        }}
      >
        <span className="unskew tnum" style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>
          {entry.rank}
        </span>
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: isMe ? 700 : 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.nickname}
        {isMe && (
          <span
            className="label"
            style={{
              marginLeft: 8,
              background: 'var(--p1)',
              color: '#fff',
              padding: '1px 7px',
              fontSize: 10,
              borderRadius: 2,
              verticalAlign: 'middle',
            }}
          >
            YOU
          </span>
        )}
      </span>
      {/* 플레이 수 · 승리 수 · 승률 (SPEC 행24) — tnum 우측 정렬 */}
      <span className="tnum" style={{ fontSize: 13, color: 'var(--ink-sub)', width: 42, textAlign: 'right' }}>
        {entry.totalPlays}경기
      </span>
      <span className="tnum" style={{ fontSize: 13, width: 34, textAlign: 'right' }}>
        {entry.wins}승
      </span>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 700, width: 42, textAlign: 'right' }}>
        {pct(entry.winRate)}
      </span>
    </div>
  );
}

/** 빈 상태 — 가짜 데이터 금지 (SPEC §0.4) */
function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--ink-sub)' }}>
      <p className="label" style={{ margin: '0 0 6px' }}>
        NO DATA
      </p>
      <p style={{ margin: 0, fontSize: 14 }}>기록 없음</p>
    </div>
  );
}

export default function LeaderboardTable({ top3, my }: LeaderboardTableProps) {
  if (top3.length === 0) {
    return (
      <div data-testid="lb-top3">
        <EmptyState />
      </div>
    );
  }
  const myInTop3 = my !== null && top3.some((e) => e.userId === my.userId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div data-testid="lb-top3" style={{ display: 'flex', flexDirection: 'column' }}>
        {top3.map((e) => (
          <Row key={e.userId} entry={e} isMe={my?.userId === e.userId} />
        ))}
      </div>
      {/* 내 등수 행 — TOP3에 이미 있으면 중복 표시하지 않음 (그 행이 lb-myrank를 가짐) */}
      {my && !myInTop3 && (
        <>
          <div
            aria-hidden="true"
            style={{
              textAlign: 'center',
              color: 'var(--ink-sub)',
              fontSize: 13,
              lineHeight: '12px',
              borderTop: '1px solid var(--line)',
              padding: '2px 0',
            }}
          >
            ⋯
          </div>
          <Row entry={my} isMe />
        </>
      )}
    </div>
  );
}
