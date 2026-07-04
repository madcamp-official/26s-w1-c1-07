/**
 * Button — PICO-8 픽셀 버튼 프리미티브 (PLAN §1.5).
 *
 * 스타일: 2px 검정 아웃라인 + 4px 하드섀도, hover 시 좌상단으로 -2px 떠오르며
 * 좌측에 ▶ 커서 출현, active 시 2px 눌림. disabled는 그레이+섀도 제거.
 *
 * 사용법:
 *   <Button variant="primary" size="lg" onClick={...}>온라인 게임하기</Button>
 *   <Button variant="surface">코드 생성하기</Button>
 *   <Button variant="ghost">취소하기</Button>
 *   <Button variant="primary" pixelFont>START</Button>   // 영문 레이블은 픽셀폰트
 *   <Button overline="ONLINE MATCH">온라인 게임하기</Button> // 영문 오버라인 2단 스택 (PLAN §1.2)
 *   <Button data-testid="btn-online" ...>                 // 나머지 button 속성 전부 통과
 *
 * variant: 'primary'(오렌지 CTA) | 'surface'(퍼플 기본) | 'ghost'(그레이 보조)
 * size: 'sm'(32px) | 'md'(40px, 기본) | 'lg'(56px)
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지. 스타일 변형이 필요하면
 * className을 추가로 얹어서 화면 CSS에서 확장할 것.
 */
import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export type ButtonVariant = 'primary' | 'surface' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true면 레이블을 Press Start 2P로 (영문/숫자 전용, 6단어 이내) */
  pixelFont?: boolean;
  /** hover ▶ 커서 표시 여부 (기본 true) */
  cursor?: boolean;
  /** 영문 픽셀 오버라인 (한글 레이블 위 2단 스택 — PLAN §1.2 라벨 관례) */
  overline?: string;
}

const VAR_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--bg-deep)' },
  surface: { background: 'var(--surface)', color: 'var(--text)' },
  ghost: { background: 'var(--surface-3)', color: 'var(--text)' },
};

const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  sm: { minHeight: 32, padding: '0 12px', fontSize: 14 },
  md: { minHeight: 40, padding: '0 16px', fontSize: 18 },
  lg: { minHeight: 56, padding: '0 24px', fontSize: 20 },
};

export function Button({
  variant = 'surface',
  size = 'md',
  pixelFont = false,
  cursor = true,
  overline,
  className,
  style,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    'px-btn',
    `px-btn--${variant}`,
    cursor && !disabled ? 'px-btn--cursor' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: overline ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: overline ? 2 : 8,
        border: '2px solid var(--bg-deep)',
        boxShadow: disabled ? 'none' : 'var(--shadow-hard)',
        fontFamily: pixelFont ? 'var(--font-pixel)' : 'var(--font-kr)',
        lineHeight: pixelFont ? 1.6 : 1.2,
        textTransform: pixelFont ? 'uppercase' : undefined,
        userSelect: 'none',
        ...VAR_STYLE[variant],
        ...SIZE_STYLE[size],
        ...(pixelFont ? { fontSize: Math.max(10, (SIZE_STYLE[size].fontSize as number) - 6) } : null),
        ...(disabled
          ? { background: 'var(--surface-3)', color: 'var(--text-soft)', cursor: 'not-allowed' }
          : null),
        ...style,
      }}
      {...rest}
    >
      {overline ? (
        <span
          className="px-font"
          style={{ fontSize: 10, opacity: 0.8, lineHeight: 1 }}
        >
          {overline}
        </span>
      ) : null}
      {children}
    </button>
  );
}

export default Button;
