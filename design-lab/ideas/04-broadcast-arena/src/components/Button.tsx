/**
 * Button — 방송 그래픽 버튼 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * variant:
 *  - 'primary'   네이비 스큐 블록 + 흰 대문자. hover 시 골드 언더라인 좌→우 와이프, active 1px 하강.
 *  - 'secondary' 흰 바탕 + 1px 보더 스큐 블록.
 *  - 'google'    관례 유지 — 흰 바탕 + 컬러 G 로고, 스큐 없음. children 생략 시 "SIGN IN WITH GOOGLE".
 *  - 'text'      스큐 없는 텍스트 버튼 (로그아웃/뒤로가기 등).
 *
 * 사용법:
 *   <Button testId="btn-online" variant="primary" size="lg" onClick={...}>온라인 게임하기 · RANKED</Button>
 *   <Button testId="btn-google-login" variant="google" onClick={...} />
 *   <Button variant="text" onClick={...}>로그아웃</Button>
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'google' | 'text';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  testId?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  style?: CSSProperties;
  children?: ReactNode;
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
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
  testId,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  style,
  children,
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);

  const pad = size === 'lg' ? '14px 32px' : '9px 20px';
  const fontSize = size === 'lg' ? 16 : 14;

  if (variant === 'google') {
    return (
      <button
        data-testid={testId}
        type={type}
        disabled={disabled}
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 4,
          padding: pad,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: '0.04em',
          color: 'var(--ink)',
          boxShadow: 'var(--shadow)',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'default' : 'pointer',
          ...style,
        }}
      >
        <GoogleLogo />
        {children ?? 'SIGN IN WITH GOOGLE'}
      </button>
    );
  }

  if (variant === 'text') {
    return (
      <button
        data-testid={testId}
        type={type}
        disabled={disabled}
        onClick={onClick}
        style={{
          fontSize,
          color: 'var(--ink-sub)',
          textDecoration: hover ? 'underline' : 'none',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'default' : 'pointer',
          padding: '4px 6px',
          ...style,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {children}
      </button>
    );
  }

  const isPrimary = variant === 'primary';
  return (
    <button
      data-testid={testId}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="skew"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        position: 'relative',
        display: 'inline-block',
        background: isPrimary ? 'var(--strip)' : 'var(--surface)',
        border: isPrimary ? '1px solid var(--strip)' : '1px solid var(--line)',
        color: isPrimary ? '#fff' : 'var(--ink)',
        padding: pad,
        overflow: 'hidden',
        translate: active && !disabled ? '0 1px' : '0 0',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: `translate 80ms var(--ease)`,
        ...style,
      }}
    >
      <span
        className="unskew"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontStretch: '75%',
          fontSize,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      {/* hover 골드 언더라인 좌→우 와이프 (primary 전용) */}
      {isPrimary && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 3,
            width: hover && !disabled ? '100%' : '0%',
            background: 'linear-gradient(90deg, var(--gold), var(--gold-bright))',
            transition: `width var(--dur) var(--ease)`,
          }}
        />
      )}
    </button>
  );
}
