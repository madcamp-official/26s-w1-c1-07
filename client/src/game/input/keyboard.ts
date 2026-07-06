import type { GameInputEvent, KeyCode } from '@madpump/shared'

const KEYS: ReadonlySet<string> = new Set(['KeyQ', 'KeyW', 'KeyU', 'KeyI'])

/**
 * Local 2-player keyboard input source.
 * Decisions are based on e.code, so it works regardless of the Korean IME state.
 * OS key repeat (e.repeat) is ignored — only real presses count. (Game 2 movement is handled via down/up state, so it's unaffected)
 */
export function attachLocalKeyboard(
  now: () => number,
  push: (e: GameInputEvent) => void,
): () => void {
  const held = new Set<KeyCode>()

  const onKey = (e: KeyboardEvent) => {
    if (!KEYS.has(e.code)) return
    // Don't absorb shortcuts like Cmd+W (close tab) as game input
    if (e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    if (e.repeat) return
    const code = e.code as KeyCode
    const type = e.type === 'keydown' ? 'down' : 'up'
    if (type === 'down') held.add(code)
    else held.delete(code)
    push({ code, type, t: now() })
  }

  // When focus is lost, keyup events are dropped, so treat all held keys as released
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
