/**
 * Button — 통통한 클레이 알약 버튼 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지. 필요한 변형은 style/className으로)
 *
 * variant:
 *  - 'primary'   : --accent 배경 + 밝은 텍스트 (온라인/오프라인 게임하기, 확인)
 *  - 'secondary' : --surface 배경 + --ink 텍스트 (코드 생성, 복사, 기본값)
 *  - 'tertiary'  : 배경 없는 --lavender 텍스트, hover 시 연보라 알약 (로그아웃 등)
 *  - 'cancel'    : --surface 배경 + --error 텍스트 (취소하기)
 *  - 'google'    : 흰 클레이 알약 + 공식 G 로고 + 라벨 (SIGN IN WITH GOOGLE)
 *
 * 사용법:
 *   <Button variant="primary" size="lg" data-testid="btn-online" onClick={...}>온라인 게임하기</Button>
 *   <Button variant="google" data-testid="btn-google-login" onClick={...} />  // 라벨 자동
 *   <Button variant="cancel" onClick={...}>취소하기</Button>
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'cancel' | 'google';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  sm: { fontSize: 15, padding: '8px 18px', borderRadius: 18 },
  md: { fontSize: 18, padding: '12px 26px', borderRadius: 22 },
  lg: { fontSize: 22, padding: '16px 40px', borderRadius: 28 },
};

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: '#FFF9F4' },
  secondary: { background: 'var(--surface)', color: 'var(--ink)' },
  tertiary: {
    background: 'transparent',
    color: 'var(--lavender)',
    boxShadow: 'none',
  },
  cancel: { background: 'var(--surface)', color: 'var(--error)' },
  google: { background: 'var(--surface)', color: 'var(--ink)' },
};

/** 공식 Google 'G' 로고 (SVG 인라인) */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  children,
  style,
  className,
  ...rest
}: ButtonProps) {
  const isTertiary = variant === 'tertiary';
  return (
    <button
      className={`jelly ${className ?? ''}`}
      style={{
        fontFamily: 'var(--font-ui)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: isTertiary ? 'none' : 'var(--shadow-clay-sm)',
        ...SIZE_STYLE[size],
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      onMouseEnter={
        isTertiary
          ? (e) => {
              e.currentTarget.style.background = 'var(--bg-lilac)';
              rest.onMouseEnter?.(e);
            }
          : rest.onMouseEnter
      }
      onMouseLeave={
        isTertiary
          ? (e) => {
              e.currentTarget.style.background = 'transparent';
              rest.onMouseLeave?.(e);
            }
          : rest.onMouseLeave
      }
      {...rest}
    >
      {variant === 'google' && <GoogleG />}
      {children ?? (variant === 'google' ? 'SIGN IN WITH GOOGLE' : null)}
    </button>
  );
}
