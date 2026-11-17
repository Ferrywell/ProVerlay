/**
 * Server-side score and clock operations for matchScoreboard and
 * hockeyScorebug. They run inside the state write queue, so concurrent
 * operators / Companion buttons can never lose an increment, and clients do
 * not need to send their (possibly stale) cached `data`.
 *
 * Semantics mirror the browser helpers:
 * - match clock: public/shared/match-utils.js + adjustMatchClock in
 *   public/shared/operate-match.js (counts up from minute:second)
 * - hockey clock: public/shared/hockey-utils.js (counts down remainingMs)
 * The match helpers are imported directly; hockey-utils.js uses an absolute
 * browser import path, so its clock logic is mirrored here.
 */
import { resolveLiveClock, freezeClock, startRunningClock } from '../public/shared/match-utils.js'
import { badRequest } from './validation.js'

export const SCORE_GRAPHIC_TYPES = new Set(['matchScoreboard', 'hockeyScorebug'])
export const CLOCK_ACTIONS = ['start', 'pause', 'toggle', 'reset', 'adjust', 'set']

const MAX_SCORE = 9999
const MAX_CLOCK_MS = 1000 * 60 * 60 * 24

function requireMs(ms, { allowNegative = false } = {}) {
  const n = Number(ms)
  if (ms === undefined || ms === null || ms === '' || !Number.isFinite(n)) {
    throw badRequest('ms: expected a number of milliseconds')
  }
  if (!allowNegative && n < 0) throw badRequest('ms: must be >= 0')
  if (Math.abs(n) > MAX_CLOCK_MS) throw badRequest('ms: out of range')
  return n
}

/* ---------------------------------------------------------------- score */

/** Apply { side, delta } or { side, value } to a score graphic's data. */
export function applyScoreOp(graphic, body = {}) {
  if (!SCORE_GRAPHIC_TYPES.has(graphic.type)) {
    throw badRequest(`Score operations are only supported for ${[...SCORE_GRAPHIC_TYPES].join(', ')}`)
  }
  const side = body.side
  if (side !== 'home' && side !== 'away') throw badRequest("side: expected 'home' or 'away'")
  const key = side === 'home' ? 'homeScore' : 'awayScore'
  const current = Math.max(0, Math.trunc(Number(graphic.data?.[key]) || 0))

  let next
  if (body.value !== undefined) {
    const value = Number(body.value)
    if (!Number.isInteger(value) || value < 0 || value > MAX_SCORE) {
      throw badRequest('value: expected a non-negative integer')
    }
    next = value
  } else {
    const delta = body.delta === undefined ? 1 : Number(body.delta)
    if (!Number.isInteger(delta) || Math.abs(delta) > 100) {
      throw badRequest('delta: expected an integer between -100 and 100')
    }
    next = Math.min(MAX_SCORE, Math.max(0, current + delta))
  }
  return { ...graphic, data: { ...(graphic.data || {}), [key]: next } }
}

/* ----------------------------------------------------------- match clock */

/** Port of adjustMatchClock (public/shared/operate-match.js). */
export function adjustMatchClock(clk, deltaSeconds, now = Date.now()) {
  if (!deltaSeconds) return { ...clk }

  if (clk.running && clk.runningSince) {
    const live = resolveLiveClock(clk)
    const targetTotal = Math.max(0, live.minute * 60 + live.second + deltaSeconds)
    const reduction = Math.abs(deltaSeconds)
    const since = new Date(clk.runningSince).getTime()

    if (deltaSeconds > 0) {
      return { ...clk, runningSince: new Date(since - deltaSeconds * 1000).toISOString() }
    }

    const elapsed = Math.max(0, Math.floor((now - since) / 1000))
    const baseTotal = (Number(clk.minute) || 0) * 60 + (Number(clk.second) || 0)
    if (elapsed >= reduction && targetTotal >= baseTotal) {
      return { ...clk, runningSince: new Date(since - deltaSeconds * 1000).toISOString() }
    }
    return {
      ...clk,
      minute: Math.floor(targetTotal / 60),
      second: targetTotal % 60,
      runningSince: new Date(now).toISOString(),
      running: true
    }
  }

  const live = resolveLiveClock(clk)
  const total = Math.max(0, live.minute * 60 + live.second + deltaSeconds)
  return { ...clk, minute: Math.floor(total / 60), second: total % 60 }
}

