// Preload for the Preferences window (sandboxed, context-isolated).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('proverlayPrefs', {
  platform: process.platform,
  get() {
    return ipcRenderer.invoke('prefs:get')
  },
  save(patch) {
    return ipcRenderer.invoke('prefs:save', patch)
  },
  close() {
    ipcRenderer.send('prefs:close')
  },
  fit(height) {
    ipcRenderer.send('prefs:fit', Number(height))
  }
})
