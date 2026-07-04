/**
 * probe3 — 시각 확인 보충: 애니메이션 완료 후 steady-state 캡처 3종
 * 28: S3 로그인 요구 모달 (wipe-in 완료 후)
 * 29: S7 접속 중(connecting) 단계
 * 30: 게임2 결과 오버레이 (화이트 플래시 종료 후)
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.QA_ROUND ?? 'round2');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
const failures = [];
const fail = (s, d) => { failures.push({ s, d }); console.error(`[FAIL] ${s}: ${d}`); };

await page.goto('http://localhost:5104', { waitUntil: 'networkidle' });

// 28: S3 steady
await page.click('[data-testid="btn-online"]');
await page.waitForSelector('[data-testid="modal-login-required"]');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, '28-S3-modal-steady.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 로그인 + 온보딩
await page.click('[data-testid="btn-google-login"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-onboarding');
await page.fill('[data-testid="input-nickname"]', 'QA러너3');
await page.fill('[data-testid="input-group"]', '3분반');
await page.click('[data-testid="btn-nickname-submit"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-main-in');

// 29: S7 connecting steady (접속 중 단계, 취소 버튼 없어야 함)
await page.click('[data-testid="btn-online"]');
await page.waitForSelector('[data-testid="modal-online"]');
await page.waitForTimeout(700);
await page.click('[data-testid="btn-quickstart"]');
await page.waitForSelector('[data-testid="modal-matching"]');
await page.waitForTimeout(600); // wipe-in 완료, 아직 connecting(1~2초) 내
const txt = await page.evaluate(() => document.body.innerText);
if (!txt.includes('접속 중')) fail('S7-connecting', '캡처 시점에 접속 중 문구 없음(이미 waiting일 수 있음)');
await page.screenshot({ path: path.join(OUT, '29-S7-connecting-steady.png') });
// 매칭 성사까지 대기 → 나가기
await page.waitForFunction(() => (window.__MADPUMP__?.screen ?? '').startsWith('scr-game'), null, { timeout: 10000 });
await page.click('[data-testid="btn-exit"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-main-in');

// 설정 1라운드/15초
await page.click('[data-testid="btn-settings"]');
await page.waitForSelector('[data-testid="modal-settings"]');
const ins = await page.$$('[data-testid="modal-settings"] input');
await ins[0].fill('1');
await ins[1].fill('15');
await page.click('[data-testid="btn-settings-save"]');
await page.waitForTimeout(250);

// 30: 게임2 결과 오버레이 steady (피격 유도 후 플래시 끝나고 캡처)
await page.click('[data-testid="btn-offline"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-game-select');
await page.click('[data-testid="card-game2"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-game2');
for (let i = 0; i < 80; i++) {
  await page.keyboard.press('w');
  await page.waitForTimeout(300);
  const done = await page.evaluate(() => window.__MADPUMP__?.game?.result != null);
  if (done) break;
}
const res = await page.evaluate(() => window.__MADPUMP__?.game?.result ?? null);
if (!res) fail('G2-end', '게임2가 종료되지 않음');
await page.waitForTimeout(2200); // 플래시/리플레이 연출 종료 대기
await page.waitForSelector('[data-testid="result-overlay"]');
await page.screenshot({ path: path.join(OUT, '30-G2-result-steady.png') });

console.log(failures.length === 0 ? 'PROBE3 ALL PASS' : `PROBE3 ${failures.length} fail`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
