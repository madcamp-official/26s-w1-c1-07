// MADPUMP idea-06 (PICO-8) — QA walkthrough (round 1)
// Playwright chromium headless, viewport 1280x832.
// Drives S1..S12 per SPEC, asserts via window.__MADPUMP__, screenshots each step.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'round2');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const BASE = 'http://localhost:5106';

const failures = [];
const notes = [];
let shotN = 0;
let page;

function fail(screen, detail) {
  failures.push({ screen, detail });
  console.log(`  [FAIL] ${screen}: ${detail}`);
}
function ok(msg) { console.log(`  [ok] ${msg}`); }
function note(m) { notes.push(m); console.log(`  [note] ${m}`); }

async function shot(name) {
  shotN += 1;
  const file = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  shot -> ${path.basename(file)}`);
  return file;
}
async function bridge() { return page.evaluate(() => window.__MADPUMP__ ?? null); }
const sleep = (ms) => page.waitForTimeout(ms);

async function assertScreen(expected, screen) {
  const b = await bridge();
  if (!b) return fail(screen, 'window.__MADPUMP__ 없음');
  if (b.screen !== expected) fail(screen, `bridge.screen=${b.screen} (기대 ${expected})`);
  else ok(`bridge.screen=${expected}`);
}
async function visible(testid) {
  return page.locator(`[data-testid="${testid}"]`).first().isVisible().catch(() => false);
}
async function mustVisible(testid, screen) {
  if (await visible(testid)) { ok(`${testid} 보임`); return true; }
  fail(screen, `${testid} 안 보임`); return false;
}

// window에 실제 keydown/keyup 디스패치 (attachKeyboardAdapter가 window에서 수신)
async function tapKey(key, n = 1) {
  await page.evaluate(({ key, n }) => {
    for (let i = 0; i < n; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }
  }, { key, n });
}
// 게임 play 페이즈 진입 대기 (elapsedMs > 0 이면 tick 진행 중)
async function waitForPlay(timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const b = await bridge();
    const g = b?.game;
    if (g && typeof g.elapsedMs === 'number' && g.elapsedMs > 0) return true;
    await sleep(80);
  }
  return false;
}
async function waitForResult(timeout = 12000) {
  try {
    await page.locator('[data-testid="result-overlay"]').first().waitFor({ state: 'visible', timeout });
    return true;
  } catch { return false; }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 832 } });
  page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

  // ============================================================= (a) S1
  console.log('\n== (a) S1 메인 비로그인 ==');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="scr-main-out"]').waitFor({ timeout: 10000 });
  await sleep(400);
  await assertScreen('scr-main-out', 'S1');
  await mustVisible('btn-google-login', 'S1');
  await mustVisible('btn-online', 'S1');
  await mustVisible('btn-offline', 'S1');
  await mustVisible('btn-settings', 'S1');
  { // 타이틀
    const t = await page.locator('.mo-title').first().getAttribute('aria-label').catch(() => null);
    if (t === 'MADPUMP') ok('MADPUMP 타이틀'); else fail('S1', `MADPUMP 타이틀 확인 실패 (${t})`);
  }
  await shot('s1-main-out');

  // ============================================================= (b) S3
  console.log('\n== (b) btn-online → S3 로그인 요구 모달 ==');
  await page.click('[data-testid="btn-online"]');
  await page.locator('[data-testid="modal-login-required"]').waitFor({ state: 'visible', timeout: 5000 });
  await assertScreen('scr-main-out', 'S3');
  await mustVisible('modal-login-required', 'S3');
  { // 문구 + 취소하기
    const txt = await page.locator('[data-testid="modal-login-required"]').innerText();
    if (/로그인/.test(txt) && /필요/.test(txt)) ok('로그인 필요 문구'); else fail('S3', '로그인 필요 문구 없음');
    if (/취소하기/.test(txt)) ok('취소하기 버튼'); else fail('S3', '취소하기 버튼 없음');
    const glVisible = await page.locator('[data-testid="modal-login-required"] [data-testid="btn-google-login"]').isVisible().catch(() => false);
    if (glVisible) ok('모달 내 구글 로그인'); else fail('S3', '모달 내 btn-google-login 없음');
  }
  await shot('s3-login-required');

  // ============================================================= (c) 로그인 → S5
  console.log('\n== (c) 모달 구글 로그인 → S5 온보딩 ==');
  await page.click('[data-testid="modal-login-required"] [data-testid="btn-google-login"]');
  await page.locator('[data-testid="scr-onboarding"]').waitFor({ timeout: 8000 });
  await sleep(300);
  await assertScreen('scr-onboarding', 'S5');
  await mustVisible('input-nickname', 'S5');
  await mustVisible('input-group', 'S5');
  await mustVisible('btn-nickname-submit', 'S5');
  await shot('s5-onboarding');

  // 중복 닉네임 (mock 유저 '펌프광인')
  console.log('\n-- 중복 닉네임 검증 --');
  await page.fill('[data-testid="input-nickname"]', '펌프광인');
  await page.fill('[data-testid="input-group"]', '1분반');
  await page.click('[data-testid="btn-nickname-submit"]');
  const dupShown = await page.locator('[data-testid="err-nickname-dup"]').isVisible({ timeout: 2000 }).catch(() => false);
  if (dupShown) ok('err-nickname-dup 표시'); else fail('S5', 'err-nickname-dup 안 뜸(중복 검증 실패)');
  await shot('s5-dup-error');

  // 수정 시 에러 해제 + 유니크 제출
  await page.fill('[data-testid="input-nickname"]', '큐에이봇');
  const dupGone = !(await page.locator('[data-testid="err-nickname-dup"]').isVisible().catch(() => false));
  if (dupGone) ok('이름 수정 시 에러 해제'); else fail('S5', '이름 수정해도 에러 유지');
  await page.click('[data-testid="btn-nickname-submit"]');
  await page.locator('[data-testid="scr-main-in"]').waitFor({ timeout: 8000 });
  await sleep(400);
  await assertScreen('scr-main-in', 'S2');

  // 온라인 의도 승계로 S6가 자동으로 열렸으면 닫기
  if (await visible('modal-online')) {
    await page.keyboard.press('Escape');
    await sleep(400);
    if (await visible('modal-online')) { await page.mouse.click(20, 400); await sleep(300); }
    note('온보딩 후 자동 오픈된 S6 온라인 패널 닫음');
  }

  // ============================================================= (d) S2 리더보드
  console.log('\n== (d) S2 로그인 후 메인 + 리더보드 ==');
  { const txt = await page.locator('[data-testid="scr-main-in"]').innerText();
    if (/큐에이봇/.test(txt)) ok('닉네임 인사말'); else fail('S2', '인사말에 닉네임 없음');
  }
  await mustVisible('lb-top3', 'S2');
  await mustVisible('lb-myrank', 'S2');
  await mustVisible('btn-online', 'S2');
  await mustVisible('btn-offline', 'S2');
  { const lb = await page.locator('[data-testid="lb-top3"]').innerText();
    if (/%|승/.test(lb)) ok('TOP3 승률/승수 표기'); else note('TOP3 승률 텍스트 패턴 미확인(시각 점검 필요)');
  }
  await shot('s2-main-in-leaderboard');

  // ============================================================= (e) S4 설정
  console.log('\n== (e) S4 설정 모달: 라운드 수 변경 저장 ==');
  await page.click('[data-testid="scr-main-in"] [data-testid="btn-settings"]');
  await page.locator('[data-testid="modal-settings"]').waitFor({ state: 'visible', timeout: 5000 });
  await mustVisible('btn-settings-save', 'S4');
  const roundInput = page.locator('[data-testid="modal-settings"] input[aria-label="라운드 수"]');
  const timeInput = page.locator('[data-testid="modal-settings"] input[aria-label="라운드 당 시간"]');
  await roundInput.fill('2');
  await timeInput.fill('6');
  await shot('s4-settings');
  await page.click('[data-testid="btn-settings-save"]');
  await sleep(300);
  // 재오픈해 값 유지 확인 (QA-S4-04)
  await page.click('[data-testid="scr-main-in"] [data-testid="btn-settings"]');
  await page.locator('[data-testid="modal-settings"]').waitFor({ state: 'visible', timeout: 5000 });
  const savedRounds = await page.locator('[data-testid="modal-settings"] input[aria-label="라운드 수"]').inputValue();
  if (savedRounds === '2') ok('설정 저장/재로드 값 유지 (라운드 2)'); else fail('S4', `저장값 미유지: ${savedRounds}`);
  await page.keyboard.press('Escape');
  await sleep(300);

  // ============================================================= (f) 온라인 매칭 → 게임
  console.log('\n== (f) S6 온라인 패널 → 빠른 시작 → S7 매칭 → 인게임 ==');
  await page.click('[data-testid="scr-main-in"] [data-testid="btn-online"]');
  await page.locator('[data-testid="modal-online"]').waitFor({ state: 'visible', timeout: 5000 });
  await mustVisible('btn-quickstart', 'S6');
  await mustVisible('btn-code-create', 'S6');
  await mustVisible('input-code', 'S6');
  // 코드 생성 확인 (QA-S6-04)
  await page.click('[data-testid="btn-code-create"]');
  await sleep(400);
  { const code = await page.locator('[data-testid="room-code-display"]').innerText();
    if (/\d{3,}/.test(code)) ok(`코드 생성됨: ${code.trim()}`); else fail('S6', `코드 생성 안 됨 (${code})`);
  }
  await shot('s6-online-code');
  // 빠른 시작 → 매칭
  await page.click('[data-testid="btn-quickstart"]');
  await page.locator('[data-testid="modal-matching"]').waitFor({ state: 'visible', timeout: 5000 });
  // connecting 문구
  { const t = await page.locator('[data-testid="modal-matching"]').innerText();
    if (/접속 중/.test(t)) ok('connecting: 게임에 접속 중입니다'); else note('connecting 문구 타이밍 놓침');
  }
  await shot('s7-matching-connecting');
  // waiting + 취소 버튼
  const cancelShown = await page.locator('[data-testid="btn-matching-cancel"]').waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
  if (cancelShown) ok('waiting 단계 취소 버튼 노출'); else fail('S7', 'btn-matching-cancel 안 나타남');
  { const t = await page.locator('[data-testid="modal-matching"]').innerText();
    if (/대기 중/.test(t)) ok('waiting: 플레이어 대기 중'); else note('waiting 문구 미확인'); }
  await shot('s7-matching-waiting');
  // 봇 매칭 성사 → 인게임 진입
  const enteredGame = await page.locator('[data-testid^="scr-game"]').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  if (enteredGame) {
    const b = await bridge();
    ok(`온라인 매칭 성사 → 인게임 (${b?.screen}, mode online 예상)`);
    await sleep(1200);
    await shot('online-ingame');
    await mustVisible('btn-exit', 'online-ingame');
    await page.click('[data-testid="btn-exit"]');
    await page.locator('[data-testid="scr-main-in"]').waitFor({ timeout: 5000 });
    ok('btn-exit → 메인 복귀');
  } else {
    fail('S7', '봇 매칭 후 인게임 진입 실패');
  }
  await sleep(300);

  // ============================================================= (g) 오프라인 → S8
  console.log('\n== (g) 오프라인 게임하기 → S8 게임 선택 ==');
  await page.click('[data-testid="scr-main-in"] [data-testid="btn-offline"]');
  await page.locator('[data-testid="scr-game-select"]').waitFor({ timeout: 5000 });
  await assertScreen('scr-game-select', 'S8');
  await mustVisible('card-game1', 'S8');
  await mustVisible('card-game2', 'S8');
  await mustVisible('card-game3', 'S8');
  await shot('s8-game-select');

  // ============================================================= (h) 게임1
  console.log('\n== (h) 게임1 — 숫자 맞추기 (P1 타겟 일치 3초 유지) ==');
  await page.click('[data-testid="card-game1"]');
  await page.locator('[data-testid="scr-game1"]').waitFor({ timeout: 6000 });
  await assertScreen('scr-game1', 'S9');
  await mustVisible('hud-countdown', 'S9');
  await mustVisible('hud-profile-p1', 'S9');
  await mustVisible('hud-profile-p2', 'S9');
  await mustVisible('game-stage', 'S9');
  if (!(await waitForPlay())) fail('S9', 'play 페이즈 진입 안 됨(elapsedMs>0 대기 실패)');
  await shot('s9-game1-play');
  { // 배정 숫자 != 타겟 (QA-S9-08)
    const g = (await bridge())?.game;
    if (g && g.players.P1.value !== g.target && g.players.P2.value !== g.target) ok('시작 배정숫자 != 타겟');
    else fail('S9', `배정숫자==타겟 (t=${g?.target} p1=${g?.players?.P1?.value} p2=${g?.players?.P2?.value})`);
    // P1을 타겟에 맞춤
    const diff = g.target - g.players.P1.value;
    await tapKey(diff > 0 ? 'w' : 'q', Math.abs(diff));
    await sleep(200);
    const g2 = (await bridge())?.game;
    if (g2 && g2.players.P1.value === g2.target) ok(`P1 값 타겟 일치 (${g2.target})`);
    else fail('S9', `P1 타겟 일치 실패 (t=${g2?.target} p1=${g2?.players?.P1?.value})`);
  }
  // 3초 유지 → 승리
  await sleep(3500);
  const g1res = await waitForResult(4000);
  if (g1res) {
    const g = (await bridge())?.game;
    const rtext = await page.locator('[data-testid="result-text"]').innerText().catch(() => '');
    if (g?.result === 'P1_WIN') ok(`게임1 P1 승리 판정 (result=${g.result})`);
    else fail('S9', `3초 유지했는데 P1 승리 아님 (result=${g?.result})`);
    ok(`result-text: ${rtext.trim()}`);
  } else fail('S9', '3초 유지 후 result-overlay 안 뜸');
  await shot('s9-game1-result');
  // 라운드 반복 확인 — 다음 라운드 (roundCount=2)
  if (await visible('btn-next-round')) {
    await page.click('[data-testid="btn-next-round"]');
    await sleep(500);
    if (await waitForPlay()) {
      const g = (await bridge())?.game;
      const diff = g.target - g.players.P1.value;
      await tapKey(diff > 0 ? 'w' : 'q', Math.abs(diff));
      await sleep(3600);
      await waitForResult(4000);
      const rtext = await page.locator('[data-testid="result-text"]').innerText().catch(() => '');
      ok(`게임1 라운드2 종료 result-text: ${rtext.trim()}`);
      await shot('s9-game1-match-result');
    }
    // 매치 종료 → 메인
    if (await visible('btn-back-main')) { await page.click('[data-testid="btn-back-main"]'); }
  } else if (await visible('btn-back-main')) {
    await page.click('[data-testid="btn-back-main"]');
  }
  await page.locator('[data-testid="scr-main-in"]').waitFor({ timeout: 5000 });
  ok('게임1 종료 → 메인 복귀');

  // ============================================================= (i) 게임2
  console.log('\n== (i) 게임2 — 총알 피하기 (발사/이동 + 종료) ==');
  await page.click('[data-testid="scr-main-in"] [data-testid="btn-offline"]');
  await page.locator('[data-testid="scr-game-select"]').waitFor({ timeout: 5000 });
  await page.click('[data-testid="card-game2"]');
  await page.locator('[data-testid="scr-game2"]').waitFor({ timeout: 6000 });
  await assertScreen('scr-game2', 'S10');
  await mustVisible('game-stage', 'S10');
  await mustVisible('hud-countdown', 'S10');
  if (!(await waitForPlay(4000))) note('게임2 elapsedMs 필드 없음(다른 상태형) — DOM으로 진행');
  // 잠깐 플레이: P1 발사(w)/방향전환(q), P2 이동(u/i)
  for (let i = 0; i < 8; i++) {
    await tapKey('w', 1);       // 발사
    await tapKey(i % 2 ? 'u' : 'i', 1); // P2 이동
    if (i % 3 === 0) await tapKey('q', 1); // 방향 전환
    await sleep(500);
  }
  await shot('s10-game2-play');
  // 라운드 종료(6초 타임아웃) 대기
  const g2res = await waitForResult(9000);
  if (g2res) {
    const rtext = await page.locator('[data-testid="result-text"]').innerText().catch(() => '');
    ok(`게임2 라운드 종료 result-text: ${rtext.trim()}`);
  } else fail('S10', '게임2 라운드 종료(result-overlay) 안 뜸');
  await shot('s10-game2-result');
  // 메인 복귀
  if (await visible('btn-back-main')) await page.click('[data-testid="btn-back-main"]');
  else if (await visible('btn-exit')) await page.click('[data-testid="btn-exit"]');
  await page.locator('[data-testid="scr-main-in"]').waitFor({ timeout: 5000 });
  ok('게임2 종료 → 메인 복귀');

  // ============================================================= (j) 게임3
  console.log('\n== (j) 게임3 — 펜싱 (한쪽 공격 반복 → 링아웃) ==');
  await page.click('[data-testid="scr-main-in"] [data-testid="btn-offline"]');
  await page.locator('[data-testid="scr-game-select"]').waitFor({ timeout: 5000 });
  await page.click('[data-testid="card-game3"]');
  await page.locator('[data-testid="scr-game3"]').waitFor({ timeout: 6000 });
  await assertScreen('scr-game3', 'S12');
  await mustVisible('game-stage', 'S12');
  await mustVisible('hud-countdown', 'S12');
  if (!(await waitForPlay(4000))) note('게임3 elapsedMs>0 대기 실패 — 진행 계속');
  await shot('s12-game3-play');
  // P1만 공격(q) 반복 → P2(무행동) 밀려 링아웃
  let g3res = false;
  for (let i = 0; i < 8 && !g3res; i++) {
    await tapKey('q', 1);
    await sleep(1050);
    g3res = await page.locator('[data-testid="result-overlay"]').first().isVisible().catch(() => false);
  }
  if (!g3res) g3res = await waitForResult(4000);
  if (g3res) {
    const g = (await bridge())?.game;
    const rtext = await page.locator('[data-testid="result-text"]').innerText().catch(() => '');
    if (g?.resultReason === 'RING_OUT') ok(`게임3 링아웃 판정 (reason=${g.resultReason}, result=${g.result})`);
    else note(`게임3 종료했으나 reason=${g?.resultReason} result=${g?.result}`);
    ok(`result-text: ${rtext.trim()}`);
  } else fail('S12', '게임3 링아웃/종료(result-overlay) 안 뜸');
  await shot('s12-game3-result');

  // ============================================================= (k) 메인 복귀
  console.log('\n== (k) 메인 복귀 ==');
  if (await visible('btn-back-main')) await page.click('[data-testid="btn-back-main"]');
  else if (await visible('btn-exit')) await page.click('[data-testid="btn-exit"]');
  await page.locator('[data-testid="scr-main-in"]').waitFor({ timeout: 5000 });
  await assertScreen('scr-main-in', 'return');
  await shot('k-back-to-main');

  await browser.close();

  // ---- 요약 ----
  console.log('\n===== SUMMARY =====');
  console.log(`screenshots: ${shotN}, failures: ${failures.length}`);
  fs.writeFileSync(path.join(SHOT_DIR, '_result.json'), JSON.stringify({ failures, notes, shots: shotN }, null, 2));
  if (failures.length) { for (const f of failures) console.log(`FAIL ${f.screen}: ${f.detail}`); }
}

main().catch((e) => { console.error('WALK CRASHED:', e); process.exit(1); });
