/** btn-next-round 검증 — 라운드 2 설정 후 1라운드 승리 → 다음 라운드 → 2라운드 진입 */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'round1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1280, height: 832 } }).then((c) => c.newPage());
const bridge = () => page.evaluate(() => window.__MADPUMP__ ?? null);
const waitGame = async (pred, timeout = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await bridge();
    if (b?.game && pred(b.game)) return b.game;
    await sleep(50);
  }
  return null;
};
let fails = 0;
const ok = (c, l) => { console.log(`  ${c ? 'PASS' : 'FAIL'} ${l}`); if (!c) fails++; };

await page.goto('http://localhost:5105', { waitUntil: 'networkidle' });
await page.getByTestId('btn-settings').click();
await page.locator('input[aria-label="라운드 수"]').fill('2');
await page.locator('input[aria-label="라운드 당 시간"]').fill('15');
await page.getByTestId('btn-settings-save').click();
await sleep(200);
await page.getByTestId('btn-offline').click();
await page.getByTestId('card-game1').click();

async function winRound() {
  await waitGame((g) => g.gameId === 1 && g.result === null);
  for (let r = 0; r < 4; r++) {
    const cur = (await bridge()).game;
    if (!cur || cur.result !== null) break;
    const diff = cur.target - cur.players.P1.value;
    if (diff === 0) break;
    const key = diff > 0 ? 'w' : 'q';
    for (let i = 0; i < Math.abs(diff); i++) await page.keyboard.press(key);
    await sleep(120);
  }
  return waitGame((g) => g.result !== null, 6000);
}

const r1 = await winRound();
ok(r1?.result === 'P1_WIN', `round1 result ${r1?.result}`);
await page.getByTestId('result-overlay').waitFor({ timeout: 3000 });
ok(await page.getByTestId('btn-next-round').isVisible(), 'btn-next-round visible (match not over)');
ok((await page.getByTestId('btn-back-main').count()) === 0, 'btn-back-main hidden while match ongoing');
await page.screenshot({ path: join(OUT, '24-round1-result-nextround.png') });
await page.getByTestId('btn-next-round').click();
ok(await page.getByText('ROUND 2 / 2').isVisible({ timeout: 5000 }).catch(() => false), 'ROUND 2 / 2 shown');
const r2 = await winRound();
ok(r2?.result === 'P1_WIN', `round2 result ${r2?.result}`);
await page.getByTestId('result-overlay').waitFor({ timeout: 3000 });
ok(await page.getByTestId('btn-back-main').isVisible(), 'btn-back-main visible (match over, 2-0)');
ok((await page.getByTestId('result-text').innerText()).includes('VICTORY'), 'match VICTORY text');
await page.screenshot({ path: join(OUT, '25-match-result-2rounds.png') });
await browser.close();
console.log(`nextround fails: ${fails}`);
process.exit(fails ? 1 : 0);
