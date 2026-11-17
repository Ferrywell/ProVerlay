/**
 * Pure helpers for building partial PATCH bodies (no DOM, safe to import in
 * node tests). The server deep-merges `PATCH /api/graphics/:id` bodies:
 * objects merge, arrays and scalars replace. So a form only has to send the
 * leaves that changed, plus whole arrays when an array changed.
 */

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Structural equality for JSON-like values (`undefined` object keys are ignored). */
export function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
    )
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined)
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined)
    return keysA.length === keysB.length && keysA.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isPlainObject(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clone(v)
    return out
  }
  return value
}

export function isEmptyPatch(patch) {
  return !patch || (isPlainObject(patch) && Object.keys(patch).length === 0)
}

/**
 * Smallest partial of `next` that, deep-merged into `base`, yields `next`.
 * - nested objects are diffed key by key
 * - arrays and scalars are sent whole when they differ
 * - `undefined` in `next` means "leave as is"; keys missing from `next` are
 *   never deleted (a deep merge cannot delete either)
 */
export function diffPatch(base, next) {
  const out = {}
  if (!isPlainObject(next)) return out
  const from = isPlainObject(base) ? base : {}
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    const prev = from[key]
    if (isPlainObject(value)) {
      const sub = diffPatch(isPlainObject(prev) ? prev : {}, value)
      if (!isEmptyPatch(sub)) out[key] = sub
    } else if (!deepEqual(prev, value)) {
      out[key] = clone(value)
    }
  }
  return out
}

function splitPath(path) {
  return String(path).split('.').filter(Boolean)
}

/** Copy of `patch` without the given dotted paths; parents left empty are pruned. */
export function omitPaths(patch, paths = []) {
  const out = clone(patch) || {}
  for (const path of paths) {
    const parts = splitPath(path)
    const trail = []
    let node = out
    for (const part of parts.slice(0, -1)) {
      if (!isPlainObject(node?.[part])) {
        node = null
        break
      }
      trail.push([node, part])
      node = node[part]
    }
    if (!node || !Object.hasOwn(node, parts.at(-1))) continue
    delete node[parts.at(-1)]
    for (let i = trail.length - 1; i >= 0; i--) {
      const [parent, key] = trail[i]
      if (isEmptyPatch(parent[key])) delete parent[key]
      else break
    }
  }
  return out
}

/** Copy of `patch` with only the given dotted paths (and their subtrees). */
export function pickPaths(patch, paths = []) {
  const out = {}
  for (const path of paths) {
    const parts = splitPath(path)
    let src = patch
    for (const part of parts) {
      src = isPlainObject(src) && Object.hasOwn(src, part) ? src[part] : undefined
      if (src === undefined) break
    }
    if (src === undefined) continue
    let dst = out
    for (const part of parts.slice(0, -1)) {
      if (!isPlainObject(dst[part])) dst[part] = {}
      dst = dst[part]
    }
    dst[parts.at(-1)] = clone(src)
  }
  return out
}

/**
 * Fields that live operators (operate cards, Stream Deck / Companion) own:
 * scores and the running clock. Settings forms must never PATCH them — clock
 * changes go through `POST /api/graphics/:id/clock`, scores through `/score`.
 */
export const LIVE_FIELD_PATHS = Object.freeze([
  'data.homeScore',
  'data.awayScore',
  'data.clock.minute',
  'data.clock.second',
  'data.clock.running',
  'data.clock.runningSince',
  'data.clock.remainingMs'
])

export function withoutLiveFields(patch) {
  return omitPaths(patch, LIVE_FIELD_PATHS)
}

/**
 * Merge a server update into a form the user may be editing. All maps are
 * `control key → value` (string or boolean).
 *
 * - `baseline`: server values the form showed when the user started editing
 * - `current`:  what the form shows now (user edits included)
 * - `server`:   what the form would show for the new server state
 * - `pending`:  values this client sent and whose save has not landed yet
 *
 * A field the user did not touch follows the server. A touched field keeps
 * the user's value; when the server changed it too (to something else) it is
 * reported in `conflicts`. Returns the values to show, the new baseline and
 * the keys that are still dirty.
 */
export function reconcileFormValues({ baseline = {}, current = {}, server = {}, pending = {} }) {
  const values = {}
  const nextBaseline = {}
  const conflicts = []
  const dirty = []
  for (const key of Object.keys(server)) {
    const serverValue = server[key]
    const hasCurrent = Object.hasOwn(current, key)
    const currentValue = hasCurrent ? current[key] : serverValue
    const baseValue = Object.hasOwn(baseline, key) ? baseline[key] : serverValue

    if (Object.hasOwn(pending, key) && !deepEqual(serverValue, pending[key])) {
      // Our own save has not reached the server yet: keep what the user sees.
      values[key] = currentValue
      nextBaseline[key] = baseValue
      if (!deepEqual(currentValue, baseValue)) dirty.push(key)
      continue
    }

    const touched = hasCurrent && !deepEqual(currentValue, baseValue)
    if (!touched) {
      values[key] = serverValue
      nextBaseline[key] = serverValue
      continue
    }
    values[key] = currentValue
    nextBaseline[key] = serverValue
    if (!deepEqual(serverValue, baseValue) && !deepEqual(serverValue, currentValue)) conflicts.push(key)
    if (!deepEqual(currentValue, serverValue)) dirty.push(key)
  }
  return { values, baseline: nextBaseline, conflicts, dirty }
}
