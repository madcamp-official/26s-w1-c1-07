import { G1 } from '@madpump/shared'
import type { Game1State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'

export function renderGame1(
  ctx: CanvasRenderingContext2D,
  s: Game1State,
  w: number,
  h: number,
) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 타겟
  ctx.fillStyle = '#8f98ab'
  ctx.font = `bold 18px ${FONT}`
  ctx.fillText('TARGET', w / 2, h * 0.24)
  ctx.fillStyle = '#ffd23f'
  ctx.font = `900 96px ${FONT}`
  ctx.fillText(String(s.target), w / 2, h * 0.46)

  ctx.font = `12px ${FONT}`
  ctx.fillStyle = '#565e73'
  ctx.fillText('연타로 게이지를 100%까지 쌓을수록 빠르다 · 멈추면 서서히 사그라듦', w / 2, h * 0.86)
  ctx.fillText('타겟에 맞춰 손 떼고 1초 정지하면 승리', w / 2, h * 0.92)

  drawPlayer(ctx, w * 0.17, h, 'PLAYER 1', s.p1, s.target, s.p1Gauge, s.p1Hold, '#4da3ff')
  drawPlayer(ctx, w * 0.83, h, 'PLAYER 2', s.p2, s.target, s.p2Gauge, s.p2Hold, '#ff5d5d')
  ctx.restore()
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  h: number,
  name: string,
  value: number,
  target: number,
  gauge: number,
  hold: number,
  color: string,
) {
  const shown = Math.round(value)
  const onTarget = shown === target

  ctx.fillStyle = '#8f98ab'
  ctx.font = `bold 16px ${FONT}`
  ctx.fillText(name, x, h * 0.32)

  ctx.fillStyle = onTarget ? '#7dff8e' : color
  ctx.font = `900 64px ${FONT}`
  ctx.fillText(String(shown), x, h * 0.48)

  // ── 속도 게이지 바 (넘버 아래) ──
  const barW = 150
  const barX = x - barW / 2
  const gaugeY = h * 0.62
  const frac = Math.min(1, gauge / G1.GAUGE_MAX)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#8f98ab'
  ctx.font = `bold 11px ${FONT}`
  ctx.fillText('속도 게이지', x, gaugeY - 12)

  // 트랙
  ctx.fillStyle = '#232838'
  ctx.beginPath()
  ctx.roundRect(barX, gaugeY, barW, 12, 6)
  ctx.fill()
  // 채워진 정도 — 게이지가 높을수록 뜨겁게(파랑→노랑→빨강)
  if (frac > 0) {
    ctx.fillStyle = gaugeColor(frac)
    ctx.beginPath()
    ctx.roundRect(barX, gaugeY, barW * frac, 12, 6)
    ctx.fill()
  }
  // 기준선(GAUGE_REF = 기존 홀드 속도) 표식
  const refFrac = G1.GAUGE_REF / G1.GAUGE_MAX
  const refX = barX + barW * refFrac
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(refX, gaugeY - 3)
  ctx.lineTo(refX, gaugeY + 15)
  ctx.stroke()
  ctx.fillStyle = '#565e73'
  ctx.font = `10px ${FONT}`
  ctx.fillText(`${G1.GAUGE_REF}%`, refX, gaugeY + 26)
  ctx.textAlign = 'right'
  ctx.fillStyle = color
  ctx.font = `bold 12px ${FONT}`
  ctx.fillText(`${Math.round(gauge)}%`, barX + barW, gaugeY + 27)
  ctx.textAlign = 'center'

  // ── 정지-유지 게이지 (1초 채우면 승리) ──
  const holdY = h * 0.74
  const p = Math.min(1, hold / G1.HOLD_TO_WIN)
  ctx.fillStyle = '#232838'
  ctx.beginPath()
  ctx.roundRect(barX, holdY, barW, 8, 4)
  ctx.fill()
  if (p > 0) {
    ctx.fillStyle = '#7dff8e'
    ctx.beginPath()
    ctx.roundRect(barX, holdY, barW * p, 8, 4)
    ctx.fill()
  }
  ctx.fillStyle = onTarget ? '#7dff8e' : '#565e73'
  ctx.font = `bold 11px ${FONT}`
  ctx.fillText(onTarget ? `HOLD ${hold.toFixed(1)}s` : '조준 중…', x, holdY + 22)
}

/** 게이지 채움 비율(0~1)에 따른 색 — 낮으면 파랑, 높으면 붉게 */
function gaugeColor(frac: number): string {
  if (frac < 0.4) return '#4da3ff'
  if (frac < 0.75) return '#ffd23f'
  return '#ff5d5d'
}
