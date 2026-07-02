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

export const F1_DECIMAL_OPTIONS = [
  { value: '1', label: '1 decimal (F1 style)' },
  { value: '0', label: '0 decimals' },
  { value: '2', label: '2 decimals' },
  { value: '3', label: '3 decimals' },
  { value: 'auto', label: 'Feed (as-is)' }
]

/** Aantal decimalen voor gaps; 'auto' = feedwaarde onbewerkt tonen. */
export function resolveF1Decimals(data = {}) {
  const v = data.gapDecimals
  if (v === 'auto') return 'auto'
  const n = Number(v)
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n
  return 1
}

/** "+1.234" → "+1.2" (bij 1 decimaal); niet-numerieke gaps ("+1 LAP") blijven staan. */
export function formatF1Gap(text, decimals) {
  const raw = String(text || '').trim()
  if (decimals === 'auto' || !raw) return raw
  const m = /^([+-]?)(\d+(?:\.\d+)?)$/.exec(raw)
  if (!m) return raw
  return `${m[1]}${Number(m[2]).toFixed(decimals)}`
}

/** Track status → header-styling en optioneel SC/VSC-label. */
export function f1TrackFlag(session = {}) {
  const track = session.track || 'clear'
  if (track === 'sc') return { track, label: 'SC' }
  if (track === 'vsc') return { track, label: 'VSC' }
  if (track === 'yellow' || track === 'red') return { track, label: '' }
  return { track: 'clear', label: '' }
}

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

export function f1RowGapText(row = {}, gapMode = 'interval', decimals = 'auto') {
  if (row.retired) return 'OUT'
  if (row.inPit) return 'PIT'
  if (row.pos === 1) {
    // F1-feed stuurt voor de leider soms "LAP n" als GapToLeader; de ronde
    // staat al in de header, dus de leider toont altijd LEADER.
    const gap = String(row.gap || '')
    if (!gap || gap === 'LEADER' || /^LAP\b/i.test(gap)) return 'LEADER'
    return formatF1Gap(gap, decimals)
  }
  const value = gapMode === 'leader' ? row.gap : row.interval || row.gap
  return formatF1Gap(value || '', decimals)
}

const F1_TYRE_COLORS = {
  SOFT: '#ff2d2d',
  MEDIUM: '#ffd12e',
  HARD: '#e8e8e8',
  INTERMEDIATE: '#39b54a',
  WET: '#2f80ff',
  TEST_UNKNOWN: '#b0b0b0',
  UNKNOWN: '#b0b0b0'
}

/** Bandencompound → letter + kleur voor de band-indicator in de rij. */
export function f1TyreInfo(row = {}) {
  const compound = String(row.tyre || '').trim().toUpperCase()
  if (!compound) return null
  return {
    letter: compound === 'INTERMEDIATE' ? 'I' : compound.charAt(0),
    color: F1_TYRE_COLORS[compound] || F1_TYRE_COLORS.UNKNOWN
  }
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
    tyre: String(input.tyre || '').trim().toUpperCase(),
    inPit: Boolean(input.inPit),
    retired: Boolean(input.retired),
    finished: Boolean(input.finished)
  }
}

/** Handmatige lijst hernummeren na verplaatsen/verwijderen. */
export function renumberDrivers(drivers = []) {
  return drivers.map((d, i) => ({ ...d, pos: i + 1 }))
}
