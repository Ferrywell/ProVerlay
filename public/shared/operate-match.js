import { patchGraphic, toggleGraphic } from '/public/shared/client.js'
import {
  resolveLiveClock,
  freezeClock,
  startRunningClock,
  PERIOD_OPTIONS,
  widgetVisible,
  penaltiesFeatureEnabled,
  maybeApplyAutoStoppage
} from '/public/shared/match-utils.js'
import { serverNowMs } from '/public/shared/server-time.js'

export { PERIOD_OPTIONS }

export function formatMatchStatusLine(clock = {}) {
  const period = PERIOD_OPTIONS.find((p) => p.value === clock.period)?.label || clock.period || '—'
  const clockState = clock.running ? 'Clock running' : 'Clock stopped'
  return `${period} · ${clockState}`
}

export function adjustMatchClock(clk, deltaSeconds) {
  if (!deltaSeconds) return { ...clk }

  if (clk.running && clk.runningSince) {
    const live = resolveLiveClock(clk)
    let targetTotal = live.minute * 60 + live.second + deltaSeconds
    targetTotal = Math.max(0, targetTotal)
    const reduction = Math.abs(deltaSeconds)

    if (deltaSeconds > 0) {
      const since = new Date(clk.runningSince).getTime()
      return {
        ...clk,
        runningSince: new Date(since - deltaSeconds * 1000).toISOString()
      }
    }

    const elapsed = Math.max(
      0,
      Math.floor((serverNowMs() - new Date(clk.runningSince).getTime()) / 1000)
    )
    const baseTotal = (Number(clk.minute) || 0) * 60 + (Number(clk.second) || 0)

    if (elapsed >= reduction && targetTotal >= baseTotal) {
      const since = new Date(clk.runningSince).getTime()
      return {
        ...clk,
        runningSince: new Date(since - deltaSeconds * 1000).toISOString()
      }
    }

    return {
      ...clk,
      minute: Math.floor(targetTotal / 60),
      second: targetTotal % 60,
      runningSince: new Date(serverNowMs()).toISOString(),
      running: true
    }
  }

  const live = resolveLiveClock(clk)
  let total = live.minute * 60 + live.second + deltaSeconds
  total = Math.max(0, total)
  return {
    ...clk,
    minute: Math.floor(total / 60),
    second: total % 60
  }
}

function penaltyCount(kicks = []) {
  return kicks.filter((k) => k === 'goal').length
}

function nextPenaltySide(homeKicks, awayKicks) {
  return homeKicks.length <= awayKicks.length ? 'home' : 'away'
}

function penaltiesEnabled(data = {}) {
  return penaltiesFeatureEnabled() && data.widgets?.penalties !== false
}

