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
const INVADER = [
  '..#.....#..',
  '...#...#...',
  '..#######..',
  '.##.###.##.',
  '###########',
  '#.#######.#',
  '#.#...#.#.#',
  '...##.##...',
];
const CANNON = ['.#####.', '#######', '##.#.##'];

/** 게임별 스크린 픽토그램 (순수 장식) */
function Pictogram({ id }: { id: GameId }) {
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
  // 게임5: 몬스터 포격전 — 시안 대포가 옐로 예광탄으로 핑크 몬스터 격추
  if (id === 5) {
    return (
      <Scene>
        <g className="gp-pink gp-fill gp-glow">{pixels(INVADER, 4, 38, 12, 'inv')}</g>
        <g className="gp-cyan gp-fill gp-glow">{pixels(CANNON, 4, 40, 82, 'can')}</g>
        <g className="gp-cyan gp-stroke gp-glow">
          <line x1="54" y1="82" x2="64" y2="62" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g className="gp-yellow gp-stroke gp-glow">
          <line x1="66" y1="60" x2="82" y2="34" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 6" />
        </g>
        <g className="gp-yellow gp-fill gp-glow">
          <circle cx="84" cy="31" r="3.5" />
        </g>
      </Scene>
    );
  }
  // 게임6: 펌프 — DDR식 노트 하이웨이(시안/핑크 레인)가 옐로 히트라인으로 수렴
  if (id === 6) {
    return (
      <Scene>
        <g className="gp-cyan gp-dim2 gp-stroke">
          <line x1="30" y1="80" x2="50" y2="24" strokeWidth="2" />
          <line x1="52" y1="80" x2="58" y2="24" strokeWidth="2" />
        </g>
        <g className="gp-pink gp-dim2 gp-stroke">
          <line x1="90" y1="80" x2="70" y2="24" strokeWidth="2" />
          <line x1="68" y1="80" x2="62" y2="24" strokeWidth="2" />
        </g>
        <g className="gp-cyan gp-dim2 gp-fill">
          <path d="M50 40 l10 0 l-5 8 z" />
        </g>
        <g className="gp-pink gp-dim2 gp-fill">
          <path d="M60 40 l10 0 l-5 8 z" />
        </g>
        <g className="gp-cyan gp-fill gp-glow">
          <path d="M28 58 l18 0 l-9 14 z" />
        </g>
        <g className="gp-pink gp-fill gp-glow">
          <path d="M74 58 l18 0 l-9 14 z" />
        </g>
        <g className="gp-yellow gp-stroke gp-glow">
          <line x1="16" y1="80" x2="104" y2="80" strokeWidth="4" strokeLinecap="round" />
        </g>
      </Scene>
    );
  }
  // 게임7: 스피드 오목 — 7목판에 시안 3목 승리라인 + 핑크 돌 + 옐로 스캐너 커서
  if (id === 7) {
    const cols = [24, 42, 60, 78, 96];
    const rows = [18, 36, 54, 72, 90];
    return (
      <Scene>
        <g className="gp-mag gp-dim2 gp-stroke">
          {cols.map((x) => (
            <line key={`c${x}`} x1={x} y1={rows[0]} x2={x} y2={rows[4]} strokeWidth="1" />
          ))}
          {rows.map((y) => (
            <line key={`r${y}`} x1={cols[0]} y1={y} x2={cols[4]} y2={y} strokeWidth="1" />
          ))}
        </g>
        <g className="gp-cyan gp-stroke gp-glow">
          <line x1={cols[1]} y1={rows[1]} x2={cols[3]} y2={rows[3]} strokeWidth="4" strokeLinecap="round" />
        </g>
        <g className="gp-cyan gp-fill gp-glow">
          <circle cx={cols[1]} cy={rows[1]} r="7" />
          <circle cx={cols[2]} cy={rows[2]} r="7" />
          <circle cx={cols[3]} cy={rows[3]} r="7" />
        </g>
        <g className="gp-pink gp-fill gp-glow">
          <circle cx={cols[3]} cy={rows[0]} r="7" />
          <circle cx={cols[1]} cy={rows[3]} r="7" />
        </g>
        <g className="gp-yellow gp-stroke gp-glow">
          <rect x={cols[3] - 9} y={rows[4] - 9} width="18" height="18" strokeWidth="2" />
        </g>
      </Scene>
    );
  }
  // 게임8: 마그마 총격 듀얼 — 상단 가시/하단 마그마 사이 시안·핑크 기체 대결 + 예광탄
  if (id === 8) {
    return (
      <Scene>
        <g className="gp-mag gp-dim2 gp-fill">
          <path d="M10 8 l8 12 l8 -12 l8 12 l8 -12 l8 12 l8 -12 l8 12 l8 -12 l8 12 l8 -12 l8 12 l6 -12 z" />
        </g>
        <g className="gp-yellow gp-magma gp-fill">
          <path d="M6 100 L114 100 L114 86 L104 80 L92 88 L80 80 L66 88 L54 80 L42 88 L30 80 L18 88 L6 82 Z" />
        </g>
        <g className="gp-yellow gp-stroke gp-glow">
          <path d="M6 82 L18 88 L30 80 L42 88 L54 80 L66 88 L80 80 L92 88 L104 80 L114 86" strokeWidth="2.5" fill="none" />
        </g>
        <g className="gp-cyan gp-fill gp-glow">
          <path d="M22 46 l16 8 l-16 8 l4 -8 z" />
        </g>
        <g className="gp-pink gp-fill gp-glow">
          <path d="M98 46 l-16 8 l16 8 l-4 -8 z" />
        </g>
        <g className="gp-cyan gp-stroke gp-glow">
          <line x1="42" y1="54" x2="70" y2="54" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 5" />
        </g>
      </Scene>
    );
  }
  // 게임9: 줄다리기 — 밧줄 + 중앙보다 P1쪽으로 당겨진 매듭, 좌 시안·우 핑크 당김
  if (id === 9) {
    return (
      <Scene>
        <g className="gp-dim gp-stroke">
          <line x1="60" y1="34" x2="60" y2="82" strokeWidth="1" strokeDasharray="3 4" />
        </g>
        <g className="gp-dim gp-stroke">
          <line x1="16" y1="58" x2="104" y2="58" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 6" />
        </g>
        <g className="gp-yellow gp-fill gp-glow">
          <path d="M50 58 l7 -9 l7 9 l-7 9 z" />
        </g>
        <g className="gp-cyan gp-stroke gp-glow">
          <path d="M30 48 l-10 10 l10 10 M42 48 l-10 10 l10 10" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g className="gp-pink gp-stroke gp-glow">
          <path d="M90 48 l10 10 l-10 10 M78 48 l10 10 l-10 10" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </Scene>
    );
  }
  // 게임10: 라이트 사이클 — 그리드 위 시안·핑크 궤적이 직각으로 꺾이며 교차
  if (id === 10) {
    const g = [];
    for (let x = 12; x <= 108; x += 16) g.push(<line key={`gv${x}`} x1={x} y1="16" x2={x} y2="96" strokeWidth="0.75" />);
    for (let y = 16; y <= 96; y += 16) g.push(<line key={`gh${y}`} x1="12" y1={y} x2="108" y2={y} strokeWidth="0.75" />);
    return (
      <Scene>
        <g className="gp-mag gp-grid gp-stroke">{g}</g>
        <g className="gp-cyan gp-stroke gp-glow">
          <polyline points="12,64 46,64 46,30" strokeWidth="3" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
        </g>
        <g className="gp-cyan gp-fill gp-glow">
          <rect x="42" y="26" width="8" height="8" />
        </g>
        <g className="gp-pink gp-stroke gp-glow">
          <polyline points="108,44 74,44 74,82" strokeWidth="3" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
        </g>
        <g className="gp-pink gp-fill gp-glow">
          <rect x="70" y="78" width="8" height="8" />
        </g>
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
