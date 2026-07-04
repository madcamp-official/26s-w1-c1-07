/**
 * KeyCap — 인게임 온스크린 키 표기 [Q] 스타일 (PLAN §1.5).
 * 해당 키 눌림(active) 시 진영색 필 점등. 옆에 설명 라벨(↓/↑/발사 등) 병기 가능.
 *
 * SPEC Q2: 패드에는 실제 배정 키(Q/W vs U/I)를 표기한다.
 *
 * 사용 예:
 *   <KeyCap label="Q" desc="↓" side="p1" active={pressed.q} />
 *   <KeyCap label="W" desc="발사" side="p1" active={pressed.w} />
 */
export interface KeyCapProps {
  /** 키 표기 (Q/W/U/I 등) */
  label: string;
  /** 키 역할 설명 (↓, ↑, ←, →, 발사, 공격 ...) */
  desc?: string;
  side?: 'p1' | 'p2';
  /** 실입력 점등 */
  active?: boolean;
}

export function KeyCap({ label, desc, side = 'p1', active = false }: KeyCapProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <kbd className={`keycap keycap--${side}${active ? ' keycap--active' : ''}`}>{label}</kbd>
      {desc && (
        <span style={{ fontSize: 12, color: 'var(--text-md)' }}>{desc}</span>
      )}
    </span>
  );
}
