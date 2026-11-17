/**
 * Small hand-written validators for everything clients can write into the
 * project state. The goal is not a full schema, but to guarantee that no
 * request can store a shape the server (or the next start) cannot load:
 * graphics stays an array of objects with a stable id/type, containers never
 * flip between object and array, and prototype keys are never merged.
 */
import { isTrustedHostname } from './netSecurity.js'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
    this.expose = true
  }
}

export const badRequest = (message) => new HttpError(400, message)
export const notFound = (message) => new HttpError(404, message)

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_DEPTH = 32

/** Project ids are slugs; anything else never touches the filesystem. */
export const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]*$/

export function isValidProjectId(id) {
  return typeof id === 'string' && id.length <= 80 && PROJECT_ID_RE.test(id)
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function kindOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function label(path) {
  return path || 'body'
}

/** Reject __proto__/constructor/prototype keys and absurdly deep payloads. */
export function assertSafeKeys(value, path = '', depth = 0) {
  if (depth > MAX_DEPTH) throw badRequest(`${label(path)}: nesting too deep`)
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertSafeKeys(item, `${path}[${i}]`, depth + 1))
    return
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw badRequest(`${label(path)}: key "${key}" is not allowed`)
      assertSafeKeys(value[key], path ? `${path}.${key}` : key, depth + 1)
    }
  }
}

/**
 * Merge `source` into `target` (both plain objects) without mutating either.
 * Arrays replace arrays; objects merge into objects. A value that would turn
 * an existing object/array into something of another kind is rejected with
 * a 400, because that is how a single bad PATCH used to brick a project.
 */
export function deepMerge(target, source, path = '') {
  const base = isPlainObject(target) ? target : {}
  const out = { ...base }
  for (const [key, value] of Object.entries(source)) {
    if (FORBIDDEN_KEYS.has(key)) throw badRequest(`${label(path)}: key "${key}" is not allowed`)
    if (value === undefined) continue
    const here = path ? `${path}.${key}` : key
    const prev = Object.hasOwn(base, key) ? base[key] : undefined
    if (Array.isArray(value)) {
      if (isPlainObject(prev)) throw badRequest(`${here}: expected an object, got an array`)
      out[key] = value
    } else if (value !== null && typeof value === 'object') {
      if (!isPlainObject(value)) throw badRequest(`${here}: unsupported value`)
      if (Array.isArray(prev)) throw badRequest(`${here}: expected an array, got an object`)
      out[key] = deepMerge(isPlainObject(prev) ? prev : {}, value, here)
    } else {
      if (isPlainObject(prev) || Array.isArray(prev)) {
        throw badRequest(`${here}: expected ${kindOf(prev) === 'array' ? 'an array' : 'an object'}, got ${kindOf(value)}`)
      }
      out[key] = value
    }
  }
  return out
}

function expectType(value, kind, path, { nullable = false } = {}) {
  if (value === undefined) return
  if (nullable && value === null) return
  const ok =
    kind === 'object'
      ? isPlainObject(value)
      : kind === 'array'
        ? Array.isArray(value)
        : kind === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === kind
  if (!ok) throw badRequest(`${path}: expected ${kind}${nullable ? ' or null' : ''}, got ${kindOf(value)}`)
}

const GRAPHIC_FIELD_TYPES = {
  name: 'string',
  position: 'string',
  visible: 'boolean',
  soloVisible: 'boolean',
  operator: 'boolean',
  transition: 'object',
  data: 'object'
}

const SCORE_TYPES = new Set(['matchScoreboard', 'hockeyScorebug'])

/** Type-specific checks on a (partial) graphic.data payload. */
function validateGraphicData(type, data, path = 'data') {
  if (!isPlainObject(data)) return
  if (SCORE_TYPES.has(type)) {
    for (const key of ['homeScore', 'awayScore']) {
      const v = data[key]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9999) {
        throw badRequest(`${path}.${key}: expected a non-negative integer`)
      }
    }
    expectType(data.clock, 'object', `${path}.clock`)
  }
  if (type === 'customTicker') expectType(data.messages, 'array', `${path}.messages`)
  if (type === 'lowerThirdShow') expectType(data.entries, 'array', `${path}.entries`)
  if (type === 'quizShow') expectType(data.questions, 'array', `${path}.questions`)
  if (type === 'f1Timing') {
    expectType(data.drivers, 'array', `${path}.drivers`)
    expectType(data.multiviewer, 'object', `${path}.multiviewer`)
    const host = data.multiviewer?.host
    if (host !== undefined) {
      if (typeof host !== 'string' || !isTrustedHostname(host.trim() || '127.0.0.1')) {
        throw badRequest(
          `${path}.multiviewer.host: must be localhost or a private-network address`
        )
      }
    }
  }
}

/**
 * Validate a PATCH body for one graphic. `id` and `type` are immutable
 * (sending the current value is fine, clients sometimes echo whole objects).
 */
