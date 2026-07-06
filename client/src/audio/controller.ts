/**
 * 전역 오디오 컨트롤러 — 잠긴 파일(App/Button/Modal/flow…)을 건드리지 않고
 * "문서 이벤트 위임 + 스토어 구독"으로 UI/플로우/코인/매치메이킹 SFX + BGM을 구동한다.
 * 모듈 로드 시 1회 자기초기화(import '@/audio' 만으로 전 세션 작동).
 * 담당: audio 에이전트.
 */
import {
  sfx,
  playBgm,
  stopBgm,
  unlockAudio,
  setMuted,
  isMuted,
} from './engine';
import { flowStore, type FlowState } from '../state/flow';
import { onlineStore, type OnlineState, type OnlinePhase } from '../net/online';
import { sessionStore } from '../state/session';

let inited = false;
let lastHover = 0;

const BATTLE_ONLINE: ReadonlySet<OnlinePhase> = new Set<OnlinePhase>(['countdown', 'playing', 'round-result']);

function computeBgm(f: FlowState, o: OnlineState): 'battle' | 'lobby' {
  const onlineActive = o.gameId != null && BATTLE_ONLINE.has(o.phase);
  if (onlineActive) return 'battle';
  const offlineBattle =
    f.mode === 'offline' && f.gameId != null && (f.phase === 'playing' || f.phase === 'round-result');
  return offlineBattle ? 'battle' : 'lobby';
}

/** 오프라인 flow 전이 → 모달/플로우/결과 SFX */
function onFlow(prev: FlowState, cur: FlowState, online: OnlineState): void {
  // 모달 열림/닫힘
  if (prev.modal !== cur.modal) {
    if (cur.modal != null) sfx('ui-modal-open');
    else if (prev.modal != null) sfx('ui-modal-close');
  }

  // 온라인 매치가 활성이면 결과/시작 스팅어는 online 쪽에서 처리(중복 방지)
  const onlineActive = online.gameId != null && (BATTLE_ONLINE.has(online.phase) || online.phase === 'match-end');
  if (!onlineActive) {
    // 라운드/매치 시작
    if (cur.phase === 'playing' && (prev.phase !== 'playing' || cur.currentRound !== prev.currentRound)) {
      sfx('flow-match-start');
    }
    // 라운드 종료 스팅어
    if (prev.phase === 'playing' && cur.phase === 'round-result') {
      const last = cur.roundResults[cur.roundResults.length - 1];
      sfx(last?.winner ? 'flow-win-stinger' : 'flow-draw-stinger');
    }
    // 매치 종료 스팅어
    if (prev.phase !== 'match-result' && cur.phase === 'match-result') {
      sfx(cur.matchResult === 'DRAW' ? 'flow-draw-stinger' : 'flow-win-stinger');
    }
  }

  applyBgm(cur, online);
}

/** 온라인 store 전이 → 매치메이킹/카운트다운/결과/코인 SFX */
function onOnline(prev: OnlineState, cur: OnlineState): void {
  // 베팅 확정(빠른시작 큐 진입)
  if (prev.phase !== 'queue' && cur.phase === 'queue') sfx('coin-bet-confirm');
  // 매칭 성사(상대 배정)
  if (prev.opponent == null && cur.opponent != null) sfx('mm-match-found');
  // 코드방 인원 증감
  const pn = prev.room?.members.length ?? 0;
  const cn = cur.room?.members.length ?? 0;
  if (pn < 2 && cn >= 2) sfx('room-opponent-join');
  else if (pn >= 2 && cn < 2 && cur.phase !== 'match-end') sfx('room-opponent-leave');

  // 라운드 시작(카운트다운) / GO
  if (prev.phase !== 'countdown' && cur.phase === 'countdown') sfx('flow-match-start');
  if (prev.phase === 'countdown' && cur.phase === 'playing') sfx('flow-go');

  // 라운드 결과 스팅어(내 역할 기준 승/패)
  if (prev.phase !== 'round-result' && cur.phase === 'round-result') {
    const res = cur.lastRoundResult;
    if (res === 'DRAW' || res == null) sfx('flow-draw-stinger');
    else sfx(res === cur.role ? 'flow-win-stinger' : 'flow-lose-stinger');
  }

  // 매치 종료 스팅어 + 코인 정산 (SlotResult = 'A_WIN'|'B_WIN'|'DRAW' → 내 슬롯 기준 승패)
  if (prev.phase !== 'match-end' && cur.phase === 'match-end') {
    const mr = cur.matchResult;
    const won = mr != null && mr === `${cur.mySlot}_WIN`;
    sfx(mr === 'DRAW' ? 'flow-draw-stinger' : won ? 'flow-win-stinger' : 'flow-lose-stinger');
    const delta = cur.coinDelta ?? 0;
    if (delta !== 0) {
      // 스팅어 뒤에 코인 소리(겹침 방지)
      window.setTimeout(() => sfx(delta > 0 ? 'coin-gain' : 'coin-loss'), 720);
    }
  }
  // 상대 이탈/중단
  if (prev.phase !== 'aborted' && cur.phase === 'aborted') sfx('ui-error-beep');

  applyBgm(flowStore.get(), cur);
}

