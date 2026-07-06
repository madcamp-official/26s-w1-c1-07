/**
 * S4 Settings modal (owned by the lobby agent).
 * root testid: modal-settings / parts: btn-settings-save
 * - Round count: removed — online matches are always 9 rounds (3 slot games × 3 turns, docs/ONLINE_MATCH.md).
 * - Round time: removed (online uses a fixed time per game).
 * - Game Select: pick games to play via checkboxes — the slot machine's 3 reels are drawn from the checked games.
 * Open condition: flow.modal === 'settings'.
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import type { GameId } from '@/shell';
import { ALL_GAME_IDS, closeModal, setEnabledGames, useFlow } from '../state/flow';
import { GAME_NAMES } from '../game/gameNames';
import './settings.css';

export default function SettingsModal() {
  const flow = useFlow();
  const open = flow.modal === 'settings';

  const [enabled, setEnabled] = useState<Set<GameId>>(new Set(flow.enabledGames));

  // Re-sync to the saved value each time it opens.
  useEffect(() => {
    if (open) setEnabled(new Set(flow.enabledGames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: GameId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const noneSelected = enabled.size === 0;

  const save = () => {
    if (noneSelected) return; // at least 1 game required
    setEnabledGames([...enabled]);
    closeModal();
  };

  const resetToDefault = () => {
    setEnabled(new Set(ALL_GAME_IDS));
    // Keep the modal open; saving requires pressing Confirm
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="SETTINGS"
      accentColor="var(--accent2)"
      testId="modal-settings"
      width={520}
    >
      <h2 className="font-display s4-title">Settings</h2>

      <div className="s4-games">
        <div className="s4-games-grid">
          {ALL_GAME_IDS.map((id) => (
            <label key={id} className={`s4-game ${enabled.has(id) ? 'on' : ''}`}>
              <input
                type="checkbox"
                className="s4-game-box"
                checked={enabled.has(id)}
                onChange={() => toggle(id)}
                aria-label={GAME_NAMES[id]}
              />
              <span className="s4-game-name font-display">
                {id}. {GAME_NAMES[id]}
              </span>
            </label>
          ))}
        </div>
        {noneSelected && (
          <p className="s4-games-warn" role="alert">
            You must select at least 1 game
          </p>
        )}
      </div>

      <div className="s4-actions">
        <Button variant="primary" data-testid="btn-settings-save" onClick={save} disabled={noneSelected}>
          Confirm
        </Button>
        <Button variant="secondary" onClick={resetToDefault}>
          Reset to default
        </Button>
      </div>
    </Modal>
  );
}
