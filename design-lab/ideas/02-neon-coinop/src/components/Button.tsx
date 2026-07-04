/**
 * Button — NEON COIN-OP 네온 보더 버튼 (PLAN §1.5).
 * (아키텍트 소유 — 구현 에이전트 수정 금지)
 *
 * 위계:
 *   primary   — 옐로(--accent) 보더·텍스트. "지금 눌러야 할 것" (온라인 게임하기, 빠른 시작, 확인)
 *   secondary — 시안(--p1) 보더 (오프라인 게임하기, 기본값)
 *   tertiary  — 보더 없음, muted 텍스트 → hover 시 시안 점등 (로그아웃, 메인으로)
 *   danger    — --error 보더 (취소하기)
 *
 * 사용법:
 *   <Button variant="primary" data-testid="btn-online" coin onClick={...}>온라인 게임하기</Button>
 *   coin      — 라벨 왼쪽에 코인(¢) 아이콘 (primary CTA용)
 *   arcadeFont— 라벨을 Press Start 2P로 (영문 라벨 전용, 기본은 Gugi)
 *   block     — width 100%
 *
 * <CoinButton> — 원형 아케이드 코인 버튼 (설정 톱니 등 아이콘 진입점, PLAN §1.5).
 *   <CoinButton data-testid="btn-settings" label="설정">⚙</CoinButton>
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 라벨 좌측 코인(¢) 아이콘 */
  coin?: boolean;
  /** Press Start 2P 라벨 (영문 전용) */
  arcadeFont?: boolean;
  /** width:100% */
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  coin = false,
  arcadeFont = false,
  block = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'nc-btn',
    `nc-btn--${variant}`,
    arcadeFont ? 'font-arcade' : 'font-display',
    block ? 'nc-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {coin && (
        <span className="nc-btn__coin" aria-hidden>
          ¢
        </span>
      )}
      {children}
    </button>
  );
}

export interface CoinButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 접근성 라벨 (aria-label) */
  label: string;
  /** 링 색 (기본 --accent2) */
  color?: string;
  children: ReactNode;
}

/** 원형 네온 링 버튼 — press 시 링 글로우 소멸 */
export function CoinButton({ label, color, className = '', children, ...rest }: CoinButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`nc-coinbtn ${className}`}
      style={color ? ({ '--ring-color': color } as React.CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
