/**
 * Experimental features as seen by the browser pages. The server sends the
 * enabled flags in every state (`state.experimental`, from the
 * PROVERLAY_EXPERIMENTAL environment variable; see server/experimental.js).
 */

/** Widget types that are hidden from menus and the operator unless their flag is on. */
export const EXPERIMENTAL_WIDGET_TYPES = Object.freeze({
  f1Timing: 'f1'
})

export function experimentalEnabled(state, flag) {
  return Array.isArray(state?.experimental) && state.experimental.includes(flag)
}

/** False for an experimental widget type whose flag is off. */
export function widgetTypeAvailable(state, type) {
  const flag = Object.hasOwn(EXPERIMENTAL_WIDGET_TYPES, type) ? EXPERIMENTAL_WIDGET_TYPES[type] : null
  return !flag || experimentalEnabled(state, flag)
}
