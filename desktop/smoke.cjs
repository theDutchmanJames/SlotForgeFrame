'use strict';
// Start-up test: opens the built desktop app, waits for the first build and
// checks what the page shows. Run: npm run test:desktop (after npm run build).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slotforge-frame-smoke-'));
const report = path.join(tmp, 'report.json');
// SLOTFORGE_APP names a packaged copy to test in place of the code in this folder.
// SLOTFORGE_ELECTRON_ARGS adds Chromium switches, such as software WebGL on a CI machine.
const packaged = process.env.SLOTFORGE_APP || '';
const extra = (process.env.SLOTFORGE_ELECTRON_ARGS || '').split(/\s+/).filter(Boolean);

const run = spawnSync(packaged || require('electron'), [...extra, ...(packaged ? [] : [root]), `--portable-data-dir=${tmp}`], {
  env: { ...process.env, SLOTFORGE_DESKTOP_SMOKE: report },
  timeout: 90_000,
  stdio: 'inherit',
});
let data = null;
try {
  data = JSON.parse(fs.readFileSync(report, 'utf8'));
} catch {}
fs.rmSync(tmp, { recursive: true, force: true });

const problems = [];
// The desktop app ships dist/index.html and nothing else of the page.
const loose = packaged ? [] : fs.readdirSync(path.join(root, 'dist')).filter((f) => f !== 'index.html' && f !== 'desktop');
if (loose.length) problems.push('The build left files beside the page, which the app would miss: ' + loose.join(', '));
if (!data) problems.push(`No report was written (exit code ${run.status}).`);
else {
  if (data.failed) problems.push(data.message);
  const p = data.page ?? {};
  if (p.brand !== 'SlotForge Frame') problems.push('The brand is missing.');
  if (p.menus !== 8) problems.push(`Expected 8 menus, saw ${p.menus}.`);
  if (!(p.pictures?.length >= 2) || p.pictures.includes(false)) problems.push('A picture (the app icon or the SlotForge mark) did not load: ' + JSON.stringify(p.pictures));
  if (!p.engine) problems.push('The geometry engine did not start.');
  if (!p.built) problems.push('The first design was not built' + (p.error ? ': ' + p.error : '.'));
  if (!(p.triangles > 300)) problems.push('The chassis has too few triangles.');
  if (!p.plate) problems.push('The top view shows no plate.');
  if (!p.desktop) problems.push('The desktop bridge is missing.');
  if (!p.library) problems.push('The library file could not be opened.');
  if (!p.updates) problems.push('The update check is missing.');
  if (!p.settings) problems.push('The Settings button is missing.');
  if (!String(data.profile || '').startsWith(tmp)) problems.push('The app did not keep its data in the given folder: ' + data.profile);
  if (!!packaged !== !!data.packaged) problems.push(packaged ? 'This is not a packaged copy.' : 'A packaged copy was started.');
  if (data.errors?.length) problems.push('Console errors: ' + data.errors.join(' | '));
}
if (problems.length) {
  console.error('Desktop start-up test FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Desktop start-up test passed${packaged ? ' (packaged copy)' : ''}: v${data.version}, ${data.page.triangles} chassis triangles.`);