export function validateGraphicPatch(existing, patch) {
  if (!isPlainObject(patch)) throw badRequest('Body must be a JSON object')
  assertSafeKeys(patch)
  if (patch.id !== undefined && patch.id !== existing.id) throw badRequest('id is immutable')
  if (patch.type !== undefined && patch.type !== existing.type) throw badRequest('type is immutable')
  for (const [key, kind] of Object.entries(GRAPHIC_FIELD_TYPES)) {
    expectType(patch[key], kind, key)
  }
  if (patch.data !== undefined) validateGraphicData(existing.type, patch.data)
}

/** Structural check of a complete graphic (stored or about to be stored). */
export function validateGraphic(graphic, path = 'graphic', { knownTypes = null, strictFields = true } = {}) {
  if (!isPlainObject(graphic)) throw badRequest(`${path}: expected an object`)
  if (typeof graphic.id !== 'string' || !graphic.id) throw badRequest(`${path}.id: expected a non-empty string`)
  if (typeof graphic.type !== 'string' || !graphic.type) {
    throw badRequest(`${path}.type: expected a non-empty string`)
  }
  if (knownTypes && !knownTypes.has(graphic.type)) {
    throw badRequest(`${path}.type: unknown widget type "${graphic.type}"`)
  }
  if (!strictFields) {
    expectType(graphic.data, 'object', `${path}.data`, { nullable: true })
    return
  }
  for (const [key, kind] of Object.entries(GRAPHIC_FIELD_TYPES)) {
    expectType(graphic[key], kind, `${path}.${key}`)
  }
}

const STATE_KEY_TYPES = {
  version: 'number',
  client: 'object',
  brandId: 'string',
  brand: 'object',
  settings: 'object',
  graphics: 'array'
}
/** Runtime-only fields that clients may echo back; they are never stored. */
const META_KEYS = new Set(['projectId', 'projectName', 'customCssVersion', 'experimental', 'serverNow'])

/**
 * Validate and normalise a PATCH /api/state body. Returns the patch that
 * should be merged. Unknown top-level keys are rejected.
 *
 * Compatibility: a top-level `colors` object (sent by the Companion
 * "Set primary color" action) is treated as `brand.colors`.
 */
export function normalizeStatePatch(body, { knownTypes } = {}) {
  if (!isPlainObject(body)) throw badRequest('Body must be a JSON object')
  assertSafeKeys(body)
  const patch = {}
  for (const [key, value] of Object.entries(body)) {
    if (META_KEYS.has(key)) continue
    if (key === 'colors') {
      if (!isPlainObject(value)) throw badRequest('colors: expected object')
      patch.brand = { ...(patch.brand || {}), colors: { ...(patch.brand?.colors || {}), ...value } }
      continue
    }
    if (!Object.hasOwn(STATE_KEY_TYPES, key)) {
      throw badRequest(
        `Unknown state key "${key}". Allowed: ${Object.keys(STATE_KEY_TYPES).join(', ')}`
      )
    }
    expectType(value, STATE_KEY_TYPES[key], key, { nullable: key === 'brandId' })
    if (key === 'brand' && patch.brand) {
      patch.brand = deepMerge(patch.brand, value, 'brand')
    } else {
      patch[key] = value
    }
  }
  if (patch.settings) {
    for (const k of ['canvasWidth', 'canvasHeight']) {
      const v = patch.settings[k]
      if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 16384)) {
        throw badRequest(`settings.${k}: expected a positive number`)
      }
    }
    for (const k of ['fontSize', 'padding']) {
      expectType(patch.settings[k], 'number', `settings.${k}`)
    }
  }
  if (patch.graphics) {
    const seen = new Set()
    patch.graphics.forEach((g, i) => {
      validateGraphic(g, `graphics[${i}]`, { knownTypes })
      if (seen.has(g.id)) throw badRequest(`graphics[${i}].id: duplicate id "${g.id}"`)
      seen.add(g.id)
      validateGraphicData(g.type, g.data, `graphics[${i}].data`)
    })
  }
  return patch
}

/**
 * Validate a full project.json document (on load, activate and import).
 * Lenient about content written by older/newer versions (unknown widget
 * types and extra keys pass through), strict about the shapes the server
 * itself depends on. Returns the (shallow-normalised) state or throws.
 */
export function validateProjectState(data) {
  if (!isPlainObject(data)) throw badRequest('project.json: expected a JSON object')
  const out = { ...data }
  if (out.graphics === undefined) out.graphics = []
  if (!Array.isArray(out.graphics)) throw badRequest('project.json: graphics must be an array')
  out.graphics.forEach((g, i) => validateGraphic(g, `graphics[${i}]`, { strictFields: false }))
  for (const key of ['client', 'brand', 'settings']) {
    if (out[key] !== undefined && out[key] !== null && !isPlainObject(out[key])) {
      throw badRequest(`project.json: ${key} must be an object`)
    }
  }
  return out
}
