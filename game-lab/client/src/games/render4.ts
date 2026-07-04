import { G4 } from '@madpump/shared'
import type { Game4State, Obstacle } from '@madpump/shared'

const FONT = 'system-ui, sans-serif'

export function renderGame4(
  ctx: CanvasRenderingContext2D,
  s: Game4State,
  w: number,
  h: number,
) {
  ctx.save()

  // ── 지면 ──
  ctx.strokeStyle = '#3a4356'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, G4.GROUND_Y)
  ctx.lineTo(w, G4.GROUND_Y)
  ctx.stroke()

  // 흐르는 지면 자갈(속도감)
  ctx.fillStyle = '#232a38'
  const scroll = (s.elapsed * G4.OBST_SPEED) % 40
  for (let x = -scroll; x < w; x += 40) {
    ctx.fillRect(x, G4.GROUND_Y + 8, 14, 3)
    ctx.fillRect(x + 22, G4.GROUND_Y + 16, 8, 3)
  }
  ctx.fillStyle = '#141922'
  ctx.fillRect(0, G4.GROUND_Y + 24, w, h - G4.GROUND_Y - 24)

  // ── 장애물 ──
  for (const o of s.obstacles) {
    if (o.type === 'jump') drawCactus(ctx, o)
    else drawBird(ctx, o)
  }

  // ── P2 투척수(오른쪽 끝) ──
  drawThrower(ctx, s)

  // ── 공룡 ──
  drawDino(ctx, s)

  // ── P2 쿨타임 / 안내 ──
  const denom = s.cooldownMax || G4.SPAWN_COOLDOWN
  ctx.fillStyle = '#232838'
  ctx.fillRect(w - 200, 14, 184, 8)
  const ready = s.cooldown === 0
  ctx.fillStyle = ready ? '#ff8a5c' : '#565e73'
  ctx.fillRect(w - 200, 14, 184 * (1 - s.cooldown / denom), 8)
  ctx.textAlign = 'right'
  ctx.fillStyle = ready ? '#ffb08a' : '#8f98ab'
  ctx.font = `bold 12px ${FONT}`
  ctx.fillText(ready ? 'P2 장애물 생성 가능' : `P2 쿨 ${denom.toFixed(2)}s`, w - 16, 38)

  // ── P1 상태 배지 ──
  ctx.textAlign = 'left'
  ctx.font = `bold 12px ${FONT}`
  const st = !s.grounded ? ['JUMP', '#7dc4ff'] : s.ducking ? ['DUCK', '#ffd23f'] : ['RUN', '#7dff8e']
  ctx.fillStyle = st[1] as string
  ctx.fillText(`P1 · ${st[0]}`, 16, 22)

  ctx.fillStyle = '#565e73'
  ctx.font = `11px ${FONT}`
  ctx.fillText('선인장=점프  /  새=숙이기', 16, G4.H - 12)

  ctx.restore()
}

function drawDino(ctx: CanvasRenderingContext2D, s: Game4State) {
  const ducking = s.ducking && s.grounded
  const height = ducking ? G4.DINO_DUCK_H : G4.DINO_H
  const bottom = G4.GROUND_Y - s.y
  const top = bottom - height
  const x = G4.DINO_X
  const bodyW = ducking ? G4.DINO_W + 8 : G4.DINO_W

  ctx.fillStyle = '#7dff8e'
  roundRect(ctx, x, top, bodyW, height, 6)

  // 눈
  ctx.fillStyle = '#10131a'
  const eyeX = x + bodyW - 12
  ctx.fillRect(eyeX, top + 8, 5, 5)

  // 다리(달릴 때만 애니메이션)
  ctx.fillStyle = '#5fd873'
  if (s.grounded) {
    const swing = Math.floor(s.runPhase * 12) % 2 === 0
    ctx.fillRect(x + 8, bottom, 8, swing ? 8 : 3)
    ctx.fillRect(x + bodyW - 18, bottom, 8, swing ? 3 : 8)
  }
}

function drawThrower(ctx: CanvasRenderingContext2D, s: Game4State) {
  const groundY = G4.GROUND_Y
  const sx = G4.W - 30 // 어깨 x
  const hipY = groundY - 34
  const shoulderY = groundY - 58
  const p = s.spawnAnim / G4.SPAWN_ANIM // 1=막 던진 순간 → 0
  const ease = 1 - (1 - p) * (1 - p) // easeOut

  const RED = '#ff5d5d'
  const DARK = '#c94b4b'

  // 다리
  ctx.strokeStyle = DARK
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(sx, hipY)
  ctx.lineTo(sx - 6, groundY)
  ctx.moveTo(sx, hipY)
  ctx.lineTo(sx + 7, groundY)
  ctx.stroke()

  // 몸통
  ctx.strokeStyle = RED
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(sx, hipY)
  ctx.lineTo(sx, shoulderY)
  ctx.stroke()

  // 머리
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(sx, shoulderY - 10, 9, 0, Math.PI * 2)
  ctx.fill()

  // 던지는 팔 — 쉴 때는 아래, 던질 때 왼쪽(필드 방향)으로 뻗음
  const restX = sx - 4
  const restY = shoulderY + 18
  const throwX = sx - 30
  const throwY = shoulderY - 4
  const hx = restX + (throwX - restX) * ease
  const hy = restY + (throwY - restY) * ease
  ctx.strokeStyle = RED
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(sx, shoulderY + 2)
  ctx.lineTo(hx, hy)
  ctx.stroke()

  // 던지는 순간 손끝에 장애물 잔상
  if (p > 0.35) {
    ctx.globalAlpha = (p - 0.35) / 0.65
    ctx.fillStyle = '#ffb08a'
    roundRect(ctx, hx - 6, hy - 6, 12, 12, 3)
    ctx.globalAlpha = 1
  }

  // 라벨
  ctx.fillStyle = '#8f98ab'
  ctx.textAlign = 'center'
  ctx.font = `bold 11px ${FONT}`
  ctx.fillText('P2', sx, groundY + 16)
}

function drawCactus(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const x = o.x
  const top = G4.GROUND_Y - G4.CACTUS_H
  ctx.fillStyle = '#4fbf6a'
  roundRect(ctx, x + 8, top, 10, G4.CACTUS_H, 4)
  // 팔
  roundRect(ctx, x, top + 12, 8, 6, 3)
  roundRect(ctx, x, top + 6, 6, 16, 3)
  roundRect(ctx, x + 18, top + 18, 8, 6, 3)
  roundRect(ctx, x + 20, top + 12, 6, 16, 3)
}

function drawBird(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const x = o.x
  const top = G4.BIRD_TOP
  const cy = top + G4.BIRD_H / 2
  ctx.fillStyle = '#ff6b8a'
  roundRect(ctx, x, top + 4, G4.BIRD_W, G4.BIRD_H - 8, 6)
  // 부리
  ctx.beginPath()
  ctx.moveTo(x, cy - 4)
  ctx.lineTo(x - 8, cy)
  ctx.lineTo(x, cy + 4)
  ctx.closePath()
  ctx.fill()
  // 날개 퍼덕임
  const up = Math.floor(o.phase * 10) % 2 === 0
  ctx.fillStyle = '#ff9bb0'
  const wingY = up ? top - 6 : top + G4.BIRD_H - 2
  roundRect(ctx, x + 10, wingY, 22, 8, 4)
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
