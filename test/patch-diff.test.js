import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deepEqual,
  diffPatch,
  isEmptyPatch,
  omitPaths,
  pickPaths,
  reconcileFormValues,
  withoutLiveFields
} from '../public/shared/patch-diff.js'
import { deepMerge } from '../server/validation.js'

test('diffPatch returns only changed leaves', () => {
  const base = { position: 'top-center', data: { homeCode: 'AJA', widgets: { clock: true, homeScore: true } } }
  const next = { position: 'top-center', data: { homeCode: 'PSV', widgets: { clock: true, homeScore: false } } }
  assert.deepEqual(diffPatch(base, next), { data: { homeCode: 'PSV', widgets: { homeScore: false } } })
})

test('diffPatch of identical payloads is empty', () => {
  const payload = { data: { messages: [{ id: 'a', text: 'x', enabled: true }], layout: { background: '' } } }
  const patch = diffPatch(payload, structuredClone(payload))
  assert.deepEqual(patch, {})
  assert.equal(isEmptyPatch(patch), true)
})

test('diffPatch sends whole arrays only when they changed', () => {
  const base = { data: { messages: [{ id: 'a', text: 'one' }], speed: 90 } }
  assert.deepEqual(diffPatch(base, { data: { messages: [{ id: 'a', text: 'one' }], speed: 120 } }), {
    data: { speed: 120 }
  })
  const next = { data: { messages: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }], speed: 90 } }
  const patch = diffPatch(base, next)
  assert.deepEqual(patch, { data: { messages: next.data.messages } })
  assert.notEqual(patch.data.messages, next.data.messages, 'arrays are copied, not shared')
})

test('diffPatch skips undefined values and new empty objects', () => {
  assert.deepEqual(diffPatch({ a: 1 }, { a: undefined, b: {} }), {})
  assert.deepEqual(diffPatch({}, { transition: { in: 'fade' } }), { transition: { in: 'fade' } })
})

test('diffPatch result deep-merged into the base yields the next payload', () => {
  const base = {
    position: 'top-center',
    data: { layout: { clockPlateWidth: 0 }, clock: { period: 'first_half', stoppageTime: false }, homeName: 'Ajax' }
  }
  const next = {
    position: 'bottom-left',
    data: { layout: { clockPlateWidth: 12 }, clock: { period: 'first_half', stoppageTime: true }, homeName: 'Ajax' }
  }
  assert.deepEqual(deepMerge(base, diffPatch(base, next)), next)
})

test('deepEqual compares JSON-like values structurally', () => {
  assert.equal(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true)
  assert.equal(deepEqual({ a: 1, b: undefined }, { a: 1 }), true)
  assert.equal(deepEqual([1, 2], [2, 1]), false)
  assert.equal(deepEqual({ a: 1 }, [1]), false)
  assert.equal(deepEqual('1', 1), false)
})

test('omitPaths removes paths and prunes empty parents', () => {
  const patch = { data: { clock: { minute: 3, running: true }, homeScore: 2, homeCode: 'AJA' } }
  assert.deepEqual(omitPaths(patch, ['data.clock.minute', 'data.clock.running', 'data.homeScore']), {
    data: { homeCode: 'AJA' }
  })
  assert.deepEqual(patch.data.homeScore, 2, 'input is not mutated')
  assert.deepEqual(omitPaths({ a: 1 }, ['x.y.z']), { a: 1 })
})

test('pickPaths keeps only the given subtrees', () => {
  const patch = { position: 'top', data: { widgets: { clock: false }, showCodes: true, homeCode: 'X' } }
  assert.deepEqual(pickPaths(patch, ['data.widgets', 'data.showCodes', 'data.missing']), {
    data: { widgets: { clock: false }, showCodes: true }
  })
})

test('withoutLiveFields strips scores and the running clock, keeps period/stoppage', () => {
  const patch = {
    data: {
      homeScore: 1,
      awayScore: 2,
      clock: { minute: 10, second: 5, running: true, runningSince: 'x', remainingMs: 1, period: 'second_half', stoppageTime: true },
      homeCode: 'AJA'
    }
  }
  assert.deepEqual(withoutLiveFields(patch), {
    data: { clock: { period: 'second_half', stoppageTime: true }, homeCode: 'AJA' }
  })
  assert.deepEqual(withoutLiveFields({ data: { homeScore: 3 } }), {})
})

test('reconcileFormValues: untouched fields follow the server', () => {
  const result = reconcileFormValues({
    baseline: { homeCode: 'AJA', speed: '90' },
    current: { homeCode: 'AJA', speed: '90' },
    server: { homeCode: 'PSV', speed: '90' }
  })
  assert.deepEqual(result.values, { homeCode: 'PSV', speed: '90' })
  assert.deepEqual(result.baseline, { homeCode: 'PSV', speed: '90' })
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.dirty, [])
})

test('reconcileFormValues: user edits are kept; same-field server change is a conflict', () => {
  const result = reconcileFormValues({
    baseline: { homeCode: 'AJA', awayCode: 'FEY', showNames: false },
    current: { homeCode: 'AJX', awayCode: 'FCU', showNames: false },
    server: { homeCode: 'PSV', awayCode: 'FEY', showNames: true }
  })
  assert.deepEqual(result.values, { homeCode: 'AJX', awayCode: 'FCU', showNames: true })
  // The baseline moves to the server so a later save diffs against what is stored now.
  assert.deepEqual(result.baseline, { homeCode: 'PSV', awayCode: 'FEY', showNames: true })
  assert.deepEqual(result.conflicts, ['homeCode'])
  assert.deepEqual(result.dirty.sort(), ['awayCode', 'homeCode'])
})

test('reconcileFormValues: server reaching the user value is not a conflict and is clean', () => {
  const result = reconcileFormValues({
    baseline: { color: '#ffffff' },
    current: { color: '#ff0000' },
    server: { color: '#ff0000' }
  })
  assert.deepEqual(result.values, { color: '#ff0000' })
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.dirty, [])
})

test('reconcileFormValues: pending own save keeps the value without a conflict', () => {
  // Our save of 120 has not landed; a broadcast for another change still says 90.
  const result = reconcileFormValues({
    baseline: { speed: '90', color: '#fff' },
    current: { speed: '130', color: '#fff' },
    server: { speed: '90', color: '#000' },
    pending: { speed: '120' }
  })
  assert.deepEqual(result.values, { speed: '130', color: '#000' })
  assert.deepEqual(result.baseline, { speed: '90', color: '#000' })
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.dirty, ['speed'])
})

test('form diff flow: stale untouched fields are never saved', () => {
  // A form opened with homeScore-free payload; the operator changed the
  // period elsewhere and the user only edited the team name.
  const payload = (v) => ({ data: { homeName: v.homeName, clock: { period: v.period } } })
  const opened = { homeName: 'Ajax', period: 'first_half' }
  const userEdit = { homeName: 'Ajax Amsterdam', period: 'first_half' }
  const serverNow = { homeName: 'Ajax', period: 'second_half' }
  const merged = reconcileFormValues({ baseline: opened, current: userEdit, server: serverNow })
  assert.deepEqual(merged.values, { homeName: 'Ajax Amsterdam', period: 'second_half' })
  assert.deepEqual(diffPatch(payload(merged.baseline), payload(merged.values)), {
    data: { homeName: 'Ajax Amsterdam' }
  })
})
