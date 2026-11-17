/**
 * Desktop app settings (settings.json in Electron's userData folder).
 *
 * Pure Node: no Electron imports, so test/electron-settings.test.js can run
 * it with node:test. The file is small and written atomically.
 */
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_PORT = 2014
export const MIN_PORT = 1024
export const MAX_PORT = 65535

/** Settings the user can change in Preferences. */
export const DEFAULT_SETTINGS = Object.freeze({
  port: DEFAULT_PORT,
  openDashboardOnStart: true,
  startAtLogin: false
})

/** One-time notices; the app sets these itself. */
const DEFAULT_FLAGS = Object.freeze({
  firewallNoticeShown: false,
  trayNoticeShown: false
})

const BOOLEAN_KEYS = ['openDashboardOnStart', 'startAtLogin', 'firewallNoticeShown', 'trayNoticeShown']

/**
 * Validate a TCP port for the ProVerlay server.
 * Accepts numbers and numeric strings; ports below 1024 need admin rights
 * on most systems, so they are refused.
 * @returns {{ ok: true, port: number } | { ok: false, error: string }}
 */
export function validatePort(value) {
  const text = typeof value === 'string' ? value.trim() : value
  if (text === '' || text === null || text === undefined) {
    return { ok: false, error: 'Enter a port number.' }
  }
  const port = typeof text === 'number' ? text : /^\d+$/.test(String(text)) ? Number(text) : NaN
  if (!Number.isInteger(port)) {
    return { ok: false, error: 'The port must be a whole number.' }
  }
  if (port < MIN_PORT || port > MAX_PORT) {
    return { ok: false, error: `Choose a port between ${MIN_PORT} and ${MAX_PORT}.` }
  }
  return { ok: true, port }
}

/** Defaults merged with whatever valid values `raw` holds; unknown keys are dropped. */
export function normalizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS, ...DEFAULT_FLAGS }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const port = validatePort(raw.port)
  if (port.ok) out.port = port.port
  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key]
  }
  return out
}

/**
 * Apply a change from the Preferences window. Only user-editable keys are
 * accepted; invalid values are reported per field and nothing is applied.
 * @returns {{ ok: true, settings: object, changed: string[] } | { ok: false, errors: Record<string,string> }}
 */
export function applySettingsPatch(current, patch) {
  const base = normalizeSettings(current)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, errors: { form: 'Nothing to save.' } }
  }
  const errors = {}
  const next = { ...base }
  if ('port' in patch) {
    const result = validatePort(patch.port)
    if (result.ok) next.port = result.port
    else errors.port = result.error
  }
  for (const key of ['openDashboardOnStart', 'startAtLogin']) {
    if (!(key in patch)) continue
    if (typeof patch[key] === 'boolean') next[key] = patch[key]
    else errors[key] = 'Expected on or off.'
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  const changed = Object.keys(DEFAULT_SETTINGS).filter((key) => next[key] !== base[key])
  return { ok: true, settings: next, changed }
}

/** The subset shown in (and editable from) Preferences. */
export function publicSettings(settings) {
  const s = normalizeSettings(settings)
  return { port: s.port, openDashboardOnStart: s.openDashboardOnStart, startAtLogin: s.startAtLogin }
}

/**
 * Read settings.json. A missing or corrupt file yields the defaults
 * (`corrupt: true` tells the caller it should not silently trust it).
 */
export function loadSettings(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { settings: normalizeSettings(null), corrupt: false, exists: false }
    return { settings: normalizeSettings(null), corrupt: true, exists: true, error: err }
  }
  try {
    return { settings: normalizeSettings(JSON.parse(text)), corrupt: false, exists: true }
  } catch (err) {
    return { settings: normalizeSettings(null), corrupt: true, exists: true, error: err }
  }
}

/** Write settings.json atomically (temp file + rename). Returns what was written. */
export function saveSettings(file, settings) {
  const data = normalizeSettings(settings)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
  return data
}
