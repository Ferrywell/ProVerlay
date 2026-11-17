/**
 * Experimental features, switched on with an environment variable:
 *
 *   PROVERLAY_EXPERIMENTAL=f1        (comma or space separated, case-insensitive)
 *
 * An experimental feature is left out of the open-source release's menus,
 * operator and Companion presets, but its code stays. Existing projects that
 * already use it keep rendering and keep their dashboard card either way.
 *
 * The variable is read on every call, so tests (and a restarted server) pick
 * up changes without a module reload.
 */
import { EXPERIMENTAL_WIDGET_TYPES } from '../public/shared/experimental.js'

/** Known flags and what they unlock. */
export const EXPERIMENTAL_FLAGS = Object.freeze({
  f1: 'F1 timing tower (f1Timing widget)'
})

/** Widget types that can only be created while their flag is on (shared with the pages). */
export { EXPERIMENTAL_WIDGET_TYPES }

/** Enabled flags, sorted; unknown names are ignored. */
export function experimentalFeatures(env = process.env) {
  const raw = String(env.PROVERLAY_EXPERIMENTAL || '')
  const names = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => Object.hasOwn(EXPERIMENTAL_FLAGS, s))
  return [...new Set(names)].sort()
}

export function isExperimentalEnabled(flag, env = process.env) {
  return experimentalFeatures(env).includes(flag)
}

/** The flag a widget type needs, or null when the type is not experimental. */
export function experimentalFlagForType(type) {
  return typeof type === 'string' && Object.hasOwn(EXPERIMENTAL_WIDGET_TYPES, type)
    ? EXPERIMENTAL_WIDGET_TYPES[type]
    : null
}
