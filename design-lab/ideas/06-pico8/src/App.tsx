/**
 * App — 라우팅 + 공통 셸 (PLAN §2 공통 셸: 상단 스테이터스 바).
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 * 라우트 계약:
 *   '/'            → 세션 보고 자동 분기: MainLoggedIn(S2) | MainLoggedOut(S1)
 *   '/onboarding'  → Onboarding(S5)
 *   '/select'      → GameSelect(S8)
 *   '/game/1|2|3'  → Game1(S9) / Game2(S10·S11) / Game3(S12)
 * 모달(S3/S4/S6/S7)은 라우트가 아니라 각 화면이 상태로 여닫는 컴포넌트다.
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

/** '/' — 로그인 상태에 따라 S1/S2 분기 (S5 미완이면 온보딩으로) */
function MainRoute() {
  const session = useSession();
  if (session.loggedIn && session.needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  return session.loggedIn ? <MainLoggedIn /> : <MainLoggedOut />;
}

/** 상단 검정 스테이터스 바 — 팬시 콘솔 에디터 바 인용 (PLAN §2) */
function StatusBar() {
  const session = useSession();
  return (
    <header className="app-statusbar">
      <span>MADPUMP-8 V1.0</span>
      <span className={session.loggedIn ? 'session-on' : undefined}>
        {session.loggedIn ? `PLAYER:${session.nickname ?? '?'}` : 'GUEST'}
      </span>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <StatusBar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<MainRoute />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/select" element={<GameSelect />} />
            <Route path="/game/1" element={<Game1 />} />
            <Route path="/game/2" element={<Game2 />} />
            <Route path="/game/3" element={<Game3 />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
