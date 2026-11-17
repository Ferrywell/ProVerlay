/**
 * Pure helpers on top of the ProVerlay state (GET /api/state, socket `stateChanged`).
 * Nothing in here talks to the network or to Companion, so all of it is unit-tested.
 *
 * Clock maths mirrors the ProVerlay render (public/shared/match-utils.js,
 * public/shared/hockey-utils.js, public/shared/countdown-utils.js), so the
 * Companion variables show exactly what is on air.
 */

export const TYPE_LABELS = {
  matchScoreboard: 'Match scoreboard',
  hockeyScorebug: 'Hockey scorebug',
  customTicker: 'Ticker',
  streamCountdown: 'Countdown',
  lowerThird: 'Lower third',
  lowerThirdShow: 'Lower thirds roster',
  quizShow: 'Quiz',
  message: 'Message',
  image: 'Image',
  f1Timing: 'F1 timing tower',
}

/** Widgets with a score and a clock (atomic /score and /clock endpoints). */
export const SCORE_TYPES = ['matchScoreboard', 'hockeyScorebug']

/** Football periods offered by ProVerlay (penalties are disabled server-side). */
export const MATCH_PERIODS = [
  { id: 'first_half', label: '1st half' },
  { id: 'second_half', label: '2nd half' },
  { id: 'extra_first', label: 'Extra time 1' },
  { id: 'extra_second', label: 'Extra time 2' },
]

/** Hockey periods; `break` is shown as "BREAK" on air. */
export const HOCKEY_PERIODS = [
  { id: 'q1', label: 'Q1' },
  { id: 'q2', label: 'Q2' },
  { id: 'q3', label: 'Q3' },
  { id: 'q4', label: 'Q4' },
  { id: 'break', label: 'Break' },
]

const HOCKEY_QUARTERS = ['q1', 'q2', 'q3', 'q4']

export function typeLabel(type) {
  return TYPE_LABELS[type] || String(type || 'Graphic')
}

export function graphicsOf(state) {
  return Array.isArray(state?.graphics) ? state.graphics.filter((g) => g && typeof g.id === 'string' && g.id) : []
}

export function findGraphic(state, id) {
  if (!id) return undefined
  return graphicsOf(state).find((g) => g.id === id)
}

export function graphicLabel(graphic) {
  return String(graphic?.name || typeLabel(graphic?.type))
}

/* ------------------------------------------------------------ variable keys */

