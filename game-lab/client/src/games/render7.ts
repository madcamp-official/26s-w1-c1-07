import { G7, maxRun } from '@madpump/shared'
import type { Game7State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'

const P1_COLOR = '#4da8ff' // 파랑 돌
const P2_COLOR = '#ff5d5d' // 빨강 돌
const P1_RIM = '#2f6fb0'
const P2_RIM = '#b83b3b'

// 교점 배치 — N개의 점, (N-1)칸. 돌은 교점 위에 놓인다
const EXTENT = 330 // 첫 점 ~ 끝 점 픽셀 거리
const SP = EXTENT / (G7.N - 1) // 교점 간격
const R = SP * 0.4 // 돌 반지름
const OX = (800 - EXTENT) / 2
const OY = 70

const px = (c: number) => OX + c * SP
const py = (r: number) => OY + r * SP

export function renderGame7(
  ctx: CanvasRenderingContext2D,
  s: Game7State,
  w: number,
  _h: number,
) {
  const pad = 26
  const cursorR = Math.floor(s.cursor / G7.N)
  const cursorC = s.cursor % G7.N
  const turnColor = s.turn === 1 ? P1_COLOR : P2_COLOR

  // ── 판 배경 패널 ──
  ctx.fillStyle = '#1c222e'
  roundRect(ctx, OX - pad, OY - pad, EXTENT + pad * 2, EXTENT + pad * 2, 12)

  // ── 격자선(교점을 잇는 선) ──
  ctx.strokeStyle = '#3a4250'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < G7.N; i++) {
    ctx.moveTo(px(0), py(i))
    ctx.lineTo(px(G7.N - 1), py(i))
    ctx.moveTo(px(i), py(0))
    ctx.lineTo(px(i), py(G7.N - 1))
  }
  ctx.stroke()

  // 중앙 화점
  ctx.fillStyle = '#3a4250'
  const mid = (G7.N - 1) / 2
  dot(ctx, px(mid), py(mid), 3)

  // ── 현재 커서 교점 강조(현재 턴 색으로) ──
  ctx.strokeStyle = turnColor
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.3
  // 십자 가이드(빠른 커서 추적용)
  ctx.beginPath()
  ctx.moveTo(px(0), py(cursorR))
  ctx.lineTo(px(G7.N - 1), py(cursorR))
  ctx.moveTo(px(cursorC), py(0))
  ctx.lineTo(px(cursorC), py(G7.N - 1))
  ctx.stroke()
  ctx.globalAlpha = 1
  const ccx = px(cursorC)
  const ccy = py(cursorR)
  ctx.globalAlpha = 0.22
  ctx.fillStyle = turnColor
  dot(ctx, ccx, ccy, R * 0.9)
  ctx.globalAlpha = 1
  ctx.strokeStyle = turnColor
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(ccx, ccy, R * 0.9, 0, Math.PI * 2)
  ctx.stroke()

  // ── 돌(플랫) ──
  for (let idx = 0; idx < G7.CELLS; idx++) {
    const v = s.board[idx]
    if (!v) continue
    const r = Math.floor(idx / G7.N)
    const c = idx % G7.N
    drawStone(ctx, px(c), py(r), v === 1 ? P1_COLOR : P2_COLOR, v === 1 ? P1_RIM : P2_RIM, idx === s.lastPlaced)
  }

  // ── HUD ──
  drawPlayerHud(ctx, 14, 'PLAYER 1', P1_COLOR, 'Q', s.turn === 1, maxRun(s.board, 1), 'left')
  drawPlayerHud(ctx, w - 14, 'PLAYER 2', P2_COLOR, 'U', s.turn === 2, maxRun(s.board, 2), 'right')

  // 현재 턴 배너 + 남은 턴 시간 바
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = turnColor
  ctx.font = `bold 15px ${FONT}`
  ctx.fillText(`P${s.turn} 차례`, w / 2, 12)
  const barW = 120
  const remain = Math.max(0, 1 - s.turnClock / G7.TURN_TIME)
  ctx.fillStyle = '#232838'
  ctx.fillRect(w / 2 - barW / 2, 34, barW, 6)
  ctx.fillStyle = turnColor
  ctx.fillRect(w / 2 - barW / 2, 34, barW * remain, 6)

  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText('내 차례에 커서 교점에서 배치(Q/U) · 시간초과 시 랜덤 · W/I 플래시 방해', w / 2, OY + EXTENT + pad + 2)

  // ── 플래시 방해 ──
  if (s.flash > 0) {
    const a = 0.35 + 0.6 * (s.flash / G7.FLASH_TIME)
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`
    ctx.fillRect(OX - pad, OY - pad, EXTENT + pad * 2, EXTENT + pad * 2)
  }
}

function drawPlayerHud(
  ctx: CanvasRenderingContext2D,
  x: number,
  label: string,
  color: string,
  key: string,
  isTurn: boolean,
  best: number,
  align: 'left' | 'right',
) {
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.globalAlpha = isTurn ? 1 : 0.5
  ctx.fillStyle = color
  ctx.font = `bold 14px ${FONT}`
  ctx.fillText(label, x, 12)
  ctx.fillStyle = '#e8ecf4'
  ctx.font = `bold 12px ${FONT}`
  ctx.fillText(`최고 ${best}목`, x, 32)
  ctx.fillStyle = isTurn ? '#7dff8e' : '#565e73'
  ctx.font = `bold 11px ${FONT}`
  ctx.fillText(isTurn ? `▶ ${key} 지금 두기` : `${key} 대기`, x, 50)
  ctx.globalAlpha = 1
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  rim: string,
  justPlaced: boolean,
) {
  ctx.fillStyle = color
  dot(ctx, cx, cy, R)
  ctx.strokeStyle = rim
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()
  if (justPlaced) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, R + 3, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function dot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, rad)
  ctx.fill()
}
