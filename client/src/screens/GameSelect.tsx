/**
 * S8 게임 선택 (lobby 에이전트 소유).
 * 컨테이너 testid: scr-game-select / 카드: card-game{내부id} (예: card-game1, card-game5)
 *
 * 표시 순서·넘버링 (shared/coins.ts GAME_ORDER = [1,3,6,2,10,4,8,5,7,9]):
 *   캐비닛은 GAME_ORDER 순으로 늘어서고, 마퀴 라벨 "GAME 1..10" 은 게임 내부 id 가 아니라
 *   이 배열의 위치(1-기반)를 따른다. 라우팅·픽토그램·테스트 id 는 내부 id 를 그대로 쓴다.
 *
 * 해금 (shared/coins.ts):
 *   표시 순서의 마지막 두 게임(LOCKABLE_GAME_IDS)만 잠겨 있고 나머지는 처음부터 오픈.
 *   잠긴 두 게임은 순서와 무관하게 각각 독립적으로 해금 가능(로그인 필요).
 *   잠긴 카드 클릭 → 하단 확인 바 → POST /api/unlock({gameId}). 비로그인은 해금 불가.
 *
 * SPEC QA-S8-01~04: 카드 클릭 → startOfflineGame(id); navigate(`/game/${id}`) — 매칭 없이 즉시.
 *   로그인 불필요(라우트 가드 없음). 메인 복귀 수단 = [◀ 메인으로].
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_ORDER, isLockable, unlockCost, unlockedGameIds } from '@madpump/shared';
import type { GameId } from '@/shell';
import { Button } from '../components';
import { useDebugScreen } from '../debug';
import { startOfflineGame } from '../state/flow';
import { restoreSession, unlockGame, useSession } from '../state/session';
import './game-select.css';
import '../global-interaction.css';

interface CabinetSpec {
  id: GameId;
  /** 표시 순서 위치(1-기반) — 마퀴 "GAME N" 라벨 */
  displayNo: number;
  title: string;
  name: string;
  colorVar: string;
}

const CAB_COLORS = ['var(--accent)', 'var(--p1)', 'var(--p2)', 'var(--accent2)', 'var(--win)'];
const CAB_NAMES: Record<GameId, string> = {
  1: '숫자 맞추기',
  2: '로켓 피하기',
  3: '펜싱',
  4: '공룡 달리기',
  5: '몬스터 포격전',
  6: '펌프',
  7: '스피드 오목',
  8: '마그마 총격 듀얼',
  9: '줄다리기',
  10: '라이트 사이클',
};
/** GAME_ORDER 순으로 캐비닛 구성 — 라벨/색은 위치, 정체성(id·이름·픽토)은 내부 id */
const CABINETS: CabinetSpec[] = (GAME_ORDER as readonly GameId[]).map((id, i) => ({
  id,
  displayNo: i + 1,
  title: `GAME ${i + 1}`,
  name: CAB_NAMES[id],
  colorVar: CAB_COLORS[i % CAB_COLORS.length],
}));

