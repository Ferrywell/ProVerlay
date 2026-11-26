import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getActionDefinitions } from '../src/actions.js'
import { ApiError } from '../src/api.js'
import { IDS, fakeSelf, sampleState } from './fixtures.js'

async function run(self, actionId, options) {
  const defs = getActionDefinitions(self)
  assert.ok(defs[actionId], `action ${actionId} exists`)
  self.api.calls.length = 0
  await defs[actionId].callback({ id: 'a1', controlId: 'c1', actionId, options, surfaceId: undefined }, {})
  return self.api.calls
}

test('every action has a name, options with defaults and a callback', () => {
  const defs = getActionDefinitions(fakeSelf())
  for (const [id, def] of Object.entries(defs)) {
    assert.equal(typeof def.name, 'string', id)
    assert.equal(typeof def.callback, 'function', id)
    for (const option of def.options) {
      assert.ok(option.id && option.type && option.label, `${id}.${option.id}`)
      if (option.type === 'dropdown') {
        assert.ok(option.choices.length > 0, `${id}.${option.id} has choices`)
        assert.ok(
          option.choices.some((c) => c.id === option.default),
          `${id}.${option.id} default is a choice`,
        )
      }
    }
  }
})

test('dropdowns are filled from the current state', () => {
  const defs = getActionDefinitions(fakeSelf())
  const scoreChoices = defs.score.options.find((o) => o.id === 'graphic').choices.map((c) => c.id)
  assert.deepEqual(scoreChoices, [IDS.match, IDS.hockey])
  const speakers = defs.lower_third_show.options[0].choices.map((c) => c.id)
  assert.deepEqual(speakers, [`${IDS.roster}|sp-1`, `${IDS.roster}|sp-2`, `${IDS.roster}|sp-3`])
  const empty = getActionDefinitions(fakeSelf({ graphics: [] }))
  assert.equal(empty.score.options[0].choices[0].id, '')
  assert.match(empty.score.options[0].choices[0].label, /No match or hockey/)
})

test('visibility: toggle flips on the server, show/hide set explicitly', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'graphic_visibility', { graphic: IDS.match, mode: 'toggle' }), [
    ['setVisible', IDS.match, undefined],
  ])
  assert.deepEqual(await run(self, 'graphic_visibility', { graphic: IDS.match, mode: 'show' }), [
    ['setVisible', IDS.match, true],
  ])
  assert.deepEqual(await run(self, 'graphic_visibility', { graphic: IDS.match, mode: 'hide' }), [['hide', IDS.match]])
  assert.deepEqual(await run(self, 'graphic_solo', { graphic: IDS.f1, mode: 'toggle' }), [
    ['setSoloVisible', IDS.f1, undefined],
  ])
  assert.deepEqual(await run(self, 'graphic_solo', { graphic: IDS.f1, mode: 'hide' }), [
    ['setSoloVisible', IDS.f1, false],
  ])
})

test('score uses the atomic endpoint for match and hockey (never the cached data)', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'score', { graphic: IDS.match, side: 'home', mode: 'add', amount: 1 }), [
    ['score', IDS.match, { side: 'home', delta: 1 }],
  ])
  assert.deepEqual(await run(self, 'score', { graphic: IDS.hockey, side: 'away', mode: 'subtract', amount: 1 }), [
    ['score', IDS.hockey, { side: 'away', delta: -1 }],
  ])
  assert.deepEqual(await run(self, 'score', { graphic: IDS.hockey, side: 'home', mode: 'set', amount: 4 }), [
    ['score', IDS.hockey, { side: 'home', value: 4 }],
  ])
  // Two quick presses are two independent deltas — nothing is computed client-side.
  await run(self, 'score', { graphic: IDS.match, side: 'home', mode: 'add', amount: 1 })
  assert.deepEqual(self.api.calls, [['score', IDS.match, { side: 'home', delta: 1 }]])
})

test('score on a non-score graphic is refused locally and logged', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'score', { graphic: IDS.ticker, side: 'home', mode: 'add', amount: 1 }), [])
  assert.match(self.logs.at(-1)[1], /not a scoreboard/)
})

test('clock actions go to the atomic clock endpoint', async () => {
  const self = fakeSelf()
  for (const action of ['start', 'pause', 'toggle', 'reset']) {
    assert.deepEqual(await run(self, 'clock', { graphic: IDS.match, action }), [['clock', IDS.match, action]])
  }
  assert.deepEqual(await run(self, 'clock', { graphic: IDS.hockey, action: 'adjust', seconds: -15 }), [
    ['clock', IDS.hockey, 'adjust', -15000],
  ])
  assert.deepEqual(await run(self, 'clock', { graphic: IDS.match, action: 'set', time: '45:00' }), [
    ['clock', IDS.match, 'set', 2_700_000],
  ])
  assert.deepEqual(await run(self, 'clock', { graphic: IDS.match, action: 'adjust', seconds: 0 }), [])
  assert.deepEqual(await run(self, 'clock', { graphic: IDS.match, action: 'set', time: 'xx' }), [])
  assert.match(self.logs.at(-1)[1], /invalid time/)
})

