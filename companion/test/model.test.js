import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildVarKeys,
  formatCountdown,
  formatHockeyClock,
  formatMatchClock,
  graphicsSignature,
  parseActionPayload,
  parseClockTime,
  parseTargetTime,
  sanitizeKey,
  splitRef,
  stepEntryId,
  stepGraphicChoices,
  stepHockeyPeriod,
  tickerCurrentText,
  widgetActionChoices,
  widgetTypeInfo,
} from '../src/model.js'
import { sampleState } from './fixtures.js'

const T0 = Date.parse('2026-06-01T12:00:00.000Z')
const ago = (ms) => new Date(T0 - ms).toISOString()

test('match clock: stopped, running (floor) and stoppage time', () => {
  assert.equal(formatMatchClock({ minute: 0, second: 0 }, T0), '00:00')
  assert.equal(formatMatchClock({ minute: 12, second: 5, running: false, runningSince: ago(60_000) }, T0), '12:05')
  // 10.9 s elapsed → floor → +10 s
  assert.equal(formatMatchClock({ minute: 1, second: 55, running: true, runningSince: ago(10_900) }, T0), '02:05')
  assert.equal(
    formatMatchClock({ period: 'first_half', minute: 47, second: 3, stoppageTime: true, running: false }, T0),
    '45+2:03',
  )
  // auto 90+ only when running in the second half past 90:00
  assert.equal(
    formatMatchClock(
      { period: 'second_half', minute: 90, second: 0, autoStoppageAt90: true, running: true, runningSince: ago(5_000) },
      T0,
    ),
    '90+0:05',
  )
  assert.equal(formatMatchClock({ period: 'second_half', minute: 91, second: 0, autoStoppageAt90: true }, T0), '91:00')
  assert.equal(formatMatchClock(null, T0), '00:00')
})

test('hockey clock: counts down with ceil, break shows a dash', () => {
  assert.equal(formatHockeyClock({ period: 'q2', remainingMs: 775000, quarterMs: 900000 }, T0), '12:55')
  // 0.2 s elapsed → 774.8 s → ceil → 12:55
  assert.equal(
    formatHockeyClock({ period: 'q2', remainingMs: 775000, running: true, runningSince: ago(200) }, T0),
    '12:55',
  )
  assert.equal(
    formatHockeyClock({ period: 'q2', remainingMs: 775000, running: true, runningSince: ago(1_000) }, T0),
    '12:54',
  )
  assert.equal(
    formatHockeyClock({ period: 'q4', remainingMs: 1000, running: true, runningSince: ago(5_000) }, T0),
    '00:00',
  )
  assert.equal(
    formatHockeyClock({ period: 'break', remainingMs: 5000, running: true, runningSince: ago(1) }, T0),
    '—:—',
  )
  // remaining never exceeds the quarter length
  assert.equal(formatHockeyClock({ period: 'q1', remainingMs: 2_000_000, quarterMs: 600_000 }, T0), '10:00')
})

test('countdown formatting matches the render', () => {
  const target = new Date(T0 + 65_000).toISOString()
  assert.equal(formatCountdown(target, 'mm:ss', T0), '1:05')
  assert.equal(formatCountdown(new Date(T0 + 64_100).toISOString(), 'mm:ss', T0), '1:05')
  assert.equal(formatCountdown(new Date(T0 + 3_725_000).toISOString(), 'h:mm:ss', T0), '1:02:05')
  assert.equal(formatCountdown(new Date(T0 + 3_725_000).toISOString(), 'mm:ss', T0), '62:05')
  assert.equal(formatCountdown(new Date(T0 - 1000).toISOString(), 'mm:ss', T0), '0:00')
  assert.equal(formatCountdown('not a date', 'mm:ss', T0), '0:00')
})