/** 게임별 스크린 픽토그램 (순수 장식). id 1~3 은 고유 아트, 그 외는 표시 번호. */
function Pictogram({ id, displayNo }: { id: GameId; displayNo: number }) {
  if (id === 1) {
    return (
      <div className="s8-picto s8-picto--g1" aria-hidden>
        <span className="s8-g1-arrow s8-g1-arrow--up font-arcade">▲</span>
        <span className="s8-g1-num font-arcade">87</span>
        <span className="s8-g1-arrow s8-g1-arrow--down font-arcade">▼</span>
      </div>
    );
  }
  if (id === 2) {
    return (
      <div className="s8-picto s8-picto--g2" aria-hidden>
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
      </div>
    );
  }
  if (id === 3) {
    return (
      <div className="s8-picto s8-picto--g3" aria-hidden>
        <span className="s8-g3-blades">
          <span className="s8-g3-blade s8-g3-blade--p1" />
          <span className="s8-g3-blade s8-g3-blade--p2" />
        </span>
        <svg className="s8-g3-wave" viewBox="0 0 120 14" preserveAspectRatio="none">
          <polyline
            points="0,12 15,3 30,12 45,3 60,12 75,3 90,12 105,3 120,12"
            fill="none"
            stroke="var(--p1)"
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  }
  // 그 외 게임: 표시 번호 픽토그램
  return (
    <div className="s8-picto s8-picto--gN" aria-hidden>
      <span className="s8-gN-num font-arcade glow-text">{displayNo}</span>
    </div>
  );
}

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();
  const session = useSession();

  /** 해금 확인 바 대상 (잠긴 카드 클릭 시) */
  const [armed, setArmed] = useState<GameId | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // 매치/해금으로 코인이 변했을 수 있으니 진입 시 지갑 새로고침
  useEffect(() => {
    if (session.loggedIn) void restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unlocked_count 는 비트마스크 — 비로그인은 0(기본 오픈만)
  const unlocked = unlockedGameIds(session.loggedIn ? session.unlockedCount : 0);
  const armedCab = armed !== null ? CABINETS.find((c) => c.id === armed) ?? null : null;

  const pick = (id: GameId) => {
    if (unlocked.has(id)) {
      startOfflineGame(id); // 매칭 단계 없이 즉시 인게임 (주석 16:1665)
      navigate(`/game/${id}`);
      return;
    }
    // 잠긴 게임: 로그인 상태에서만 해금 확인 바 (순서 무관 자유 해금)
    setUnlockError(null);
    if (session.loggedIn && isLockable(id)) setArmed(id);
  };

  const onUnlock = async () => {
    if (unlocking || armed === null) return;
    setUnlocking(true);
    const r = await unlockGame(armed);
    setUnlocking(false);
    if (r.error) {
      setUnlockError(r.error);
      return;
    }
    setArmed(null); // 성공 — 세션 store가 갱신돼 카드가 열린다
  };

  return (
    <main data-testid="scr-game-select" className="s8-root">
      <div className="vanish-grid" aria-hidden />

      <header className="s8-header">
        <Button variant="tertiary" onClick={() => navigate('/')}>
          ◀ 메인으로
        </Button>
        <p className="s8-wordmark font-arcade" aria-label="MADPUMP">
          <span className="c-p2 glow-text">MAD</span>
          <span className="c-p1 glow-text">PUMP</span>
        </p>
        {session.loggedIn ? (
          <span className="s8-coins font-arcade c-accent glow-text" data-testid="coin-balance">
            🪙 {session.coins}
          </span>
        ) : (
          <span className="s8-header-spacer" aria-hidden />
        )}
      </header>

      <p className="s8-caption font-arcade c-accent2">SELECT YOUR GAME</p>

      <div className="s8-floor">
        {CABINETS.map((cab) => {
          const isLocked = !unlocked.has(cab.id);
          const canUnlock = isLocked && session.loggedIn; // 로그인 시 어느 잠금 게임이든 해금 가능
          return (
            <button
              key={cab.id}
              type="button"
              className={`s8-cabinet${isLocked ? ' s8-cabinet--locked' : ''}${
                armed === cab.id ? ' s8-cabinet--armed' : ''
              }`}
              data-testid={`card-game${cab.id}`}
              style={{ '--cab-color': cab.colorVar } as React.CSSProperties}
              onClick={() => pick(cab.id)}
              aria-disabled={isLocked && !canUnlock}
            >
              <span className="s8-marquee">
                <span className="lamp" aria-hidden />
                <span className="s8-marquee-title font-arcade">{cab.title}</span>
                <span className="lamp" aria-hidden />
              </span>
              <span className="s8-screen">
                <Pictogram id={cab.id} displayNo={cab.displayNo} />
                {isLocked && (
                  <span className="s8-lock" aria-hidden>
                    <span className="s8-lock-icon">🔒</span>
                    {canUnlock ? (
                      <span className="s8-lock-cost font-arcade">{unlockCost(cab.id)} COIN</span>
                    ) : (
                      <span className="s8-lock-cost font-arcade c-muted">LOCKED</span>
                    )}
                  </span>
                )}
              </span>
              <span className="s8-name font-display">{cab.name}</span>
              <span className="s8-panel" aria-hidden>
                <span className="s8-dot s8-dot--p1" />
                <span className="s8-dot s8-dot--p2" />
              </span>
            </button>
          );
        })}
      </div>

      {/* 해금 확인 바 — 잠긴 카드를 눌렀을 때 (순서 무관) */}
      {armedCab && (
        <div className="s8-unlock-bar" data-testid="unlock-bar" role="dialog" aria-live="polite">
          <span className="font-display">
            GAME {armedCab.displayNo} ({armedCab.name}) 를{' '}
            <strong className="c-accent">{unlockCost(armedCab.id)}코인</strong>으로 해금할까요?
          </span>
          {unlockError && <span className="s8-unlock-err c-error font-display">{unlockError}</span>}
          <div className="s8-unlock-actions">
            <Button variant="primary" data-testid="btn-unlock" onClick={onUnlock} disabled={unlocking}>
              {unlocking ? '해금 중…' : '해금하기'}
            </Button>
            <Button variant="tertiary" onClick={() => setArmed(null)} disabled={unlocking}>
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 코인 노가다 미니게임 (준비 중 — mock 버튼) */}
      <button
        type="button"
        className="s8-grind font-display"
        data-testid="btn-coin-grind"
        disabled
        title="준비 중"
      >
        ⛏ 코인 노가다하기 <span className="s8-grind-soon font-arcade">SOON</span>
      </button>
    </main>
  );
}
