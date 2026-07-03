/** S2 리더보드 lb-myrank 뷰포트 클리핑 측정 프로브 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'round1');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
await page.goto('http://localhost:5101');
await page.click('[data-testid="btn-google-login"]');
await page.waitForSelector('[data-testid="scr-onboarding"]');
await page.fill('[data-testid="input-nickname"]', 'QA러너');
await page.fill('#s5-group', '1분반');
await page.click('[data-testid="btn-nickname-submit"]');
await page.waitForSelector('[data-testid="lb-myrank"]');
const info = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="lb-myrank"]');
  const r = el.getBoundingClientRect();
  return {
    rect: { top: r.top, bottom: r.bottom, height: r.height },
    viewportH: window.innerHeight,
    docH: document.documentElement.scrollHeight,
    canScroll: document.documentElement.scrollHeight > window.innerHeight,
  };
});
console.log(JSON.stringify(info, null, 2));
// 스크롤해서 전체가 보이는지 확인 + 캡쳐
await page.evaluate(() => document.querySelector('[data-testid="lb-myrank"]').scrollIntoView({ block: 'end' }));
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, '22-s2-leaderboard-scrolled.png') });
await browser.close();
