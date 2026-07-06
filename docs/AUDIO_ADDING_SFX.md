# Adding SFX to a new game — Playbook

MADPUMP audio is synthesized in real time with browser Web Audio, **without external files/network** (sfxr-style SFX + chiptune-loop BGM).
The code source of truth is `client/src/audio/` (overview in [`client/src/audio/README.md`](../client/src/audio/README.md)). This document covers only **how to wire up sound when you add a new game**.

---

## TL;DR

1. **Global SFX are free** — buttons/modals/round start·win-loss/coins/matchmaking/BGM fire automatically for a new game with zero code (see §1). You only need to honor the flow/online store contract (`reportRoundEnd`, etc.).
2. **Only game-specific action sounds** are added directly with `sfx('gN-...')` in `GameN.tsx` (§3).
3. Iron rule: **one guard per event · skip continuous loop sounds · no duplicate round-win fanfare (loser impact sound only)**.

---

## 1) Sounds the global layer emits automatically (no game code needed)

`client/src/audio/controller.ts` handles this via **document event delegation + store subscription**. It does not touch locked files (App/Button/Modal/flow…).

| Sound | When (auto trigger) |
|---|---|
| Button hover / click / confirm / cancel·back / invalid-click error | Every `<Button>`·`<CoinButton>` — document click/hover delegation |
| Modal open / close | `flowStore.modal` change |
| Round·match start | flow transitions to `playing` / online `countdown` |
| GO! | online `countdown → playing` |
| Win / loss / draw stinger | flow `round-result`·`match-result` / online `round-result`·`match-end` (online uses win-loss by my role·slot) |
| Coin gain(+)/loss(−) / bet confirm | online `match-end` `coinDelta` / entering `queue` |
| Matchmaking success / opponent connect·leave | online `opponent`·`room.members` change |
| Login success | `sessionStore.loggedIn` false→true |
| Lobby ↔ battle **BGM** auto switch | based on flow/online phase |

> In short, if a new game calls `reportRoundEnd(result)` like the existing games and adds `<ResultOverlay/>`, then **start·win-loss·coins·BGM attach on their own.** All you touch is the game-specific action sounds.

---

## 2) Queue (id) naming rule

`g<number>-<action>` (kebab-case). E.g. `g11-dash`, `g11-charge`, `g11-hit`.
Global/shared queues are distinguished by prefix: `ui-*`, `mm-*` (matchmaking), `room-*`, `coin-*`, `flow-*`.

---

## 3) Adding `GameN` action sounds — steps

### Step 1. Register the queue in `registry.ts`

Add the id to `SPEC` in `client/src/audio/registry.ts`. **Reusing an existing preset comes first** (tone consistency).

```ts
export const SPEC: Record<string, SfxSpec> = {
  // ...
  'g11-dash':   { preset: 'whoosh' },   // reuse an existing preset
  'g11-charge': { preset: 'toneUp'  },
  'g11-hit':    { preset: 'hit'     },
  'g11-clear':  { seq: 'win'        },  // use seq if you need a multi-note jingle
};
```

If you truly need a new timbre, add a preset function to `PRESETS` (see §4 for parameters):

```ts
export const PRESETS: Record<string, PresetFn> = {
  // ...
  g11zap: (r) => ({ wave: 'square', freq: 900 + r() * 200, slide: -3, sustain: 0.03, decay: 0.1, punch: 0.2, gain: 0.2 }),
};
// → SPEC: 'g11-zap': { preset: 'g11zap' }
```

> `r` is a seeded random. The same id always produces the same sound (cached). If an id is not in SPEC it falls back to `blip` + a dev warning.

### Step 2. Call `sfx()` on events in `GameN.tsx`

```ts
import { sfx } from '@/audio';
```

**(A) Input action sound** — in the key-input handler (`push`), at the `e.type === 'down'` moment, mapped to action keys.
Offline uses P1=Q/W·P2=U/I, online receives only U/I. If the meaning differs by role online (e.g. runner vs spawner), use the `myRoleRef` pattern (**see Game6**).

