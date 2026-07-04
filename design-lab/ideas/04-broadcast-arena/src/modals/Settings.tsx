/**
 * S4 설정 모달 — MATCH RULES (lobby 에이전트 구현).
 *
 * SPEC S4: 라운드 수(round) / 라운드 당 시간(초) / 확인(저장 후 닫기) / 기본값(로컬 리셋).
 * - 확인: setRoundConfig(...) → flow.roundConfig에 저장 (게임 총 라운드 수에 반영, QA-S4-06).
 * - 기본값: 로컬 입력만 getDefaultRoundConfig()로 리셋 — 모달은 열린 채, 저장 안 함 (QA-S4-05).
 * - 배경 클릭/ESC = 저장 안 함 (Q11). 열 때마다 flow.roundConfig로 초기화(마운트 시).
 * - S6 톱니로 열렸으면 닫힐 때 online 패널로 복귀 (consumeSettingsReturnToOnline).
 *
 * testid: modal-settings / btn-settings-save
 */
import { useState } from 'react';
import type { RoundConfig } from '@shared';
import { Modal, Button } from '../components';
import {
  useFlow,
  closeModal,
  openModal,
  setRoundConfig,
  getDefaultRoundConfig,
} from '../state/flow';
import { consumeSettingsReturnToOnline } from './Online';
import '../screens/lobby.css';

/** 입력 문자열 → 정수 (실패 시 fallback). 최종 min 1 클램프는 setRoundConfig가 보장 */
function toInt(v: string, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function RuleRow({
  labelEn,
  labelKo,
  unit,
  value,
  onChange,
}: {
  labelEn: string;
  labelKo: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="lobby-rule-row">
      <div>
        <span className="label" style={{ color: 'var(--ink-sub)' }}>
          {labelEn}
        </span>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{labelKo}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="input tnum"
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 88, textAlign: 'right', fontSize: 17, fontWeight: 700 }}
        />
        <span style={{ fontSize: 14, color: 'var(--ink-sub)', minWidth: 38 }}>{unit}</span>
      </div>
    </div>
  );
}

/** 모달이 열릴 때 마운트되어 flow.roundConfig로 로컬 state 초기화, 닫히면 언마운트 */
function SettingsInner({ initial }: { initial: RoundConfig }) {
  const [rounds, setRounds] = useState(String(initial.roundCount));
  const [secs, setSecs] = useState(String(initial.timePerRoundSec));

  const dismiss = () => {
    // S6 톱니 경유였으면 online 패널로 복귀, 아니면 그냥 닫기
    if (consumeSettingsReturnToOnline()) openModal('online');
    else closeModal();
  };

  const save = () => {
    setRoundConfig({
      roundCount: toInt(rounds, initial.roundCount),
      timePerRoundSec: toInt(secs, initial.timePerRoundSec),
    });
    dismiss();
  };

  const resetToDefault = () => {
    const d = getDefaultRoundConfig();
    setRounds(String(d.roundCount));
    setSecs(String(d.timePerRoundSec));
  };

  return (
    <Modal testId="modal-settings" tab="MATCH RULES" onClose={dismiss} width={440}>
      <h2 className="display" style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 800 }}>
        설정
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <RuleRow
          labelEn="ROUNDS"
          labelKo="라운드 수"
          unit="round"
          value={rounds}
          onChange={setRounds}
        />
        <RuleRow
          labelEn="TIME / ROUND"
          labelKo="라운드 당 시간"
          unit="초"
          value={secs}
          onChange={setSecs}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          marginTop: 24,
        }}
      >
        <Button variant="secondary" onClick={resetToDefault}>
          기본값
        </Button>
        <Button testId="btn-settings-save" variant="primary" onClick={save}>
          확인
        </Button>
      </div>
    </Modal>
  );
}

export default function SettingsModal() {
  const flow = useFlow();
  if (flow.modal !== 'settings') return null;
  return <SettingsInner initial={flow.roundConfig} />;
}
