/**
 * App — routing + modal host + global CRT overlay (owned by the architect — implementation agents must not modify).
 *
 * Routes:
 *   /            → session gate: loggedIn ? S2(MainLoggedIn) : S1(MainLoggedOut)
 *   /select      → S8 Game Select (login not required)
 *   /game/1|2|3  → S9 / S10·S11 / S12
 * (Onboarding (S5) was dropped with the switch to roster login — nickname/class are fixed in the roster, docs/AUTH.md)
 *
 * The 5 modals are always mounted as a global host — each modal opens/closes itself by watching flow.modal.
 * (Placed inside BrowserRouter so modal components can use useNavigate)
 * Scanlines + vignette (.crt-overlay) are rendered only once here — screens must not render duplicates.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './state/session';
import MainLoggedOut from './screens/MainLoggedOut';
import MainLoggedIn from './screens/MainLoggedIn';
import GameSelect from './screens/GameSelect';
import CoinFarm from './screens/CoinFarm';
import Game1 from './screens/game/Game1';
import Game2 from './screens/game/Game2';
import Game3 from './screens/game/Game3';
import Game4 from './screens/game/Game4';
import Game5 from './screens/game/Game5';
import Game6 from './screens/game/Game6';
import Game7 from './screens/game/Game7';
import Game8 from './screens/game/Game8';
import Game9 from './screens/game/Game9';
import Game10 from './screens/game/Game10';
import Game11 from './screens/game/Game11';
import Game12 from './screens/game/Game12';
import Game13 from './screens/game/Game13';
import LoginRequiredModal from './modals/LoginRequired';
import LoginModal from './modals/Login';
import SettingsModal from './modals/Settings';
import ThemeShopModal from './modals/ThemeShop';
import RankingModal from './modals/Ranking';
import OnlineModal from './modals/Online';
import MatchingModal from './modals/Matching';
import OnlineController from './net/OnlineController';
import OnlineGame from './net/OnlineGame';

function MainGate() {
  const session = useSession();
  return session.loggedIn ? <MainLoggedIn /> : <MainLoggedOut />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainGate />} />
        <Route path="/select" element={<GameSelect />} />
        <Route path="/farm" element={<CoinFarm />} />
        <Route path="/game/1" element={<Game1 />} />
        <Route path="/game/2" element={<Game2 />} />
        <Route path="/game/3" element={<Game3 />} />
        <Route path="/game/4" element={<Game4 />} />
        <Route path="/game/5" element={<Game5 />} />
        <Route path="/game/6" element={<Game6 />} />
        <Route path="/game/7" element={<Game7 />} />
        <Route path="/game/8" element={<Game8 />} />
        <Route path="/game/9" element={<Game9 />} />
        <Route path="/game/10" element={<Game10 />} />
        <Route path="/game/11" element={<Game11 />} />
        <Route path="/game/12" element={<Game12 />} />
        <Route path="/game/13" element={<Game13 />} />
        {/* Online-match-only URL (distinct from offline /game/N) — no live context → back to main */}
        <Route path="/online/game/:gameId" element={<OnlineGame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Global modal host */}
      <LoginRequiredModal />
      <LoginModal />
      <SettingsModal />
      <ThemeShopModal />
      <RankingModal />
      <OnlineModal />
      <MatchingModal />
      {/* Online match navigation + end overlay (live server) */}
      <OnlineController />
      {/* Global scanlines + vignette (PLAN §1.3) — always on top, click-through */}
      <div className="crt-overlay" aria-hidden />
    </BrowserRouter>
  );
}
