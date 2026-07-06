/**
 * Login modal — 2-step roster login (docs/AUTH.md).
 * root testid: modal-login / parts: btn-group-<groupName>, btn-member-<nickname>
 *
 * Step 1 "Which class are you in?": Class 1/Class 2/Class 3 buttons (loads server roster via GET /api/roster)
 * Step 2 "user select":      member button grid for the chosen class — tap to log in instantly (no auth step)
 *
 * Entry paths:
 *   openLoginModal()          — S1 "Login" button (on success the modal closes → MainGate switches to S2)
 *   openLoginModal('online')  — via the S3 login-required modal (on success, continues into the online panel — QA-S3-03)
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import { closeModal, openModal, useFlow } from '../state/flow';
import { fetchRoster, loginAs } from '../state/session';
import type { RosterGroup } from '../state/session';
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

  const [groups, setGroups] = useState<RosterGroup[] | null>(null);
  const [picked, setPicked] = useState<RosterGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the roster when the modal opens; reset state when it closes
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setError(null);
      setBusy(false);
      return;
    }
    let alive = true;
    setGroups(null);
    fetchRoster()
      .then((gs) => {
        if (alive) setGroups(gs);
      })
      .catch(() => {
        if (alive) setError('Could not load the roster — check your server connection');
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const handleMember = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await loginAs(userId);
    setBusy(false);
    if (!ok) {
      setError('Login failed — please try again');
      return;
    }
    if (afterLogin === 'online') openModal('online');
    else closeModal();
    afterLogin = null;
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : closeModal}
      marquee={picked ? 'User Select' : 'WHO ARE YOU?'}
      accentColor="var(--accent)"
      testId="modal-login"
      width={picked ? 560 : 440}
    >
      {!picked ? (
        // ── Step 1: class select ──
        <div className="lg-body">
          <p className="lg-title font-display">Which class are you in?</p>
          {error && (
            <p className="lg-err" role="alert">
              {error}
            </p>
          )}
          {!groups && !error && <p className="lg-loading font-arcade">LOADING…</p>}
          <div className="lg-groups">
            {groups?.map((g) => (
              <Button
                key={g.id}
                variant="primary"
                block
                data-testid={`btn-group-${g.name}`}
                onClick={() => setPicked(g)}
              >
                {g.name}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        // ── Step 2: member select ──
        <div className="lg-body">
          <p className="lg-title font-display">
            <span className="c-accent">{picked.name}</span> — select yourself
          </p>
          {error && (
            <p className="lg-err" role="alert">
              {error}
            </p>
          )}
          <div className="lg-members">
            {picked.members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="lg-member font-display"
                data-testid={`btn-member-${m.nickname}`}
                disabled={busy}
                onClick={() => handleMember(m.id)}
              >
                {m.nickname}
              </button>
            ))}
          </div>
          <Button variant="tertiary" block onClick={() => setPicked(null)} disabled={busy}>
            ← Pick class again
          </Button>
        </div>
      )}
    </Modal>
  );
}
