/**
 * {{variables}} in text fields. One helper for the render and the control
 * pages, so a preview always matches the output.
 *
 * Sources, later ones win:
 *   1. built-ins: date, time, and the project's (first) scorebug:
 *      home.code, home.name, home.score, away.code, away.name, away.score, clock, period
 *   2. state.variables          project key/value pairs (Data page)
 *   3. state.sourceVariables    filled from a data source (key/value columns)
 *
 * Unknown variables render as an empty string on air; the Data page lists
 * which ones are used but not defined.
 */
import { formatClock, PERIOD_OPTIONS } from './match-utils.js'
import { serverNowMs } from './server-time.js'

export const VARIABLE_RE = /\{\{\s*([A-Za-z0-9_.-]{1,80})\s*\}\}/g
/** Variables whose value changes with time (the render refreshes them every second). */
export const LIVE_VARIABLES = new Set(['time', 'clock', 'date'])

export const BUILTIN_VARIABLES = [
  { key: 'date', label: 'Today (YYYY-MM-DD)' },
  { key: 'time', label: 'Current time (HH:MM)' },
  { key: 'home.code', label: 'Scorebug: home code' },
  { key: 'home.name', label: 'Scorebug: home name (code when empty)' },
  { key: 'home.score', label: 'Scorebug: home score' },
  { key: 'away.code', label: 'Scorebug: away code' },
  { key: 'away.name', label: 'Scorebug: away name (code when empty)' },
  { key: 'away.score', label: 'Scorebug: away score' },
  { key: 'clock', label: 'Scorebug: clock as on air' },
  { key: 'period', label: 'Scorebug: period (1st half, Q2, …)' }
]

const SCORE_TYPES = ['matchScoreboard', 'hockeyScorebug']

/* Hockey clock text, same rules as hockey-utils.js (count-down, ceil). Kept
   here because hockey-utils.js is browser-only (absolute import path). */
function hockeyPeriodLabel(period) {
  if (period === 'break') return 'BREAK'
  const m = String(period || '').match(/^q([1-4])$/i)
  return m ? `Q${m[1]}` : 'Q1'
}

function formatHockeyClock(clock = {}, nowMs) {
  const c = clock && typeof clock === 'object' ? clock : {}
  if (c.period === 'break') return '—:—'
  const quarterMs = Math.max(1000, Number(c.quarterMs) || 900000)
  let remaining = Math.max(0, Number(c.remainingMs) || 0)
  if (c.running && c.runningSince) remaining = Math.max(0, remaining - Math.max(0, nowMs - new Date(c.runningSince).getTime()))
  const sec = Math.max(0, Math.ceil(Math.min(quarterMs, remaining) / 1000))
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`
}
const pad = (n) => String(n).padStart(2, '0')

export function hasVariables(text) {
  VARIABLE_RE.lastIndex = 0
  return typeof text === 'string' && VARIABLE_RE.test(text)
}

export function variableNames(text) {
  if (typeof text !== 'string') return []
  return [...text.matchAll(VARIABLE_RE)].map((m) => m[1])
}

function scorebug(graphics) {
  const list = (Array.isArray(graphics) ? graphics : []).filter((g) => g && SCORE_TYPES.includes(g.type))
  return list.find((g) => g.visible) || list[0] || null
}

function scoreVariables(g, nowMs) {
  if (!g) return {}
  const d = g.data && typeof g.data === 'object' ? g.data : {}
  const hockey = g.type === 'hockeyScorebug'
  const period = hockey
    ? hockeyPeriodLabel(d.clock?.period)
    : PERIOD_OPTIONS.find((p) => p.value === (d.clock?.period || 'first_half'))?.label || ''
  return {
    'home.code': String(d.homeCode ?? ''),
    'away.code': String(d.awayCode ?? ''),
    'home.name': String(d.homeName || d.homeCode || ''),
    'away.name': String(d.awayName || d.awayCode || ''),
    'home.score': String(Number(d.homeScore) || 0),
    'away.score': String(Number(d.awayScore) || 0),
    clock: hockey ? formatHockeyClock(d.clock, nowMs) : formatClock(d.clock),
    period
  }
}

/** Variable values for a state at `nowMs` (server time). */
export function variableContext(state, nowMs = serverNowMs()) {
  const now = new Date(nowMs)
  const values = {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    ...scoreVariables(scorebug(state?.graphics), nowMs)
  }
  for (const source of [state?.variables, state?.sourceVariables]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    for (const [key, value] of Object.entries(source)) {
      if (typeof key === 'string' && key) values[key] = value == null ? '' : String(value)
    }
  }
  return values
}

export function resolveText(text, ctx) {
  if (typeof text !== 'string' || !text.includes('{{')) return text
  return text.replace(VARIABLE_RE, (_, key) => (Object.hasOwn(ctx, key) ? ctx[key] : ''))
}

/* Text fields per widget type that accept variables. Score widgets are left out
   on purpose: their codes feed {{home.code}} themselves. */

const mapList = (list, fn) => (Array.isArray(list) ? list.map((item) => (item && typeof item === 'object' ? fn(item) : item)) : list)

const RESOLVERS = {
  message: (d, r) => ({ ...d, text: r(d.text) }),
  lowerThird: (d, r) => ({ ...d, name: r(d.name), title: r(d.title), company: r(d.company) }),
  lowerThirdShow: (d, r) => ({
    ...d,
    entries: mapList(d.entries, (e) => ({ ...e, name: r(e.name), title: r(e.title), company: r(e.company) })),
    template:
      d.template && typeof d.template === 'object'
        ? { ...d.template, elements: mapList(d.template.elements, (el) => ({ ...el, text: r(el.text) })) }
        : d.template
  }),
  quizShow: (d, r) => ({
    ...d,
    questions: mapList(d.questions, (q) => ({
      ...q,
      question: r(q.question),
      options: Array.isArray(q.options) ? q.options.map((o) => r(o)) : q.options
    }))
  }),
  customTicker: (d, r) => ({
    ...d,
    brandName: r(d.brandName),
    messages: Array.isArray(d.messages)
      ? d.messages.map((m) => (typeof m === 'string' ? r(m) : m && typeof m === 'object' ? { ...m, text: r(m.text) } : m))
      : d.messages
  })
}

/** Strings of a graphic's data that may hold variables (used to find live ones). */
function graphicUsesVariables(graphic, predicate) {
  const resolver = RESOLVERS[graphic?.type]
  if (!resolver || !graphic.data) return false
  let found = false
  resolver(graphic.data, (text) => {
    if (!found && typeof text === 'string' && variableNames(text).some(predicate)) found = true
    return text
  })
  return found
}

export function graphicUsesLiveVariables(graphic) {
  return graphicUsesVariables(graphic, (name) => LIVE_VARIABLES.has(name))
}

/** Every variable name used in the project's text fields. */
export function usedVariableNames(state) {
  const names = new Set()
  for (const g of Array.isArray(state?.graphics) ? state.graphics : []) {
    graphicUsesVariables(g, (name) => {
      names.add(name)
      return false
    })
  }
  return [...names].sort()
}

/** A copy of `graphic` with variables in its text fields replaced (unchanged when it has none). */
export function resolveGraphicVariables(graphic, ctx) {
  const resolver = RESOLVERS[graphic?.type]
  if (!resolver || !graphic.data || typeof graphic.data !== 'object') return graphic
  if (!graphicUsesVariables(graphic, () => true)) return graphic
  const data = resolver(graphic.data, (text) => (typeof text === 'string' ? resolveText(text, ctx) : text))
  return { ...graphic, data }
}
