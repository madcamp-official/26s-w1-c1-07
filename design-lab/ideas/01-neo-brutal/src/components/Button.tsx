/**
 * Button — 네오브루탈 버튼 프리미티브 (PLAN §1.5).
 * hover 떠오름 / press 물리 눌림은 theme.css의 .btn 규칙이 처리.
 *
 * 사용법:
 *   <Button variant="primary" size="lg" data-testid="btn-online" onClick={...}>온라인 게임하기</Button>
 *   <Button variant="danger" onClick={...}>취소하기</Button>
 *   <Button variant="tertiary" onClick={logout}>로그아웃</Button>
 *
 * variant: primary(accent CTA) | secondary(흰 표면, 기본) | danger(취소류: 흰 표면+에러 텍스트)
 *          | tertiary(보더 없는 밑줄 텍스트)
 * size: sm | md(기본) | lg(대형 CTA, min-width 360px)
 */
import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'tertiary';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizeClass = size === 'md' ? '' : ` btn--${size}`;
  return <button type={type} className={`btn btn--${variant}${sizeClass} ${className}`} {...rest} />;
}
