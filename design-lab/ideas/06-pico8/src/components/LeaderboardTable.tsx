/**
 * LeaderboardTable — HI-SCORE 스타일 리더보드 테이블 (PLAN §1.5 / SPEC S2 행24).
 *
 * TOP3(트로피 색: 1위 옐로, 2위 라이트그레이, 3위 오렌지) + 구분선 아래 내 등수 행.
 * 빈 데이터면 "NO RECORDS YET" 정직한 빈 상태 (SPEC §0.4 — 가짜 순위 금지).
 *
 * testid: 컨테이너에 lb-top3 / 내 등수 행에 lb-myrank가 자동으로 붙는다.
 *
 * 사용법 (lobby 에이전트, S2):
 *   import { computeLeaderboard, mockUsers, mockMatches, scoreConfig } from '@shared';
 *   const lb = computeLeaderboard(mockUsers, mockMatches, scoreConfig);
 *   <LeaderboardTable
 *     top3={lb.top3.map(e => ({ rank: e.rank, nickname: e.nickname,
 *       plays: e.totalPlays, wins: e.wins, winRate: e.winRate }))}
 *     myRow={{ rank: null, nickname: session.nickname!, plays: 0, wins: 0, winRate: 0 }}
 *   />
 *   // 내 기록이 mock에 없으면 rank:null → "-"로 정직 표기 (지어내지 않음)
 *   // 빈 상태 테스트: top3={[]}
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import type { CSSProperties } from 'react';

export interface LeaderboardRow {
  /** 등수. null = 기록 없음("-" 표기) */
  rank: number | null;
  nickname: string;
  /** 플레이 수 */
  plays: number;
  /** 승리 수 */
  wins: number;
  /** 승률 0~1 */
  winRate: number;
}

export interface LeaderboardTableProps {
  /** 상위 3명 (빈 배열이면 빈 상태 렌더) */
  top3: LeaderboardRow[];
  /** 내 등수 행 (null이면 미표시) */
  myRow?: LeaderboardRow | null;
}

const TROPHY_COLORS = ['var(--accent-2)', 'var(--text-dim)', 'var(--accent)'];

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 8x8 픽셀 트로피 스프라이트 (인라인 SVG rect 조합 — PLAN §1.3) */
function Trophy({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 8 8" aria-hidden="true">
      <rect x="1" y="1" width="6" height="1" fill={color} />
      <rect x="2" y="2" width="4" height="2" fill={color} />
      <rect x="3" y="4" width="2" height="1" fill={color} />
      <rect x="2" y="6" width="4" height="1" fill={color} />
      <rect x="3" y="5" width="2" height="1" fill={color} />
    </svg>
  );
}

const cellStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '2px solid var(--bg-deep)',
  textAlign: 'right' as const,
  fontFamily: 'var(--font-pixel)',
  fontSize: 10,
};

export function LeaderboardTable({ top3, myRow }: LeaderboardTableProps) {
  if (top3.length === 0) {
    return (
      <div
        data-testid="lb-top3"
        style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-soft)',
        }}
      >
        <div className="px-font" style={{ fontSize: 10, marginBottom: 8 }}>
          NO RECORDS YET
        </div>
        <div style={{ fontSize: 13 }}>아직 기록이 없어요</div>
      </div>
    );
  }

  return (
    <table
      data-testid="lb-top3"
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: 'transparent',
      }}
    >
      <thead>
        <tr
          className="px-font"
          style={{ background: 'var(--bg)', color: 'var(--text-dim)' }}
        >
          <th style={{ ...cellStyle, textAlign: 'left' }}>RANK</th>
          <th style={{ ...cellStyle, textAlign: 'left' }}>PLAYER</th>
          <th style={cellStyle}>P</th>
          <th style={cellStyle}>W</th>
          <th style={cellStyle}>W%</th>
        </tr>
      </thead>
      <tbody>
        {top3.map((row, i) => (
          <tr key={row.nickname}>
            <td style={{ ...cellStyle, textAlign: 'left' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Trophy color={TROPHY_COLORS[Math.min(i, 2)]} />
                {row.rank ?? '-'}
              </span>
            </td>
            <td
              style={{
                ...cellStyle,
                textAlign: 'left',
                fontFamily: 'var(--font-kr)',
                fontSize: 14,
              }}
            >
              {row.nickname}
            </td>
            <td style={cellStyle}>{row.plays}</td>
            <td style={cellStyle}>{row.wins}</td>
            <td style={cellStyle}>{pct(row.winRate)}</td>
          </tr>
        ))}
        {myRow ? (
          <tr
            data-testid="lb-myrank"
            style={{ outline: '2px solid var(--accent)', outlineOffset: -2 }}
          >
            <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--accent-2)' }}>
              {myRow.rank ?? '-'}
            </td>
            <td
              style={{
                ...cellStyle,
                textAlign: 'left',
                fontFamily: 'var(--font-kr)',
                fontSize: 14,
                color: 'var(--accent-2)',
              }}
            >
              <span
                className="px-font"
                style={{ fontSize: 10, marginRight: 6, color: 'var(--accent)' }}
              >
                ▶
              </span>
              {myRow.nickname}
            </td>
            <td style={cellStyle}>{myRow.plays}</td>
            <td style={cellStyle}>{myRow.wins}</td>
            <td style={cellStyle}>{pct(myRow.winRate)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export default LeaderboardTable;
