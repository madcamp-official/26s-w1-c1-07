import { G8, magmaSurfaceY } from '@madpump/shared'
import type { Game8State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'
const P1_COLOR = '#4da3ff'
const P2_COLOR = '#ff5d5d'

export function renderGame8(
  ctx: CanvasRenderingContext2D,
  s: Game8State,
  w: number,
  h: number,
) {
  ctx.save()

  // ── 천장 가시 ──
  ctx.fillStyle = '#3a4152'
  ctx.fillRect(0, 0, w, G8.SPIKE_H * 0.45)
  ctx.fillStyle = '#c3ccdd'
  const teeth = 26
  const tw = w / teeth
  for (let i = 0; i < teeth; i++) {
    const x = i * tw
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + tw / 2, G8.SPIKE_H)
    ctx.lineTo(x + tw, 0)
    ctx.closePath()
    ctx.fill()
  }

  // ── 마그마 ──
  const surf = magmaSurfaceY(s.elapsed)
  const grad = ctx.createLinearGradient(0, surf, 0, h)
  grad.addColorStop(0, '#ff7a18')
  grad.addColorStop(0.5, '#e23e0d')
  grad.addColorStop(1, '#7a1400')
  ctx.fillStyle = grad
  ctx.fillRect(0, surf, w, h - surf)
  // 표면 일렁임
  ctx.strokeStyle = '#ffd23f'
  ctx.lineWidth = 3
  ctx.beginPath()
  const wobT = s.elapsed * 6
  for (let x = 0; x <= w; x += 16) {
    const y = surf + Math.sin(x * 0.05 + wobT) * 3
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.lineWidth = 1
  // 목표선(50%) 힌트
  ctx.strokeStyle = 'rgba(255,210,63,0.18)'
  ctx.setLineDash([4, 8])
  ctx.beginPath()
  ctx.moveTo(0, h * (1 - G8.MAGMA_END_FRAC))
  ctx.lineTo(w, h * (1 - G8.MAGMA_END_FRAC))
  ctx.stroke()
  ctx.setLineDash([])

  // ── 총알 ──
  for (const b of s.bullets) {
    const col = b.owner === 1 ? P1_COLOR : P2_COLOR
    // 트레일
    ctx.strokeStyle = col
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - Math.sign(b.vx) * 14, b.y)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.lineWidth = 1
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.arc(b.x, b.y, G8.BULLET_R, 0, Math.PI * 2)
    ctx.fill()
  }

  // ── 플레이어 ──
  drawPlayer(ctx, G8.P1_X, s.p1Y, 1, P1_COLOR, s.p1Cd)
  drawPlayer(ctx, G8.P2_X, s.p2Y, -1, P2_COLOR, s.p2Cd)

  // ── HUD ──
  ctx.textBaseline = 'alphabetic'
  ctx.font = `bold 13px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillStyle = P1_COLOR
  ctx.fillText('P1  Q 점프 · W 발사', 14, 34)
  ctx.textAlign = 'right'
  ctx.fillStyle = P2_COLOR
  ctx.fillText('U 점프 · I 발사  P2', w - 14, 34)

  ctx.restore()
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  face: 1 | -1,
  color: string,
  cd: number,
) {
  // 몸통
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x - G8.PW / 2, y - G8.PH / 2, G8.PW, G8.PH, 6)
  ctx.fill()
  // 총구(바라보는 방향)
  ctx.fillStyle = cd === 0 ? '#ffd23f' : '#5a6172'
  ctx.beginPath()
  ctx.roundRect(x + face * (G8.PW / 2), y - 3, face * 12, 6, 3)
  ctx.fill()
  // 눈
  ctx.fillStyle = '#10131a'
  ctx.beginPath()
  ctx.arc(x + face * 5, y - 4, 2.4, 0, Math.PI * 2)
  ctx.fill()
  // 라벨
  ctx.fillStyle = '#e8ecf4'
  ctx.font = `bold 10px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(face === 1 ? 'P1' : 'P2', x, y - G8.PH / 2 - 8)
}
