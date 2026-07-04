/**
 * S8. 게임 선택 — 카트리지 진열대 (scr-game-select) (PLAN §2 S8)
 * [소유: lobby 에이전트]
 *
 * - 카트리지 카드 3개 (card-game1/2/3) — 시그니처 컬러 라벨 + 도트아트 + 단자 빗살
 * - 클릭 → 슬롯 꽂힘 step 애니 + 부트 플래시 → startMatch('offline', n) →
 *   navigate('/game/n') — 매칭 단계 없이 즉시 (QA-S8-02, 주석 16:1665)
 * - ◀ BACK → '/' (QA-S8-04) / 로그인 불필요 (QA-S8-03)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameId } from '@shared';
import { Button } from '../components';
import { useDebugScreen } from '../debug';
import { startMatch } from '../state/flow';
import './GameSelect.css';

const BOOT_MS = 400; // 카트리지 꽂힘 + 부트 플래시 연출

/* 게임1 — 오렌지: 숫자 게이지 탑 도트아트 */
function Game1Art() {
  return (
    <svg width="96" height="96" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="10" width="3" height="4" fill="var(--accent)" />
      <rect x="2" y="8" width="3" height="2" fill="var(--accent-2)" />
      <rect x="11" y="6" width="3" height="8" fill="var(--accent)" />
      <rect x="11" y="4" width="3" height="2" fill="var(--accent-2)" />
      {/* 타겟 점선 마커 */}
      <rect x="1" y="3" width="2" height="1" fill="var(--accent-2)" />
      <rect x="5" y="3" width="2" height="1" fill="var(--accent-2)" />
      <rect x="9" y="3" width="2" height="1" fill="var(--accent-2)" />
      <rect x="13" y="3" width="2" height="1" fill="var(--accent-2)" />
      {/* 바닥 */}
      <rect x="0" y="14" width="16" height="1" fill="var(--accent)" />
    </svg>
  );
}

/* 게임2 — 블루: UFO + 총알 도트아트 */
function Game2Art() {
  return (
    <svg width="96" height="96" viewBox="0 0 16 16" aria-hidden="true">
      {/* UFO */}
      <rect x="5" y="1" width="6" height="2" fill="var(--p1)" />
      <rect x="4" y="3" width="8" height="2" fill="var(--p1)" />
      <rect x="7" y="5" width="2" height="1" fill="var(--text)" />
      {/* 낙하 총알 + 잔상 */}
      <rect x="7" y="7" width="2" height="3" fill="var(--text)" />
      <rect x="7" y="6" width="2" height="1" fill="var(--accent-2)" />
      <rect x="3" y="9" width="2" height="2" fill="var(--text-soft)" />
      <rect x="12" y="8" width="1" height="2" fill="var(--text-soft)" />
      {/* 러너 */}
      <rect x="6" y="12" width="4" height="2" fill="var(--p2)" />
      <rect x="7" y="11" width="2" height="1" fill="var(--p2)" />
      <rect x="0" y="14" width="16" height="1" fill="var(--text-soft)" />
    </svg>
  );
}

/* 게임3 — 그린: 펜서 대치 + 바다 도트아트 */
function Game3Art() {
  return (
    <svg width="96" height="96" viewBox="0 0 16 16" aria-hidden="true">
      {/* 좌 펜서 (블루) */}
      <rect x="2" y="6" width="2" height="2" fill="var(--p1)" />
      <rect x="2" y="8" width="2" height="3" fill="var(--p1)" />
      <rect x="4" y="8" width="3" height="1" fill="var(--text)" />
      {/* 우 펜서 (레드) */}
      <rect x="12" y="6" width="2" height="2" fill="var(--p2)" />
      <rect x="12" y="8" width="2" height="3" fill="var(--p2)" />
      <rect x="10" y="9" width="2" height="2" fill="var(--surface-3)" />
      {/* 그린 플랫폼 (칸 홈) */}
      <rect x="2" y="11" width="12" height="2" fill="var(--ok)" />
      <rect x="5" y="11" width="1" height="2" fill="var(--bg-deep)" />
      <rect x="8" y="11" width="1" height="2" fill="var(--bg-deep)" />
      <rect x="11" y="11" width="1" height="2" fill="var(--bg-deep)" />
      {/* 좌우 바다 */}
      <rect x="0" y="13" width="2" height="2" fill="var(--p1)" />
      <rect x="14" y="13" width="2" height="2" fill="var(--p1)" />
    </svg>
  );
}

