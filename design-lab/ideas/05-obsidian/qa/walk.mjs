/**
 * QA walk — idea 05 OBSIDIAN PROTOCOL (round 1).
 * playwright chromium headless, 1280x832.
 * 실행: cd design-lab && node ideas/05-obsidian/qa/walk.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'round1');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5105';
const failures = [];
let shotIdx = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ok(cond, label, detail = '') {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    console.log(`  FAIL ${label} ${detail}`);
    failures.push({ label, detail });
  }
  return cond;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 832 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
page.on('pageerror', (e) => {
  failures.push({ label: 'pageerror', detail: String(e) });
  console.log('  PAGEERROR', e);
});

async function shot(name) {
  shotIdx += 1;
  const file = `${String(shotIdx).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  console.log(`  📸 ${file}`);
  return file;
}

const bridge = () => page.evaluate(() => window.__MADPUMP__ ?? null);

async function waitScreen(id, timeout = 8000) {
  try {
    await page.waitForFunction(
      (want) => window.__MADPUMP__?.screen === want,
      id,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitGame(pred, timeout = 10000, poll = 60) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await bridge();
    if (b?.game && pred(b.game)) return b.game;
    await sleep(poll);
  }
  return null;
}

try {
  // -------------------------------------------------------------------------
  // (a) S1 메인 비로그인
  // -------------------------------------------------------------------------
  console.log('\n[a] S1 main logged-out');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok(await waitScreen('scr-main-out'), 'bridge screen=scr-main-out');
  ok(await page.getByTestId('scr-main-out').isVisible(), 'scr-main-out visible');
  ok(await page.getByText('MADPUMP').first().isVisible(), 'MADPUMP title');
  ok(await page.getByTestId('btn-google-login').isVisible(), 'btn-google-login');
  ok(await page.getByTestId('btn-online').isVisible(), 'btn-online');
  ok(await page.getByTestId('btn-offline').isVisible(), 'btn-offline');
  ok(await page.getByTestId('btn-settings').isVisible(), 'btn-settings');
  {
    const b = await bridge();
    ok(b && b.session.loggedIn === false, 'session.loggedIn=false');
  }
  await shot('s1-main-out');

  // -------------------------------------------------------------------------
  // (b) btn-online → modal-login-required
  // -------------------------------------------------------------------------
  console.log('\n[b] login-required modal');
  await page.getByTestId('btn-online').click();
  ok(await page.getByTestId('modal-login-required').isVisible(), 'modal-login-required visible');
  ok(
    await page.getByText('온라인 게임은 로그인이 필요합니다!').isVisible(),
    'guard copy visible',
  );
  await shot('s3-login-required');

  // -------------------------------------------------------------------------
  // (c) btn-google-login → onboarding, 중복 → 에러, 유니크 → scr-main-in
  // -------------------------------------------------------------------------
  console.log('\n[c] google login → onboarding');
  await page.getByTestId('btn-google-login').click();
  ok(await waitScreen('scr-onboarding'), 'bridge screen=scr-onboarding');
  ok(await page.getByTestId('scr-onboarding').isVisible(), 'scr-onboarding visible');
  await shot('s5-onboarding');

  // 중복 닉네임 (mock 유저와 동일값 — '펌프광인')
  await page.getByTestId('input-nickname').fill('펌프광인');
  await page.locator('input[placeholder="예: 1분반"]').fill('1분반');
  await page.getByTestId('btn-nickname-submit').click();
  ok(await page.getByTestId('err-nickname-dup').isVisible(), 'err-nickname-dup (mock user dup)');
  await shot('s5-dup-error');

  // 수정 시 에러 해제
  await page.getByTestId('input-nickname').fill('옵시디언QA');
  ok(
    (await page.getByTestId('err-nickname-dup').count()) === 0,
    'dup error cleared on edit',
  );
  await page.getByTestId('btn-nickname-submit').click();
  ok(await waitScreen('scr-main-in'), 'bridge screen=scr-main-in');
  {
    const b = await bridge();
    ok(
      b && b.session.loggedIn === true && b.session.nickname === '옵시디언QA',
      'session synced',
      JSON.stringify(b?.session),
    );
  }
  // S3 경유 로그인 → 온보딩 후 온라인 패널 자동 오픈 (QA-S3-03 연장)
  const autoOnline = await page
    .getByTestId('modal-online')
    .isVisible()
    .catch(() => false);
  ok(autoOnline, 'online panel auto-opened after guard login (QA-S3-03)');
  await shot('s2-main-in-auto-online');
  if (autoOnline) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  // -------------------------------------------------------------------------
  // (d) 리더보드 lb-top3 / lb-myrank
  // -------------------------------------------------------------------------
  console.log('\n[d] leaderboard');
  ok(await page.getByTestId('lb-top3').isVisible(), 'lb-top3 visible');
  ok(await page.getByTestId('lb-myrank').isVisible(), 'lb-myrank visible');
  ok(
    (await page.getByTestId('lb-top3').locator('tr').count()) === 3,
    'top3 rows = 3',
  );
  ok(await page.getByText('옵시디언QA').first().isVisible(), 'my nickname in greet/lb');
  await shot('s2-main-in');

  // -------------------------------------------------------------------------
  // (e) 설정 모달 — 라운드 수 변경 저장 + 재오픈 유지
  // -------------------------------------------------------------------------
  console.log('\n[e] settings modal');
  await page.getByTestId('btn-settings').click();
  ok(await page.getByTestId('modal-settings').isVisible(), 'modal-settings visible');
  const roundsInput = page.locator('input[aria-label="라운드 수"]');
  const secsInput = page.locator('input[aria-label="라운드 당 시간"]');
  ok((await roundsInput.inputValue()) === '3', 'default rounds=3');
  ok((await secsInput.inputValue()) === '60', 'default secs=60');
  await roundsInput.fill('1');
  await secsInput.fill('15');
  await shot('s4-settings');
  await page.getByTestId('btn-settings-save').click();
  ok(
    (await page.getByTestId('modal-settings').count()) === 0,
    'settings closed after save',
  );
  // 재오픈 → 값 유지 (QA-S4-04)
  await page.getByTestId('btn-settings').click();
  ok((await roundsInput.inputValue()) === '1', 'rounds persisted =1');
  ok((await secsInput.inputValue()) === '15', 'secs persisted =15');
  await shot('s4-settings-reopen');
  await page.keyboard.press('Escape');
  await sleep(250);

  // -------------------------------------------------------------------------
  // (f) 온라인: quickstart → matching(취소) → quickstart → 봇 게임 → exit
  // -------------------------------------------------------------------------
  console.log('\n[f] online quickstart flow');
  await page.getByTestId('btn-online').click();
  ok(await page.getByTestId('modal-online').isVisible(), 'modal-online visible');
  ok(await page.getByTestId('btn-quickstart').isVisible(), 'btn-quickstart');
  ok(await page.getByTestId('btn-code-create').isVisible(), 'btn-code-create');
  ok(await page.getByTestId('input-code').isVisible(), 'input-code');
  ok(await page.getByTestId('btn-code-join').isVisible(), 'btn-code-join');
  ok(await page.getByTestId('room-code-display').isVisible(), 'room-code-display');
  await shot('s6-online-panel');

  await page.getByTestId('btn-quickstart').click();
  ok(await page.getByTestId('modal-matching').isVisible(), 'modal-matching visible');
  ok(
    await page.getByText('게임에 접속 중입니다').isVisible(),
    'connecting copy (QA-S7-01)',
  );
  await shot('s7-matching-connecting');
  // waiting 단계 (1.2초 후) — 취소 버튼
  await page
    .getByTestId('btn-matching-cancel')
    .waitFor({ state: 'visible', timeout: 3000 })
    .catch(() => {});
  ok(await page.getByTestId('btn-matching-cancel').isVisible(), 'btn-matching-cancel visible');
  ok(await page.getByText('플레이어 대기 중').isVisible(), 'waiting copy (QA-S7-02)');
  await shot('s7-matching-waiting');

  // 취소 → S6 복귀 + 매칭 성사 없음 (QA-S7-03/05)
  await page.getByTestId('btn-matching-cancel').click();
  ok(await page.getByTestId('modal-online').isVisible(), 'back to modal-online after cancel');
  await sleep(3500);
  {
    const b = await bridge();
    ok(
      b?.screen === 'scr-main-in' && b?.game === null,
      'no fake match after cancel (QA-S7-05)',
      `screen=${b?.screen}`,
    );
  }
  await shot('s6-after-cancel');

  // 다시 quickstart → 매칭 성사 → 인게임
  await page.getByTestId('btn-quickstart').click();
  await page.waitForFunction(
    () => /^scr-game[123]$/.test(window.__MADPUMP__?.screen ?? ''),
    null,
    { timeout: 10000 },
  );
  const onlineB = await bridge();
  const onlineGameScreen = onlineB?.screen;
  ok(
    /^scr-game[123]$/.test(onlineGameScreen ?? ''),
    `entered in-game (${onlineGameScreen})`,
  );
  ok(await page.getByTestId('hud-profile-p1').isVisible(), 'hud-profile-p1');
  ok(await page.getByTestId('hud-profile-p2').isVisible(), 'hud-profile-p2');
  ok(await page.getByTestId('hud-countdown').isVisible(), 'hud-countdown');
  ok(await page.getByTestId('game-stage').isVisible(), 'game-stage');
  ok(await page.getByTestId('btn-exit').isVisible(), 'btn-exit');
  // 내 닉네임이 HUD에 (온라인 = 나 vs 봇)
  ok(
    await page.getByText('옵시디언QA').first().isVisible(),
    'my nickname on online HUD',
  );
  await sleep(3800); // 카운트다운 지나 실제 플레이 프레임
  await shot(`online-ingame-${onlineGameScreen}`);
  await page.getByTestId('btn-exit').click();
  ok(await waitScreen('scr-main-in'), 'exit → scr-main-in');

  // 코드 생성 → 숫자 코드 표시 + 복사 + mock 상대 입장 (QA-S6-04/05/06)
  console.log('\n[f2] code room flow');
  await page.getByTestId('btn-online').click();
  await page.getByTestId('btn-code-create').click();
  const codeText = (await page.getByTestId('room-code-display').innerText()).trim();
  ok(/^\d{6}$/.test(codeText), `room code shown (${codeText})`);
  await page.getByRole('button', { name: '복사' }).click();
  await sleep(200);
  ok(
    await page.getByRole('button', { name: '복사됨' }).isVisible().catch(() => false),
    'copy feedback 복사됨',
  );
  await shot('s6-code-created');
  await page.waitForFunction(
    () => /^scr-game[123]$/.test(window.__MADPUMP__?.screen ?? ''),
    null,
    { timeout: 8000 },
  );
  ok(true, 'mock opponent joined → in-game (QA-S6-06)');
  await page.getByTestId('btn-exit').click();
  ok(await waitScreen('scr-main-in'), 'exit → scr-main-in (2)');

  // -------------------------------------------------------------------------
  // (g) btn-offline → scr-game-select
  // -------------------------------------------------------------------------
  console.log('\n[g] game select');
  await page.getByTestId('btn-offline').click();
  ok(await waitScreen('scr-game-select'), 'bridge screen=scr-game-select');
  ok(await page.getByTestId('card-game1').isVisible(), 'card-game1');
  ok(await page.getByTestId('card-game2').isVisible(), 'card-game2');
  ok(await page.getByTestId('card-game3').isVisible(), 'card-game3');
  await shot('s8-game-select');

  // -------------------------------------------------------------------------
  // (h) 게임1 — 타겟 맞추고 3초 유지 → result
  // -------------------------------------------------------------------------
  console.log('\n[h] game1');
  await page.getByTestId('card-game1').click();
  ok(await waitScreen('scr-game1'), 'bridge screen=scr-game1');
  let g1 = await waitGame((g) => g.gameId === 1, 8000);
  ok(!!g1, 'game1 state on bridge');
  if (g1) {
    ok(
      g1.players.P1.value !== g1.target && g1.players.P2.value !== g1.target,
      'start values != target (QA-S9-08)',
      JSON.stringify({ t: g1.target, p1: g1.players.P1.value, p2: g1.players.P2.value }),
    );
    // 키 입력 반응 확인: w 1회 → P1 +1 (클램프 아님 전제 확인)
    const before = g1.players.P1.value;
    const keyUp = before < 100;
    await page.keyboard.press(keyUp ? 'w' : 'q');
    const after = await waitGame(
      (g) => g.players.P1.value === before + (keyUp ? 1 : -1),
      2000,
      30,
    );
    ok(!!after, `P1 ${keyUp ? 'w→+1' : 'q→-1'} (QA-S9-06)`);
    // P2 u/i 반응
    const b2 = (await bridge()).game.players.P2.value;
    const up2 = b2 < 100;
    await page.keyboard.press(up2 ? 'i' : 'u');
    const after2 = await waitGame(
      (g) => g.players.P2.value === b2 + (up2 ? 1 : -1),
      2000,
      30,
    );
    ok(!!after2, `P2 ${up2 ? 'i→+1' : 'u→-1'} (QA-S9-07)`);

    // P1을 타겟으로 (최대 3회 보정 루프)
    for (let round = 0; round < 4; round++) {
      const cur = (await bridge()).game;
      if (!cur || cur.result !== null) break;
      const diff = cur.target - cur.players.P1.value;
      if (diff === 0) break;
      const key = diff > 0 ? 'w' : 'q';
      for (let i = 0; i < Math.abs(diff); i++) await page.keyboard.press(key);
      await sleep(150);
    }
    const matched = await waitGame((g) => g.derived.P1.matched, 3000, 40);
    ok(!!matched, 'P1 matched target');
    await shot('game1-playing-matched');
    // 3초 유지 → P1 승
    const done = await waitGame((g) => g.result !== null, 5000, 60);
    ok(done?.result === 'P1_WIN', `game1 result=P1_WIN (got ${done?.result})`);
  }
  ok(
    await page
      .getByTestId('result-overlay')
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false),
    'result-overlay visible',
  );
  ok(await page.getByTestId('result-text').isVisible(), 'result-text visible');
  await shot('game1-result');
  // roundCount=1 → 매치 종료 → btn-back-main
  ok(await page.getByTestId('btn-back-main').isVisible(), 'btn-back-main (match over)');
  await page.getByTestId('btn-back-main').click();
  ok(await waitScreen('scr-main-in'), 'back to main');

  // -------------------------------------------------------------------------
  // (i) 게임2 — 발사/이동 + 피격 또는 시간 종료
  // -------------------------------------------------------------------------
  console.log('\n[i] game2');
  await page.getByTestId('btn-offline').click();
  await waitScreen('scr-game-select');
  await page.getByTestId('card-game2').click();
  ok(await waitScreen('scr-game2'), 'bridge screen=scr-game2');
  // Game2State에는 gameId 필드가 없다 (attacker/dodger로 식별)
  let g2 = await waitGame((g) => g.attacker && g.elapsedMs > 0, 8000);
  ok(!!g2, 'game2 state ticking on bridge');
  if (g2) {
    // P2 이동 (i 홀드 300ms)
    const x0 = g2.dodger.x;
    await page.keyboard.down('i');
    await sleep(300);
    await page.keyboard.up('i');
    const moved = await waitGame((g) => g.dodger.x !== x0, 1500, 30);
    ok(!!moved, 'P2 moved with i (QA-S10-07)');
    // P1 방향 반전 확인
    const d0 = (await bridge()).game.attacker.dir;
    await page.keyboard.press('q');
    const turned = await waitGame((g) => g.attacker.dir === -d0, 1500, 30);
    ok(!!turned, 'P1 direction reversed with q (QA-S10-04)');
    // 발사 1회 → 총알 존재
    await page.keyboard.press('w');
    const fired = await waitGame((g) => g.bullets.length > 0, 2000, 30);
    ok(!!fired, 'bullet spawned with w (QA-S10-05)');
    await sleep(400);
    await shot('game2-playing');
    // 조준 사격 루프: 공격자가 회피자 위에 올 때 발사 (최대 20초)
    const t0 = Date.now();
    let result = null;
    while (Date.now() - t0 < 20000) {
      const s = (await bridge()).game;
      if (!s) break;
      if (s.result !== null) {
        result = s.result;
        break;
      }
      if (
        Math.abs(s.attacker.x - s.dodger.x) < 6 &&
        s.view.fireReadyRatio >= 1
      ) {
        await page.keyboard.press('w');
      }
      await sleep(60);
    }
    ok(
      result === 'P1_WIN' || result === 'P2_WIN',
      `game2 round ended (${result})`,
    );
  }
  ok(
    await page
      .getByTestId('result-overlay')
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false),
    'game2 result-overlay visible',
  );
  await shot('game2-result');
  await page.getByTestId('btn-back-main').click();
  ok(await waitScreen('scr-main-in'), 'back to main after game2');

  // -------------------------------------------------------------------------
  // (j) 게임3 — 한쪽만 공격 반복 → 링아웃
  // -------------------------------------------------------------------------
  console.log('\n[j] game3');
  await page.getByTestId('btn-offline').click();
  await waitScreen('scr-game-select');
  await page.getByTestId('card-game3').click();
  ok(await waitScreen('scr-game3'), 'bridge screen=scr-game3');
  let g3 = await waitGame((g) => g.gameId === 3 && g.elapsedMs > 0, 8000);
  ok(!!g3, 'game3 state ticking on bridge');
  let midShotDone = false;
  if (g3) {
    const t0 = Date.now();
    let final = null;
    while (Date.now() - t0 < 15000) {
      const s = (await bridge()).game;
      if (!s) break;
      if (s.result !== null) {
        final = s;
        break;
      }
      await page.keyboard.press('q'); // P1 공격 (P2 무행동 → P2 밀림)
      if (!midShotDone && s.players.P2.distanceFromEdge < 3) {
        await shot('game3-pushing');
        midShotDone = true;
      }
      await sleep(450);
    }
    ok(final?.result === 'P1_WIN', `game3 ring-out P1_WIN (got ${final?.result})`);
    ok(
      final?.resultReason === 'RING_OUT',
      `ring-out reason (got ${final?.resultReason})`,
    );
  }
  if (!midShotDone) await shot('game3-playing');
  ok(
    await page
      .getByTestId('result-overlay')
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false),
    'game3 result-overlay visible',
  );
  await shot('game3-result');

  // -------------------------------------------------------------------------
  // (k) 메인 복귀
  // -------------------------------------------------------------------------
  console.log('\n[k] back to main');
  await page.getByTestId('btn-back-main').click();
  ok(await waitScreen('scr-main-in'), 'final: scr-main-in');
  {
    const b = await bridge();
    ok(b?.game === null, 'bridge game=null after exit');
  }
  await shot('final-main');
} catch (err) {
  console.error('\nUNCAUGHT:', err);
  failures.push({ label: 'uncaught', detail: String(err) });
  await shot('ERROR-state').catch(() => {});
} finally {
  await browser.close();
}

console.log('\n==============================');
console.log(`failures: ${failures.length}`);
for (const f of failures) console.log(` - ${f.label} ${f.detail ?? ''}`);
process.exit(failures.length > 0 ? 1 : 0);
