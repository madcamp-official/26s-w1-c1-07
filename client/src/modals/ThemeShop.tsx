/**
 * 테마 상점 모달 (mock) — 코인으로 웹 전체 테마를 구매/적용하는 기능의 자리표시자.
 * 본체 testid: modal-theme-shop / 부품: btn-theme-<이름>
 *
 * 현재는 mock: "메모장 테마", "하키 테마" 두 개를 10000코인으로 표시만 하고,
 * 코인이 충분해도 구매는 불가("COMING SOON"). 실제 테마 전환(CSS 변수 스왑)은 추후 구현.
 */
import { Button, Modal } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { useSession } from '../state/session';
import './theme-shop.css';

const THEMES = [
  { key: 'memo', name: '메모장 테마', desc: '줄노트 + 연필 낙서 감성', price: 10000 },
  { key: 'hockey', name: '하키 테마', desc: '아이스링크 + 퍽 커서', price: 10000 },
] as const;

export default function ThemeShopModal() {
  const flow = useFlow();
  const session = useSession();
  const open = flow.modal === 'theme-shop';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="테마 상점 — THEME SHOP"
      accentColor="var(--accent2)"
      testId="modal-theme-shop"
      width={520}
    >
      <div className="ts-body">
        <h2 className="font-display ts-title">테마 변경하기</h2>
        <p className="ts-balance font-arcade">
          보유 <span className="c-accent glow-text">{session.coins}</span> COIN
        </p>
        <div className="ts-grid">
          {THEMES.map((t) => (
            <div key={t.key} className="ts-card">
              <span className="ts-card-name font-display">{t.name}</span>
              <span className="ts-card-desc font-display c-muted">{t.desc}</span>
              <span className="ts-card-price font-arcade c-accent">🪙 {t.price.toLocaleString()}</span>
              {/* mock: 코인이 충분해도 구매 불가 */}
              <Button variant="secondary" block data-testid={`btn-theme-${t.name}`} disabled>
                COMING SOON
              </Button>
            </div>
          ))}
        </div>
        <p className="ts-note font-display c-muted">테마 기능은 준비 중입니다 — 지금은 구매할 수 없어요.</p>
        <Button variant="tertiary" block onClick={closeModal}>
          닫기
        </Button>
      </div>
    </Modal>
  );
}
