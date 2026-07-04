/**
 * QA supplement — 메인 walk가 못 덮은 SPEC 항목 보강 검증.
 *  s1. 비로그인 오프라인 진입 (QA-S1-06/S8-03) + 뒤로가기 (QA-S8-04)
 *  s2. 설정 기본값 버튼 (QA-S4-05)
 *  s3. 로그인 → 로그아웃 → S1 (QA-S2-06)
 *  s4. 온라인 패널 배경 클릭 닫기 (QA-S6-09) + 코드 입력 확인 → 매칭 (QA-S6-07)
 *  s5. 게임1 일치 이탈 시 유지 타이머 리셋 (QA-S9-10)
 *  s6. 게임2 총알 속도 랜덤 (QA-S10-08)
 *  s7. 게임3 상성: 회피vs공격(공격 밀림), 공/공 클래시(무밀림), 마지막 입력 채택 (QA-S12-05/07/08)
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
const waitGame = async (pred, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await bridge();
    if (b?.game && pred(b.game)) return b.game;
    await sleep(50);
  }
  return null;
};

await page.goto('http://localhost:5105', { waitUntil: 'networkidle' });

// s1. 비로그인 오프라인 진입
console.log('[s1] offline without login');
await page.getByTestId('btn-offline').click();
await sleep(400);
{
  const b = await bridge();
  ok(b?.screen === 'scr-game-select' && b.session.loggedIn === false,
    'offline reachable without login (QA-S1-06/S8-03)', JSON.stringify(b?.session));
}
ok(await page.getByText('메인으로').first().isVisible(), 'back-to-main affordance (QA-S8-04)');
await page.getByText('메인으로').first().click();
await sleep(300);

// s2. 설정 기본값 버튼
console.log('[s2] settings default button');
await page.getByTestId('btn-settings').click();
await page.locator('input[aria-label="라운드 수"]').fill('7');
await page.locator('input[aria-label="라운드 당 시간"]').fill('99');
await page.getByRole('button', { name: '기본값' }).click();
ok((await page.locator('input[aria-label="라운드 수"]').inputValue()) === '3', 'default rounds restored (QA-S4-05)');
ok((await page.locator('input[aria-label="라운드 당 시간"]').inputValue()) === '60', 'default secs restored (QA-S4-05)');
ok(await page.getByTestId('modal-settings').isVisible(), 'modal stays open after default');
// 저장하고 닫기: 라운드1/15초로 (이후 게임 검증용)
await page.locator('input[aria-label="라운드 수"]').fill('1');
await page.locator('input[aria-label="라운드 당 시간"]').fill('15');
await page.getByTestId('btn-settings-save').click();
await sleep(200);

// s3. 로그인 → 로그아웃
console.log('[s3] login → logout');
await page.getByTestId('btn-google-login').click();
await page.getByTestId('scr-onboarding').waitFor();
await page.getByTestId('input-nickname').fill('보강QA');
await page.locator('input[placeholder="예: 1분반"]').fill('2분반');
await page.getByTestId('btn-nickname-submit').click();
await page.getByTestId('scr-main-in').waitFor();
await page.getByRole('button', { name: '로그아웃' }).click();
await sleep(300);
{
  const b = await bridge();
  ok(b?.screen === 'scr-main-out' && b.session.loggedIn === false, 'logout → S1 (QA-S2-06)', b?.screen);
}
// 재로그인 (기존 유저 → 온보딩 생략)
await page.getByTestId('btn-google-login').click();
await sleep(900);
{
  const b = await bridge();
  ok(b?.screen === 'scr-main-in' && b.session.nickname === '보강QA', 're-login skips onboarding', JSON.stringify(b?.session));
}

// s4. 온라인 패널: 배경 클릭 닫기 + 코드 입력 → 매칭
console.log('[s4] online panel backdrop + code join');
await page.getByTestId('btn-online').click();
await page.getByTestId('modal-online').waitFor();
await page.mouse.click(100, 750); // 패널 밖 배경
await sleep(300);
ok((await page.getByTestId('modal-online').count()) === 0, 'backdrop click closes panel (QA-S6-09)');
await page.getByTestId('btn-online').click();
await page.getByTestId('input-code').fill('123456');
await page.getByTestId('btn-code-join').click();
ok(await page.getByTestId('modal-matching').isVisible(), 'code join → matching modal (QA-S6-07)');
// 취소 (waiting 단계까지 대기)
await page.getByTestId('btn-matching-cancel').waitFor({ timeout: 3000 });
await page.getByTestId('btn-matching-cancel').click();
await sleep(200);
await page.keyboard.press('Escape');
await sleep(300);

// s5. 게임1 — 일치 이탈 시 유지 타이머 리셋
console.log('[s5] game1 hold reset');
await page.getByTestId('btn-offline').click();
await page.getByTestId('card-game1').click();
let g1 = await waitGame((g) => g.gameId === 1);
ok(!!g1, 'game1 started');
if (g1) {
  for (let r = 0; r < 4; r++) {
    const cur = (await bridge()).game;
    const diff = cur.target - cur.players.P1.value;
    if (diff === 0) break;
    const key = diff > 0 ? 'w' : 'q';
    for (let i = 0; i < Math.abs(diff); i++) await page.keyboard.press(key);
    await sleep(120);
  }
  const held = await waitGame((g) => g.players.P1.holdMs > 600, 3000);
  ok(!!held, 'hold accumulating');
  // 일치 이탈 — 클램프(100) 경계면 반대 방향으로
  const breakKey = held && held.players.P1.value >= 100 ? 'q' : 'w';
  await page.keyboard.press(breakKey);
  const reset = await waitGame((g) => g.players.P1.holdMs === 0 && !g.derived.P1.matched, 2000);
  ok(!!reset, 'hold timer reset on mismatch (QA-S9-10)');
}
await page.keyboard.press('Escape'); // 오버레이가 떠 있어도 ESC로 이탈
await sleep(400);

// s6. 게임2 — 총알 속도 랜덤
console.log('[s6] game2 bullet speed randomness');
await page.getByTestId('btn-offline').click();
await page.getByTestId('card-game2').click();
await waitGame((g) => g.attacker && g.elapsedMs > 0);
const speeds = new Set();
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('w');
  await sleep(650); // 쿨다운 0.5초 + 여유
  const s = (await bridge()).game;
  for (const b of s?.bullets ?? []) speeds.add(Math.round(b.vy * 1000));
}
ok(speeds.size >= 2, `bullet speeds vary (QA-S10-08) — ${speeds.size} distinct`, [...speeds].join(','));
await page.keyboard.press('Escape'); // 피격으로 라운드가 끝났어도 ESC로 이탈
await sleep(400);

// s7. 게임3 — 상성 조합
console.log('[s7] game3 matchups');
await page.getByTestId('btn-offline').click();
await page.getByTestId('card-game3').click();
let g3 = await waitGame((g) => g.gameId === 3 && g.elapsedMs > 0);
ok(!!g3, 'game3 started');
if (g3) {
  // (1) P1 회피(w) vs P2 공격(u) → 공격자 P2 밀림 (회피 > 공격)
  const t0 = (await bridge()).game.tickCount;
  await page.keyboard.press('w');
  await page.keyboard.press('u');
  let tick = await waitGame((g) => g.tickCount > t0 && g.lastTick, 3000);
  const lt1 = tick?.lastTick;
  ok(
    lt1 && lt1.moves.P1 === 'DODGE' && lt1.moves.P2 === 'ATTACK' && lt1.pushed === 'P2',
    'dodge vs attack → attacker pushed (QA-S12-05)',
    JSON.stringify(lt1),
  );
  // (2) 공/공 클래시 → 무밀림 (QA-S12-07)
  const t1 = (await bridge()).game.tickCount;
  await page.keyboard.press('q');
  await page.keyboard.press('u');
  tick = await waitGame((g) => g.tickCount > t1 && g.lastTick.tickIndex === t1 + 1, 3000);
  const lt2 = tick?.lastTick;
  ok(
    lt2 && lt2.moves.P1 === 'ATTACK' && lt2.moves.P2 === 'ATTACK' && lt2.pushed === null && lt2.clash,
    'attack/attack clash → no push (QA-S12-07)',
    JSON.stringify(lt2),
  );
  // (3) 마지막 입력 채택: P1 q→w 연속 입력 → DODGE 채택 (QA-S12-08)
  const t2 = (await bridge()).game.tickCount;
  await page.keyboard.press('q');
  await page.keyboard.press('w');
  tick = await waitGame((g) => g.tickCount > t2 && g.lastTick.tickIndex === t2 + 1, 3000);
  const lt3 = tick?.lastTick;
  ok(lt3 && lt3.moves.P1 === 'DODGE', 'last input wins the tick (QA-S12-08)', JSON.stringify(lt3));
}
await page.screenshot({ path: join(OUT, '23-supplement-game3.png') });
await page.keyboard.press('Escape');

await browser.close();
console.log(`\nsupplement failures: ${failures.length}`);
for (const f of failures) console.log(` - ${f.label} ${f.detail}`);
process.exit(failures.length ? 1 : 0);
