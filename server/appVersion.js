import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

let version = null

/** ProVerlay's own version (package.json), or 'unknown'. Read once. */
export function appVersion() {
  if (version) return version
  try {
    version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'unknown'
  } catch {
    version = 'unknown'
  }
  return version
}
