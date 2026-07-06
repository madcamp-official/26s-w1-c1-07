/**
 * Public audio API — games/screens only need SFX via `import { sfx } from '@/audio'`.
 * The moment you import this module, the global controller initializes once (document delegation + store subscriptions + BGM).
 * Owner: audio agent. Real-time synthesis in the browser without any external audio files/network.
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
