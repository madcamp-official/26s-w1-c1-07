/**
 * Ticker — 화면 최하단 풀폭 네이비 뉴스 티커 (PLAN §1.3 전 화면 공통 앵커).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 30s 무한 linear 스크롤. prefers-reduced-motion 시 정지(정적 표시).
 * position: fixed — 화면 루트에 한 번만 넣는다. 본문이 가려지지 않게
 * 화면 컨테이너에 paddingBottom: 'var(--ticker-h)' 를 줄 것.
 *
 * 사용법 (S1/S2 등에서):
 *   <Ticker items={['펌프광인, 게임1 3연승 달성', 'MADPUMP 시즌 26S W1 진행 중']} />
 *   items 생략 시 mock 최근 매치 기반 기본 문구를 사용.
 */
import { mockMatches, mockUsers } from '@shared';

export interface TickerProps {
  /** 스크롤 문구 목록. 생략 시 mock 매치 결과 기반 기본 문구 */
  items?: readonly string[];
}

function defaultItems(): string[] {
  const byId = new Map(mockUsers.map((u) => [u.id, u.nickname]));
  const recent = [...mockMatches].slice(-6).reverse();
  const lines = recent.map((m) => {
    const p1 = byId.get(m.player1Id) ?? '?';
    const p2 = byId.get(m.player2Id) ?? '?';
    const label =
      m.result === 'P1_WIN' ? `${p1} 승` : m.result === 'P2_WIN' ? `${p2} 승` : '무승부';
    return `GAME ${m.gameId} — ${p1} vs ${p2} · ${label}`;
  });
  return ['OFFICIAL PUMPING LEAGUE — 26S W1', ...lines];
}

export default function Ticker({ items }: TickerProps) {
  const list = items && items.length > 0 ? [...items] : defaultItems();
  // 이음새 없는 무한 스크롤을 위해 목록을 2벌 이어붙이고 -50%까지 이동
  const doubled = [...list, ...list];
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: 'var(--ticker-h)',
        background: 'var(--strip)',
        color: '#fff',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        zIndex: 50,
      }}
    >
      <div
        data-anim="ticker"
        style={{
          display: 'flex',
          gap: 0,
          whiteSpace: 'nowrap',
          animation: 'ticker-scroll 30s linear infinite',
          willChange: 'transform',
        }}
      >
        {doubled.map((text, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 24px',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontStretch: '80%',
              fontSize: 13,
              letterSpacing: '0.05em',
            }}
          >
            {text}
            <span style={{ color: 'var(--gold-bright)' }}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
