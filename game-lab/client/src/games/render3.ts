import { G3 } from '@madpump/shared'
import type {
  Game3Config,
  Game3State,
  FencerState,
  DodgeStyle,
} from '@madpump/shared'
import { FENCER, dodgePose, type DodgePose } from './fencerPose'

const FONT = 'system-ui, sans-serif'
const SCALE = 0.36

/**
 * 게임3 파생 버전 공용 렌더.
 * config 하나로 여러 버전을 렌더하며, 회피 모션 3종(상반신 젖히기 / 허리 꺾기 / 다리찢기)을
 * 이번 회피에 배정된 style에 따라 분기해 그린다.
 * 캐릭터 치수·회피 복귀 곡선은 fencerPose(FENCER, dodgePose)에서 공용으로 가져온다.
 */
export function makeRenderGame3(cfg: Game3Config) {
  return function renderGame3(
    ctx: CanvasRenderingContext2D,
    s: Game3State,
    w: number,
    h: number,
  ) {
    const X = (v: number) => w / 2 + v * w * SCALE
    const platTop = h * 0.66
    ctx.save()

    // 바다
    const sea = ctx.createLinearGradient(0, platTop, 0, h)
    sea.addColorStop(0, '#12304a')
    sea.addColorStop(1, '#0a1220')
    ctx.fillStyle = sea
    ctx.fillRect(0, platTop + 14, w, h - platTop - 14)

    // 땅
    ctx.fillStyle = '#3a4152'
    ctx.fillRect(X(-1), platTop, X(1) - X(-1), 14)
    ctx.fillStyle = '#565e73'
    ctx.fillRect(X(-1), platTop, X(1) - X(-1), 4)

    // 중앙 표식
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(X(0), platTop - 6)
    ctx.lineTo(X(0), platTop + 14)
    ctx.stroke()

    // 밀물 — 시간이 지날수록 양쪽 바닷물이 발판을 잠식하고 낙사선(effEdge)이 안쪽으로 당겨진다.
    // waterLevel(=flood)이 0이면 아무것도 그리지 않아 기존 렌더와 동일.
    const flood = s.waterLevel ?? 0
    if (flood > 0) {
      const effEdge = Math.max(cfg.EDGE - flood, cfg.HALF_GAP + 0.02)
      // 차오른 바닷물 패널(발판을 좌우에서 잠식)
      ctx.fillStyle = 'rgba(38,120,180,0.55)'
      ctx.fillRect(X(-1), platTop - 4, X(-effEdge) - X(-1), h - platTop + 4)
      ctx.fillRect(X(effEdge), platTop - 4, X(1) - X(effEdge), h - platTop + 4)
      // 수면 하이라이트
      ctx.fillStyle = 'rgba(150,210,255,0.85)'
      ctx.fillRect(X(-1), platTop - 4, X(-effEdge) - X(-1), 3)
      ctx.fillRect(X(effEdge), platTop - 4, X(1) - X(effEdge), 3)
      // 치명 판정선(현재 낙사선) — 깜빡이는 세로 경고선.
      // 서지: 후반으로 갈수록(=flood↑, 서지 강도의 프록시) 파랑→주황으로 달아오르며
      // "막판 넉백 폭발"을 예고한다. 서지 미사용 시엔 surgeVis=0이라 그대로 파랑.
      const surgeVis = cfg.KB_SURGE_MAX
        ? Math.min(1, flood / ((cfg.EDGE - cfg.HALF_GAP) * 0.5))
        : 0
      const pulse = 0.5 + 0.5 * Math.sin(s.elapsed * (8 + 6 * surgeVis))
      const lr = Math.round(120 + 135 * surgeVis)
      const lg = Math.round(200 - 60 * surgeVis)
      const lb = Math.round(255 - 195 * surgeVis)
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${0.5 + 0.45 * pulse})`
      ctx.lineWidth = 2 + 2 * surgeVis
      ctx.beginPath()
      ctx.moveTo(X(-effEdge), platTop - 10)
      ctx.lineTo(X(-effEdge), platTop + 14)
      ctx.moveTo(X(effEdge), platTop - 10)
      ctx.lineTo(X(effEdge), platTop + 14)
      ctx.stroke()
    }

    drawFencer(ctx, s, s.p1, X(s.c - cfg.HALF_GAP), platTop, 1, '#4da3ff')
    drawFencer(ctx, s, s.p2, X(s.c + cfg.HALF_GAP), platTop, -1, '#ff5d5d')

    // 리포스트창 텔레그래프 — "지금 즉발 반격 가능" 순간을 발밑 금색 펄스 링 + 콤보 점으로
    drawRiposteCue(ctx, s.p1, s.elapsed, X(s.c - cfg.HALF_GAP), platTop)
    drawRiposteCue(ctx, s.p2, s.elapsed, X(s.c + cfg.HALF_GAP), platTop)

    // 판정 피드 — 리포스트/카운터히트는 배율(mult)만큼 크게·주황색으로 강조
    ctx.textAlign = 'center'
    for (const f of s.feed) {
      const age = s.elapsed - f.t
      const x = f.victim === 'P1' ? X(s.c - cfg.HALF_GAP) : X(s.c + cfg.HALF_GAP)
      ctx.globalAlpha = Math.max(0, 1 - age / 1.2)
      const m = f.mult ?? 1
      const big = f.kind === 'hit' && m > 1.01
      ctx.fillStyle = big
        ? '#ff8a3d'
        : f.kind === 'hit'
          ? '#ff5d5d'
          : f.kind === 'parry'
            ? '#ffd23f'
            : '#9aa4b8'
      const fs = Math.round(18 + (big ? Math.min((m - 1) * 16, 24) : 0))
      ctx.font = `900 ${fs}px ${FONT}`
      const label =
        f.kind === 'hit'
          ? big
            ? `HIT ×${m.toFixed(1)}`
            : 'HIT!'
          : f.kind === 'parry'
            ? 'PARRIED!'
            : 'WHIFF!'
      ctx.fillText(label, x, platTop - 150 - age * 26)
    }
    ctx.globalAlpha = 1

    // 부제 — 상단 중앙
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = `bold 11px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('서지-넉백 · 밀물+가속+역전+막판폭발', w / 2, 18)

    // 현재 회피 스타일(누를 때마다 랜덤) 라벨 — 하단 좌/우 코너
    labelStyle(ctx, s.p1, s.elapsed, 16, h - 58, 'left', '#4da3ff')
    labelStyle(ctx, s.p2, s.elapsed, w - 16, h - 58, 'right', '#ff5d5d')

    drawCooldownChips(ctx, s.p1, s.elapsed, 16, h - 44, 'Q 공격', 'W 회피', false)
    drawCooldownChips(ctx, s.p2, s.elapsed, w - 16, h - 44, 'U 공격', 'I 회피', true)
    ctx.restore()
  }
}

