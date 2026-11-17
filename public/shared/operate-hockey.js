/**
 * Hockey scorebug operate card (hockeyScorebug). Score and clock go through
 * the atomic endpoints; codes, colours, period and quarter length PATCH only
 * the changed fields. Typography stays in the dashboard's Edit settings.
 */
import {
  formatHockeyClock,
  formatHockeyStatusLine,
  HOCKEY_PERIOD_OPTIONS,
  normalizeHockeyCode,
  resolveLiveHockeyClock,
  safeTeamColor
} from '/public/shared/hockey-utils.js'
import { clockRowHtml, runScoreClockAction, scoreRowHtml, updateScoreAndClock } from '/public/shared/operate-match.js'
import { clockOp, escapeHtml, nudgeGridHtml, numberFieldHtml, patchData, setIfIdle, setText } from '/public/shared/operate-ui.js'

const DEFAULT_COLORS = { homeColor: '#E5484D', awayColor: '#3E63DD' }

function periodLabel(live) {
  return HOCKEY_PERIOD_OPTIONS.find((p) => p.value === live.period)?.label || live.period
}

function remainingParts(live) {
  const sec = Math.round(live.remainingMs / 1000)
  return { minute: Math.floor(sec / 60), second: sec % 60, total: sec }
}

const quarterMinutes = (live) => Math.round((live.quarterMs / 60000) * 10) / 10

function colorFieldHtml(label, field, value) {
  return `<label class="field op-field op-field--color">
    <span>${label}</span>
    <input type="color" data-field="${field}" value="${escapeHtml(value)}" />
  </label>`
}

export const hockeyCard = {
  label: 'Hockey scorebug',

  status: (g) => formatHockeyStatusLine(g.data?.clock || {}),

  primary(g) {
    const d = g.data || {}
    const live = resolveLiveHockeyClock(d.clock || {})
    return (
      scoreRowHtml(d, { clockText: formatHockeyClock(d.clock || {}), periodText: periodLabel(live), maxCode: 3 }) +
      clockRowHtml(Boolean(d.clock?.running), HOCKEY_PERIOD_OPTIONS, live.period)
    )
  },

  more(g) {
    const d = g.data || {}
    const live = resolveLiveHockeyClock(d.clock || {})
    const { minute, second } = remainingParts(live)
    return `<div class="pv-group__cell op-grid op-grid--3">
        ${numberFieldHtml('Minute', 'minute', minute, { max: 30 })}
        ${numberFieldHtml('Second', 'second', second, { max: 59 })}
        ${numberFieldHtml('Quarter (min)', 'quarterMin', quarterMinutes(live), { min: 1, max: 20, step: 0.5 })}
      </div>
      <div class="pv-group__cell">${nudgeGridHtml()}</div>
      <div class="pv-group__cell op-grid op-grid--3">
        <button type="button" class="button button--secondary" data-action="reset-quarter">Reset quarter</button>
        ${colorFieldHtml('Home colour', 'homeColor', d.homeColor || DEFAULT_COLORS.homeColor)}
        ${colorFieldHtml('Away colour', 'awayColor', d.awayColor || DEFAULT_COLORS.awayColor)}
      </div>`
  },

  update(card, g) {
    const d = g.data || {}
    const live = resolveLiveHockeyClock(d.clock || {})
    updateScoreAndClock(card, d, {
      clockText: formatHockeyClock(d.clock || {}),
      periodText: periodLabel(live),
      running: Boolean(d.clock?.running),
      period: live.period || 'q1'
    })
    this.tick(card, g)
    setIfIdle(card, '[data-field="quarterMin"]', quarterMinutes(live))
    for (const field of ['homeColor', 'awayColor']) {
      setIfIdle(card, `[data-field="${field}"]`, d[field] || DEFAULT_COLORS[field])
    }
  },

  ticking: (g) => Boolean(g.data?.clock?.running),

  tick(card, g) {
    const live = resolveLiveHockeyClock(g.data?.clock || {})
    const { minute, second } = remainingParts(live)
    setText(card, '[data-bind="clock"]', formatHockeyClock(g.data?.clock || {}))
    setIfIdle(card, '[data-field="minute"]', minute)
    setIfIdle(card, '[data-field="second"]', second)
  },

  async action(g, action, ctx) {
    if (await runScoreClockAction(g, action, ctx)) return
    if (action === 'reset-quarter') return clockOp(g.id, 'reset')
  },

  liveFields: ['homeCode', 'awayCode'],

  async field(g, field, value) {
    const clock = g.data?.clock || {}
    if (field === 'homeCode' || field === 'awayCode') {
      return patchData(g.id, { [field]: normalizeHockeyCode(value) })
    }
    if (field === 'homeColor' || field === 'awayColor') {
      return patchData(g.id, { [field]: safeTeamColor(value, DEFAULT_COLORS[field]) })
    }
    if (field === 'period') {
      // A period change stops the clock (same as before the atomic endpoints).
      if (clock.running) await clockOp(g.id, 'pause')
      return patchData(g.id, { clock: { period: value } })
    }
    if (field === 'minute' || field === 'second') {
      const live = resolveLiveHockeyClock(clock)
      const cur = remainingParts(live)
      const minute = field === 'minute' ? Math.max(0, Number(value) || 0) : cur.minute
      const second = field === 'second' ? Math.min(59, Math.max(0, Number(value) || 0)) : cur.second
      // Ignore a blur/change with the same second so a stale input never jumps the clock.
      if (minute * 60 + second === cur.total) return
      return clockOp(g.id, 'set', (minute * 60 + second) * 1000)
    }
    if (field === 'quarterMin') {
      const live = resolveLiveHockeyClock(clock)
      const quarterMs = Math.round(Math.min(20, Math.max(1, Number(value) || 15)) * 60_000)
      if (quarterMs === live.quarterMs) return
      const ratio = live.quarterMs > 0 ? live.remainingMs / live.quarterMs : 1
      await patchData(g.id, { clock: { quarterMs } })
      // Keep the same share of the quarter left (a full quarter stays full).
      return clockOp(g.id, 'set', Math.round(quarterMs * ratio))
    }
  }
}
