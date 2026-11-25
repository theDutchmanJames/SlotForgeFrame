'use strict';
// Runs in the sandboxed page before Frame's own code. It tells the page it
// is running as the desktop app and offers the parts library and the update
// check (Settings → Updates and the update window). No other file
// access: the page opens and saves files through the browser's own file handling.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'slotforgeDesktop',
  Object.freeze({
    desktop: true,
    platform: process.platform,
    // The parts library (a SQLite file kept by the shell); resolves to { value } or { error }.
    library: (action, payload) => ipcRenderer.invoke('library:action', String(action), payload),
    // Update check; resolves to { ok, value } or { error }.
    updateCheck: (action, payload) => ipcRenderer.invoke('update:action', String(action), payload),
    onUpdateChange: (callback) => ipcRenderer.on('update:changed', () => callback()),
  }),
);
