/** Shared keyboard nudge helpers for WYSIWYG editors (percent-based layouts). */

export const NUDGE_FINE_PX = 1
export const NUDGE_COARSE_PX = 10

export function nudgeStepPx(shiftKey, { fine = NUDGE_FINE_PX, coarse = NUDGE_COARSE_PX } = {}) {
  return shiftKey ? coarse : fine
}

export function nudgePercent(value, deltaPx, axisSizePx, { min = 0, max = 100 } = {}) {
  if (!axisSizePx) return value
  const next = value + (deltaPx / axisSizePx) * 100
  return Math.min(max, Math.max(min, next))
}

/**
 * @returns {{ dx: number, dy: number } | null} pixel deltas, or null if not an arrow key
 */
export function arrowKeyDeltas(key, shiftKey, stepPx = nudgeStepPx(shiftKey)) {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -stepPx, dy: 0 }
    case 'ArrowRight':
      return { dx: stepPx, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -stepPx }
    case 'ArrowDown':
      return { dx: 0, dy: stepPx }
    default:
      return null
  }
}

export function isTypingTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
