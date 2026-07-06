/**
 * GamePictogram — 게임(1~10)별 스크린 픽토그램 (순수 장식).
 * GameSelect(S8) 내부에 있던 것을 온라인 매치 슬롯머신 인트로와 공유하려고 추출.
 * 고유 아트: 숫자맞추기=1 / 펜싱=2 / 미사일=4. 그 외는 pictograms.ts 의 SVG 씬(FINAL_PICTOS),
 * 안전망은 표시 번호(GAME_ORDER 위치). 클래스명은 기존 s8-· gp- 계열을 유지한다.
 */
import { GAME_ORDER } from '@madpump/shared';
import type { GameId } from '@/shell';
import { FINAL_PICTOS } from '../screens/pictograms';
import './game-pictogram.css';

export function GamePictogram({ id, displayNo }: { id: GameId; displayNo?: number }) {
  if (id === 1) {
    return (
      <div className="s8-picto s8-picto--g1" aria-hidden>
        <span className="s8-g1-arrow s8-g1-arrow--up font-arcade">▲</span>
        <span className="s8-g1-num font-arcade">87</span>
        <span className="s8-g1-arrow s8-g1-arrow--down font-arcade">▼</span>
      </div>
    );
  }
  if (id === 4) {
    return (
      <div className="s8-picto s8-picto--g2" aria-hidden>
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
        <span className="s8-g2-trail" />
      </div>
    );
  }
  if (id === 2) {
    return (
      <div className="s8-picto s8-picto--g3" aria-hidden>
        <span className="s8-g3-blades">
          <span className="s8-g3-blade s8-g3-blade--p1" />
          <span className="s8-g3-blade s8-g3-blade--p2" />
        </span>
        <svg className="s8-g3-wave" viewBox="0 0 120 14" preserveAspectRatio="none">
          <polyline
            points="0,12 15,3 30,12 45,3 60,12 75,3 90,12 105,3 120,12"
            fill="none"
            stroke="var(--p1)"
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  }
  // 대표 픽토그램 (pictograms.ts, 게임 내부 id 기준)
  const finalPicto = FINAL_PICTOS[id];
  if (finalPicto) {
    return (
      <div className="s8-picto gpic" aria-hidden>
        <svg
          viewBox="0 0 120 108"
          preserveAspectRatio="xMidYMid meet"
          dangerouslySetInnerHTML={{ __html: finalPicto }}
        />
      </div>
    );
  }
  // 안전망: 표시 번호 픽토그램
  const no = displayNo ?? (GAME_ORDER as readonly number[]).indexOf(id) + 1;
  return (
    <div className="s8-picto s8-picto--gN" aria-hidden>
      <span className="s8-gN-num font-arcade glow-text">{no || id}</span>
    </div>
  );
}
