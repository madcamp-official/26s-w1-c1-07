/**
 * S4 설정 모달 (lobby 에이전트 소유).
 * 본체 testid: modal-settings / 부품: btn-settings-save
 * PLAN §2-S4: OPERATOR MENU — 각 행 = 좌 라벨(Gugi + 영문 캡션) + ◀ 스텝 + Press Start 2P
 *   대형 숫자 입력 + ▶ 스텝 + 단위 칩(round/초). 하단 [확인](옐로)/[기본값](시안).
 * SPEC QA-S4-01~06:
 *   확인 → setRoundConfig(local) + closeModal() / 기본값 → local만 리셋(모달 유지, 저장 아님)
 *   배경 클릭/ESC = 저장 안 함(Q11) — 그냥 closeModal, local은 다음 열림에 flow 값으로 재동기화.
 * 열림 조건: flow.modal === 'settings'.
 */
import { useEffect, useState } from 'react';
import { Button, Modal } from '../components';
import { closeModal, getDefaultRoundConfig, setRoundConfig, useFlow } from '../state/flow';
import './settings.css';

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

  // 로컬 편집 값 (문자열 — 입력 중 빈 값 허용). 열릴 때마다 저장된 값으로 재동기화.
  const [rounds, setRounds] = useState(String(flow.roundConfig.roundCount));
  const [seconds, setSeconds] = useState(String(flow.roundConfig.timePerRoundSec));

  useEffect(() => {
    if (open) {
      setRounds(String(flow.roundConfig.roundCount));
      setSeconds(String(flow.roundConfig.timePerRoundSec));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    setRoundConfig({
      roundCount: toCount(rounds, flow.roundConfig.roundCount),
      timePerRoundSec: toCount(seconds, flow.roundConfig.timePerRoundSec),
    });
    closeModal();
  };

  const resetToDefault = () => {
    const d = getDefaultRoundConfig();
    setRounds(String(d.roundCount));
    setSeconds(String(d.timePerRoundSec));
    // 모달은 열린 채 유지, 저장은 확인을 눌러야 (QA-S4-05)
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="설정 — OPERATOR MENU"
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
        <OperatorRow
          label="라운드 당 시간"
          caption="TIME"
          unit="초"
          value={seconds}
          onChange={setSeconds}
          onStep={(d) => setSeconds(String(Math.max(1, toCount(seconds, 1) + d)))}
          inputAriaLabel="라운드 당 시간"
        />
      </div>

      <div className="s4-actions">
        <Button variant="primary" data-testid="btn-settings-save" onClick={save}>
          확인
        </Button>
        <Button variant="secondary" onClick={resetToDefault}>
          기본값
        </Button>
      </div>
    </Modal>
  );
}
