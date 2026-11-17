import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, socketConnect, sleep } from './helpers.js'

let srv

before(async () => {
  srv = await startTestServer()
})

after(async () => {
  await srv?.close()
})

async function createGraphic(type, name = type) {
  const res = await srv.post('/api/graphics', { type, name })
  assert.equal(res.status, 201, res.text)
  return res.json
}

async function assertAlive() {
  const res = await srv.get('/api/state')
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.json.graphics))
}

test('pages are served', async () => {
  for (const page of ['/control', '/render', '/operator', '/editor', '/project']) {
    const res = await srv.get(page)
    assert.equal(res.status, 200, page)
  }
})

test('bad input that used to crash the process returns 4xx and the server stays up', async () => {
  const cases = [
    ['POST', '/api/projects', { name: 5 }],
    ['POST', '/api/projects', { name: { trim: 1 } }],
    ['POST', '/api/projects', [1, 2]],
    ['POST', '/api/graphics', { type: 'matchScoreboard', name: 7 }],
    ['PATCH', '/api/state', 'null'],
    ['PATCH', '/api/state', '[1,2]'],
    ['POST', '/api/projects/x/compose-widget', { type: 'matchScoreboard', filename: 7 }],
    ['POST', '/api/graphics/nope/entries', 'null']
  ]
  for (const [method, url, body] of cases) {
    const res = await srv.request(method, url, body)
    assert.ok(res.status >= 400 && res.status < 500, `${method} ${url} → ${res.status} ${res.text}`)
  }
  const bad = await srv.request('PATCH', '/api/state', '{not json')
  assert.equal(bad.status, 400)
  assert.equal(bad.json.error, 'Invalid JSON body')
  await assertAlive()
})

test('socket write events are gone and malformed socket traffic does not crash', async () => {
  const sock = await socketConnect(srv.base)
  sock.emit('patchGraphic', null)
  sock.emit('patchGraphic', { id: 'x' })
  sock.emit('activateProject', null)
  sock.emit('patchState', { graphics: 'x' })
  sock.emit('toggleGraphic', null)
  sock.emit('getState', null) // no ack: must be ignored
  const state = await sock.emitWithAck('getState', null)
  assert.ok(Array.isArray(state.graphics))
  assert.ok(sock.events.some(([name]) => name === 'stateChanged'))
  sock.close()
  await sleep(50)
  await assertAlive()
  // The ignored patchState must not have changed anything.
  assert.ok(Array.isArray((await srv.get('/api/state')).json.graphics))
})

test('PATCH /api/state validates top-level keys and shapes', async () => {
  const bad = [
    { graphics: 'x' },
    { graphics: { a: 1 } },
    { graphics: [{ id: 'a' }] },
    { graphics: [{ id: 'a', type: 'message' }, { id: 'a', type: 'message' }] },
    { settings: [] },
    { settings: 'x' },
    { settings: { canvasWidth: 'wide' } },
    { brand: { colors: [] } },
    { somethingElse: 1 },
    JSON.parse('{"__proto__": {"polluted": true}}')
  ]
  for (const body of bad) {
    const res = await srv.patch('/api/state', body)
    assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.status} ${res.text}`)
    assert.ok(res.json.error)
  }
  assert.equal({}.polluted, undefined)

  const ok = await srv.patch('/api/state', {
    settings: { canvasWidth: 1280, canvasHeight: 720 },
    brand: { name: 'X', colors: { primary: '#ff0000' } },
    projectId: 'ignored',
    serverNow: 1
  })
  assert.equal(ok.status, 200, ok.text)
  assert.equal(ok.json.settings.canvasWidth, 1280)
  assert.equal(ok.json.brand.colors.primary, '#ff0000')
  assert.equal(ok.json.brand.colors.secondary, '#5856D6', 'deep merge keeps siblings')

  // Companion "Set primary color" sends a top-level `colors` object.
  const compat = await srv.patch('/api/state', { colors: { primary: 'rgba(1, 2, 3, 1)' } })
  assert.equal(compat.status, 200, compat.text)
  assert.equal(compat.json.brand.colors.primary, 'rgba(1, 2, 3, 1)')
  assert.equal(compat.json.colors, undefined)
  await assertAlive()
})

test('graphic PATCH: id/type immutable, typed fields, no container flips', async () => {
  const g = await createGraphic('matchScoreboard')
  const bad = [
    { id: 'other' },
    { type: 'message' },
    { visible: 'yes' },
    { data: null },
    { data: [] },
    { data: { clock: 'now' } },
    { data: { elements: { a: 1 } } },
    { data: { homeScore: -1 } },
    { data: { homeScore: '3' } },
    { transition: 'fade' },
    { name: 5 }
  ]
  for (const body of bad) {
    const res = await srv.patch(`/api/graphics/${g.id}`, body)
    assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.status} ${res.text}`)
  }
  const arr = await srv.request('PATCH', `/api/graphics/${g.id}`, '[{"visible":true}]')
  assert.equal(arr.status, 400)

  // Echoing the same id/type (whole-object clients) is fine.
  const ok = await srv.patch(`/api/graphics/${g.id}`, {
    id: g.id,
    type: g.type,
    visible: true,
    position: 'top-left',
    data: { homeScore: 2, clock: { minute: 10 } }
  })
  assert.equal(ok.status, 200, ok.text)
  assert.equal(ok.json.visible, true)
  assert.equal(ok.json.data.homeScore, 2)
  assert.equal(ok.json.data.clock.minute, 10)
  assert.equal(ok.json.data.clock.period, 'first_half', 'nested merge keeps siblings')

  const missing = await srv.patch('/api/graphics/does-not-exist', { visible: true })
  assert.equal(missing.status, 404)
})

