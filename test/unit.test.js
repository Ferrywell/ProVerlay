import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deepMerge,
  normalizeStatePatch,
  validateGraphicPatch,
  validateProjectState,
  isValidProjectId
} from '../server/validation.js'
import { migrateGraphicsSolo, migratePenaltiesDisabled, stripEphemeralFields } from '../server/state.js'
import { migrateStateTickers, normalizeTickerMessagesInput } from '../server/tickerMessages.js'
import { isPrivateIp, isTrustedHostname, isAllowedOrigin, isAllowedHostHeader } from '../server/netSecurity.js'
import { applyClockOp, applyScoreOp, adjustMatchClock } from '../server/clockOps.js'
import { createGraphicFromType, isWidgetType } from '../server/graphicDefaults.js'

test('deepMerge merges nested objects and replaces arrays', () => {
  const target = { a: { b: 1, c: 2 }, list: [1, 2], keep: 'x' }
  const out = deepMerge(target, { a: { c: 3 }, list: [9] })
  assert.deepEqual(out, { a: { b: 1, c: 3 }, list: [9], keep: 'x' })
  assert.deepEqual(target, { a: { b: 1, c: 2 }, list: [1, 2], keep: 'x' }, 'no mutation')
})

test('deepMerge refuses to flip containers', () => {
  assert.throws(() => deepMerge({ list: [] }, { list: { a: 1 } }), { status: 400 })
  assert.throws(() => deepMerge({ obj: {} }, { obj: [1] }), { status: 400 })
  assert.throws(() => deepMerge({ obj: {} }, { obj: 'x' }), { status: 400 })
  assert.throws(() => deepMerge({ obj: {} }, { obj: null }), { status: 400 })
  assert.throws(() => deepMerge({}, JSON.parse('{"__proto__": {"x": 1}}')), { status: 400 })
  // primitives may change freely, undefined is skipped
  assert.deepEqual(deepMerge({ a: null, b: 1 }, { a: 'x', b: undefined }), { a: 'x', b: 1 })
  assert.deepEqual(deepMerge({ a: 'x' }, { a: { b: 1 } }), { a: { b: 1 } })
})

test('normalizeStatePatch: allowed keys, meta keys dropped, colors alias', () => {
  assert.deepEqual(normalizeStatePatch({ settings: { fontSize: 2 }, projectId: 'p', serverNow: 1 }), {
    settings: { fontSize: 2 }
  })
  assert.deepEqual(normalizeStatePatch({ colors: { primary: 'red' } }), { brand: { colors: { primary: 'red' } } })
  assert.deepEqual(normalizeStatePatch({ brandId: null }), { brandId: null })
  assert.throws(() => normalizeStatePatch({ nope: 1 }), /Unknown state key/)
  assert.throws(() => normalizeStatePatch([]), { status: 400 })
  assert.throws(() => normalizeStatePatch({ graphics: [{ id: 'a', type: 'x' }, { id: 'a', type: 'x' }] }), /duplicate/)
})

test('validateGraphicPatch', () => {
  const existing = { id: 'g1', type: 'matchScoreboard', data: {} }
  assert.doesNotThrow(() => validateGraphicPatch(existing, { id: 'g1', type: 'matchScoreboard', visible: true }))
  assert.throws(() => validateGraphicPatch(existing, { id: 'g2' }), /immutable/)
  assert.throws(() => validateGraphicPatch(existing, { type: 'message' }), /immutable/)
  assert.throws(() => validateGraphicPatch(existing, { visible: 'yes' }), /visible/)
  assert.throws(() => validateGraphicPatch(existing, { data: null }), /data/)
  assert.throws(() => validateGraphicPatch(existing, { data: { awayScore: 1.5 } }), /awayScore/)
  assert.throws(() => validateGraphicPatch({ id: 'f', type: 'f1Timing' }, { data: { multiviewer: { host: '1.1.1.1' } } }), /host/)
})

test('validateProjectState: lenient on content, strict on shape', () => {
  assert.deepEqual(validateProjectState({}).graphics, [])
  assert.doesNotThrow(() =>
    validateProjectState({ graphics: [{ id: 'a', type: 'futureWidget', name: 5, extra: true }], custom: 1 })
  )
  assert.throws(() => validateProjectState({ graphics: 'x' }))
  assert.throws(() => validateProjectState({ graphics: [{ id: 'a' }] }))
  assert.throws(() => validateProjectState({ graphics: [{ id: 'a', type: 't', data: [] }] }))
  assert.throws(() => validateProjectState({ graphics: [], settings: 'x' }))
  assert.throws(() => validateProjectState([]))
})