function applyBgm(f: FlowState, o: OnlineState): void {
  playBgm(computeBgm(f, o));
}

// ── 문서 이벤트 위임(잠긴 Button/Modal 미수정) ──
function classify(el: Element): string {
  const disabled =
    (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
  if (disabled) return 'ui-error-beep';
  const tid = el.getAttribute('data-testid') ?? '';
  const cl = el.classList;
  if (cl.contains('nc-btn--danger') || cl.contains('nc-btn--tertiary') || /cancel|back|exit|leave|logout|나가기|메인/.test(tid)) {
    return 'ui-cancel-back';
  }
  if (cl.contains('nc-btn--primary') || /confirm|online|next|start|quick|create|join|ok|play|select|game-card/.test(tid)) {
    return 'ui-confirm';
  }
  return 'ui-click';
}

function onClickCapture(e: Event): void {
  const t = e.target as Element | null;
  if (!t || typeof t.closest !== 'function') return;
  const el = t.closest('button, a[href], [role="button"], .nc-btn, .nc-coinbtn');
  if (!el) return;
  sfx(classify(el));
}

function onOverCapture(e: Event): void {
  const t = e.target as Element | null;
  if (!t || typeof t.closest !== 'function') return;
  const el = t.closest('.nc-btn, .nc-coinbtn, button, [role="button"]');
  if (!el) return;
  const now = Date.now();
  if (now - lastHover < 55) return;
  lastHover = now;
  sfx('ui-hover');
}

function onGesture(): void {
  unlockAudio();
}

export function initAudio(): void {
  if (inited || typeof window === 'undefined' || typeof document === 'undefined') return;
  inited = true;

  // 제스처에서 오디오 해제(브라우저 자동재생 정책)
  window.addEventListener('pointerdown', onGesture, { capture: true });
  window.addEventListener('keydown', onGesture, { capture: true });
  // UI SFX 위임
  document.addEventListener('click', onClickCapture, { capture: true });
  document.addEventListener('pointerover', onOverCapture, { capture: true });

  // 스토어 구독(비-React)
  let prevFlow = flowStore.get();
  flowStore.subscribe(() => {
    const cur = flowStore.get();
    const p = prevFlow;
    prevFlow = cur;
    onFlow(p, cur, onlineStore.get());
  });

  let prevOnline = onlineStore.get();
  onlineStore.subscribe(() => {
    const cur = onlineStore.get();
    const p = prevOnline;
    prevOnline = cur;
    onOnline(p, cur);
  });

  let prevSession = sessionStore.get();
  sessionStore.subscribe(() => {
    const cur = sessionStore.get();
    const p = prevSession;
    prevSession = cur;
    if (!p.loggedIn && cur.loggedIn) sfx('ui-login-success');
  });

  // 초기 BGM(로비) 예약 — 첫 제스처에서 시작
  applyBgm(flowStore.get(), onlineStore.get());
}

// 뮤트 토글 재노출(설정 연결용)
export { setMuted, isMuted, stopBgm };
