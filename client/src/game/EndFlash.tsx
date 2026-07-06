/**
 * DOM/SVG 게임용 기본 종료 플래시 — 캔버스 게임의 drawEndFlash(endFx.ts) 대응.
 * result가 확정되는 순간(active=false→true) 흰 섬광이 빠르게 페이드한다.
 * 캔버스가 없는 게임(숫자 맞추기·오목 등)의 종료 순간을 알린다.
 *
 * 사용: 게임 스테이지(position:relative 컨테이너) 안에 <EndFlash active={game?.result != null} /> 배치.
 */
import { useEffect, useRef } from 'react';

export function EndFlash({ active }: { active: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    // Web Animations API — CSS 파일 없이 자기완결. active가 true로 바뀔 때 1회 재생.
    ref.current.animate(
      [
        { opacity: 0.6 },
        { opacity: 0 },
      ],
      { duration: 320, easing: 'ease-out' },
    );
  }, [active]);
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background: '#ffffff',
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    />
  );
}
