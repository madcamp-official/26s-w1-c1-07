import { G2 } from '@madpump/shared'
import type { Game2State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'

function fanRads(): number[] {
  const n = G2.BULLET_COUNT
  const s = G2.SPREAD_DEG * (Math.PI / 180)
  if (n <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(-s + (2 * s * i) / (n - 1))
  return out
}

export function renderGame2(
  ctx: CanvasRenderingContext2D,
  s: Game2State,
  w: number,
  h: number,
) {
  ctx.save()

  ctx.strokeStyle = '#2a3040'
  ctx.setLineDash([6, 8])
  ctx.beginPath()
  ctx.moveTo(G2.MARGIN, 40)
  ctx.lineTo(w - G2.MARGIN, 40)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.strokeStyle = 'rgba(80, 200, 255, 0.13)'
  ctx.setLineDash([2, 8])
  for (const a of fanRads()) {
    ctx.beginPath()
    ctx.moveTo(s.launcherX, G2.LAUNCHER_Y)
    ctx.lineTo(s.launcherX + Math.sin(a) * 500, G2.LAUNCHER_Y + Math.cos(a) * 500)
    ctx.stroke()
  }
  ctx.setLineDash([])

  ctx.fillStyle = '#4da3ff'
  roundRect(ctx, s.launcherX - 24, 28, 48, 24, 6)
  ctx.fillRect(s.launcherX - 5, 52, 10, 12)
  ctx.fillStyle = '#ffd23f'
  ctx.font = `bold 18px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(s.launcherDir === 1 ? '▶' : '◀', s.launcherX + s.launcherDir * 44, 40)
  ctx.fillStyle = '#8f98ab'
  ctx.font = `bold 12px ${FONT}`
  ctx.fillText('P1', s.launcherX, 22)

  ctx.fillStyle = '#232838'
  ctx.fillRect(16, 16, 90, 8)
  ctx.fillStyle = s.cooldown === 0 ? '#7dff8e' : '#565e73'
  ctx.fillRect(16, 16, 90 * (1 - s.cooldown / G2.FIRE_COOLDOWN), 8)
  ctx.fillStyle = '#8f98ab'
  ctx.textAlign = 'left'
  ctx.font = `bold 11px ${FONT}`
  ctx.fillText(`W ${G2.BULLET_COUNT}방향 발사(느린 로켓)`, 16, 34)

  for (const r of s.rockets) {
    const ang = Math.atan2(r.vy, r.vx) - Math.PI / 2
    ctx.save()
    ctx.translate(r.x, r.y + G2.ROCKET_H / 2)
    ctx.rotate(ang)
    ctx.fillStyle = 'rgba(255, 150, 70, 0.28)'
    roundRect(ctx, -3, -4, 6, G2.ROCKET_H, 3)
    ctx.fillStyle = '#ff8c42'
    roundRect(ctx, -G2.ROCKET_W / 2, -G2.ROCKET_H / 2, G2.ROCKET_W, G2.ROCKET_H, 5)
    ctx.fillStyle = '#ffd23f'
    ctx.beginPath()
    ctx.moveTo(-4, -G2.ROCKET_H / 2)
    ctx.lineTo(0, -G2.ROCKET_H / 2 - 8)
    ctx.lineTo(4, -G2.ROCKET_H / 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.fillStyle = '#1a1f2c'
  ctx.fillRect(0, G2.P2_Y + G2.P2_H, w, h - G2.P2_Y - G2.P2_H)

  const blinking = s.iframes > 0 && Math.floor(s.iframes * 20) % 2 === 0
  ctx.globalAlpha = blinking ? 0.35 : 1
  ctx.fillStyle = '#ff5d5d'
  roundRect(ctx, s.p2X - G2.P2_W / 2, G2.P2_Y, G2.P2_W, G2.P2_H, 7)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#8f98ab'
  ctx.textAlign = 'center'
  ctx.font = `bold 12px ${FONT}`
  ctx.fillText('P2', s.p2X, G2.P2_Y + G2.P2_H + 14)

  const hy = G2.P2_Y - 12
  const totalW = G2.MAX_HP * 16
  let hx = s.p2X - totalW / 2 + 8
  for (let i = 0; i < G2.MAX_HP; i++) {
    ctx.fillStyle = i < s.hp ? '#ff4d6d' : '#3a2530'
    heart(ctx, hx, hy, 6)
    hx += 16
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = '#ff8fa3'
  ctx.font = `bold 13px ${FONT}`
  ctx.fillText(`P2 HP ${Math.max(0, s.hp)} / ${G2.MAX_HP}`, w - 16, 22)

  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText(
    `${G2.ROCKET_SPEED_MIN}~${G2.ROCKET_SPEED_MAX}(느림) · 쿨 ${G2.FIRE_COOLDOWN}s · HP ${G2.MAX_HP}`,
    w - 14,
    h - 12,
  )
  ctx.restore()
}

function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + r * 0.9)
  ctx.bezierCurveTo(cx - r * 1.3, cy - r * 0.4, cx - r * 0.4, cy - r * 1.1, cx, cy - r * 0.3)
  ctx.bezierCurveTo(cx + r * 0.4, cy - r * 1.1, cx + r * 1.3, cy - r * 0.4, cx, cy + r * 0.9)
  ctx.closePath()
  ctx.fill()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}
