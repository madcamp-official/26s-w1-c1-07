/**
 * S4 설정 모달 (lobby 에이전트 소유).
 * 본체 testid: modal-settings / 부품: btn-settings-save
 * - 라운드 수: 제거됨 — 온라인 매치는 항상 9라운드(슬롯 3게임 × 3회전, docs/ONLINE_MATCH.md).
 * - 라운드 시간: 제거됨(온라인은 게임별 고정 시간).
 * - 게임 선택: 체크박스로 플레이할 게임 선택 — 슬롯머신 3릴이 체크한 게임들 중에서 뽑힌다.
 * 열림 조건: flow.modal === 'settings'.
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

  // 열릴 때마다 저장된 값으로 재동기화.
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
    if (noneSelected) return; // 최소 1개 게임 필요
    setEnabledGames([...enabled]);
    closeModal();
  };

  const resetToDefault = () => {
    setEnabled(new Set(ALL_GAME_IDS));
    // 모달은 열린 채 유지, 저장은 확인을 눌러야
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
      <h2 className="font-display s4-title">설정</h2>

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
            최소 1개 게임은 선택해야 합니다
          </p>
        )}
      </div>

      <div className="s4-actions">
        <Button variant="primary" data-testid="btn-settings-save" onClick={save} disabled={noneSelected}>
          확인
        </Button>
        <Button variant="secondary" onClick={resetToDefault}>
          기본값으로 설정
        </Button>
      </div>
    </Modal>
  );
}
