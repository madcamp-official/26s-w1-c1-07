/**
 * S4. 설정 모달 (modal-settings)
 * [OWNER: lobby 에이전트] — 이 파일은 lobby 에이전트만 수정한다.
 *
 * SPEC S4 / PLAN §2-S4:
 *  - 라운드 수 / 라운드 당 시간 숫자 입력 (min 1, 단위 칩 "round"/"초", −/+ 스텝 버튼)
 *  - [확인](btn-settings-save): setRoundConfig(로컬) 후 닫기 / [기본값]: 로컬만 리셋(모달 유지)
 *  - 배경 클릭/ESC = 저장 안 함 (Q11)
 *  - 열릴 때마다 로컬 state를 flow.roundConfig로 초기화 (QA-S4-04)
 *  - S6 톱니에서 열렸으면 닫힐 때 온라인 패널로 복귀 (openSettingsFromOnline)
 */
import { useEffect, useState } from 'react';
import { Button, Modal, Sticker } from '../components';
import {
  closeModal,
  getDefaultRoundConfig,
  openModal,
  setRoundConfig,
  useFlow,
} from '../state/flow';

/** S6 톱니로 열렸을 때 닫힘 후 'online' 모달로 복귀시키는 플래그 */
let returnToOnline = false;

/** S6(Online)에서 톱니로 설정을 열 때 사용 — 닫히면 온라인 패널로 복귀 */
export function openSettingsFromOnline(): void {
  returnToOnline = true;
  openModal('settings');
}

function closeSettings(): void {
  if (returnToOnline) {
    returnToOnline = false;
    openModal('online');
  } else {
    closeModal();
  }
}

/** 숫자 파싱 + min 1 클램프 (빈 값/비정상 입력은 1) */
function parseMin1(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const css = `
.s4-body {
  padding: 26px 28px 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.s4-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.s4-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.s4-step {
  width: 44px;
  height: 44px;
  border: 3px solid var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--dur-fast) var(--ease-snap),
    box-shadow var(--dur-fast) var(--ease-snap);
}
.s4-step:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--ink);
}
.s4-step:active {
  transform: translate(4px, 4px);
  box-shadow: none;
}
.s4-num {
  width: 108px;
  text-align: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  padding: 6px 8px;
}
.s4-unit {
  display: inline-block;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--highlight);
  padding: 3px 12px;
  min-width: 58px;
  text-align: center;
}
.s4-foot {
  display: flex;
  gap: 14px;
  justify-content: flex-end;
  margin-top: 4px;
}
`;

interface NumRowProps {
  label: string;
  unit: string;
  value: string;
  onChange(next: string): void;
}

function NumRow({ label, unit, value, onChange }: NumRowProps) {
  const step = (delta: number) => onChange(String(Math.max(1, parseMin1(value) + delta)));
  return (
    <div className="s4-row">
      <Sticker tilt={-3} fontSize={15}>
        {label}
      </Sticker>
      <div className="s4-ctrl">
        <button type="button" className="s4-step" aria-label={`${label} 감소`} onClick={() => step(-1)}>
          −
        </button>
        <input
          className="nb-input s4-num"
          type="number"
          min={1}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="s4-step" aria-label={`${label} 증가`} onClick={() => step(1)}>
          +
        </button>
        <span className="s4-unit">{unit}</span>
      </div>
    </div>
  );
}

export default function SettingsModal() {
  const flow = useFlow();
  const open = flow.modal === 'settings';

  const [rounds, setRounds] = useState('3');
  const [secs, setSecs] = useState('60');

  // 열릴 때마다 저장된 flow.roundConfig로 초기화 (QA-S4-04)
  useEffect(() => {
    if (open) {
      setRounds(String(flow.roundConfig.roundCount));
      setSecs(String(flow.roundConfig.timePerRoundSec));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    setRoundConfig({ roundCount: parseMin1(rounds), timePerRoundSec: parseMin1(secs) });
    closeSettings();
  };

  const resetDefaults = () => {
    const d = getDefaultRoundConfig();
    setRounds(String(d.roundCount));
    setSecs(String(d.timePerRoundSec));
  };

  return (
    <Modal
      open={open}
      title="설정 / RULES"
      onClose={closeSettings}
      testId="modal-settings"
      width={480}
    >
      <style>{css}</style>
      <div className="s4-body">
        <NumRow label="라운드 수" unit="round" value={rounds} onChange={setRounds} />
        <NumRow label="라운드 당 시간" unit="초" value={secs} onChange={setSecs} />
        <div className="s4-foot">
          <Button variant="primary" data-testid="btn-settings-save" onClick={save}>
            확인
          </Button>
          <Button variant="secondary" onClick={resetDefaults}>
            기본값
          </Button>
        </div>
      </div>
    </Modal>
  );
}
