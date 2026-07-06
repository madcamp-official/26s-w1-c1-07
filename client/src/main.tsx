/**
 * Entry (owned by the architect — implementation agents must not modify).
 * Loads theme.css globally once + initializes the debug bridge.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// theme.css must load before App (→ each screen's CSS) so that per-screen font-size rules
// can win over the .font-arcade default size (theme.css:91) in the cascade (QA V-1).
import './theme.css';
import App from './App';
import { initDebugBridge } from './debug';
import { restoreSession } from './state/session';

initDebugBridge();
// If the cookie session is alive, stay logged in across refreshes (GET /api/me)
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