/** Companion variable ids: letters, digits and underscores only. */
export function sanitizeKey(value) {
  const key = String(value ?? '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return key || 'graphic'
}

/**
 * Stable map graphic id → variable key (e.g. "match-scoreboard-3f9a1c2e" →
 * "match_scoreboard_3f9a1c2e"). Collisions after sanitising get a numeric suffix.
 */
export function buildVarKeys(state) {
  const keys = new Map()
  const used = new Set()
  for (const graphic of graphicsOf(state)) {
    const base = sanitizeKey(graphic.id)
    let key = base
    for (let i = 2; used.has(key); i++) key = `${base}_${i}`
    used.add(key)
    keys.set(graphic.id, key)
  }
  return keys
}

/* ------------------------------------------------------------- signature */

/**
 * Everything that action/feedback/preset/variable *definitions* depend on:
 * graphic ids, names and types, plus the sub-items that appear in dropdowns
 * (roster entries, quiz questions, ticker messages). Score, clock and
 * visibility changes do not alter the signature.
 */
export function graphicsSignature(state) {
  return JSON.stringify(
    graphicsOf(state).map((g) => {
      const item = [g.id, g.type, g.name || '']
      const data = g.data || {}
      if (g.type === 'lowerThirdShow') {
        item.push((Array.isArray(data.entries) ? data.entries : []).map((e) => [e?.id, e?.name || '']))
      } else if (g.type === 'quizShow') {
        item.push((Array.isArray(data.questions) ? data.questions : []).map((q) => [q?.id, q?.question || '']))
      } else if (g.type === 'customTicker') {
        item.push(tickerMessages(data).map((m) => [m.id, m.text]))
      } else if (g.type === 'image') {
        item.push(imageItems(g).map((img) => [img.id, img.name || img.src || '']))
      }
      return item
    }),
  )
}

/* ---------------------------------------------------------------- clocks */

export function isClockRunning(clock) {
  return Boolean(clock && clock.running && clock.runningSince)
}

function sinceMs(runningSince) {
  const t = new Date(runningSince).getTime()
  return Number.isFinite(t) ? t : null
}

/** Count-up football clock, floor rounding (same as resolveLiveClock in the render). */
export function resolveMatchClock(clock = {}, nowMs = Date.now()) {
  const c = clock && typeof clock === 'object' ? clock : {}
  const minute = Number(c.minute) || 0
  const second = Number(c.second) || 0
  let total = minute * 60 + second
  const since = c.running ? sinceMs(c.runningSince) : null
  if (since !== null) total += Math.max(0, Math.floor((nowMs - since) / 1000))
  return { minute: Math.floor(total / 60), second: total % 60, total }
}

const STOPPAGE_BASE = { first_half: 45, second_half: 90, extra_first: 105, extra_second: 120 }

/** "MM:SS", or "90+2:13" in stoppage time — identical to formatClock in the render. */
export function formatMatchClock(clock = {}, nowMs = Date.now()) {
  const c = clock && typeof clock === 'object' ? clock : {}
  const live = resolveMatchClock(c, nowMs)
  const period = c.period || 'first_half'
  const autoStoppage =
    Boolean(c.autoStoppageAt90) &&
    !c.stoppageTime &&
    period === 'second_half' &&
    Boolean(c.running) &&
    (live.minute > 90 || (live.minute === 90 && live.second > 0))
  const sec = String(live.second).padStart(2, '0')
  if ((c.stoppageTime || autoStoppage) && STOPPAGE_BASE[period] !== undefined) {
    const base = STOPPAGE_BASE[period]
    return `${base}+${Math.max(0, live.minute - base)}:${sec}`
  }
  return `${String(live.minute).padStart(2, '0')}:${sec}`
}

/** Count-down hockey clock (same as resolveLiveHockeyClock in the render). */
export function resolveHockeyClock(clock = {}, nowMs = Date.now()) {
  const c = clock && typeof clock === 'object' ? clock : {}
  const period = c.period || 'q1'
  const quarterMs = Math.max(1000, Number(c.quarterMs) || 900000)
  let remainingMs = Math.max(0, Number(c.remainingMs) || 0)
  const since = c.running ? sinceMs(c.runningSince) : null
  if (since !== null && period !== 'break') {
    remainingMs = Math.max(0, remainingMs - Math.max(0, nowMs - since))
  }
  return { period, quarterMs, remainingMs: Math.min(quarterMs, remainingMs) }
}

/** "MM:SS" with ceil rounding, "—:—" during a break (same as formatHockeyClock). */
export function formatHockeyClock(clock = {}, nowMs = Date.now()) {
  const live = resolveHockeyClock(clock, nowMs)
  if (live.period === 'break') return '—:—'
  const sec = Math.max(0, Math.ceil(live.remainingMs / 1000))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

export function formatScoreClock(graphic, nowMs = Date.now()) {
  const clock = graphic?.data?.clock
  return graphic?.type === 'hockeyScorebug' ? formatHockeyClock(clock, nowMs) : formatMatchClock(clock, nowMs)
}

/** Remaining time of a stream countdown, "M:SS" or "H:MM:SS" (same as formatCountdown). */
export function formatCountdown(targetDateTime, format = 'mm:ss', nowMs = Date.now()) {
  const target = targetDateTime ? new Date(targetDateTime).getTime() : NaN
  const ms = Number.isFinite(target) ? Math.max(0, target - nowMs) : 0
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (format === 'h:mm:ss') return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${Math.floor(totalSec / 60)}:${String(s).padStart(2, '0')}`
}

export function matchPeriodLabel(period) {
  if (!period) return ''
  return MATCH_PERIODS.find((p) => p.id === period)?.label || String(period)
}

/** On-air label (the render shows "BREAK" during a break). */
export function hockeyPeriodLabel(period) {
  if (period === 'break') return 'BREAK'
  const match = String(period || '').match(/^q([1-4])$/i)
  return match ? `Q${match[1]}` : 'Q1'
}

export function periodLabel(graphic) {
  const period = graphic?.data?.clock?.period
  return graphic?.type === 'hockeyScorebug' ? hockeyPeriodLabel(period) : matchPeriodLabel(period)
}

/**
 * Next / previous hockey period. `lastQuarter` is the quarter that was
 * played before a break (the server only stores "break").
 * With `includeBreaks` the order is Q1, break, Q2, break, Q3, break, Q4.
 */
export function stepHockeyPeriod(current, direction, { lastQuarter = 'q1', includeBreaks = false } = {}) {
  const forward = direction !== 'previous'
  if (current === 'break') {
    const index = Math.max(0, HOCKEY_QUARTERS.indexOf(lastQuarter))
    if (!forward) return HOCKEY_QUARTERS[index]
    return HOCKEY_QUARTERS[Math.min(HOCKEY_QUARTERS.length - 1, index + 1)]
  }
  const index = Math.max(0, HOCKEY_QUARTERS.indexOf(current))
  if (forward) {
    if (index >= HOCKEY_QUARTERS.length - 1) return HOCKEY_QUARTERS[index]
    return includeBreaks ? 'break' : HOCKEY_QUARTERS[index + 1]
  }
  if (index === 0) return HOCKEY_QUARTERS[0]
  return includeBreaks ? 'break' : HOCKEY_QUARTERS[index - 1]
}

export function isHockeyQuarter(period) {
  return HOCKEY_QUARTERS.includes(period)
}

/* ----------------------------------------------------------- time parsing */

/**
 * Parse a clock time typed by the operator: "mm:ss", "m:ss", "hh:mm:ss" or a
 * plain number of seconds. Returns milliseconds, or null when invalid.
 */
export function parseClockTime(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000)
  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.slice(1).some((n) => n > 59)) return null
  const seconds = nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1]
  return seconds * 1000
}

/**
 * Countdown target from "HH:MM" / "HH:MM:SS" (next occurrence, local time of the
 * Companion machine) or any ISO date-time. Returns an ISO string or null.
 */
export function parseTargetTime(text, nowMs = Date.now()) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)]
    if (h > 23 || min > 59 || s > 59) return null
    const target = new Date(nowMs)
    target.setHours(h, min, s, 0)
    if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1)
    return target.toISOString()
  }
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/* --------------------------------------------------------------- tickers */

export function tickerMessages(data) {
  const list = Array.isArray(data?.messages) ? data.messages : []
  return list
    .map((m, i) =>
      typeof m === 'string'
        ? { id: `msg-${i}`, text: m.trim(), enabled: true }
        : { id: m?.id, text: String(m?.text ?? '').trim(), enabled: Boolean(m?.enabled) },
    )
    .filter((m) => m.id && m.text)
}

/** Text that currently scrolls: the enabled messages joined with " • ". */
export function tickerCurrentText(data) {
  return tickerMessages(data)
    .filter((m) => m.enabled)
    .map((m) => m.text)
    .join(' • ')
}

/* -------------------------------------------------------- lower thirds */

export function rosterEntries(graphic) {
  return (Array.isArray(graphic?.data?.entries) ? graphic.data.entries : []).filter((e) => e && e.id)
}

/** Entry id after/before the active one. Without an active entry, next → first, previous → last. */
export function stepEntryId(entries, activeId, direction, { wrap = true } = {}) {
  if (!entries.length) return null
  const index = entries.findIndex((e) => e.id === activeId)
  const forward = direction !== 'previous'
  if (index === -1) return forward ? entries[0].id : entries[entries.length - 1].id
  let next = index + (forward ? 1 : -1)
  if (next < 0 || next >= entries.length) {
    if (!wrap) return null
    next = (next + entries.length) % entries.length
  }
  return entries[next].id
}

/* ----------------------------------------------------------------- image */

export function imageItems(graphic) {
  return (Array.isArray(graphic?.data?.images) ? graphic.data.images : []).filter((img) => img && img.id)
}

export function imageLabel(img) {
  return String(img?.name || img?.src || img?.id || '')
}

export function quizQuestions(graphic) {
  return (Array.isArray(graphic?.data?.questions) ? graphic.data.questions : []).filter((q) => q && q.id)
}

/* -------------------------------------------------------------- choices */

export function graphicChoices(state, types = null, emptyLabel = 'No graphics in the active project') {
  const list = graphicsOf(state).filter((g) => !types || types.includes(g.type))
  const choices = list.map((g) => ({
    id: g.id,
    label: types && types.length === 1 ? graphicLabel(g) : `${graphicLabel(g)} (${typeLabel(g.type)})`,
  }))
  return choices.length ? choices : [{ id: '', label: emptyLabel }]
}

/** Sub-item references are encoded as "<graphicId>|<itemId>". */
export function joinRef(graphicId, itemId) {
  return `${graphicId}|${itemId}`
}

export function splitRef(ref) {
  const value = String(ref ?? '')
  const index = value.indexOf('|')
  if (index <= 0 || index === value.length - 1) return null
  return { graphicId: value.slice(0, index), itemId: value.slice(index + 1) }
}

export function speakerChoices(state) {
  const choices = []
  for (const g of graphicsOf(state)) {
    if (g.type !== 'lowerThirdShow') continue
    for (const e of rosterEntries(g)) {
      choices.push({ id: joinRef(g.id, e.id), label: `${graphicLabel(g)}: ${e.name || e.id}` })
    }
  }
  return choices.length ? choices : [{ id: '', label: 'No speakers in the active project' }]
}

export function questionChoices(state) {
  const choices = []
  for (const g of graphicsOf(state)) {
    if (g.type !== 'quizShow') continue
    for (const q of quizQuestions(g)) {
      choices.push({ id: joinRef(g.id, q.id), label: `${graphicLabel(g)}: ${truncate(q.question || q.id, 60)}` })
    }
  }
  return choices.length ? choices : [{ id: '', label: 'No quiz questions in the active project' }]
}

export function imageChoices(state) {
  const choices = []
  for (const g of graphicsOf(state)) {
    if (g.type !== 'image') continue
    for (const img of imageItems(g)) {
      choices.push({ id: joinRef(g.id, img.id), label: `${graphicLabel(g)}: ${truncate(imageLabel(img), 60)}` })
    }
  }
  return choices.length ? choices : [{ id: '', label: 'No images in the active project' }]
}

export function tickerMessageChoices(state) {
  const choices = []
  for (const g of graphicsOf(state)) {
    if (g.type !== 'customTicker') continue
    for (const m of tickerMessages(g.data)) {
      choices.push({ id: joinRef(g.id, m.id), label: `${graphicLabel(g)}: ${truncate(m.text, 60)}` })
    }
  }
  return choices.length ? choices : [{ id: '', label: 'No ticker messages in the active project' }]
}

export function truncate(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
