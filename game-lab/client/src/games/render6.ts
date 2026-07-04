import { G6, SEQ_LEN } from '@madpump/shared'
import type { Game6State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'

// 키 값(0/1) → 표시 기호. 0(Q·U)=왼쪽 화살표, 1(W·I)=오른쪽 화살표
const ARROWS = ['←', '→']
// 플레이어별 키 색 [키0, 키1]
const P1_COLORS = ['#4da8ff', '#1c4f8a'] // 밝은 파랑 / 어두운 파랑
const P2_COLORS = ['#ff7eb6', '#c01d3c'] // 핑크 / 진홍

const TILE = 46
const GAP = 52
const JUDGE_Y = 372
const AHEAD = 6 // 위로 미리 보여줄 다음 키 개수

export function renderGame6(
  ctx: CanvasRenderingContext2D,
  s: Game6State,
  w: number,
  h: number,
) {
  const half = w / 2

  drawLane(ctx, 0, half, h, 'PLAYER 1', '#4da8ff', ARROWS, P1_COLORS, s.p1Seq, s.p1Idx, s.p1Score, s.p1Flash, s.p1Wrong)
  drawLane(ctx, half, half, h, 'PLAYER 2', '#ff7eb6', ARROWS, P2_COLORS, s.p2Seq, s.p2Idx, s.p2Score, s.p2Flash, s.p2Wrong)

  // 중앙 분할선
  ctx.strokeStyle = '#2a3040'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(half, 0)
  ctx.lineTo(half, h)
  ctx.stroke()

  // 스코어 대비(가운데 상단)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#565e73'
  ctx.font = `bold 14px ${FONT}`
  ctx.fillText('VS', half, 30)
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  x0: number,
  laneW: number,
  h: number,
  label: string,
  theme: string,
  letters: string[],
  colors: string[],
  seq: number[],
  idx: number,
  score: number,
  flash: number,
  wrong: number,
) {
  const cx = x0 + laneW / 2

  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, 0, laneW, h)
  ctx.clip()

  // 미스 시 붉은 배경 플래시
  if (wrong > 0) {
    ctx.fillStyle = `rgba(255, 70, 70, ${0.22 * (wrong / G6.FLASH)})`
    ctx.fillRect(x0, 0, laneW, h)
  }

  // 헤더 + 점수
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = theme
  ctx.font = `bold 15px ${FONT}`
  ctx.fillText(label, cx, 22)
  ctx.fillStyle = '#e8ecf4'
  ctx.font = `900 44px ${FONT}`
  ctx.fillText(String(score), cx, 58)
  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText(`${Math.min(idx, SEQ_LEN)} / ${SEQ_LEN}`, cx, 84)

  // 판정선 (현재 눌러야 할 키가 놓이는 자리)
  const flashOn = flash > 0
  ctx.strokeStyle = flashOn ? '#7dff8e' : theme
  ctx.globalAlpha = flashOn ? 1 : 0.5
  ctx.lineWidth = flashOn ? 4 : 2
  ctx.beginPath()
  ctx.moveTo(cx - TILE, JUDGE_Y + TILE / 2 + 8)
  ctx.lineTo(cx + TILE, JUDGE_Y + TILE / 2 + 8)
  ctx.stroke()
  ctx.globalAlpha = 1

  // 트랙 타일: 현재(idx)를 판정선에, 다음 키들은 위로 쌓아 올린다
  for (let k = AHEAD; k >= 0; k--) {
    const i = idx + k
    if (i >= SEQ_LEN) continue
    const y = JUDGE_Y - k * GAP
    // 멀수록 흐리게 페이드아웃
    const alpha = k === 0 ? 1 : Math.max(0.18, 0.7 - k * 0.09)
    drawTile(ctx, cx, y, seq[i], letters, colors, k === 0, flashOn, alpha)
  }

  if (idx >= SEQ_LEN) {
    ctx.fillStyle = '#7dff8e'
    ctx.font = `bold 18px ${FONT}`
    ctx.fillText('CLEAR!', cx, JUDGE_Y)
  }

  ctx.restore()
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  key: number,
  letters: string[],
  colors: string[],
  isCurrent: boolean,
  flashOn: boolean,
  alpha: number,
) {
  const size = isCurrent ? TILE * 1.18 : TILE
  const sx = cx - size / 2
  const sy = cy - size / 2

  ctx.globalAlpha = alpha
  ctx.fillStyle = colors[key]
  roundRect(ctx, sx, sy, size, size, 10)

  if (isCurrent) {
    ctx.lineWidth = flashOn ? 4 : 3
    ctx.strokeStyle = flashOn ? '#7dff8e' : '#ffffff'
    ctx.beginPath()
    ctx.roundRect(sx, sy, size, size, 10)
    ctx.stroke()
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${isCurrent ? 30 : 22}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(letters[key], cx, cy + 1)
  ctx.globalAlpha = 1
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
