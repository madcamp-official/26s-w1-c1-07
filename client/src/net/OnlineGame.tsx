/**
 * OnlineGame — dispatcher for the online-match-only route (`/online/game/:gameId`).
 *
 * Online matches use a distinct URL from offline (`/game/N`):
 *   · If a live match context exists (gameId in the online store), render that game screen.
 *   · If there is no context (direct URL access / socket dropped on refresh) — the match is
 *     server state and can't be resumed from the URL alone, so send the user back to main
 *     (do not fall through to offline).
 *
 * (Offline `/game/N` is still handled directly by each GameN component — direct access starts offline.)
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
import Game11 from '../screens/game/Game11';
import Game12 from '../screens/game/Game12';
import Game13 from '../screens/game/Game13';

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
  11: Game11,
  12: Game12,
  13: Game13,
};

export default function OnlineGame() {
  const { gameId } = useParams();
  const o = useOnline();
  const navigate = useNavigate();

  // If there's no live online-match context (direct access / refresh), go to main — the match is server state and can't be resumed from the URL.
  useEffect(() => {
    if (o.gameId == null) navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (o.gameId == null) return null; // redirecting
  const G = GAMES[Number(gameId)];
  return G ? <G /> : <Navigate to="/" replace />;
}
