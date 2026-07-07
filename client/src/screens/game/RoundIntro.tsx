/**
 * RoundIntro — the "how to play" intro shown right before each round starts (shared across all games S9~S12).
 * Same contract as ResultOverlay: takes no props, reads only the flow/online store to open/close itself.
 * Each game screen just drops one <RoundIntro /> next to <ResultOverlay />.
 *
 * Behavior:
 *  · Offline (local 2-player): plays a ready sequence when a round starts (flow.currentRound changes) —
 *    Round 1: guide (GUIDE_MS 3s) → "2" → "1" → "START!" → game starts.
 *    From round 2 on: skip the guide, just the "2" → "1" → "START!" countdown.
 *    Throughout this whole span roundIntroGate halts the sim (the game loop checks the gate),
 *    and step() only runs once the countdown ends (after START!). → guaranteed wait, then start, with no overlap.
 *    The guide shows both roles (P1 Q/W · P2 U/I).
 *  · Online: show the guide during the server countdown (online.phase==='countdown', 3s).
 *    Here serverState=null so the game is already naturally halted → no gate needed.
 *    → show only the role I was assigned, in my player color (myColor).
 *  · Only the asymmetric games (rocket=4 / dino=6) split the guide per role. The rest are shared.
 *  · Copy is in English. Color follows the 'player color', not the role (color ≠ role, matching the render model).
 */
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { KeyCap } from '../../components';
import { useFlow } from '../../state/flow';
import { useOnline } from '../../net/online';
import { closeGate, openGate } from '../../state/roundIntroGate';
import './roundintro.css';

/** Offline ready sequence: (round 1 only) show the guide for GUIDE_MS → "2"·"1"·"START!" countdown → game starts.
 *  From round 2 on, skip the guide and just run the countdown. Throughout this whole span roundIntroGate halts the sim. */
const GUIDE_MS = 3000;
/** Duration of each countdown "2"/"1" step (ms) */
const COUNT_STEP_MS = 700;
/** From showing "START!" until the game starts (ms) */
const START_MS = 600;
/** Time for the countdown alone (2 → 1 → START) — gate duration from round 2 on */
const COUNTDOWN_MS = 2 * COUNT_STEP_MS + START_MS;
/** Total round-1 gate duration = guide + countdown */
const ROUND1_TOTAL_MS = GUIDE_MS + COUNTDOWN_MS;

type Cap = { icon: string; label: string };
type RoleCopy = { tag: string; line: string; k1: Cap; k2: Cap };
type SymCopy = { name: string; asym: false; line: string; k1: Cap; k2: Cap };
type AsymCopy = { name: string; asym: true; P1: RoleCopy; P2: RoleCopy };

/** New gameId mapping basis (1 Number · 2 Fencing · 3 Pump · 4 Rocket · 5 Light Cycle · 6 Dino · 7 Magma · 8 Cannon · 9 Gomoku · 10 Tug of War) */
const COPY: Record<number, SymCopy | AsymCopy> = {
  1: { name: 'Number Guess', asym: false, line: 'Raise the gauge to match your number to the <em>target</em> — then stop and hold!', k1: { icon: '▼', label: 'Down' }, k2: { icon: '▲', label: 'Up' } },
  2: { name: 'Tide Fencing', asym: false, line: 'Thrust and block to shove your rival <em>out of the ring</em>!', k1: { icon: '⚔', label: 'Attack' }, k2: { icon: '⛨', label: 'Dodge' } },
  3: { name: 'Pump', asym: false, line: 'Press the key matching the incoming <em>arrow</em> to stack up points!', k1: { icon: '◀', label: 'Left' }, k2: { icon: '▶', label: 'Right' } },
  4: {
    name: 'Missile Match', asym: true,
    P1: { tag: 'Attacker', line: 'Fire missiles to hit your rival 3 times!', k1: { icon: '⇋', label: 'Turn' }, k2: { icon: '✦', label: 'Fire' } },
    P2: { tag: 'Runner', line: 'Dodge left and right and survive 10s!', k1: { icon: '◀', label: 'Left' }, k2: { icon: '▶', label: 'Right' } },
  },
  5: { name: 'Light Cycle', asym: false, line: 'Turn left/right only to dodge walls and trails and <em>survive longer</em>!', k1: { icon: '↺', label: 'Turn left' }, k2: { icon: '↻', label: 'Turn right' } },
  6: {
    name: 'Dino Run', asym: true,
    P1: { tag: 'Dino', line: 'Jump and duck to dodge and survive 10s!', k1: { icon: '▲', label: 'Jump' }, k2: { icon: '▼', label: 'Duck' } },
    P2: { tag: 'Spawner', line: 'Throw cacti and birds to crash the dino!', k1: { icon: '※', label: 'Cactus' }, k2: { icon: '^', label: 'Bird' } },
  },
  7: { name: 'Icarus Match', asym: false, line: 'Jump to hover, dodge the spikes and magma, and <em>shoot first</em>!', k1: { icon: '▲', label: 'Jump' }, k2: { icon: '✦', label: 'Fire' } },
  8: { name: 'Pew Pew', asym: false, line: 'Swivel the cannon to blast the monsters — <em>guard your cannon</em>!', k1: { icon: '⟳', label: 'Turn' }, k2: { icon: '✦', label: 'Fire' } },
  9: { name: 'Speed Gomoku', asym: false, line: 'Drop when the cursor lands on the cell you want and make <em>3-in-a-row</em> first!', k1: { icon: '●', label: 'Drop' }, k2: { icon: '✳', label: 'Block' } },
  10: { name: 'Tug of War', asym: false, line: 'Mash the two keys <em>alternately</em> to pull the rope!', k1: { icon: '⇄', label: 'Alt①' }, k2: { icon: '⇄', label: 'Alt②' } },
  // New games 11~13 — entire UI in English (requirement)
  11: { name: 'HOT POTATO', asym: false, line: 'Pass the bomb — <em>don’t</em> hold it when it blows!', k1: { icon: '⇄', label: 'PASS' }, k2: { icon: '✳', label: 'FAKE' } },
  12: { name: 'RED LIGHT, GREEN LIGHT', asym: false, line: 'Mash to run — <em>freeze</em> on the red light!', k1: { icon: '▶', label: 'RUN' }, k2: { icon: '✖', label: 'STOP' } },
  13: { name: 'POT SHOT', asym: false, line: 'Aim the angle, charge power — <em>hit the pot</em>!', k1: { icon: '∠', label: 'AIM' }, k2: { icon: '✳', label: 'POWER' } },
};

