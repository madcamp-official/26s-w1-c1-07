/**
 * QA coverage2 — 잔여 체크리스트 항목 검증.
 *  c1. S3 취소하기 → 모달 닫힘, 메인 유지 (QA-S3-04)
 *  c2. S5 빈 입력 제출 방지 (QA-S5-05)
 *  c3. 게임2 P1 자동 왕복 이동 (QA-S10-03)
 *  c4. 게임2 시간 종료까지 생존 → P2 승 (QA-S10-10)
 *  c5. 게임3 무행동 vs 회피 → 회피 밀림 (QA-S12-06) + 시작 3칸 (QA-S12-09)
 *  c6. 게임3 시간 종료 → 더 밀린 쪽 패배 (QA-S12-11)
 */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'round1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const ok = (c, l, d = '') => {
  console.log(`  ${c ? 'PASS' : 'FAIL'} ${l} ${c ? '' : d}`);
  if (!c) failures.push({ label: l, detail: d });
};
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1280, height: 832 } }).then((c) => c.newPage());
const bridge = () => page.evaluate(() => window.__MADPUMP__ ?? null);
const waitGame = async (pred, timeout = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await bridge();
    if (b?.game && pred(b.game)) return b.game;
    await sleep(60);
  }
  return null;
};

await page.goto('http://localhost:5105', { waitUntil: 'networkidle' });

// c1. S3 취소하기
console.log('[c1] S3 cancel');
await page.getByTestId('btn-online').click();
await page.getByTestId('modal-login-required').waitFor();
await page.getByRole('button', { name: '취소하기' }).click();
await sleep(250);
ok((await page.getByTestId('modal-login-required').count()) === 0, 'modal closed (QA-S3-04)');
ok((await bridge())?.screen === 'scr-main-out', 'main stays (QA-S3-04)');

// c2. S5 빈 입력 제출 방지
console.log('[c2] S5 empty submit blocked');
await page.getByTestId('btn-google-login').click();
await page.getByTestId('scr-onboarding').waitFor();
ok(await page.getByTestId('btn-nickname-submit').isDisabled(), 'submit disabled when empty (QA-S5-05)');
await page.getByTestId('input-nickname').fill('커버리지QA');
ok(await page.getByTestId('btn-nickname-submit').isDisabled(), 'still disabled without division (QA-S5-05)');
await page.locator('input[placeholder="예: 1분반"]').fill('1분반');
await page.getByTestId('btn-nickname-submit').click();
await page.getByTestId('scr-main-in').waitFor();
await page.keyboard.press('Escape'); // auto-opened online panel 닫기
await sleep(250);

// 설정: 1라운드 / 12초 (짧은 타임아웃 검증용)
await page.getByTestId('btn-settings').click();
await page.locator('input[aria-label="라운드 수"]').fill('1');
await page.locator('input[aria-label="라운드 당 시간"]').fill('12');
await page.getByTestId('btn-settings-save').click();
await sleep(200);

// c3+c4. 게임2 자동 이동 + 생존 승리
console.log('[c3/c4] game2 auto-move + survive');
await page.getByTestId('btn-offline').click();
await page.getByTestId('card-game2').click();
const s0 = await waitGame((g) => g.attacker && g.elapsedMs > 200);
await sleep(500);
const s1 = (await bridge()).game;
ok(s0 && s1 && s1.attacker.x !== s0.attacker.x, 'attacker auto-moves without input (QA-S10-03)',
  JSON.stringify({ x0: s0?.attacker.x, x1: s1?.attacker.x }));
const surv = await waitGame((g) => g.result !== null, 15000);
ok(surv?.result === 'P2_WIN', `survive to timeout → P2_WIN (QA-S10-10), got ${surv?.result}`);
await page.getByTestId('result-overlay').waitFor({ timeout: 3000 });
await page.screenshot({ path: join(OUT, '26-game2-survive-p2win.png') });
await page.getByTestId('btn-back-main').click();
await sleep(400);

// c5+c6. 게임3 무행동vs회피 + 시작 3칸 + 타임아웃 판정
console.log('[c5/c6] game3 none-vs-dodge + timeout');
await page.getByTestId('btn-offline').click();
await page.getByTestId('card-game3').click();
const g3 = await waitGame((g) => g.gameId === 3 && g.elapsedMs > 0);
ok(
  g3 && g3.players.P1.distanceFromEdge === 3 && g3.players.P2.distanceFromEdge === 3,
  'both start 3 cells from edge (QA-S12-09)',
  JSON.stringify(g3?.players),
);
// P1 무행동, P2 회피(i) → 회피 밀림 (무행동 > 회피)
const t0 = g3.tickCount;
await page.keyboard.press('i');
const tick = await waitGame((g) => g.tickCount > t0 && g.lastTick, 3000);
const lt = tick?.lastTick;
ok(
  lt && lt.moves.P1 === 'NONE' && lt.moves.P2 === 'DODGE' && lt.pushed === 'P2',
  'none vs dodge → dodger pushed (QA-S12-06)',
  JSON.stringify(lt),
);
// 이후 무입력 → 시간 종료: P2가 더 밀렸으므로 P1 승 (TIMEOUT)
const fin = await waitGame((g) => g.result !== null, 14000);
ok(
  fin?.result === 'P1_WIN' && fin?.resultReason === 'TIMEOUT',
  `timeout → more-pushed side loses (QA-S12-11), got ${fin?.result}/${fin?.resultReason}`,
);
await page.getByTestId('result-overlay').waitFor({ timeout: 3000 });
await page.screenshot({ path: join(OUT, '27-game3-timeout-result.png') });

await browser.close();
console.log(`\ncoverage2 failures: ${failures.length}`);
for (const f of failures) console.log(` - ${f.label} ${f.detail}`);
process.exit(failures.length ? 1 : 0);
