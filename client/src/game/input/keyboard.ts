import type { GameInputEvent, KeyCode } from '@madpump/shared'

const KEYS: ReadonlySet<string> = new Set(['KeyQ', 'KeyW', 'KeyU', 'KeyI'])

/**
 * 로컬 2인 키보드 입력 소스.
 * e.code 기준 판정이라 한글 IME 상태와 무관하게 동작한다.
 * OS 키 반복(e.repeat)은 무시 — 연타만 인정. (게임2 이동은 down/up 상태로 처리되므로 무관)
 */
export function attachLocalKeyboard(
  now: () => number,
  push: (e: GameInputEvent) => void,
): () => void {
  const held = new Set<KeyCode>()

  const onKey = (e: KeyboardEvent) => {
    if (!KEYS.has(e.code)) return
    // Cmd+W(탭 닫기) 등 단축키는 게임 입력으로 흡수하지 않는다
    if (e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    if (e.repeat) return
    const code = e.code as KeyCode
    const type = e.type === 'keydown' ? 'down' : 'up'
    if (type === 'down') held.add(code)
    else held.delete(code)
    push({ code, type, t: now() })
  }

  // 포커스를 잃으면 keyup이 유실되므로, 눌려 있던 키를 전부 뗀 것으로 처리
  const onBlur = () => {
    for (const code of held) push({ code, type: 'up', t: now() })
    held.clear()
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('keyup', onKey)
    window.removeEventListener('blur', onBlur)
  }
}
