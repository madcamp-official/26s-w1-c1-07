/**
 * QA round1 보충 프로브 — walk.mjs가 안 다룬 SPEC 체크리스트 항목들.
 *  - QA-S1-06/08 (비로그인 설정/오프라인), QA-S3-03/04, QA-S4-05 (기본값),
 *  - QA-S6-05/06/07/08/09 (복사/mock입장/코드참가/톱니/배경닫기),
 *  - QA-S10-10 (게임2 생존 타임아웃 → P2 승),
 *  - QA-S12-05/06/07/08/11 (게임3 상성 나머지/마지막입력/타임아웃 판정)
 * 실행: cd design-lab && node ideas/01-neo-brutal/qa/probe2.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'round2');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5101';
let shotNo = 22;
const results = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 832 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);

  const shot = async (name) => {
    shotNo += 1;
    const file = `${String(shotNo).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: join(OUT, file) });
    console.log(`  [shot] ${file}`);
  };
  const assert = (c, m) => {
    if (!c) throw new Error(`ASSERT FAIL: ${m}`);
  };
  const waitScreen = (id, timeout = 8000) =>
    page.waitForFunction((w) => window.__MADPUMP__?.screen === w, id, { timeout });
  const step = async (name, fn) => {
    console.log(`\n=== ${name} ===`);
    try {
      await fn();
      results.push({ name, ok: true });
      console.log('  OK');
    } catch (e) {
      results.push({ name, ok: false, error: String(e) });
      try {
        await page.screenshot({ path: join(OUT, `FAIL-${name.replace(/[^a-z0-9]+/gi, '_')}.png`) });
      } catch {}
      throw e;
    }
  };

  await page.goto(BASE);
  await page.waitForSelector('[data-testid="scr-main-out"]');

  // QA-S1-08: 비로그인 설정 모달
  await step('p1-S1-settings-logged-out', async () => {
    await page.click('[data-testid="btn-settings"]');
    await page.waitForSelector('[data-testid="modal-settings"]');
    await shot('s1-settings-logged-out');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="modal-settings"]', { state: 'detached' });
  });

  // QA-S1-06 + QA-S8-03: 비로그인 오프라인 → 게임 선택 도달 + 뒤로가기
  await step('p2-S1-offline-logged-out', async () => {
    await page.click('[data-testid="btn-offline"]');
    await waitScreen('scr-game-select');
    const loggedIn = await page.evaluate(() => window.__MADPUMP__.session.loggedIn);
    assert(!loggedIn, 'reached game select while logged out');
    await shot('s8-game-select-logged-out');
    await page.click('text=메인으로');
    await waitScreen('scr-main-out');
  });

  // QA-S3-04: 로그인 요구 모달 취소
  await step('p3-S3-cancel', async () => {
    await page.click('[data-testid="btn-online"]');
    await page.waitForSelector('[data-testid="modal-login-required"]');
    await page.click('[data-testid="modal-login-required"] >> text=취소하기');
    await page.waitForSelector('[data-testid="modal-login-required"]', { state: 'detached' });
    const scr = await page.evaluate(() => window.__MADPUMP__.screen);
    assert(scr === 'scr-main-out', `main stays after cancel (${scr})`);
  });

  // 로그인(최초) → 온보딩 완료 → S2
  await step('p4-login-onboard', async () => {
    await page.click('[data-testid="scr-main-out"] [data-testid="btn-google-login"]');
    await waitScreen('scr-onboarding');
    await page.fill('[data-testid="input-nickname"]', 'QA러너');
    await page.fill('#s5-group', '1분반');
    await page.click('[data-testid="btn-nickname-submit"]');
    await waitScreen('scr-main-in');
  });

  // QA-S4-05: 기본값 버튼 — 입력만 리셋, 모달 유지
  await step('p5-S4-defaults', async () => {
    await page.click('[data-testid="btn-settings"]');
    await page.waitForSelector('[data-testid="modal-settings"]');
    await page.fill('[aria-label="라운드 수"]', '5');
    await page.fill('[aria-label="라운드 당 시간"]', '40');
    await page.click('text=기본값');
    const r = await page.inputValue('[aria-label="라운드 수"]');
    const s = await page.inputValue('[aria-label="라운드 당 시간"]');
    assert(r === '3' && s === '60', `defaults restored r=${r} s=${s}`);
    const still = await page.$('[data-testid="modal-settings"]');
    assert(still, 'modal stays open');
    await shot('s4-defaults-restored');
    // 이후 게임 테스트용: 1라운드 / 25초 저장
    await page.fill('[aria-label="라운드 수"]', '1');
    await page.fill('[aria-label="라운드 당 시간"]', '25');
    await page.click('[data-testid="btn-settings-save"]');
    await page.waitForSelector('[data-testid="modal-settings"]', { state: 'detached' });
  });

  // QA-S2-06 + QA-S3-03: 로그아웃 → S1 / 모달 로그인(기존 유저) → S6 직행
  await step('p6-logout-then-modal-login-to-S6', async () => {
    await page.click('text=로그아웃');
    await waitScreen('scr-main-out');
    await page.click('[data-testid="btn-online"]');
    await page.waitForSelector('[data-testid="modal-login-required"]');
    await page.click('[data-testid="modal-login-required"] [data-testid="btn-google-login"]');
    await page.waitForSelector('[data-testid="modal-online"]', { timeout: 5000 });
    const sess = await page.evaluate(() => window.__MADPUMP__.session);
    assert(sess.loggedIn && sess.nickname === 'QA러너', `existing user session ${JSON.stringify(sess)}`);
    await shot('s3-login-direct-to-s6');
  });

  // QA-S6-08: 톱니 → 설정 모달 → 닫으면 온라인 패널 복귀
  await step('p7-S6-gear-settings', async () => {
    await page.click('[aria-label="방 설정"]');
    await page.waitForSelector('[data-testid="modal-settings"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="modal-online"]');
  });

  // QA-S6-05: 코드 생성 → 복사 → 클립보드 일치 + COPIED! 피드백
  // QA-S6-06: 생성 n초 후 mock 상대 입장 → 인게임
  await step('p8-S6-copy-and-mock-entry', async () => {
    await page.click('[data-testid="btn-code-create"]');
    const code = (await page.textContent('[data-testid="room-code-display"]')).trim();
    await page.click('text=복사');
    await page.waitForSelector('text=COPIED!', { timeout: 2000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip === code, `clipboard=${clip} code=${code}`);
    await shot('s6-copied');
    // 3초 후 mock 상대 입장 → 인게임 자동 전환
    await page.waitForFunction(
      () => /^scr-game[123]$/.test(window.__MADPUMP__?.screen ?? ''),
      undefined,
      { timeout: 8000 },
    );
    const scr = await page.evaluate(() => window.__MADPUMP__.screen);
    console.log(`  mock entry game: ${scr}`);
    await page.click('[data-testid="btn-exit"]');
    await waitScreen('scr-main-in');
  });

  // QA-S6-07: 코드 입력 → 확인 → 매칭 플로우 / 형식 오류 인라인 에러
  // QA-S6-09: 배경 클릭 닫기
  await step('p9-S6-join-and-backdrop', async () => {
    await page.click('[data-testid="btn-online"]');
    await page.waitForSelector('[data-testid="modal-online"]');
    await page.fill('[data-testid="input-code"]', 'abc');
    await page.click('[data-testid="btn-code-join"]');
    await page.waitForSelector('text=숫자만 입력 가능한 코드입니다');
    await shot('s6-join-format-error');
    await page.fill('[data-testid="input-code"]', '34823501249');
    await page.click('[data-testid="btn-code-join"]');
    await page.waitForSelector('[data-testid="modal-matching"]');
    await page.waitForSelector('[data-testid="btn-matching-cancel"]', { timeout: 4000 });
    await page.click('[data-testid="btn-matching-cancel"]');
    await page.waitForSelector('[data-testid="modal-online"]');
    // 배경(패널 밖) 클릭 → 닫힘
    await page.mouse.click(30, 416);
    await page.waitForSelector('[data-testid="modal-online"]', { state: 'detached' });
    const scr = await page.evaluate(() => window.__MADPUMP__.screen);
    assert(scr === 'scr-main-in', `back to main (${scr})`);
  });

  // QA-S10-10: 게임2 — 발사 없음, P2 생존 → 타임아웃 P2 승
  await step('p10-game2-survive-timeout', async () => {
    await page.click('[data-testid="btn-offline"]');
    await waitScreen('scr-game-select');
    await page.click('[data-testid="card-game2"]');
    await waitScreen('scr-game2');
    await page.waitForFunction(() => window.__MADPUMP__?.game != null, undefined, { timeout: 5000 });
    await page.waitForFunction(
      () => window.__MADPUMP__?.game?.result != null,
      undefined,
      { timeout: 32000 },
    );
    const r = await page.evaluate(() => window.__MADPUMP__.game.result);
    assert(r === 'P2_WIN', `survive timeout => P2_WIN (got ${r})`);
    await page.waitForSelector('[data-testid="result-overlay"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await shot('s10-game2-survive-p2win');
    await page.click('[data-testid="btn-back-main"]');
    await waitScreen('scr-main-in');
  });

  // QA-S12-05/06/07/08/11: 게임3 상성/마지막입력/타임아웃 판정
  await step('p11-game3-rules', async () => {
    await page.click('[data-testid="btn-offline"]');
    await waitScreen('scr-game-select');
    await page.click('[data-testid="card-game3"]');
    await waitScreen('scr-game3');
    await page.waitForFunction(() => window.__MADPUMP__?.game != null, undefined, { timeout: 5000 });
    // 인트로(2.3s) 종료 후 틱이 흐르기 시작할 때까지 대기
    await page.waitForFunction(
      () => (window.__MADPUMP__?.game?.elapsedMs ?? 0) > 100,
      undefined,
      { timeout: 8000 },
    );

    const tickCount = () => page.evaluate(() => window.__MADPUMP__.game.tickCount);
    const lastTick = () =>
      page.evaluate(() => {
        const t = window.__MADPUMP__.game.lastTick;
        return t ? { moves: t.moves, pushed: t.pushed } : null;
      });
    const waitTickAbove = async (n) => {
      await page.waitForFunction(
        (want) => (window.__MADPUMP__?.game?.tickCount ?? 0) > want,
        n,
        { timeout: 4000 },
      );
    };
    /** 다음 틱 윈도우 초입에 keys를 순서대로 입력하고 그 틱의 판정을 반환 */
    const playTick = async (keys) => {
      const n0 = await tickCount();
      await waitTickAbove(n0); // 새 윈도우 시작 (직전 윈도우 판정 직후)
      await page.waitForTimeout(120);
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(80);
      }
      const n1 = await tickCount();
      await waitTickAbove(n1);
      return lastTick();
    };

    // QA-S12-06: 무행동 vs 회피 → 회피 쪽 밀림 (P1=DODGE, P2=NONE → P1 밀림)
    let t = await playTick(['w']);
    assert(
      t.moves.P1 === 'DODGE' && t.moves.P2 === 'NONE' && t.pushed === 'P1',
      `dodge-vs-none => P1 pushed (got ${JSON.stringify(t)})`,
    );

    // QA-S12-05: 회피 vs 공격 → 공격 쪽 밀림 (P1=DODGE, P2=ATTACK → P2 밀림)
    t = await playTick(['w', 'u']);
    assert(
      t.moves.P1 === 'DODGE' && t.moves.P2 === 'ATTACK' && t.pushed === 'P2',
      `dodge-vs-attack => P2 pushed (got ${JSON.stringify(t)})`,
    );

    // QA-S12-07: 같은 행동(공/공) → 밀림 없음
    t = await playTick(['q', 'u']);
    assert(
      t.moves.P1 === 'ATTACK' && t.moves.P2 === 'ATTACK' && t.pushed === null,
      `attack-vs-attack => no push (got ${JSON.stringify(t)})`,
    );

    // QA-S12-08: 한 틱에 q→w 연속 입력 → 마지막 입력(회피)만 적용
    t = await playTick(['q', 'w']);
    assert(
      t.moves.P1 === 'DODGE',
      `last input adopted (got ${JSON.stringify(t)})`,
    );
    await shot('s12-game3-rules-ticks');

    // QA-S12-11: 이후 무입력 → 시간 종료 시 더 밀린 쪽(P1) 패배 = P2_WIN
    const dist = await page.evaluate(() => ({
      p1: window.__MADPUMP__.game.players.P1.distanceFromEdge,
      p2: window.__MADPUMP__.game.players.P2.distanceFromEdge,
    }));
    console.log(`  distances before timeout: ${JSON.stringify(dist)}`);
    assert(dist.p1 < dist.p2, `P1 more pushed (${JSON.stringify(dist)})`);
    await page.waitForFunction(
      () => window.__MADPUMP__?.game?.result != null,
      undefined,
      { timeout: 32000 },
    );
    const fin = await page.evaluate(() => ({
      result: window.__MADPUMP__.game.result,
      reason: window.__MADPUMP__.game.resultReason,
    }));
    assert(
      fin.result === 'P2_WIN' && fin.reason === 'TIMEOUT',
      `timeout => more-pushed loses (got ${JSON.stringify(fin)})`,
    );
    await page.waitForSelector('[data-testid="result-overlay"]', { timeout: 5000 });
    await page.waitForTimeout(700);
    await shot('s12-game3-timeout-p2win');
    await page.click('[data-testid="btn-back-main"]');
    await waitScreen('scr-main-in');
  });

  await browser.close();
}

main()
  .then(() => {
    console.log('\n===== PROBE2 SUMMARY =====');
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + r.error}`);
    process.exit(results.some((r) => !r.ok) ? 1 : 0);
  })
  .catch((e) => {
    console.error('\nPROBE2 FAILED:', e);
    console.log('\n===== PROBE2 SUMMARY =====');
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ' + r.error}`);
    process.exit(1);
  });
