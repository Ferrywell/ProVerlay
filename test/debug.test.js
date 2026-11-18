import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { makeTempDir } from './helpers.js'
import { startServer } from '../server/app.js'
import {
  DEBUG_LOG_MAX,
  debugEntries,
  debugLog,
  describeClient,
  describeStateChange,
  onDebugLog
} from '../server/debugLog.js'
import { graphicOrigin } from '../server/debugSnapshot.js'

test('debugLog keeps a bounded ring buffer and notifies listeners', () => {
  const seen = []
  const off = onDebugLog((e) => seen.push(e))
  const first = debugLog('f1', 'hello', { level: 'warn', detail: { a: 1 }, graphicId: 'g1' })
  off()
  assert.equal(first.area, 'f1')
  assert.equal(first.level, 'warn')
  assert.equal(first.detail, '{"a":1}')
  assert.equal(first.graphicId, 'g1')
  assert.equal(seen.length, 1)
  assert.equal(debugLog('nonsense', 'x', { level: 'loud' }).area, 'server')
  for (let i = 0; i < DEBUG_LOG_MAX + 10; i++) debugLog('state', `line ${i}`)
  const all = debugEntries()
  assert.equal(all.length, DEBUG_LOG_MAX)
  assert.equal(all.at(-1).message, `line ${DEBUG_LOG_MAX + 9}`)
  assert.equal(debugEntries(all.at(-2).seq).length, 1)
})

test('describeClient names the page or the kind of client', () => {
  const req = (headers, ip = '127.0.0.1') => ({ headers, socket: { remoteAddress: ip } })
  assert.equal(describeClient(req({ referer: 'http://localhost:2014/operator?x=1' })), 'operator page (this computer)')
  assert.equal(describeClient(req({ 'user-agent': 'node' }, '::ffff:192.168.1.20')), 'script or Companion (192.168.1.20)')
  assert.equal(describeClient(req({ 'user-agent': 'Mozilla/5.0' })), 'browser (this computer)')
})

test('describeStateChange reports on/off air, edits, adds and removes', () => {
  const g = (id, extra = {}) => ({ id, name: id.toUpperCase(), type: 'lowerThirdShow', visible: false, data: { a: 1 }, ...extra })
  const prev = { projectId: 'p', graphics: [g('a'), g('b'), g('c')] }
  const next = { projectId: 'p', graphics: [g('a', { visible: true }), g('b', { data: { a: 2 } }), g('d')] }
  const lines = describeStateChange(prev, next).map((l) => l.message)
  assert.deepEqual(lines, [
    '"A" (lowerThirdShow) went on air',
    '"B" (lowerThirdShow) changed: data.a',
    'Added "D" (lowerThirdShow)',
    'Removed "C" (lowerThirdShow)'
  ])
  assert.deepEqual(describeStateChange({ projectId: 'p', graphics: [] }, { projectId: 'q', projectName: 'Q', graphics: [] }), [
    { message: 'Project "Q" is now active' }
  ])
})

test('graphicOrigin says where content comes from', () => {
  const sources = [{ id: 's1', name: 'Names', origin: 'url', url: 'https://docs.google.com/x', status: { state: 'ok', held: ['g2'] } }]
  const f1 = [
    { graphicId: 'f', source: 'multiviewer', multiviewer: { url: 'http://127.0.0.1:10101/api/v1/live-timing', status: { connected: false, lastError: 'refused' } } }
  ]
  assert.match(graphicOrigin({ id: 'g1', type: 'lowerThirdShow', data: {} }).label, /Typed in/)
  const bound = graphicOrigin({ id: 'g2', type: 'lowerThirdShow', data: { dataBinding: { sourceId: 's1' } } }, { sources })
  assert.equal(bound.kind, 'data')
  assert.match(bound.label, /"Names" \(ok, change held while on air\)/)
  assert.equal(bound.detail, 'https://docs.google.com/x')
  const tower = graphicOrigin({ id: 'f', type: 'f1Timing', data: {} }, { f1 })
  assert.match(tower.label, /MultiViewer live timing \(not connected: refused\)/)
  const vars = graphicOrigin({ id: 'g3', type: 'customTicker', data: { messages: [{ id: 'm', text: 'Hi {{event.title}}' }] } })
  assert.deepEqual(vars.variables, ['event.title'])
})

let handle = null
after(async () => {
  await handle?.close()
})

test('GET /api/debug returns a snapshot with the log; writes are logged', async () => {
  handle = await startServer({ dataDir: await makeTempDir(), port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${handle.port}`
  const created = await fetch(`${base}/api/graphics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: `${base}/control` },
    body: JSON.stringify({ type: 'lowerThirdShow' })
  })
  assert.equal(created.status, 201)
  const res = await fetch(`${base}/api/debug`)
  assert.equal(res.status, 200)
  const snap = await res.json()
  assert.equal(snap.server.port, handle.port)
  assert.equal(snap.graphics.length >= 1, true)
  assert.match(snap.graphics.at(-1).origin.label, /Typed in/)
  const messages = snap.log.map((e) => e.message)
  assert.ok(messages.some((m) => /^Server started on port/.test(m)))
  assert.ok(messages.some((m) => /^Added .*\(lowerThirdShow\)/.test(m)))
  assert.ok(messages.some((m) => /^POST \/api\/graphics → 201 .* from control page/.test(m)))
  const page = await fetch(`${base}/debug`)
  assert.equal(page.status, 200)
  const noLog = await (await fetch(`${base}/api/debug?log=0`)).json()
  assert.equal(noLog.log, undefined)
})
