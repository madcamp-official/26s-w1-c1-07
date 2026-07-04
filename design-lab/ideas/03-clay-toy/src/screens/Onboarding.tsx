/**
 * S5 닉네임 온보딩 (auth 에이전트 소유)
 *
 * 컨테이너 testid: scr-onboarding
 * testid: input-nickname, btn-nickname-submit, err-nickname-dup
 * SPEC S5 / PLAN §2-S5:
 *  - 명찰(이름표) 모양 대형 클레이 카드 — 끈 고리 + 구멍 장식
 *  - 이름/분반 입력 + 확인. 중복("test" 등) 제출 시 카드 흔들림 + 빨간 에러
 *  - 이름 수정 시 에러 해제, 빈값 제출 방지
 *  - 성공: completeOnboarding → navigate('/') → S2 (인사말에 이름 반영)
 */
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebugScreen } from '../debug';
import { completeOnboarding, isNicknameTaken } from '../state/session';
import { Button, ClayBlob } from '../components';
import './Onboarding.css';

export default function Onboarding() {
  useDebugScreen('scr-onboarding');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [dupError, setDupError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<number | null>(null);

  const canSubmit = name.trim().length > 0 && group.trim().length > 0;

  const triggerShake = () => {
    setShaking(false);
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
    // 리플로우 없이 재트리거 — 다음 프레임에 클래스 재부착
    requestAnimationFrame(() => {
      setShaking(true);
      shakeTimer.current = window.setTimeout(() => setShaking(false), 400);
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return; // 빈값 제출 방지 (QA-S5-05)
    if (isNicknameTaken(name)) {
      setDupError(true); // QA-S5-03
      triggerShake();
      return;
    }
    completeOnboarding(name, group);
    navigate('/'); // 세션 게이트가 S2 렌더 (QA-S5-06)
  };

  return (
    <main data-testid="scr-onboarding" className="screen" style={{ background: 'var(--bg-lilac)' }}>
      <ClayBlob shape="star" size={190} color="#E9D9FB" style={{ top: -50, right: -40 }} />
      <ClayBlob shape="donut" size={240} color="#E9D9FB" style={{ bottom: -90, left: -80 }} />

      <div className="s5-wrap">
        <div className={`s5-card pop-in ${shaking ? 'shake' : ''}`}>
          <div className="s5-ring" aria-hidden="true" />
          <div className="s5-hole" aria-hidden="true" />

          <h1 className="s5-title">What&rsquo;s your name?</h1>
          <p className="s5-subtitle">찰흙 이름표를 만들어 볼까요?</p>

          <form className="s5-form" onSubmit={handleSubmit}>
            <label className="s5-field">
              <span className="s5-label">이름 :</span>
              <input
                data-testid="input-nickname"
                className={`s5-input ${dupError ? 's5-input--error' : ''}`}
                type="text"
                value={name}
                placeholder="닉네임 입력"
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  if (dupError) setDupError(false); // 수정 시 에러 해제 (QA-S5-04)
                }}
              />
            </label>
            {dupError && (
              <p data-testid="err-nickname-dup" className="s5-error">
                이미 사용하고 있는 이름입니다
              </p>
            )}

            <label className="s5-field">
              <span className="s5-label">분반 :</span>
              <input
                data-testid="input-group"
                className="s5-input"
                type="text"
                value={group}
                placeholder="예: 1분반"
                onChange={(e) => setGroup(e.target.value)}
              />
            </label>

            <div className="s5-submit-row">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                data-testid="btn-nickname-submit"
                disabled={!canSubmit}
                style={!canSubmit ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                확인
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
