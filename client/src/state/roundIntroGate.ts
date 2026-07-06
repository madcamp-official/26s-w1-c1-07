/**
 * 라운드 인트로 프리즈 게이트 — 순수 모듈 싱글톤(React 아님).
 *
 * 왜 필요한가:
 *   오프라인 매치는 카운트다운 단계가 없어 flow.phase가 'playing'으로 바뀌는 즉시
 *   게임 rAF 루프가 코어 step()을 돌린다. 그러면 마그마(중력)·타이머·투사체가 곧바로
 *   진행돼, "플레이 방법" 인트로를 읽기도 전에 플레이어가 죽을 수 있다.
 *   → 인트로가 떠 있는 동안 게임 시뮬레이션을 잠시 정지시킨다(+ 초기 JIT 예열 시간도 번다).
 *
 * 왜 store가 아니라 모듈 변수인가:
 *   게임 루프(rAF)와 QA 워치독(setInterval)은 React 밖에서 매 프레임 동기적으로 읽어야 한다.
 *   flow.ts / App.tsx 는 아키텍트 소유(수정 금지)라 여기에 상태를 두지 않고 별도 모듈로 관리.
 *   (online.ts의 socket/startRequestedForRoom 모듈 변수와 같은 스타일)
 *
 * 온라인은 이 게이트를 쓰지 않는다: 서버 카운트다운 동안 serverState=null이라 이미 자연히 정지.
 */
let activeUntil = 0;

/** 인트로 시작 시 호출 — 지금부터 ms 동안 프리즈 활성 */
export function openGate(ms: number): void {
  activeUntil = performance.now() + ms;
}

/** 인트로 종료(또는 언마운트) 시 호출 — 즉시 해제 */
export function closeGate(): void {
  activeUntil = 0;
}

/** 게임 루프가 매 프레임 확인 — true면 이번 프레임 step()을 건너뛴다 */
export function isRoundIntroActive(): boolean {
  return performance.now() < activeUntil;
}

/** 남은 프리즈 시간(ms) — 필요 시 진행바 등에 사용 */
export function roundIntroRemainingMs(): number {
  return Math.max(0, activeUntil - performance.now());
}
