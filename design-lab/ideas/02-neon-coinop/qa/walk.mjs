/**
 * QA round2 walkthrough — idea 02 NEON COIN-OP (port 5102).
 * Run from design-lab root:  node ideas/02-neon-coinop/qa/walk.mjs
 * round1 대비 추가: V-1/V-2/V-3 시각 이슈 회귀 probe.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'round2');
mkdirSync(DIR, { recursive: true });

const BASE = 'http://localhost:5102';
const failures = [];
let shotNo = 0;

const pad = (n) => String(n).padStart(2, '0');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 832 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);

  const shot = async (name, { settle = 600 } = {}) => {
    // 신스웨이브 sign-on 플리커(400ms)가 끝난 정상 상태를 찍기 위한 안정화 대기
    if (settle > 0) await page.waitForTimeout(settle);
    shotNo += 1;
    const file = `${pad(shotNo)}-${name}.png`;
    await page.screenshot({ path: join(DIR, file) });
    console.log(`  [shot] ${file}`);
    return file;
  };

  const fail = async (step, detail) => {
    console.error(`  [FAIL] ${step}: ${detail}`);
    failures.push({ step, detail });
    try {
      await shot(`ERR-${step.replace(/[^a-zA-Z0-9가-힣-]/g, '_').slice(0, 40)}`);
    } catch {}
  };

  const step = async (name, fn) => {
    console.log(`STEP: ${name}`);
    try {
      await fn();
    } catch (e) {
      await fail(name, String(e && e.message ? e.message : e).split('\n')[0]);
    }
  };

  const bridge = (expr) => page.evaluate(expr);
  const screenIs = (id) =>
    page.waitForFunction((s) => window.__MADPUMP__?.screen === s, id, { timeout: 8000 });
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const visible = async (tid) => {
    const el = page.locator(`[data-testid="${tid}"]`);
    await el.first().waitFor({ state: 'visible', timeout: 8000 });
    return el.first();
  };
  const click = async (tid) => (await visible(tid)).click();

  /** 실패한 스텝 뒤에도 다음 스텝이 메인(S2)에서 시작하도록 복구 (goto는 세션이 날아가 최후수단) */
  const ensureMainIn = async () => {
    const scr = await page.evaluate(() => window.__MADPUMP__?.screen ?? '');
    if (scr === 'scr-main-in') return;
    if (await page.locator('[data-testid="btn-back-main"]').count()) {
      await page.locator('[data-testid="btn-back-main"]').click();
    } else if (await page.locator('[data-testid="btn-exit"]').count()) {
      await page.locator('[data-testid="btn-exit"]').click();
    }
    await screenIs('scr-main-in');
  };

  // ── (a) S1 main logged-out ────────────────────────────────────────────
  await step('a-S1-main-out', async () => {
    await page.goto(BASE);
    await screenIs('scr-main-out');
    await visible('scr-main-out');
    await visible('btn-google-login');
    await visible('btn-online');
    await visible('btn-offline');
    await visible('btn-settings');
    const title = await page.locator('main').innerText();
    assert(/MAD\s*PUMP/i.test(title.replace(/\n/g, '')), 'MADPUMP title missing on S1');
    // V-1 회귀: 히어로 로고 font-size가 화면별 지정값(대형)으로 살아 있어야 한다
    const logoPx = await page.evaluate(() => {
      const el = document.querySelector('.s1-logo') || document.querySelector('[class*="logo"]');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
    console.log(`  [V-1 probe] hero logo font-size = ${logoPx}px`);
    assert(logoPx !== null && logoPx >= 40, `V-1 regression: hero logo font-size ${logoPx}px < 40px`);
    await shot('s1-main-out');
  });

  // S1 settings modal (QA-S1-08 / S4 look)
  await step('a2-S1-settings-modal', async () => {
    await click('btn-settings');
    await visible('modal-settings');
    await shot('s4-settings-on-s1');
    await page.keyboard.press('Escape');
    await page
      .locator('[data-testid="modal-settings"]')
      .waitFor({ state: 'detached', timeout: 4000 });
  });

  // ── (b) online → login-required modal ────────────────────────────────
  await step('b-login-required-modal', async () => {
    await click('btn-online');
    await visible('modal-login-required');
    const txt = await page.locator('[data-testid="modal-login-required"]').innerText();
    assert(txt.includes('로그인이 필요합니다'), 'login-required copy missing');
    await shot('s3-login-required');
  });

  // ── (c) google login → onboarding, dup nickname, unique nickname ─────
  await step('c1-google-login-to-onboarding', async () => {
    // btn-google-login exists on both S1 header and the modal — click the modal one
    await page
      .locator('[data-testid="modal-login-required"] [data-testid="btn-google-login"]')
      .click();
    await screenIs('scr-onboarding');
    await visible('scr-onboarding');
    await shot('s5-onboarding');
  });

  await step('c2-dup-nickname-error', async () => {
    await page.locator('[data-testid="input-nickname"]').fill('펌프광인'); // mock user u1
    await page.locator('#onboarding-group').fill('1분반');
    await click('btn-nickname-submit');
    await visible('err-nickname-dup');
    const err = await page.locator('[data-testid="err-nickname-dup"]').innerText();
    assert(err.includes('이미 사용하고 있는 이름'), 'dup error text wrong: ' + err);
    await shot('s5-dup-error');
  });

  await step('c3-unique-nickname-to-main-in', async () => {
    await page.locator('[data-testid="input-nickname"]').fill('네온검객');
    // error must clear on edit (QA-S5-04)
    const errGone =
      (await page.locator('[data-testid="err-nickname-dup"]').count()) === 0;
    assert(errGone, 'dup error did not clear after edit');
    await click('btn-nickname-submit');
    await screenIs('scr-main-in');
    const s = await bridge('window.__MADPUMP__.session');
    assert(s.loggedIn && s.nickname === '네온검객', 'session nickname mismatch: ' + JSON.stringify(s));
    const greet = await page.locator('main').innerText();
    assert(greet.includes('네온검객'), 'greeting missing nickname');
  });

  // ── (d) leaderboard ───────────────────────────────────────────────────
  await step('d-leaderboard', async () => {
    await visible('lb-top3');
    await visible('lb-myrank');
    // V-3 회귀: 내 등수 서수 표기 (1ST/2ND/3RD/4TH…, "3TH" 금지)
    const meTxt = await page.locator('[data-testid="lb-myrank"]').innerText();
    console.log(`  [V-3 probe] myrank = "${meTxt.replace(/\n/g, ' ')}"`);
    assert(!/\b[123]TH\b/.test(meTxt), 'V-3 regression: bad ordinal in myrank: ' + meTxt);
    await shot('s2-main-in-leaderboard');
  });

  // ── (e) settings: change round count and save ────────────────────────
  await step('e-settings-save-rounds', async () => {
    await click('btn-settings');
    await visible('modal-settings');
    await page.locator('input[aria-label="라운드 수"]').fill('1');
    await shot('s4-settings-edit');
    await click('btn-settings-save');
    await page
      .locator('[data-testid="modal-settings"]')
      .waitFor({ state: 'detached', timeout: 4000 });
    // reopen — value persisted (QA-S4-04)
    await click('btn-settings');
    await visible('modal-settings');
    const v = await page.locator('input[aria-label="라운드 수"]').inputValue();
    assert(v === '1', `round count not persisted (got ${v})`);
    await shot('s4-settings-persisted');
    // default button restores values but keeps modal open (QA-S4-05)
    await page.locator('button:has-text("기본값")').click();
    const dv = await page.locator('input[aria-label="라운드 수"]').inputValue();
    assert(dv === '3', `default restore failed (got ${dv})`);
    await visible('modal-settings');
    // set back to 1 round for fast games, save
    await page.locator('input[aria-label="라운드 수"]').fill('1');
    await click('btn-settings-save');
    await page
      .locator('[data-testid="modal-settings"]')
      .waitFor({ state: 'detached', timeout: 4000 });
  });

  // ── (f) online quickstart → matching → bot game → exit ───────────────
  await step('f1-online-panel', async () => {
    await click('btn-online');
    await visible('modal-online');
    await visible('btn-quickstart');
    await visible('btn-code-create');
    await visible('room-code-display');
    await visible('input-code');
    await visible('btn-code-join');
    await shot('s6-online-panel');
  });

  await step('f2-quickstart-matching', async () => {
    await click('btn-quickstart');
    await visible('modal-matching');
    const t1 = await page.locator('[data-testid="modal-matching"]').innerText();
    assert(t1.includes('접속 중'), 'connecting copy missing: ' + t1.slice(0, 80));
    await shot('s7-matching-connecting');
    await visible('btn-matching-cancel'); // waiting phase
    const t2 = await page.locator('[data-testid="modal-matching"]').innerText();
    assert(t2.includes('대기 중'), 'waiting copy missing: ' + t2.slice(0, 80));
    await shot('s7-matching-waiting');
  });

  await step('f3-bot-game-enter-exit', async () => {
    await page.waitForFunction(
      () => (window.__MADPUMP__?.screen || '').startsWith('scr-game'),
      null,
      { timeout: 12000 },
    );
    const scr = await bridge('window.__MADPUMP__.screen');
    await page.waitForFunction(() => window.__MADPUMP__?.game !== null, null, { timeout: 5000 });
    await visible('hud-profile-p1');
    await visible('hud-profile-p2');
    await visible('hud-countdown');
    await visible('game-stage');
    // opponent bot nickname should appear in HUD
    const hud = await page.locator('[data-testid="hud-profile-p2"]').innerText();
    console.log(`  online game=${scr}, P2 HUD="${hud.replace(/\n/g, ' ')}"`);
    await page.waitForTimeout(1200);
    await shot(`online-ingame-${scr}`);
    if (await page.locator('[data-testid="result-overlay"]').count()) {
      await click('btn-back-main');
    } else {
      await click('btn-exit');
    }
    await screenIs('scr-main-in');
  });

  // extra: code create + copy + mock join (QA-S6-04/05/06)
  await step('f4-code-create-copy-join', async () => {
    await click('btn-online');
    await visible('modal-online');
    await click('btn-code-create');
    const codeTxt = (await page.locator('[data-testid="room-code-display"]').innerText()).trim();
    assert(/^\d{6,}$/.test(codeTxt), 'room code not numeric: ' + codeTxt);
    await page.locator('button:has-text("복사")').click();
    await page.locator('text=COPIED!').waitFor({ timeout: 3000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    assert(clip === codeTxt, `clipboard mismatch (${clip} vs ${codeTxt})`);
    await shot('s6-code-created-copied');
    // mock opponent joins after 2.5s → in-game
    await page.waitForFunction(
      () => (window.__MADPUMP__?.screen || '').startsWith('scr-game'),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);
    await shot('online-ingame-via-code');
    if (await page.locator('[data-testid="result-overlay"]').count()) {
      await click('btn-back-main');
    } else {
      await click('btn-exit');
    }
    await screenIs('scr-main-in');
  });

  // extra: code join → matching → cancel, no ghost match (QA-S6-07, S7-03/05, S6-09)
  await step('f5-code-join-and-cancel', async () => {
    await click('btn-online');
    await visible('modal-online');
    await page.locator('[data-testid="input-code"]').fill('34823501249');
    await click('btn-code-join');
    await visible('modal-matching');
    await visible('btn-matching-cancel');
    await click('btn-matching-cancel');
    await visible('modal-online'); // back to S6
    await shot('s7-cancel-back-to-s6');
    await page.waitForTimeout(4000); // ghost match must NOT fire
    const scr = await bridge('window.__MADPUMP__.screen');
    assert(!scr.startsWith('scr-game'), 'ghost match fired after cancel');
    assert(await page.locator('[data-testid="modal-online"]').count(), 'online panel gone');
    // backdrop click closes panel (QA-S6-09)
    await page.mouse.click(20, 20);
    await page
      .locator('[data-testid="modal-online"]')
      .waitFor({ state: 'detached', timeout: 4000 });
    await screenIs('scr-main-in');
  });

  // ── (g) offline → game select ─────────────────────────────────────────
  await step('g-game-select', async () => {
    await click('btn-offline');
    await screenIs('scr-game-select');
    await visible('card-game1');
    await visible('card-game2');
    await visible('card-game3');
    await shot('s8-game-select');
  });

  // ── (h) game1: converge to target, hold-reset check, hold 3s → win ───
  await step('h-game1', async () => {
    await click('card-game1');
    await screenIs('scr-game1');
    await page.waitForFunction(
      () => window.__MADPUMP__?.game && window.__MADPUMP__.game.gameId === 1,
      null,
      { timeout: 5000 },
    );
    const g0 = await bridge(`(() => {
      const g = window.__MADPUMP__.game;
      return { target: g.target, p1: g.players.P1.value, p2: g.players.P2.value,
               remain: g.derived.timeRemainingMs };
    })()`);
    console.log(`  game1 target=${g0.target} p1=${g0.p1} p2=${g0.p2}`);
    assert(g0.p1 !== g0.target && g0.p2 !== g0.target, 'start value equals target (QA-S9-08)');
    // countdown decreases (QA-S9-05)
    await page.waitForTimeout(1200);
    const r1 = await bridge('window.__MADPUMP__.game.derived.timeRemainingMs');
    assert(r1 < g0.remain, 'countdown not decreasing');
    await shot('s9-game1-start');

    // key sanity: w=+1, q=-1 for P1 (QA-S9-06)
    const before = await bridge('window.__MADPUMP__.game.players.P1.value');
    await page.keyboard.press(before >= 100 ? 'q' : 'w');
    await page.waitForTimeout(150);
    const after = await bridge('window.__MADPUMP__.game.players.P1.value');
    assert(after === before + (before >= 100 ? -1 : 1), `P1 key step wrong (${before}→${after})`);
    // P2 keys (QA-S9-07)
    const b2 = await bridge('window.__MADPUMP__.game.players.P2.value');
    await page.keyboard.press(b2 >= 100 ? 'u' : 'i');
    await page.waitForTimeout(150);
    const a2 = await bridge('window.__MADPUMP__.game.players.P2.value');
    assert(a2 === b2 + (b2 >= 100 ? -1 : 1), `P2 key step wrong (${b2}→${a2})`);

    // converge P1 to target
    for (let round = 0; round < 8; round++) {
      const { target, v } = await bridge(
        '(() => ({ target: window.__MADPUMP__.game.target, v: window.__MADPUMP__.game.players.P1.value }))()',
      );
      const delta = target - v;
      if (delta === 0) break;
      const key = delta > 0 ? 'w' : 'q';
      for (let i = 0; i < Math.abs(delta); i++) await page.keyboard.press(key);
      await page.waitForTimeout(250);
    }
    let m = await bridge(
      '(() => { const g = window.__MADPUMP__.game; return { match: g.players.P1.value === g.target }; })()',
    );
    assert(m.match, 'failed to converge P1 to target');

    // hold ~1.2s then break match → holdMs must reset (QA-S9-10)
    await page.waitForTimeout(1200);
    const holdMid = await bridge('window.__MADPUMP__.game.players.P1.holdMs');
    assert(holdMid > 800, `holdMs not accruing (${holdMid})`);
    await page.keyboard.press('w'); // break
    await page.waitForTimeout(200);
    const holdReset = await bridge('window.__MADPUMP__.game.players.P1.holdMs');
    assert(holdReset < 200, `holdMs not reset after mismatch (${holdReset})`);
    await page.keyboard.press('q'); // re-match
    await page.waitForTimeout(300);
    await shot('s9-game1-holding');

    // hold 3s → P1 wins round → (roundCount=1) match result overlay
    await page.waitForFunction(() => window.__MADPUMP__.game.result !== null, null, {
      timeout: 8000,
    });
    const res = await bridge('window.__MADPUMP__.game.result');
    assert(res === 'P1_WIN', `expected P1_WIN, got ${res}`);
    await visible('result-overlay');
    await visible('result-text');
    await shot('s9-game1-result');
    await click('btn-back-main');
    await screenIs('scr-main-in');
  });

  // ── (i) game2: move/turn/fire, bullet randomness, hit → result ───────
  await step('i-game2', async () => {
    await ensureMainIn();
    await click('btn-offline');
    await screenIs('scr-game-select');
    await click('card-game2');
    await screenIs('scr-game2');
    await page.waitForFunction(
      () => window.__MADPUMP__?.game && window.__MADPUMP__.game.bullets !== undefined,
      null,
      { timeout: 5000 },
    );
    // V-2 회귀: 게임2 화면이 뷰포트(832px)에 수직으로 다 들어와야 한다 (하단 패드 잘림 금지)
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`  [V-2 probe] scr-game2 document height = ${docH}px (viewport 832)`);
    assert(docH <= 832, `V-2 regression: game2 page height ${docH}px > 832px viewport`);
    // P1 turn (QA-S10-04)
    const d0 = await bridge('window.__MADPUMP__.game.attacker.dir');
    await page.keyboard.press('q');
    await page.waitForTimeout(150);
    const d1 = await bridge('window.__MADPUMP__.game.attacker.dir');
    assert(d1 === -d0, `attacker dir did not flip (${d0}→${d1})`);
    // P2 move left to the corner (QA-S10-07) — keeps P2 out of stray bullets' way
    const x0 = await bridge('window.__MADPUMP__.game.dodger.x');
    await page.keyboard.down('u');
    await page.waitForTimeout(1100);
    await page.keyboard.up('u');
    const x1 = await bridge('window.__MADPUMP__.game.dodger.x');
    assert(x1 < x0, `dodger did not move left (${x0}→${x1})`);
    await page.keyboard.down('i');
    await page.waitForTimeout(200);
    await page.keyboard.up('i');
    const x2 = await bridge('window.__MADPUMP__.game.dodger.x');
    assert(x2 > x1, `dodger did not move right (${x1}→${x2})`);

    // fire 3 bullets while attacker is on the far side; sample each vy right after
    // firing (bullets fall off-field in ~1s, so read immediately) — QA-S10-05/06/08
    const vys = [];
    let cooldownSeen = false;
    const sampleDeadline = Date.now() + 15000;
    let midplayShot = false;
    while (vys.length < 3 && Date.now() < sampleDeadline) {
      const s = await bridge(`(() => {
        const g = window.__MADPUMP__.game;
        return { ax: g.attacker.x, cd: g.attacker.cooldownMs, result: g.result };
      })()`);
      if (s.result) break;
      if (s.ax > 45 && s.cd <= 0) {
        await page.keyboard.press('w');
        await page.waitForTimeout(120);
        const after = await bridge(`(() => {
          const g = window.__MADPUMP__.game;
          const last = g.bullets[g.bullets.length - 1];
          return { vy: last ? last.vy : null, cd: g.attacker.cooldownMs, n: g.bullets.length };
        })()`);
        if (after.vy !== null) vys.push(after.vy);
        if (after.cd > 0) cooldownSeen = true;
        if (!midplayShot && after.n > 0) {
          await shot('s10-game2-midplay');
          midplayShot = true;
        }
      }
      await page.waitForTimeout(60);
    }
    assert(vys.length >= 2, `expected >=2 sampled bullets, got ${vys.length}`);
    assert(new Set(vys.map((v) => v.toFixed(3))).size > 1, 'bullet speeds all identical: ' + vys);
    assert(cooldownSeen, 'fire cooldown never observed after firing');

    // snipe: fire when attacker is over the (still) dodger until hit
    const deadline = Date.now() + 30000;
    let result = null;
    while (Date.now() < deadline) {
      const s = await bridge(`(() => {
        const g = window.__MADPUMP__.game;
        return g ? { ax: g.attacker.x, dx: g.dodger.x, cd: g.attacker.cooldownMs, result: g.result } : null;
      })()`);
      if (!s) break;
      if (s.result) {
        result = s.result;
        break;
      }
      if (Math.abs(s.ax - s.dx) <= 6 && s.cd <= 0) await page.keyboard.press('w');
      await page.waitForTimeout(60);
    }
    assert(result !== null, 'game2 did not end within 30s');
    console.log(`  game2 result=${result}`);
    await visible('result-overlay');
    await shot('s10-game2-result');
    await click('btn-back-main');
    await screenIs('scr-main-in');
  });

  // ── (j) game3: P1 attacks only → P2 pushed → ring out ────────────────
  await step('j-game3', async () => {
    await ensureMainIn();
    await click('btn-offline');
    await screenIs('scr-game-select');
    await click('card-game3');
    await screenIs('scr-game3');
    await page.waitForFunction(
      () => window.__MADPUMP__?.game && window.__MADPUMP__.game.gameId === 3,
      null,
      { timeout: 5000 },
    );
    const start = await bridge(
      '(() => { const g = window.__MADPUMP__.game; return { p1: g.players.P1.distanceFromEdge, p2: g.players.P2.distanceFromEdge }; })()',
    );
    assert(start.p1 === 3 && start.p2 === 3, `start distance not 3/3 (${start.p1}/${start.p2})`);
    await shot('s12-game3-start');

    // spam P1 attack (q); P2 idles → pushed every tick, ring out on 4th push
    const deadline = Date.now() + 15000;
    let midShotDone = false;
    let fin = null;
    while (Date.now() < deadline) {
      await page.keyboard.press('q');
      await page.waitForTimeout(400);
      const s = await bridge(`(() => {
        const g = window.__MADPUMP__.game;
        return { result: g.result, reason: g.resultReason, p2d: g.players.P2.distanceFromEdge,
                 last: g.lastTick ? { p1: g.lastTick.moves.P1, p2: g.lastTick.moves.P2, pushed: g.lastTick.pushed } : null };
      })()`);
      if (!midShotDone && s.p2d < 3) {
        assert(
          s.last && s.last.p1 === 'ATTACK' && s.last.pushed === 'P2',
          'tick did not show ATTACK vs NONE pushing P2: ' + JSON.stringify(s.last),
        );
        await shot('s12-game3-pushed');
        midShotDone = true;
      }
      if (s.result) {
        fin = s;
        break;
      }
    }
    assert(fin, 'game3 did not end within 15s');
    assert(fin.result === 'P1_WIN', `expected P1_WIN ring-out, got ${fin.result}`);
    assert(fin.reason === 'RING_OUT', `expected RING_OUT, got ${fin.reason}`);
    await visible('result-overlay');
    await shot('s12-game3-ringout');
    await click('btn-back-main');
    await screenIs('scr-main-in');
  });

  // ── (k) back at main ──────────────────────────────────────────────────
  await step('k-back-main', async () => {
    await ensureMainIn();
    await screenIs('scr-main-in');
    await shot('final-main-in');
  });

  await browser.close();

  console.log('\n==== SUMMARY ====');
  if (failures.length === 0) {
    console.log('ALL STEPS PASSED');
  } else {
    for (const f of failures) console.log(`FAIL ${f.step}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 2;
});