/** 게임3 렌더러 — 최종 config(G3)에 바인딩 */
export const renderGame3 = makeRenderGame3(G3)

const styleLabel = (st: DodgeStyle) =>
  st === 'lean' ? '상반신 젖히기' : st === 'waist' ? '허리 꺾기 (>)' : '다리찢기 (몸 낮춤)'

/** 역전 — 리포스트창(즉발 반격 가능) + 콤보 단계 시각화 */
function drawRiposteCue(
  ctx: CanvasRenderingContext2D,
  f: FencerState,
  now: number,
  x: number,
  platTop: number,
) {
  // 리포스트창 열림 — 발밑 금색 펄스 링("지금 공격=즉발 반격")
  if (f.riposteUntil > now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 20)
    ctx.save()
    ctx.strokeStyle = `rgba(255,210,63,${0.55 + 0.4 * pulse})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(x, platTop - 2, 20 + 5 * pulse, 7 + 2 * pulse, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  // 콤보 단계 — 머리 위 금색 점(스노우볼 단계 가독화)
  if (f.combo > 0) {
    ctx.save()
    ctx.fillStyle = '#ffd23f'
    const startX = x - (f.combo - 1) * 5
    for (let i = 0; i < f.combo; i++) {
      ctx.beginPath()
      ctx.arc(startX + i * 10, platTop - 124, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

function labelStyle(
  ctx: CanvasRenderingContext2D,
  f: FencerState,
  now: number,
  x: number,
  y: number,
  align: CanvasTextAlign,
  color: string,
) {
  const pose = dodgePose<DodgeStyle>(f.dodges, now)
  ctx.font = `bold 11px ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  if (pose && pose.active) {
    ctx.fillStyle = color
    ctx.fillText(styleLabel(pose.style), x, y)
  } else {
    ctx.fillStyle = '#565e73'
    ctx.fillText('회피 = 매번 랜덤(3종)', x, y)
  }
}

