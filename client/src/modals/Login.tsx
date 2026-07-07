/**
 * Login modal — Google sign-in (docs/AUTH.md v3).
 * root testid: modal-login / part: google-signin (the GIS button container)
 *
 * Renders the GIS "Sign in with Google" button; on credential, POST /api/auth/google → session.
 *
 * Entry paths:
 *   openLoginModal()          — S1 "Login" button (on success the modal closes → MainGate switches to S2)
 *   openLoginModal('online')  — via the S3 login-required modal (on success, continues into the online panel)
 */
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components';
import { closeModal, openModal, useFlow } from '../state/flow';
import { loginWithGoogle } from '../state/session';
import { renderGoogleButton, GOOGLE_CLIENT_ID } from '../auth/google';
import './login.css';

/** Action to continue after a successful login — 'online' when coming via login-required */
let afterLogin: 'online' | null = null;

/** Open the login modal (next: modal to open after success) */
export function openLoginModal(next?: 'online'): void {
  afterLogin = next ?? null;
  openModal('login');
}

export default function LoginModal() {
  const flow = useFlow();
  const open = flow.modal === 'login';

  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Render the Google button while the modal is open; clean up (remove the iframe) when it closes.
  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
      return;
    }
    const el = btnRef.current;
    if (!el) return;
    return renderGoogleButton(el, async (credential) => {
      setBusy(true);
      setError(null);
      const ok = await loginWithGoogle(credential);
      setBusy(false);
      if (!ok) {
        setError('Login failed — please try again');
        return;
      }
      if (afterLogin === 'online') openModal('online');
      else closeModal();
      afterLogin = null;
    });
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : closeModal}
      marquee="WHO ARE YOU?"
      accentColor="var(--accent)"
      testId="modal-login"
      width={440}
    >
      <div className="lg-body">
        <p className="lg-title font-display">Sign in with Google</p>
        {error && (
          <p className="lg-err" role="alert">
            {error}
          </p>
        )}
        {!GOOGLE_CLIENT_ID && (
          <p className="lg-err" role="alert">
            VITE_GOOGLE_CLIENT_ID is not set (client/.env)
          </p>
        )}
        <div ref={btnRef} className="lg-google" data-testid="google-signin" />
        {busy && <p className="lg-loading font-arcade">SIGNING IN…</p>}
      </div>
    </Modal>
  );
}
