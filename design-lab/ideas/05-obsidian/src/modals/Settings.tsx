/**
 * S4 설정 모달 (modal-settings). 소유: lobby 에이전트.
 * SPEC S4 + PLAN §2.S4 참조.
 *
 * ⚠️ props 계약 동결 — auth 에이전트의 MainLoggedOut(S1)도 이 모달을 연다.
 *
 * 필요 testid: modal-settings(자동), btn-settings-save
 * 동작: 열릴 때 getFlow().settings로 입력 초기화 / 확인=saveSettings 후 onClose /
 *       기본값=입력만 DEFAULT_ROUND_CONFIG로 리셋(모달 유지, 저장 안 함) /
 *       배경 클릭·ESC=저장 안 함(onClose). min 1 검증.
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import { DEFAULT_ROUND_CONFIG, getFlow, saveSettings } from '../state/flow';
import '../screens/lobby.css';

export interface SettingsProps {
  open: boolean;
  /** 저장 여부와 무관하게 모달을 닫는다 */
  onClose: () => void;
}

/** 입력 문자열 → 정수 (min 1 클램프). 비어 있거나 NaN이면 1 */
function clampInt(value: string): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function StepRow({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const num = clampInt(value);
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      <div className="set-stepper">
        <button
          type="button"
          className="set-step"
          aria-label={`${label} 감소`}
          disabled={num <= 1}
          onClick={() => onChange(String(Math.max(1, num - 1)))}
        >
          −
        </button>
        <input
          className="input num set-input"
          type="number"
          min={1}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="set-step"
          aria-label={`${label} 증가`}
          onClick={() => onChange(String(num + 1))}
        >
          ＋
        </button>
        <span className="set-unit">{unit}</span>
      </div>
    </div>
  );
}

export default function Settings({ open, onClose }: SettingsProps) {
  const [rounds, setRounds] = useState(String(DEFAULT_ROUND_CONFIG.roundCount));
  const [secs, setSecs] = useState(String(DEFAULT_ROUND_CONFIG.timePerRoundSec));

  // 열릴 때마다 저장된 값으로 입력 초기화 (QA-S4-04: 저장값 유지 확인의 근거)
  useEffect(() => {
    if (open) {
      const s = getFlow().settings;
      setRounds(String(s.roundCount));
      setSecs(String(s.timePerRoundSec));
    }
  }, [open]);

  const save = () => {
    saveSettings({ roundCount: clampInt(rounds), timePerRoundSec: clampInt(secs) });
    onClose();
  };

  const resetToDefault = () => {
    // 모달 로컬 입력만 리셋 — 저장하지 않고 모달 유지 (QA-S4-05)
    setRounds(String(DEFAULT_ROUND_CONFIG.roundCount));
    setSecs(String(DEFAULT_ROUND_CONFIG.timePerRoundSec));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="MATCH CONFIG"
      title="설정"
      testId="modal-settings"
      width={420}
    >
      <StepRow label="라운드 수" unit="round" value={rounds} onChange={setRounds} />
      <StepRow label="라운드 당 시간" unit="초" value={secs} onChange={setSecs} />
      <div className="set-footer">
        <Button variant="secondary" onClick={resetToDefault}>
          기본값
        </Button>
        <Button variant="primary" testId="btn-settings-save" onClick={save}>
          확인
        </Button>
      </div>
    </Modal>
  );
}
