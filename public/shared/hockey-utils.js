import { serverNowMs } from '/public/shared/server-time.js'

export const HOCKEY_PERIOD_OPTIONS = [
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
  { value: 'break', label: 'RUST' }
]

export const HOCKEY_RING_R = 47.175
export const HOCKEY_RING_C = 2 * Math.PI * HOCKEY_RING_R

export function defaultHockeyScorebugData() {
  return {
    homeCode: 'NED',
    awayCode: 'ARG',
    homeScore: 0,
    awayScore: 0,
    homeColor: '#FF7621',
    awayColor: '#74ACDF',
    clock: {
      period: 'q2',
      remainingMs: 775000,
      quarterMs: 900000,
      running: false,
      runningSince: null
    },
    animation: {
      enabled: true,
      durationMs: 420
    },
    style: {
      scale: 1
    }
  }
}

export function hockeyPeriodLabel(period) {
  if (period === 'break') return 'RUST'
  const match = String(period || '').match(/^q([1-4])$/i)
  return match ? `Q${match[1]}` : 'Q1'
}

export function formatHockeyClock(clock = {}) {
  const live = resolveLiveHockeyClock(clock)
  if (live.period === 'break') return '—:—'
  const sec = Math.max(0, Math.round(live.remainingMs / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatHockeyStatusLine(clock = {}) {
  const live = resolveLiveHockeyClock(clock)
  const period = hockeyPeriodLabel(live.period)
  const state = clock.running ? 'Clock running' : 'Clock stopped'
  return `${period} · ${state}`
}

/** Live remaining + fill progress (0 empty → 1 full). */
export function resolveLiveHockeyClock(clock = {}) {
  const period = clock.period || 'q1'
  const quarterMs = Math.max(1000, Number(clock.quarterMs) || 900000)
  let remainingMs = Math.max(0, Number(clock.remainingMs) || 0)

  if (clock.running && clock.runningSince && period !== 'break') {
    const elapsed = Math.max(0, serverNowMs() - new Date(clock.runningSince).getTime())
    remainingMs = Math.max(0, remainingMs - elapsed)
  }

  remainingMs = Math.min(quarterMs, remainingMs)
  const elapsedMs = period === 'break' ? 0 : quarterMs - remainingMs
  const progress = period === 'break' ? 0 : elapsedMs / quarterMs

  return {
    period,
    quarterMs,
    remainingMs,
    elapsedMs,
    progress,
    running: Boolean(clock.running)
  }
}

export function freezeHockeyClock(clock = {}) {
  const live = resolveLiveHockeyClock(clock)
  return {
    ...clock,
    remainingMs: live.remainingMs,
    quarterMs: live.quarterMs,
    period: live.period,
    running: false,
    runningSince: null
  }
}

export function startHockeyClock(clock = {}) {
  const frozen = freezeHockeyClock(clock)
  if (frozen.period === 'break' || frozen.remainingMs <= 0) return frozen
  return {
    ...frozen,
    running: true,
    runningSince: new Date(serverNowMs()).toISOString()
  }
}

/** Set absolute remaining; keeps counting if the clock was running. */
export function setHockeyRemaining(clock = {}, remainingMs = 0) {
  const live = resolveLiveHockeyClock(clock)
  const next = Math.min(live.quarterMs, Math.max(0, Number(remainingMs) || 0))
  if (clock.running && clock.runningSince && live.period !== 'break') {
    return {
      ...clock,
      remainingMs: next,
      running: true,
      runningSince: new Date(serverNowMs()).toISOString()
    }
  }
  return {
    ...clock,
    remainingMs: next,
    running: false,
    runningSince: null
  }
}

export function adjustHockeyRemaining(clock = {}, deltaMs = 0) {
  const live = resolveLiveHockeyClock(clock)
  return setHockeyRemaining(clock, live.remainingMs + deltaMs)
}

export function resetHockeyQuarter(clock = {}) {
  const quarterMs = Math.max(1000, Number(clock.quarterMs) || 900000)
  return {
    ...clock,
    remainingMs: quarterMs,
    quarterMs,
    running: false,
    runningSince: null
  }
}

export function safeTeamColor(value, fallback) {
  const v = String(value || '').trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback
}

export function normalizeHockeyCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
}
