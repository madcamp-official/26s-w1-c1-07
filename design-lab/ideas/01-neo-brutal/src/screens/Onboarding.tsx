/**
 * S5. 닉네임 온보딩 (scr-onboarding)
 * [OWNER: auth 에이전트] — 이 파일은 auth 에이전트만 수정한다.
 *
 * 구현 (SPEC S5 / PLAN §2-S5):
 *  - "What's your name?" 카드(선수 등록 카드), 이름(input-nickname)/분반 입력,
 *    확인(btn-nickname-submit)
 *  - isNicknameTaken(name)이면 err-nickname-dup 에러 표시("이미 사용하고 있는 이름입니다"),
 *    이름 수정 시 에러 해제, 빈 값 제출 방지
 *  - 통과 시 completeOnboarding(name, group) → navigate('/') (S2로 렌더됨)
 *  - 실시간 미리보기: 카드 우상단 네임태그 스티커에 타이핑 내용 반영(비면 "???")
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Sticker } from '../components';
import { isNicknameTaken, completeOnboarding } from '../state/session';
import { useDebugScreen } from '../debug';

export default function Onboarding() {
  useDebugScreen('scr-onboarding');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [dupError, setDupError] = useState(false);

  const trimmedName = name.trim();
  const trimmedGroup = group.trim();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // 빈 값 제출 방지 (QA-S5-05) — 단, 이름 중복 검증은 이름만 있으면 우선 수행
    if (!trimmedName) return;
    if (isNicknameTaken(trimmedName)) {
      setDupError(true); // QA-S5-03
      return;
    }
    if (!trimmedGroup) return;
    completeOnboarding(trimmedName, trimmedGroup);
    navigate('/'); // loggedIn + 온보딩 완료 → App 게이트가 S2 렌더 (QA-S5-06)
  };

  return (
    <div className="screen s5-root" data-testid="scr-onboarding">
      <style>{S5_CSS}</style>

      {/* 카드 뒤 초대형 아웃라인 장식 타이포 */}
      <div className="s5-deco font-display" aria-hidden>
        NEW CHALLENGER
      </div>

      <div className="s5-card-wrap">
        {/* 우상단 실시간 네임태그 미리보기 */}
        <div className="s5-nametag">
          <Sticker tilt={4} bg="var(--p1-tint)" fontSize={18}>
            {trimmedName || '???'}
          </Sticker>
        </div>

        <Card hero title="PLAYER REGISTRATION" style={{ width: 560, maxWidth: 'calc(100vw - 48px)' }}>
          <form className="s5-form" onSubmit={onSubmit} noValidate>
            <h1 className="s5-heading font-display">What&rsquo;s your name?</h1>

            <div className="s5-field">
              <label htmlFor="s5-name">
                <Sticker tilt={-3} fontSize={14}>
                  이름
                </Sticker>
              </label>
              <input
                id="s5-name"
                className={`nb-input s5-input${dupError ? ' nb-input--error' : ''}`}
                data-testid="input-nickname"
                type="text"
                value={name}
                placeholder="닉네임을 입력하세요"
                autoComplete="off"
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                  setDupError(false); // 수정 시 에러 해제 (QA-S5-04)
                }}
              />
              {dupError && (
                <p className="input-error-text" data-testid="err-nickname-dup" role="alert">
                  이미 사용하고 있는 이름입니다
                </p>
              )}
            </div>

            <div className="s5-field">
              <label htmlFor="s5-group">
                <Sticker tilt={-3} fontSize={14}>
                  분반
                </Sticker>
              </label>
              <input
                id="s5-group"
                className="nb-input s5-input"
                type="text"
                value={group}
                placeholder="예: 1분반"
                autoComplete="off"
                onChange={(e) => setGroup(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              data-testid="btn-nickname-submit"
              style={{ width: '100%', minWidth: 0 }}
            >
              확인
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

const S5_CSS = `
.s5-root {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 24px;
}
.s5-deco {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-8deg);
  font-size: clamp(90px, 16vw, 220px);
  line-height: 0.95;
  white-space: nowrap;
  color: transparent;
  -webkit-text-stroke: 2px var(--ink);
  opacity: 0.07;
  user-select: none;
  pointer-events: none;
}
.s5-card-wrap {
  position: relative;
  z-index: 1;
}
.s5-nametag {
  position: absolute;
  top: -18px;
  right: -22px;
  z-index: 2;
  max-width: 260px;
  overflow: hidden;
}
.s5-form {
  padding: 28px 32px 32px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.s5-heading {
  font-size: 40px;
  line-height: 1.15;
  text-align: center;
  margin-bottom: 4px;
}
.s5-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.s5-field label {
  align-self: flex-start;
}
.s5-input {
  width: 100%;
  font-size: 20px;
  font-family: var(--font-body);
  padding: 12px 16px;
}
`;
