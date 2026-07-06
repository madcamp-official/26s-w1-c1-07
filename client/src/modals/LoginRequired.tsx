/**
 * S3 login-required modal. Owner: auth agent.
 * root testid: modal-login-required / parts: btn-login
 *
 * PLAN §2-S3: small modal (~440px), marquee "CREDIT REQUIRED" (yellow), coin-slot pictogram +
 *   "Online play requires login!" + [Login] / [Cancel (error border)].
 * Login button → replaces into the roster login modal (class → member select).
 *   On successful login, continues into the originally intended online panel (S6) (QA-S3-03).
 * Cancel / background click / ESC → close the modal (stays on main).
 * Open condition: flow.modal === 'login-required' (global host, always mounted — App.tsx).
 */
import { Button, Modal } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { openLoginModal } from './Login';
import './login-required.css';

export default function LoginRequiredModal() {
  const flow = useFlow();
  const open = flow.modal === 'login-required';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="CREDIT REQUIRED"
      accentColor="var(--accent)"
      testId="modal-login-required"
      width={440}
    >
      <div className="s3-body">
        <div className="s3-coinslot" aria-hidden>
          <i />
        </div>
        <p className="s3-msg font-display">Online play requires login!</p>
        <Button variant="primary" block data-testid="btn-login" onClick={() => openLoginModal('online')}>
          Login
        </Button>
        <Button variant="danger" block onClick={closeModal}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