test('parseClockTime accepts mm:ss, hh:mm:ss and seconds', () => {
  assert.equal(parseClockTime('45:00'), 2_700_000)
  assert.equal(parseClockTime('7:05'), 425_000)
  assert.equal(parseClockTime('1:00:30'), 3_630_000)
  assert.equal(parseClockTime('90'), 90_000)
  assert.equal(parseClockTime('12:75'), null)
  assert.equal(parseClockTime('abc'), null)
  assert.equal(parseClockTime(''), null)
})

test('parseTargetTime: next occurrence of HH:MM, or ISO', () => {
  const now = new Date(2026, 5, 1, 19, 30, 0).getTime()
  assert.equal(parseTargetTime('20:00', now), new Date(2026, 5, 1, 20, 0, 0).toISOString())
  assert.equal(parseTargetTime('19:00', now), new Date(2026, 5, 2, 19, 0, 0).toISOString())
  assert.equal(parseTargetTime('2026-06-01T18:00:00Z', now), '2026-06-01T18:00:00.000Z')
  assert.equal(parseTargetTime('25:00', now), null)
  assert.equal(parseTargetTime('soon', now), null)
})

test('stepHockeyPeriod walks quarters, optionally through breaks', () => {
  assert.equal(stepHockeyPeriod('q1', 'next'), 'q2')
  assert.equal(stepHockeyPeriod('q4', 'next'), 'q4')
  assert.equal(stepHockeyPeriod('q1', 'previous'), 'q1')
  assert.equal(stepHockeyPeriod('q3', 'previous'), 'q2')
  assert.equal(stepHockeyPeriod('q2', 'next', { includeBreaks: true }), 'break')
  assert.equal(stepHockeyPeriod('break', 'next', { lastQuarter: 'q2' }), 'q3')
  assert.equal(stepHockeyPeriod('break', 'previous', { lastQuarter: 'q2' }), 'q2')
  assert.equal(stepHockeyPeriod('q4', 'next', { includeBreaks: true }), 'q4')
})

test('stepEntryId: next / previous with and without wrap', () => {
  const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(stepEntryId(entries, 'a', 'next'), 'b')
  assert.equal(stepEntryId(entries, 'c', 'next'), 'a')
  assert.equal(stepEntryId(entries, 'c', 'next', { wrap: false }), null)
  assert.equal(stepEntryId(entries, 'a', 'previous'), 'c')
  assert.equal(stepEntryId(entries, null, 'next'), 'a')
  assert.equal(stepEntryId(entries, null, 'previous'), 'c')
  assert.equal(stepEntryId([], null, 'next'), null)
})

test('variable keys are sanitised and unique', () => {
  assert.equal(sanitizeKey('match-scoreboard-3f9a1c2e'), 'match_scoreboard_3f9a1c2e')
  const keys = buildVarKeys({ graphics: [{ id: 'a-b' }, { id: 'a_b' }, { id: 'a.b' }] })
  assert.deepEqual([...keys.values()], ['a_b', 'a_b_2', 'a_b_3'])
})

test('graphicsSignature ignores scores/clocks/visibility but sees names and sub-items', () => {
  const base = sampleState()
  const sig = graphicsSignature(base)

  const scored = sampleState()
  scored.graphics[0].data.homeScore = 9
  scored.graphics[0].visible = false
  scored.graphics[1].data.clock.running = true
  scored.graphics[4].data.activeEntryId = 'sp-3'
  scored.graphics[2].data.messages[1].enabled = true
  assert.equal(graphicsSignature(scored), sig)

  const renamed = sampleState()
  renamed.graphics[0].name = 'Final'
  assert.notEqual(graphicsSignature(renamed), sig)

  const newSpeaker = sampleState()
  newSpeaker.graphics[4].data.entries.push({ id: 'sp-4', name: 'Dirk' })
  assert.notEqual(graphicsSignature(newSpeaker), sig)

  const removed = sampleState()
  removed.graphics.pop()
  assert.notEqual(graphicsSignature(removed), sig)
})

