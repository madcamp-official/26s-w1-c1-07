/**
 * 보충 프로브 — walk.mjs가 못 덮은 SPEC 항목:
 * S6-07(코드 입력 참가), S6-08(톱니→설정), S10-04(방향 반전), S10-10(시간종료 P2 승),
 * S12-05(회피vs공격), S12-06(무행동vs회피), S12-11(시간종료 판정)
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.QA_ROUND ?? 'round2');
const failures = [];
const fail = (s, d) => { failures.push({ step: s, detail: d }); console.error(`[FAIL] ${s}: ${d}`); };
const log = (m) => console.log(`[probe2] ${m}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });

const game = () => page.evaluate(() => {
  const g = window.__MADPUMP__?.game;
  return g ? JSON.parse(JSON.stringify(g)) : null;
});
const screen = () => page.evaluate(() => window.__MADPUMP__?.screen ?? '');

await page.goto('http://localhost:5104', { waitUntil: 'networkidle' });
// 로그인 + 온보딩
await page.click('[data-testid="btn-google-login"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-onboarding');
await page.fill('[data-testid="input-nickname"]', 'QA러너2');
await page.fill('[data-testid="input-group"]', '2분반');
await page.click('[data-testid="btn-nickname-submit"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-main-in');
// 설정 1라운드/6초
await page.click('[data-testid="btn-settings"]');
await page.waitForSelector('[data-testid="modal-settings"]');
const ins = await page.$$('[data-testid="modal-settings"] input');
await ins[0].fill('1');
await ins[1].fill('6');
await page.click('[data-testid="btn-settings-save"]');
await page.waitForTimeout(250);

// ── S6-08: 온라인 패널 톱니 → 설정 모달 ──
await page.click('[data-testid="btn-online"]');
await page.waitForSelector('[data-testid="modal-online"]');
await page.waitForTimeout(500);
const gear = await page.$('[data-testid="modal-online"] button[aria-label*="설정"], [data-testid="modal-online"] [data-testid="btn-room-settings"]');
const gearBtn = gear ?? (await page.$$('[data-testid="modal-online"] button')).at(-3); // fallback 탐색
// 톱니는 복사 버튼 옆 아이콘 — 텍스트 없는 버튼 찾기
let gearClicked = false;
for (const b of await page.$$('[data-testid="modal-online"] button')) {
  const txt = (await b.textContent())?.trim() ?? '';
  const hasSvg = await b.$('svg');
  if (txt === '' && hasSvg) { await b.click(); gearClicked = true; break; }
}
if (!gearClicked) fail('S6-08', '온라인 패널에서 톱니(설정) 버튼을 찾지 못함');
else {
  try {
    await page.waitForSelector('[data-testid="modal-settings"]', { timeout: 3000 });
    log('S6-08 gear → settings modal OK');
    await page.screenshot({ path: path.join(OUT, '24-S6-gear-settings.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  } catch {
    fail('S6-08', '톱니 클릭 후 설정 모달이 열리지 않음');
  }
}

// ── S6-07: 코드 입력 + 확인 → 매칭 플로우 ──
if (!(await page.$('[data-testid="modal-online"]'))) {
  await page.click('[data-testid="btn-online"]');
  await page.waitForSelector('[data-testid="modal-online"]');
}
await page.fill('[data-testid="input-code"]', '34823501249');
await page.click('[data-testid="btn-code-join"]');
try {
  await page.waitForSelector('[data-testid="modal-matching"]', { timeout: 3000 });
  log('S6-07 code join → matching modal OK');
  await page.screenshot({ path: path.join(OUT, '25-S6-code-join-matching.png') });
  await page.waitForFunction(() => (window.__MADPUMP__?.screen ?? '').startsWith('scr-game'), null, { timeout: 8000 });
  log(`S6-07 matched into ${await screen()}`);
  await page.click('[data-testid="btn-exit"]');
  await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-main-in');
} catch (e) {
  fail('S6-07', `코드 참가 매칭 플로우 실패: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: path.join(OUT, 'FAIL-S6-07.png') });
}

// ── S10-04 + S10-10: 게임2 방향 반전, 시간종료 P2 승 ──
await page.click('[data-testid="btn-offline"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-game-select');
await page.click('[data-testid="card-game2"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-game2');
await page.waitForTimeout(400);
const d0 = (await game())?.attacker?.dir;
await page.keyboard.press('q');
await page.waitForTimeout(200);
const d1 = (await game())?.attacker?.dir;
if (d0 === d1) fail('S10-04', `q 입력에 P1 이동 방향이 반전되지 않음: dir ${d0} → ${d1}`);
else log(`S10-04 direction reversed: ${d0} → ${d1}`);
// 발사 없이 시간종료까지 대기 (6초 설정)
try {
  await page.waitForFunction(() => window.__MADPUMP__?.game?.result != null, null, { timeout: 25000 });
  const end = await game();
  if (end.result !== 'P2_WIN') fail('S10-10', `시간종료 생존인데 결과가 ${end.result}`);
  else log('S10-10 P2 survive → P2_WIN OK');
  await page.screenshot({ path: path.join(OUT, '26-G2-timeout-p2win.png') });
} catch {
  fail('S10-10', '게임2 라운드가 제한 시간에 종료되지 않음');
}
await page.waitForTimeout(400);
if (await page.$('[data-testid="btn-back-main"]')) await page.click('[data-testid="btn-back-main"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-main-in');

// ── S12-05/06/11: 게임3 상성 + 시간종료 ──
await page.click('[data-testid="btn-offline"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-game-select');
await page.click('[data-testid="card-game3"]');
await page.waitForFunction(() => window.__MADPUMP__?.screen === 'scr-game3');
await page.waitForTimeout(200);

/** 다음 판정 틱까지 대기 */
async function waitTick(prevCount) {
  await page.waitForFunction(
    (c) => (window.__MADPUMP__?.game?.tickCount ?? 0) > c || window.__MADPUMP__?.game?.result != null,
    prevCount,
    { timeout: 3000 },
  );
  return game();
}

