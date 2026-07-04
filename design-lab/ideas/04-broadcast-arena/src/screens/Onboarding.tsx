/**
 * S5 닉네임 온보딩 (canonical 16:1422 / 상태: 16:2475 입력 중, 16:1923 중복 에러).
 * 담당: auth 에이전트.
 *
 * PLAN §2 S5 "선수 등록(PLAYER REGISTRATION) 카드": 스큐 탭, 제목 "What's your name?",
 * 이름·분반 입력 2행, 확인. 카드 우상단에 입력값 실시간 반영 미리보기 네임플레이트.
 *
 * - 중복(isNicknameTaken): err-nickname-dup 레드 캡션 "이미 사용하고 있는 이름입니다",
 *   입력 유지 (QA-S5-03, Q12) / 이름 수정 시 에러 해제 (QA-S5-04)
 * - 이름/분반 빈 값 제출 방지 (QA-S5-05)
 * - 성공: completeOnboarding(name, group) → navigate('/') → S2 (QA-S5-06)
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, SkewTab, Ticker } from '../components';
import { isNicknameTaken, completeOnboarding } from '../state/session';
import { useDebugScreen } from '../debug';
import './auth.css';

export default function Onboarding() {
  useDebugScreen('scr-onboarding');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [dupError, setDupError] = useState(false);

  const canSubmit = name.trim().length > 0 && group.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const g = group.trim();
    if (!n || !g) return; // 빈 입력 제출 방지
    if (isNicknameTaken(n)) {
      setDupError(true); // 입력은 유지 (Q12)
      return;
    }
    completeOnboarding(n, g);
    navigate('/');
  };

  // 미리보기 네임플레이트 문구 (입력값 실시간 반영)
  const previewName = name.trim() || 'PLAYER ?';
  const previewGroup = group.trim();

  return (
    <div data-testid="scr-onboarding" className="auth-screen">
      <div className="auth-pitch" aria-hidden="true" />

      {/* 상단 방송 헤더 바 (채널 로고만 — 등록 전이라 액션 없음) */}
      <header className="auth-header">
        <div className="auth-header-left">
          <SkewTab>MP ARENA</SkewTab>
          <span className="label" style={{ color: 'var(--ink-sub)' }}>
            New Player Sign-Up
          </span>
        </div>
      </header>

      <main className="s5-center">
        <Card
          accent="navy"
          tab="PLAYER REGISTRATION"
          style={{ width: 'min(520px, 92vw)', padding: 28 }}
        >
          {/* 우상단 미리보기 네임플레이트 — 입력이 로워서드에 실시간 반영 */}
          <div style={{ position: 'absolute', top: -14, right: 20 }} aria-hidden="true">
            <span
              className="skew"
              style={{
                display: 'inline-block',
                background: 'var(--p1)',
                color: '#fff',
                padding: '5px 14px',
                boxShadow: 'var(--shadow)',
                maxWidth: 220,
                overflow: 'hidden',
              }}
            >
              <span
                className="unskew"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontStretch: '80%',
                  fontSize: 13,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {previewName}
                {previewGroup ? ` · ${previewGroup}` : ''}
              </span>
            </span>
          </div>

          <h1
            className="display"
            style={{ margin: '4px 0 22px', fontSize: 26, fontWeight: 800, fontStretch: '110%' }}
          >
            What&rsquo;s your name?
          </h1>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: 18 }}>
              <label className="label s5-field-label" htmlFor="onboarding-name">
                이름 · Name
              </label>
              <input
                id="onboarding-name"
                data-testid="input-nickname"
                className={`input s5-input${dupError ? ' input-error' : ''}`}
                type="text"
                value={name}
                autoFocus
                autoComplete="off"
                placeholder="닉네임을 입력하세요"
                onChange={(e) => {
                  setName(e.target.value);
                  if (dupError) setDupError(false); // 수정 시 에러 해제
                }}
              />
              {dupError && (
                <p
                  data-testid="err-nickname-dup"
                  style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--live)' }}
                >
                  이미 사용하고 있는 이름입니다
                </p>
              )}
            </div>

            <div style={{ marginBottom: 26 }}>
              <label className="label s5-field-label" htmlFor="onboarding-group">
                분반 · Group
              </label>
              <input
                id="onboarding-group"
                data-testid="input-group"
                className="input s5-input"
                type="text"
                value={group}
                autoComplete="off"
                placeholder="예: 1분반"
                onChange={(e) => setGroup(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                testId="btn-nickname-submit"
                variant="primary"
                size="lg"
                type="submit"
                disabled={!canSubmit}
              >
                확인 · Register
              </Button>
            </div>
          </form>
        </Card>
      </main>

      <Ticker />
    </div>
  );
}
