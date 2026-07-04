/**
 * LeaderboardTable — 괘선 없는 클레이 트레이 리더보드 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * SPEC S2 리더보드: TOP3(플레이 수/승리 수/승률) + 내 등수. 빈 상태는 정직하게(§0.4).
 * testid 'lb-top3'는 TOP3 목록 컨테이너, 'lb-myrank'는 내 행에 부착돼 있다.
 *
 * 사용법 (S2에서):
 *   import { computeLeaderboard, mockUsers, mockMatches, scoreConfig } from '@shared';
 *   const lb = computeLeaderboard(mockUsers, mockMatches, scoreConfig);
 *   // 내 mock 신원은 시안 관례상 'u1'(같은 분반 첫 유저) 또는 자유 — 화면 에이전트 재량.
 *   <LeaderboardTable top3={lb.top3} my={lb.entryOf('u1')} />
 *   // 빈 상태 테스트: <LeaderboardTable top3={[]} my={null} />
 */
import type { LeaderboardEntry } from '@shared';
import Avatar from './Avatar';

export interface LeaderboardTableProps {
  /** 상위 3명 (없으면 빈 배열 → 빈 상태 렌더) */
  top3: readonly LeaderboardEntry[];
  /** 내 엔트리 — 리더보드에 내가 없으면 null (내 행 미표시) */
  my: LeaderboardEntry | null;
}

/** 1·2·3위 클레이 메달 원판 색 */
const MEDAL: Record<number, string> = {
  1: 'var(--win)', // 금
  2: '#C9C2D8', // 은 (플럼 톤 실버)
  3: '#E0A87A', // 동
};

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Row({
  entry,
  isMe,
  sunken,
}: {
  entry: LeaderboardEntry;
  isMe?: boolean;
  sunken?: boolean;
}) {
  return (
    <div
      data-testid={isMe ? 'lb-myrank' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 'var(--radius-sm)',
        background: isMe ? 'var(--accent-soft)' : sunken ? 'var(--surface-sunken)' : 'transparent',
      }}
    >
      {/* 순위 메달/숫자 */}
      <span
        className="num"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 15,
          background: MEDAL[entry.rank] ?? 'var(--surface-sunken)',
          color: MEDAL[entry.rank] ? '#FFF9F4' : 'var(--ink-muted)',
          boxShadow: MEDAL[entry.rank] ? 'var(--shadow-clay-sm)' : 'var(--shadow-sunken)',
          flexShrink: 0,
        }}
      >
        {entry.rank}
      </span>
      <Avatar name={entry.nickname} colorIndex={entry.rank - 1} size={32} />
      <span
        style={{
          flex: 1,
          fontSize: 16,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.nickname}
        {isMe && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 12,
              background: 'var(--accent)',
              color: '#FFF9F4',
              borderRadius: 10,
              padding: '2px 8px',
              verticalAlign: 'middle',
            }}
          >
            나
          </span>
        )}
      </span>
      {/* 플레이 수 · 승리 수 · 승률 (SPEC 행24) */}
      <span className="num" style={{ fontSize: 14, color: 'var(--ink-muted)', width: 44, textAlign: 'right' }}>
        {entry.totalPlays}판
      </span>
      <span className="num" style={{ fontSize: 14, width: 44, textAlign: 'right' }}>
        {entry.wins}승
      </span>
      <span className="num" style={{ fontSize: 14, fontWeight: 600, width: 48, textAlign: 'right' }}>
        {pct(entry.winRate)}
      </span>
    </div>
  );
}

/** 납작하게 눌린 찰흙 얼굴 빈 상태 (가짜 데이터 금지 — SPEC §0.4) */
function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--ink-muted)' }}>
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 34,
          margin: '0 auto 14px',
          borderRadius: '50%',
          background: 'var(--surface-sunken)',
          boxShadow: 'var(--shadow-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontSize: 12,
        }}
      >
        <span>·</span>
        <span style={{ transform: 'rotate(90deg)' }}>(</span>
        <span>·</span>
      </div>
      <p style={{ fontSize: 15 }}>기록 없음</p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div data-testid="lb-top3" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {top3.map((e, i) => (
          <Row key={e.userId} entry={e} sunken={i % 2 === 1} isMe={my?.userId === e.userId} />
        ))}
      </div>
      {/* 내 등수 행 — TOP3에 이미 있으면 중복 표시하지 않음 (그 행이 lb-myrank를 가짐) */}
      {my && !myInTop3 && (
        <>
          <div
            aria-hidden="true"
            style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 14, lineHeight: '10px' }}
          >
            ⋯
          </div>
          <Row entry={my} isMe />
        </>
      )}
    </div>
  );
}
