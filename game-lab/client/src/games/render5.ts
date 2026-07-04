import { G5 } from '@madpump/shared'
import type { Game5State } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'
const P1_COLOR = '#4da3ff'
const P2_COLOR = '#ff5d5d'

export function renderGame5(
  ctx: CanvasRenderingContext2D,
  s: Game5State,
  w: number,
  h: number,
) {
  ctx.save()

  // 가장자리 프레임(몬스터가 나오는 경계 힌트)
  ctx.strokeStyle = 'rgba(120, 140, 180, 0.16)'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 8])
  ctx.strokeRect(G5.SPAWN_MARGIN, G5.SPAWN_MARGIN, w - G5.SPAWN_MARGIN * 2, h - G5.SPAWN_MARGIN * 2)
  ctx.setLineDash([])
  ctx.lineWidth = 1

  // 총알
  for (const sh of s.shots) {
    const col = sh.owner === 1 ? P1_COLOR : P2_COLOR
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(sh.x, sh.y, G5.BULLET_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.25
    ctx.beginPath()
    ctx.arc(sh.x, sh.y, G5.BULLET_R + 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // 몬스터
  for (const mo of s.monsters) {
    const wob = Math.sin(mo.anim * 9) * 1.5
    const r = G5.MONSTER_R
    const tint = mo.target === 1 ? P1_COLOR : P2_COLOR
    // 몸통
    ctx.fillStyle = '#8e6bd6'
    ctx.beginPath()
    ctx.arc(mo.x, mo.y + wob, r, 0, Math.PI * 2)
    ctx.fill()
    // 목표를 알려주는 얇은 테두리
    ctx.strokeStyle = tint
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.lineWidth = 1
    // 뿔
    ctx.fillStyle = '#6f4fb0'
    triangle(ctx, mo.x - r * 0.5, mo.y - r * 0.7 + wob, 5, 8)
    triangle(ctx, mo.x + r * 0.5, mo.y - r * 0.7 + wob, 5, 8)
    // 눈
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(mo.x - 4, mo.y - 1 + wob, 3, 0, Math.PI * 2)
    ctx.arc(mo.x + 4, mo.y - 1 + wob, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#20122e'
    ctx.beginPath()
    ctx.arc(mo.x - 4, mo.y - 1 + wob, 1.4, 0, Math.PI * 2)
    ctx.arc(mo.x + 4, mo.y - 1 + wob, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // 대포 2문
  drawCannon(ctx, G5.CX - G5.GAP, G5.CY, s.p1Angle, P1_COLOR, 'P1', s.p1Cooldown, s.p1Dir)
  drawCannon(ctx, G5.CX + G5.GAP, G5.CY, s.p2Angle, P2_COLOR, 'P2', s.p2Cooldown, s.p2Dir)

  // 점수 HUD
  ctx.textBaseline = 'alphabetic'
  ctx.font = `bold 18px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillStyle = P1_COLOR
  ctx.fillText(`P1  ${s.p1Score}`, 16, 30)
  ctx.textAlign = 'right'
  ctx.fillStyle = P2_COLOR
  ctx.fillText(`${s.p2Score}  P2`, w - 16, 30)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText('몬스터를 쏴서 점수 · 대포에 닿으면 패배', w / 2, h - 12)

  ctx.restore()
}

function drawCannon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  color: string,
  label: string,
  cooldown: number,
  dir: 1 | -1,
) {
  // 조준선
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.setLineDash([3, 6])
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(angle) * 520, cy + Math.sin(angle) * 520)
  ctx.stroke()
  ctx.setLineDash([])

  // 포신
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(0, -6, G5.BARREL_LEN + 6, 12, 4)
  ctx.fill()
  // 총구
  ctx.fillStyle = cooldown === 0 ? '#ffd23f' : '#5a6172'
  ctx.beginPath()
  ctx.arc(G5.BARREL_LEN + 4, 0, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 포신 밑 받침
  ctx.fillStyle = '#2a3040'
  ctx.beginPath()
  ctx.arc(cx, cy, G5.CANNON_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.lineWidth = 1

  // 회전 방향 표시 — dir=-1 반시계, 1 시계
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 2
  const rr = G5.CANNON_R + 6
  // dir<0(반시계)면 시계 반대로 그린 호. 시작/끝을 dir에 따라 뒤집는다
  ctx.beginPath()
  ctx.arc(cx, cy, rr, -0.4 * Math.PI, 0.55 * Math.PI, dir === -1)
  ctx.stroke()
  // 화살촉
  const tipA = dir === -1 ? -0.4 * Math.PI : 0.55 * Math.PI
  const tx = cx + Math.cos(tipA) * rr
  const ty = cy + Math.sin(tipA) * rr
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(tx, ty, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 1

  ctx.fillStyle = '#e8ecf4'
  ctx.font = `bold 11px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, cy)
}

function triangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfW: number,
  hgt: number,
) {
  ctx.beginPath()
  ctx.moveTo(x - halfW, y)
  ctx.lineTo(x + halfW, y)
  ctx.lineTo(x, y - hgt)
  ctx.closePath()
  ctx.fill()
}
