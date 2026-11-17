/**
 * Integration smoke test: the real module instance (fake Companion host, real
 * socket.io-client + fetch) against a real ProVerlay server.
 *
 *   npm run test:integration
 *
 * By default it starts ../server/index.js from this repository on port 2403
 * with a temporary data dir. Set PROVERLAY_URL=http://host:port to use a
 * server that is already running instead (it must be a throwaway project:
 * the test creates and changes graphics).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { InstanceStatus } from '@companion-module/base'
import ProVerlayInstance from '../../index.js'
import { fakeContext } from '../context.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverEntry = path.resolve(here, '../../../server/index.js')
const PORT = Number(process.env.PROVERLAY_TEST_PORT || 2403)
const BASE = process.env.PROVERLAY_URL || `http://127.0.0.1:${PORT}`

let serverProcess = null
let dataDir = null
let instance = null
let ctx = null
const logs = []
const ids = {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function rest(method, route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${JSON.stringify(json)}`)
  return json
}

const graphic = (id) => rest('GET', `/api/graphics/${id}`)

async function waitFor(fn, what, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch (err) {
      last = err
    }
    await sleep(25)
  }
  throw new Error(`Timed out waiting for ${what} (${last?.message || JSON.stringify(last)})`)
}

/** Run an action callback exactly like Companion would, then let the socket echo arrive. */
async function press(actionId, options) {
  const def = ctx.calls.lastActions[actionId]
  assert.ok(def, `action ${actionId} is defined`)
  await def.callback({ id: 'a', controlId: 'c', actionId, options, surfaceId: undefined }, {})
}

const feedback = (id, options) => ctx.calls.lastFeedbacks[id].callback({ options })

