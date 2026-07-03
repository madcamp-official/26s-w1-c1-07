/**
 * Sticker — 기울어진 라벨 스티커 (PLAN §1.3 스탬프 모티프의 소형 버전).
 * "1v1 PUMPING DUEL", "YOU", "TARGET", "COPIED!" 등에 사용.
 *
 * 사용법:
 *   <Sticker tilt={-3}>1v1 PUMPING DUEL</Sticker>
 *   <Sticker tilt={-6} bg="var(--p1-tint)">YOU</Sticker>
 *   <Sticker tilt={-8} color="var(--error)">GUEST</Sticker>
 */
import type { CSSProperties, ReactNode } from 'react';

export interface StickerProps {
  children: ReactNode;
  /** 기울기(도). 기본 -3 */
  tilt?: number;
  /** 배경색. 기본 --surface */
  bg?: string;
  /** 텍스트/보더색. 기본 --ink */
  color?: string;
  /** 폰트 크기 px. 기본 14 */
  fontSize?: number;
  style?: CSSProperties;
}

export function Sticker({ children, tilt = -3, bg, color, fontSize, style }: StickerProps) {
  return (
    <span
      className="sticker"
      style={{
        transform: `rotate(${tilt}deg)`,
        background: bg,
        color,
        borderColor: color,
        fontSize,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
