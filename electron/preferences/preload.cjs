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
  },
  openDebug() {
    ipcRenderer.send('prefs:open-debug')
  },
  update: {
    get() {
      return ipcRenderer.invoke('update:get')
    },
    check() {
      return ipcRenderer.invoke('update:check')
    },
    download() {
      return ipcRenderer.invoke('update:download')
    },
    cancel() {
      return ipcRenderer.invoke('update:cancel')
    },
    install() {
      return ipcRenderer.invoke('update:install')
    },
    openReleasePage() {
      ipcRenderer.send('update:open-page')
    },
    onChange(callback) {
      ipcRenderer.on('update:changed', (_event, info) => callback(info))
    }
  }
})
