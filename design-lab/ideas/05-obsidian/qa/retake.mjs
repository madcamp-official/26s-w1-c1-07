/** 모달 진입 애니메이션이 끝난 뒤의 상태를 재촬영 (08b 설정 재오픈, 10b 매칭 접속 중) */
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'round1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1280, height: 832 } }).then((c) => c.newPage());
await page.goto('http://localhost:5105', { waitUntil: 'networkidle' });

// 08b: 설정 모달 — 값 변경/저장/재오픈 후 애니메이션 안정 상태
await page.getByTestId('btn-settings').click();
await page.locator('input[aria-label="라운드 수"]').fill('1');
await page.locator('input[aria-label="라운드 당 시간"]').fill('15');
await page.getByTestId('btn-settings-save').click();
await sleep(300);
await page.getByTestId('btn-settings').click();
await sleep(600);
await page.screenshot({ path: join(OUT, '08b-s4-settings-reopen-settled.png') });
await page.keyboard.press('Escape');
await sleep(300);

// 10b: 로그인 → 온라인 패널 → 빠른 시작 → connecting 상태 (0.6초 시점)
await page.getByTestId('btn-online').click();
await page.getByTestId('btn-google-login').click();
await page.getByTestId('scr-onboarding').waitFor();
await page.getByTestId('input-nickname').fill('리테이크QA');
await page.locator('input[placeholder="예: 1분반"]').fill('1분반');
await page.getByTestId('btn-nickname-submit').click();
await page.getByTestId('modal-online').waitFor();
await page.getByTestId('btn-quickstart').click();
await sleep(600); // connecting 1.2초 창의 중간, 애니메이션은 종료
await page.screenshot({ path: join(OUT, '10b-s7-matching-connecting-settled.png') });

await browser.close();
console.log('retake done');
