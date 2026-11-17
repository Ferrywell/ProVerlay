import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { InstanceStatus } from '@companion-module/base'
import ProVerlayInstance from '../index.js'
import { FakeSocket, fakeContext } from './context.js'
import { IDS, sampleState } from './fixtures.js'

const logs = []
beforeEach(() => {
  logs.length = 0
  globalThis.COMPANION_LOGGER = (_source, level, message) => logs.push([level, message])
})
afterEach(() => {
  delete globalThis.COMPANION_LOGGER
})

async function createInstance(config = { host: '127.0.0.1', port: '2014' }) {
  const ctx = fakeContext()
  const instance = new ProVerlayInstance(ctx)
  const sockets = []
  instance.socketFactory = (url, options) => {
    const socket = new FakeSocket(url, options)
    sockets.push(socket)
    return socket
  }
  await instance.init(config)
  return { instance, ctx, calls: ctx.calls, sockets }
}

test('connects with reconnect backoff and no custom headers', async () => {
  const { instance, sockets, calls } = await createInstance()
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].url, 'http://127.0.0.1:2014')
  assert.equal(sockets[0].options.reconnection, true)
  assert.ok(sockets[0].options.reconnectionDelayMax > sockets[0].options.reconnectionDelay)
  assert.equal(sockets[0].options.extraHeaders, undefined)
  assert.equal(calls.status.at(-1)[0], InstanceStatus.Connecting)
  await instance.destroy()
  assert.equal(sockets[0].disconnected, true)
})

test('status: ok on state, failure on connect_error, disconnected on drop', async () => {
  const { instance, sockets, calls } = await createInstance()
  const socket = sockets[0]
  socket.emit('connect_error', new Error('ECONNREFUSED'))
  assert.deepEqual(calls.status.at(-1), [InstanceStatus.ConnectionFailure, 'ECONNREFUSED'])
  socket.emit('connect_error', new Error('ECONNREFUSED'))
  assert.equal(logs.filter(([level]) => level === 'warn').length, 1, 'repeated failures are logged once as warning')

  socket.emit('connect')
  socket.emit('stateChanged', sampleState())
  assert.deepEqual(calls.status.at(-1), [InstanceStatus.Ok, null])

  socket.emit('disconnect', 'transport close')
  assert.equal(calls.status.at(-1)[0], InstanceStatus.Disconnected)
  await instance.destroy()
})

test('invalid config sets BadConfig and does not connect', async () => {
  const { instance, sockets, calls } = await createInstance({ host: 'bad host!', port: '2014' })
  assert.equal(sockets.length, 0)
  assert.equal(calls.status.at(-1)[0], InstanceStatus.BadConfig)
  await instance.destroy()
})

test('definitions are rebuilt only when the set of graphics changes', async () => {
  const { instance, sockets, calls } = await createInstance()
  const socket = sockets[0]
  const base = {
    actions: calls.actions,
    presets: calls.presets,
    variables: calls.variables,
    feedbacks: calls.feedbacks,
  }

  socket.emit('stateChanged', sampleState())
  assert.equal(calls.actions, base.actions + 1, 'first state builds definitions')

  // Score, clock, visibility and active-entry changes: values only.
  for (let i = 0; i < 5; i++) {
    const state = sampleState()
    state.graphics[0].data.homeScore = 10 + i
    state.graphics[0].visible = i % 2 === 0
    state.graphics[1].data.clock.running = true
    state.graphics[1].data.clock.runningSince = new Date().toISOString()
    state.graphics[4].data.activeEntryId = 'sp-1'
    socket.emit('stateChanged', state)
  }
  assert.equal(calls.actions, base.actions + 1)
  assert.equal(calls.feedbacks, base.feedbacks + 1)
  assert.equal(calls.presets, base.presets + 1)
  assert.equal(calls.variables, base.variables + 1)
  assert.ok(calls.checkAll >= 6, 'feedbacks are re-checked on every state')

  // Rename → rebuild.
  const renamed = sampleState()
  renamed.graphics[0].name = 'Final'
  socket.emit('stateChanged', renamed)
  assert.equal(calls.actions, base.actions + 2)
  assert.equal(calls.presets, base.presets + 2)

  // New graphic → rebuild.
  const added = sampleState()
  added.graphics[0].name = 'Final'
  added.graphics.push({ id: 'message-new', type: 'message', name: 'New', data: { text: '' } })
  socket.emit('stateChanged', added)
  assert.equal(calls.actions, base.actions + 3)
  assert.ok(calls.lastActions.message_set.options[0].choices.some((c) => c.id === 'message-new'))
  await instance.destroy()
})

