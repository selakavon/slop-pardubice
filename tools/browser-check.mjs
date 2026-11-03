// Browser check: loads the page in Playwright WebKit (Safari's engine) and Chromium, at phone and desktop sizes, and
// checks that it boots without errors with the expected graphics profile. Playwright is a dev tool installed outside
// the repo:
//   npm install --prefix ~/.cache/slop-tools playwright
//   ~/.cache/slop-tools/node_modules/.bin/playwright install webkit chromium
// Run (from a server at the repo root, e.g. python3 -m http.server 8000):
//   PLAYWRIGHT_DIR=~/.cache/slop-tools node tools/browser-check.mjs http://localhost:8000 /tmp/out [case ...]
// Software rendering is slow: a case can take several minutes. Exit code 0 means every case passed.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [baseUrl, outDir, ...only] = process.argv.slice(2);
if (!baseUrl || !outDir || !process.env.PLAYWRIGHT_DIR) {
  console.error('Usage: PLAYWRIGHT_DIR=<dir with node_modules/playwright> node tools/browser-check.mjs <baseUrl> <outDir> [case ...]');
  process.exit(2);
}
const { webkit, chromium, devices } = createRequire(join(process.env.PLAYWRIGHT_DIR, '/'))('playwright');
mkdirSync(outDir, { recursive: true });

const phoneContext = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const CASES = [
  { name: 'webkit-phone', browser: webkit, path: '/?profile=phone&perf=2', context: phoneContext, profile: 'phone' },
  { name: 'webkit-desktop', browser: webkit, path: '/', context: { viewport: { width: 1280, height: 800 } }, profile: 'desktop' },
  // No profile override: the phone profile must come from the media queries alone
  { name: 'chromium-autodetect', browser: chromium, path: '/?webgl=1', context: devices['Pixel 7'], profile: 'phone' },
  { name: 'chromium-webgl', browser: chromium, path: '/?webgl=1', context: { viewport: { width: 1280, height: 800 } }, profile: 'desktop', backend: 'WebGL' }
];
const CASE_TIMEOUT = 10 * 60 * 1000;
const CHROMIUM_ARGS = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];

async function runCase(c) {
  const started = Date.now();
  // Chromium's new headless mode: the headless shell never finishes a screenshot of the WebGL canvas here
  const browser = await c.browser.launch(c.browser === chromium ? { channel: 'chromium', args: CHROMIUM_ARGS } : {});
  const result = { name: c.name, ok: false, problems: [], warnings: [], logs: [] };
  try {
    const page = await (await browser.newContext(c.context)).newPage();
    page.on('pageerror', (e) => result.problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error') result.problems.push(`console error: ${text}`);
      else if (m.type() === 'warning' && !text.includes('preloaded using link preload')) result.warnings.push(text);
      if (/^\[(init|graphics)\]/.test(text)) result.logs.push(text);
    });
    await page.goto(baseUrl.replace(/\/$/, '') + c.path);
    await page.waitForSelector('#loading-overlay.hidden', { state: 'attached', timeout: CASE_TIMEOUT });
    result.loadS = (Date.now() - started) / 1000;
    await page.waitForTimeout(3000); // the loading overlay fades out
    const graphics = await page.evaluate(() => window.slopGraphics && {
      profile: window.slopGraphics.profile.id, backend: window.slopGraphics.backend
    });
    Object.assign(result, graphics);
    if (!graphics) result.problems.push('window.slopGraphics is missing');
    else {
      if (graphics.profile !== c.profile) result.problems.push(`profile ${graphics.profile}, expected ${c.profile}`);
      if (c.backend && graphics.backend !== c.backend) result.problems.push(`backend ${graphics.backend}, expected ${c.backend}`);
    }
    // Under software rendering a 1280x800 frame with SSR can take minutes: a missing screenshot is a warning
    await page.screenshot({ path: join(outDir, `${c.name}.png`), timeout: CASE_TIMEOUT })
      .catch((e) => result.warnings.push(`no screenshot: ${e.message.split('\n')[0]}`));
    result.ok = result.problems.length === 0;
  } catch (e) {
    result.problems.push(e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
  return result;
}

const results = [];
for (const c of CASES.filter((x) => !only.length || only.includes(x.name))) {
  console.log(`… ${c.name}`);
  const r = await runCase(c);
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}: ${r.profile ?? '?'} on ${r.backend ?? '?'}, loaded in ${r.loadS ?? '–'} s`);
  for (const line of [...r.logs, ...r.warnings.map((w) => `warning: ${w}`), ...r.problems]) console.log(`    ${line.slice(0, 400)}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
