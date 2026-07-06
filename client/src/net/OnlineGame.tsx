/**
 * OnlineGame — 온라인 매치 전용 라우트(`/online/game/:gameId`) 디스패처.
 *
 * 온라인 매치는 오프라인(`/game/N`)과 URL을 구분한다:
 *   · 라이브 매치 컨텍스트(online store에 gameId)가 있으면 해당 게임 화면을 렌더.
 *   · 컨텍스트가 없으면(주소 직접 접속 / 새로고침으로 소켓이 끊긴 경우) — 매치는
 *     서버 상태라 URL만으로 이어갈 수 없으므로 메인으로 돌려보낸다(오프라인으로 빠지지 않음).
 *
 * (오프라인 `/game/N` 은 그대로 각 GameN 컴포넌트가 직접 처리 — 직접 접속 시 오프라인 시작)
 */
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useOnline } from './online';
import Game1 from '../screens/game/Game1';
import Game2 from '../screens/game/Game2';
import Game3 from '../screens/game/Game3';
import Game4 from '../screens/game/Game4';
import Game5 from '../screens/game/Game5';
import Game6 from '../screens/game/Game6';
import Game7 from '../screens/game/Game7';
import Game8 from '../screens/game/Game8';
import Game9 from '../screens/game/Game9';
import Game10 from '../screens/game/Game10';

const GAMES: Record<number, ComponentType> = {
  1: Game1,
  2: Game2,
  3: Game3,
  4: Game4,
  5: Game5,
  6: Game6,
  7: Game7,
  8: Game8,
  9: Game9,
  10: Game10,
};

export default function OnlineGame() {
  const { gameId } = useParams();
  const o = useOnline();
  const navigate = useNavigate();

  // 라이브 온라인 매치 컨텍스트가 없으면(직접 접속·새로고침) 메인으로 — 매치는 서버 상태라 URL로 못 이어감.
  useEffect(() => {
    if (o.gameId == null) navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (o.gameId == null) return null; // 리다이렉트 중
  const G = GAMES[Number(gameId)];
  return G ? <G /> : <Navigate to="/" replace />;
}
