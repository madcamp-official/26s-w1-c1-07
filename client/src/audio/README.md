# client/src/audio — 8-bit audio (SFX + BGM)

Real-time synthesis via the browser's Web Audio **without** any external audio files/network (sfxr-style SFX + chiptune loop BGM).
Architect-owned files (App/Button/Modal/main/flow/store) are **not modified by a single line** — they attach via global event delegation + store subscriptions.

## Structure
- `synth.ts` — pure synthesis core (renderSFX/renderSeq/renderVamp). No AudioContext/DOM dependency.
- `registry.ts` — cue `id → preset/jingle` mapping (70 cues, matching docs/AUDIO_PLAN.md) + BGM tracks.
- `engine.ts` — AudioContext lifecycle / playback / mute / volume (localStorage) / gesture unlock / buffer cache.
- `controller.ts` — global layer: document click/hover delegation (button/modal SFX) + `flowStore`/`onlineStore`/`sessionStore` subscriptions (flow / coin / matchmaking SFX + lobby/battle BGM).
- `index.ts` — public API. **The controller self-initializes once the moment you import it.**

## Initialization
The root screen (`MainLoggedIn`/`MainLoggedOut`) loads it via `import '@/audio'` → works for the whole session.
Game components trigger the same initialization just by doing `import { sfx } from '@/audio'` (in case of direct URL entry).
Per the browser autoplay policy, no sound plays before the **first user gesture** (click/key) (the engine handles unlock).

## Playing SFX from a game
```ts
import { sfx } from '@/audio';
sfx('g6-jump'); // side effect, never throws. The engine suppresses duplicate same-id calls within 15ms.
```
Rules: **once per event only** (only at the transition moment vs the previous value in rAF), skip continuous/loop cues, and since the global layer handles the round-win fanfare, do not duplicate it per game (loser impact sounds are allowed).

## What the global layer handles automatically (no game code needed)
- Button hover/click, confirm/cancel, modal open/close, invalid-click error — document delegation
- Round/match start & end stingers (win/loss/draw), countdown & GO — flow/online subscriptions
- Coin settlement (+/−) & bet confirm, matchmaking success & opponent join/leave — online subscription
- Login success — session subscription
- Automatic lobby ↔ battle BGM switching

## Mute/Volume
`setMuted(bool)` / `toggleMuted()` / `isMuted()` / `setVolume(0..1)` / `getVolume()` (stored in localStorage `madpump:audio`). Can be wired to the Settings modal.
