/**
 * Debug log for the Debug console (/debug, opened from the desktop app's
 * Preferences): what the server did and why, in plain lines.
 *
 * - An in-memory ring buffer (never written to disk, gone after a restart).
 * - Areas: state, api, render, data, f1, image, server.
 * - Listeners get every new entry (app.js forwards them to the sockets in
 *   the 'debug' room, which only loopback clients can join).
 *
 * Callers log transitions and requests, never per-poll noise: an F1 poll
 * every second must not flood the console.
 */

export const DEBUG_LOG_MAX = 1000
export const DEBUG_AREAS = Object.freeze(['state', 'api', 'render', 'data', 'f1', 'image', 'server'])
const LEVELS = new Set(['info', 'warn', 'error'])
const MAX_MESSAGE = 500
const MAX_DETAIL = 4000

let entries = []
let seq = 0
const listeners = new Set()

function clip(text, max) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function detailText(detail) {
  if (detail == null || detail === '') return undefined
  if (typeof detail === 'string') return clip(detail, MAX_DETAIL)
  try {
    return clip(JSON.stringify(detail), MAX_DETAIL)
  } catch {
    return clip(String(detail), MAX_DETAIL)
  }
}

/**
 * Add one line. Never throws: logging must not break the code that logs.
 * @param {string} area one of DEBUG_AREAS
 * @param {string} message
 * @param {{ level?: 'info'|'warn'|'error', detail?: unknown, graphicId?: string }} [options]
 */
export function debugLog(area, message, { level = 'info', detail, graphicId } = {}) {
  try {
    const entry = {
      seq: ++seq,
      at: new Date().toISOString(),
      area: DEBUG_AREAS.includes(area) ? area : 'server',
      level: LEVELS.has(level) ? level : 'info',
      message: clip(message, MAX_MESSAGE)
    }
    const d = detailText(detail)
    if (d !== undefined) entry.detail = d
    if (typeof graphicId === 'string' && graphicId) entry.graphicId = clip(graphicId, 120)
    entries.push(entry)
    if (entries.length > DEBUG_LOG_MAX) entries = entries.slice(-DEBUG_LOG_MAX)
    for (const fn of listeners) {
      try {
        fn(entry)
      } catch {
        // a broken listener must not stop the others
      }
    }
    return entry
  } catch {
    return null
  }
}

/** Entries after `afterSeq` (all when omitted), oldest first. */
export function debugEntries(afterSeq = 0) {
  const after = Number(afterSeq) || 0
  return after ? entries.filter((e) => e.seq > after) : entries.slice()
}

export function onDebugLog(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Tests and server restarts. */
export function resetDebugLog() {
  entries = []
  listeners.clear()
}

/**
 * Who sent an API request, for the log: the ProVerlay page it came from
 * (Referer), or the kind of client (Companion and scripts send no Referer).
 */
export function describeClient(req) {
  const ip = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
  const where = ip === '127.0.0.1' || ip === '::1' ? 'this computer' : ip || 'unknown address'
  let page = ''
  try {
    const ref = req.headers?.referer
    if (ref) page = new URL(ref).pathname.split('/')[1] || ''
  } catch {
    page = ''
  }
  if (page) return `${page} page (${where})`
  const ua = String(req.headers?.['user-agent'] || '')
  if (/companion/i.test(ua)) return `Companion (${where})`
  if (/^(node|undici|axios|got|curl|python|wget|postman)/i.test(ua) || !ua) return `script or Companion (${where})`
  return `browser (${where})`
}

/** One graphic, for log lines: `"Name" (type)`. */
export function graphicLabel(graphic) {
  if (!graphic) return 'unknown graphic'
  return `"${graphic.name || graphic.id}" (${graphic.type})`
}

const TRACKED_KEYS = ['visible', 'soloVisible', 'position', 'name', 'style', 'zIndex']

/**
 * Describe what changed between two states, as debug lines: graphics added,
 * removed, taken on/off air, and which top-level data fields changed.
 * @returns {{ message: string, graphicId?: string, detail?: string }[]}
 */
export function describeStateChange(prev, next) {
  const lines = []
  if (!prev || !next) return lines
  if (prev.projectId !== next.projectId) {
    lines.push({ message: `Project "${next.projectName || next.projectId}" is now active` })
    return lines
  }
  const before = new Map((prev.graphics || []).map((g) => [g.id, g]))
  const after = new Map((next.graphics || []).map((g) => [g.id, g]))
  for (const [id, g] of after) {
    const old = before.get(id)
    if (!old) {
      lines.push({ message: `Added ${graphicLabel(g)}`, graphicId: id })
      continue
    }
    if (Boolean(old.visible) !== Boolean(g.visible)) {
      lines.push({ message: `${graphicLabel(g)} ${g.visible ? 'went on air' : 'went off air'}`, graphicId: id })
    }
    const changed = TRACKED_KEYS.filter((k) => k !== 'visible' && JSON.stringify(old[k]) !== JSON.stringify(g[k]))
    const oldData = old.data || {}
    const newData = g.data || {}
    const dataKeys = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])].filter(
      (k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])
    )
    if (changed.length || dataKeys.length) {
      const parts = [...changed, ...dataKeys.map((k) => `data.${k}`)]
      lines.push({
        message: `${graphicLabel(g)} changed: ${parts.slice(0, 8).join(', ')}${parts.length > 8 ? ` +${parts.length - 8} more` : ''}`,
        graphicId: id
      })
    }
  }
  for (const [id, g] of before) {
    if (!after.has(id)) lines.push({ message: `Removed ${graphicLabel(g)}`, graphicId: id })
  }
  const order = (s) => (s.graphics || []).map((g) => g.id).join(',')
  if (lines.length === 0 && order(prev) !== order(next)) lines.push({ message: 'Graphics reordered' })
  for (const key of ['theme', 'brand', 'layout', 'variables', 'dataSettings']) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) lines.push({ message: `Project setting "${key}" changed` })
  }
  return lines
}
