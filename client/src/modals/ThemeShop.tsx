/**
 * 테마 변경 모달 — 웹 전체 디자인 테마(design-lab 6종 컨셉)를 즉시 전환한다.
 * 본체 testid: modal-theme-shop / 부품: btn-theme-<id>
 *
 * 버튼을 누르면 state/theme.ts의 setTheme()가 <html data-theme>를 바꿔 앱을 통째로 리스킨하고
 * localStorage에 저장한다(무료 즉시 적용, 리로드 없음). 게임 로직/좌표는 테마 불변이므로
 * 서로 다른 테마의 두 사람이 함께 플레이해도 판정/좌표가 동일하다(크로스플레이).
 * 모달은 열린 채로 두어, 뒤 배경이 리스킨되는 것을 바로 확인할 수 있게 한다.
 */
import { Button, Modal } from '../components';
import { closeModal, useFlow } from '../state/flow';
import { THEMES, setTheme, useTheme } from '../state/theme';
import './theme-shop.css';

export default function ThemeShopModal() {
  const flow = useFlow();
  const current = useTheme();
  const open = flow.modal === 'theme-shop';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      marquee="테마 변경 — THEME SELECT"
      accentColor="var(--accent2)"
      testId="modal-theme-shop"
      width={560}
    >
      <div className="ts-body">
        <h2 className="font-display ts-title">테마 변경하기</h2>
        <p className="ts-balance font-display c-muted">
          버튼을 누르면 웹 전체 디자인이 즉시 바뀝니다. 게임은 어떤 테마끼리도 함께 플레이할 수 있어요.
        </p>
        <div className="ts-grid">
          {THEMES.map((t) => {
            const active = t.id === current;
            return (
              <div key={t.id} className={`ts-card${active ? ' ts-card--active' : ''}`}>
                <div className="ts-swatch" aria-hidden>
                  {t.swatch.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </div>
                <span className="ts-card-name font-display">{t.name}</span>
                <span className="ts-card-desc font-display c-muted">{t.tagline}</span>
                <Button
                  variant={active ? 'secondary' : 'primary'}
                  block
                  data-testid={`btn-theme-${t.id}`}
                  aria-pressed={active}
                  disabled={active}
                  onClick={() => setTheme(t.id)}
                >
                  {active ? '사용 중' : '적용'}
                </Button>
              </div>
            );
          })}
        </div>
        <Button variant="tertiary" block onClick={closeModal}>
          닫기
        </Button>
      </div>
    </Modal>
  );
}