function activeAttack(list: { start: number; end: number }[], t: number) {
  for (const a of list) {
    if (a.start <= t && t < a.end) return { p: (t - a.start) / (a.end - a.start) }
  }
  return null
}

function windupProgress(attacks: { press: number; start: number }[], t: number) {
  for (const a of attacks) {
    if (a.press <= t && t < a.start) return (t - a.press) / Math.max(1e-6, a.start - a.press)
  }
  return null
}

function drawFencer(
  ctx: CanvasRenderingContext2D,
  s: Game3State,
  f: FencerState,
  x: number,
  platTop: number,
  facing: 1 | -1,
  color: string,
) {
  const now = s.elapsed
  const strike = activeAttack(f.attacks, now)
  const windup = windupProgress(f.attacks, now)
  const pose = dodgePose<DodgeStyle>(f.dodges, now)

  const { legH, torsoH, torsoW, headR } = FENCER
  const hipX = x
  const hipY = platTop - legH

  const bend = pose ? pose.amp : 0

  // 이번 회피의 스타일(누를 때마다 랜덤)에 따라 모션 분기
  if (pose?.style === 'split') {
    // 다리찢기 — 다리를 좌우로 쫙 벌리며 골반을 낮춰 상체 전체를 아래로 통과시킨다
    drawSplit(ctx, hipX, hipY, platTop, torsoH, torsoW, headR, facing, color, bend, windup, strike)
  } else {
    // 고정 다리
    ctx.strokeStyle = color
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(hipX, hipY)
    ctx.lineTo(hipX - FENCER.legSpread, platTop)
    ctx.moveTo(hipX, hipY)
    ctx.lineTo(hipX + FENCER.legSpread, platTop)
    ctx.stroke()

    if (pose?.style === 'waist') {
      drawWaistBend(ctx, hipX, hipY, torsoH, torsoW, headR, facing, color, bend, strike, windup)
    } else {
      drawLean(ctx, hipX, hipY, torsoH, torsoW, headR, facing, color, bend, windup, strike)
    }
  }

  // 회피 정점 부근 스피드 라인 (무적창 안에서, 자세가 충분히 접혔을 때)
  if (pose && pose.active && pose.amp > 0.55) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    if (pose.style === 'split') {
      ctx.moveTo(hipX - 30, hipY - torsoH - 2)
      ctx.lineTo(hipX + 30, hipY - torsoH - 2)
    } else {
      ctx.moveTo(hipX - facing * 18, hipY - torsoH - 6)
      ctx.lineTo(hipX - facing * 36, hipY - torsoH - 6)
    }
    ctx.stroke()
  }
}

/** 상반신 젖히기 — 허리를 축으로 상체 전체가 뒤로 접힘(강체 회전) */
function drawLean(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  torsoH: number,
  torsoW: number,
  headR: number,
  facing: 1 | -1,
  color: string,
  bend: number,
  windup: number | null,
  strike: { p: number } | null,
) {
  const maxLean = 1.5
  const windupLean = windup !== null ? 0.35 * Math.sin(windup * Math.PI) : 0
  const rot = -facing * (maxLean * bend + windupLean)

  ctx.save()
  ctx.translate(hipX, hipY)
  ctx.rotate(rot)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-torsoW / 2, -torsoH, torsoW, torsoH, 6)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, -torsoH - headR + 1, headR, 0, Math.PI * 2)
  ctx.fill()
  drawSword(ctx, torsoH, torsoW, facing, windup, strike)
  ctx.restore()
}

