/**
 * QA round1 보충 검증 — walk.mjs가 못 덮은 SPEC 체크리스트 항목 실측.
 *   S1-06(비로그인 오프라인 진입) / S8-03·04 / S3-04(취소하기) / S5-05(빈 제출 방지)
 *   S2-06(로그아웃) / S10-10(P2 생존승) / S12-05·06·07(상성 3종) / S12-11(타임아웃 판정)
 * Run from design-lab root:  node ideas/02-neon-coinop/qa/extra.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'round1');
mkdirSync(DIR, { recursive: true });

const failures = [];
let n = 25; // walk.mjs 뒤 이어서 번호 부여

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
page.setDefaultTimeout(8000);

const shot = async (name) => {
  await page.waitForTimeout(600);
  n += 1;
  const f = `${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(DIR, f) });
  console.log(`  [shot] ${f}`);
};
const fail = (s, d) => {
  console.error(`  [FAIL] ${s}: ${d}`);
  failures.push({ s, d });
};
const step = async (name, fn) => {
  console.log(`STEP: ${name}`);
  try {
    await fn();
  } catch (e) {
    fail(name, String(e?.message ?? e).split('\n')[0]);
    try { await shot(`ERR-${name}`); } catch {}
  }
};
const screenIs = (s) => page.waitForFunction((x) => window.__MADPUMP__?.screen === x, s);
const assert = (c, m) => { if (!c) throw new Error(m); };
const tid = (t) => page.locator(`[data-testid="${t}"]`);

// A. 비로그인 오프라인 진입 (QA-S1-06, S8-03)
await step('x1-offline-logged-out', async () => {
  await page.goto('http://localhost:5102');
  await screenIs('scr-main-out');
  await tid('btn-offline').click();
  await screenIs('scr-game-select');
  const sess = await page.evaluate(() => window.__MADPUMP__.session);
  assert(!sess.loggedIn, 'expected logged-out');
  await shot('s8-select-logged-out');
});

// B. S8 뒤로가기 (QA-S8-04)
await step('x2-select-back-to-main', async () => {
  await page.locator('text=메인으로').first().click();
  await screenIs('scr-main-out');
});

// C. 로그인 요구 모달 취소 (QA-S3-04)
await step('x3-login-modal-cancel', async () => {
  await tid('btn-online').click();
  await tid('modal-login-required').waitFor({ state: 'visible' });
  await page.locator('[data-testid="modal-login-required"] button:has-text("취소하기")').click();
  await tid('modal-login-required').waitFor({ state: 'detached' });
  await screenIs('scr-main-out');
  await shot('s3-cancel-back-to-s1');
});

// D. S1 헤더 구글 로그인 → 온보딩, 빈 제출 방지 (QA-S1-07, S5-05)
await step('x4-onboarding-empty-submit', async () => {
  await tid('btn-google-login').click();
  await screenIs('scr-onboarding');
  await tid('btn-nickname-submit').click(); // 빈 제출
  await page.waitForTimeout(700);
  const scr = await page.evaluate(() => window.__MADPUMP__.screen);
  assert(scr === 'scr-onboarding', 'empty submit navigated away: ' + scr);
  await shot('s5-empty-submit-blocked');
  await tid('input-nickname').fill('스모크QA');
  await page.locator('#onboarding-group').fill('1분반');
  await tid('btn-nickname-submit').click();
  await screenIs('scr-main-in');
});

const openSettingsAnd = async (fn) => {
  await tid('btn-settings').click();
  await tid('modal-settings').waitFor({ state: 'visible' });
  await fn();
  await tid('btn-settings-save').click();
  await tid('modal-settings').waitFor({ state: 'detached' });
};
const toSelect = async () => {
  await tid('btn-offline').click();
  await screenIs('scr-game-select');
};
const backMain = async () => {
  if (await tid('result-overlay').count()) await tid('btn-back-main').click();
  else await tid('btn-exit').click();
  await screenIs('scr-main-in');
};

// E. 게임3 상성 3종 (QA-S12-05/06/07) — rounds=1, time=60
await step('x5-game3-matchups', async () => {
  await openSettingsAnd(async () => {
    await page.locator('input[aria-label="라운드 수"]').fill('1');
    await page.locator('input[aria-label="라운드 당 시간"]').fill('60');
  });
  await toSelect();
  await tid('card-game3').click();
  await screenIs('scr-game3');
  await page.waitForFunction(() => window.__MADPUMP__?.game?.gameId === 3);

  const freshWindow = () =>
    page.waitForFunction(
      () => window.__MADPUMP__.game.windowElapsedMs < 400 && window.__MADPUMP__.game.result === null,
    );
  const tickAfter = async (k) => {
    await page.waitForFunction((kk) => window.__MADPUMP__.game.tickCount >= kk, k);
    return page.evaluate(() => {
      const t = window.__MADPUMP__.game.lastTick;
      return { p1: t.moves.P1, p2: t.moves.P2, pushed: t.pushed, clash: t.clash, i: t.tickIndex };
    });
  };

  // (1) 공격 vs 회피 → 공격(P1) 밀림 (QA-S12-05)
  await freshWindow();
  const k1 = await page.evaluate(() => window.__MADPUMP__.game.tickCount);
  await page.keyboard.press('q'); // P1 ATTACK
  await page.keyboard.press('i'); // P2 DODGE
  const t1 = await tickAfter(k1 + 1);
  assert(
    t1.p1 === 'ATTACK' && t1.p2 === 'DODGE' && t1.pushed === 'P1',
    'ATTACK vs DODGE wrong: ' + JSON.stringify(t1),
  );

  // (2) 회피 vs 회피 → 밀림 없음 (QA-S12-07)
  await freshWindow();
  const k2 = await page.evaluate(() => window.__MADPUMP__.game.tickCount);
  await page.keyboard.press('w'); // P1 DODGE
  await page.keyboard.press('i'); // P2 DODGE
  const t2 = await tickAfter(k2 + 1);
  assert(
    t2.p1 === 'DODGE' && t2.p2 === 'DODGE' && t2.pushed === null && t2.clash,
    'DODGE vs DODGE wrong: ' + JSON.stringify(t2),
  );

  // (3) 회피 vs 무행동 → 회피(P1) 밀림 (QA-S12-06)
  await freshWindow();
  const k3 = await page.evaluate(() => window.__MADPUMP__.game.tickCount);
  await page.keyboard.press('w'); // P1 DODGE, P2 무행동
  const t3 = await tickAfter(k3 + 1);
  assert(
    t3.p1 === 'DODGE' && t3.p2 === 'NONE' && t3.pushed === 'P1',
    'DODGE vs NONE wrong: ' + JSON.stringify(t3),
  );
  await shot('s12-matchups-done');
  await backMain();
});

// F. 게임2 P2 생존승 (QA-S10-10) — time=5초, 무입력 생존
await step('x6-game2-survive-p2-win', async () => {
  await openSettingsAnd(async () => {
    await page.locator('input[aria-label="라운드 당 시간"]').fill('5');
  });
  await toSelect();
  await tid('card-game2').click();
  await screenIs('scr-game2');
  await page.waitForFunction(() => window.__MADPUMP__?.game?.bullets !== undefined);
  await page.waitForFunction(() => window.__MADPUMP__.game.result !== null, null, {
    timeout: 12000,
  });
  const r = await page.evaluate(() => window.__MADPUMP__.game.result);
  assert(r === 'P2_WIN', 'expected P2_WIN on survive, got ' + r);
  await tid('result-overlay').waitFor({ state: 'visible' });
  await shot('s10-game2-survive-p2win');
  await backMain();
});

// G. 게임3 타임아웃 판정 (QA-S12-11) — 1번 밀고 방치 → 더 밀린 쪽(P2) 패배
await step('x7-game3-timeout-judge', async () => {
  await toSelect();
  await tid('card-game3').click();
  await screenIs('scr-game3');
  await page.waitForFunction(() => window.__MADPUMP__?.game?.gameId === 3);
  await page.keyboard.press('q'); // 첫 윈도우: P1 공격 → P2 1칸 밀림
  await page.waitForFunction(() => window.__MADPUMP__.game.result !== null, null, {
    timeout: 12000,
  });
  const fin = await page.evaluate(() => ({
    result: window.__MADPUMP__.game.result,
    reason: window.__MADPUMP__.game.resultReason,
  }));
  assert(
    fin.result === 'P1_WIN' && fin.reason === 'TIMEOUT',
    'timeout judge wrong: ' + JSON.stringify(fin),
  );
  await shot('s12-timeout-judge');
  await backMain();
});

// H. 로그아웃 → S1 (QA-S2-06)
await step('x8-logout', async () => {
  await page.locator('button:has-text("로그아웃")').click();
  await screenIs('scr-main-out');
  await shot('s1-after-logout');
});

await browser.close();
console.log('\n==== EXTRA SUMMARY ====');
if (failures.length === 0) console.log('ALL EXTRA STEPS PASSED');
else {
  for (const f of failures) console.log(`FAIL ${f.s}: ${f.d}`);
  process.exitCode = 1;
}