test('match period patches only the period field', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'match_period', { graphic: IDS.match, period: 'second_half' }), [
    ['patchGraphic', IDS.match, { data: { clock: { period: 'second_half' } } }],
  ])
})

test('hockey period: next / previous / set, pause before a break, optional reset', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'hockey_period', { graphic: IDS.hockey, mode: 'next' }), [
    ['patchGraphic', IDS.hockey, { data: { clock: { period: 'q3' } } }],
  ])
  assert.deepEqual(await run(self, 'hockey_period', { graphic: IDS.hockey, mode: 'previous', resetClock: true }), [
    ['patchGraphic', IDS.hockey, { data: { clock: { period: 'q1' } } }],
    ['clock', IDS.hockey, 'reset'],
  ])
  // Running clock → pause first so the break does not swallow time.
  const hockey = self.state.graphics.find((g) => g.id === IDS.hockey)
  hockey.data.clock.running = true
  hockey.data.clock.runningSince = new Date().toISOString()
  assert.deepEqual(await run(self, 'hockey_period', { graphic: IDS.hockey, mode: 'set', period: 'break' }), [
    ['clock', IDS.hockey, 'pause'],
    ['patchGraphic', IDS.hockey, { data: { clock: { period: 'break' } } }],
  ])
  // From a break "next" continues after the last quarter that was played.
  hockey.data.clock = { period: 'break', remainingMs: 0, running: false }
  self.hockeyLastQuarter.set(IDS.hockey, 'q2')
  assert.deepEqual(await run(self, 'hockey_period', { graphic: IDS.hockey, mode: 'next' }), [
    ['patchGraphic', IDS.hockey, { data: { clock: { period: 'q3' } } }],
  ])
})

test('ticker: toggling a message sends only ids for the other messages', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'ticker_message', { message: `${IDS.ticker}|msg-2`, mode: 'toggle' }), [
    [
      'patchGraphic',
      IDS.ticker,
      { data: { messages: [{ id: 'msg-1' }, { id: 'msg-2', enabled: true }, { id: 'msg-3' }] } },
    ],
  ])
  assert.deepEqual(await run(self, 'ticker_message', { message: `${IDS.ticker}|msg-1`, mode: 'disable' }), [
    [
      'patchGraphic',
      IDS.ticker,
      { data: { messages: [{ id: 'msg-1', enabled: false }, { id: 'msg-2' }, { id: 'msg-3' }] } },
    ],
  ])
  assert.deepEqual(await run(self, 'ticker_add', { graphic: IDS.ticker, text: '  Goal!  ', enabled: true }), [
    [
      'patchGraphic',
      IDS.ticker,
      { data: { messages: [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }, { text: 'Goal!', enabled: true }] } },
    ],
  ])
  assert.deepEqual(await run(self, 'ticker_add', { graphic: IDS.ticker, text: '   ' }), [])
})

test('countdown: start / stop / target set targetDateTime only', async () => {
  const self = fakeSelf()
  const before = Date.now()
  const [[method, id, patch]] = await run(self, 'countdown_start', { graphic: IDS.countdown, minutes: 2, seconds: 30 })
  assert.equal(method, 'patchGraphic')
  assert.equal(id, IDS.countdown)
  assert.deepEqual(Object.keys(patch.data), ['targetDateTime'])
  const delta = Date.parse(patch.data.targetDateTime) - before
  assert.ok(delta >= 150_000 && delta < 151_000, `target is 2:30 from now (${delta})`)

  const [[, , stop]] = await run(self, 'countdown_stop', { graphic: IDS.countdown })
  assert.ok(Math.abs(Date.parse(stop.data.targetDateTime) - Date.now()) < 1000)

  const [[, , target]] = await run(self, 'countdown_target', { graphic: IDS.countdown, target: '2030-01-01T10:00:00Z' })
  assert.equal(target.data.targetDateTime, '2030-01-01T10:00:00.000Z')
})

test('countdown start uses the server clock offset', async () => {
  const self = fakeSelf()
  self.serverNow = () => Date.parse('2030-01-01T10:00:00Z')
  const [[, , patch]] = await run(self, 'countdown_start', { graphic: IDS.countdown, minutes: 1, seconds: 0 })
  assert.equal(patch.data.targetDateTime, '2030-01-01T10:01:00.000Z')
})