/** 허리 꺾기 — 머리·하반신은 제자리, 허리만 뒤로 꺾여 ">" 모양 */
function drawWaistBend(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  torsoH: number,
  torsoW: number,
  headR: number,
  facing: 1 | -1,
  color: string,
  bend: number,
  strike: { p: number } | null,
  windup: number | null,
) {
  const backDir = -facing
  const maxBack = 34
  const waistX = hipX + backDir * maxBack * bend
  const waistY = hipY - torsoH * 0.5
  const shoulderX = hipX + backDir * 4 * bend
  const shoulderY = hipY - torsoH
  const headX = hipX
  const headY = shoulderY - headR + 1

  ctx.strokeStyle = color
  ctx.lineWidth = torsoW
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(hipX, hipY)
  ctx.lineTo(waistX, waistY)
  ctx.lineTo(shoulderX, shoulderY)
  ctx.stroke()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(headX, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(shoulderX, shoulderY + 9)
  drawSword(ctx, 0, torsoW, facing, windup, strike)
  ctx.restore()
}

/**
 * 다리찢기로 몸 낮춰 피하기 — 골반이 아래로 내려가며 두 다리가 좌우로 쫙 벌어진다.
 * 상체는 세운 채 통째로 낮아져(머리 높이가 검 궤도 아래로) 공격을 흘려보낸다.
 */
function drawSplit(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  platTop: number,
  torsoH: number,
  torsoW: number,
  headR: number,
  facing: 1 | -1,
  color: string,
  bend: number,
  windup: number | null,
  strike: { p: number } | null,
) {
  const drop = bend * (platTop - hipY - 3)
  const loweredHipY = hipY + drop
  const spread = FENCER.legSpread + bend * 32

  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(hipX, loweredHipY)
  ctx.lineTo(hipX - spread, platTop)
  ctx.moveTo(hipX, loweredHipY)
  ctx.lineTo(hipX + spread, platTop)
  ctx.stroke()

  const shoulderY = loweredHipY - torsoH
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(hipX - torsoW / 2, shoulderY, torsoW, torsoH, 6)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(hipX, shoulderY - headR + 1, headR, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(hipX, shoulderY)
  drawSword(ctx, torsoH, torsoW, facing, windup, strike)
  ctx.restore()
}

/** 로컬 원점=어깨 기준으로 검을 그림 */
function drawSword(
  ctx: CanvasRenderingContext2D,
  torsoH: number,
  torsoW: number,
  facing: 1 | -1,
  windup: number | null,
  strike: { p: number } | null,
) {
  const shoulderY = torsoH === 0 ? 0 : -torsoH + 12
  let len = FENCER.swordRest
  let swordColor = '#c8d0e0'
  let lift = FENCER.swordLiftRest
  let baseX = facing * (torsoW / 2)
  if (strike) {
    len = FENCER.swordStrike
    swordColor = '#ffd23f'
    lift = 0
  } else if (windup !== null) {
    len = FENCER.swordWindup
    swordColor = '#ffe08a'
    lift = FENCER.swordLiftWindup
    baseX = facing * (torsoW / 2) - facing * 7
  }
  ctx.strokeStyle = swordColor
  ctx.lineWidth = strike ? 5 : 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(baseX, shoulderY)
  ctx.lineTo(baseX + facing * len, shoulderY - lift)
  ctx.stroke()
}

function drawCooldownChips(
  ctx: CanvasRenderingContext2D,
  f: FencerState,
  now: number,
  x: number,
  y: number,
  attackLabel: string,
  dodgeLabel: string,
  rightAlign: boolean,
) {
  const chipW = 64
  const gap = 6
  const x0 = rightAlign ? x - chipW * 2 - gap : x
  drawChip(ctx, x0, y, chipW, attackLabel, now >= f.attackCdUntil)
  drawChip(ctx, x0 + chipW + gap, y, chipW, dodgeLabel, now >= f.dodgeCdUntil)
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  label: string,
  ready: boolean,
) {
  ctx.fillStyle = '#1c2130'
  ctx.beginPath()
  ctx.roundRect(x, y, w, 26, 6)
  ctx.fill()
  ctx.fillStyle = ready ? '#e8ecf4' : '#565e73'
  ctx.font = `bold 12px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + w / 2, y + 13)
}

export type { DodgePose }
