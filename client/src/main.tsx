/**
 * Entry (owned by the architect — implementation agents must not modify).
 * Loads theme.css (token contract = neon default) → themes/index.css (per-theme overrides) globally once,
 * then initializes theme/debug/session.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// theme.css must load before App (→ each screen's CSS) so that per-screen font-size rules
// can win over the .font-arcade default size (theme.css) in the cascade (QA V-1).
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
// If the cookie session is alive, stay logged in across refreshes (GET /api/me)
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
