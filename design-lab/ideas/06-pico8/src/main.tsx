/**
 * 엔트리 — 테마 로드 + 디버그 브리지 초기화 + React 마운트.
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { initDebugBridge } from './debug';
import App from './App';

initDebugBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
