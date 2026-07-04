/**
 * Keycap — 온스크린 키패드 키캡 (PLAN §1.5).
 *
 * 실물 키캡 스타일: 그레이 키캡 + 픽셀폰트 키 문자 + 아래 화살표/아이콘 라벨.
 * pressed=true면 2px 하강(실제 키 입력과 1:1 동기화용). owner로 진영색 링.
 *
 * 사용법 (게임 화면 하단 키패드 — QA-S9-11/S10-12 배정 키 표기):
 *   <Keycap keyLabel="Q" icon="↓" owner="P1" pressed={held.q} />
 *   <Keycap keyLabel="W" icon="↑" owner="P1" pressed={held.w} />
 *   <Keycap keyLabel="U" icon="←" owner="P2" />
 *   설정 스테퍼 등 버튼 겸용: <Keycap keyLabel="+" onClick={...} />
 *
 * [구현 에이전트 주의] 아키텍트 소유 — 수정 금지.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { PlayerRole } from '@shared';

export interface KeycapProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 키 문자 (Q/W/U/I 등 — 픽셀폰트 표기) */
  keyLabel: string;
  /** 키 아래(또는 위) 기능 표기 — 화살표 문자나 8x8 스프라이트 노드 */
  icon?: ReactNode;
  /** 진영색 링 (P1 블루 / P2 레드) */
  owner?: PlayerRole;
  /** 눌림 상태 (키보드 입력과 동기화) */
  pressed?: boolean;
  /** 한 변 px (기본 48) */
  size?: number;
}

export function Keycap({
  keyLabel,
  icon,
  owner,
  pressed = false,
  size = 48,
  className,
  style,
  ...rest
}: KeycapProps) {
  const cls = [
    'px-keycap',
    pressed ? 'is-pressed' : '',
    owner === 'P1' ? 'owner-p1' : owner === 'P2' ? 'owner-p2' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      style={{
        width: size,
        height: size,
        flexDirection: 'column',
        gap: 2,
        ...style,
      }}
      {...rest}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{keyLabel}</span>
      {icon ? (
        <span style={{ fontSize: 10, lineHeight: 1, color: 'var(--text-dim)' }}>
          {icon}
        </span>
      ) : null}
    </button>
  );
}

export default Keycap;
