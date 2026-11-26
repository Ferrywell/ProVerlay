/**
 * What a project needs from the ProVerlay that opens it.
 *
 * An export records the version it was made with and the widget types it uses
 * (manifest.json). An import compares the project's widget types with the ones
 * this build knows and returns a notice when some are missing, so the operator
 * hears it at import time and not when a widget stays off screen during a show.
 *
 * Importing is never refused for this: project.json stays lenient about content
 * from other versions (see validateProjectState), and the unknown widgets come
 * back to life once ProVerlay is updated.
 */
import { WIDGET_TYPES } from './graphicDefaults.js'

/* Types from older versions that the render still draws but that cannot be added any more. */
const LEGACY_WIDGET_TYPES = ['customScoreboard', 'composedScore', 'clock', 'countdown']

const KNOWN = new Set([...WIDGET_TYPES, ...LEGACY_WIDGET_TYPES])
const MAX_NAMES = 3
const MAX_TEXT = 80

const clean = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)

const graphicsOf = (state) => (Array.isArray(state?.graphics) ? state.graphics : [])

/** Widget types a project uses, sorted, each once. */
export function usedWidgetTypes(state) {
  const types = new Set()
  for (const g of graphicsOf(state)) {
    if (typeof g?.type === 'string' && g.type) types.add(g.type)
  }
  return [...types].sort()
}

/** True when this build can show widgets of this type. */
export function isKnownWidgetType(type) {
  return KNOWN.has(type)
}

/**
 * Widget types in a project that this build does not know.
 * @returns {{ type: string, count: number, names: string[] }[]} sorted by type
 */
export function unknownWidgetTypes(state) {
  const found = new Map()
  for (const g of graphicsOf(state)) {
    if (typeof g?.type !== 'string' || !g.type || KNOWN.has(g.type)) continue
    const entry = found.get(g.type) || { type: clean(g.type), count: 0, names: [] }
    entry.count++
    const name = clean(g.name)
    if (name && entry.names.length < MAX_NAMES) entry.names.push(name)
    found.set(g.type, entry)
  }
  return [...found.values()].sort((a, b) => a.type.localeCompare(b.type))
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/** A version string from a manifest, or '' when it is not one. */
export function cleanVersion(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return VERSION_RE.test(text) ? text : ''
}

/** -1, 0 or 1 for the numeric major.minor.patch parts; null when either is not a version. */
export function compareVersions(a, b) {
  const parts = (v) => (cleanVersion(v) ? v.trim().split(/[-+]/)[0].split('.').map(Number) : null)
  const pa = parts(a)
  const pb = parts(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** The manifest fields written by an export (besides id, name, exportedAt). */
export function exportRequirements(state, runningVersion) {
  return {
    app: { name: 'ProVerlay', version: runningVersion },
    widgetTypes: usedWidgetTypes(state)
  }
}

function describeTypes(unknown) {
  return unknown
    .map((u) => {
      const names = u.names.map((n) => `"${n}"`).join(', ')
      const more = u.count > u.names.length ? `${names ? ', ' : ''}${u.count - u.names.length} more` : ''
      return names || more ? `${u.type} (${names}${more})` : u.type
    })
    .join('; ')
}

/**
 * Notice for an import, or null when this build knows every widget type.
 * @param {{ state: object, manifest?: object|null, runningVersion: string }} input
 * @returns {null | { unknownWidgetTypes: object[], exportedWith: string, runningVersion: string, message: string }}
 */
export function importNotice({ state, manifest = null, runningVersion }) {
  const unknown = unknownWidgetTypes(state)
  if (!unknown.length) return null
  const exportedWith = cleanVersion(manifest?.app?.version)
  const widgets = unknown.reduce((sum, u) => sum + u.count, 0)
  const order = compareVersions(exportedWith, runningVersion)

  let advice
  if (order === 1) {
    advice = `The project was exported from ProVerlay ${exportedWith}; this is ${runningVersion}. Update ProVerlay to ${exportedWith} or newer to use ${widgets === 1 ? 'it' : 'them'}.`
  } else if (exportedWith) {
    // Same or older version number: a build with extra widget types (a development branch, an experimental flag).
    advice = `The project was exported from ProVerlay ${exportedWith}, a build with widget types that this ProVerlay ${runningVersion} does not have. Open it in that build to use ${widgets === 1 ? 'it' : 'them'}.`
  } else {
    advice = `The file does not say which version it was exported from; this is ProVerlay ${runningVersion}. Try a newer ProVerlay.`
  }

  const message =
    `Imported, but ${widgets} widget${widgets === 1 ? '' : 's'} will stay off screen: ` +
    `this ProVerlay does not know the widget type${unknown.length === 1 ? '' : 's'} ${describeTypes(unknown)}. ${advice}`

  return { unknownWidgetTypes: unknown, exportedWith, runningVersion, message }
}