before(async () => {
  if (!process.env.PROVERLAY_URL) {
    assert.ok(fs.existsSync(serverEntry), `ProVerlay server not found at ${serverEntry}`)
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proverlay-companion-it-'))
    serverProcess = spawn(process.execPath, [serverEntry], {
      env: { ...process.env, PORT: String(PORT), PROVERLAY_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    serverProcess.stdout.on('data', (d) => (output += d))
    serverProcess.stderr.on('data', (d) => (output += d))
    await waitFor(() => rest('GET', '/api/state'), `ProVerlay on ${BASE}\n${output}`, 15000)
  }

  const types = [
    ['match', 'matchScoreboard', 'IT Match'],
    ['hockey', 'hockeyScorebug', 'IT Hockey'],
    ['ticker', 'customTicker', 'IT Ticker'],
    ['countdown', 'streamCountdown', 'IT Countdown'],
    ['roster', 'lowerThirdShow', 'IT Speakers'],
    ['quiz', 'quizShow', 'IT Quiz'],
    ['message', 'message', 'IT Message'],
  ]
  for (const [key, type, name] of types) ids[key] = (await rest('POST', '/api/graphics', { type, name })).id
  for (const name of ['Anna', 'Bram', 'Cleo']) {
    await rest('POST', `/api/graphics/${ids.roster}/entries`, { name, title: `${name} title` })
  }

  globalThis.COMPANION_LOGGER = (_source, level, message) => logs.push([level, message])
  ctx = fakeContext()
  instance = new ProVerlayInstance(ctx)
  const url = new URL(BASE)
  await instance.init({ host: url.hostname, port: url.port })
  await waitFor(() => instance.hasState && instance.state.graphics.some((g) => g.id === ids.message), 'first state')
})

after(async () => {
  await instance?.destroy()
  delete globalThis.COMPANION_LOGGER
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    await new Promise((resolve) => serverProcess.once('exit', resolve))
  }
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
})

test('connects, status ok, definitions for every widget', () => {
  assert.equal(ctx.calls.status.at(-1)[0], InstanceStatus.Ok)
  const scoreChoices = ctx.calls.lastActions.score.options[0].choices.map((c) => c.id)
  assert.ok(scoreChoices.includes(ids.match) && scoreChoices.includes(ids.hockey))
  const sections = ctx.calls.lastPresets.structure.map((s) => s.name)
  for (const name of ['Match scoreboard', 'Hockey scorebug', 'Ticker', 'Countdown', 'Lower thirds roster', 'Quiz']) {
    assert.ok(sections.includes(name), `preset section ${name}`)
  }
})

test('visibility and solo', async () => {
  await press('graphic_visibility', { graphic: ids.match, mode: 'show' })
  assert.equal((await graphic(ids.match)).visible, true)
  await waitFor(() => feedback('graphic_on_air', { graphic: ids.match }), 'on-air feedback')
  await press('graphic_visibility', { graphic: ids.match, mode: 'toggle' })
  assert.equal((await graphic(ids.match)).visible, false)
  await press('graphic_visibility', { graphic: ids.match, mode: 'toggle' })
  assert.equal((await graphic(ids.match)).visible, true)
  await press('graphic_visibility', { graphic: ids.match, mode: 'hide' })
  assert.equal((await graphic(ids.match)).visible, false)
  await press('graphic_solo', { graphic: ids.hockey, mode: 'toggle' })
  assert.equal((await graphic(ids.hockey)).soloVisible, true)
  await waitFor(() => feedback('graphic_solo_on_air', { graphic: ids.hockey }), 'solo feedback')
  await press('graphic_solo', { graphic: ids.hockey, mode: 'hide' })
  assert.equal((await graphic(ids.hockey)).soloVisible, false)
})

test('score: rapid presses are never lost (atomic endpoint), match and hockey', async () => {
  const before = ctx.calls.actions
  await Promise.all(
    Array.from({ length: 5 }, () => press('score', { graphic: ids.match, side: 'home', mode: 'add', amount: 1 })),
  )
  assert.equal((await graphic(ids.match)).data.homeScore, 5)
  await press('score', { graphic: ids.match, side: 'home', mode: 'subtract', amount: 1 })
  await press('score', { graphic: ids.hockey, side: 'away', mode: 'set', amount: 7 })
  assert.equal((await graphic(ids.match)).data.homeScore, 4)
  assert.equal((await graphic(ids.hockey)).data.awayScore, 7)
  const key = instance.varKeys.get(ids.hockey)
  await waitFor(() => instance.variableValues[`score_${key}_away`] === 7, 'score variable')
  assert.equal(ctx.calls.actions, before, 'score changes do not rebuild definitions')
})

test('match clock: start keeps elapsed time, pause, adjust, set, reset', async () => {
  await press('clock', { graphic: ids.match, action: 'start' })
  assert.equal((await graphic(ids.match)).data.clock.running, true)
  await waitFor(() => feedback('clock_running', { graphic: ids.match }), 'clock running feedback')
  await sleep(1100)
  await press('clock', { graphic: ids.match, action: 'start' }) // must not reset
  await press('clock', { graphic: ids.match, action: 'pause' })
  let clock = (await graphic(ids.match)).data.clock
  assert.equal(clock.running, false)
  assert.ok(clock.minute * 60 + clock.second >= 1, `elapsed time kept (${clock.minute}:${clock.second})`)
  const elapsed = clock.minute * 60 + clock.second

  await press('clock', { graphic: ids.match, action: 'adjust', seconds: 30 })
  clock = (await graphic(ids.match)).data.clock
  assert.equal(clock.minute * 60 + clock.second, elapsed + 30)

  await press('clock', { graphic: ids.match, action: 'set', time: '45:00' })
  clock = (await graphic(ids.match)).data.clock
  assert.deepEqual([clock.minute, clock.second], [45, 0])
  const key = instance.varKeys.get(ids.match)
  await waitFor(() => instance.variableValues[`clock_${key}`] === '45:00', 'clock variable 45:00')

  await press('clock', { graphic: ids.match, action: 'reset' })
  clock = (await graphic(ids.match)).data.clock
  assert.deepEqual([clock.minute, clock.second, clock.running], [0, 0, false])

  await press('match_period', { graphic: ids.match, period: 'second_half' })
  const data = (await graphic(ids.match)).data
  assert.equal(data.clock.period, 'second_half')
  assert.equal(data.homeScore, 4, 'period patch leaves the score alone')
  await waitFor(() => instance.variableValues[`period_${key}`] === '2nd half', 'period variable')
})

test('hockey clock and periods', async () => {
  await press('clock', { graphic: ids.hockey, action: 'reset' })
  let clock = (await graphic(ids.hockey)).data.clock
  assert.equal(clock.remainingMs, clock.quarterMs)
  await press('clock', { graphic: ids.hockey, action: 'toggle' })
  assert.equal((await graphic(ids.hockey)).data.clock.running, true)
  await press('clock', { graphic: ids.hockey, action: 'adjust', seconds: -15 })
  clock = (await graphic(ids.hockey)).data.clock
  assert.ok(clock.running, 'adjust keeps the clock running')
  assert.ok(clock.remainingMs <= clock.quarterMs - 15000)

  const key = instance.varKeys.get(ids.hockey)
  const shown = await waitFor(() => instance.variableValues[`clock_${key}`], 'hockey clock variable')
  assert.match(shown, /^1[34]:\d\d$/)

  // Moving to a break while running pauses first.
  await press('hockey_period', { graphic: ids.hockey, mode: 'set', period: 'break' })
  clock = (await graphic(ids.hockey)).data.clock
  assert.equal(clock.period, 'break')
  assert.equal(clock.running, false)
  await waitFor(() => instance.variableValues[`clock_${key}`] === '—:—', 'break clock variable')

  // default hockey period is q2 → after the break comes q3
  await press('hockey_period', { graphic: ids.hockey, mode: 'next', resetClock: true })
  clock = (await graphic(ids.hockey)).data.clock
  assert.equal(clock.period, 'q3')
  assert.equal(clock.remainingMs, clock.quarterMs)
  await press('hockey_period', { graphic: ids.hockey, mode: 'previous' })
  assert.equal((await graphic(ids.hockey)).data.clock.period, 'q2')
})

test('ticker: toggle and add messages', async () => {
  const [first] = (await graphic(ids.ticker)).data.messages
  await waitFor(() => instance.state.graphics.find((g) => g.id === ids.ticker), 'ticker in state')
  const ref = `${ids.ticker}|${first.id}`
  const initial = first.enabled
  await press('ticker_message', { message: ref, mode: 'toggle' })
  assert.equal((await graphic(ids.ticker)).data.messages[0].enabled, !initial)
  await press('ticker_add', { graphic: ids.ticker, text: 'Goal for the home team', enabled: true })
  const messages = (await graphic(ids.ticker)).data.messages
  assert.equal(messages.length, 2)
  assert.equal(messages[0].text, first.text, 'existing message text kept')
  assert.deepEqual([messages[1].text, messages[1].enabled], ['Goal for the home team', true])
  // a new message changes the dropdowns → definitions rebuilt with the new choice
  await waitFor(
    () =>
      ctx.calls.lastActions.ticker_message.options[0].choices.some((c) => c.id === `${ids.ticker}|${messages[1].id}`),
    'new ticker message in dropdown',
  )
  await press('ticker_message', { message: `${ids.ticker}|${messages[1].id}`, mode: 'disable' })
  assert.equal((await graphic(ids.ticker)).data.messages[1].enabled, false)
})

test('countdown: start, stop, target', async () => {
  await press('countdown_start', { graphic: ids.countdown, minutes: 2, seconds: 0 })
  let target = Date.parse((await graphic(ids.countdown)).data.targetDateTime)
  assert.ok(Math.abs(target - Date.now() - 120_000) < 2000)
  const key = instance.varKeys.get(ids.countdown)
  await waitFor(() => /^(2:00|1:59)$/.test(instance.variableValues[`countdown_${key}`]), 'countdown variable')
  await press('countdown_stop', { graphic: ids.countdown })
  target = Date.parse((await graphic(ids.countdown)).data.targetDateTime)
  assert.ok(Math.abs(target - Date.now()) < 2000)
  await press('countdown_target', { graphic: ids.countdown, target: '2031-02-03T04:05:06Z' })
  assert.equal((await graphic(ids.countdown)).data.targetDateTime, '2031-02-03T04:05:06.000Z')
})

test('lower thirds: show, next, previous, hide', async () => {
  const entries = (await graphic(ids.roster)).data.entries
  await press('lower_third_show', { speaker: `${ids.roster}|${entries[0].id}` })
  let g = await graphic(ids.roster)
  assert.deepEqual([g.visible, g.data.activeEntryId], [true, entries[0].id])
  await waitFor(
    () => feedback('lower_third_entry_active', { speaker: `${ids.roster}|${entries[0].id}` }),
    'speaker feedback',
  )
  await press('lower_third_step', { graphic: ids.roster, direction: 'next', wrap: true })
  assert.equal((await graphic(ids.roster)).data.activeEntryId, entries[1].id)
  await waitFor(
    () => instance.state.graphics.find((x) => x.id === ids.roster)?.data.activeEntryId === entries[1].id,
    'echo',
  )
  await press('lower_third_step', { graphic: ids.roster, direction: 'previous', wrap: true })
  assert.equal((await graphic(ids.roster)).data.activeEntryId, entries[0].id)
  await press('lower_third_hide', { graphic: ids.roster })
  g = await graphic(ids.roster)
  assert.equal(g.visible, false)
  const key = instance.varKeys.get(ids.roster)
  assert.equal(instance.variableValues[`speaker_${key}_name`] !== undefined, true)
})

test('quiz: show, reveal, toggle, hide', async () => {
  const [q] = (await graphic(ids.quiz)).data.questions
  await press('quiz_show', { question: `${ids.quiz}|${q.id}` })
  let g = await graphic(ids.quiz)
  assert.deepEqual([g.visible, g.data.activeQuestionId, g.data.revealed], [true, q.id, false])
  await press('quiz_reveal', { graphic: ids.quiz, mode: 'reveal' })
  assert.equal((await graphic(ids.quiz)).data.revealed, true)
  await waitFor(() => feedback('quiz_revealed', { graphic: ids.quiz }), 'quiz revealed feedback')
  await press('quiz_reveal', { graphic: ids.quiz, mode: 'toggle' })
  assert.equal((await graphic(ids.quiz)).data.revealed, false)
  await press('quiz_hide', { graphic: ids.quiz })
  g = await graphic(ids.quiz)
  assert.equal(g.visible, false)
})

test('message: set text and show', async () => {
  await press('message_set', { graphic: ids.message, text: 'Half time', show: true })
  const g = await graphic(ids.message)
  assert.deepEqual([g.visible, g.data.text], [true, 'Half time'])
  const key = instance.varKeys.get(ids.message)
  await waitFor(() => instance.variableValues[`message_${key}`] === 'Half time', 'message variable')
})

test('brand colour', async () => {
  await press('brand_primary_color', { color: 0x123456 })
  const state = await rest('GET', '/api/state')
  assert.equal(state.brand.colors.primary, '#123456')
})

test('server errors are logged with the server message', async () => {
  // A graphic the module still has cached but the server no longer knows.
  const ghost = { id: 'message-ghost', type: 'message', name: 'Ghost', data: { text: '' } }
  instance.state = { ...instance.state, graphics: [...instance.state.graphics, ghost] }
  await press('message_set', { graphic: ghost.id, text: 'x', show: false })
  assert.ok(
    logs.some(([level, msg]) => level === 'error' && /Message failed: .*HTTP 404 – Graphic not found/.test(msg)),
    JSON.stringify(logs.slice(-3)),
  )
  await press('score', { graphic: ids.match, side: 'home', mode: 'set', amount: 100000 })
  assert.ok(logs.some(([level, msg]) => level === 'error' && /HTTP 400/.test(msg)))
})

test('deleting a graphic removes it from the dropdowns', async () => {
  await rest('DELETE', `/api/graphics/${ids.message}`)
  await waitFor(() => !instance.state.graphics.some((g) => g.id === ids.message), 'deleted graphic gone')
  assert.ok(!ctx.calls.lastActions.message_set.options[0].choices.some((c) => c.id === ids.message))
})

test('reconnects after the server restarts', { skip: Boolean(process.env.PROVERLAY_URL) }, async () => {
  serverProcess.kill('SIGTERM')
  await new Promise((resolve) => serverProcess.once('exit', resolve))
  await waitFor(
    () => [InstanceStatus.Disconnected, InstanceStatus.ConnectionFailure].includes(ctx.calls.status.at(-1)[0]),
    'disconnected status',
  )
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PORT: String(PORT), PROVERLAY_DATA_DIR: dataDir },
    stdio: 'ignore',
  })
  await waitFor(() => ctx.calls.status.at(-1)[0] === InstanceStatus.Ok, 'ok status after restart', 15000)
})
