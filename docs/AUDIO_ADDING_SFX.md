# 새 게임에 효과음(SFX) 추가하기 — 플레이북

MADPUMP 오디오는 **외부 파일/네트워크 없이** 브라우저 Web Audio로 실시간 합성한다(sfxr식 SFX + 칩튠 루프 BGM).
코드 정본은 `client/src/audio/` (개요는 [`client/src/audio/README.md`](../client/src/audio/README.md)). 이 문서는 **게임을 새로 추가할 때 소리를 어떻게 붙이는지**만 다룬다.

---

## TL;DR

1. **전역 SFX는 공짜다** — 버튼/모달/라운드 시작·승패/코인/매칭/BGM은 새 게임도 코드 0으로 자동으로 난다(아래 §1). flow/online store 계약(`reportRoundEnd` 등)만 지키면 된다.
2. **게임 고유 액션음만** `GameN.tsx`에서 `sfx('gN-...')` 로 직접 넣는다(§3).
3. 철칙: **이벤트당 1회 가드 · 연속 루프음 생략 · 라운드 승리 팡파레 중복 금지(패자 임팩트음만)**.

---

## 1) 전역 레이어가 자동으로 내주는 소리 (게임 코드 불필요)

`client/src/audio/controller.ts`가 **문서 이벤트 위임 + 스토어 구독**으로 처리한다. 잠긴 파일(App/Button/Modal/flow…)을 건드리지 않는다.

| 소리 | 언제 (자동 트리거) |
|---|---|
| 버튼 hover / click / 확정 / 취소·뒤로 / 무효클릭 에러 | 모든 `<Button>`·`<CoinButton>` — 문서 click/hover 위임 |
| 모달 열림 / 닫힘 | `flowStore.modal` 변화 |
| 라운드·매치 시작 | flow가 `playing`으로 전이 / online `countdown` |
| GO! | online `countdown → playing` |
| 승리 / 패배 / 무승부 스팅어 | flow `round-result`·`match-result` / online `round-result`·`match-end` (온라인은 내 역할·슬롯 기준 승패) |
| 코인 획득(+)/손실(−) / 베팅 확정 | online `match-end`의 `coinDelta` / `queue` 진입 |
| 매칭 성사 / 상대 접속·이탈 | online `opponent`·`room.members` 변화 |
| 로그인 성공 | `sessionStore.loggedIn` false→true |
| 로비 ↔ 배틀 **BGM** 자동 전환 | flow/online phase 기반 |

> 즉, 새 게임이 기존 게임처럼 `reportRoundEnd(result)`를 호출하고 `<ResultOverlay/>`를 넣으면 **시작·승패·코인·BGM은 저절로 붙는다.** 손볼 건 게임 고유 액션음뿐.

---

## 2) 큐(id) 네이밍 규칙

`g<번호>-<액션>` (kebab-case). 예: `g11-dash`, `g11-charge`, `g11-hit`.
전역/공용 큐는 접두사로 구분: `ui-*`, `mm-*`(매치메이킹), `room-*`, `coin-*`, `flow-*`.

---

## 3) 새 게임 `GameN` 액션음 넣기 — 단계

### Step 1. 큐를 `registry.ts`에 등록

`client/src/audio/registry.ts`의 `SPEC`에 id를 추가한다. **기존 프리셋 재사용이 1순위**(톤 일관성).

```ts
export const SPEC: Record<string, SfxSpec> = {
  // ...
  'g11-dash':   { preset: 'whoosh' },   // 기존 프리셋 재사용
  'g11-charge': { preset: 'toneUp'  },
  'g11-hit':    { preset: 'hit'     },
  'g11-clear':  { seq: 'win'        },  // 멀티노트 징글이 필요하면 seq
};
```

새 음색이 정말 필요하면 `PRESETS`에 프리셋 함수를 추가한다(§4 파라미터 참고):

```ts
export const PRESETS: Record<string, PresetFn> = {
  // ...
  g11zap: (r) => ({ wave: 'square', freq: 900 + r() * 200, slide: -3, sustain: 0.03, decay: 0.1, punch: 0.2, gain: 0.2 }),
};
// → SPEC: 'g11-zap': { preset: 'g11zap' }
```

> `r`은 시드된 난수. 같은 id는 항상 같은 소리(캐시됨). id가 SPEC에 없으면 `blip`으로 폴백 + dev 경고.

### Step 2. `GameN.tsx`에서 이벤트에 `sfx()` 호출

```ts
import { sfx } from '@/audio';
```

**(A) 입력 액션음** — 키 입력 핸들러(`push`)의 `e.type === 'down'` 순간, 액션 키에 매핑.
오프라인은 P1=Q/W·P2=U/I, 온라인은 U/I만 들어온다. 온라인에서 역할에 따라 의미가 다르면(예: 주자 vs 스포너) `myRoleRef` 패턴을 쓴다(**Game6 참고**).

