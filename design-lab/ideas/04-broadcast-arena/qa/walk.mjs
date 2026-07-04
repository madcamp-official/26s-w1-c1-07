/**
 * MADPUMP idea-04 Broadcast Arena — QA walk (Playwright headless).
 * 실행: design-lab 루트에서  node ideas/04-broadcast-arena/qa/walk.mjs
 * 스크린샷: ideas/04-broadcast-arena/qa/${QA_ROUND:-round2}/NN-*.png
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, process.env.QA_ROUND ?? 'round2');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5104';

const failures = [];
let shotNo = 0;

function log(msg) {
  console.log(`[walk] ${msg}`);
}
function fail(step, detail) {
  failures.push({ step, detail });
  console.error(`[FAIL] ${step}: ${detail}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 832 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('pageerror', (e) => fail('pageerror', String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') console.error(`[console.error] ${m.text()}`);
});

async function shot(name) {
  shotNo += 1;
  const file = `${String(shotNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  log(`shot ${file}`);
  return file;
}

async function bridge() {
  return page.evaluate(() => {
    const b = window.__MADPUMP__;
    return b ? { screen: b.screen, session: b.session, hasGame: b.game != null } : null;
  });
}
async function gameState() {
  return page.evaluate(() => {
    const g = window.__MADPUMP__?.game;
    return g ? JSON.parse(JSON.stringify(g)) : null;
  });
}
async function expectScreen(id, step, timeout = 5000) {
  try {
    await page.waitForFunction((want) => window.__MADPUMP__?.screen === want, id, { timeout });
  } catch {
    const b = await bridge();
    fail(step, `expected screen=${id}, got ${JSON.stringify(b)}`);
    await shot(`FAIL-${step}`);
    return false;
  }
  return true;
}
async function expectVisible(testid, step, timeout = 4000) {
  try {
    await page.waitForSelector(`[data-testid="${testid}"]`, { state: 'visible', timeout });
    return true;
  } catch {
    fail(step, `[data-testid=${testid}] not visible`);
    await shot(`FAIL-${step}`);
    return false;
  }
}
async function click(testid) {
  await page.click(`[data-testid="${testid}"]`);
}
async function pressKey(key, times = 1, gapMs = 25) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    if (gapMs) await page.waitForTimeout(gapMs);
  }
}
/** 실패 복구: 어디에 있든 메인으로 돌아가려 시도 */
async function ensureMain() {
  for (let i = 0; i < 4; i++) {
    const b = await bridge();
    if (!b) return;
    if (b.screen === 'scr-main-in' || b.screen === 'scr-main-out') {
      // 모달 열려있으면 ESC
      const modal = await page.$('[data-testid^="modal-"]');
      if (modal) await page.keyboard.press('Escape');
      return;
    }
    const back = await page.$('[data-testid="btn-back-main"]');
    if (back) { await back.click(); await page.waitForTimeout(300); continue; }
    const exit = await page.$('[data-testid="btn-exit"]');
    if (exit) { await exit.click(); await page.waitForTimeout(300); continue; }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

// ───────────────────────── (a) S1 메인 비로그인 ─────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await expectScreen('scr-main-out', 'a-S1-load');
for (const [tid, name] of [
  ['btn-online', 'QA-S1-03 온라인 버튼'],
  ['btn-offline', 'QA-S1-03 오프라인 버튼'],
  ['btn-google-login', 'QA-S1-02 구글 로그인'],
  ['btn-settings', 'QA-S1-04 설정 버튼'],
]) {
  if (!(await page.$(`[data-testid="${tid}"]`))) fail('a-S1-elements', `${name}(${tid}) 없음`);
}
const hasTitle = await page.evaluate(() => document.body.innerText.includes('MADPUMP'));
if (!hasTitle) fail('a-S1-title', 'MADPUMP 타이틀 텍스트 없음 (QA-S1-01)');
await shot('S1-main-loggedout');

// ───────────────────────── (b) 로그인 요구 모달 ─────────────────────────
await click('btn-online');
await expectVisible('modal-login-required', 'b-S3-modal');
const s3text = await page.evaluate(() => document.body.innerText);
if (!s3text.includes('로그인이 필요합니다')) fail('b-S3-copy', '"온라인 게임은 로그인이 필요합니다!" 문구 없음 (QA-S3-01)');
await shot('S3-login-required-modal');

// 취소하기 → 모달 닫힘 (QA-S3-04)
await page.click('[data-testid="modal-login-required"] >> text=취소하기');
await page.waitForTimeout(300);
if (await page.$('[data-testid="modal-login-required"]')) fail('b-S3-cancel', '취소하기 후 모달이 닫히지 않음 (QA-S3-04)');

// 다시 열고 모달 내 구글 로그인 → 최초 로그인이므로 온보딩(S5)
await click('btn-online');
await expectVisible('modal-login-required', 'b-S3-reopen');
await page.click('[data-testid="modal-login-required"] button:has-text("SIGN IN")');
await expectScreen('scr-onboarding', 'c-S5-onboarding', 6000);
await shot('S5-onboarding');

// ───────────────────────── (c) 온보딩: 중복 닉네임 → 유니크 ─────────────
await page.fill('[data-testid="input-nickname"]', '펌프광인'); // mock 유저와 동일값
await page.fill('[data-testid="input-group"]', '1분반');
await click('btn-nickname-submit');
await expectVisible('err-nickname-dup', 'c-S5-dup-error');
const dupKeeps = await page.inputValue('[data-testid="input-nickname"]');
if (dupKeeps !== '펌프광인') fail('c-S5-dup-keep', `중복 에러 후 입력이 유지되지 않음: "${dupKeeps}"`);
await shot('S5-dup-error');

// 이름 수정 시 에러 해제 (QA-S5-04)
await page.fill('[data-testid="input-nickname"]', '펌프광인2');
await page.waitForTimeout(150);
if (await page.$('[data-testid="err-nickname-dup"]')) fail('c-S5-err-clear', '이름 수정 후 에러가 사라지지 않음 (QA-S5-04)');

// 빈 입력 제출 방지 (QA-S5-05)
await page.fill('[data-testid="input-nickname"]', '');
const submitDisabled = await page.isDisabled('[data-testid="btn-nickname-submit"]');
if (!submitDisabled) {
  await click('btn-nickname-submit');
  await page.waitForTimeout(200);
  const still = await bridge();
  if (still.screen !== 'scr-onboarding') fail('c-S5-empty', '빈 이름으로 제출됨 (QA-S5-05)');
}

// 유니크 닉네임으로 제출 → S2
await page.fill('[data-testid="input-nickname"]', 'QA러너');
await click('btn-nickname-submit');
await expectScreen('scr-main-in', 'c-S2-loggedin');
const sess = (await bridge()).session;
if (!sess.loggedIn || sess.nickname !== 'QA러너') fail('c-S2-session', `session 브리지 이상: ${JSON.stringify(sess)}`);
const greet = await page.evaluate(() => document.body.innerText.includes('QA러너'));
if (!greet) fail('c-S2-greeting', '닉네임 인사말에 "QA러너" 없음 (QA-S2-01)');

// ───────────────────────── (d) 리더보드 ─────────────────────────
await expectVisible('lb-top3', 'd-S2-lb-top3');
await expectVisible('lb-myrank', 'd-S2-lb-myrank');
await shot('S2-main-loggedin-leaderboard');

// ───────────────────────── (e) 설정 모달: 라운드 2 / 20초 저장 ─────────
await click('btn-settings');
await expectVisible('modal-settings', 'e-S4-open');
const inputs = await page.$$('[data-testid="modal-settings"] input');
if (inputs.length < 2) {
  fail('e-S4-inputs', `설정 입력이 ${inputs.length}개 (2개 필요)`);
} else {
  await inputs[0].fill('2');
  await inputs[1].fill('20');
}
await shot('S4-settings-edited');
await click('btn-settings-save');
await page.waitForTimeout(300);
if (await page.$('[data-testid="modal-settings"]')) fail('e-S4-close', '확인 후 모달이 닫히지 않음');
// 재오픈해 유지 확인 (QA-S4-04)
await click('btn-settings');
await expectVisible('modal-settings', 'e-S4-reopen');
const vals = await page.$$eval('[data-testid="modal-settings"] input', (els) => els.map((e) => e.value));
if (vals[0] !== '2' || vals[1] !== '20') fail('e-S4-persist', `저장값 미유지: ${JSON.stringify(vals)} (QA-S4-04)`);
// 기본값 버튼 (QA-S4-05): 값 리셋 + 모달 유지
const defBtn = await page.$('[data-testid="modal-settings"] button:has-text("기본값")');
if (defBtn) {
  await defBtn.click();
  await page.waitForTimeout(150);
  const dvals = await page.$$eval('[data-testid="modal-settings"] input', (els) => els.map((e) => e.value));
  if (dvals[0] !== '3' || dvals[1] !== '60') fail('e-S4-default', `기본값 복원 이상: ${JSON.stringify(dvals)}`);
  if (!(await page.$('[data-testid="modal-settings"]'))) fail('e-S4-default-open', '기본값 후 모달이 닫혔음');
} else {
  fail('e-S4-default', '"기본값" 버튼 없음 (QA-S4-03)');
}
await shot('S4-settings-reopen-persist');
// ESC = 저장 안 함 → roundConfig는 2/20 유지
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

// ───────────────────────── (f-1) 온라인 패널 + 코드 생성 ─────────────────
await click('btn-online');
await expectVisible('modal-online', 'f-S6-open');
await shot('S6-online-panel');
// 배경 클릭 닫힘 (QA-S6-09)
await page.mouse.click(20, 500);
await page.waitForTimeout(300);
if (await page.$('[data-testid="modal-online"]')) fail('f-S6-bgclose', '배경 클릭으로 패널이 닫히지 않음 (QA-S6-09)');
// 재오픈 → 코드 생성
await click('btn-online');
await expectVisible('modal-online', 'f-S6-reopen');
await click('btn-code-create');
await expectVisible('room-code-display', 'f-S6-code');
const code = (await page.textContent('[data-testid="room-code-display"]'))?.trim() ?? '';
if (!/\d{6,}/.test(code.replace(/\D/g, ''))) fail('f-S6-code-format', `생성된 코드가 숫자 코드가 아님: "${code}"`);
// 복사 (QA-S6-05)
const copyBtn = await page.$('[data-testid="modal-online"] button:has-text("복사")');
if (copyBtn) {
  await copyBtn.click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (!clip || !code.replace(/\D/g, '').includes(clip.replace(/\D/g, '')) && !clip.replace(/\D/g, '').includes(code.replace(/\D/g, ''))) {
    fail('f-S6-copy', `클립보드 불일치: clip="${clip}" code="${code}"`);
  }
} else fail('f-S6-copy', '복사 버튼 없음');
await shot('S6-code-created');
// mock 상대 입장 대기 (4초) → 인게임 (QA-S6-06)
try {
  await page.waitForFunction(() => (window.__MADPUMP__?.screen ?? '').startsWith('scr-game'), null, { timeout: 8000 });
  const b = await bridge();
  log(`code-room entered game: ${b.screen}`);
  await shot('S6-code-room-ingame');
  await click('btn-exit');
  await expectScreen('scr-main-in', 'f-S6-exit');
} catch {
  fail('f-S6-mock-join', '코드 생성 후 mock 상대 입장으로 인게임 전환 안 됨 (QA-S6-06)');
  await shot('FAIL-code-room');
  await ensureMain();
}

// ───────────────────────── (f-2) 빠른 시작 → 매칭 모달 → 취소 → 재매칭 ──
await click('btn-online');
await expectVisible('modal-online', 'f2-S6-open');
await click('btn-quickstart');
await expectVisible('modal-matching', 'f2-S7-modal');
const conText = await page.evaluate(() => document.body.innerText);
if (!conText.includes('접속 중')) fail('f2-S7-connecting', '"게임에 접속 중입니다" 문구 없음 (QA-S7-01)');
if (await page.$('[data-testid="btn-matching-cancel"]')) fail('f2-S7-cancel-early', 'connecting 단계에 취소 버튼 노출 (Q15 위반)');
await shot('S7-matching-connecting');
// waiting 단계 + 취소 버튼 (QA-S7-02)
if (await expectVisible('btn-matching-cancel', 'f2-S7-waiting', 3000)) {
  const waitText = await page.evaluate(() => document.body.innerText);
  if (!waitText.includes('대기 중')) fail('f2-S7-waiting-copy', '"플레이어 대기 중" 문구 없음 (QA-S7-02)');
  await shot('S7-matching-waiting-cancel');
  // 취소 (QA-S7-03) + 성사 미발생 확인 (QA-S7-05)
  await click('btn-matching-cancel');
  await page.waitForTimeout(300);
  if (!(await page.$('[data-testid="modal-online"]'))) fail('f2-S7-cancel', '취소 후 온라인 패널(S6) 복귀 실패 (QA-S7-03)');
  await page.waitForTimeout(3500);
  const after = await bridge();
  if ((after.screen ?? '').startsWith('scr-game')) fail('f2-S7-timer', '취소했는데 가짜 매칭이 성사됨 (QA-S7-05)');
}
// 다시 빠른 시작 → 매칭 성사 → 인게임 (QA-S7-04)
if (!(await page.$('[data-testid="modal-online"]'))) { await ensureMain(); await click('btn-online'); }
await click('btn-quickstart');
try {
  await page.waitForFunction(() => (window.__MADPUMP__?.screen ?? '').startsWith('scr-game'), null, { timeout: 8000 });
  const b = await bridge();
  log(`quickstart matched into ${b.screen}`);
  await page.waitForTimeout(700);
  await shot('S7-quickstart-ingame-bot');
  await click('btn-exit');
  await expectScreen('scr-main-in', 'f2-exit-main');
} catch {
  fail('f2-S7-match', '빠른 시작 매칭 성사 → 인게임 전환 실패 (QA-S7-04)');
  await shot('FAIL-quickstart');
  await ensureMain();
}

// ───────────────────────── (g) 오프라인 → 게임 선택 ─────────────────────
await click('btn-offline');
await expectScreen('scr-game-select', 'g-S8');
for (const tid of ['card-game1', 'card-game2', 'card-game3']) {
  if (!(await page.$(`[data-testid="${tid}"]`))) fail('g-S8-cards', `${tid} 없음 (QA-S8-01)`);
}
await shot('S8-game-select');

// ───────────────────────── (h) 게임1 — 숫자 맞추기 (2라운드) ─────────────
await click('card-game1');
await expectScreen('scr-game1', 'h-G1-enter');
await expectVisible('hud-countdown', 'h-G1-countdown');
await expectVisible('hud-profile-p1', 'h-G1-profile1');
await expectVisible('hud-profile-p2', 'h-G1-profile2');
await expectVisible('game-stage', 'h-G1-stage');

let g1 = await gameState();
if (!g1) fail('h-G1-bridge', 'window.__MADPUMP__.game 이 null');
else {
  if (g1.target < 1 || g1.target > 100) fail('h-G1-target', `타겟 범위 이탈: ${g1.target}`);
  if (g1.players.P1.value === g1.target || g1.players.P2.value === g1.target)
    fail('h-G1-start', `시작 숫자가 타겟과 동일 (QA-S9-08): ${JSON.stringify(g1.players)} target=${g1.target}`);
}
// 카운트다운 감소 확인 (QA-S9-05)
const t0 = (await gameState())?.derived?.timeRemainingMs ?? 0;
await page.waitForTimeout(1200);
const t1 = (await gameState())?.derived?.timeRemainingMs ?? 0;
if (!(t1 < t0)) fail('h-G1-timer', `카운트다운이 줄지 않음: ${t0} → ${t1}`);

// 키 반응 확인 (QA-S9-06/07) — 클램프 경계 회피 방향으로
g1 = await gameState();
const p1v0 = g1.players.P1.value;
await pressKey(p1v0 >= 100 ? 'q' : 'w');
await page.waitForTimeout(120);
let gNow = await gameState();
if (Math.abs(gNow.players.P1.value - p1v0) !== 1) fail('h-G1-keyP1', `w/q 입력에 P1 숫자 미반응: ${p1v0} → ${gNow.players.P1.value}`);
const p2v0 = gNow.players.P2.value;
await pressKey(p2v0 >= 100 ? 'u' : 'i');
await page.waitForTimeout(120);
gNow = await gameState();
if (Math.abs(gNow.players.P2.value - p2v0) !== 1) fail('h-G1-keyP2', `u/i 입력에 P2 숫자 미반응: ${p2v0} → ${gNow.players.P2.value}`);
await shot('G1-ingame');

/** P1을 타겟까지 이동 */
async function driveP1ToTarget() {
  for (let iter = 0; iter < 30; iter++) {
    const s = await gameState();
    if (!s) return false;
    const diff = s.target - s.players.P1.value;
    if (diff === 0) return true;
    await pressKey(diff > 0 ? 'w' : 'q', Math.min(Math.abs(diff), 20), 20);
    await page.waitForTimeout(80);
  }
  return false;
}

// 라운드 1: 일치 → 유지 중 이탈 시 리셋 확인(QA-S9-10) → 재일치 3초 유지 → 라운드 승리
if (!(await driveP1ToTarget())) fail('h-G1-drive', 'P1 숫자를 타겟에 맞추지 못함');
await page.waitForTimeout(900);
let held = await gameState();
if (!(held.players.P1.holdMs > 0)) fail('h-G1-hold', `일치 후 holdMs가 증가하지 않음: ${JSON.stringify(held.players.P1)}`);
// 이탈 → 리셋
await pressKey(held.players.P1.value >= 100 ? 'q' : 'w');
await page.waitForTimeout(150);
let broken = await gameState();
if (broken.players.P1.holdMs !== 0) fail('h-G1-holdreset', `일치 이탈 후 holdMs 리셋 안 됨: ${broken.players.P1.holdMs} (QA-S9-10)`);
// 재일치 후 3초 유지
await driveP1ToTarget();
try {
  await page.waitForFunction(() => window.__MADPUMP__?.game?.result != null, null, { timeout: 6000 });
} catch {
  fail('h-G1-win', '일치 3초 유지 후 라운드 승리가 확정되지 않음 (QA-S9-09)');
}
await page.waitForTimeout(400);
await expectVisible('result-overlay', 'h-G1-round-overlay');
await expectVisible('result-text', 'h-G1-round-text');
await shot('G1-round1-result');
// 라운드 2로 (btn-next-round — 라운드 반복 QA-S9-12)
if (await expectVisible('btn-next-round', 'h-G1-nextbtn')) {
  await click('btn-next-round');
  await page.waitForTimeout(400);
  const r2 = await gameState();
  if (!r2 || r2.result !== null) fail('h-G1-round2', '다음 라운드가 새 state로 시작되지 않음');
  await driveP1ToTarget();
  try {
    await page.waitForFunction(() => window.__MADPUMP__?.game?.result != null, null, { timeout: 6000 });
  } catch {
    fail('h-G1-round2-win', '라운드2 승리 확정 실패');
  }
  await page.waitForTimeout(400);
  const rtext = (await page.textContent('[data-testid="result-text"]').catch(() => '')) ?? '';
  log(`G1 match result text: ${rtext.trim()}`);
  await shot('G1-match-result');
  if (!(await page.$('[data-testid="btn-back-main"]'))) fail('h-G1-match-end', '2라운드 종료 후 매치 결과/메인 버튼 없음 (QA-S9-12)');
  await click('btn-back-main');
  await expectScreen('scr-main-in', 'h-G1-back');
} else {
  await ensureMain();
}

// 설정을 1라운드로 낮춰 게임2/3을 단축
await click('btn-settings');
await expectVisible('modal-settings', 'i-S4-round1');
const inputs2 = await page.$$('[data-testid="modal-settings"] input');
await inputs2[0].fill('1');
await inputs2[1].fill('20');
await click('btn-settings-save');
await page.waitForTimeout(250);

// ───────────────────────── (i) 게임2 — 총알 피하기 ──────────────────────
await click('btn-offline');
await expectScreen('scr-game-select', 'i-S8');
await click('card-game2');
await expectScreen('scr-game2', 'i-G2-enter');
await expectVisible('hud-countdown', 'i-G2-countdown');
await page.waitForTimeout(500);

let g2 = await gameState();
if (!g2) fail('i-G2-bridge', 'game 브리지 null');
// P1 자동 이동 확인 (QA-S10-03)
const ax0 = g2?.attacker?.x ?? g2?.players?.P1?.x ?? null;
await page.waitForTimeout(600);
let g2b = await gameState();
const ax1 = g2b?.attacker?.x ?? g2b?.players?.P1?.x ?? null;
if (ax0 !== null && ax1 !== null && ax0 === ax1) fail('i-G2-automove', `P1이 자동 이동하지 않음: x=${ax0}`);
// 발사 (w) → 총알 생성 (QA-S10-05)
const bullets0 = (g2b?.bullets ?? []).length;
await pressKey('w', 3, 250);
await page.waitForTimeout(200);
let g2c = await gameState();
if (((g2c?.bullets ?? []).length) <= 0 && bullets0 === 0) fail('i-G2-fire', 'w 발사 후 총알이 생성되지 않음 (QA-S10-05)');
// P2 이동 (u/i — 홀드 이동) (QA-S10-07)
const dx0 = g2c?.dodger?.x ?? g2c?.players?.P2?.x ?? null;
await page.keyboard.down('i');
await page.waitForTimeout(500);
await page.keyboard.up('i');
await page.waitForTimeout(150);
let g2d = await gameState();
const dx1 = g2d?.dodger?.x ?? g2d?.players?.P2?.x ?? null;
if (dx0 !== null && dx1 !== null && dx1 === dx0) fail('i-G2-p2move', `i 입력에 P2가 이동하지 않음: ${dx0} → ${dx1}`);
await shot('G2-ingame-firing');
// 결과까지: w 스팸(피격 유도), 최대 25초 (미피격 시 시간종료 P2 승)
let g2End = null;
for (let i = 0; i < 60; i++) {
  await pressKey('w');
  await page.waitForTimeout(380);
  g2End = await gameState();
  if (!g2End || g2End.result !== null) break;
}
if (!g2End || g2End.result === null) {
  fail('i-G2-end', '게임2 라운드가 종료되지 않음 (피격/시간종료 모두 미발생)');
  await shot('FAIL-G2-noend');
  await ensureMain();
} else {
  log(`G2 result: ${g2End.result}`);
  await page.waitForTimeout(400);
  await expectVisible('result-overlay', 'i-G2-overlay');
  await shot('G2-result');
  if (await page.$('[data-testid="btn-back-main"]')) await click('btn-back-main');
  else await ensureMain();
  await expectScreen('scr-main-in', 'i-G2-back');
}

// ───────────────────────── (j) 게임3 — 펜싱 ────────────────────────────
await click('btn-offline');
await expectScreen('scr-game-select', 'j-S8');
await click('card-game3');
await expectScreen('scr-game3', 'j-G3-enter');
await expectVisible('hud-countdown', 'j-G3-countdown');
await page.waitForTimeout(300);

let g3 = await gameState();
if (!g3) fail('j-G3-bridge', 'game 브리지 null');
if (g3 && g3.players.P1.distanceFromEdge !== 3) fail('j-G3-start', `시작 여유칸 3 아님: ${g3.players.P1.distanceFromEdge} (QA-S12-09)`);
// 마지막 입력 채택 확인 (QA-S12-08): q → w 연타 → pending.P1 = DODGE
await pressKey('q');
await pressKey('w');
await page.waitForTimeout(100);
let g3p = await gameState();
if (g3p && g3p.pending.P1 !== 'DODGE') fail('j-G3-lastinput', `q→w 후 pending.P1=${g3p.pending.P1} (마지막 입력 채택 실패, QA-S12-08)`);
// 클래시(공/공) — 아무도 안 밀림 (QA-S12-07)
await pressKey('q');
await pressKey('u');
await page.waitForTimeout(1100);
let g3c = await gameState();
if (g3c && g3c.lastTick && g3c.lastTick.moves.P1 === 'ATTACK' && g3c.lastTick.moves.P2 === 'ATTACK' && g3c.lastTick.pushed !== null) {
  fail('j-G3-clash', `공/공인데 밀림 발생: ${JSON.stringify(g3c.lastTick)}`);
}
await shot('G3-ingame');
// 한쪽만 공격 반복 → P2 링아웃 (QA-S12-04, S12-10)
let g3End = null;
for (let i = 0; i < 30; i++) {
  await pressKey('q');
  await page.waitForTimeout(450);
  g3End = await gameState();
  if (!g3End || g3End.result !== null) break;
}
if (!g3End || g3End.result === null) {
  fail('j-G3-ringout', '한쪽 공격 반복으로도 링아웃이 발생하지 않음');
  await shot('FAIL-G3-noend');
  await ensureMain();
} else {
  log(`G3 result: ${g3End.result} reason=${g3End.resultReason}`);
  if (g3End.result !== 'P1_WIN') fail('j-G3-winner', `P1 공격 반복인데 결과가 ${g3End.result}`);
  if (g3End.resultReason !== 'RING_OUT') fail('j-G3-reason', `링아웃이 아니라 ${g3End.resultReason}로 종료`);
  await page.waitForTimeout(600);
  await expectVisible('result-overlay', 'j-G3-overlay');
  await shot('G3-ringout-result');
  if (await page.$('[data-testid="btn-back-main"]')) await click('btn-back-main');
  else await ensureMain();
}

// ───────────────────────── (k) 메인 복귀 + 로그아웃 ─────────────────────
await expectScreen('scr-main-in', 'k-back-main');
await shot('final-main-loggedin');
// 로그아웃 → S1 (QA-S2-06)
const logoutBtn = await page.$('text=로그아웃');
if (logoutBtn) {
  await logoutBtn.click();
  await expectScreen('scr-main-out', 'k-logout');
} else {
  fail('k-logout', '로그아웃 버튼을 찾지 못함 (QA-S2-02)');
}
await shot('final-main-loggedout');

// ───────────────────────── 결과 ─────────────────────────
console.log('\n========== WALK RESULT ==========');
if (failures.length === 0) console.log('ALL PASS');
else {
  console.log(`${failures.length} FAILURE(S):`);
  for (const f of failures) console.log(` - [${f.step}] ${f.detail}`);
}
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
