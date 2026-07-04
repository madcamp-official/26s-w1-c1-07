/**
 * S5. 닉네임 온보딩 (scr-onboarding)
 * [소유: auth 에이전트]
 *
 * SPEC S5 + PLAN §2 S5 — 하이스코어 이니셜 등록 화면 오마주:
 * - NEW PLAYER! 퍼플 카드 + "What's your name?" (QA-S5-01)
 * - 이름(input-nickname) / 분반 입력 2행 (라벨 좌측 "이름 :" / "분반 :")
 * - 확인(btn-nickname-submit) → submitOnboarding(name, group)
 *   - duplicate → err-nickname-dup "이미 사용하고 있는 이름입니다" + 셰이크 (QA-S5-03)
 *   - 이름 수정 시 에러 해제 (QA-S5-04), 빈 값 제출 방지 (QA-S5-05)
 *   - ok → '/' (세션 loggedIn → S2 렌더, QA-S5-06)
 * - S3에서 넘어온 {intent:'online'}은 완료 시 '/'의 {openOnline:true}로 승계
 * - 카드 옆 8x8 신입 캐릭터 스프라이트 — 입력할 때마다 눈 깜빡임
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useDebugScreen } from '../debug';
import { Button, Card } from '../components';
import { submitOnboarding, useSession } from '../state/session';
import './Onboarding.css';

/* --- 픽셀 스프라이트 (PICO-8 팔레트만) --- */
const PICO: Record<string, string> = {
  K: '#000000',
  O: '#FFA300',
  F: '#FFCCAA',
};

function PixelSprite({
  rows,
  px = 4,
  className,
  style,
}: {
  rows: readonly string[];
  px?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return (
    <svg
      width={w * px}
      height={rows.length * px}
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const fill = PICO[ch];
          if (!fill) return null;
          return <rect key={`${y}-${x}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}

/** 신입 캐릭터 — 오렌지 캡 + 스킨톤 얼굴 (눈 뜸/감음 2프레임) */
const FACE_OPEN = [
  '.OOOOOO.',
  'OOOOOOOO',
  'FFFFFFFF',
  'FKFFFFKF',
  'FFFFFFFF',
  'FFKKKKFF',
  '.FFFFFF.',
] as const;

const FACE_BLINK = [
  '.OOOOOO.',
  'OOOOOOOO',
  'FFFFFFFF',
  'FKKFFKKF',
  'FFFFFFFF',
  'FFKKKKFF',
  '.FFFFFF.',
] as const;

export default function Onboarding() {
  useDebugScreen('scr-onboarding');
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [dupError, setDupError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [blink, setBlink] = useState(false);
  const blinkTimer = useRef<number | null>(null);
  const submitted = useRef(false);

  useEffect(
    () => () => {
      if (blinkTimer.current) window.clearTimeout(blinkTimer.current);
    },
    [],
  );

  // 가드: 비로그인/온보딩 불필요 상태의 직접 접근은 '/'로
  // (성공 제출 직후의 자체 navigate(state 포함)와 충돌하지 않게 ref로 구분)
  if (!submitted.current && (!session.loggedIn || !session.needsOnboarding)) {
    return <Navigate to="/" replace />;
  }

  const canSubmit = name.trim().length > 0 && group.trim().length > 0;

  /** 타이핑마다 캐릭터 눈 깜빡임 (PLAN §2 S5) */
  const pokeSprite = () => {
    setBlink(true);
    if (blinkTimer.current) window.clearTimeout(blinkTimer.current);
    blinkTimer.current = window.setTimeout(() => setBlink(false), 180);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return; // QA-S5-05 빈 값 제출 방지
    const r = submitOnboarding(name, group);
    if (r.ok) {
      submitted.current = true;
      const fromOnlineIntent =
        (location.state as { intent?: string } | null)?.intent === 'online';
      // S3 경유(온라인 의도)였다면 S2가 온라인 패널을 이어서 열도록 state 승계
      navigate('/', {
        replace: true,
        state: fromOnlineIntent ? { openOnline: true } : undefined,
      });
      return;
    }
    if (r.reason === 'duplicate') {
      setDupError(true);
      setShakeKey((k) => k + 1); // 에러 문구 셰이크 재트리거
    }
  };

  return (
    <div data-testid="scr-onboarding" className="ob-root px-snap-in">
      <PixelSprite
        rows={blink ? FACE_BLINK : FACE_OPEN}
        px={10}
        className="ob-face"
      />
      <Card tone="purple" title="NEW PLAYER!" floating className="ob-card">
        <form className="ob-form" onSubmit={handleSubmit} noValidate>
          <h2 className="ob-heading">What&apos;s your name?</h2>

          <div className="ob-row">
            <label className="ob-label" htmlFor="ob-name">
              이름 :
            </label>
            <div>
              <input
                id="ob-name"
                data-testid="input-nickname"
                className={`px-input${dupError ? ' is-error' : ''}`}
                value={name}
                placeholder="닉네임 입력"
                autoComplete="off"
                autoFocus
                maxLength={12}
                onChange={(e) => {
                  setName(e.target.value);
                  if (dupError) setDupError(false); // QA-S5-04 수정 시 에러 해제
                  pokeSprite();
                }}
              />
              {dupError ? (
                <p
                  key={shakeKey}
                  data-testid="err-nickname-dup"
                  className="px-error-text px-shake"
                  role="alert"
                >
                  이미 사용하고 있는 이름입니다
                </p>
              ) : null}
            </div>
          </div>

          <div className="ob-row">
            <label className="ob-label" htmlFor="ob-group">
              분반 :
            </label>
            <input
              id="ob-group"
              data-testid="input-group"
              className="px-input"
              value={group}
              placeholder="예: 1분반"
              autoComplete="off"
              maxLength={12}
              onChange={(e) => {
                setGroup(e.target.value);
                pokeSprite();
              }}
            />
          </div>

          <Button
            type="submit"
            data-testid="btn-nickname-submit"
            variant="primary"
            size="lg"
            disabled={!canSubmit}
            style={{ width: '100%' }}
          >
            확인
          </Button>
          {!canSubmit ? (
            <p className="ob-hint">이름과 분반을 모두 입력하세요</p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
