/**
 * App — 라우팅 + 모달 호스트 + 전역 CRT 오버레이 (아키텍트 소유 — 구현 에이전트 수정 금지).
 *
 * 라우트:
 *   /            → 세션 게이트: loggedIn ? S2(MainLoggedIn) : S1(MainLoggedOut)
 *   /select      → S8 게임 선택 (로그인 불필요)
 *   /game/1|2|3  → S9 / S10·S11 / S12
 * (온보딩(S5)은 로스터 로그인 전환으로 폐기 — 닉네임/분반이 명단에 고정, docs/AUTH.md)
 *
 * 모달 5종은 전역 호스트로 항상 마운트 — 각 모달이 flow.modal을 보고 스스로 열림/닫힘.
 * (모달 컴포넌트 안에서 useNavigate 사용 가능하도록 BrowserRouter 안에 위치)
 * 스캔라인+비네팅(.crt-overlay)은 여기서 1장만 렌더 — 화면들이 중복 렌더하지 말 것.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './state/session';
import MainLoggedOut from './screens/MainLoggedOut';
import MainLoggedIn from './screens/MainLoggedIn';
import GameSelect from './screens/GameSelect';
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
import LoginRequiredModal from './modals/LoginRequired';
import LoginModal from './modals/Login';
import SettingsModal from './modals/Settings';
import ThemeShopModal from './modals/ThemeShop';
import OnlineModal from './modals/Online';
import MatchingModal from './modals/Matching';
import OnlineController from './net/OnlineController';

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* 전역 모달 호스트 */}
      <LoginRequiredModal />
      <LoginModal />
      <SettingsModal />
      <ThemeShopModal />
      <OnlineModal />
      <MatchingModal />
      {/* 온라인 매치 네비게이션 + 종료 오버레이 (실서버) */}
      <OnlineController />
      {/* 전역 스캔라인 + 비네팅 (PLAN §1.3) — 항상 최상단, 클릭 통과 */}
      <div className="crt-overlay" aria-hidden />
    </BrowserRouter>
  );
}