test('project ids', () => {
  for (const id of ['blank', 'acme-fc', 'a1']) assert.ok(isValidProjectId(id), id)
  for (const id of ['..', '../x', 'A', '-x', '', 'a/b', 'a.b', null, 5]) assert.ok(!isValidProjectId(id), String(id))
})

test('widget types use an own-property check', () => {
  assert.ok(isWidgetType('matchScoreboard'))
  for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.ok(!isWidgetType(t), t)
    assert.throws(() => createGraphicFromType(t), { status: 400 })
  }
  const ids = new Set(Array.from({ length: 200 }, () => createGraphicFromType('message').id))
  assert.equal(ids.size, 200)
})

test('migrations', () => {
  const legacy = {
    graphics: [
      { id: 't', type: 'customTicker', data: { messages: ['a', ' ', 'b'] } },
      { id: 'm', type: 'matchScoreboard', soloVisible: true, data: { penalties: { active: true }, clock: { period: 'penalties' } } }
    ]
  }
  const tickers = migrateStateTickers(legacy)
  assert.deepEqual(tickers.graphics[0].data.messages.map((m) => [m.text, m.enabled]), [['a', true], ['b', true]])
  assert.equal(migrateStateTickers({ graphics: [] }).graphics.length, 0)

  const solo = migrateGraphicsSolo({ graphics: [{ id: 'x' }, { id: 'y', soloVisible: true }] })
  assert.deepEqual(solo.graphics.map((g) => g.soloVisible), [false, true])

  const pen = migratePenaltiesDisabled(legacy)
  const m = pen.graphics[1].data
  assert.equal(m.penalties.active, false)
  assert.equal(m.clock.period, 'second_half')
  assert.equal(m.widgets.penalties, false)

  assert.deepEqual(stripEphemeralFields({ a: 1, serverNow: 5 }), { a: 1 })

  const normalized = normalizeTickerMessagesInput(['new', { id: 'k', text: 'kept' }, null], {
    existing: [{ id: 'k', text: 'old', enabled: true }]
  })
  assert.equal(normalized.length, 2)
  assert.equal(normalized[1].enabled, true)
})

test('network helpers', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.100.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1']) {
    assert.ok(isPrivateIp(ip), ip)
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2001:4860::8888', '::ffff:8.8.8.8', 'nope']) {
    assert.ok(!isPrivateIp(ip), ip)
  }
  assert.ok(isTrustedHostname('localhost'))
  assert.ok(isTrustedHostname('studio-pc'))
  assert.ok(isTrustedHostname('mac.local'))
  assert.ok(!isTrustedHostname('example.com'))
  assert.ok(!isTrustedHostname('localhost.evil.com'))
  assert.ok(isAllowedOrigin(undefined))
  assert.ok(!isAllowedOrigin('null'))
  assert.ok(!isAllowedOrigin('chrome-extension://abc'))
  assert.ok(isAllowedHostHeader('203.0.113.9:2014'))
  assert.ok(isAllowedHostHeader('[::1]:2014'))
  assert.ok(!isAllowedHostHeader('evil.com'))
})

test('score op clamps and validates', () => {
  const g = { id: 'g', type: 'hockeyScorebug', data: { homeScore: 1, awayScore: 0 } }
  assert.equal(applyScoreOp(g, { side: 'home', delta: -3 }).data.homeScore, 0)
  assert.equal(applyScoreOp(g, { side: 'away', value: 7 }).data.awayScore, 7)
  assert.throws(() => applyScoreOp({ ...g, type: 'message' }, { side: 'home' }), { status: 400 })
})

test('match clock op: start on running clock is a no-op', () => {
  const since = new Date(Date.now() - 30_000).toISOString()
  const g = { id: 'g', type: 'matchScoreboard', data: { clock: { minute: 5, second: 0, running: true, runningSince: since } } }
  assert.deepEqual(applyClockOp(g, { action: 'start' }).data.clock, g.data.clock)
  const paused = applyClockOp(g, { action: 'pause' }).data.clock
  assert.equal(paused.minute * 60 + paused.second, 330)
  assert.equal(paused.running, false)
})

test('adjustMatchClock mirrors the operator nudge semantics', () => {
  const now = Date.now()
  const stopped = { minute: 1, second: 0 }
  assert.deepEqual(adjustMatchClock(stopped, 15, now), { minute: 1, second: 15 })
  assert.deepEqual(adjustMatchClock(stopped, -120, now), { minute: 0, second: 0 })
  const running = { minute: 0, second: 0, running: true, runningSince: new Date(now - 10_000).toISOString() }
  const plus = adjustMatchClock(running, 60, now)
  assert.equal(new Date(plus.runningSince).getTime(), now - 70_000)
})
