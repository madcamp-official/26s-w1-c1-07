/**
 * 엔트리 (아키텍트 소유 — 구현 에이전트 수정 금지).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './App';
import { initDebugBridge } from './debug';

initDebugBridge(); // dev 전용 QA 브리지 (window.__MADPUMP__)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
