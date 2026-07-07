/**
 * Public audio API — games/screens only need SFX via `import { sfx } from '@/audio'`.
 * The moment you import this module, the global controller initializes once (document delegation + store subscriptions + BGM).
 * Owner: audio agent. SFX are synthesized in the browser in real time; BGM streams from mp3 files
 * (lobby / in-game zones with crossfade + focus volume).
 */
import { initAudio } from './controller';

export {
  sfx,
  stopBgm,
  setMuted,
  isMuted,
  toggleMuted,
  setVolume,
  getVolume,
  unlockAudio,
} from './engine';
export type { SfxId } from './registry';

initAudio();