export async function handleMatchOperateAction(graphic, action, event, { confirmDecrement = true } = {}) {
  if (graphic.type !== 'matchScoreboard') return false

  if (action === 'toggle-live') {
    await toggleGraphic(graphic.id, !graphic.visible)
    return true
  }

  const data = structuredClone(graphic.data || {})
  let clk = { ...(data.clock || {}) }
  const pen = {
    ...(data.penalties || {}),
    homeKicks: [...(data.penalties?.homeKicks || [])],
    awayKicks: [...(data.penalties?.awayKicks || [])]
  }

  const syncPenaltyScores = () => {
    pen.homeScore = penaltyCount(pen.homeKicks)
    pen.awayScore = penaltyCount(pen.awayKicks)
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
  if (action === 'min-plus') clk = adjustMatchClock(clk, 60)
  if (action === 'min-minus') clk = adjustMatchClock(clk, -60)
  if (action === 'sec-plus') clk = adjustMatchClock(clk, 15)
  if (action === 'sec-minus') clk = adjustMatchClock(clk, -15)
  if (action === 'sec-plus-1') clk = adjustMatchClock(clk, 1)
  if (action === 'sec-minus-1') clk = adjustMatchClock(clk, -1)
  if (action === 'toggle-stoppage') clk.stoppageTime = !clk.stoppageTime
  if (action === 'toggle-auto-stoppage') clk.autoStoppageAt90 = !clk.autoStoppageAt90
  if (action === 'toggle-clock') {
    clk = clk.running ? freezeClock(clk) : startRunningClock(freezeClock(clk))
  }
  if (action === 'toggle-clock-visible') {
    const widgets = { ...(data.widgets || {}), clock: !widgetVisible(data.widgets, 'clock') }
    await patchGraphic(graphic.id, { data: { widgets } })
    return true
  }
  if (action === 'toggle-penalties') {
    if (!penaltiesFeatureEnabled()) return true
    pen.active = !pen.active
    if (pen.active) clk.period = 'penalties'
  }
  if (action === 'pen-home-goal') {
    if (!penaltiesFeatureEnabled()) return true
    pen.homeKicks.push('goal')
    syncPenaltyScores()
  }
  if (action === 'pen-home-miss') {
    if (!penaltiesFeatureEnabled()) return true
    pen.homeKicks.push('miss')
    syncPenaltyScores()
  }
  if (action === 'pen-away-goal') {
    if (!penaltiesFeatureEnabled()) return true
    pen.awayKicks.push('goal')
    syncPenaltyScores()
  }
  if (action === 'pen-away-miss') {
    if (!penaltiesFeatureEnabled()) return true
    pen.awayKicks.push('miss')
    syncPenaltyScores()
  }
  if (action === 'pen-undo') {
    if (!penaltiesFeatureEnabled()) return true
    if (pen.homeKicks.length > pen.awayKicks.length) pen.homeKicks.pop()
    else if (pen.awayKicks.length) pen.awayKicks.pop()
    syncPenaltyScores()
  }
  if (action === 'pen-reset') {
    if (!penaltiesFeatureEnabled()) return true
    pen.homeKicks = []
    pen.awayKicks = []
    pen.homeScore = 0
    pen.awayScore = 0
  }

  data.clock = clk
  data.penalties = pen
  await patchGraphic(graphic.id, { data })
  return { ...graphic, data: { ...graphic.data, ...data } }
}

function normalizeTeamCode(value) {
  return String(value || '')
    .toUpperCase()
    .slice(0, 4)
}

export async function handleMatchFieldChange(graphic, field, value) {
  if (graphic.type !== 'matchScoreboard') return false

  const data = structuredClone(graphic.data || {})
  let clk = { ...(data.clock || {}) }

  if (field === 'homeCode' || field === 'awayCode') {
    data[field] = normalizeTeamCode(value)
    await patchGraphic(graphic.id, { data })
    return true
  }
  if (field === 'homeName' || field === 'awayName') {
    data[field] = String(value || '').trim()
    await patchGraphic(graphic.id, { data })
    return true
  }

  if (field === 'period') {
    clk.period = value
    if (value === 'penalties' && penaltiesFeatureEnabled()) {
      data.penalties = { ...data.penalties, active: true }
    }
  } else if (clk.running && clk.runningSince) {
    const live = resolveLiveClock(clk)
    if (field === 'minute') {
      const newMinute = Math.max(0, Number(value) || 0)
      clk = adjustMatchClock(clk, (newMinute - live.minute) * 60)
    } else if (field === 'second') {
      const newSecond = Math.min(59, Math.max(0, Number(value) || 0))
      clk = adjustMatchClock(clk, newSecond - live.second)
    }
  } else {
    clk = freezeClock(clk)
    if (field === 'minute') clk.minute = Math.max(0, Number(value) || 0)
    if (field === 'second') clk.second = Math.min(59, Math.max(0, Number(value) || 0))
  }

  data.clock = clk
  await patchGraphic(graphic.id, { data })
  return true
}

export function matchTeamLabel(data, side) {
  if (side === 'home') {
    if (data.showNames && data.homeName) return data.homeName
    return data.homeCode || 'HOME'
  }
  if (data.showNames && data.awayName) return data.awayName
  return data.awayCode || 'AWAY'
}

export function matchPenaltySide(data, penalties = {}) {
  return nextPenaltySide(penalties.homeKicks || [], penalties.awayKicks || [])
}

export function matchPenaltiesVisible(data = {}) {
  const clock = data.clock || {}
  return penaltiesEnabled(data) && clock.period === 'penalties'
}

export function matchPenaltyCount(kicks = []) {
  return penaltyCount(kicks)
}

/** Persist stoppageTime when auto 90+ threshold is crossed while clock runs. */
export async function persistAutoStoppageIfNeeded(graphic) {
  if (graphic?.type !== 'matchScoreboard') return false
  const clk = graphic.data?.clock
  if (!clk?.running) return false
  const next = maybeApplyAutoStoppage(clk)
  if (!next) return false
  const data = { ...graphic.data, clock: next }
  await patchGraphic(graphic.id, { data })
  return true
}