/** Turn <em>…</em> markup into nodes (avoiding dangerouslySetInnerHTML) */
function renderLine(s: string): ReactNode {
  const parts = s.split(/(<em>.*?<\/em>)/g).filter(Boolean);
  return parts.map((p, i) => {
    const m = p.match(/^<em>(.*?)<\/em>$/);
    return m ? <em key={i}>{m[1]}</em> : <span key={i}>{p}</span>;
  });
}

export default function RoundIntro() {
  const flow = useFlow();
  const o = useOnline();

  // Online-first check (following getPlayerDisplays). Real-server online doesn't touch flow.mode, so check the store directly.
  const onlineActive =
    o.gameId != null &&
    o.role != null &&
    (o.phase === 'countdown' || o.phase === 'playing' || o.phase === 'round-result');
  const onlineIntro = onlineActive && o.phase === 'countdown';
  const offlineActive =
    !onlineActive &&
    flow.mode === 'offline' &&
    flow.phase === 'playing' &&
    flow.currentRound > 0 &&
    flow.gameId != null;

  // Offline: detect a round-key change → open the gate + guide→2→1→START→start timers
  //  offStep: 'guide' show guide / 'c2'·'c1' countdown / 'start' START! / null done (game starts)
  const [offStep, setOffStep] = useState<'guide' | 'c2' | 'c1' | 'start' | null>(null);
  // ⚠️ Don't use a keyRef guard: on StrictMode (dev) mount→unmount→mount the
  //   ref persists, so the 2nd mount skips openGate (guard matches) and the gate stays closed — a bug
  //   (the cause of the guide not showing only on the first round while the game overlapped). Instead, in cleanup
  //   close the gate reliably so a re-run (= strict 2nd mount / round change) always reopens it fresh.
  useEffect(() => {
    if (!offlineActive || flow.gameId == null) return;
    // Round 1: guide (GUIDE_MS) then countdown. From round 2 on: skip the guide, countdown only.
    const withGuide = flow.currentRound <= 1;
    const total = withGuide ? ROUND1_TOTAL_MS : COUNTDOWN_MS;
    // Countdown start offset (after GUIDE_MS if there's a guide, else 0)
    const c2At = withGuide ? GUIDE_MS : 0;
    // Halt the game for the whole ready sequence — step() only runs once the countdown ends (after START!).
    openGate(total);
    setOffStep(withGuide ? 'guide' : 'c2');
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (withGuide) timers.push(setTimeout(() => setOffStep('c2'), c2At));
    timers.push(setTimeout(() => setOffStep('c1'), c2At + COUNT_STEP_MS));
    timers.push(setTimeout(() => setOffStep('start'), c2At + 2 * COUNT_STEP_MS));
    timers.push(
      setTimeout(() => {
        setOffStep(null);
        closeGate();
      }, total),
    );
    return () => {
      timers.forEach(clearTimeout);
      setOffStep(null);
      closeGate(); // release the gate on re-run/unmount — the next run (or strict 2nd mount) reopens it
    };
  }, [offlineActive, flow.gameId, flow.currentRound]);

  // ── decide payload (online first) ──
  let gameId: number | null = null;
  let showOffline = false;
  let onlineRole: 'P1' | 'P2' = 'P1';
  let colorRole: 'P1' | 'P2' = 'P1'; // myColor (blue→P1 cyan / red→P2 pink) → KeyCap color + panel color
  if (onlineIntro && o.gameId != null && o.role != null) {
    gameId = o.gameId;
    onlineRole = o.role;
    colorRole = (o.myColor ?? 'blue') === 'blue' ? 'P1' : 'P2';
  } else if (offStep && offlineActive && flow.gameId != null) {
    gameId = flow.gameId;
    showOffline = true;
  }
  if (gameId == null) return null;
  const c = COPY[gameId];
  if (!c) return null;

  // On an offline countdown step, show a big "2/1/START!" overlay instead of the guide.
  const offCountdown =
    showOffline && offStep === 'c2'
      ? '2'
      : showOffline && offStep === 'c1'
        ? '1'
        : showOffline && offStep === 'start'
          ? 'START!'
          : null;
  if (offCountdown) {
    return (
      <div className="ri ri--count" data-testid="round-intro" aria-hidden>
        <span
          key={offCountdown}
          className={`ri-count__num font-arcade glow-text anim-sign-on ${offCountdown === 'START!' ? 'ri-count__go' : ''}`}
        >
          {offCountdown}
        </span>
      </div>
    );
  }

  const roundKey = showOffline
    ? `off:${gameId}:${flow.currentRound}`
    : `on:${gameId}:${o.round}:${onlineRole}`;
  // Offline (both shown) = neutral yellow, online = my player color
  const panelColor = showOffline ? 'var(--accent)' : colorRole === 'P1' ? 'var(--p1)' : 'var(--p2)';

  const caps = (role: 'P1' | 'P2', keys: [string, string], k1: Cap, k2: Cap) => (
    <div className="ri__caps">
      <KeyCap role={role} keyChar={keys[0]} icon={k1.icon} label={k1.label} />
      <KeyCap role={role} keyChar={keys[1]} icon={k2.icon} label={k2.label} />
    </div>
  );

  let tag: string | null = null;
  let line: ReactNode = null;
  let body: ReactNode = null;

  if (c.asym) {
    if (showOffline) {
      line = 'The two roles play differently!';
      body = (
        <div className="ri__keys">
          <div className="ri__side">
            <span className="ri__who is-p1">{c.P1.tag} · P1</span>
            <span className="ri__subline">{c.P1.line}</span>
            {caps('P1', ['Q', 'W'], c.P1.k1, c.P1.k2)}
          </div>
          <span className="ri__vs font-arcade">VS</span>
          <div className="ri__side">
            <span className="ri__who is-p2">{c.P2.tag} · P2</span>
            <span className="ri__subline">{c.P2.line}</span>
            {caps('P2', ['U', 'I'], c.P2.k1, c.P2.k2)}
          </div>
        </div>
      );
    } else {
      const r = c[onlineRole];
      tag = `My role · ${r.tag}`;
      line = r.line;
      body = <div className="ri__keys">{caps(colorRole, ['U', 'I'], r.k1, r.k2)}</div>;
    }
  } else {
    line = renderLine(c.line);
    if (showOffline) {
      body = (
        <div className="ri__keys">
          <div className="ri__side">
            <span className="ri__who is-p1">P1</span>
            {caps('P1', ['Q', 'W'], c.k1, c.k2)}
          </div>
          <span className="ri__vs font-arcade">VS</span>
          <div className="ri__side">
            <span className="ri__who is-p2">P2</span>
            {caps('P2', ['U', 'I'], c.k1, c.k2)}
          </div>
        </div>
      );
    } else {
      body = <div className="ri__keys">{caps(colorRole, ['U', 'I'], c.k1, c.k2)}</div>;
    }
  }

  return (
    <div className="ri" data-testid="round-intro" aria-hidden>
      <div
        key={roundKey}
        className="ri__panel corner-brackets anim-sign-on"
        style={{ '--ri-color': panelColor } as CSSProperties}
      >
        <i className="cb2" />
        {tag && <span className="ri__tag font-display">{tag}</span>}
        <h2 className="ri__name font-display">{c.name}</h2>
        <p className="ri__line">{line}</p>
        {body}
        <span className="ri__ready c-accent anim-blink">
          {showOffline ? 'GET READY…' : '▶ Starting soon'}
        </span>
      </div>
    </div>
  );
}
