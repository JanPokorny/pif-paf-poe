// Playtest: a bot that plays the real UI in a browser, screen by screen, as a
// player taps, and reports console errors, native dialogs and screens it gets
// stuck on, with a screenshot of each kind of screen. Needs the game served on
// :8080 (npx http-server -p 8080 -s -c-1 .).
//   OUT=dir node tools/playtest.cjs <runs> <en|cs> <phone|small> <seed> [start act]
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [RUNS = 2, LANG = 'en', VIEW = 'phone', SEED = 1, ACT = 1] = process.argv.slice(2);
const OUT = `${process.env.OUT || '/tmp/playtest'}/${LANG}-${VIEW}-${SEED}-a${ACT}`;
fs.mkdirSync(OUT, { recursive: true });
let rnd = +SEED * 9973;
const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
const pick = (a) => a[Math.floor(rand() * a.length)];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await browser.newContext(VIEW === 'small' ? { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { ...devices['iPhone 12'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const log = [], errors = [], seen = new Set(), results = [];
  let screenName = '?';
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`[${screenName}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${screenName}] PAGEERROR: ${e.message}`));
  page.on('dialog', (d) => { errors.push(`[${screenName}] NATIVE DIALOG: ${d.message()}`); d.dismiss(); });
  await page.goto('http://localhost:8080/manifest.webmanifest');
  await page.evaluate(async ([lang, act, seed]) => {
    localStorage.clear(); localStorage.setItem('ppp-lang', lang); localStorage.setItem('ppp-fast', 'on');
    if (act > 1) {
      // A run already into a later act: the energy and the stones a player has by then.
      const R = await import('/src/run.js');
      const run = R.newRun({ seed });
      run.act = act; run.energy = { 2: 4, 3: 8 }[act]; run.gold = 120;
      for (let i = 0; i < 2 + 2 * act; i++) R.gainStone(run, R.randomStone(run, null, 'elite'));
      R.gainStone(run, R.randomOnce(run));
      run.map = R.makeMap(run); run.screen = 'actintro';
      localStorage.setItem('ppp-run-v2', JSON.stringify({ run, duel: null }));
    }
  }, [LANG, +ACT, +SEED]);
  await page.goto('http://localhost:8080/');
  const state = () => page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('ppp-run-v2')); return s?.run ? { screen: s.run.screen, act: s.run.act, hearts: s.run.hearts, over: s.run.over, duel: !!s.duel, tier: s.run.pending?.duel?.tier } : null; } catch { return null; } });
  const click = async (loc) => { try { await loc.click({ timeout: 1500, force: true }); return true; } catch { return false; } };
  const any = async (sel) => { const l = page.locator(sel); const n = await l.count(); if (!n) return false; return click(l.nth(Math.floor(rand() * n))); };
  const snap = async (name) => { if (seen.has(name)) return; seen.add(name); await page.screenshot({ path: `${OUT}/${String(seen.size).padStart(2, '0')}-${name}.png` }); };
  let runsDone = 0, steps = 0, lastSig = '', same = 0;
  while (runsDone < +RUNS && steps < 9000) {
    steps++;
    await page.waitForTimeout(140);
    const st = await state();
    const sig = (await page.evaluate(() => document.body.innerText.slice(0, 400))) + JSON.stringify(st);
    same = sig === lastSig ? same + 1 : 0; lastSig = sig;
    if (same === 60) { errors.push(`[${screenName}] STUCK for 60 steps after ${log.slice(-6).join(' > ')}`); await page.screenshot({ path: `${OUT}/stuck-${steps}.png` }); }
    if (same > 80) { same = 0; await page.goto('http://localhost:8080/'); continue; }
    // Modals first.
    if (await page.locator('.modal').count()) {
      screenName = (st?.screen ?? 'title') + '+modal';
      await snap(screenName.replace('+', '-') + (await page.locator('.modal .ask').count() ? '-ask' : await page.locator('.modal .stone-grid').count() ? '-grid' : ''));
      if (await page.locator('.modal .ask').count()) { await click(page.locator('.modal .ask button').first()); continue; }
      if (await page.locator('.modal .info-actions button.primary:not([disabled])').count() && rand() < 0.75) { await click(page.locator('.modal .info-actions button.primary')); continue; }
      if (await page.locator('.modal .cards .card').count() && rand() < 0.8) { await any('.modal .cards .card'); continue; }
      // The workshop: tick two, then Trade.
      if (await page.locator('.modal .stone-grid .tick-box').count() && rand() < 0.7) { await any('.modal .stone-grid .tick-box'); await page.waitForTimeout(100); await any('.modal .stone-grid .tick-box'); await page.waitForTimeout(100); await click(page.locator('.modal button.primary').first()); continue; }
      if (await page.locator('.modal .stone-grid .pouch-slot').count() && rand() < 0.7) { await any('.modal .stone-grid .pouch-slot'); await page.waitForTimeout(100); await click(page.locator('.modal button.primary').first()); continue; }
      await click(page.locator('.modal button.btn').last()); continue;
    }
    // The end screen clears the save: it is known by its share button.
    if (await page.locator('button', { hasText: /Copy result to share|Zkopírovat výsledek/ }).count()) {
      const victory = await page.locator('text=/Victory|Vítězství|summit|vrchol/i').count() > 0;
      await snap('end');
      results.push({ run: runsDone + 1, end: victory ? 'victory?' : 'gameover' }); runsDone++;
      log.push(`run ${runsDone} ended`);
      if (runsDone >= +RUNS) break;
      await click(page.locator('button', { hasText: /New run|Nová výprava/ }).first()); await page.waitForTimeout(300);
      await click(page.locator('.modal button.primary').first()); continue;
    }
    const onTitle = await page.locator('.btn.continue').count() > 0;
    screenName = onTitle ? 'title' : st?.screen ?? 'title';
    if (log.at(-1) !== screenName) log.push(screenName);
    if (onTitle && st && !st.over) { await click(page.locator('.btn.continue')); continue; }
    if (!st || st.over) {
      if (st?.over) {
        await snap(st.screen === 'victory' ? 'victory' : 'gameover');
        results.push({ run: runsDone + 1, end: st.screen, act: st.act });
        runsDone++;
        log.push(`run ${runsDone}: ${st.screen} in act ${st.act}`);
        if (runsDone >= +RUNS) break;
        await click(page.locator('button', { hasText: /New run|Nová výprava/ }).first()); await page.waitForTimeout(300);
        await click(page.locator('.modal button.primary').first()); continue;
      }
      await snap('title');
      if (await page.locator('.continue').count()) { await click(page.locator('.continue')); continue; }
      await click(page.locator('button', { hasText: /New run|Nová výprava/ }).first()); await page.waitForTimeout(300);
      await click(page.locator('.modal button.primary').first()); continue;
    }
    switch (st.screen) {
      case 'actintro': await snap('actintro-' + st.act); await click(page.locator('.btn.primary').first()); break;
      case 'map': {
        await snap('map-' + st.act);
        if (await page.locator('.map-cell.lair.open').count() && rand() < 0.35) { await click(page.locator('.map-cell.lair.open')); break; }
        if (!(await any('.map-cell.reach'))) await any('.map-cell');
        break;
      }
      case 'predual': await snap('predual-' + (st.tier ?? 'x')); if (rand() < 0.15) await any('.stone-row.pick .tick-box'); await click(page.locator('.sticky-bottom .btn.primary').first()); break;   // Fight, not Back to the map
      case 'duel': {
        await snap('duel-' + (st.tier ?? 'x'));
        const banner = page.locator('.result-bar button');
        if (await banner.count()) { await snap('duel-result'); await click(banner.last()); break; }
        const conf = page.locator('button', { hasText: /^\s*(Confirm|Potvrdit)/ });
        if (await conf.count()) { await click(conf.first()); break; }
        const OPT = '.target, button.arrow, button.rot, button.btn.opt';
        if (await page.locator(OPT).count()) {
          const chosen = page.locator('.target.chosen, button.arrow.chosen, button.rot.chosen, button.btn.opt.chosen');
          if (await chosen.count()) await click(chosen.first()); else await any(OPT);
          break;
        }
        if (await page.locator('.cell.allowed').count()) { await any('.cell.allowed'); break; }
        if (await page.locator('button.hand-slot:not(.forbidden):not(.idle)').count()) { await any('button.hand-slot:not(.forbidden):not(.idle)'); break; }
        if (await page.locator('.enemy-hand .borrow').count()) { await any('.enemy-hand .borrow'); break; }   // Open Hands
        break;   // the enemy is thinking
      }
      case 'reward': case 'treasure': {
        await snap(st.screen + '-' + (st.tier ?? 'x'));
        // Choose in every row that offers a choice, then Continue.
        const rows = page.locator('.cards.pick-one');
        for (let r = 0; r < await rows.count(); r++) {
          if (!(await rows.nth(r).locator('.card.chosen').count())) {
            // A tap opens the card; its Pick button chooses it.
            const cs = rows.nth(r).locator('.card'); await click(cs.nth(Math.floor(rand() * await cs.count()))); await page.waitForTimeout(250);
            await click(page.locator('.modal .info-actions button.primary')); await page.waitForTimeout(250);
          }
        }
        const go = page.locator('.sticky-bottom .btn');
        if (await go.isDisabled().catch(() => false)) { errors.push(`[${st.screen}] Continue still disabled after choosing`); }
        await click(go.first()); break;
      }
      case 'shop': {
        await snap('shop');
        if (rand() < 0.5 && await page.locator('.page.shop .card:not(.dear):not(.sold)').count()) { await any('.page.shop .card:not(.dear):not(.sold)'); break; }
        await click(page.locator('.sticky-bottom .btn').first()); break;
      }
      case 'event': {
        await snap('event');
        // A choice, or now and then the way past it (dashed, in the bottom bar).
        if (await page.locator('.choice:not(.disabled)').count() && rand() < 0.85) { await any('.choice:not(.disabled)'); break; }
        await click(page.locator('.sticky-bottom .btn').first()); break;
      }
      default: {
        await snap(st.screen);
        const btns = page.locator('.page .btn:not([disabled])');
        if (await btns.count()) { await click(btns.nth(Math.floor(rand() * await btns.count()))); break; }
        await click(page.locator('.btn').first());
      }
    }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ steps, runsDone, results, errors, log, screens: [...seen] }, null, 1));
  console.log(JSON.stringify({ steps, runsDone, results, errors: errors.slice(0, 30), nErrors: errors.length }));
  await browser.close();
})();
