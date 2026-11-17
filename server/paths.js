import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// In de Electron-app wijst PROVERLAY_DATA_DIR naar een schrijfbare locatie
// (~/Library/Application Support/ProVerlay/data). Standalone draait op de repo-map.
let dataDir = process.env.PROVERLAY_DATA_DIR || path.join(__dirname, '..', 'data')

/** Current data directory (registry.json, projects/, brands/). */
export function getDataDir() {
  return dataDir
}

/** Point the server at another data directory (used by createApp / tests). */
export function setDataDir(dir) {
  if (!dir || typeof dir !== 'string') throw new Error('dataDir must be a non-empty string')
  dataDir = path.resolve(dir)
}
