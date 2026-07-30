import { patchGraphic, toggleGraphic } from '/public/shared/client.js'
import {
  adjustHockeyRemaining,
  freezeHockeyClock,
  normalizeHockeyCode,
  resetHockeyQuarter,
  resolveLiveHockeyClock,
  safeTeamColor,
  setHockeyRemaining,
  startHockeyClock
} from '/public/shared/hockey-utils.js'

const actionQueues = new Map()
const optimisticData = new Map()

function enqueue(graphicId, fn) {
  const prev = actionQueues.get(graphicId) || Promise.resolve()
  const next = prev.then(fn, fn)
  actionQueues.set(
    graphicId,
    next.catch(() => {}).finally(() => {
      if (actionQueues.get(graphicId) === next) actionQueues.delete(graphicId)
    })
  )
  return next
}

export async function handleHockeyOperateAction(graphic, action, event, { confirmDecrement = false } = {}) {
  if (graphic.type !== 'hockeyScorebug') return false
  return enqueue(graphic.id, () => runHockeyAction(graphic, action, event, { confirmDecrement }))
}

async function runHockeyAction(graphic, action, event, { confirmDecrement }) {
  const prior = optimisticData.get(graphic.id)
  const data = structuredClone(prior || graphic.data || {})
  let clk = { ...(data.clock || {}) }

  if (action === 'toggle-live') {
    await toggleGraphic(graphic.id, !graphic.visible)
    return true
  }

  if (action === 'home-plus') data.homeScore = (data.homeScore ?? 0) + 1
  if (action === 'home-minus') {
    if (confirmDecrement && !confirm(`Lower ${data.homeCode || 'HOME'} score by 1?`)) return true
    data.homeScore = Math.max(0, (data.homeScore ?? 0) - 1)
  }
  if (action === 'away-plus') data.awayScore = (data.awayScore ?? 0) + 1
  if (action === 'away-minus') {
    if (confirmDecrement && !confirm(`Lower ${data.awayCode || 'AWAY'} score by 1?`)) return true
    data.awayScore = Math.max(0, (data.awayScore ?? 0) - 1)
  }

  if (action === 'min-plus') clk = adjustHockeyRemaining(clk, 60_000)
  if (action === 'min-minus') clk = adjustHockeyRemaining(clk, -60_000)
  if (action === 'sec-plus') clk = adjustHockeyRemaining(clk, 15_000)
  if (action === 'sec-minus') clk = adjustHockeyRemaining(clk, -15_000)
  if (action === 'sec-plus-1') clk = adjustHockeyRemaining(clk, 1000)
  if (action === 'sec-minus-1') clk = adjustHockeyRemaining(clk, -1000)
  if (action === 'toggle-clock') {
    // Server clock is source of truth for run-state — field edits are not queued
    // and can leave optimisticData.running stale (Start would freeze instead).
    const serverClk = graphic.data?.clock || {}
    if (Boolean(serverClk.running) !== Boolean(clk.running)) {
      clk = { ...serverClk }
    }
    clk = clk.running ? freezeHockeyClock(clk) : startHockeyClock(clk)
  }
  if (action === 'reset-quarter') {
    clk = resetHockeyQuarter(clk)
  }
  if (action === 'set-period') {
    const period = event?.target?.closest('[data-period]')?.dataset.period
    if (period) clk.period = period
  }

  data.clock = clk
  optimisticData.set(graphic.id, data)
  await patchGraphic(graphic.id, { data })
  return { ...graphic, data }
}

export async function handleHockeyFieldChange(graphic, field, value) {
  if (graphic.type !== 'hockeyScorebug') return false

  // Keep optimistic queue in sync with field edits (same base as nudge buttons).
  const prior = optimisticData.get(graphic.id)
  const data = structuredClone(prior || graphic.data || {})
  let clk = { ...(data.clock || {}) }

  if (field === 'homeCode' || field === 'awayCode') {
    data[field] = normalizeHockeyCode(value)
    optimisticData.set(graphic.id, data)
    await patchGraphic(graphic.id, { data })
    return true
  }

  if (field === 'homeColor' || field === 'awayColor') {
    const fallback = field === 'homeColor' ? '#FF7621' : '#74ACDF'
    data[field] = safeTeamColor(value, fallback)
    optimisticData.set(graphic.id, data)
    await patchGraphic(graphic.id, { data })
    return true
  }

  if (field === 'period') {
    clk = freezeHockeyClock(clk)
    clk.period = value
  } else if (field === 'quarterMin') {
    const minutes = Math.min(20, Math.max(1, Number(value) || 15))
    const quarterMs = Math.round(minutes * 60_000)
    const live = resolveLiveHockeyClock(clk)
    const ratio = live.quarterMs > 0 ? live.remainingMs / live.quarterMs : 1
    const wasRunning = Boolean(clk.running && clk.runningSince)
    clk = setHockeyRemaining(
      { ...clk, quarterMs },
      Math.round(quarterMs * ratio)
    )
    if (!wasRunning) {
      clk.running = false
      clk.runningSince = null
    }
  } else if (field === 'minute' || field === 'second') {
    // Spinner ±1: adjust remaining, keep clock running (same as nudge buttons).
    const live = resolveLiveHockeyClock(clk)
    const curSec = Math.round(live.remainingMs / 1000)
    let m = Math.floor(curSec / 60)
    let s = curSec % 60
    if (field === 'minute') m = Math.max(0, Number(value) || 0)
    if (field === 'second') s = Math.min(59, Math.max(0, Number(value) || 0))
    const nextMs = (m * 60 + s) * 1000
    // Ignore blur/change with the same second — otherwise Start steals focus,
    // re-applies a stale input value and jumps the clock.
    if (Math.round(nextMs / 1000) === curSec) {
      return true
    }
    clk = setHockeyRemaining(clk, nextMs)
  }

  data.clock = clk
  optimisticData.set(graphic.id, data)
  await patchGraphic(graphic.id, { data })
  return true
}
