/**
 * Button — OBSIDIAN 버튼 프리미티브 (PLAN §1.5).
 *
 * variant:
 *   'primary'   — 시안 1px 발광 보더 + 코너컷 (온라인 게임하기, 빠른 시작, 확인)
 *   'secondary' — --line 보더, 발광 없음 (오프라인, 취소, 기본값)
 *   'ghost'     — 텍스트 버튼, 호버 시안 언더라인 (로그아웃, ← 메인으로)
 *   'google'    — 다크 surface + 흰 G 로고 + "SIGN IN WITH GOOGLE"
 *
 * overline: 영문 OVERLINE 상단행 (예: "RANKED QUEUE"). children이 한글 라벨.
 *
 * 사용 예:
 *   <Button variant="primary" overline="RANKED QUEUE" testId="btn-online"
 *           onClick={...}>온라인 게임하기</Button>
 *   <Button variant="google" testId="btn-google-login" onClick={...} />
 *     (google variant는 children 생략 시 "SIGN IN WITH GOOGLE" 자동 표기)
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'google';
  /** 영문 OVERLINE 상단행 (Orbitron 와이드 트래킹) */
  overline?: string;
  /** data-testid */
  testId?: string;
  children?: ReactNode;
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export function Button({
  variant = 'secondary',
  overline,
  testId,
  children,
  className,
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} data-testid={testId} {...rest}>
      {variant === 'google' && <GoogleLogo />}
      {overline && <span className="btn-overline">{overline}</span>}
      {variant === 'google' && children === undefined ? (
        <span>SIGN IN WITH GOOGLE</span>
      ) : (
        children
      )}
    </button>
  );
}
