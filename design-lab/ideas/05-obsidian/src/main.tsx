/**
 * 엔트리 — 아키텍트 소유, 화면 구현 에이전트 수정 금지.
 * StrictMode는 게임 루프 effect 이중 실행 부담을 줄이기 위해 의도적으로 뺐다.
 */
import { createRoot } from 'react-dom/client';
import './theme.css';
import { initDebugBridge } from './debug';
import App from './App';

initDebugBridge();

createRoot(document.getElementById('root')!).render(<App />);
