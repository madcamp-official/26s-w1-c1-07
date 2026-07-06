/**
 * S8 게임 선택 (lobby 에이전트 소유).
 * 컨테이너 testid: scr-game-select / 카드: card-game1, card-game2, card-game3
 * PLAN §2-S8: 아케이드 캐비닛 3대 — 상단 마퀴(GAME 1 옐로 / GAME 2 시안 / GAME 3 핑크) +
 *   중앙 "스크린" 미니 픽토그램(게임1 '87'+↑↓ / 게임2 낙하 트레일 3줄 / 게임3 교차 검+파도) +
 *   하단 게임명(Gugi) + 컨트롤 패널 버튼 도트 2개. hover 시 그 캐비닛만 마퀴 점등(attract).
 *   좌상단 [◀ 메인으로](tertiary), 상단 중앙 소형 MADPUMP 워드마크.
 * SPEC QA-S8-01~04: 카드 클릭 → startOfflineGame(n); navigate(`/game/${n}`) — 매칭 없이 즉시.
 *   로그인 불필요(라우트 가드 없음). 메인 복귀 수단 = [◀ 메인으로].
 * 코인 해금 (shared/src/coins.ts): 1·3·6만 기본 오픈, 나머지는 2→7→4→8→5→9→10 순서로만
 *   해금 가능(비용 3→3→5→10→30→50→100). 잠긴 카드 중 "다음 순서"만 클릭 → 하단 확인 바 →
 *   POST /api/unlock. 비로그인은 해금 불가(기본 3종만 플레이 가능).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nextUnlock, unlockedGameIds } from '@madpump/shared';
import type { GameId } from '@/shell';
import { Button } from '../components';
import { useDebugScreen } from '../debug';
import { startOfflineGame } from '../state/flow';
import { restoreSession, unlockNextGame, useSession } from '../state/session';
import { FINAL_PICTOS } from './pictograms';
import './game-select.css';

interface CabinetSpec {
  id: GameId;
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
const CABINETS: CabinetSpec[] = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as GameId[]).map((id) => ({
  id,
  title: `GAME ${id}`,
  name: CAB_NAMES[id],
  colorVar: CAB_COLORS[(id - 1) % CAB_COLORS.length],
}));

/** ASCII 아트('#'=채움)를 SVG 픽셀 rect 배열로. 네온 스프라이트용 */
function pixels(art: string[], cell: number, ox = 0, oy = 0, key = 'p') {
  const out: React.ReactElement[] = [];
  art.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ' ' && ch !== '.')
        out.push(
          <rect key={`${key}-${x}-${y}`} x={ox + x * cell} y={oy + y * cell} width={cell} height={cell} />,
        );
    }),
  );
  return out;
}

/** 픽토그램 씬 공통 래퍼 — 120×108 캔버스에 네온 요소를 얹는다 */
function Scene({ children }: { children: React.ReactNode }) {
  return (
    <div className="s8-picto gpic" aria-hidden>
      <svg viewBox="0 0 120 108" preserveAspectRatio="xMidYMid meet">
        {children}
      </svg>
    </div>
  );
}

/* ── 게임4~10 픽셀아트/네온 스프라이트 (§1 팔레트·글로우 준수) ── */
const DINO = [
  '.....####.',
  '.....#.##.',
  '.....####.',
  '.....###..',
  '#....####.',
  '##..#####.',
  '.########.',
  '..#######.',
  '..##.##...',
  '..#...#...',
];
const CACTUS = ['..#..', '#.#..', '#.#.#', '###.#', '.#.##', '.#...', '.#...'];

/** 게임별 스크린 픽토그램 (순수 장식) */
function Pictogram({ id }: { id: GameId }) {
  // 게임5~10: 확정 시안 (pictograms.ts). 게임4는 아래 스프라이트 씬 유지.
  const finalPicto = FINAL_PICTOS[id];
  if (finalPicto) {
    return (
      <div className="s8-picto gpic" aria-hidden>
        <svg
          viewBox="0 0 120 108"
          preserveAspectRatio="xMidYMid meet"
          dangerouslySetInnerHTML={{ __html: finalPicto }}
        />
      </div>
    );
  }
  // 게임4: 공룡 달리기 — 시안 공룡이 핑크 선인장을 뛰어넘는 러너 씬
  if (id === 4) {
    return (
      <Scene>
        <g className="gp-dim gp-stroke">
          <line x1="6" y1="94" x2="114" y2="94" strokeWidth="2" />
        </g>
        <g className="gp-cyan gp-dim2 gp-stroke">
          <line x1="8" y1="60" x2="20" y2="60" strokeWidth="2" />
          <line x1="6" y1="72" x2="22" y2="72" strokeWidth="2" />
        </g>
        <g className="gp-cyan gp-fill gp-glow">{pixels(DINO, 4, 30, 40, 'dino')}</g>
        <g className="gp-pink gp-fill gp-glow">{pixels(CACTUS, 4, 82, 66, 'cac')}</g>
      </Scene>
    );
  }
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
  // 안전망 (id 1~10 외) — 게임 번호 픽토그램
  return (
    <div className="s8-picto s8-picto--gN" aria-hidden>
      <span className="s8-gN-num font-arcade glow-text">{id}</span>
    </div>
  );
}

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();
  const session = useSession();

  /** 해금 확인 바 대상 (다음 순서 게임 클릭 시) */
  const [armed, setArmed] = useState<GameId | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // 매치/해금으로 코인이 변했을 수 있으니 진입 시 지갑 새로고침
  useEffect(() => {
    if (session.loggedIn) void restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlocked = unlockedGameIds(session.loggedIn ? session.unlockedCount : 0);
  const next = session.loggedIn ? nextUnlock(session.unlockedCount) : null;

  const pick = (id: GameId) => {
    if (unlocked.has(id)) {
      startOfflineGame(id); // 매칭 단계 없이 즉시 인게임 (주석 16:1665)
      navigate(`/game/${id}`);
      return;
    }
    // 잠긴 게임: 다음 해금 순서인 것만 확인 바 표시
    setUnlockError(null);
    if (next && id === next.gameId) setArmed(id);
  };

  const onUnlock = async () => {
    if (unlocking || !next) return;
    setUnlocking(true);
    const r = await unlockNextGame();
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
          const isNext = next?.gameId === cab.id;
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
              aria-disabled={isLocked && !isNext}
            >
              <span className="s8-marquee">
                <span className="lamp" aria-hidden />
                <span className="s8-marquee-title font-arcade">{cab.title}</span>
                <span className="lamp" aria-hidden />
              </span>
              <span className="s8-screen">
                <Pictogram id={cab.id} />
                {isLocked && (
                  <span className="s8-lock" aria-hidden>
                    <span className="s8-lock-icon">🔒</span>
                    {isNext ? (
                      <span className="s8-lock-cost font-arcade">{next!.cost} COIN</span>
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

      {/* 해금 확인 바 — 잠긴 "다음 순서" 카드를 눌렀을 때 */}
      {armed !== null && next && (
        <div className="s8-unlock-bar" data-testid="unlock-bar" role="dialog" aria-live="polite">
          <span className="font-display">
            GAME {next.gameId} ({CAB_NAMES[next.gameId]}) 를{' '}
            <strong className="c-accent">{next.cost}코인</strong>으로 해금할까요?
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
