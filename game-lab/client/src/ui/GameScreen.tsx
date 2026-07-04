import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { GAME_DURATION } from '@madpump/shared'
import type { GameInputEvent, GameResult } from '@madpump/shared'
import { GAMES, CANVAS_W, CANVAS_H } from '../games/registry'
import { attachLocalKeyboard } from '../input/keyboard'

const RESULT_DISPLAY_MS = 3000

export default function GameScreen() {
  const { id } = useParams()
  const def = id ? GAMES[id] : undefined
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState<GameResult>(null)

  useEffect(() => {
    if (!def) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    // 레티나 선명도: 백킹스토어를 DPR 배율로 키우고 논리 좌표는 800×450 유지
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    let state = def.core.create(Math.random)
    const queue: GameInputEvent[] = []
    const start = performance.now()
    let last = start
    let finished = false

    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__madpump = {
        get state() {
          return state
        },
      }
    }

    const detachKeyboard = attachLocalKeyboard(
      () => (performance.now() - start) / 1000,
      (e) => {
        if (!finished) queue.push(e)
      },
    )

    let raf = 0
    const frame = (nowMs: number) => {
      // 탭 스로틀 등으로 프레임이 크게 밀려도 물리가 터지지 않게 dt 상한
      const dt = Math.min((nowMs - last) / 1000, 0.05)
      last = nowMs
      state = def.core.step(state, queue.splice(0), dt)
      draw()
      if (state.result) {
        finished = true
        setResult(state.result)
        return
      }
      raf = requestAnimationFrame(frame)
    }

    const draw = () => {
      ctx.fillStyle = '#10131a'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      def.render(ctx, state, CANVAS_W, CANVAS_H)
      drawHud(ctx, state.elapsed)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      detachKeyboard()
    }
  }, [def])

  useEffect(() => {
    if (!result) return
    const tm = setTimeout(() => navigate('/'), RESULT_DISPLAY_MS)
    return () => clearTimeout(tm)
  }, [result, navigate])

  if (!def) return <Navigate to="/" replace />

  return (
    <div className="game-screen">
      <div className="game-title">{def.title}</div>
      <div className={`play-area ${def.profiles ? 'with-profiles' : ''}`}>
        {def.profiles && (
          <figure className="profile profile-p1">
            <img src="/profiles/p1.png" alt="Player 1" />
            <figcaption className="p1-text">PLAYER 1</figcaption>
          </figure>
        )}
        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
          {result && (
            <div className="result-overlay">
              <div
                className={`result-text ${result === 'P1' ? 'p1' : result === 'P2' ? 'p2' : 'draw'}`}
              >
                {result === 'DRAW' ? 'DRAW' : result === 'P1' ? 'PLAYER 1 WIN!' : 'PLAYER 2 WIN!'}
              </div>
            </div>
          )}
        </div>
        {def.profiles && (
          <figure className="profile profile-p2">
            <img src="/profiles/p2.jpeg" alt="Player 2" />
            <figcaption className="p2-text">PLAYER 2</figcaption>
          </figure>
        )}
      </div>
      <div className="guides">
        <span className="guide p1-text">P1 — {def.guideP1}</span>
        <span className="guide p2-text">P2 — {def.guideP2}</span>
      </div>
    </div>
  )
}

function drawHud(ctx: CanvasRenderingContext2D, elapsed: number) {
  const remaining = Math.max(0, GAME_DURATION - elapsed)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = remaining <= 3 ? '#ff5d5d' : '#e8ecf4'
  ctx.font = 'bold 30px system-ui, sans-serif'
  ctx.fillText(remaining.toFixed(1), CANVAS_W / 2, 10)

  // 레디 카운트 없음 — 진입 즉시 "START !" 플래시와 함께 바로 시작
  if (elapsed < 0.9) {
    const a = Math.max(0, 1 - elapsed / 0.9)
    ctx.globalAlpha = a * 0.55
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.globalAlpha = a
    ctx.fillStyle = '#ffd23f'
    ctx.font = '900 76px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('START !', CANVAS_W / 2, CANVAS_H / 2)
  }
  ctx.restore()
}
