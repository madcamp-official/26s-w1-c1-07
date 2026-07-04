import type { Game9State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'
const P1 = '#4da8ff'
const P2 = '#ff5d5d'

export function renderGame9(
  ctx: CanvasRenderingContext2D,
  s: Game9State,
  w: number,
  h: number,
) {
  const cy = h * 0.5
  const midX = w / 2
  const half = w * 0.4 // 완승선까지 반폭
  const markerX = midX + s.pos * half

  // ── 완승 구역 표시 ──
  ctx.fillStyle = 'rgba(77,168,255,0.06)'
  ctx.fillRect(0, 0, midX - half, h)
  ctx.fillStyle = 'rgba(255,93,93,0.06)'
  ctx.fillRect(midX + half, 0, w - (midX + half), h)

  // 완승선
  ctx.strokeStyle = P1
  ctx.setLineDash([6, 6])
  ctx.lineWidth = 2
  line(ctx, midX - half, 60, midX - half, h - 60)
  ctx.strokeStyle = P2
  line(ctx, midX + half, 60, midX + half, h - 60)
  // 중앙선
  ctx.strokeStyle = '#3a4250'
  line(ctx, midX, 40, midX, h - 40)
  ctx.setLineDash([])

  // ── 밧줄 ──
  ctx.strokeStyle = '#6b5a3a'
  ctx.lineWidth = 6
  line(ctx, midX - half + 20, cy, midX + half - 20, cy)
  // 매듭(마커)
  ctx.fillStyle = '#ffd23f'
  ctx.beginPath()
  ctx.arc(markerX, cy, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#0d0f14'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(markerX, cy, 12, 0, Math.PI * 2)
  ctx.stroke()

  // ── 양쪽 당기는 사람 ──
  drawPuller(ctx, markerX - 40, cy, P1, 1, s.p1Flash)
  drawPuller(ctx, markerX + 40, cy, P2, -1, s.p2Flash)

  // ── HUD ──
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillStyle = P1
  ctx.font = `bold 14px ${FONT}`
  ctx.fillText('PLAYER 1  ◀ 당겨', 20, 44)
  ctx.fillStyle = '#8f98ab'
  ctx.font = `12px ${FONT}`
  ctx.fillText(`Q↔W 교대 · ${s.p1Pulls}회`, 20, 64)

  ctx.textAlign = 'right'
  ctx.fillStyle = P2
  ctx.font = `bold 14px ${FONT}`
  ctx.fillText('당겨 ▶  PLAYER 2', w - 20, 44)
  ctx.fillStyle = '#8f98ab'
  ctx.font = `12px ${FONT}`
  ctx.fillText(`U↔I 교대 · ${s.p2Pulls}회`, w - 20, 64)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText('같은 키 연타는 무효 — 두 키를 번갈아 눌러야 당겨진다', midX, h - 40)
}

function drawPuller(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  color: string,
  face: 1 | -1,
  flash: number,
) {
  // face=1 → 왼쪽 사람(오른쪽의 밧줄을 왼쪽으로 당김). 당길 때 뒤로 젖힘.
  const lean = flash > 0 ? 6 : 0
  const bx = x - face * lean
  const groundY = cy + 46
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  const hipY = groundY - 30
  const shoulderY = cy - 6
  // 다리(버티는 자세)
  ctx.beginPath()
  ctx.moveTo(bx, hipY)
  ctx.lineTo(bx - face * 14, groundY)
  ctx.moveTo(bx, hipY)
  ctx.lineTo(bx + face * 6, groundY)
  ctx.stroke()
  // 몸통(뒤로 기울임)
  ctx.beginPath()
  ctx.moveTo(bx, hipY)
  ctx.lineTo(bx - face * 8, shoulderY)
  ctx.stroke()
  // 머리
  ctx.beginPath()
  ctx.arc(bx - face * 10, shoulderY - 10, 8, 0, Math.PI * 2)
  ctx.fill()
  // 팔(밧줄 쪽으로)
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(bx - face * 8, shoulderY)
  ctx.lineTo(x + face * 18, cy)
  ctx.stroke()
  ctx.restore()
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}
