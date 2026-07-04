/**
 * S3. 로그인 요구 모달 (modal-login-required)
 * [소유: auth 에이전트]
 *
 * SPEC S3 + PLAN §2 S3:
 * - 타이틀 바 LOGIN REQUIRED!(레드) + 자물쇠 도트 스프라이트 + 등장 셰이크(거부감 연출)
 * - "온라인 게임은 로그인이 필요합니다!" 문구 (QA-S3-01)
 * - btn-google-login (모달 내 자체 부착 — testid 레지스트리 허용) + 취소하기 (QA-S3-02)
 * - 로그인 성공 → onLoginSuccess() (호출측 S1이 S6으로 이어감 — QA-S3-03)
 * - 취소/ESC/배경 → onClose() (QA-S3-04)
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Modal } from '../components';
import { loginWithGoogleMock } from '../state/session';

export interface LoginRequiredProps {
  open: boolean;
  onClose: () => void;
  /** mock 로그인 완료 후 호출 — S1이 온라인 패널(S6)로 이어감 */
  onLoginSuccess: () => void;
}

/* --- 픽셀 스프라이트 (PICO-8 팔레트만 — PLAN §1.1) --- */
const PICO: Record<string, string> = {
  K: '#000000',
  R: '#FF004D',
  Y: '#FFEC27',
  G: '#00E436',
  B: '#29ADFF',
  L: '#83769C',
};

function PixelSprite({
  rows,
  px = 4,
  style,
}: {
  rows: readonly string[];
  px?: number;
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

/** 자물쇠 8x7 (라벤더 고리 + 옐로 몸통 + 검정 키홀) */
const LOCK = [
  '.LLLL..',
  'LL..LL.',
  'LL..LL.',
  'YYYYYYY',
  'YYYKYYY',
  'YYYKYYY',
  'YYYYYYY',
] as const;

/** 구글 G 로고 — PICO-8 근사색 8x8 도트 */
const GOOGLE_G = [
  '..RRRR..',
  '.RR..RR.',
  'YY......',
  'YY..BBBB',
  'YY....BB',
  'YY....BB',
  '.GG..BB.',
  '..GGGG..',
] as const;

export default function LoginRequired({
  open,
  onClose,
  onLoginSuccess,
}: LoginRequiredProps) {
  const [busy, setBusy] = useState(false);

  // 닫혔다 다시 열릴 때 로딩 상태 초기화
  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const handleLogin = async () => {
    if (busy) return;
    setBusy(true);
    await loginWithGoogleMock(); // 0.5초 mock 지연
    onLoginSuccess();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={<span style={{ color: 'var(--danger)' }}>LOGIN REQUIRED!</span>}
      testId="modal-login-required"
      width={360}
      shake
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <PixelSprite rows={LOCK} px={5} />
        <p style={{ fontSize: 18, lineHeight: 1.5 }}>
          온라인 게임은 <span style={{ color: 'var(--accent-2)' }}>로그인</span>이
          필요합니다!
        </p>
        <Button
          data-testid="btn-google-login"
          pixelFont
          disabled={busy}
          onClick={handleLogin}
          style={{
            width: '100%',
            background: 'var(--text)',
            color: 'var(--bg-deep)',
            gap: 10,
          }}
        >
          <PixelSprite rows={GOOGLE_G} px={2} />
          {busy ? 'SIGNING IN...' : 'SIGN IN WITH GOOGLE'}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => onClose()}
          style={{ width: '100%' }}
        >
          취소하기
        </Button>
      </div>
    </Modal>
  );
}
