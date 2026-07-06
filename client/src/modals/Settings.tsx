/**
 * S4 설정 모달 (lobby 에이전트 소유).
 * 본체 testid: modal-settings / 부품: btn-settings-save
 * - 라운드 수: 온라인 매치의 실제 라운드 수를 결정(방 생성 시 서버로 전달).
 * - 라운드 시간: 제거됨(온라인은 게임별 고정 시간).
 * - 게임 선택: 체크박스로 플레이할 게임 선택 — 체크한 게임들 중에서만 라운드 게임이 뽑힌다.
 * 열림 조건: flow.modal === 'settings'.
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import type { GameId } from '@/shell';
import {
  ALL_GAME_IDS,
  closeModal,
  getDefaultRoundConfig,
  setEnabledGames,
  setRoundConfig,
  useFlow,
} from '../state/flow';
import './settings.css';

const GAME_NAMES: Record<GameId, string> = {
  1: '숫자 맞추기',
  2: '미사일 매치',
  3: '타이드 펜싱',
  4: '공룡 달리기',
  5: '뿌슝뿌슝',
  6: '펌프',
  7: '스피드 오목',
  8: '이카루스 매치',
  9: '줄다리기',
  10: '라이트 사이클',
};

/** 입력 문자열 → 정수 (min 1 클램프). 파싱 불가면 fallback. */
function toCount(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(1, n) : Math.max(1, fallback);
}

interface RowProps {
  label: string;
  caption: string;
  unit: string;
  value: string;
  onChange(next: string): void;
  onStep(delta: number): void;
  inputAriaLabel: string;
}

function OperatorRow({ label, caption, unit, value, onChange, onStep, inputAriaLabel }: RowProps) {
  return (
    <div className="s4-row">
      <div className="s4-label">
        <span className="font-display s4-label-ko">{label}</span>
        <span className="font-arcade s4-label-cap c-muted">{caption}</span>
      </div>
      <div className="s4-ctrl">
        <button
          type="button"
          className="s4-step font-arcade"
          aria-label={`${label} 감소`}
          onClick={() => onStep(-1)}
        >
          ◀
        </button>
        <input
          className="s4-num font-arcade"
          value={value}
          inputMode="numeric"
          aria-label={inputAriaLabel}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={(e) => onChange(String(toCount(e.target.value, 1)))}
        />
        <button
          type="button"
          className="s4-step font-arcade"
          aria-label={`${label} 증가`}
          onClick={() => onStep(1)}
        >
          ▶
        </button>
      </div>
      <span className="unit-chip s4-unit">{unit}</span>
    </div>
  );
}

export default function SettingsModal() {
  const flow = useFlow();
  const open = flow.modal === 'settings';

  const [rounds, setRounds] = useState(String(flow.roundConfig.roundCount));
  const [enabled, setEnabled] = useState<Set<GameId>>(new Set(flow.enabledGames));

  // 열릴 때마다 저장된 값으로 재동기화.
  useEffect(() => {
    if (open) {
      setRounds(String(flow.roundConfig.roundCount));
      setEnabled(new Set(flow.enabledGames));
    }
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
    setRoundConfig({
      roundCount: toCount(rounds, flow.roundConfig.roundCount),
      timePerRoundSec: flow.roundConfig.timePerRoundSec, // 시간은 UI 제거 — 기존값 유지(미사용)
    });
    setEnabledGames([...enabled]);
    closeModal();
  };

  const resetToDefault = () => {
    const d = getDefaultRoundConfig();
    setRounds(String(d.roundCount));
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

      <div className="s4-rows">
        <OperatorRow
          label="라운드 수"
          caption="ROUNDS"
          unit="round"
          value={rounds}
          onChange={setRounds}
          onStep={(d) => setRounds(String(Math.max(1, toCount(rounds, 1) + d)))}
          inputAriaLabel="라운드 수"
        />
      </div>

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
