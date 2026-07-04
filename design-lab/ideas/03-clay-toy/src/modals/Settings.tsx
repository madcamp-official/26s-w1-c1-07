/**
 * S4 설정 모달 — 라운드 수 / 라운드 당 시간 (lobby 에이전트 소유).
 *
 * modal testid: modal-settings / 확인 버튼: btn-settings-save
 * - 열림 조건: flow.modal === 'settings'
 * - 확인: setRoundConfig(...) 저장 후 닫기 (QA-S4-04, QA-S4-06)
 * - 기본값: 로컬 입력만 기본값으로 리셋, 모달 유지·저장 안 함 (QA-S4-05)
 * - 배경 클릭/ESC: 저장 안 함 (SPEC Q11)
 * - S6 톱니에서 열렸으면 닫힐 때 온라인 패널로 복귀 (openSettingsFrom)
 */
import { useEffect, useState } from 'react';
import {
  closeModal,
  getDefaultRoundConfig,
  openModal,
  setRoundConfig,
  useFlow,
} from '../state/flow';
import type { ModalId } from '../state/flow';
import { Button, Modal } from '../components';
import './lobby.css';

/** 설정이 닫힐 때 복귀할 모달 (S6 톱니 동선 — lobby 재량, ARCHITECTURE §2.2) */
let returnTo: ModalId | null = null;

/** S6 톱니 등에서 호출 — 설정을 열고, 닫힐 때 원래 모달로 복귀시킨다 */
export function openSettingsFrom(ret: ModalId): void {
  returnTo = ret;
  openModal('settings');
}

/** 라벤더 톱니 아이콘 (PLAN §1.1 — 설정 톱니는 --lavender) */
export function GearIcon({ size = 20, color = 'var(--lavender)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={color}
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z"
      />
    </svg>
  );
}

/** 숫자 입력 1행 — sunken 홈 input + 좌우 −/＋ 클레이 스텝퍼 + 단위 (PLAN §2-S4) */
function NumField({
  label,
  unit,
  value,
  onChange,
  onStep,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="set-field">
      <label className="set-label">{label}</label>
      <div className="set-row">
        <button
          type="button"
          className="jelly set-step"
          aria-label={`${label} 감소`}
          onClick={() => onStep(-1)}
        >
          −
        </button>
        <input
          className="set-input num"
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <button
          type="button"
          className="jelly set-step"
          aria-label={`${label} 증가`}
          onClick={() => onStep(1)}
        >
          ＋
        </button>
        <span className="set-unit">{unit}</span>
      </div>
    </div>
  );
}

/** 문자열 입력을 1 이상의 정수로 — 실패 시 fallback (min 1은 setRoundConfig도 재보증) */
function toCount(v: string, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export default function SettingsModal() {
  const flow = useFlow();
  const open = flow.modal === 'settings';
  const [rounds, setRounds] = useState(String(flow.roundConfig.roundCount));
  const [secs, setSecs] = useState(String(flow.roundConfig.timePerRoundSec));

  // 열릴 때마다 저장된 값으로 동기화 (QA-S4-04: 확인 후 재오픈 시 바뀐 값 유지)
  useEffect(() => {
    if (open) {
      setRounds(String(flow.roundConfig.roundCount));
      setSecs(String(flow.roundConfig.timePerRoundSec));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  /** 닫기 — S6에서 열렸으면 온라인 패널 복귀, 아니면 그냥 닫기 */
  const dismiss = () => {
    const ret = returnTo;
    returnTo = null;
    if (ret) openModal(ret);
    else closeModal();
  };

  const save = () => {
    setRoundConfig({
      roundCount: toCount(rounds, flow.roundConfig.roundCount),
      timePerRoundSec: toCount(secs, flow.roundConfig.timePerRoundSec),
    });
    dismiss();
  };

  const resetToDefault = () => {
    const d = getDefaultRoundConfig();
    setRounds(String(d.roundCount));
    setSecs(String(d.timePerRoundSec));
  };

  return (
    <Modal testId="modal-settings" onClose={dismiss} width={420}>
      <div className="set-head">
        <GearIcon size={26} />
        <h2 className="set-title">설정</h2>
      </div>

      <NumField
        label="라운드 수"
        unit="round"
        value={rounds}
        onChange={setRounds}
        onStep={(d) => setRounds(String(Math.max(1, toCount(rounds, 1) + d)))}
      />
      <NumField
        label="라운드 당 시간"
        unit="초"
        value={secs}
        onChange={setSecs}
        onStep={(d) => setSecs(String(Math.max(1, toCount(secs, 1) + d)))}
      />

      <div className="set-actions">
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
