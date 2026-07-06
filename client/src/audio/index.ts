/**
 * 오디오 공개 API — 게임/화면은 `import { sfx } from '@/audio'` 로 SFX만 쓰면 된다.
 * 이 모듈을 import 하는 순간 전역 컨트롤러가 1회 초기화된다(문서 위임 + 스토어 구독 + BGM).
 * 담당: audio 에이전트. 외부 오디오 파일/네트워크 없이 브라우저에서 실시간 합성.
 */
import { initAudio } from './controller';

export {
  sfx,
  playBgm,
  stopBgm,
  setMuted,
  isMuted,
  toggleMuted,
  setVolume,
  getVolume,
  unlockAudio,
} from './engine';
export type { SfxId, BgmKey } from './registry';

initAudio();
