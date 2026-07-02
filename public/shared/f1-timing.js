/**
 * F1 timing tower — shared logic for render, control, and operator.
 *
 * Tower rules (product spec):
 * - Always show the top N (default 5) positions.
 * - The focus driver (default VER) is highlighted.
 * - If the focus driver is outside the top N, he is appended below the
 *   tower with a visual gap, showing his real position.
 */

export const F1_SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'multiviewer', label: 'MultiViewer (live)' }
]

export const F1_GAP_MODES = [
  { value: 'interval', label: 'Interval (gap to car ahead)' },
  { value: 'leader', label: 'Gap to leader' }
]

export const F1_ANIMATION_OPTIONS = [
  { value: 'slide-left', label: 'Slide in (left → right)' },
  { value: 'drop', label: 'Drop down' },
  { value: 'fade', label: 'Fade' },
  { value: 'cut', label: 'Cut (no animation)' }
]

/** Animatieconfig met defaults: P1 eerst, rest volgt snel (stagger). */
export function resolveF1Animation(data = {}) {
  const a = data.animation || {}
  const value = F1_ANIMATION_OPTIONS.some((o) => o.value === a.in) ? a.in : 'slide-left'
  return {
    in: value,
    durationMs: Math.max(100, Number(a.durationMs) || 380),
    staggerMs: Math.max(0, Number(a.staggerMs) >= 0 ? Number(a.staggerMs) : 70)
  }
}

/**
 * @param {Array} rows sorted rows [{pos, code, name, teamColor, gap, interval, retired, inPit}]
 * @returns {{ top: Array, focus: object|null, focusInTop: boolean }}
 */
export function buildTowerRows(rows = [], { focusDriver = '', topCount = 5 } = {}) {
  const sorted = [...rows].sort((a, b) => (a.pos || 999) - (b.pos || 999))
  const top = sorted.slice(0, Math.max(1, topCount))
  const focusCode = (focusDriver || '').trim().toUpperCase()
  if (!focusCode) return { top, focus: null, focusInTop: false }

  const focusRow = sorted.find((r) => (r.code || '').toUpperCase() === focusCode) || null
  const focusInTop = Boolean(focusRow && top.some((r) => r === focusRow))
  return {
    top,
    focus: focusInTop ? null : focusRow,
    focusInTop
  }
}

export function f1RowGapText(row = {}, gapMode = 'interval') {
  if (row.retired) return 'OUT'
  if (row.inPit) return 'PIT'
  if (row.pos === 1) {
    // F1-feed stuurt voor de leider soms "LAP n" als GapToLeader; de ronde
    // staat al in de header, dus de leider toont altijd LEADER.
    const gap = String(row.gap || '')
    if (!gap || gap === 'LEADER' || /^LAP\b/i.test(gap)) return 'LEADER'
    return gap
  }
  const value = gapMode === 'leader' ? row.gap : row.interval || row.gap
  return value || ''
}

export function isFocusRow(row = {}, focusDriver = '') {
  const code = (focusDriver || '').trim().toUpperCase()
  return Boolean(code) && (row.code || '').toUpperCase() === code
}

/** Uniek per code; live data kan dubbele regels bevatten tijdens sessiewissel. */
export function dedupeRows(rows = []) {
  const seen = new Set()
  return rows.filter((r) => {
    const key = `${r.code || ''}-${r.num || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeManualDriver(input = {}, index = 0) {
  return {
    pos: Number(input.pos) || index + 1,
    num: String(input.num ?? '').trim(),
    code: String(input.code || '').trim().toUpperCase().slice(0, 3) || `D${index + 1}`,
    name: String(input.name || '').trim(),
    teamColor: input.teamColor || '#888888',
    gap: String(input.gap ?? '').trim(),
    interval: String(input.interval ?? '').trim(),
    inPit: Boolean(input.inPit),
    retired: Boolean(input.retired)
  }
}

/** Handmatige lijst hernummeren na verplaatsen/verwijderen. */
export function renumberDrivers(drivers = []) {
  return drivers.map((d, i) => ({ ...d, pos: i + 1 }))
}