interface CartInfo {
  id: GameId;
  testId: string;
  label: string;
  labelBg: string;
  name: string;
  desc: string;
  art: () => JSX.Element;
}

const CARTS: CartInfo[] = [
  {
    id: 1,
    testId: 'card-game1',
    label: 'PUMP IT!',
    labelBg: 'var(--accent)',
    name: '게임1 · 숫자 맞추기',
    desc: '타겟 숫자에 내 숫자를 맞추고 3초 버티면 승리!',
    art: Game1Art,
  },
  {
    id: 2,
    testId: 'card-game2',
    label: 'DODGE!',
    labelBg: 'var(--p1)',
    name: '게임2 · 총알 피하기',
    desc: '위에서 쏟아지는 총알을 피해 끝까지 살아남아라!',
    art: Game2Art,
  },
  {
    id: 3,
    testId: 'card-game3',
    label: 'EN GARDE!',
    labelBg: 'var(--ok)',
    name: '게임3 · 펜싱',
    desc: '찌르고 막는 심리전 — 상대를 바다로 밀어내라!',
    art: Game3Art,
  },
];

export default function GameSelect() {
  useDebugScreen('scr-game-select');
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<CartInfo | null>(null);
  const [booting, setBooting] = useState<GameId | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const select = (id: GameId) => {
    if (booting !== null) return;
    setBooting(id);
    startMatch('offline', id); // 매칭 없이 즉시 (주석 16:1665)
    timerRef.current = window.setTimeout(() => navigate(`/game/${id}`), BOOT_MS);
  };

  return (
    <div data-testid="scr-game-select" className="gs-screen px-snap-in">
      <div className="gs-top">
        <Button variant="ghost" size="sm" pixelFont onClick={() => navigate('/')}>
          ◀ BACK
        </Button>
        <h1 className="gs-heading">SELECT YOUR GAME</h1>
        {/* 헤딩 중앙정렬 밸런스용 스페이서 */}
        <span style={{ width: 96 }} aria-hidden="true" />
      </div>

      <div className="gs-shelf">
        {CARTS.map((cart) => {
          const Art = cart.art;
          return (
            <button
              key={cart.id}
              type="button"
              data-testid={cart.testId}
              className={booting === cart.id ? 'gs-cart is-booting' : 'gs-cart'}
              onClick={() => select(cart.id)}
              onMouseEnter={() => setHovered(cart)}
              onMouseLeave={() => setHovered((h) => (h?.id === cart.id ? null : h))}
              onFocus={() => setHovered(cart)}
            >
              <div className="gs-cart-label" style={{ background: cart.labelBg }}>
                {cart.label}
              </div>
              <div className="gs-cart-art">
                <Art />
              </div>
              <div className="gs-cart-name">
                <span className="gs-cart-cursor" aria-hidden="true">
                  ▶
                </span>
                {cart.name}
              </div>
              <div className="gs-cart-pins" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* 하단 안내 바 — hover한 카트리지 설명 1줄 */}
      <div className="gs-infobar" aria-live="polite">
        {hovered ? (
          <>
            <span className="gs-info-cursor" aria-hidden="true">
              ▶
            </span>
            {hovered.desc}
          </>
        ) : (
          <span style={{ color: 'var(--text-soft)' }}>카트리지를 골라 슬롯에 꽂아 보세요</span>
        )}
      </div>

      {booting !== null ? <div className="gs-flash" aria-hidden="true" /> : null}
    </div>
  );
}