test('only changed variable values are sent', async () => {
  const { instance, sockets, calls } = await createInstance()
  const socket = sockets[0]
  socket.emit('stateChanged', sampleState())
  const firstPush = calls.values.at(-1)
  assert.ok(Object.keys(firstPush).length > 20, 'full set after (re)definition')

  const next = sampleState()
  next.graphics[0].data.homeScore = 3
  socket.emit('stateChanged', next)
  const key = instance.varKeys.get(IDS.match)
  const keysChanged = Object.keys(calls.values.at(-1))
  assert.ok(keysChanged.includes(`score_${key}_home`))
  assert.ok(!keysChanged.includes(`name_${key}`), 'unchanged values are not resent')
  await instance.destroy()
})

test('tick updates a running clock locally and uses the server time offset', async () => {
  const { instance, sockets, calls } = await createInstance()
  const state = sampleState()
  // Server clock is 10 minutes ahead of this machine.
  const serverNow = Date.now() + 600_000
  state.serverNow = serverNow
  state.graphics[0].data.clock = {
    period: 'first_half',
    minute: 0,
    second: 0,
    running: true,
    runningSince: new Date(serverNow - 5_000).toISOString(),
  }
  sockets[0].emit('stateChanged', state)
  const key = `clock_${instance.varKeys.get(IDS.match)}`
  assert.equal(instance.variableValues[key], '00:05')

  instance.serverOffset += 2_000 // pretend two seconds passed
  const pushes = calls.values.length
  instance.tick()
  assert.equal(calls.values.length, pushes + 1)
  assert.deepEqual(Object.keys(calls.values.at(-1)), [key], 'tick only pushes the changed clock')
  assert.equal(calls.values.at(-1)[key], '00:07')

  instance.tick()
  assert.equal(calls.values.length, pushes + 1, 'no push when nothing changed')
  await instance.destroy()
})

test('hockey last quarter is remembered for next period after a break', async () => {
  const { instance, sockets } = await createInstance()
  const state = sampleState()
  sockets[0].emit('stateChanged', state)
  assert.equal(instance.hockeyLastQuarter.get(IDS.hockey), 'q2')
  const brk = sampleState()
  brk.graphics[1].data.clock.period = 'break'
  sockets[0].emit('stateChanged', brk)
  assert.equal(instance.hockeyLastQuarter.get(IDS.hockey), 'q2')
  await instance.destroy()
})

test('invalid states are ignored', async () => {
  const { instance, sockets, calls } = await createInstance()
  const before = calls.actions
  sockets[0].emit('stateChanged', { nope: true })
  assert.equal(calls.actions, before)
  assert.ok(logs.some(([level, msg]) => level === 'warn' && /invalid state/.test(msg)))
  await instance.destroy()
})

test('reconnects manually after a server-side disconnect (clean ProVerlay shutdown)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const { instance, sockets } = await createInstance()
  const socket = sockets[0]
  let connects = 0
  socket.connected = false
  socket.connect = () => connects++
  socket.emit('disconnect', 'io server disconnect')
  assert.equal(connects, 0)
  t.mock.timers.tick(1000)
  assert.equal(connects, 1)
  // a client-side disconnect (destroy / config change) never reconnects
  socket.emit('disconnect', 'io client disconnect')
  t.mock.timers.tick(5000)
  assert.equal(connects, 1)
  await instance.destroy()
})
