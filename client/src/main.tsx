/**
 * 엔트리 (아키텍트 소유 — 구현 에이전트 수정 금지).
 * theme.css(토큰 계약 = neon 기본) → themes/index.css(테마별 재정의) 순으로 전역 1회 로드
 * + 테마/디버그/세션 초기화.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// theme.css를 App(→ 각 화면 CSS)보다 먼저 로드해야 화면별 font-size 규칙이
// .font-arcade 기본 크기(theme.css)를 캐스케이드에서 이길 수 있다 (QA V-1).
import './theme.css';
// 테마 재정의 레이어 — 반드시 theme.css(기본 계약) 다음에 로드(우선순위 for [data-theme]).
import './themes/index.css';
import App from './App';
import { initDebugBridge } from './debug';
import { restoreSession } from './state/session';
import { initTheme } from './state/theme';

// 저장된 테마를 즉시(동기, paint 전) <html>에 재확정 — FOUC 방지 + 스토어 동기화.
// (index.html 인라인 스크립트가 1차로 세팅, 여기서 스토어와 일치시킨다. useEffect 금지 — 지연/이중호출.)
initTheme();
initDebugBridge();
// 쿠키 세션이 살아있으면 새로고침해도 로그인 유지 (GET /api/me)
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
