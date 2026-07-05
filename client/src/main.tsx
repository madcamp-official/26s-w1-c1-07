/**
 * 엔트리 (아키텍트 소유 — 구현 에이전트 수정 금지).
 * theme.css 전역 1회 로드 + 디버그 브리지 초기화.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// theme.css를 App(→ 각 화면 CSS)보다 먼저 로드해야 화면별 font-size 규칙이
// .font-arcade 기본 크기(theme.css:91)를 캐스케이드에서 이길 수 있다 (QA V-1).
import './theme.css';
import App from './App';
import { initDebugBridge } from './debug';
import { restoreSession } from './state/session';

initDebugBridge();
// 쿠키 세션이 살아있으면 새로고침해도 로그인 유지 (GET /api/me)
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
