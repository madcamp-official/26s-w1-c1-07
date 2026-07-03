/**
 * HudFrame — 인게임 공통 HUD 프레임 (PLAN §1.5 / §2 인게임 공통, S9~S12 공유).
 * 격투게임식 대칭 구조: 좌(hud-profile-p1 블루) ↔ 중앙(hud-countdown) ↔ 우(hud-profile-p2 핑크).
 * children이 game-stage(4px 보더 + 10px 섀도) 안에 렌더된다. 좌상단 [나가기](btn-exit) 상시.
 * 하단 키캡 열(P1: Q·W / P2: U·I)은 keyIcons를 주면 렌더된다.
 *
 * 사용법 (게임 에이전트):
 *   const flow = useFlow();
 *   const players = getPlayerDisplays(flow);
 *   const wins = getRoundWins(flow);
 *   <HudFrame
 *     p1={players.P1} p2={players.P2}
 *     timeRemainingMs={state.derived.timeRemainingMs}   // 게임2/3은 view.remainingMs/timeRemainingMs
 *     roundWins={wins} roundCount={flow.roundConfig.roundCount} currentRound={flow.currentRound}
 *     keyIcons={{ p1: ['↓', '↑'], p2: ['↓', '↑'] }}     // 게임2: ['⇄','●'] / ['←','→'], 게임3: ['⚔','🛡']
 *     pressedKeys={pressed}                              // Set<'q'|'w'|'u'|'i'> (키 피드백)
 *     onExit={() => { exitMatch(); navigate('/'); }}
 *   >
 *     ...게임 스테이지 내용... (+ ResultOverlay)
 *   </HudFrame>
 */
import type { ReactNode } from 'react';
import type { PlayerDisplay } from '../state/flow';
import { Avatar } from './Avatar';
import { Sticker } from './Sticker';
import { Button } from './Button';
import { KeyCap } from './KeyCap';

export interface HudFrameProps {
  p1: PlayerDisplay;
  p2: PlayerDisplay;
  /** 라운드 남은 시간 (ms) */
  timeRemainingMs: number;
  /** 라운드 전체 시간 (ms) — 드레인 바 비율용. 기본 roundConfig 60초 */
  timeTotalMs?: number;
  roundWins: { P1: number; P2: number };
  roundCount: number;
  currentRound: number;
  /** 좌상단 나가기(btn-exit) */
  onExit: () => void;
  /** 키캡 위 아이콘 [key1, key2]. 생략 시 키캡 열 미표시 */
  keyIcons?: { p1: [string, string]; p2: [string, string] };
  /** 현재 눌린 물리 키 집합 ('q'|'w'|'u'|'i') */
  pressedKeys?: ReadonlySet<string>;
  children: ReactNode;
}

function winChips(
  side: 'P1' | 'P2',
  wins: number,
  total: number,
  align: 'left' | 'right',
): ReactNode {
  const chips = [];
  for (let i = 0; i < total; i++) {
    const won = i < wins;
    chips.push(
      <span key={i} className={`round-chip${won ? ` round-chip--${side.toLowerCase()}` : ''}`} />,
    );
  }
  if (align === 'right') chips.reverse();
  return <span style={{ display: 'inline-flex', gap: 4 }}>{chips}</span>;
}

export function HudFrame({
  p1,
  p2,
  timeRemainingMs,
  timeTotalMs,
  roundWins,
  roundCount,
  currentRound,
  onExit,
  keyIcons,
  pressedKeys,
  children,
}: HudFrameProps) {
  const seconds = Math.ceil(timeRemainingMs / 1000);
  const urgent = timeRemainingMs > 0 && timeRemainingMs <= 5000;
  const total = timeTotalMs ?? 60_000;
  const drainRatio = total > 0 ? Math.max(0, Math.min(1, timeRemainingMs / total)) : 0;
  const isPressed = (k: string) => pressedKeys?.has(k) ?? false;

  const profile = (side: 'P1' | 'P2', p: PlayerDisplay) => (
    <div
      className={`hud-profile hud-profile--${side.toLowerCase()}`}
      data-testid={side === 'P1' ? 'hud-profile-p1' : 'hud-profile-p2'}
    >
      <Avatar name={p.name} colorIndex={p.avatarColorIndex} size={36} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{p.name}</span>
      {p.isYou && (
        <Sticker tilt={-6} bg="var(--highlight)" fontSize={11} style={{ padding: '1px 6px' }}>
          YOU
        </Sticker>
      )}
      <span style={{ flex: 1 }} />
      {winChips(side, roundWins[side], roundCount, side === 'P1' ? 'left' : 'right')}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* 상단 HUD 바 */}
      <div className="hud-bar">
        <Button variant="secondary" size="sm" data-testid="btn-exit" onClick={onExit}>
          나가기
        </Button>
        {profile('P1', p1)}
        <div
          className={`hud-countdown${urgent ? ' hud-countdown--urgent' : ''}`}
          data-testid="hud-countdown"
        >
          <span className="label-caps" style={{ fontSize: 10 }}>
            ROUND {currentRound}/{roundCount}
          </span>
          <span className="hud-countdown__num">{seconds}</span>
          <span className="hud-countdown__drain">
            <span className="hud-countdown__drain-fill" style={{ width: `${drainRatio * 100}%` }} />
          </span>
        </div>
        {profile('P2', p2)}
        {/* 좌측 나가기 버튼과의 대칭 밸런스용 스페이서 */}
        <span style={{ width: 90 }} />
      </div>

      {/* 게임 스테이지 */}
      <div
        className="game-stage"
        data-testid="game-stage"
        style={{ flex: 1, margin: '4px 24px 16px' }}
      >
        {children}
      </div>

      {/* 하단 키캡 열 */}
      {keyIcons && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 48px 20px',
          }}
        >
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <KeyCap side="P1" keyChar="q" icon={keyIcons.p1[0]} pressed={isPressed('q')} />
            <KeyCap side="P1" keyChar="w" icon={keyIcons.p1[1]} pressed={isPressed('w')} />
          </span>
          <span style={{ display: 'inline-flex', gap: 12 }}>
            <KeyCap side="P2" keyChar="u" icon={keyIcons.p2[0]} pressed={isPressed('u')} />
            <KeyCap side="P2" keyChar="i" icon={keyIcons.p2[1]} pressed={isPressed('i')} />
          </span>
        </div>
      )}
    </div>
  );
}