// 틱 1: P1 회피(w) vs P2 공격(u) → 공격 쪽(P2) 밀림 (회피>공격)
let s = await game();
await page.keyboard.press('w');
await page.keyboard.press('u');
let t1 = await waitTick(s.tickCount);
if (t1.lastTick?.moves?.P1 === 'DODGE' && t1.lastTick?.moves?.P2 === 'ATTACK') {
  if (t1.lastTick.pushed !== 'P2') fail('S12-05', `회피vs공격에서 밀린 쪽=${t1.lastTick.pushed} (P2여야 함)`);
  else log('S12-05 DODGE vs ATTACK → P2 pushed OK');
} else {
  fail('S12-05', `의도한 행동이 채택되지 않음: ${JSON.stringify(t1.lastTick?.moves)}`);
}
// 틱 2: P1 무행동 vs P2 회피(i) → 회피 쪽(P2) 밀림 (무행동>회피)
await page.keyboard.press('i');
let t2 = await waitTick(t1.tickCount);
if (t2.lastTick?.moves?.P1 === 'NONE' && t2.lastTick?.moves?.P2 === 'DODGE') {
  if (t2.lastTick.pushed !== 'P2') fail('S12-06', `무행동vs회피에서 밀린 쪽=${t2.lastTick.pushed} (P2여야 함)`);
  else log('S12-06 NONE vs DODGE → P2 pushed OK');
} else {
  fail('S12-06', `의도한 행동이 채택되지 않음: ${JSON.stringify(t2.lastTick?.moves)}`);
}
// 이후 무입력 → 시간종료(6초): 더 밀린 P2 패배 = P1_WIN / TIMEOUT
try {
  await page.waitForFunction(() => window.__MADPUMP__?.game?.result != null, null, { timeout: 10000 });
  const end3 = await game();
  if (end3.result !== 'P1_WIN' || end3.resultReason !== 'TIMEOUT') {
    fail('S12-11', `시간종료 판정 이상: result=${end3.result} reason=${end3.resultReason} (기대 P1_WIN/TIMEOUT)`);
  } else log('S12-11 timeout → 더 밀린 P2 패배 OK');
  await page.screenshot({ path: path.join(OUT, '27-G3-timeout-judgement.png') });
} catch {
  fail('S12-11', '게임3 라운드가 제한 시간에 종료되지 않음');
  await page.screenshot({ path: path.join(OUT, 'FAIL-S12-11.png') });
}

console.log('\n========== PROBE2 RESULT ==========');
if (failures.length === 0) console.log('ALL PASS');
else for (const f of failures) console.log(` - [${f.step}] ${f.detail}`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