function matchClockOp(clk, action, ms) {
  const running = Boolean(clk.running && clk.runningSince)
  switch (action) {
    case 'start':
      // Start on a running clock is a no-op: it must never reset elapsed time.
      return running ? clk : startRunningClock(freezeClock(clk))
    case 'pause':
      return freezeClock(clk)
    case 'toggle':
      return running ? freezeClock(clk) : startRunningClock(freezeClock(clk))
    case 'reset': {
      const total = ms === undefined ? 0 : Math.floor(requireMs(ms) / 1000)
      return {
        ...clk,
        minute: Math.floor(total / 60),
        second: total % 60,
        stoppageTime: false,
        running: false,
        runningSince: null
      }
    }
    case 'adjust':
      return adjustMatchClock(clk, Math.round(requireMs(ms, { allowNegative: true }) / 1000))
    case 'set': {
      const target = Math.floor(requireMs(ms) / 1000)
      if (running) {
        const live = resolveLiveClock(clk)
        return adjustMatchClock(clk, target - (live.minute * 60 + live.second))
      }
      return { ...freezeClock(clk), minute: Math.floor(target / 60), second: target % 60 }
    }
    default:
      throw badRequest(`action: expected one of ${CLOCK_ACTIONS.join(', ')}`)
  }
}

/* ---------------------------------------------------------- hockey clock */

export function resolveLiveHockeyClock(clock = {}, now = Date.now()) {
  const period = clock.period || 'q1'
  const quarterMs = Math.max(1000, Number(clock.quarterMs) || 900000)
  let remainingMs = Math.max(0, Number(clock.remainingMs) || 0)
  if (clock.running && clock.runningSince && period !== 'break') {
    const elapsed = Math.max(0, now - new Date(clock.runningSince).getTime())
    remainingMs = Math.max(0, remainingMs - elapsed)
  }
  remainingMs = Math.min(quarterMs, remainingMs)
  return { period, quarterMs, remainingMs, running: Boolean(clock.running) }
}

export function freezeHockeyClock(clock = {}, now = Date.now()) {
  const live = resolveLiveHockeyClock(clock, now)
  return {
    ...clock,
    remainingMs: live.remainingMs,
    quarterMs: live.quarterMs,
    period: live.period,
    running: false,
    runningSince: null
  }
}

export function startHockeyClock(clock = {}, now = Date.now()) {
  const frozen = freezeHockeyClock(clock, now)
  if (frozen.period === 'break' || frozen.remainingMs <= 0) return frozen
  return { ...frozen, running: true, runningSince: new Date(now).toISOString() }
}

export function setHockeyRemaining(clock = {}, remainingMs = 0, now = Date.now()) {
  const live = resolveLiveHockeyClock(clock, now)
  const next = Math.min(live.quarterMs, Math.max(0, Number(remainingMs) || 0))
  if (clock.running && clock.runningSince && live.period !== 'break') {
    return { ...clock, remainingMs: next, running: true, runningSince: new Date(now).toISOString() }
  }
  return { ...clock, remainingMs: next, running: false, runningSince: null }
}

export function resetHockeyQuarter(clock = {}) {
  const quarterMs = Math.max(1000, Number(clock.quarterMs) || 900000)
  return { ...clock, remainingMs: quarterMs, quarterMs, running: false, runningSince: null }
}

function hockeyClockOp(clk, action, ms) {
  const running = Boolean(clk.running && clk.runningSince)
  switch (action) {
    case 'start':
      return running ? clk : startHockeyClock(clk)
    case 'pause':
      return freezeHockeyClock(clk)
    case 'toggle':
      return running ? freezeHockeyClock(clk) : startHockeyClock(clk)
    case 'reset':
      return resetHockeyQuarter(clk)
    case 'adjust': {
      const delta = requireMs(ms, { allowNegative: true })
      return setHockeyRemaining(clk, resolveLiveHockeyClock(clk).remainingMs + delta)
    }
    case 'set':
      return setHockeyRemaining(clk, requireMs(ms))
    default:
      throw badRequest(`action: expected one of ${CLOCK_ACTIONS.join(', ')}`)
  }
}

/** Apply { action, ms? } to a score graphic's clock. */
export function applyClockOp(graphic, body = {}) {
  if (!SCORE_GRAPHIC_TYPES.has(graphic.type)) {
    throw badRequest(`Clock operations are only supported for ${[...SCORE_GRAPHIC_TYPES].join(', ')}`)
  }
  const action = body.action
  if (!CLOCK_ACTIONS.includes(action)) {
    throw badRequest(`action: expected one of ${CLOCK_ACTIONS.join(', ')}`)
  }
  const clk = { ...(graphic.data?.clock || {}) }
  const next =
    graphic.type === 'matchScoreboard'
      ? matchClockOp(clk, action, body.ms)
      : hockeyClockOp(clk, action, body.ms)
  return { ...graphic, data: { ...(graphic.data || {}), clock: next } }
}
