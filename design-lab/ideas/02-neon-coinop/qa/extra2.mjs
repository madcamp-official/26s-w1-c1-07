/**
 * QA round1 보충 2 — S6-08(톱니→설정 재사용), S9-12(다음 라운드 반복), S12-08(마지막 입력 채택).
 * Run from design-lab root:  node ideas/02-neon-coinop/qa/extra2.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'round1');
mkdirSync(DIR, { recursive: true });
const failures = [];
let n = 32;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
page.setDefaultTimeout(8000);
const tid = (t) => page.locator(`[data-testid="${t}"]`);
const screenIs = (s) => page.waitForFunction((x) => window.__MADPUMP__?.screen === x, s);
const assert = (c, m) => { if (!c) throw new Error(m); };
const shot = async (name) => {
  await page.waitForTimeout(600);
  n += 1;
  const f = `${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(DIR, f) });
  console.log(`  [shot] ${f}`);
};
const step = async (name, fn) => {
  console.log(`STEP: ${name}`);
  try { await fn(); } catch (e) {
    failures.push({ name, d: String(e?.message ?? e).split('\n')[0] });
    console.error(`  [FAIL] ${name}`);
    try { await shot(`ERR-${name}`); } catch {}
  }
};

// 로그인 + 온보딩
await step('y0-login', async () => {
  await page.goto('http://localhost:5102');
  await screenIs('scr-main-out');
  await tid('btn-google-login').click();
  await screenIs('scr-onboarding');
  await tid('input-nickname').fill('보충QA');
  await page.locator('#onboarding-group').fill('1분반');
  await tid('btn-nickname-submit').click();
  await screenIs('scr-main-in');
});

// S6-08: 온라인 패널 톱니 → 설정 모달 → 닫으면 온라인 패널 복귀
await step('y1-gear-settings', async () => {
  await tid('btn-online').click();
  await tid('modal-online').waitFor({ state: 'visible' });
  await page.locator('[data-testid="modal-online"] button:has-text("⚙")').click();
  await tid('modal-settings').waitFor({ state: 'visible' });
  await shot('s6-gear-opens-s4');
  await tid('btn-settings-save').click();
  await tid('modal-online').waitFor({ state: 'visible' }); // 패널 복귀
  await page.mouse.click(20, 20); // 배경 클릭 닫기
  await tid('modal-online').waitFor({ state: 'detached' });
  await screenIs('scr-main-in');
});

// S9-12: rounds=2 → 게임1 1라운드 승리 → round-result + 다음 라운드 → 2라운드 시작
await step('y2-game1-two-rounds', async () => {
  await tid('btn-settings').click();
  await tid('modal-settings').waitFor({ state: 'visible' });
  await page.locator('input[aria-label="라운드 수"]').fill('2');
  await page.locator('input[aria-label="라운드 당 시간"]').fill('60');
  await tid('btn-settings-save').click();
  await tid('modal-settings').waitFor({ state: 'detached' });
  await tid('btn-offline').click();
  await screenIs('scr-game-select');
  await tid('card-game1').click();
  await screenIs('scr-game1');
  await page.waitForFunction(() => window.__MADPUMP__?.game?.gameId === 1);

  const winRound = async () => {
    for (let r = 0; r < 8; r++) {
      const { target, v } = await page.evaluate(() => ({
        target: window.__MADPUMP__.game.target,
        v: window.__MADPUMP__.game.players.P1.value,
      }));
      const d = target - v;
      if (d === 0) break;
      const key = d > 0 ? 'w' : 'q';
      for (let i = 0; i < Math.abs(d); i++) await page.keyboard.press(key);
      await page.waitForTimeout(250);
    }
    await page.waitForFunction(() => window.__MADPUMP__.game.result !== null, null, {
      timeout: 8000,
    });
  };

  await winRound();
  await tid('result-overlay').waitFor({ state: 'visible' });
  const stageCap = await tid('result-overlay').innerText();
  assert(stageCap.includes('ROUND 1/2'), 'expected round-result 1/2, got: ' + stageCap.slice(0, 60));
  assert(await tid('btn-next-round').count(), 'btn-next-round missing');
  await shot('s9-round-result-1of2');
  await tid('btn-next-round').click();
  // 2라운드 새 게임 state로 재시작
  await page.waitForFunction(() => window.__MADPUMP__.game.result === null);
  await page.getByText('ROUND 2/2').first().waitFor({ state: 'visible' });
  await shot('s9-round2-started');
  // 2라운드도 이겨서 매치 종료까지
  await winRound();
  await tid('result-overlay').waitFor({ state: 'visible' });
  const finalTxt = await tid('result-overlay').innerText();
  assert(finalTxt.includes('FINAL RESULT'), 'expected match result, got: ' + finalTxt.slice(0, 60));
  await tid('btn-back-main').click();
  await screenIs('scr-main-in');
});

// S12-08: 한 틱 윈도우 안 다중 입력 → 마지막 입력 채택 (q→w면 DODGE 채택 → P1 밀림)
await step('y3-game3-last-input', async () => {
  await tid('btn-offline').click();
  await screenIs('scr-game-select');
  await tid('card-game3').click();
  await screenIs('scr-game3');
  await page.waitForFunction(() => window.__MADPUMP__?.game?.gameId === 3);
  await page.waitForFunction(
    () => window.__MADPUMP__.game.windowElapsedMs < 400 && window.__MADPUMP__.game.result === null,
  );
  const k = await page.evaluate(() => window.__MADPUMP__.game.tickCount);
  await page.keyboard.press('q'); // ATTACK 먼저
  await page.keyboard.press('w'); // DODGE 나중 → 이게 채택돼야 함
  await page.waitForFunction((kk) => window.__MADPUMP__.game.tickCount >= kk, k + 1);
  const t = await page.evaluate(() => {
    const lt = window.__MADPUMP__.game.lastTick;
    return { p1: lt.moves.P1, p2: lt.moves.P2, pushed: lt.pushed };
  });
  // 마지막 입력(DODGE)이 채택 → DODGE vs NONE → P1 밀림
  assert(
    t.p1 === 'DODGE' && t.pushed === 'P1',
    'last-input adoption wrong: ' + JSON.stringify(t),
  );
  await shot('s12-last-input-adopted');
  await tid('btn-exit').click();
  await screenIs('scr-main-in');
});

await browser.close();
console.log('\n==== EXTRA2 SUMMARY ====');
if (failures.length === 0) console.log('ALL EXTRA2 STEPS PASSED');
else {
  for (const f of failures) console.log(`FAIL ${f.name}: ${f.d}`);
  process.exitCode = 1;
}