test('POST /api/graphics rejects unknown and prototype widget types', async () => {
  for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'nope', 5, null]) {
    const res = await srv.post('/api/graphics', { type, name: 'x' })
    assert.equal(res.status, 400, `${type} → ${res.status}`)
  }
  const state = (await srv.get('/api/state')).json
  assert.ok(state.graphics.every((g) => typeof g.type === 'string' && g.data))
})

test('40 concurrent PATCHes to different graphics all land', async () => {
  const graphics = []
  for (let i = 0; i < 8; i++) graphics.push(await createGraphic('message', `m${i}`))
  const requests = []
  for (let i = 0; i < 40; i++) {
    const g = graphics[i % graphics.length]
    requests.push(srv.patch(`/api/graphics/${g.id}`, { data: { [`k${i}`]: i } }))
  }
  const results = await Promise.all(requests)
  assert.ok(results.every((r) => r.status === 200))
  const state = (await srv.get('/api/state')).json
  for (let i = 0; i < 40; i++) {
    const g = state.graphics.find((x) => x.id === graphics[i % graphics.length].id)
    assert.equal(g.data[`k${i}`], i, `patch ${i} lost`)
  }
  // And it was persisted.
  const disk = JSON.parse(await fs.readFile(path.join(srv.dir, 'projects', 'blank', 'project.json'), 'utf8'))
  const g0 = disk.graphics.find((x) => x.id === graphics[0].id)
  assert.equal(g0.data.k0, 0)
  assert.equal(g0.data.k32, 32)
})

test('concurrent creates produce unique ids and none are lost', async () => {
  const before = (await srv.get('/api/state')).json.graphics.length
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => srv.post('/api/graphics', { type: 'matchScoreboard', name: `s${i}` }))
  )
  assert.ok(results.every((r) => r.status === 201))
  const ids = results.map((r) => r.json.id)
  assert.equal(new Set(ids).size, ids.length)
  const state = (await srv.get('/api/state')).json
  assert.equal(state.graphics.length, before + 20)
  assert.equal(new Set(state.graphics.map((g) => g.id)).size, state.graphics.length)
})

test('toggle is computed inside the write queue', async () => {
  const g = await createGraphic('message')
  const results = await Promise.all(Array.from({ length: 10 }, () => srv.post(`/api/graphics/${g.id}/toggle`)))
  assert.ok(results.every((r) => r.status === 200))
  const after = (await srv.get(`/api/graphics/${g.id}`)).json
  assert.equal(after.visible, false, '10 flips from false must end at false')

  const set = await srv.post(`/api/graphics/${g.id}/toggle`, { visible: true })
  assert.equal(set.json.visible, true)
  const solo = await srv.post(`/api/graphics/${g.id}/toggle-solo`, { soloVisible: 1 })
  assert.equal(solo.json.soloVisible, true)
  assert.equal((await srv.post('/api/graphics/nope/toggle')).status, 404)
})

