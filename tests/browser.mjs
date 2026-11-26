// End-to-end test of the built app (dist/index.html) in a real browser, with a clean profile and no network.
// Build first (npm run build). To choose another Chromium browser, set SLOTFORGE_BROWSER.
// Run one check by name: node tests/browser.mjs "undo"
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { checks } from './browser/checks.mjs';
import { editorChecks } from './browser/editor-checks.mjs';

const artifact = new URL('../dist/index.html', import.meta.url);
if (!existsSync(artifact)) throw Error('Build the app with npm run build before running the browser test.');

const browserPaths = {
  win32: [
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};
const executablePath = process.env.SLOTFORGE_BROWSER || [...(browserPaths[process.platform] || []), chromium.executablePath()].find((p) => existsSync(p));
if (!executablePath) throw Error('Install a Chromium browser (Edge or Chrome), or set SLOTFORGE_BROWSER to its executable.');

const testDir = await mkdtemp(join(tmpdir(), 'slotforge-frame-ui-'));
const only = process.argv[2]?.toLowerCase();
let context, failed = 0, ran = 0;
try {
  context = await chromium.launchPersistentContext(join(testDir, 'profile'), {
    executablePath,
    downloadsPath: join(testDir, 'downloads'),
    headless: true,
    // Software rendering: the 3D view must work on a machine without a graphics card too.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    viewport: { width: 1600, height: 900 },
    offline: true,
    acceptDownloads: true,
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15000);
  const pageErrors = [], consoleErrors = [], externalRequests = [], dialogs = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  context.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  context.on('request', (r) => { if (/^(https?|wss?):/.test(r.url())) externalRequests.push(r.url()); });
  // Yes / No questions (window.confirm): answered with what the check asked for, "yes" unless told otherwise.
  let answer = true;
  page.on('dialog', (d) => { dialogs.push(d.message()); (answer ? d.accept() : d.dismiss()).catch(() => {}); });

  // ---- what every check gets
  const app = {
    page,
    testDir,
    dialogs,
    answer: (yes) => { answer = yes; },
    // Waits until the design on screen has been built.
    idle: () => page.waitForFunction(() => { const s = window.slotforgeFrame?.state; return !!s && !!s.built && !s.busy; }, null, { timeout: 60000 }),
    // A clean start: nothing kept from an earlier check.
    async fresh() {
      answer = true;
      dialogs.length = 0;
      await page.goto(artifact.href);
      await page.evaluate(() => localStorage.clear());
      await page.goto(artifact.href);
      await app.idle();
    },
    state: (fn, arg) => page.evaluate(fn, arg),
    design: () => page.evaluate(() => JSON.parse(JSON.stringify(window.slotforgeFrame.state.design))),
    feature: (type) => page.evaluate((t) => { const d = window.slotforgeFrame.state.design; return JSON.parse(JSON.stringify([...d.chassis.features, ...d.pod.features].find((f) => f.type === t) ?? null)); }, type),
    features: (type) => page.evaluate((t) => JSON.parse(JSON.stringify(window.slotforgeFrame.state.design.chassis.features.filter((f) => f.type === t))), type),
    notes: () => page.evaluate(() => (window.slotforgeFrame.state.built?.notes ?? []).map((n) => ({ ok: n.ok, title: n.title }))),
    async tool(menu, tool) {
      await page.click(`#menus [data-act=menu][data-menu="${menu}"]`);
      if (tool) await page.click(`#sub [data-act=tool][data-tool="${tool}"]`);
    },
    // A field of the open panel, by the end of its path (for example "thickness" or "car.wheelbase").
    field: (ending) => page.locator(`#panel [data-path$="${ending}"]`).first(),
    // Types a value into a field and leaves it with Enter.
    async set(ending, value) {
      const f = app.field(ending);
      await f.fill(String(value));
      await f.press('Enter');
      await app.idle();
    },
    // Clicks something that saves a file, and returns the files that came out.
    async downloads(action, count = 1) {
      const got = [];
      const onDownload = (d) => got.push(d);
      page.on('download', onDownload);
      await action();
      const until = Date.now() + 15000;
      while (got.length < count && Date.now() < until) await page.waitForTimeout(50);
      await page.waitForTimeout(150); // an extra file would be a bug; give it a moment to show up
      page.off('download', onDownload);
      return Promise.all(got.map(async (d) => ({ name: d.suggestedFilename(), bytes: await readFile(await d.path()) })));
    },
    toasts: () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent)),
    async tempFile(name, bytes) {
      const path = join(testDir, name);
      await writeFile(path, bytes);
      return path;
    },
    assert,
  };

  for (const [name, check] of [...checks,...editorChecks]) {
    if (only && !name.toLowerCase().includes(only)) continue;
    ran++;
    const before = [pageErrors.length, consoleErrors.length];
    const started = Date.now();
    try {
      await app.fresh();
      await check(app);
      assert.deepEqual(pageErrors.slice(before[0]), [], 'the page threw no errors');
      assert.deepEqual(consoleErrors.slice(before[1]), [], 'the console shows no errors');
      console.log(`✔ ${name} (${Date.now() - started} ms)`);
    } catch (e) {
      failed++;
      console.log(`✖ ${name}\n    ${String(e.message).split('\n').join('\n    ')}`);
      await page.screenshot({ path: join(process.cwd(), `browser-test-failure-${failed}.png`) }).catch(() => {});
    }
  }
  assert.deepEqual(externalRequests, [], 'the app asked for nothing over the network');
} finally {
  await context?.close().catch(() => {});
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
}
console.log(`\n${ran - failed} of ${ran} browser checks passed.`);
if (failed || !ran) process.exit(1);
