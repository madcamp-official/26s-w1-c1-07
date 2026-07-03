/**
 * QA round2 자동 워크스루 — idea 01 neo-brutal (dev :5101)
 * 실행: cd design-lab && node ideas/01-neo-brutal/qa/walk.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'round2');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5101';
let shotNo = 0;
const results = [];

function log(...a) {
  console.log(...a);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
  page.setDefaultTimeout(8000);

  const shot = async (name) => {
    shotNo += 1;
    const file = `${String(shotNo).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: join(OUT, file) });
    log(`  [shot] ${file}`);
    return file;
  };

  const mp = () =>
    page.evaluate(() => {
      const b = window.__MADPUMP__;
      return b ? { screen: b.screen, session: b.session, hasGame: b.game != null } : null;
    });

  const gameEval = (fnBody) => page.evaluate(`(() => { const g = window.__MADPUMP__.game; ${fnBody} })()`);

  const waitScreen = async (id, timeout = 8000) => {
    await page.waitForFunction(
      (want) => window.__MADPUMP__ && window.__MADPUMP__.screen === want,
      id,
      { timeout },
    );
  };

  const assert = (cond, msg) => {
    if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  };

  const step = async (name, fn) => {
    log(`\n=== ${name} ===`);
    try {
      await fn();
      results.push({ name, ok: true });
      log(`  OK`);
    } catch (e) {
      results.push({ name, ok: false, error: String(e) });
      try {
        await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^a-z0-9]+/gi, '_')}.png`) });
      } catch {}
      throw e;
    }
  };

  // ---------------------------------------------------------------- (a) S1
  await step('a-S1-main-logged-out', async () => {
    await page.goto(BASE);
    await page.waitForSelector('[data-testid="scr-main-out"]');
    const b = await mp();
    assert(b && b.screen === 'scr-main-out', `screen=${b?.screen}`);
    assert(!b.session.loggedIn, 'should be logged out');
    await page.waitForSelector('[data-testid="btn-online"]');
    await page.waitForSelector('[data-testid="btn-offline"]');
    await page.waitForSelector('[data-testid="btn-google-login"]');
    await page.waitForSelector('[data-testid="btn-settings"]');
    const title = await page.textContent('[data-testid="scr-main-out"]');
    assert(/MADPUMP/i.test(title), 'MADPUMP title visible');
    await shot('s1-main-out');
  });

  // ------------------------------------------------- (b) login-required modal
  await step('b-S3-login-required-modal', async () => {
    await page.click('[data-testid="btn-online"]');
    await page.waitForSelector('[data-testid="modal-login-required"]');
    const txt = await page.textContent('[data-testid="modal-login-required"]');
    assert(/로그인이 필요합니다/.test(txt), 'guard message');
    await shot('s3-login-required');
  });

  // ------------------------------------------------- (c) google login → onboarding
  await step('c-S5-onboarding-dup-then-unique', async () => {
    await page.click('[data-testid="modal-login-required"] [data-testid="btn-google-login"]');
    await waitScreen('scr-onboarding');
    await page.waitForSelector('[data-testid="scr-onboarding"]');
    await shot('s5-onboarding-empty');

    // 중복 닉네임 (mock 유저와 동일값)
    await page.fill('[data-testid="input-nickname"]', '펌프광인');
    await page.fill('#s5-group', '1분반');
    await page.click('[data-testid="btn-nickname-submit"]');
    await page.waitForSelector('[data-testid="err-nickname-dup"]');
    const err = await page.textContent('[data-testid="err-nickname-dup"]');
    assert(/이미 사용하고 있는 이름입니다/.test(err), `err text=${err}`);
    await shot('s5-onboarding-dup-error');

    // 수정 시 에러 해제
    await page.fill('[data-testid="input-nickname"]', 'QA러너');
    const errGone = await page.$('[data-testid="err-nickname-dup"]');
    assert(!errGone, 'error cleared on edit');

    // 유니크 닉네임 제출 → S2
    await page.click('[data-testid="btn-nickname-submit"]');
    await waitScreen('scr-main-in');
    const b = await mp();
    assert(b.session.loggedIn && b.session.nickname === 'QA러너', `session=${JSON.stringify(b.session)}`);
    const greet = await page.textContent('[data-testid="scr-main-in"]');
    assert(greet.includes('QA러너'), 'greeting contains nickname');
    await shot('s2-main-in');
  });

  // ------------------------------------------------- (d) leaderboard (+ V-1 회귀 검증)
  await step('d-S2-leaderboard', async () => {
    await page.waitForSelector('[data-testid="lb-top3"]');
    await page.waitForSelector('[data-testid="lb-myrank"]');
    const top3 = await page.textContent('[data-testid="lb-top3"]');
    assert(top3.length > 0, 'top3 non-empty');
    const myrank = await page.textContent('[data-testid="lb-myrank"]');
    assert(myrank.length > 0, 'myrank non-empty');
    // V-1 회귀: 스크롤 0 상태에서 lb-myrank가 뷰포트(832px) 안에 완전히 들어와야 함
    const vis = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="lb-myrank"]');
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, scrollY: window.scrollY, vh: window.innerHeight, docH: document.documentElement.scrollHeight };
    });
    log(`  lb-myrank rect: top=${vis.top.toFixed(1)} bottom=${vis.bottom.toFixed(1)} vh=${vis.vh} docH=${vis.docH} scrollY=${vis.scrollY}`);
    assert(vis.scrollY === 0, 'no scroll applied');
    assert(vis.bottom <= vis.vh && vis.top >= 0, `V-1 regression: lb-myrank fully in viewport (bottom=${vis.bottom.toFixed(1)} vh=${vis.vh})`);
    await shot('s2-leaderboard');
  });

  // ------------------------------------------------- (e) settings modal
  await step('e-S4-settings-change-rounds', async () => {
    await page.click('[data-testid="btn-settings"]');
    await page.waitForSelector('[data-testid="modal-settings"]');
    await shot('s4-settings-open');
    // 라운드 수 3 → 2, 라운드 당 시간 60 → 25
    await page.fill('[aria-label="라운드 수"]', '2');
    await page.fill('[aria-label="라운드 당 시간"]', '25');
    await page.click('[data-testid="btn-settings-save"]');
    await page.waitForSelector('[data-testid="modal-settings"]', { state: 'detached' });
    // 재오픈해 저장 유지 확인 (QA-S4-04)
    await page.click('[data-testid="btn-settings"]');
    await page.waitForSelector('[data-testid="modal-settings"]');
    const rounds = await page.inputValue('[aria-label="라운드 수"]');
    const secs = await page.inputValue('[aria-label="라운드 당 시간"]');
    assert(rounds === '2' && secs === '25', `persisted rounds=${rounds} secs=${secs}`);
    await shot('s4-settings-persisted');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="modal-settings"]', { state: 'detached' });
  });

  // ------------------------------------------------- (f) online quickstart → matching → bot game
  await step('f-S6-S7-online-matching', async () => {
    await page.click('[data-testid="btn-online"]');
    await page.waitForSelector('[data-testid="modal-online"]');
    await shot('s6-online-panel');

    // 코드 생성 확인 (QA-S6-04)
    await page.click('[data-testid="btn-code-create"]');
    const code = await page.textContent('[data-testid="room-code-display"]');
    assert(/\d{6,}/.test(code.replace(/\D/g, '')), `room code=${code}`);
    await shot('s6-room-code');

    // 빠른 시작 → matching modal (connecting → waiting)
    await page.click('[data-testid="btn-quickstart"]');
    await page.waitForSelector('[data-testid="modal-matching"]');
    const t1 = await page.textContent('[data-testid="modal-matching"]');
    assert(/접속 중/.test(t1), `connecting text: ${t1.slice(0, 60)}`);
    await page.waitForSelector('[data-testid="btn-matching-cancel"]', { timeout: 4000 });
    const t2 = await page.textContent('[data-testid="modal-matching"]');
    assert(/대기 중/.test(t2), 'waiting text');
    await shot('s7-matching-waiting');

    // 취소 → S6 복귀, 매칭 성사 안 됨 (QA-S7-03/05)
    await page.click('[data-testid="btn-matching-cancel"]');
    await page.waitForSelector('[data-testid="modal-online"]');
    await page.waitForTimeout(4500);
    const b1 = await mp();
    assert(b1.screen === 'scr-main-in' && !b1.hasGame, `after cancel screen=${b1.screen} hasGame=${b1.hasGame}`);
    const stillOnline = await page.$('[data-testid="modal-online"]');
    assert(stillOnline, 'online panel still open after cancel');

    // 다시 빠른 시작 → 매칭 성사 → 봇 게임 진입
    await page.click('[data-testid="btn-quickstart"]');
    await page.waitForFunction(
      () => /^scr-game[123]$/.test(window.__MADPUMP__?.screen ?? ''),
      undefined,
      { timeout: 15000 },
    );
    const b2 = await mp();
    log(`  online game screen: ${b2.screen}`);
    await page.waitForTimeout(2600); // 인트로 지나 플레이 장면 캡쳐
    await shot(`online-ingame-${b2.screen}`);
    // 프로필/카운트다운/exit 확인
    await page.waitForSelector('[data-testid="hud-profile-p1"]');
    await page.waitForSelector('[data-testid="hud-profile-p2"]');
    await page.waitForSelector('[data-testid="hud-countdown"]');
    const hud = await page.textContent('[data-testid="hud-profile-p1"]');
    assert(hud.length > 0, 'p1 profile text');
    await page.click('[data-testid="btn-exit"]');
    await waitScreen('scr-main-in');
  });

  // ------------------------------------------------- (g) offline → game select
  await step('g-S8-game-select', async () => {
    await page.click('[data-testid="btn-offline"]');
    await waitScreen('scr-game-select');
    await page.waitForSelector('[data-testid="card-game1"]');
    await page.waitForSelector('[data-testid="card-game2"]');
    await page.waitForSelector('[data-testid="card-game3"]');
    await shot('s8-game-select');
  });

  // ------------------------------------------------- (h) game1 full play
  const playGame1Round = async ({ testHoldReset }) => {
    // 상태 읽기
    const read = () =>
      gameEval(
        'return { target: g.target, p1: g.players.P1.value, p2: g.players.P2.value, hold: g.players.P1.holdMs, result: g.result, remain: g.derived.timeRemainingMs };',
      );
    await page.waitForFunction(() => window.__MADPUMP__?.game != null, undefined, { timeout: 5000 });
    let s = await read();
    log(`  game1 target=${s.target} p1=${s.p1} p2=${s.p2}`);
    assert(s.p1 !== s.target && s.p2 !== s.target, 'start values differ from target (QA-S9-08)');

    // 카운트다운 감소 확인 (QA-S9-05)
    const r0 = s.remain;
    await page.waitForTimeout(1100);
    s = await read();
    assert(s.remain < r0, `countdown decreasing ${r0} -> ${s.remain}`);

    // 키 조작 방향 확인 (QA-S9-06/07): w=+1, q=-1 / i=+1, u=-1
    const before = await read();
    await page.keyboard.press('w');
    await page.waitForTimeout(120);
    let after = await read();
    assert(after.p1 === Math.min(100, before.p1 + 1), `w increments p1 ${before.p1}->${after.p1}`);
    await page.keyboard.press('q');
    await page.waitForTimeout(120);
    after = await read();
    assert(after.p1 === before.p1, `q decrements p1 back to ${before.p1} (got ${after.p1})`);
    await page.keyboard.press('i');
    await page.waitForTimeout(120);
    after = await read();
    assert(after.p2 === Math.min(100, before.p2 + 1), `i increments p2 ${before.p2}->${after.p2}`);
    await page.keyboard.press('u');
    await page.waitForTimeout(120);
    after = await read();
    assert(after.p2 === before.p2, `u decrements p2 back`);

    // P1을 타겟으로 이동 (배치 입력 → 실제 state 재확인 반복)
    s = await read();
    let guard = 0;
    while (s.p1 !== s.target && guard < 40) {
      const diff = s.target - s.p1;
      const key = diff > 0 ? 'w' : 'q';
      const n = Math.min(Math.abs(diff), 10);
      for (let i = 0; i < n; i++) await page.keyboard.press(key);
      await page.waitForTimeout(150);
      s = await read();
      guard += 1;
    }
    assert(s.p1 === s.target, `p1 reached target (p1=${s.p1} target=${s.target})`);

    if (testHoldReset) {
      // 1초 유지 후 이탈 → holdMs 리셋 (QA-S9-10)
      await page.waitForTimeout(1000);
      s = await read();
      assert(s.hold >= 800, `holdMs accumulating (${s.hold})`);
      await page.keyboard.press('w'); // 일치 이탈
      await page.waitForTimeout(150);
      s = await read();
      assert(s.hold === 0, `holdMs reset on mismatch (${s.hold})`);
      await page.keyboard.press('q'); // 재일치
      await page.waitForTimeout(150);
      s = await read();
      assert(s.p1 === s.target, 're-matched');
    }

    // 3초 유지 → P1 승리
    await page.waitForFunction(
      () => window.__MADPUMP__?.game?.result != null,
      undefined,
      { timeout: 6000 },
    );
    const result = await gameEval('return g.result;');
    assert(result === 'P1_WIN', `round result=${result}`);
  };

  await step('h-S9-game1-play', async () => {
    await page.click('[data-testid="card-game1"]');
    await waitScreen('scr-game1');
    await page.waitForTimeout(400);
    await shot('s9-game1-start');

    await playGame1Round({ testHoldReset: true });
    await page.waitForSelector('[data-testid="result-overlay"]');
    await page.waitForTimeout(700); // stamp-in/ro-in 애니메이션 안정화
    const rt = await page.textContent('[data-testid="result-text"]');
    log(`  round1 result-text: ${rt}`);
    await shot('s9-game1-round-result');

    // 라운드 수 2 반영 확인 (QA-S4-06): 다음 라운드 버튼 존재 → 라운드 2 진행
    await page.waitForSelector('[data-testid="btn-next-round"]');
    await page.click('[data-testid="btn-next-round"]');
    await page.waitForSelector('[data-testid="result-overlay"]', { state: 'detached' });
    await playGame1Round({ testHoldReset: false });
    await page.waitForSelector('[data-testid="result-overlay"]');
    await page.waitForTimeout(700);
    const mt = await page.textContent('[data-testid="result-text"]');
    log(`  match result-text: ${mt}`);
    const nextBtn = await page.$('[data-testid="btn-next-round"]');
    assert(!nextBtn, 'no next-round button on match result (2 rounds done)');
    await shot('s9-game1-match-result');
    await page.click('[data-testid="btn-back-main"]');
    await waitScreen('scr-main-in');
  });

  // ------------------------------------------------- (i) game2 play
  await step('i-S10-game2-play', async () => {
    await page.click('[data-testid="btn-offline"]');
    await waitScreen('scr-game-select');
    await page.click('[data-testid="card-game2"]');
    await waitScreen('scr-game2');
    await page.waitForFunction(() => window.__MADPUMP__?.game != null, undefined, { timeout: 5000 });
    await page.waitForTimeout(1700); // 인트로(1.5s) 종료

    // P1 방향 반전 (QA-S10-04)
    const dir0 = await gameEval('return g.attacker.dir;');
    await page.keyboard.press('q');
    await page.waitForTimeout(200);
    const dir1 = await gameEval('return g.attacker.dir;');
    assert(dir0 !== dir1, `TURN flips dir ${dir0}->${dir1}`);

    // P2 이동 (QA-S10-07)
    const dx0 = await gameEval('return g.dodger.x;');
    await page.keyboard.down('u');
    await page.waitForTimeout(400);
    await page.keyboard.up('u');
    const dx1 = await gameEval('return g.dodger.x;');
    assert(dx1 < dx0, `u moves dodger left ${dx0}->${dx1}`);
    await page.keyboard.down('i');
    await page.waitForTimeout(400);
    await page.keyboard.up('i');
    const dx2 = await gameEval('return g.dodger.x;');
    assert(dx2 > dx1, `i moves dodger right ${dx1}->${dx2}`);

    // 발사 반복 + 총알 속도 랜덤 수집 (QA-S10-05/08)
    const vys = new Set();
    let midShotDone = false;
    for (let k = 0; k < 60; k++) {
      await page.keyboard.press('w');
      await page.waitForTimeout(300);
      const st = await gameEval(
        'return { vys: g.bullets.map(b => Math.round(b.vy * 100) / 100), n: g.bullets.length, result: g.result };',
      );
      st.vys.forEach((v) => vys.add(v));
      if (!midShotDone && st.n >= 2) {
        midShotDone = true;
        await shot('s10-game2-bullets');
      }
      if (st.result != null) break;
    }
    assert(vys.size >= 2, `bullet speeds random (distinct vy=${vys.size})`);

    // 결과 대기 (피격 P1_WIN 또는 25초 타임아웃 P2_WIN)
    await page.waitForFunction(
      () => window.__MADPUMP__?.game?.result != null,
      undefined,
      { timeout: 30000 },
    );
    const result = await gameEval('return g.result;');
    log(`  game2 round result: ${result}`);
    assert(result === 'P1_WIN' || result === 'P2_WIN', `result=${result}`);
    await page.waitForSelector('[data-testid="result-overlay"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await shot('s10-game2-round-result');
    await page.click('[data-testid="btn-back-main"]');
    await waitScreen('scr-main-in');
  });

  // ------------------------------------------------- (j) game3 play (링아웃)
  await step('j-S12-game3-ringout', async () => {
    await page.click('[data-testid="btn-offline"]');
    await waitScreen('scr-game-select');
    await page.click('[data-testid="card-game3"]');
    await waitScreen('scr-game3');
    await page.waitForFunction(() => window.__MADPUMP__?.game != null, undefined, { timeout: 5000 });
    await page.waitForTimeout(2500); // 인트로 2.3s

    const d0 = await gameEval('return g.players.P2.distanceFromEdge;');
    assert(d0 === 3, `P2 starts 3 cells from edge (got ${d0}) (QA-S12-09)`);

    // P1만 공격 연타 → P2(무행동) 밀림 → 링아웃
    let midShot = false;
    let result = null;
    for (let k = 0; k < 40; k++) {
      await page.keyboard.press('q');
      await page.waitForTimeout(320);
      const st = await gameEval(
        'return { d2: g.players.P2.distanceFromEdge, result: g.result, reason: g.resultReason, ticks: g.tickCount };',
      );
      if (!midShot && st.d2 < d0) {
        midShot = true;
        await shot('s12-game3-pushed');
      }
      if (st.result != null) {
        result = st;
        break;
      }
    }
    assert(result, 'game3 ended');
    log(`  game3 result=${result.result} reason=${result.reason}`);
    assert(result.result === 'P1_WIN' && result.reason === 'RING_OUT', `ringout P1 win (got ${JSON.stringify(result)})`);
    await page.waitForSelector('[data-testid="result-overlay"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await shot('s12-game3-round-result');

    // (k) 메인 복귀
    await page.click('[data-testid="btn-back-main"]');
    await waitScreen('scr-main-in');
    const b = await mp();
    assert(!b.hasGame, 'debug game cleared after exit');
    await shot('final-main-in');
  });

  await browser.close();
}

main()
  .then(() => {
    log('\n===== SUMMARY =====');
    for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + r.error}`);
    const fails = results.filter((r) => !r.ok);
    process.exit(fails.length ? 1 : 0);
  })
  .catch((e) => {
    console.error('\nWALK FAILED:', e);
    log('\n===== SUMMARY =====');
    for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + r.error}`);
    process.exit(1);
  });
