/**
 * S5 닉네임 온보딩. 담당: auth 에이전트.
 * 컨테이너 testid: scr-onboarding / 부품: input-nickname, btn-nickname-submit, err-nickname-dup
 *
 * PLAN §2-S5: "NEW CHALLENGER" 하이스코어 이니셜 등록 카드 — 마퀴 "ENTER YOUR NAME",
 *   터미널 입력(> 프롬프트 + 시안 caret), 우상단 "PLAYER: ___" 실시간 미리보기(비면 "???"),
 *   에러는 입력 라인 적색 점등 + 셰이크, 배경 워터마크 "READY?".
 * SPEC QA-S5-01~06:
 *   중복 검증 isNicknameTaken() ("test" + mock 유저명) → err-nickname-dup 표시, 수정 시 해제.
 *   빈 값 제출 방지. 성공 시 completeOnboarding() 후 navigate('/') → S2 (인사말에 이름 반영).
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../components';
import { completeOnboarding, isNicknameTaken } from '../state/session';
import { useDebugScreen } from '../debug';
import './onboarding.css';

export default function Onboarding() {
  useDebugScreen('scr-onboarding');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [dupError, setDupError] = useState(false);
  /** 빈 값 제출 시 해당 입력만 셰이크 피드백 ('name' | 'group') */
  const [shakeField, setShakeField] = useState<'name' | 'group' | null>(null);

  const triggerShake = (field: 'name' | 'group') => {
    setShakeField(null);
    // 연속 제출에도 애니메이션이 재생되도록 한 프레임 뒤에 부착
    requestAnimationFrame(() => setShakeField(field));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedGroup = group.trim();
    // 빈 값 제출 방지 (QA-S5-05)
    if (!trimmedName) {
      triggerShake('name');
      return;
    }
    if (!trimmedGroup) {
      triggerShake('group');
      return;
    }
    // 이름 중복 검증 (QA-S5-03) — 입력값은 유지 (SPEC Q12)
    if (isNicknameTaken(trimmedName)) {
      setDupError(true);
      triggerShake('name');
      return;
    }
    completeOnboarding(trimmedName, trimmedGroup);
    navigate('/');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    // 이름 수정 시 에러 해제 (QA-S5-04)
    if (dupError) setDupError(false);
  };

  const preview = name.trim() === '' ? '???' : name.trim();

  return (
    <main data-testid="scr-onboarding" className="s5-root">
      <div className="vanish-grid" aria-hidden />
      <div className="s5-watermark font-arcade" aria-hidden>
        READY?
      </div>

      <Card
        marquee="NEW CHALLENGER — ENTER YOUR NAME"
        marqueeColor="var(--accent)"
        brackets
        bracketColor="var(--p1)"
        className="s5-card anim-sign-on"
      >
        <form className="s5-card-inner" onSubmit={handleSubmit} noValidate>
          <span className="s5-preview font-arcade glow-text" aria-live="polite">
            PLAYER: {preview}
          </span>
          <h1 className="s5-title font-display">What&rsquo;s your name?</h1>

          {/* 이름 */}
          <div className="s5-field">
            <label className="s5-label font-display" htmlFor="onboarding-name">
              이름 <span className="en">NAME</span>
            </label>
            <div
              className={[
                'neon-input',
                dupError ? 'error' : '',
                shakeField === 'name' ? 'anim-shake' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="prompt" aria-hidden>
                &gt;
              </span>
              <input
                id="onboarding-name"
                data-testid="input-nickname"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="닉네임을 입력하세요"
                autoComplete="off"
                autoFocus
              />
            </div>
            {dupError && (
              <p className="s5-err" data-testid="err-nickname-dup" role="alert">
                이미 사용하고 있는 이름입니다
              </p>
            )}
          </div>

          {/* 분반 */}
          <div className="s5-field">
            <label className="s5-label font-display" htmlFor="onboarding-group">
              분반 <span className="en">GROUP</span>
            </label>
            <div
              className={['neon-input', shakeField === 'group' ? 'anim-shake' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className="prompt" aria-hidden>
                &gt;
              </span>
              <input
                id="onboarding-group"
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="예: 1분반"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="s5-submit-row">
            <Button type="submit" variant="primary" block data-testid="btn-nickname-submit">
              확인
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