test('lower thirds: show, next, previous, hide', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'lower_third_show', { speaker: `${IDS.roster}|sp-1` }), [
    ['showEntry', IDS.roster, 'sp-1'],
  ])
  assert.deepEqual(await run(self, 'lower_third_step', { graphic: IDS.roster, direction: 'next', wrap: true }), [
    ['showEntry', IDS.roster, 'sp-3'],
  ])
  assert.deepEqual(await run(self, 'lower_third_step', { graphic: IDS.roster, direction: 'previous', wrap: true }), [
    ['showEntry', IDS.roster, 'sp-1'],
  ])
  self.state.graphics.find((g) => g.id === IDS.roster).data.activeEntryId = 'sp-3'
  assert.deepEqual(await run(self, 'lower_third_step', { graphic: IDS.roster, direction: 'next', wrap: false }), [])
  assert.deepEqual(await run(self, 'lower_third_hide', { graphic: IDS.roster }), [['hide', IDS.roster]])
})

test('image: show, next, previous, hide', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'image_show', { image: `${IDS.image}|img-1` }), [['showImage', IDS.image, 'img-1']])
  assert.deepEqual(await run(self, 'image_step', { graphic: IDS.image, direction: 'next', wrap: true }), [
    ['stepImage', IDS.image, 'next', true],
  ])
  assert.deepEqual(await run(self, 'image_step', { graphic: IDS.image, direction: 'previous', wrap: false }), [
    ['stepImage', IDS.image, 'previous', false],
  ])
  assert.deepEqual(await run(self, 'image_hide', { graphic: IDS.image }), [['hide', IDS.image]])
  // Wrong widget type or an empty list: no API call.
  assert.deepEqual(await run(self, 'image_step', { graphic: IDS.roster, direction: 'next', wrap: true }), [])
  self.state.graphics.find((g) => g.id === IDS.image).data.images = []
  assert.deepEqual(await run(self, 'image_step', { graphic: IDS.image, direction: 'next', wrap: true }), [])
})

test('quiz: show question, reveal, toggle, hide', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'quiz_show', { question: `${IDS.quiz}|q-2` }), [
    ['patchGraphic', IDS.quiz, { visible: true, data: { activeQuestionId: 'q-2', revealed: false } }],
  ])
  assert.deepEqual(await run(self, 'quiz_reveal', { graphic: IDS.quiz, mode: 'reveal' }), [
    ['patchGraphic', IDS.quiz, { data: { revealed: true } }],
  ])
  // fixture is revealed → toggle hides the answer
  assert.deepEqual(await run(self, 'quiz_reveal', { graphic: IDS.quiz, mode: 'toggle' }), [
    ['patchGraphic', IDS.quiz, { data: { revealed: false } }],
  ])
  assert.deepEqual(await run(self, 'quiz_hide', { graphic: IDS.quiz }), [['hide', IDS.quiz]])
})

test('message: set text and show', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'message_set', { graphic: IDS.message, text: 'Half time', show: true }), [
    ['patchGraphic', IDS.message, { data: { text: 'Half time' }, visible: true }],
  ])
  assert.deepEqual(await run(self, 'message_set', { graphic: IDS.message, text: 'Later', show: false }), [
    ['patchGraphic', IDS.message, { data: { text: 'Later' } }],
  ])
})

test('brand colour is sent as hex', async () => {
  const self = fakeSelf()
  assert.deepEqual(await run(self, 'brand_primary_color', { color: 0x112233 }), [
    ['patchState', { brand: { colors: { primary: '#112233' } } }],
  ])
})

test('HTTP errors are logged with the server message instead of thrown', async () => {
  const self = fakeSelf()
  self.api.fail = new ApiError('POST /api/graphics/x/score: HTTP 404 – Graphic not found', { status: 404 })
  await run(self, 'score', { graphic: IDS.match, side: 'home', mode: 'add', amount: 1 })
  assert.equal(self.logs.at(-1)[0], 'error')
  assert.match(self.logs.at(-1)[1], /Score failed: .*HTTP 404 – Graphic not found/)
})

test('actions read the latest state at press time, not definition time', async () => {
  const self = fakeSelf()
  const defs = getActionDefinitions(self)
  const next = sampleState()
  next.graphics.find((g) => g.id === IDS.roster).data.activeEntryId = 'sp-1'
  self.state = next
  await defs.lower_third_step.callback({ options: { graphic: IDS.roster, direction: 'next', wrap: true } }, {})
  assert.deepEqual(self.api.calls, [['showEntry', IDS.roster, 'sp-2']])
})

