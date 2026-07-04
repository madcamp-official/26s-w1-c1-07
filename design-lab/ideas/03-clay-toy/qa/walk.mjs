/**
 * QA walk — idea 03 "Clay Toy Battle" round 1.
 * playwright chromium headless, 1280x832.
 * 실행: cd design-lab && node ideas/03-clay-toy/qa/walk.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5103';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'round1');
fs.mkdirSync(OUT, { recursive: true });
// 이전 실행 산출물 정리
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

const results = [];
let shotN = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
  page.setDefaultTimeout(8000);

  const shot = async (label) => {
    shotN += 1;
    const file = `${String(shotN).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    console.log(`  [shot] ${file}`);
    return file;
  };

  const bridge = async () =>
    page.evaluate(() => {
      const b = window.__MADPUMP__ || null;
      if (!b) return null;
      return JSON.parse(
        JSON.stringify(
          { screen: b.screen, session: b.session, game: b.game },
          (k, v) => (typeof v === 'function' ? undefined : v),
        ),
      );
    });

  const waitBridge = async (pred, timeoutMs = 8000, poll = 100) => {
    const t0 = Date.now();
    for (;;) {
      const b = await bridge();
      if (b && pred(b)) return b;
      if (Date.now() - t0 > timeoutMs) return null;
      await page.waitForTimeout(poll);
    }
  };

  const visible = async (testid, timeout = 6000) => {
    try {
      await page.locator(`[data-testid="${testid}"]`).first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  };

  const tid = (id) => page.locator(`[data-testid="${id}"]`).first();

  try {
    // ── (a) S1 메인 비로그인 ────────────────────────────────────────────
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600); // 폰트/등장 애니메이션 안착

    check('a1. S1 scr-main-out 표시', await visible('scr-main-out'));
    const b0 = await bridge();
    check('a2. 브리지 screen=scr-main-out', b0?.screen === 'scr-main-out', `screen=${b0?.screen}`);
    check('a3. 브리지 session 비로그인', b0?.session?.loggedIn === false);
    check(
      'a4. S1 필수 버튼 4종 (online/offline/google/settings)',
      (await visible('btn-online', 2000)) &&
        (await visible('btn-offline', 2000)) &&
        (await visible('btn-google-login', 2000)) &&
        (await visible('btn-settings', 2000)),
    );
    const hasTitle = await page.getByText('MADPUMP', { exact: false }).first().isVisible().catch(() => false);
    check('a5. MADPUMP 타이틀 표시', hasTitle);
    await shot('s1-main-out');

    // ── (b) btn-online → 로그인 요구 모달 ──────────────────────────────
    await tid('btn-online').click();
    check('b1. modal-login-required 표시', await visible('modal-login-required'));
    const modalTxt = await tid('modal-login-required').innerText().catch(() => '');
    check('b2. 모달 문구 "로그인이 필요"', /로그인이 필요/.test(modalTxt), modalTxt.slice(0, 60));
    await page.waitForTimeout(400);
    await shot('s3-login-required');

    // ── (c) 모달 내 구글 로그인 → 온보딩 ───────────────────────────────
    await page
      .locator('[data-testid="modal-login-required"] [data-testid="btn-google-login"]')
      .click();
    check('c1. scr-onboarding 진입', await visible('scr-onboarding'));
    await page.waitForTimeout(400);
    await shot('s5-onboarding');

    // 중복 닉네임 (mock 유저와 동일값)
    await tid('input-nickname').fill('펌프광인');
    await tid('input-group').fill('1분반');
    await tid('btn-nickname-submit').click();
    let dupShown = await visible('err-nickname-dup', 2500);
    if (!dupShown) {
      // fallback: 와이어프레임 시나리오의 "test"
      await tid('input-nickname').fill('test');
      await tid('btn-nickname-submit').click();
      dupShown = await visible('err-nickname-dup', 2500);
      check('c2. 중복 닉네임 에러 (mock 유저값은 미차단, "test"만 차단)', dupShown, 'mock 닉네임 "펌프광인" 중복 미검출');
    } else {
      check('c2. 중복 닉네임 에러 표시 (펌프광인)', true);
    }
    await shot('s5-onboarding-dup-error');

    // 수정 시 에러 해제 (QA-S5-04)
    await tid('input-nickname').fill('클레이큐에이');
    const dupGone = !(await tid('err-nickname-dup').isVisible().catch(() => false));
    check('c3. 이름 수정 시 에러 해제', dupGone);

    // 유니크 닉네임 제출 → S2
    await tid('btn-nickname-submit').click();
    check('c4. scr-main-in 진입', await visible('scr-main-in'));
    const b1 = await bridge();
    check(
      'c5. 세션 로그인+닉네임 반영',
      b1?.session?.loggedIn === true && b1?.session?.nickname === '클레이큐에이',
      JSON.stringify(b1?.session),
    );
    const mainInTxt = await tid('scr-main-in').innerText().catch(() => '');
    check('c6. 인사말에 닉네임 표시', mainInTxt.includes('클레이큐에이'), mainInTxt.split('\n')[0]);
    await page.waitForTimeout(500);

    // ── (d) 리더보드 ────────────────────────────────────────────────────
    check('d1. lb-top3 표시', await visible('lb-top3'));
    check('d2. lb-myrank 표시', await visible('lb-myrank'));
    const lbTxt = await tid('lb-top3').innerText().catch(() => '');
    check('d3. TOP3에 수치(승률 % 등) 표시', /%/.test(lbTxt), lbTxt.replace(/\n/g, ' ').slice(0, 80));
    await shot('s2-main-in-leaderboard');

    // ── (e) 설정 모달: 라운드 수 변경 저장 ─────────────────────────────
    await tid('btn-settings').click();
    check('e1. modal-settings 표시', await visible('modal-settings'));
    await page.waitForTimeout(350);
    await shot('s4-settings');
    const roundsInput = page.locator('[data-testid="modal-settings"] input').first();
    await roundsInput.fill('2');
    await tid('btn-settings-save').click();
    await page.waitForTimeout(300);
    check('e2. 저장 후 모달 닫힘', !(await tid('modal-settings').isVisible().catch(() => false)));
    // 재오픈 검증 (QA-S4-04)
    await tid('btn-settings').click();
    await visible('modal-settings');
    const savedVal = await roundsInput.inputValue().catch(() => '');
    check('e3. 재오픈 시 라운드 수=2 유지', savedVal === '2', `value=${savedVal}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    if (await tid('modal-settings').isVisible().catch(() => false)) {
      await page.mouse.click(8, 8); // 배경 클릭 fallback
      await page.waitForTimeout(250);
    }
    check('e4. 설정 모달 닫기(ESC/배경)', !(await tid('modal-settings').isVisible().catch(() => false)));

    // ── (f) 온라인 빠른 시작 → 매칭 → 봇 게임 → 나가기 ────────────────
    await tid('btn-online').click();
    check('f1. 로그인 상태 온라인 → modal-online', await visible('modal-online'));
    await page.waitForTimeout(350);
    await shot('s6-online-panel');
    await tid('btn-quickstart').click();
    check('f2. modal-matching 표시', await visible('modal-matching'));
    const mtxt1 = await tid('modal-matching').innerText().catch(() => '');
    check('f3. 접속 중 문구', /접속 중/.test(mtxt1), mtxt1.replace(/\n/g, ' ').slice(0, 50));
    await shot('s7-matching-connecting');
    check('f4. 대기 단계 취소 버튼 등장', await visible('btn-matching-cancel', 4000));
    const mtxt2 = await tid('modal-matching').innerText().catch(() => '');
    check('f5. "플레이어 대기 중" 문구', /대기 중/.test(mtxt2), mtxt2.replace(/\n/g, ' ').slice(0, 50));
    await shot('s7-matching-waiting');
    const bGame = await waitBridge((b) => /^scr-game[123]$/.test(b.screen), 8000);
    check('f6. 매칭 성사 → 인게임 자동 전환', !!bGame, `screen=${bGame?.screen}`);
    await page.waitForTimeout(900);
    await shot(`online-${bGame?.screen ?? 'unknown'}`);
    // 봇 상대 프로필 확인
    check('f7. 인게임 HUD 프로필 2개', (await visible('hud-profile-p1')) && (await visible('hud-profile-p2')));
    await tid('btn-exit').click();
    check('f8. btn-exit → 메인 복귀', await visible('scr-main-in'));

    // ── (g) 오프라인 → 게임 선택 ───────────────────────────────────────
    await tid('btn-offline').click();
    check('g1. scr-game-select 진입', await visible('scr-game-select'));
    check(
      'g2. 게임 카드 3종',
      (await visible('card-game1')) && (await visible('card-game2')) && (await visible('card-game3')),
    );
    await page.waitForTimeout(500);
    await shot('s8-game-select');

    // 공통: 결과 오버레이 처리 (round-result → next, match-result → back)
    const handleOverlay = async (label) => {
      const ok = await visible('result-overlay', 9000);
      if (!ok) return { ok: false, done: true };
      await page.waitForTimeout(700); // 등장 스프링 + 컨페티
      await shot(label);
      const txt = await tid('result-text').innerText().catch(() => '');
      const hasNext = await tid('btn-next-round').isVisible().catch(() => false);
      if (hasNext) {
        await tid('btn-next-round').click();
        await page.waitForTimeout(400);
        return { ok: true, done: false, txt };
      }
      return { ok: true, done: true, txt };
    };

    // ── (h) 게임1: 숫자 맞추기 ──────────────────────────────────────────
    await tid('card-game1').click();
    check('h1. scr-game1 진입', await visible('scr-game1'));
    let g1 = await waitBridge((b) => b.screen === 'scr-game1' && b.game && b.game.gameId === 1, 6000);
    check('h2. 브리지 game1 state 확인', !!g1, g1 ? `target=${g1.game.target}` : 'game=null');
    if (g1) {
      const { target, players } = g1.game;
      check(
        'h3. 시작 숫자 ≠ 타겟 (QA-S9-08)',
        players.P1.value !== target && players.P2.value !== target,
        `target=${target} P1=${players.P1.value} P2=${players.P2.value}`,
      );
      check('h4. 타겟 1~100 범위', target >= 1 && target <= 100, `target=${target}`);
      // 카운트다운 감소 확인
      const t1 = g1.game.derived.timeRemainingMs;
      await page.waitForTimeout(1200);
      const g1b = await bridge();
      check(
        'h5. 카운트다운 감소 (QA-S9-05)',
        g1b?.game && g1b.game.derived.timeRemainingMs < t1,
        `${t1} → ${g1b?.game?.derived?.timeRemainingMs}`,
      );
      // P2를 u/i로 1스텝 움직여 조작 확인 (타겟 반대 방향으로)
      const p2v0 = g1b.game.players.P2.value;
      const p2key = g1b.game.target > p2v0 ? 'q' /*P1 down*/ : 'w';
      // P1 조작 확인: w 1회 → +1
      const p1v0 = g1b.game.players.P1.value;
      await page.keyboard.press('w');
      await page.waitForTimeout(250);
      let gNow = await bridge();
      check('h6. P1 w키 = +1 (QA-S9-06)', gNow.game.players.P1.value === Math.min(100, p1v0 + 1), `${p1v0} → ${gNow.game.players.P1.value}`);
      await page.keyboard.press('q');
      await page.waitForTimeout(250);
      gNow = await bridge();
      check('h7. P1 q키 = -1 (QA-S9-06)', gNow.game.players.P1.value === p1v0 || gNow.game.players.P1.value === Math.max(1, p1v0), `now=${gNow.game.players.P1.value}`);
      // P2 조작 확인: i 1회 → +1
      const p2i0 = gNow.game.players.P2.value;
      await page.keyboard.press('i');
      await page.waitForTimeout(250);
      gNow = await bridge();
      check('h8. P2 i키 = +1 (QA-S9-07)', gNow.game.players.P2.value === Math.min(100, p2i0 + 1), `${p2i0} → ${gNow.game.players.P2.value}`);
      await page.keyboard.press('u');
      await page.waitForTimeout(250);

      await shot('game1-playing');

      // 라운드 2회 (설정 라운드 수=2): P1을 타겟에 맞춰 3초 유지
      for (let round = 1; round <= 2; round++) {
        // 타겟에 수렴
        const tDrive = Date.now();
        for (;;) {
          const g = await bridge();
          if (!g?.game || g.game.gameId !== 1) break;
          const diff = g.game.target - g.game.players.P1.value;
          if (diff === 0) break;
          if (Date.now() - tDrive > 30000) break;
          const key = diff > 0 ? 'w' : 'q';
          const n = Math.min(Math.abs(diff), 15);
          for (let i = 0; i < n; i++) await page.keyboard.press(key, { delay: 0 });
          await page.waitForTimeout(60);
        }
        const gm = await bridge();
        check(
          `h9-r${round}. P1 숫자를 타겟에 일치`,
          gm?.game?.players?.P1?.value === gm?.game?.target,
          `target=${gm?.game?.target} P1=${gm?.game?.players?.P1?.value}`,
        );
        if (round === 1) {
          // holdMs 진행 확인 후 스크린샷 (홀드 게이지)
          await page.waitForTimeout(1200);
          const gh = await bridge();
          check('h10. 일치 유지 타이머 진행', (gh?.game?.players?.P1?.holdMs ?? 0) > 0, `holdMs=${gh?.game?.players?.P1?.holdMs}`);
          await shot('game1-holding');
        }
        // 3초 유지 → 결과
        const r = await handleOverlay(`game1-result-r${round}`);
        check(`h11-r${round}. 라운드${round} 결과 오버레이`, r.ok, r.txt ?? '');
        if (r.done) {
          check('h12. 매치 종료 오버레이 도달 (2라운드 반영)', round === 2, `round=${round}에서 종료`);
          break;
        }
        // 다음 라운드 시작 대기
        await waitBridge((b) => b.game && b.game.gameId === 1 && b.game.result === null, 5000);
      }
      // 메인 복귀
      if (await tid('btn-back-main').isVisible().catch(() => false)) {
        await tid('btn-back-main').click();
      }
      check('h13. 게임1 종료 후 메인 복귀', await visible('scr-main-in'));
    }

    // ── (i) 게임2: 총알 피하기 ──────────────────────────────────────────
    await tid('btn-offline').click();
    await visible('scr-game-select');
    await tid('card-game2').click();
    check('i1. scr-game2 진입', await visible('scr-game2'));
    let g2 = await waitBridge((b) => b.screen === 'scr-game2' && b.game && b.game.attacker, 6000);
    check('i2. 브리지 game2 state 확인', !!g2);
    if (g2) {
      // P2 이동 확인 (i 홀드)
      const dx0 = g2.game.dodger.x;
      await page.keyboard.down('i');
      await page.waitForTimeout(450);
      await page.keyboard.up('i');
      let gNow = await bridge();
      check('i3. P2 i키 우측 이동', gNow.game.dodger.x > dx0, `${dx0.toFixed(1)} → ${gNow.game.dodger.x.toFixed(1)}`);
      // P1 방향 반전 확인 (q)
      const dir0 = gNow.game.attacker.dir;
      await page.keyboard.press('q');
      await page.waitForTimeout(250);
      gNow = await bridge();
      check('i4. P1 q키 방향 반전', gNow.game.attacker.dir === -dir0, `${dir0} → ${gNow.game.attacker.dir}`);
      // 발사 (w) → 총알 생성
      await page.keyboard.press('w');
      await page.waitForTimeout(300);
      gNow = await bridge();
      check('i5. P1 w키 발사 → 총알 존재', (gNow.game.bullets?.length ?? 0) > 0, `bullets=${gNow.game.bullets?.length}`);
      await shot('game2-playing');

      // 라운드 진행: 계속 발사해 피격 유도 (P2 정지). 라운드 2회.
      for (let round = 1; round <= 2; round++) {
        const t0 = Date.now();
        let ended = false;
        while (Date.now() - t0 < 70000) {
          const g = await bridge();
          if (!g?.game || g.game.result !== null || g.screen !== 'scr-game2') {
            ended = true;
            break;
          }
          await page.keyboard.press('w');
          await page.waitForTimeout(180);
        }
        const gEnd = await bridge();
        check(`i6-r${round}. 라운드${round} 종료 (피격 또는 시간종료)`, ended, `result=${gEnd?.game?.result}`);
        const r = await handleOverlay(`game2-result-r${round}`);
        check(`i7-r${round}. 라운드${round} 결과 오버레이`, r.ok, r.txt ?? '');
        if (r.done) break;
        await waitBridge((b) => b.game && b.game.result === null, 5000);
      }
      if (await tid('btn-back-main').isVisible().catch(() => false)) await tid('btn-back-main').click();
      check('i8. 게임2 종료 후 메인 복귀', await visible('scr-main-in'));
    }

    // ── (j) 게임3: 펜싱 — 한쪽만 공격 반복 → 링아웃 ────────────────────
    await tid('btn-offline').click();
    await visible('scr-game-select');
    await tid('card-game3').click();
    check('j1. scr-game3 진입', await visible('scr-game3'));
    let g3 = await waitBridge((b) => b.screen === 'scr-game3' && b.game && b.game.gameId === 3, 6000);
    check('j2. 브리지 game3 state 확인', !!g3, g3 ? `P2 dist=${g3.game.players.P2.distanceFromEdge}` : '');
    if (g3) {
      check('j3. 시작 3칸 배치 (QA-S12-09)', g3.game.players.P1.distanceFromEdge === 3 && g3.game.players.P2.distanceFromEdge === 3);
      let midShotDone = false;
      for (let round = 1; round <= 2; round++) {
        const t0 = Date.now();
        let ended = false;
        while (Date.now() - t0 < 40000) {
          const g = await bridge();
          if (!g?.game || g.game.result !== null || g.screen !== 'scr-game3') {
            ended = true;
            break;
          }
          if (!midShotDone && g.game.players.P2.distanceFromEdge < 3) {
            check('j4. P1 공격 반복 → P2 밀림', true, `P2 dist=${g.game.players.P2.distanceFromEdge}`);
            await shot('game3-pushed');
            midShotDone = true;
          }
          await page.keyboard.press('q'); // P1 공격
          await page.waitForTimeout(280);
        }
        const gEnd = await bridge();
        check(`j5-r${round}. 라운드${round} 링아웃 종료`, ended, `result=${gEnd?.game?.result} reason=${gEnd?.game?.resultReason}`);
        const r = await handleOverlay(`game3-result-r${round}`);
        check(`j6-r${round}. 라운드${round} 결과 오버레이`, r.ok, r.txt ?? '');
        if (r.done) break;
        await waitBridge((b) => b.game && b.game.gameId === 3 && b.game.result === null, 5000);
      }
      if (!midShotDone) check('j4. P1 공격 반복 → P2 밀림', false, '밀림 관측 실패');
      if (await tid('btn-back-main').isVisible().catch(() => false)) await tid('btn-back-main').click();
    }

    // ── (k) 메인 복귀 ───────────────────────────────────────────────────
    check('k1. 최종 메인 복귀', await visible('scr-main-in'));
    const bEnd = await bridge();
    check('k2. 브리지 screen=scr-main-in', bEnd?.screen === 'scr-main-in', `screen=${bEnd?.screen}`);
    await page.waitForTimeout(400);
    await shot('final-main-in');
  } catch (err) {
    console.error('WALK ERROR:', err);
    check('zz. 워크 도중 예외 없음', false, String(err).slice(0, 200));
    try {
      await shot('error-state');
    } catch {}
  } finally {
    const fails = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`\n==== ${results.length} checks, ${fails.length} failures ====`);
    for (const f of fails) console.log(`FAIL: ${f.name} — ${f.detail}`);
    await browser.close();
  }
}

main();
