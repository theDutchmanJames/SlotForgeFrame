'use strict';
// SlotForge Frame desktop shell. Frame is a single offline page
// (dist/index.html, built by Vite); this shows it in its own window.
// Based on SlotForge Anvil's shell, with the SlotForge update check
// (desktop/update-check.cjs).
const { app, BrowserWindow, Menu, dialog, shell, session, ipcMain, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const { Library } = require('./library.cjs');
const { UpdateCheck } = require('./update-check.cjs');

const ROOT = path.resolve(__dirname, '..');
const HOMEPAGE = require('../package.json').homepage;
const PAGE = path.join(ROOT, 'dist', 'index.html');

app.setAppUserModelId('nl.slotforge.frame');

// Start-up test (desktop/smoke.cjs): SLOTFORGE_DESKTOP_SMOKE names a file to
// write what the page showed to, then the app quits. --portable-data-dir keeps
// the test's data in a throwaway folder.
const SMOKE = process.env.SLOTFORGE_DESKTOP_SMOKE || '';
const dataDir = process.argv.find((a) => a.startsWith('--portable-data-dir='))?.slice(20);
if (dataDir) app.setPath('userData', path.resolve(dataDir, 'app-profile'));

function smokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(e.message);
  });
  const write = (data) => {
    fs.writeFileSync(SMOKE, JSON.stringify({ version: app.getVersion(), profile: app.getPath('userData'), packaged: app.isPackaged, errors, ...data }));
    app.exit(0);
  };
  const fail = (e) => write({ failed: true, message: String(e?.stack || e) });
  setTimeout(() => fail('The page did not finish loading within 60 s.'), 60_000);
  win.webContents.once('did-finish-load', () =>
    setTimeout(
      () =>
        win.webContents
          .executeJavaScript(
            `(async () => ({ href: location.href, brand: document.querySelector('.brand')?.getAttribute('aria-label'),
                menus: document.querySelectorAll('#menus [data-act=menu]').length,
                pictures: [...document.querySelectorAll('img')].map((i) => i.complete && i.naturalWidth > 0),
                engine: window.slotforgeFrame?.ready() === true,
                built: !!window.slotforgeFrame?.state.built, error: window.slotforgeFrame?.state.error,
                triangles: (window.slotforgeFrame?.state.built?.chassis.indices.length ?? 0) / 3,
                plate: document.querySelectorAll('#topview path.plate').length,
                desktop: window.slotforgeDesktop?.desktop === true,
                updates: !!window.UpdateUI && typeof window.slotforgeDesktop?.updateCheck === 'function',
                settings: !!document.querySelector('#top [data-act=settings]:not([hidden])'),
                library: await window.slotforgeDesktop.library('list').then((r) => Array.isArray(r.value)) }))()`,
          )
          .then((page) => write({ page }), fail),
      4000,
    ),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  const pageUrl = new URL('file:' + (process.platform === 'win32' ? '///' : '//') + PAGE.replaceAll('\\', '/'));
  const sameFile = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'file:' && decodeURIComponent(u.pathname) === decodeURIComponent(pageUrl.pathname);
    } catch {
      return false;
    }
  };
  const external = (url) => {
    try {
      if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url);
    } catch {}
  };

  // The parts library: one SQLite file in the data folder, opened when first asked for.
  // Only Frame's own page may ask: the sender must be the main frame of the window showing that file.
  let lib = null;
  const ownPage = (event) => !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && sameFile(event.senderFrame.url);
  ipcMain.handle('library:action', (event, action, payload) => {
    if (!ownPage(event)) return { error: 'Unknown page.' };
    try {
      lib ??= new Library(app.getPath('userData'));
      if (action === 'list') return { value: lib.list() };
      if (action === 'all') return { value: lib.all() };
      if (action === 'get') return { value: lib.get(payload?.id) };
      if (action === 'put') return { value: lib.put(payload?.item) };
      if (action === 'remove') return { value: lib.remove(payload?.id) };
      throw Error('Unknown library action.');
    } catch (e) {
      return { error: e.message };
    }
  });
  app.on('before-quit', () => {
    try { lib?.close(); } catch {}
  });

  // "A new version is available": installed and portable apps ask GitHub once,
  // a few seconds after start; a newer version opens a window with What's new,
  // Skip and Download. Development copies, automated runs and
  // SLOTFORGE_NO_UPDATE_CHECK only check when asked in Settings.
  const updateCheck = new UpdateCheck({
    profile: app.getPath('userData'),
    current: app.getVersion(),
    homepage: HOMEPAGE,
    appName: 'Frame',
    artifactPrefix: 'SlotForgeFrame',
    userAgent: 'SlotForge-Frame',
    fetch: (url, init) => net.fetch(url, init),
    automatic: app.isPackaged && !SMOKE && !process.env.SLOTFORGE_NO_UPDATE_CHECK,
    // Which file replaces this copy: the portable app and an AppImage say so through these.
    edition: {
      platform: process.platform,
      arch: process.arch,
      portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
      appImage: !!process.env.APPIMAGE,
    },
    downloads: app.getPath('downloads'),
    onChange: () => {
      if (win && !win.isDestroyed()) win.webContents.send('update:changed');
    },
  });
  const updateTimer = setTimeout(() => void updateCheck.startupCheck(), 5 * 1000);
  updateTimer.unref();
  ipcMain.handle('update:action', async (event, action, payload) => {
    if (!ownPage(event)) return { error: 'Unknown page.' };
    try {
      if (action === 'status') return { ok: true, value: updateCheck.status() };
      if (action === 'check') return { ok: true, value: await updateCheck.check() };
      if (action === 'enable') return { ok: true, value: updateCheck.setEnabled(payload?.enabled) };
      if (action === 'skip') return { ok: true, value: updateCheck.skip(payload?.version) };
      if (action === 'download') {
        // Not awaited: progress and the result reach the window through update:changed.
        updateCheck.startDownload().catch(() => {});
        return { ok: true, value: updateCheck.status() };
      }
      if (action === 'cancel') return { ok: true, value: updateCheck.cancelDownload() };
      if (action === 'show') {
        shell.showItemInFolder(updateCheck.downloadedFile());
        return { ok: true, value: { shown: true } };
      }
      if (action === 'open') {
        await shell.openExternal(updateCheck.releaseUrl());
        return { ok: true, value: { opened: true } };
      }
      throw Error('Unknown update action.');
    } catch (e) {
      return { error: e.message, code: e.code };
    }
  });
  app.on('before-quit', () => {
    clearTimeout(updateTimer);
    updateCheck.stop(); // abandons a check or download in progress
  });

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());

  function openWindow() {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(permission === 'clipboard-sanitized-write'),
    );
    win = new BrowserWindow({
      width: 1500,
      height: 920,
      minWidth: 1100,
      minHeight: 680,
      show: false,
      title: 'SlotForge Frame',
      backgroundColor: '#171b21',
      icon: path.join(ROOT, 'desktop', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      external(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (!sameFile(url)) {
        event.preventDefault();
        external(url);
      }
    });
    if (SMOKE) smokeTest(win);
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      win = null;
    });
    win.loadFile(PAGE);
  }

  function menu() {
    const mac = process.platform === 'darwin';
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(mac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
            { role: 'toggleDevTools' },
          ],
        },
        { role: 'windowMenu' },
        {
          label: 'Help',
          submenu: [
            { label: 'SlotForge Frame on GitHub', click: () => shell.openExternal(HOMEPAGE) },
            { label: 'Report a problem', click: () => shell.openExternal(HOMEPAGE + '/issues') },
            { type: 'separator' },
            { label: 'Show data folder', click: () => shell.openPath(app.getPath('userData')) },
          ],
        },
      ]),
    );
  }

  app
    .whenReady()
    .then(() => {
      if (!fs.existsSync(PAGE)) {
        dialog.showErrorBox('SlotForge Frame is incomplete', 'The app page is missing:\n' + PAGE + '\n\nRun npm run build first.');
        return app.exit(1);
      }
      menu();
      openWindow();
    })
    .catch((e) => {
      dialog.showErrorBox('SlotForge Frame could not start', e.stack || e.message);
      app.exit(1);
    });
}