test('atomic score endpoint: concurrent increments, clamping, validation', async () => {
  const g = await createGraphic('matchScoreboard')
  const results = await Promise.all(
    Array.from({ length: 30 }, () => srv.post(`/api/graphics/${g.id}/score`, { side: 'home', delta: 1 }))
  )
  assert.ok(results.every((r) => r.status === 200))
  let cur = (await srv.get(`/api/graphics/${g.id}`)).json
  assert.equal(cur.data.homeScore, 30)
  assert.equal(cur.data.awayScore, 0)

  const down = await srv.post(`/api/graphics/${g.id}/score`, { side: 'away', delta: -5 })
  assert.equal(down.json.data.awayScore, 0, 'never below zero')
  const set = await srv.post(`/api/graphics/${g.id}/score`, { side: 'away', value: 3 })
  assert.equal(set.json.data.awayScore, 3)
  const dflt = await srv.post(`/api/graphics/${g.id}/score`, { side: 'away' })
  assert.equal(dflt.json.data.awayScore, 4, 'delta defaults to +1')

  for (const body of [{ side: 'left', delta: 1 }, { side: 'home', delta: 1.5 }, { side: 'home', delta: 'x' }, { side: 'home', value: -1 }]) {
    assert.equal((await srv.post(`/api/graphics/${g.id}/score`, body)).status, 400, JSON.stringify(body))
  }
  const msg = await createGraphic('message')
  assert.equal((await srv.post(`/api/graphics/${msg.id}/score`, { side: 'home' })).status, 400)
  assert.equal((await srv.post('/api/graphics/nope/score', { side: 'home' })).status, 404)

  const hockey = await createGraphic('hockeyScorebug')
  const h = await srv.post(`/api/graphics/${hockey.id}/score`, { side: 'away', delta: 2 })
  assert.equal(h.json.data.awayScore, 2)
  cur = (await srv.get(`/api/graphics/${g.id}`)).json
  assert.equal(cur.data.homeScore, 30)
})

test('atomic match clock: start, start-on-running keeps elapsed time, pause, adjust, set, reset', async () => {
  const g = await createGraphic('matchScoreboard')
  await srv.patch(`/api/graphics/${g.id}`, { data: { clock: { minute: 10, second: 0 } } })

  const start = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'start' })
  assert.equal(start.status, 200, start.text)
  assert.equal(start.json.data.clock.running, true)
  const since = start.json.data.clock.runningSince
  assert.ok(since)

  await sleep(30)
  const again = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'start' })
  assert.equal(again.json.data.clock.runningSince, since, 'Start on a running clock must not reset elapsed time')
  assert.equal(again.json.data.clock.minute, 10)

  // Simulate 65s of running time, then pause.
  const sixtyFiveAgo = new Date(Date.now() - 65_000).toISOString()
  await srv.patch(`/api/graphics/${g.id}`, { data: { clock: { runningSince: sixtyFiveAgo } } })
  const pause = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'pause' })
  const c = pause.json.data.clock
  assert.equal(c.running, false)
  assert.equal(c.runningSince, null)
  assert.equal(c.minute * 60 + c.second, 10 * 60 + 65)

  const adj = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'adjust', ms: -5000 })
  assert.equal(adj.json.data.clock.minute * 60 + adj.json.data.clock.second, 10 * 60 + 60)

  const set = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'set', ms: 45 * 60_000 })
  assert.equal(set.json.data.clock.minute, 45)
  assert.equal(set.json.data.clock.second, 0)

  const toggle = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'toggle' })
  assert.equal(toggle.json.data.clock.running, true)
  const toggle2 = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'toggle' })
  assert.equal(toggle2.json.data.clock.running, false)

  const reset = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'reset' })
  assert.deepEqual(
    [reset.json.data.clock.minute, reset.json.data.clock.second, reset.json.data.clock.running],
    [0, 0, false]
  )
  assert.equal(reset.json.data.clock.period, 'first_half', 'other clock fields untouched')

  for (const body of [{ action: 'explode' }, { action: 'adjust' }, { action: 'set', ms: -1 }, {}]) {
    assert.equal((await srv.post(`/api/graphics/${g.id}/clock`, body)).status, 400, JSON.stringify(body))
  }
})

