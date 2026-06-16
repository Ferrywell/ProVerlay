/**
 * Client-side device class (Design Brief v1.0).
 * Server redirect on `/` uses UA heuristics; use this in the browser for layout.
 */
export function detectClientDevice() {
  const isTouch = navigator.maxTouchPoints > 0
  const w = window.innerWidth
  if (w >= 1024 && !isTouch) return 'desktop'
  if (w >= 768 || (isTouch && w >= 600)) return 'tablet'
  return 'mobile'
}

export function preferredClientDashboard(device = detectClientDevice()) {
  if (device === 'desktop') return 'control'
  return 'operator'
}

/** Widget id from `/operate/:id` or `?graphic=id`. */
export function resolveOperateWidgetId() {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('graphic') || params.get('widget')
  if (fromQuery) return fromQuery
  const parts = window.location.pathname.split('/').filter(Boolean)
  const operateIdx = parts.indexOf('operate')
  if (operateIdx !== -1 && parts[operateIdx + 1]) return decodeURIComponent(parts[operateIdx + 1])
  return null
}

/** Widget id for `/editor?graphic=id` (path param handled by server redirect). */
export function resolveEditorGraphicId() {
  const params = new URLSearchParams(window.location.search)
  return params.get('graphic') || params.get('widget') || null
}