```ts
// 기존 램프 점등 옆에 한 줄
if (e.type === 'down') {
  flashQ();
  sfx('g11-dash');   // ← 액션음
}
```

**(B) 상태 전이음**(피격·격추·점수 등) — rAF step에서 **이전값 대비 "이번에 처음 바뀐 순간"에만**. 코어는 state를 in-place mutate하므로 스칼라 스냅샷 ref로 가드한다. 온라인은 rAF가 정지하므로 **서버 스냅샷 구독에서도 같은 판정**을 넣는다(**Game2/Game4/Game7 참고**).

```ts
const prevHp = cur.hp;                 // step 전에 캡처
const next = gameN.step(cur, events, dt);
if (next.hp < prevHp && next.hp > 0) sfx('g11-hit');   // 피격(생존) 1회
```

**(C) 사망·충돌 임팩트** — `result` 확정 전이에서 **딱 1회**(`resultAtRef.current === 0` 가드). **패자 사인만** 울린다. 승리음은 넣지 마라(전역이 담당).

```ts
if (next.result !== null && reportedRef.current === false) {
  // (기존 report 로직 옆) 패자 죽는 소리만 — 승리 팡파레는 전역
  if (next.result === 'P2') sfx('g11-crash');
}
```

### Step 3. 들어보기

```bash
npm run dev -w @madpump/client   # localhost:5173
```
브라우저 자동재생 정책상 **첫 클릭/키 입력 후** 소리가 난다. 프리셋 음색을 미리 고르고 싶으면 사운드랩 플레이어(`feature/audio` 브랜치의 `docs/sound-lab.html`)에서 오디션.

---

## 4) 프리셋 카탈로그 (재사용 우선)

| preset | 성격 · 쓰임 |
|---|---|
| `blip` | 짧고 탄력있는 틱 — 연타·범용 UI |
| `click` / `confirm` / `back` | 클릭 / 확정(상승) / 취소(하강) |
| `coin` | 2톤 상승 — 획득·성사·긍정 |
| `powerup` / `toneUp` / `toneDown` | 파워업 상승 / 상승 톤 / 하강 톤 |
| `laser` / `shoot` | 레이저 / 발사 |
| `boom` / `explosion` | 저역 폭발 / 넓은 폭발(죽음·격추) |
| `hit` / `buzz` | 피격(노이즈) / 에러·부저 |
| `whoosh` | 이동·회피·넉백 |
| `jump` / `duck` / `flap` | 점프 / 숙이기 / 플래피 점프 |
| `tick` / `place` / `pull` / `turn` | 카운트/커서 틱 / 착수·배치 / 당김 / 회전 |
| `SEQS`: `win` `lose` `draw` `go` | 멀티노트 징글(승/패/무/시작) |

## 프리셋 파라미터 (새 음색을 만들 때)

`SfxParams` (전부 선택). 대략:

| 필드 | 뜻 |
|---|---|
| `wave` | `square`/`saw`/`triangle`/`sine`/`noise` |
| `freq` | 시작 주파수(Hz) |
| `slide` | 주파수 슬라이드(옥타브/초, ±) |
| `arpTime`,`arpMul` | 이 시각(초)에 freq를 ×arpMul (2톤 아르페지오) |
| `attack`,`sustain`,`decay` | 엔벌로프(초) |
| `punch` | 어택 직후 볼륨 부스트(0~1) |
| `duty`,`dutySweep` | 스퀘어 듀티/스윕 |
| `vibDepth`,`vibSpeed` | 비브라토 |
| `lpf`(<1),`hpf` | 로우패스/하이패스 |
| `gain` | 최종 볼륨(대개 0.15~0.3) |

---

## 5) 철칙 (하지 말 것)

- ❌ **매 프레임 `sfx()`** — 반드시 이전값/전이 가드로 이벤트당 1회.
- ❌ **연속 루프음**(게이지 상승 지속·궤적 주행·커서 자동스캔·밧줄 텐션·무적 지속) — 스팸이라 생략.
- ❌ **라운드 승리 징글 중복** — 전역이 이미 울린다. 게임에선 **패자 임팩트음만**.
- ❌ **봇/상대 입력에 입력음** — 로컬 키 핸들러(`push`)에서만(내 조작 피드백).
- ❌ **잠긴 파일 수정**(App/Button/Modal/main/flow/store/theme…) — 오디오는 전부 위임/구독으로 붙는다.
- ✅ 커밋 전 `npm --prefix client run typecheck` + `npm --prefix client run build` 통과 확인.

---

## 6) 뮤트/볼륨 (설정 연결)

```ts
import { setMuted, toggleMuted, isMuted, setVolume, getVolume } from '@/audio';
```
localStorage `madpump:audio`에 저장. 편집 가능한 `modals/Settings.tsx`에 토글로 붙일 수 있다.
