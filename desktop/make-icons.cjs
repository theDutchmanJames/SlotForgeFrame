'use strict';
// Draws the app icon files from src/assets/slotforge-frame.svg:
// desktop/build/icon.png (1024 px) and icon.ico (16 to 256 px).
// Run: npx electron desktop/make-icons.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'src', 'assets', 'slotforge-frame.svg'), 'utf8');
const out = path.join(root, 'desktop', 'build');

async function draw(win, size) {
  const data = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const b64 = await win.webContents.executeJavaScript(`new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${size};
      c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size}); ok(c.toDataURL('image/png').split(',')[1]); };
    img.onerror = () => no('svg');
    img.src = ${JSON.stringify(data)};
  })`);
  return Buffer.from(b64, 'base64');
}

// An .ico file holding PNG images.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map(([, png]) => png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  fs.writeFileSync(path.join(out, 'icon.png'), await draw(win, 1024));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) pngs.push([s, await draw(win, s)]);
  fs.writeFileSync(path.join(out, 'icon.ico'), ico(pngs));
  console.log('Wrote icon.png and icon.ico');
  app.quit();
});
