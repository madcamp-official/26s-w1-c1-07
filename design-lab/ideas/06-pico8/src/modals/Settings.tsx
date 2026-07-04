/**
 * S4. 설정 모달 (modal-settings) — 옵션 화면 오마주 (PLAN §2 S4)
 * [소유: lobby 에이전트]
 *
 * - 라운드 수 / 라운드 당 시간 스테퍼([-]/[+] 키캡 + 직접 타이핑 number input, min 1)
 * - 확인(btn-settings-save) → setRoundConfig 저장 후 닫기 (QA-S4-04/06)
 * - 기본값 → 입력값만 DEFAULT_ROUND_CONFIG로 리셋, 모달 유지·저장 아님 (QA-S4-05)
 * - 배경 클릭/ESC = 저장 안 함 (SPEC Q11)
 * - 열릴 때 현재값은 getFlow().roundConfig에서 로드
 */
import { useEffect, useState } from 'react';
import { Button, Keycap, Modal } from '../components';
import { DEFAULT_ROUND_CONFIG, getFlow, setRoundConfig } from '../state/flow';
import './Settings.css';

export interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

/** 문자열 입력 → min 1 정수 (비정상 입력은 1) */
function clampInt(v: string): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

interface OptionRowProps {
  label: string;
  unit: string;
  value: string;
  ariaName: string;
  onChange: (next: string) => void;
}

function OptionRow({ label, unit, value, ariaName, onChange }: OptionRowProps) {
  // 스테퍼 클릭 횟수 — 입력을 리마운트시켜 옐로 플래시 재생 (타이핑 중엔 리마운트 없음)
  const [flashKey, setFlashKey] = useState(0);
  const num = clampInt(value);

  const step = (delta: number) => {
    onChange(String(Math.max(1, num + delta)));
    setFlashKey((k) => k + 1);
  };

  return (
    <div className="set-row">
      <div className="set-label">
        <span className="set-cursor px-blink" aria-hidden="true">
          ▶
        </span>
        {label}
      </div>
      <div className="set-ctrl">
        <Keycap keyLabel="-" aria-label={`${ariaName} 감소`} onClick={() => step(-1)} size={40} />
        <input
          key={flashKey}
          className="set-num"
          type="number"
          min={1}
          value={value}
          aria-label={ariaName}
          onChange={(e) => onChange(e.target.value)}
        />
        <Keycap keyLabel="+" aria-label={`${ariaName} 증가`} onClick={() => step(1)} size={40} />
        <span className="set-unit">{unit}</span>
      </div>
    </div>
  );
}

export default function Settings({ open, onClose }: SettingsProps) {
  const [rounds, setRounds] = useState(String(DEFAULT_ROUND_CONFIG.roundCount));
  const [seconds, setSeconds] = useState(String(DEFAULT_ROUND_CONFIG.timePerRoundSec));

  // 열릴 때마다 저장된 현재값 로드 (배경 클릭으로 닫으면 편집값은 버려짐)
  useEffect(() => {
    if (!open) return;
    const cfg = getFlow().roundConfig;
    setRounds(String(cfg.roundCount));
    setSeconds(String(cfg.timePerRoundSec));
  }, [open]);

  const save = () => {
    setRoundConfig({
      roundCount: clampInt(rounds),
      timePerRoundSec: clampInt(seconds),
    });
    onClose();
  };

  const restoreDefaults = () => {
    // 입력값만 리셋 — 저장은 "확인"에서 (QA-S4-05: 모달은 열린 채)
    setRounds(String(DEFAULT_ROUND_CONFIG.roundCount));
    setSeconds(String(DEFAULT_ROUND_CONFIG.timePerRoundSec));
  };

  return (
    <Modal open={open} onClose={onClose} title="OPTIONS" testId="modal-settings" width={400}>
      <h2
        style={{
          fontFamily: 'var(--font-kr)',
          fontSize: 24,
          fontWeight: 400,
          marginBottom: 24,
          color: 'var(--text)',
        }}
      >
        설정
      </h2>
      <OptionRow
        label="라운드 수"
        unit="round"
        value={rounds}
        ariaName="라운드 수"
        onChange={setRounds}
      />
      <OptionRow
        label="라운드 당 시간"
        unit="초"
        value={seconds}
        ariaName="라운드 당 시간"
        onChange={setSeconds}
      />
      <div className="set-actions">
        <Button
          data-testid="btn-settings-save"
          variant="primary"
          size="md"
          style={{ flex: 1 }}
          onClick={save}
        >
          확인
        </Button>
        <Button variant="ghost" size="md" style={{ flex: 1 }} onClick={restoreDefaults}>
          기본값
        </Button>
      </div>
    </Modal>
  );
}