test('new score widgets start at the first period with neutral team codes', async () => {
  const match = await createGraphic('matchScoreboard')
  assert.equal(match.data.clock.period, 'first_half')
  assert.deepEqual([match.data.clock.minute, match.data.clock.second], [0, 0])
  assert.deepEqual([match.data.homeCode, match.data.awayCode], ['HOME', 'AWAY'])

  const hockey = await createGraphic('hockeyScorebug')
  assert.equal(hockey.data.clock.period, 'q1')
  assert.equal(hockey.data.clock.remainingMs, hockey.data.clock.quarterMs, 'full quarter on the clock')
  assert.deepEqual([hockey.data.homeCode, hockey.data.awayCode], ['HOME', 'AWAY'])
})

test('atomic hockey clock: start, start-on-running, pause, adjust, reset', async () => {
  const g = await createGraphic('hockeyScorebug')
  const start = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'start' })
  assert.equal(start.json.data.clock.running, true)
  const since = start.json.data.clock.runningSince

  await sleep(30)
  const again = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'start' })
  assert.equal(again.json.data.clock.runningSince, since)
  assert.equal(again.json.data.clock.remainingMs, 900000)

  const pause = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'pause' })
  const rem = pause.json.data.clock.remainingMs
  assert.equal(pause.json.data.clock.running, false)
  assert.ok(rem < 900000 && rem > 895000, `remaining ${rem}`)

  const adj = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'adjust', ms: -60_000 })
  assert.equal(adj.json.data.clock.remainingMs, rem - 60_000)
  const capped = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'adjust', ms: 120_000 })
  assert.equal(capped.json.data.clock.remainingMs, 900000, 'never more than a full quarter')

  const reset = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'reset' })
  assert.equal(reset.json.data.clock.remainingMs, 900000)
  assert.equal(reset.json.data.clock.running, false)

  await srv.patch(`/api/graphics/${g.id}`, { data: { clock: { period: 'break' } } })
  const brk = await srv.post(`/api/graphics/${g.id}/clock`, { action: 'start' })
  assert.equal(brk.json.data.clock.running, false, 'clock does not run during a break')
})

test('lower third entries: concurrent adds are all kept', async () => {
  const g = await createGraphic('lowerThirdShow')
  const results = await Promise.all(
    Array.from({ length: 15 }, (_, i) => srv.post(`/api/graphics/${g.id}/entries`, { name: `Person ${i}` }))
  )
  assert.ok(results.every((r) => r.status === 201), results.map((r) => r.status).join(','))
  const entries = (await srv.get(`/api/graphics/${g.id}/entries`)).json
  assert.equal(entries.length, 15)
  assert.equal(new Set(entries.map((e) => e.id)).size, 15)

  const show = await srv.post(`/api/graphics/${g.id}/entries/${entries[0].id}/show`)
  assert.equal(show.json.visible, true)
  assert.equal(show.json.data.activeEntryId, entries[0].id)
  const hide = await srv.post(`/api/graphics/${g.id}/hide`)
  assert.equal(hide.json.visible, false)
  assert.equal((await srv.post(`/api/graphics/${g.id}/entries`, { name: '' })).status, 400)
  assert.equal((await srv.del(`/api/graphics/${g.id}/entries/nope`)).status, 404)
})

test('f1Timing MultiViewer host must be local', async () => {
  const g = await createGraphic('f1Timing')
  for (const host of ['8.8.8.8', 'example.com', 'evil.example.org', 5]) {
    const res = await srv.patch(`/api/graphics/${g.id}`, { data: { multiviewer: { host } } })
    assert.equal(res.status, 400, `${host} → ${res.status}`)
  }
  for (const host of ['127.0.0.1', 'localhost', '192.168.1.50', 'studio-pc', 'mv.local']) {
    const res = await srv.patch(`/api/graphics/${g.id}`, { data: { multiviewer: { host } } })
    assert.equal(res.status, 200, `${host} → ${res.status} ${res.text}`)
  }
})

test('delete graphic', async () => {
  const g = await createGraphic('message')
  assert.equal((await srv.del(`/api/graphics/${g.id}`)).status, 200)
  assert.equal((await srv.del(`/api/graphics/${g.id}`)).status, 404)
})
