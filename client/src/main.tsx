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
// Theme override layer — must load after theme.css (base contract) so [data-theme] takes priority.
import './themes/index.css';
import App from './App';
import { initDebugBridge } from './debug';
import { restoreSession } from './state/session';
import { initTheme } from './state/theme';

// Re-confirm the saved theme on <html> immediately (synchronously, before paint) — prevents FOUC + syncs the store.
// (index.html's inline script sets it first; here we reconcile with the store. No useEffect — it would defer / double-call.)
initTheme();
initDebugBridge();
// If the cookie session is alive, stay logged in across refreshes (GET /api/me)
void restoreSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
