// Preload for the ProVerlay app windows (sandboxed, context-isolated).
// Exposes a tiny bridge so the web UI can tell the desktop shell which
// theme is active (Windows/Linux caption buttons follow it) and open
// Preferences. The main process ignores messages from other origins.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('proverlayDesktop', {
  platform: process.platform,
  setTheme(theme) {
    ipcRenderer.send('desktop:set-theme', String(theme || 'system'))
  },
  openPreferences() {
    ipcRenderer.send('desktop:open-preferences')
  }
})
