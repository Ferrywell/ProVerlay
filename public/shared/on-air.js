/**
 * One live vocabulary for every page:
 * - "ON AIR" badge (`.pill--on-air`) = visible on the combined /render output
 * - "Solo source" badge (`.pill--solo`) = visible on its own ?graphic= Browser Source
 * - Buttons: "Go live" (`.button--go-live`) / "Take off air" (`.button--gray`)
 */

export const GO_LIVE_LABEL = 'Go live'
export const TAKE_OFF_AIR_LABEL = 'Take off air'

export function liveButtonLabel(visible) {
  return visible ? TAKE_OFF_AIR_LABEL : GO_LIVE_LABEL
}

export function liveButtonClass(visible) {
  return visible ? 'button--gray' : 'button--go-live'
}

export function onAirBadgeHtml(visible, { bind = false } = {}) {
  const bindAttr = bind ? ' data-bind="live-pill"' : ''
  return `<span class="pill pill--on-air"${bindAttr} title="Visible on the combined /render output"${visible ? '' : ' hidden'}>ON AIR</span>`
}

/** Update a badge rendered by onAirBadgeHtml(…, { bind: true }). */
export function syncOnAirBadge(badge, visible) {
  if (!badge) return
  badge.className = 'pill pill--on-air'
  badge.textContent = 'ON AIR'
  badge.hidden = !visible
}

/** Update a Go live / Take off air button in place (keeps extra classes like touch-btn). */
export function syncLiveButton(button, visible) {
  if (!button) return
  button.classList.remove('button--gray', 'button--live', 'button--go-live')
  button.classList.add(liveButtonClass(visible))
  button.textContent = liveButtonLabel(visible)
  button.setAttribute('aria-pressed', String(Boolean(visible)))
}

const POSITION_LABELS = {
  center: 'center',
  'top-center': 'top center',
  'top-left': 'top left',
  'top-right': 'top right',
  'bottom-center': 'bottom center',
  'bottom-left': 'bottom left',
  'bottom-right': 'bottom right',
  'bottom-full': 'bottom (full width)'
}

function freePoint(graphic) {
  const p = graphic?.data?.placementFree
  if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return null
  return { x: Number(p.x), y: Number(p.y) }
}

/**
 * On-air graphics that would sit on top of `graphic` when it goes live.
 * Deliberately simple: same anchor `position`, or two custom placements whose
 * anchor points are within a few percent of each other.
 */
export function findOnAirOverlaps(graphic, graphics = []) {
  const overlaps = []
  for (const other of graphics) {
    if (!other || other.id === graphic.id || !other.visible) continue
    if (graphic.position && graphic.position !== 'custom' && other.position === graphic.position) {
      overlaps.push({ graphic: other, where: POSITION_LABELS[graphic.position] || graphic.position })
      continue
    }
    if (graphic.position === 'custom' && other.position === 'custom') {
      const a = freePoint(graphic)
      const b = freePoint(other)
      if (a && b && Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 8) {
        overlaps.push({ graphic: other, where: 'the same custom position' })
      }
    }
  }
  return overlaps
}

export function overlapWarningText(graphic, overlaps) {
  if (!overlaps.length) return ''
  const names = overlaps.map((o) => o.graphic.name || o.graphic.id)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return `${graphic.name || 'This graphic'} overlaps ${list} at ${overlaps[0].where}`
}