```ts
// one line next to the existing lamp lighting
if (e.type === 'down') {
  flashQ();
  sfx('g11-dash');   // ← action sound
}
```

**(B) State-transition sounds** (hit·kill·score, etc.) — in the rAF step, **only at the "first moment it changed this time" versus the previous value**. The core mutates state in place, so guard with a scalar snapshot ref. Since rAF stops online, put **the same check in the server snapshot subscription too** (**see Game2/Game4/Game7**).

```ts
const prevHp = cur.hp;                 // capture before step
const next = gameN.step(cur, events, dt);
if (next.hp < prevHp && next.hp > 0) sfx('g11-hit');   // hit (survived), once
```

**(C) Death·collision impact** — **exactly once** at the `result` confirmation transition (guarded by `resultAtRef.current === 0`). Play **only the loser's cue**. Do not add a win sound (the global layer handles it).

```ts
if (next.result !== null && reportedRef.current === false) {
  // (next to existing report logic) only the loser's death sound — win fanfare is global
  if (next.result === 'P2') sfx('g11-crash');
}
```

### Step 3. Give it a listen

```bash
npm run dev -w @madpump/client   # localhost:5173
```
Due to the browser autoplay policy, sound fires **after the first click/key input**. If you want to pick a preset timbre in advance, audition it in the sound-lab player (`docs/sound-lab.html` on the `feature/audio` branch).

---

## 4) Preset catalog (reuse first)

| preset | Character · use |
|---|---|
| `blip` | Short, snappy tick — repeated taps·general UI |
| `click` / `confirm` / `back` | Click / confirm (rising) / cancel (falling) |
| `coin` | 2-tone rise — gain·success·positive |
| `powerup` / `toneUp` / `toneDown` | Power-up rise / rising tone / falling tone |
| `laser` / `shoot` | Laser / fire |
| `boom` / `explosion` | Low-end blast / wide explosion (death·kill) |
| `hit` / `buzz` | Hit (noise) / error·buzzer |
| `whoosh` | Move·dodge·knockback |
| `jump` / `duck` / `flap` | Jump / duck / flappy jump |
| `tick` / `place` / `pull` / `turn` | Count/cursor tick / place·position / pull / turn |
| `SEQS`: `win` `lose` `draw` `go` | Multi-note jingle (win/loss/draw/start) |

## Preset parameters (when making a new timbre)

`SfxParams` (all optional). Roughly:

| Field | Meaning |
|---|---|
| `wave` | `square`/`saw`/`triangle`/`sine`/`noise` |
| `freq` | Start frequency (Hz) |
| `slide` | Frequency slide (octaves/sec, ±) |
| `arpTime`,`arpMul` | At this time (sec), multiply freq by arpMul (2-tone arpeggio) |
| `attack`,`sustain`,`decay` | Envelope (sec) |
| `punch` | Volume boost right after attack (0~1) |
| `duty`,`dutySweep` | Square duty/sweep |
| `vibDepth`,`vibSpeed` | Vibrato |
| `lpf`(<1),`hpf` | Low-pass/high-pass |
| `gain` | Final volume (usually 0.15~0.3) |

---

## 5) Iron rules (do not)

- ❌ **`sfx()` every frame** — always one per event via a previous-value/transition guard.
- ❌ **Continuous loop sounds** (sustained gauge rise·trajectory travel·cursor auto-scan·rope tension·invincibility sustain) — skip, they are spam.
- ❌ **Duplicate round-win jingle** — the global layer already plays it. In the game, **only the loser impact sound**.
- ❌ **Input sound on bot/opponent input** — only in the local key handler (`push`) (feedback for my own action).
- ❌ **Editing locked files** (App/Button/Modal/main/flow/store/theme…) — audio attaches entirely via delegation/subscription.
- ✅ Before committing, confirm `npm --prefix client run typecheck` + `npm --prefix client run build` pass.

---

## 6) Mute/volume (Settings integration)

```ts
import { setMuted, toggleMuted, isMuted, setVolume, getVolume } from '@/audio';
```
Stored in localStorage `madpump:audio`. Can be wired as a toggle in the editable `modals/Settings.tsx`.
