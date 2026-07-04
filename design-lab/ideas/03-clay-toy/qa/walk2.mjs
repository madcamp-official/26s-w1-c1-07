/**
 * QA walk 2 — 보충 커버리지 (SPEC 체크리스트 잔여 항목).
 * S3 취소 / S5 빈값 / S2 로그아웃 / 재로그인 S2 직행 / S4 기본값 /
 * S6 코드 생성·복사·mock 입장·코드 참가·톱니·배경닫기 / S7 취소+타이머 정리 /
 * S8 뒤로가기 / S9 홀드 리셋 / S10 총알 속도 랜덤 / S12 상성(회피>공격, 동일행동)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5103';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'round1');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let shotN = 22; // walk.mjs 이후 이어서 번호

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 832 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);

  const shot = async (label) => {
    shotN += 1;
    const file = `${String(shotN).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    console.log(`  [shot] ${file}`);
    return file;
  };
  const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
  const visible = async (testid, timeout = 6000) => {
    try {
      await tid(testid).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  };
  const bridge = async () =>
    page.evaluate(() => {
      const b = window.__MADPUMP__ || null;
      if (!b) return null;
      return JSON.parse(
        JSON.stringify({ screen: b.screen, session: b.session, game: b.game }, (k, v) =>
          typeof v === 'function' ? undefined : v,
        ),
      );
    });

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await visible('scr-main-out');

    // ── S1 설정 버튼 (QA-S1-08) + S4 기본값 (QA-S4-05) ──────────────────
    await tid('btn-settings').click();
    check('x1. S1 설정 → modal-settings (QA-S1-08)', await visible('modal-settings'));
    const roundsInput = page.locator('[data-testid="modal-settings"] input').first();
    const secsInput = page.locator('[data-testid="modal-settings"] input').nth(1);
    await roundsInput.fill('5');
    await secsInput.fill('99');
    await page.getByRole('button', { name: '기본값' }).click();
    const rv = await roundsInput.inputValue();
    const sv = await secsInput.inputValue();
    check('x2. 기본값 버튼 → 3/60 복원+모달 유지 (QA-S4-05)', rv === '3' && sv === '60' && (await tid('modal-settings').isVisible()), `${rv}/${sv}`);
    await shot('extra-settings-default');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // ── S3 취소하기 (QA-S3-04) ───────────────────────────────────────────
    await tid('btn-online').click();
    await visible('modal-login-required');
    await page.getByRole('button', { name: '취소하기' }).click();
    await page.waitForTimeout(350);
    check(
      'x3. S3 취소 → 모달 닫힘+메인 유지 (QA-S3-04)',
      !(await tid('modal-login-required').isVisible().catch(() => false)) && (await visible('scr-main-out', 2000)),
    );

    // ── 헤더 구글 로그인 → 온보딩: 빈값 제출 방지 (QA-S5-05) ────────────
    await tid('btn-google-login').click();
    await visible('scr-onboarding');
    await tid('btn-nickname-submit').click().catch(() => {});
    await page.waitForTimeout(400);
    const stillOnboarding = await tid('scr-onboarding').isVisible();
    check('x4. 빈값 제출 방지 (QA-S5-05)', stillOnboarding);
    await tid('input-nickname').fill('말랑테스터');
    await tid('input-group').fill('2분반');
    await tid('btn-nickname-submit').click();
    check('x5. 온보딩 통과 → S2', await visible('scr-main-in'));

    // ── 로그아웃 (QA-S2-06) → 재로그인 시 온보딩 스킵 (기존 유저 → S2) ──
    await page.getByRole('button', { name: '로그아웃' }).click();
    check('x6. 로그아웃 → S1 (QA-S2-06)', await visible('scr-main-out'));
    await tid('btn-google-login').click();
    await page.waitForTimeout(1200);
    const afterRelogin = (await bridge())?.screen;
    check('x7. 재로그인 → 기존 유저 S2 직행 (QA-S1-07)', afterRelogin === 'scr-main-in', `screen=${afterRelogin}`);

    // ── S6 코드 생성/복사/mock 입장 (QA-S6-04·05·06) ────────────────────
    await tid('btn-online').click();
    await visible('modal-online');
    await tid('btn-code-create').click();
    await page.waitForTimeout(1500); // 구슬 목걸이 등장 연출
    const codeTxt = (await tid('room-code-display').innerText()).replace(/\s/g, '');
    check('x8. 코드 생성 → 숫자 코드 표시 (QA-S6-04)', /^\d{4,}$/.test(codeTxt), `code=${codeTxt}`);
    await shot('extra-room-code');
    await page.getByRole('button', { name: '복사' }).click();
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check('x9. 복사 → 클립보드 일치 (QA-S6-05)', clip.replace(/\s/g, '') === codeTxt, `clip=${clip}`);
    const toastVisible = await page.getByText(/복사/).nth(1).isVisible().catch(() => false);
    check('x10. 복사됨 피드백 표시 (QA-S6-05)', toastVisible || (await page.locator('.toast, [class*=toast]').first().isVisible().catch(() => false)));
    await shot('extra-copy-toast');
    // mock 상대 입장 → 인게임 (QA-S6-06)
    const t0 = Date.now();
    let entered = null;
    while (Date.now() - t0 < 12000) {
      const b = await bridge();
      if (/^scr-game[123]$/.test(b?.screen ?? '')) {
        entered = b.screen;
        break;
      }
      await page.waitForTimeout(250);
    }
    check('x11. 코드 생성 후 mock 상대 입장 → 인게임 (QA-S6-06)', !!entered, `screen=${entered}`);
    if (entered) {
      await visible('btn-exit');
      await tid('btn-exit').click();
      await visible('scr-main-in');
    }

    // ── S6 코드 입력 참가 (QA-S6-07) + S7 취소 (QA-S7-03·05) ───────────
    await tid('btn-online').click();
    await visible('modal-online');
    await tid('input-code').fill('123456');
    await tid('btn-code-join').click();
    check('x12. 코드 참가 → 매칭 플로우 (QA-S6-07)', await visible('modal-matching'));
    check('x13. 매칭 취소 버튼 (waiting)', await visible('btn-matching-cancel', 4000));
    await tid('btn-matching-cancel').click();
    await page.waitForTimeout(300);
    check('x14. 취소 → S6 복귀 (QA-S7-03)', await visible('modal-online', 3000));
    // 취소 후 5초 대기 — 유령 매칭 성사 금지 (QA-S7-05)
    await page.waitForTimeout(5000);
    const bGhost = await bridge();
    check('x15. 취소 후 유령 매칭 없음 (QA-S7-05)', bGhost?.screen === 'scr-main-in' && (await tid('modal-online').isVisible()), `screen=${bGhost?.screen}`);

    // ── S6 톱니 → 설정 (QA-S6-08), 배경 클릭 닫기 (QA-S6-09) ────────────
    const gear = page.locator('[data-testid="modal-online"] button[aria-label*="설정"], [data-testid="modal-online"] [class*=gear], [data-testid="modal-online"] button:has(svg)').last();
    await gear.click().catch(() => {});
    const gearOpened = await visible('modal-settings', 2500);
    check('x16. S6 톱니 → 설정 모달 (QA-S6-08)', gearOpened);
    if (gearOpened) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    // 설정 닫으면 S6으로 복귀하는 구현 — S6가 열려 있으면 배경 클릭으로 닫기
    if (await tid('modal-online').isVisible().catch(() => false)) {
      await page.mouse.click(15, 415);
      await page.waitForTimeout(350);
    }
    check('x17. 배경 클릭 → 패널 닫힘 (QA-S6-09)', !(await tid('modal-online').isVisible().catch(() => false)) && (await visible('scr-main-in', 2000)));

    // ── S8 뒤로가기 (QA-S8-04) ──────────────────────────────────────────
    await tid('btn-offline').click();
    await visible('scr-game-select');
    await page.getByRole('button', { name: /메인으로/ }).or(page.getByText('메인으로')).first().click();
    check('x18. S8 뒤로가기 → 메인 (QA-S8-04)', await visible('scr-main-in'));

    // ── 게임1 홀드 리셋 (QA-S9-10) ──────────────────────────────────────
    await tid('btn-offline').click();
    await visible('scr-game-select');
    await tid('card-game1').click();
    await visible('scr-game1');
    await page.waitForTimeout(600);
    // P1을 타겟에 맞춤
    for (let iter = 0; iter < 60; iter++) {
      const g = await bridge();
      if (!g?.game) break;
      const diff = g.game.target - g.game.players.P1.value;
      if (diff === 0) break;
      const key = diff > 0 ? 'w' : 'q';
      for (let i = 0; i < Math.min(Math.abs(diff), 15); i++) await page.keyboard.press(key, { delay: 0 });
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1100);
    const gHold = await bridge();
    const holdBefore = gHold?.game?.players?.P1?.holdMs ?? 0;
    await page.keyboard.press('w'); // 일치 이탈
    await page.waitForTimeout(300);
    const gAfter = await bridge();
    check(
      'x19. 일치 이탈 시 홀드 리셋 (QA-S9-10)',
      holdBefore > 800 && (gAfter?.game?.players?.P1?.holdMs ?? 99999) === 0,
      `before=${Math.round(holdBefore)} after=${gAfter?.game?.players?.P1?.holdMs}`,
    );
    await tid('btn-exit').click();
    await visible('scr-main-in');

    // ── 게임2 총알 속도 랜덤 (QA-S10-08) ────────────────────────────────
    await tid('btn-offline').click();
    await visible('scr-game-select');
    await tid('card-game2').click();
    await visible('scr-game2');
    await page.waitForTimeout(600);
    const vys = new Set();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('w');
      await page.waitForTimeout(500);
      const g = await bridge();
      for (const b of g?.game?.bullets ?? []) vys.add(b.vy);
      if (g?.game?.result) break;
    }
    check('x20. 총알 낙하 속도 랜덤 (QA-S10-08)', vys.size >= 2, `speeds=${[...vys].map((v) => v.toFixed(1)).join(',')}`);
    await tid('btn-exit').click();
    await visible('scr-main-in');

    // ── 게임3 상성: 공격 vs 회피 → 공격자 밀림 (QA-S12-05), 동일 행동 무밀림 (QA-S12-07)
    await tid('btn-offline').click();
    await visible('scr-game-select');
    await tid('card-game3').click();
    await visible('scr-game3');
    let g3 = await bridge();
    // 한 틱: P1 공격(q) + P2 회피(i) → P1 밀림
    const waitTick = async (prevCount) => {
      const t = Date.now();
      while (Date.now() - t < 3000) {
        const g = await bridge();
        if ((g?.game?.tickCount ?? 0) > prevCount) return g;
        await page.waitForTimeout(80);
      }
      return bridge();
    };
    g3 = await bridge();
    let tc = g3?.game?.tickCount ?? 0;
    await page.keyboard.press('q');
    await page.keyboard.press('i');
    let gT = await waitTick(tc);
    let lt = gT?.game?.lastTick;
    check(
      'x21. 공격 vs 회피 → 공격자 밀림 (QA-S12-05)',
      lt && lt.moves.P1 === 'ATTACK' && lt.moves.P2 === 'DODGE' && lt.pushed === 'P1',
      JSON.stringify(lt?.moves) + ` pushed=${lt?.pushed}`,
    );
    await shot('extra-game3-attack-vs-dodge');
    // 한 틱: 양쪽 공격 → 무밀림 (clash)
    tc = gT?.game?.tickCount ?? tc + 1;
    await page.keyboard.press('q');
    await page.keyboard.press('u');
    gT = await waitTick(tc);
    lt = gT?.game?.lastTick;
    check(
      'x22. 동일 행동(공/공) → 무밀림 (QA-S12-07)',
      lt && lt.moves.P1 === 'ATTACK' && lt.moves.P2 === 'ATTACK' && lt.pushed === null && lt.clash === true,
      JSON.stringify(lt?.moves) + ` pushed=${lt?.pushed} clash=${lt?.clash}`,
    );
    // 마지막 입력 채택 (QA-S12-08): 같은 윈도우에 q→w 연속 입력 → DODGE 채택
    tc = gT?.game?.tickCount ?? tc + 1;
    await page.keyboard.press('q');
    await page.keyboard.press('w');
    gT = await waitTick(tc);
    lt = gT?.game?.lastTick;
    check('x23. 틱 내 마지막 입력 채택 (QA-S12-08)', lt && lt.moves.P1 === 'DODGE', JSON.stringify(lt?.moves));
    await tid('btn-exit').click();
    check('x24. 종료 후 메인 복귀', await visible('scr-main-in'));
  } catch (err) {
    console.error('WALK2 ERROR:', err);
    check('zz2. 보충 워크 도중 예외 없음', false, String(err).slice(0, 200));
    try {
      await shot('extra-error-state');
    } catch {}
  } finally {
    const fails = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results-extra.json'), JSON.stringify(results, null, 2));
    console.log(`\n==== extra: ${results.length} checks, ${fails.length} failures ====`);
    for (const f of fails) console.log(`FAIL: ${f.name} — ${f.detail}`);
    await browser.close();
  }
}

main();
