/**
 * S5 닉네임 온보딩 (scr-onboarding). 소유: auth 에이전트.
 * SPEC S5 + PLAN §2.S5 — "선수 등록(PLAYER REGISTRATION)" 프레이밍.
 *
 * 기능:
 *   - 이름/분반 controlled input, 빈 값이면 확인 disabled (QA-S5-05)
 *   - 제출 시 isNicknameTaken() 중복 검증 → err-nickname-dup 표시 (QA-S5-03)
 *   - 이름 수정 시 에러 즉시 해제, 입력값은 유지 (QA-S5-04, SPEC Q12)
 *   - 통과 시 completeOnboarding(이름, 분반) → navigate('/') → S2 (QA-S5-06)
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockGroups } from '@shared';
import { Button } from '../components';
import { completeOnboarding, isNicknameTaken } from '../state/session';
import { useScreenBridge } from '../debug';
import './auth.css';

export default function Onboarding() {
  useScreenBridge('scr-onboarding');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [dupError, setDupError] = useState(false);

  const canSubmit = name.trim() !== '' && group.trim() !== '';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedGroup = group.trim();
    if (!trimmedName || !trimmedGroup) return; // 빈 값 제출 방지
    if (isNicknameTaken(trimmedName)) {
      setDupError(true); // 입력값은 유지 (Q12)
      return;
    }
    completeOnboarding(trimmedName, trimmedGroup);
    navigate('/'); // 세션 완성 → MainRoute가 S2 렌더
  };

  return (
    <div className="screen" data-testid="scr-onboarding">
      <header className="topbar">
        <span className="logotype">
          MADPUMP<em>//</em>
        </span>
        <span className="overline">PROTOCOL // REGISTRATION</span>
      </header>

      <div className="onb-wrap">
        <div className="onb-frame brackets">
          <form className="onb-card" onSubmit={handleSubmit} noValidate>
            <div className="overline">PLAYER REGISTRATION</div>
            <h1 className="onb-title">What&apos;s your name?</h1>
            <p className="onb-sub">프로토콜에 등록할 콜사인을 입력하세요</p>

            <label className="onb-field">
              <span className="onb-field-label">
                <span className="onb-ko">이름 :</span>
                <span className="overline">CALLSIGN</span>
              </span>
              <input
                className={`input${dupError ? ' input--error' : ''}`}
                data-testid="input-nickname"
                type="text"
                value={name}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="닉네임"
                onChange={(e) => {
                  setName(e.target.value);
                  if (dupError) setDupError(false); // 수정 즉시 에러 해제
                }}
              />
              {dupError && (
                <div className="field-error" data-testid="err-nickname-dup">
                  이미 사용하고 있는 이름입니다
                </div>
              )}
            </label>

            <label className="onb-field">
              <span className="onb-field-label">
                <span className="onb-ko">분반 :</span>
                <span className="overline">DIVISION</span>
              </span>
              <input
                className="input"
                type="text"
                value={group}
                autoComplete="off"
                spellCheck={false}
                placeholder="예: 1분반"
                list="onb-division-options"
                onChange={(e) => setGroup(e.target.value)}
              />
              {/* 분반 선택 보조 — mock 분반 목록 제안 (자유 입력도 허용) */}
              <datalist id="onb-division-options">
                {mockGroups.map((g) => (
                  <option key={g.id} value={g.name} />
                ))}
              </datalist>
            </label>

            <Button
              type="submit"
              variant="primary"
              overline="CONFIRM"
              testId="btn-nickname-submit"
              className="onb-submit"
              disabled={!canSubmit}
            >
              확인
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
