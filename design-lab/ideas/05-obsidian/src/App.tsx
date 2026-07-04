/**
 * 라우팅 셸 — 아키텍트 소유, 화면 구현 에이전트 수정 금지.
 *
 * 라우트 맵:
 *   /            S1(비로그인) 또는 S2(로그인 후) — 세션으로 자동 분기
 *   /onboarding  S5 닉네임 온보딩
 *   /select      S8 게임 선택 (오프라인)
 *   /game/1|2|3  S9 / S10·S11 / S12 인게임
 *
 * 모달(S3/S4/S6/S7)은 라우트가 아니라 화면 내부 상태로 연다.
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

function MainRoute() {
  const session = useSession();
  // 로그인+온보딩 완료 → S2, 그 외 → S1
  return session.loggedIn && session.user ? <MainLoggedIn /> : <MainLoggedOut />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainRoute />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/select" element={<GameSelect />} />
        <Route path="/game/1" element={<Game1 />} />
        <Route path="/game/2" element={<Game2 />} />
        <Route path="/game/3" element={<Game3 />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
