/**
 * Match score operate card (matchScoreboard) — rendered by the dashboard
 * operate panel, /operate/:id and /operator through operate-card.js.
 * Score and clock go through the atomic endpoints; other edits PATCH only
 * the changed fields.
 */
import { patchGraphic } from '/public/shared/client.js'
import {
  resolveLiveClock,
  formatClock,
  PERIOD_OPTIONS,
  widgetVisible,
  penaltiesFeatureEnabled,
  maybeApplyAutoStoppage
} from '/public/shared/match-utils.js'
import { serverNowMs } from '/public/shared/server-time.js'
import {
  clockOp,
  escapeHtml,
  nudgeGridHtml,
  numberFieldHtml,
  patchData,
  scoreOp,
  setIfIdle,
  setText,
  syncToggleButton,
  toggleButtonHtml
} from '/public/shared/operate-ui.js'

export { PERIOD_OPTIONS }

export function formatMatchStatusLine(clock = {}) {
  const period = PERIOD_OPTIONS.find((p) => p.value === clock.period)?.label || clock.period || '—'
  const clockState = clock.running ? 'Clock running' : 'Clock stopped'
  return `${period} · ${clockState}`
}

/** Browser mirror of the server's adjust semantics (used by the dashboard settings panel). */
export function adjustMatchClock(clk, deltaSeconds) {
  if (!deltaSeconds) return { ...clk }

  if (clk.running && clk.runningSince) {
    const live = resolveLiveClock(clk)
    const targetTotal = Math.max(0, live.minute * 60 + live.second + deltaSeconds)
    const since = new Date(clk.runningSince).getTime()

    if (deltaSeconds > 0) {
      return { ...clk, runningSince: new Date(since - deltaSeconds * 1000).toISOString() }
    }

    const elapsed = Math.max(0, Math.floor((serverNowMs() - since) / 1000))
    const baseTotal = (Number(clk.minute) || 0) * 60 + (Number(clk.second) || 0)
    if (elapsed >= Math.abs(deltaSeconds) && targetTotal >= baseTotal) {
      return { ...clk, runningSince: new Date(since - deltaSeconds * 1000).toISOString() }
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
  const total = Math.max(0, live.minute * 60 + live.second + deltaSeconds)
  return { ...clk, minute: Math.floor(total / 60), second: total % 60 }
}

const autoStoppageInFlight = new Set()

/** Persist stoppageTime when the auto 90+ threshold is crossed while the clock runs. */
export async function persistAutoStoppageIfNeeded(graphic) {
  if (graphic?.type !== 'matchScoreboard') return false
  const clk = graphic.data?.clock
  if (!clk?.running || !maybeApplyAutoStoppage(clk)) return false
  if (autoStoppageInFlight.has(graphic.id)) return false
  autoStoppageInFlight.add(graphic.id)
  try {
    await patchGraphic(graphic.id, { data: { clock: { stoppageTime: true } } })
  } finally {
    autoStoppageInFlight.delete(graphic.id)
  }
  return true
}

/* ------------------------------------------------------------- penalties */

const penaltyCount = (kicks = []) => kicks.filter((k) => k === 'goal').length
const nextPenaltySide = (pen = {}) =>
  (pen.homeKicks || []).length <= (pen.awayKicks || []).length ? 'home' : 'away'

function penaltiesVisible(data = {}) {
  return penaltiesFeatureEnabled() && data.widgets?.penalties !== false && data.clock?.period === 'penalties'
}

function penaltyCellHtml(d) {
  const pen = d.penalties || {}
  const home = escapeHtml(d.homeCode || 'HOME')
  const away = escapeHtml(d.awayCode || 'AWAY')
  return `<div class="pv-group__cell op-penalties" data-penalties>
    <div class="op-penalties__head">
      <h3>Penalties <span data-bind="pen-score">${penaltyCount(pen.homeKicks)} – ${penaltyCount(pen.awayKicks)}</span></h3>
      ${toggleButtonHtml('toggle-penalties', 'Shootout', pen.active)}
    </div>
    <div class="op-grid op-grid--2" data-pen-kicks>
      <button type="button" class="button button--primary" data-action="pen-home-goal">${home} goal</button>
      <button type="button" class="button button--danger" data-action="pen-home-miss">${home} miss</button>
      <button type="button" class="button button--primary" data-action="pen-away-goal">${away} goal</button>
      <button type="button" class="button button--danger" data-action="pen-away-miss">${away} miss</button>
      <button type="button" class="button button--secondary" data-action="pen-undo">Undo last kick</button>
      <button type="button" class="button button--secondary" data-action="pen-reset">Reset shootout</button>
    </div>
  </div>`
}

function updatePenalties(card, d) {
  const pen = d.penalties || {}
  setText(card, '[data-bind="pen-score"]', `${penaltyCount(pen.homeKicks)} – ${penaltyCount(pen.awayKicks)}`)
  syncToggleButton(card, 'toggle-penalties', pen.active)
  const next = nextPenaltySide(pen)
  for (const side of ['home', 'away']) {
    card.querySelectorAll(`[data-action="pen-${side}-goal"], [data-action="pen-${side}-miss"]`).forEach((btn) => {
      btn.disabled = !pen.active || next !== side
    })
  }
}

function penaltyPatch(d, action) {
  const pen = {
    ...(d.penalties || {}),
    homeKicks: [...(d.penalties?.homeKicks || [])],
    awayKicks: [...(d.penalties?.awayKicks || [])]
  }
  if (action === 'toggle-penalties') pen.active = !pen.active
  const kick = action.match(/^pen-(home|away)-(goal|miss)$/)
  if (kick) pen[`${kick[1]}Kicks`].push(kick[2])
  if (action === 'pen-undo') {
    if (pen.homeKicks.length > pen.awayKicks.length) pen.homeKicks.pop()
    else pen.awayKicks.pop()
  }
  if (action === 'pen-reset') {
    pen.homeKicks = []
    pen.awayKicks = []
  }
  pen.homeScore = penaltyCount(pen.homeKicks)
  pen.awayScore = penaltyCount(pen.awayKicks)
  return pen
}

/* ------------------------------------------------------------------ card */

function periodLabel(clock = {}) {
  return PERIOD_OPTIONS.find((p) => p.value === clock.period)?.label || clock.period || '—'
}

function teamHtml(d, side, maxCode) {
  const code = escapeHtml(d[`${side}Code`] || '')
  const label = side === 'home' ? 'Home' : 'Away'
  const name = d.showNames
    ? `<input class="op-score__name" type="text" data-field="${side}Name" value="${escapeHtml(d[`${side}Name`] || '')}" aria-label="${label} team name" spellcheck="false" />`
    : ''
  return `<div class="op-score__team">
    <input class="op-score__code" type="text" maxlength="${maxCode}" data-field="${side}Code" value="${code}" aria-label="${label} team code" spellcheck="false" />
    ${name}
    <div class="op-score__value" data-bind="${side}Score">${d[`${side}Score`] ?? 0}</div>
    <div class="op-score__buttons">
      <button type="button" class="button button--gray op-score__btn" data-action="score" data-side="${side}" data-delta="-1" aria-label="Lower ${label.toLowerCase()} score">−</button>
      <button type="button" class="button button--tinted op-score__btn" data-action="score" data-side="${side}" data-delta="1" aria-label="Raise ${label.toLowerCase()} score">+</button>
    </div>
  </div>`
}

/** Teams + scores + clock row, shared by match and hockey. */
export function scoreRowHtml(d, { clockText, periodText, maxCode }) {
  return `<div class="pv-group__cell op-score">
    ${teamHtml(d, 'home', maxCode)}
    <div class="op-score__mid">
      <div class="op-score__clock" data-bind="clock">${clockText}</div>
      <div class="op-score__period" data-bind="period">${escapeHtml(periodText)}</div>
    </div>
    ${teamHtml(d, 'away', maxCode)}
  </div>`
}

/** Start/Pause + Period select row, shared by match and hockey. */
export function clockRowHtml(running, options, period) {
  return `<div class="pv-group__cell op-clock">
    <button type="button" class="button ${running ? 'button--gray' : 'button--live'} op-clock__toggle" data-action="toggle-clock">${running ? 'Pause clock' : 'Start clock'}</button>
    <label class="field op-field op-clock__period">
      <span>Period</span>
      <select data-field="period">
        ${options.map((p) => `<option value="${p.value}"${period === p.value ? ' selected' : ''}>${p.label}</option>`).join('')}
      </select>
    </label>
  </div>`
}

export function updateScoreAndClock(card, d, { clockText, periodText, running, period }) {
  setText(card, '[data-bind="homeScore"]', d.homeScore ?? 0)
  setText(card, '[data-bind="awayScore"]', d.awayScore ?? 0)
  setText(card, '[data-bind="clock"]', clockText)
  setText(card, '[data-bind="period"]', periodText)
  for (const field of ['homeCode', 'awayCode', 'homeName', 'awayName']) {
    setIfIdle(card, `[data-field="${field}"]`, d[field] || '')
  }
  setIfIdle(card, '[data-field="period"]', period)
  const btn = card.querySelector('[data-action="toggle-clock"]')
  if (btn) {
    btn.classList.toggle('button--gray', running)
    btn.classList.toggle('button--live', !running)
    btn.textContent = running ? 'Pause clock' : 'Start clock'
  }
}

/** Score ± and Start/Pause/adjust — the atomic part, shared by match and hockey. */
export async function runScoreClockAction(graphic, action, ctx) {
  const target = ctx.target
  if (action === 'score') {
    const side = target.dataset.side
    const delta = Number(target.dataset.delta)
    if (delta < 0 && ctx.confirmDecrement) {
      const code = graphic.data?.[`${side}Code`] || side.toUpperCase()
      if (!window.confirm(`Lower ${code} score by 1?`)) return true
    }
    await scoreOp(graphic.id, side, delta)
    return true
  }
  if (action === 'toggle-clock') {
    // Explicit start/pause from what the operator sees: two operators tapping
    // Start at once must not stop the clock again.
    await clockOp(graphic.id, graphic.data?.clock?.running ? 'pause' : 'start')
    return true
  }
  if (action === 'clock-adjust') {
    await clockOp(graphic.id, 'adjust', Number(target.dataset.ms))
    return true
  }
  return false
}

export const matchCard = {
  label: 'Match score',

  status: (g) => formatMatchStatusLine(g.data?.clock || {}),

  /** Re-render the body when its structure changes. */
  shape: (g) => `${Boolean(g.data?.showNames)}:${penaltiesVisible(g.data)}`,

  primary(g) {
    const d = g.data || {}
    const clock = d.clock || {}
    return (
      scoreRowHtml(d, { clockText: formatClock(clock), periodText: periodLabel(clock), maxCode: 4 }) +
      clockRowHtml(clock.running, PERIOD_OPTIONS, clock.period) +
      (penaltiesVisible(d) ? penaltyCellHtml(d) : '')
    )
  },

  more(g) {
    const d = g.data || {}
    const clock = d.clock || {}
    const live = resolveLiveClock(clock)
    const clockShown = widgetVisible(d.widgets, 'clock')
    return `<div class="pv-group__cell op-grid op-grid--2">
        ${numberFieldHtml('Minute', 'minute', live.minute ?? 0, { max: 130 })}
        ${numberFieldHtml('Second', 'second', live.second ?? 0, { max: 59 })}
      </div>
      <div class="pv-group__cell">${nudgeGridHtml()}</div>
      <div class="pv-group__cell op-grid op-grid--auto">
        ${toggleButtonHtml('toggle-stoppage', 'Stoppage time (45+/90+)', clock.stoppageTime)}
        ${toggleButtonHtml('toggle-auto-stoppage', "Auto stoppage from 90'", clock.autoStoppageAt90)}
        <button type="button" class="button button--gray" data-action="toggle-clock-visible">${clockShown ? 'Hide clock' : 'Show clock'}</button>
      </div>`
  },

  update(card, g) {
    const d = g.data || {}
    const clock = d.clock || {}
    updateScoreAndClock(card, d, {
      clockText: formatClock(clock),
      periodText: periodLabel(clock),
      running: Boolean(clock.running),
      period: clock.period || 'first_half'
    })
    this.tick(card, g)
    syncToggleButton(card, 'toggle-stoppage', clock.stoppageTime)
    syncToggleButton(card, 'toggle-auto-stoppage', clock.autoStoppageAt90)
    setText(card, '[data-action="toggle-clock-visible"]', widgetVisible(d.widgets, 'clock') ? 'Hide clock' : 'Show clock')
    if (card.querySelector('[data-penalties]')) updatePenalties(card, d)
  },

  ticking: (g) => Boolean(g.data?.clock?.running),

  tick(card, g) {
    const clock = g.data?.clock || {}
    const live = resolveLiveClock(clock)
    setText(card, '[data-bind="clock"]', formatClock(clock))
    setIfIdle(card, '[data-field="minute"]', live.minute ?? 0)
    setIfIdle(card, '[data-field="second"]', live.second ?? 0)
    if (clock.running) void persistAutoStoppageIfNeeded(g)
  },

  async action(g, action, ctx) {
    if (await runScoreClockAction(g, action, ctx)) return
    const d = g.data || {}
    const clock = d.clock || {}
    if (action === 'toggle-stoppage') return patchData(g.id, { clock: { stoppageTime: !clock.stoppageTime } })
    if (action === 'toggle-auto-stoppage') {
      return patchData(g.id, { clock: { autoStoppageAt90: !clock.autoStoppageAt90 } })
    }
    if (action === 'toggle-clock-visible') {
      return patchData(g.id, { widgets: { clock: !widgetVisible(d.widgets, 'clock') } })
    }
    if (action === 'toggle-penalties' || action.startsWith('pen-')) {
      if (!penaltiesFeatureEnabled()) return
      return patchData(g.id, { penalties: penaltyPatch(d, action) })
    }
  },

  /** Fields saved while typing (debounced) instead of on change. */
  liveFields: ['homeCode', 'awayCode', 'homeName', 'awayName'],

  async field(g, field, value) {
    if (field === 'homeCode' || field === 'awayCode') {
      return patchData(g.id, { [field]: String(value || '').toUpperCase().slice(0, 4) })
    }
    if (field === 'homeName' || field === 'awayName') {
      return patchData(g.id, { [field]: String(value || '').trim() })
    }
    if (field === 'period') {
      const data = { clock: { period: value } }
      if (value === 'penalties' && penaltiesFeatureEnabled()) data.penalties = { active: true }
      return patchData(g.id, data)
    }
    if (field === 'minute' || field === 'second') {
      const live = resolveLiveClock(g.data?.clock || {})
      const minute = field === 'minute' ? Math.max(0, Number(value) || 0) : live.minute
      const second = field === 'second' ? Math.min(59, Math.max(0, Number(value) || 0)) : live.second
      if (minute === live.minute && second === live.second) return
      return clockOp(g.id, 'set', (minute * 60 + second) * 1000)
    }
  }
}
