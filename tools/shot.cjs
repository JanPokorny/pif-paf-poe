// Usage: node tools/shot.cjs <script.js-with-steps>  — drives the game on a phone viewport.
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const out = process.env.OUT || '/tmp/claude-0/shots';
  let n = 0;
  const shot = async (name) => { await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
  const steps = require(require('path').resolve(process.argv[2]));
  try { await steps(page, shot); } catch (e) { errors.push('STEP ' + e.message); await shot('error'); }
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
