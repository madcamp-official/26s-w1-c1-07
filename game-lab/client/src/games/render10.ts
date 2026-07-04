import { G10 } from '@madpump/shared'
import type { Game10State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'
const P1 = '#4da8ff'
const P2 = '#ff5d5d'
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

export function renderGame10(
  ctx: CanvasRenderingContext2D,
  s: Game10State,
  w: number,
  h: number,
) {
  const cw = w / G10.GX
  const ch = h / G10.GY

  // ── 아레나 배경 + 외곽 벽 ──
  ctx.fillStyle = '#0b0e14'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#2b3242'
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3)

  // 옅은 격자
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= G10.GX; x += 4) {
    ctx.moveTo(x * cw, 0)
    ctx.lineTo(x * cw, h)
  }
  for (let y = 0; y <= G10.GY; y += 4) {
    ctx.moveTo(0, y * ch)
    ctx.lineTo(w, y * ch)
  }
  ctx.stroke()

  // ── 궤적 ──
  for (let y = 0; y < G10.GY; y++) {
    for (let x = 0; x < G10.GX; x++) {
      const v = s.occ[y * G10.GX + x]
      if (!v) continue
      ctx.fillStyle = v === 1 ? 'rgba(77,168,255,0.55)' : 'rgba(255,93,93,0.55)'
      ctx.fillRect(x * cw + 0.5, y * ch + 0.5, cw - 1, ch - 1)
    }
  }

  // ── 바이크 머리(보간 위치 + 발광) ──
  drawHead(ctx, s.gx1, s.gy1, s.dir1, s.frac, cw, ch, P1)
  drawHead(ctx, s.gx2, s.gy2, s.dir2, s.frac, cw, ch, P2)

  // ── HUD ──
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = P1
  ctx.font = `bold 13px ${FONT}`
  ctx.fillText('P1  Q←/W→', 12, 10)
  ctx.textAlign = 'right'
  ctx.fillStyle = P2
  ctx.fillText('U←/I→  P2', w - 12, 10)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText('벽·궤적에 부딪히면 패 · 마지막 생존자 승', w / 2, h - 18)
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  dir: number,
  frac: number,
  cw: number,
  ch: number,
  color: string,
) {
  const x = (gx + 0.5 + DX[dir] * frac) * cw
  const y = (gy + 0.5 + DY[dir] * frac) * ch
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  ctx.fillStyle = color
  ctx.fillRect(x - cw * 0.55, y - ch * 0.55, cw * 1.1, ch * 1.1)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - cw * 0.22, y - ch * 0.22, cw * 0.44, ch * 0.44)
  ctx.restore()
}
