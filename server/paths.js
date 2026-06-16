import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// In de Electron-app wijst PROVERLAY_DATA_DIR naar een schrijfbare locatie
// (~/Library/Application Support/ProVerlay/data). Standalone draait op de repo-map.
export const DATA_DIR = process.env.PROVERLAY_DATA_DIR || path.join(__dirname, '..', 'data')