test('Next and Previous: one request shape for roster, image list and quiz', async () => {
  const self = fakeSelf()
  const defs = getActionDefinitions(self)
  for (const id of ['widget_next', 'widget_previous']) {
    const choices = defs[id].options.find((o) => o.id === 'graphic').choices.map((c) => c.id)
    assert.deepEqual(choices, [IDS.roster, IDS.quiz, IDS.image], `${id} lists only widgets with steps`)
  }
  for (const graphic of [IDS.roster, IDS.quiz, IDS.image]) {
    assert.deepEqual(await run(self, 'widget_next', { graphic, wrap: true }), [['step', graphic, 1, true]])
    assert.deepEqual(await run(self, 'widget_previous', { graphic, wrap: false }), [['step', graphic, -1, false]])
  }
  // A widget without steps (an old button, or a changed project): no request, a log line instead.
  assert.deepEqual(await run(self, 'widget_next', { graphic: IDS.match, wrap: true }), [])
  assert.match(self.logs.at(-1)[1], /Widget: next failed: "Match" has no steps/)
  assert.deepEqual(await run(self, 'widget_previous', { graphic: 'gone', wrap: true }), [])
  assert.match(self.logs.at(-1)[1], /not in the active project/)
})

test('Run widget action: the list comes from ProVerlay, the payload goes along', async () => {
  const self = fakeSelf()
  const option = getActionDefinitions(self).widget_action.options.find((o) => o.id === 'action')
  assert.deepEqual(option.choices, [
    { id: `${IDS.quiz}|reveal`, label: 'Quiz: Reveal answer' },
    { id: `${IDS.quiz}|hide-answer`, label: 'Quiz: Hide answer' },
    { id: `${IDS.quiz}|show-question`, label: 'Quiz: Show question by number (payload: number)' },
  ])
  assert.deepEqual(await run(self, 'widget_action', { action: `${IDS.quiz}|reveal`, payload: '' }), [
    ['runAction', IDS.quiz, 'reveal', {}],
  ])
  assert.deepEqual(await run(self, 'widget_action', { action: `${IDS.quiz}|show-question`, payload: '2' }), [
    ['runAction', IDS.quiz, 'show-question', { number: 2 }],
  ])
  assert.deepEqual(
    await run(self, 'widget_action', { action: `${IDS.quiz}|show-question`, payload: '{"number": 1}' }),
    [['runAction', IDS.quiz, 'show-question', { number: 1 }]],
  )
  assert.deepEqual(await run(self, 'widget_action', { action: `${IDS.quiz}|show-question` }), [
    ['runAction', IDS.quiz, 'show-question', {}],
  ])
  // Refused locally: an action the type does not offer, a payload where none is taken, nothing selected.
  assert.deepEqual(await run(self, 'widget_action', { action: `${IDS.quiz}|explode`, payload: '' }), [])
  assert.match(self.logs.at(-1)[1], /Widget action failed: "Quiz" has no action "explode"/)
  assert.deepEqual(await run(self, 'widget_action', { action: `${IDS.quiz}|reveal`, payload: 'now' }), [])
  assert.match(self.logs.at(-1)[1], /takes no payload/)
  assert.deepEqual(await run(self, 'widget_action', { action: '', payload: '' }), [])
  assert.match(self.logs.at(-1)[1], /no widget action selected/)
})

test('a type that gains an action in ProVerlay shows up without a module change', async () => {
  const state = sampleState()
  state.widgetTypes.customTicker = { steps: true, actions: [{ id: 'clear', label: 'Clear all messages' }] }
  const self = fakeSelf(state)
  const defs = getActionDefinitions(self)
  assert.ok(defs.widget_next.options[0].choices.some((c) => c.id === IDS.ticker))
  assert.ok(defs.widget_action.options[0].choices.some((c) => c.label === 'Ticker: Clear all messages'))
  assert.deepEqual(await run(self, 'widget_next', { graphic: IDS.ticker, wrap: true }), [['step', IDS.ticker, 1, true]])
  assert.deepEqual(await run(self, 'widget_action', { action: `${IDS.ticker}|clear`, payload: '' }), [
    ['runAction', IDS.ticker, 'clear', {}],
  ])
})

test('an older ProVerlay (no widgetTypes in the state): empty lists, the other actions keep working', async () => {
  const state = sampleState()
  delete state.widgetTypes
  const self = fakeSelf(state)
  const defs = getActionDefinitions(self)
  assert.deepEqual(defs.widget_next.options[0].choices, [
    { id: '', label: 'No widgets with steps in the active project' },
  ])
  assert.deepEqual(defs.widget_action.options[0].choices, [
    { id: '', label: 'No widget actions in the active project' },
  ])
  assert.deepEqual(await run(self, 'widget_next', { graphic: IDS.roster, wrap: true }), [])
  assert.deepEqual(await run(self, 'image_step', { graphic: IDS.image, direction: 'next', wrap: true }), [
    ['stepImage', IDS.image, 'next', true],
  ])
})