test('graphicsSignature follows the steps and actions ProVerlay reports', () => {
  const sig = graphicsSignature(sampleState())
  const older = sampleState()
  delete older.widgetTypes
  assert.notEqual(graphicsSignature(older), sig)
  const more = sampleState()
  more.widgetTypes.quizShow.actions.push({ id: 'shuffle', label: 'Shuffle', fields: [] })
  assert.notEqual(graphicsSignature(more), sig)
  const reordered = sampleState()
  reordered.widgetTypes = Object.fromEntries(Object.entries(reordered.widgetTypes).reverse())
  assert.equal(graphicsSignature(reordered), sig)
})

test('widgetTypeInfo and the step / action choices tolerate anything in state.widgetTypes', () => {
  const state = sampleState()
  assert.deepEqual(widgetTypeInfo(state, 'image'), { steps: true, actions: [] })
  assert.deepEqual(widgetTypeInfo(state, 'message'), { steps: false, actions: [] })
  assert.deepEqual(widgetTypeInfo(state, 'constructor'), { steps: false, actions: [] })
  assert.deepEqual(widgetTypeInfo({}, 'image'), { steps: false, actions: [] })
  assert.deepEqual(
    widgetTypeInfo(state, 'quizShow').actions.map((a) => [a.id, a.fields.length]),
    [
      ['reveal', 0],
      ['hide-answer', 0],
      ['show-question', 1],
    ],
  )
  for (const widgetTypes of [null, 'x', [], { image: null }, { image: { steps: 'yes', actions: 'none' } }]) {
    const odd = { ...sampleState(), widgetTypes }
    assert.deepEqual(widgetTypeInfo(odd, 'image'), { steps: false, actions: [] })
    assert.equal(stepGraphicChoices(odd)[0].id, '')
    assert.equal(widgetActionChoices(odd)[0].id, '')
  }
  const sloppy = {
    ...sampleState(),
    widgetTypes: { image: { steps: true, actions: [null, { label: 'no id' }, { id: 'go' }] } },
  }
  assert.deepEqual(widgetTypeInfo(sloppy, 'image').actions, [{ id: 'go', label: 'go', fields: [] }])
  assert.deepEqual(stepGraphicChoices(state), [
    { id: 'lower-third-show-eeee5555', label: 'Speakers (Lower thirds roster)' },
    { id: 'quiz-show-ffff6666', label: 'Quiz (Quiz)' },
    { id: 'image-iiii9999', label: 'Sponsors (Image)' },
  ])
})

test('parseActionPayload: empty, JSON object, or a bare value for a one-field action', () => {
  const number = [{ key: 'number', kind: 'number' }]
  assert.deepEqual(parseActionPayload('', number), {})
  assert.deepEqual(parseActionPayload(undefined, []), {})
  assert.deepEqual(parseActionPayload('  {"number": 3}  ', number), { number: 3 })
  assert.deepEqual(parseActionPayload('3', number), { number: 3 })
  assert.deepEqual(parseActionPayload('true', [{ key: 'on' }]), { on: true })
  assert.deepEqual(parseActionPayload('Half time', [{ key: 'text' }]), { text: 'Half time' })
  assert.deepEqual(parseActionPayload('{"a": 1, "b": 2}', [{ key: 'a' }, { key: 'b' }]), { a: 1, b: 2 })
  assert.throws(() => parseActionPayload('3', []), /takes no payload/)
  assert.throws(() => parseActionPayload('3', [{ key: 'a' }, { key: 'b' }]), /JSON object such as \{"a"/)
  assert.throws(() => parseActionPayload('[1, 2]', []), /takes no payload/)
})

test('ticker current text and ref splitting', () => {
  assert.equal(tickerCurrentText(sampleState().graphics[2].data), 'Welcome • Follow us')
  assert.deepEqual(splitRef('g-1|e-2'), { graphicId: 'g-1', itemId: 'e-2' })
  assert.equal(splitRef(''), null)
  assert.equal(splitRef('|x'), null)
})
