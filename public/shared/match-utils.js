import { serverNowMs } from './server-time.js'

export function resolveLiveClock(clock = {}) {
  const minute = Number(clock.minute) || 0
  const second = Number(clock.second) || 0
  if (!clock.running || !clock.runningSince) {
    return { ...clock, minute, second }
  }
  const base = minute * 60 + second
  const elapsed = Math.max(0, Math.floor((serverNowMs() - new Date(clock.runningSince).getTime()) / 1000))
  const total = base + elapsed
  return {
    ...clock,
    minute: Math.floor(total / 60),
    second: total % 60
  }
}

/** True when auto 90+ should display (and be persisted on next tick). */
export function shouldEnableAutoStoppage(clock = {}, live = null) {
  if (!clock.autoStoppageAt90 || clock.stoppageTime) return false
  const resolved = live || resolveLiveClock(clock)
  if ((resolved.period || clock.period) !== 'second_half') return false
  if (!clock.running) return false
  const minute = Number(resolved.minute) || 0
  const second = Number(resolved.second) || 0
  return minute > 90 || (minute === 90 && second > 0)
}

export function maybeApplyAutoStoppage(clock = {}) {
  if (!shouldEnableAutoStoppage(clock)) return null
  return { ...clock, stoppageTime: true }
}

export function freezeClock(clock = {}) {
  const live = resolveLiveClock(clock)
  return {
    ...live,
    running: false,
    runningSince: null
  }
}

export function startRunningClock(clock = {}) {
  return {
    ...clock,
    running: true,
    runningSince: new Date(serverNowMs()).toISOString()
  }
}

export function formatClock(clock = {}) {
  const live = resolveLiveClock(clock)
  const minute = Number(live.minute) || 0
  const second = Number(live.second) || 0
  const period = live.period || 'first_half'
  const stoppage = Boolean(live.stoppageTime) || shouldEnableAutoStoppage(clock, live)
  const sec = String(second).padStart(2, '0')

  if (stoppage) {
    const bases = {
      first_half: 45,
      second_half: 90,
      extra_first: 105,
      extra_second: 120
    }
    const base = bases[period]
    if (base !== undefined) {
      const added = Math.max(0, minute - base)
      return `${base}+${added}:${sec}`
    }
  }
  // Altijd 2 cijfers voor de minuten zodat 00:00 even breed is als 68:00
  return `${String(minute).padStart(2, '0')}:${sec}`
}

/** Feature flag — penalty shootout UI/render is off until re-enabled. */
export const MATCH_PENALTIES_ENABLED = false

export function penaltiesFeatureEnabled() {
  return MATCH_PENALTIES_ENABLED
}

const ALL_PERIOD_OPTIONS = [
  { value: 'first_half', label: '1st half' },
  { value: 'second_half', label: '2nd half' },
  { value: 'extra_first', label: 'Extra time 1' },
  { value: 'extra_second', label: 'Extra time 2' },
  { value: 'penalties', label: 'Penalties' }
]

export const PERIOD_OPTIONS = ALL_PERIOD_OPTIONS.filter(
  (p) => p.value !== 'penalties' || MATCH_PENALTIES_ENABLED
)

const DEFAULT_WIDGETS = {
  homeCode: true,
  awayCode: true,
  homeScore: true,
  awayScore: true,
  clock: true,
  penalties: MATCH_PENALTIES_ENABLED
}

export function widgetVisible(widgets, key) {
  if (key === 'penalties' && !MATCH_PENALTIES_ENABLED) return false
  const map = { ...DEFAULT_WIDGETS, ...widgets }
  return map[key] !== false
}

export const DEFAULT_CLOCK_PLATE = {
  enabled: true,
  mode: 'pill',
  heightPx: 120,
  minWidthPx: 180,
  paddingXPx: 24,
  borderRadiusPx: 60,
  background: 'rgba(0,0,0,0.85)',
  gapPx: 12,
  anchor: 'right'
}

export function resolveClockPlate(layout = {}) {
  return { ...DEFAULT_CLOCK_PLATE, ...(layout.clockPlate || {}) }
}

export function clockPlateUsesPill(layout = {}) {
  const cp = resolveClockPlate(layout)
  return cp.enabled && cp.mode === 'pill'
}

export function resolveBindText(bind, data) {
  const widgets = data.widgets || {}
  switch (bind) {
    case 'homeCode':
      return data.showCodes === false || !widgetVisible(widgets, 'homeCode') ? '' : data.homeCode || ''
    case 'awayCode':
      return data.showCodes === false || !widgetVisible(widgets, 'awayCode') ? '' : data.awayCode || ''
    case 'homeName':
      return data.showNames ? data.homeName || '' : ''
    case 'awayName':
      return data.showNames ? data.awayName || '' : ''
    case 'homeScore':
      return widgetVisible(widgets, 'homeScore') ? String(data.homeScore ?? 0) : ''
    case 'awayScore':
      return widgetVisible(widgets, 'awayScore') ? String(data.awayScore ?? 0) : ''
    case 'clock':
      return !widgetVisible(widgets, 'clock') ? '' : formatClock(data.clock)
    case 'penaltyScore':
      if (!MATCH_PENALTIES_ENABLED || !data.penalties?.active || !widgetVisible(widgets, 'penalties')) return ''
      return `${data.penalties.homeScore ?? 0}-${data.penalties.awayScore ?? 0}`
    case 'name':
      return data.name || ''
    case 'title':
      return data.title || ''
    case 'company':
      return data.company || ''
    case 'custom':
      return data.text || ''
    default:
      return ''
  }
}

export function buildPenaltyDots(kicks = []) {
  return kicks
    .map((kick) => {
      if (kick === 'goal') return '<span class="pen-dot pen-dot--goal"></span>'
      if (kick === 'miss') return '<span class="pen-dot pen-dot--miss"></span>'
      return '<span class="pen-dot pen-dot--pending"></span>'
    })
    .join('')
}

export function ensurePenaltySlots(kicks, min = 5) {
  const list = [...kicks]
  while (list.length < min) list.push(null)
  return list
}
