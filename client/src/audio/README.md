# client/src/audio — 8-bit 오디오 (SFX + BGM)

외부 오디오 파일/네트워크 **없이** 브라우저 Web Audio로 실시간 합성한다(sfxr식 SFX + 칩튠 루프 BGM).
아키텍트 소유 파일(App/Button/Modal/main/flow/store)은 **한 줄도 수정하지 않는다** — 전역 이벤트 위임 + 스토어 구독으로 붙는다.

## 구성
- `synth.ts` — 순수 합성 코어(renderSFX/renderSeq/renderVamp). AudioContext/DOM 의존 없음.
- `registry.ts` — 큐 `id → 프리셋/징글` 매핑(70큐, docs/AUDIO_PLAN.md 대응) + BGM 트랙.
- `engine.ts` — AudioContext 수명·재생·뮤트/볼륨(localStorage)·제스처 unlock·버퍼 캐시.
- `controller.ts` — 전역 레이어: 문서 click/hover 위임(버튼/모달 SFX) + `flowStore`/`onlineStore`/`sessionStore` 구독(플로우·코인·매치메이킹 SFX + 로비/배틀 BGM).
- `index.ts` — 공개 API. **import 하는 순간 컨트롤러가 1회 자기초기화**된다.

## 초기화
루트 화면(`MainLoggedIn`/`MainLoggedOut`)이 `import '@/audio'`로 로드 → 전 세션 작동.
게임 컴포넌트는 `import { sfx } from '@/audio'`만 해도 같은 초기화가 걸린다(직접 URL 진입 대비).
브라우저 자동재생 정책상 **첫 사용자 제스처**(클릭/키) 전에는 소리가 나지 않는다(엔진이 unlock 처리).

## 게임에서 SFX 울리기
```ts
import { sfx } from '@/audio';
sfx('g6-jump'); // 부작용, 예외 안 던짐. 동일 id 15ms 중복은 엔진이 억제.
```
규칙: **각 이벤트 1회만**(rAF에서 이전값 대비 전이 순간에만), 연속/루프 큐는 생략, 라운드 승리 팡파레는 전역이 담당하므로 게임별 중복 금지(패자 임팩트음은 허용).

## 전역이 자동으로 처리하는 것 (게임 코드 불필요)
- 버튼 hover/click, 확정/취소, 모달 열고닫기, 무효클릭 에러 — 문서 위임
- 라운드/매치 시작·종료 스팅어(승/패/무), 카운트다운·GO — flow/online 구독
- 코인 정산(+/−)·베팅 확정, 매칭 성사·상대 접속/이탈 — online 구독
- 로그인 성공 — session 구독
- 로비 ↔ 배틀 BGM 자동 전환

## 뮤트/볼륨
`setMuted(bool)` / `toggleMuted()` / `isMuted()` / `setVolume(0..1)` / `getVolume()` (localStorage `madpump:audio`에 저장). 설정 모달에 연결 가능.
