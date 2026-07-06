/**
 * RoundIntro — the "how to play" intro shown right before each round starts (shared across all games S9~S12).
 * Same contract as ResultOverlay: no props, reads only the flow/online store and opens/closes itself.
 * Each game screen only needs to drop a single <RoundIntro /> next to <ResultOverlay />.
 *
 * Behavior:
 *  · Offline (local 2-player): shown for INTRO_MS when a round starts (flow.currentRound change).
 *    During this time roundIntroGate pauses the game sim (the game loop checks the gate).
 *    → shows both roles (P1 Q/W · P2 U/I).
 *  · Online: shown during the server countdown (online.phase==='countdown').
 *    Here serverState=null, so the game is already naturally paused → no gate needed.
 *    → shows only the one role I was assigned, in my player color (myColor).
 *  · Only asymmetric games (rocket=4 / dino=6) split the guidance by role. The rest is shared.
 *  · Copy is in English. Color follows the 'player color', not the role (color ≠ role, matching the render model).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { KeyCap } from '../../components';
import { useFlow } from '../../state/flow';
import { useOnline } from '../../net/online';
import { closeGate, openGate } from '../../state/roundIntroGate';
import './roundintro.css';

/** Duration of the offline intro (=game paused). 1~2 animation loops + JIT warm-up window. */
const INTRO_MS = 2200;
/** Fade-out length when disappearing */
const OUT_MS = 300;

type Cap = { icon: string; label: string };
type RoleCopy = { tag: string; line: string; k1: Cap; k2: Cap };
type SymCopy = { name: string; asym: false; line: string; k1: Cap; k2: Cap };
type AsymCopy = { name: string; asym: true; P1: RoleCopy; P2: RoleCopy };

/** New gameId mapping reference (1 Number · 2 Fencing · 3 Pump · 4 Rocket · 5 Light Cycle · 6 Dino · 7 Magma · 8 Bombard · 9 Gomoku · 10 Tug of War) */
const COPY: Record<number, SymCopy | AsymCopy> = {
  1: { name: 'Number Guess', asym: false, line: 'Raise the gauge to line your number up with the <em>target</em> — then stop and hold!', k1: { icon: '▼', label: 'Lower' }, k2: { icon: '▲', label: 'Raise' } },
  2: { name: 'Tide Fencing', asym: false, line: 'Thrust and parry to push your opponent <em>out of the ring</em>!', k1: { icon: '⚔', label: 'Attack' }, k2: { icon: '⛨', label: 'Dodge' } },
  3: { name: 'Pump', asym: false, line: 'Press the key matching the rising <em>arrow</em> exactly to rack up points!', k1: { icon: '◀', label: 'Left' }, k2: { icon: '▶', label: 'Right' } },
  4: {
    name: 'Missile Match', asym: true,
    P1: { tag: 'Attacker', line: 'Fire rockets and hit your opponent 3 times!', k1: { icon: '⇋', label: 'Turn' }, k2: { icon: '✦', label: 'Fire' } },
    P2: { tag: 'Runner', line: 'Dodge left and right and survive 10 seconds!', k1: { icon: '◀', label: 'Left' }, k2: { icon: '▶', label: 'Right' } },
  },
  5: { name: 'Light Cycle', asym: false, line: 'Turn left and right only to dodge walls and trails and <em>survive as long as you can</em>!', k1: { icon: '↺', label: 'Turn left' }, k2: { icon: '↻', label: 'Turn right' } },
  6: {
    name: 'Dino Run', asym: true,
    P1: { tag: 'Dino', line: 'Jump and duck to dodge and survive 10 seconds!', k1: { icon: '▲', label: 'Jump' }, k2: { icon: '▼', label: 'Duck' } },
    P2: { tag: 'Spawner', line: 'Throw cactuses and birds to crash into the dino!', k1: { icon: '※', label: 'Cactus' }, k2: { icon: '^', label: 'Bird' } },
  },
  7: { name: 'Icarus Match', asym: false, line: 'Jump to stay airborne, dodge spikes and magma, and <em>shoot first</em>!', k1: { icon: '▲', label: 'Jump' }, k2: { icon: '✦', label: 'Fire' } },
  8: { name: 'Pew Pew', asym: false, line: 'Turn your cannon to shoot down monsters — <em>protect</em> your cannon!', k1: { icon: '⟳', label: 'Turn' }, k2: { icon: '✦', label: 'Fire' } },
  9: { name: 'Speed Gomoku', asym: false, line: 'Drop when the cursor reaches the cell you want and be the first to <em>make 3-in-a-row</em>!', k1: { icon: '●', label: 'Place' }, k2: { icon: '✳', label: 'Block' } },
  10: { name: 'Tug of War', asym: false, line: '<em>Alternate</em>-mash the two keys to pull the rope!', k1: { icon: '⇄', label: 'Swap ①' }, k2: { icon: '⇄', label: 'Swap ②' } },
};

/** Turn <em>…</em> markup into nodes (avoids dangerouslySetInnerHTML) */
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

  // Online takes priority (following the getPlayerDisplays precedent). Real-server online doesn't touch flow.mode, so check the store directly.
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

  // Offline: detect round key change → open gate + in→out→unmount timers
  const [offPhase, setOffPhase] = useState<'in' | 'out' | null>(null);
  const keyRef = useRef('');
  useEffect(() => {
    if (!offlineActive) return;
    const key = `off:${flow.gameId}:${flow.currentRound}`;
    if (key === keyRef.current) return;
    keyRef.current = key;
    openGate(INTRO_MS);
    setOffPhase('in');
    const tOut = setTimeout(() => setOffPhase('out'), Math.max(0, INTRO_MS - OUT_MS));
    const tEnd = setTimeout(() => {
      setOffPhase(null);
      closeGate();
    }, INTRO_MS);
    return () => {
      clearTimeout(tOut);
      clearTimeout(tEnd);
    };
  }, [offlineActive, flow.gameId, flow.currentRound]);

  // Make sure the gate is released on unmount (in case of leaving mid-intro)
  useEffect(() => () => closeGate(), []);

  // ── determine payload (online takes priority) ──
  let gameId: number | null = null;
  let showOffline = false;
  let leaving = false;
  let onlineRole: 'P1' | 'P2' = 'P1';
  let colorRole: 'P1' | 'P2' = 'P1'; // myColor(blue→P1 cyan / red→P2 pink) → KeyCap color + panel color
  if (onlineIntro && o.gameId != null && o.role != null) {
    gameId = o.gameId;
    onlineRole = o.role;
    colorRole = (o.myColor ?? 'blue') === 'blue' ? 'P1' : 'P2';
  } else if (offPhase && offlineActive && flow.gameId != null) {
    gameId = flow.gameId;
    showOffline = true;
    leaving = offPhase === 'out';
  }
  if (gameId == null) return null;
  const c = COPY[gameId];
  if (!c) return null;

  const roundKey = showOffline
    ? `off:${gameId}:${flow.currentRound}`
    : `on:${gameId}:${o.round}:${onlineRole}`;
  // Offline (both shown)=neutral yellow, online=my player color
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
    <div className={`ri${leaving ? ' ri--out' : ''}`} data-testid="round-intro" aria-hidden>
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
        <span className="ri__ready c-accent anim-blink">▶ Starting soon</span>
      </div>
    </div>
  );
}
