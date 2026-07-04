/**
 * App — 라우팅 + 모달 호스트 + 전역 CRT 오버레이 (아키텍트 소유 — 구현 에이전트 수정 금지).
 *
 * 라우트:
 *   /            → 세션 게이트: loggedIn ? S2(MainLoggedIn) : S1(MainLoggedOut)
 *   /onboarding  → S5 (로그인 안 했으면 /로 리다이렉트)
 *   /select      → S8 게임 선택 (로그인 불필요)
 *   /game/1|2|3  → S9 / S10·S11 / S12
 *
 * 모달 4종은 전역 호스트로 항상 마운트 — 각 모달이 flow.modal을 보고 스스로 열림/닫힘.
 * (모달 컴포넌트 안에서 useNavigate 사용 가능하도록 BrowserRouter 안에 위치)
 * 스캔라인+비네팅(.crt-overlay)은 여기서 1장만 렌더 — 화면들이 중복 렌더하지 말 것.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './state/session';
import MainLoggedOut from './screens/MainLoggedOut';
import MainLoggedIn from './screens/MainLoggedIn';
import Onboarding from './screens/Onboarding';
import GameSelect from './screens/GameSelect';
import Game1 from './screens/game/Game1';
import Game2 from './screens/game/Game2';
import Game3 from './screens/game/Game3';
import LoginRequiredModal from './modals/LoginRequired';
import SettingsModal from './modals/Settings';
import OnlineModal from './modals/Online';
import MatchingModal from './modals/Matching';

function MainGate() {
  const session = useSession();
  if (session.loggedIn && session.needsOnboarding) return <Navigate to="/onboarding" replace />;
  return session.loggedIn ? <MainLoggedIn /> : <MainLoggedOut />;
}

function OnboardingGate() {
  const session = useSession();
  if (!session.loggedIn) return <Navigate to="/" replace />;
  return <Onboarding />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainGate />} />
        <Route path="/onboarding" element={<OnboardingGate />} />
        <Route path="/select" element={<GameSelect />} />
        <Route path="/game/1" element={<Game1 />} />
        <Route path="/game/2" element={<Game2 />} />
        <Route path="/game/3" element={<Game3 />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* 전역 모달 호스트 */}
      <LoginRequiredModal />
      <SettingsModal />
      <OnlineModal />
      <MatchingModal />
      {/* 전역 스캔라인 + 비네팅 (PLAN §1.3) — 항상 최상단, 클릭 통과 */}
      <div className="crt-overlay" aria-hidden />
    </BrowserRouter>
  );
}
