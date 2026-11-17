import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getActionDefinitions } from '../src/actions.js'
import { getFeedbackDefinitions } from '../src/feedbacks.js'
import { getPresetDefinitions } from '../src/presets.js'
import { getTimeVariableValues, getVariableDefinitions, getVariableValues, diffValues } from '../src/variables.js'
import { buildVarKeys } from '../src/model.js'
import { IDS, fakeSelf, sampleState } from './fixtures.js'

const VAR_RE = /\$\(([^:)]+):([^)]+)\)/g

test('presets: one section per widget type, one group per graphic', () => {
  const state = { ...sampleState(), experimental: ['f1'] }
  const keys = buildVarKeys(state)
  const { structure, presets } = getPresetDefinitions(state, keys, 'proverlay')

  assert.deepEqual(
    structure.map((s) => s.name),
    [
      'Match scoreboard',
      'Hockey scorebug',
      'Ticker',
      'Countdown',
      'Lower thirds roster',
      'Quiz',
      'Message',
      'F1 timing tower',
    ],
  )
  for (const section of structure) {
    assert.equal(section.definitions.length, 1)
    for (const id of section.definitions[0].presets) assert.ok(presets[id], `preset ${id} exists`)
  }
  const k = keys.get(IDS.match)
  assert.equal(presets[`score_${k}_home_plus`].style.text, `$(proverlay:code_${k}_home)\n$(proverlay:score_${k}_home)`)
  assert.deepEqual(presets[`onair_${k}`].feedbacks[0].feedbackId, 'graphic_on_air')
  assert.ok(presets[`onair_${k}`].feedbacks[0].style.bgcolor, 'ON AIR style')
})

test('presets: experimental F1 tower only gets presets while ProVerlay has the f1 flag on', () => {
  for (const state of [sampleState(), { ...sampleState(), experimental: [] }]) {
    const { structure, presets } = getPresetDefinitions(state, buildVarKeys(state), 'proverlay')
    assert.ok(!structure.some((s) => s.name === 'F1 timing tower'), 'no F1 section')
    const f1Key = buildVarKeys(state).get(IDS.f1)
    assert.equal(presets[`onair_${f1Key}`], undefined)
    assert.ok(structure.some((s) => s.name === 'Match scoreboard'), 'other sections stay')
  }
})

test('presets only reference existing actions, feedbacks, options and variables', () => {
  const state = sampleState()
  const keys = buildVarKeys(state)
  const self = fakeSelf(state)
  const actions = getActionDefinitions(self)
  const feedbacks = getFeedbackDefinitions(self)
  const variables = getVariableDefinitions(state, keys)
  const { presets } = getPresetDefinitions(state, keys, 'myconn')

  for (const [id, preset] of Object.entries(presets)) {
    assert.equal(preset.type, 'simple', id)
    for (const step of preset.steps) {
      for (const a of step.down) {
        const def = actions[a.actionId]
        assert.ok(def, `${id}: action ${a.actionId}`)
        const optionIds = def.options.map((o) => o.id)
        for (const key of Object.keys(a.options)) assert.ok(optionIds.includes(key), `${id}: option ${key}`)
        for (const o of def.options.filter((o) => o.type === 'dropdown')) {
          if (a.options[o.id] === undefined) continue
          assert.ok(
            o.choices.some((c) => c.id === a.options[o.id]),
            `${id}: ${a.actionId}.${o.id}=${a.options[o.id]} is a valid choice`,
          )
        }
      }
    }
    for (const fb of preset.feedbacks) {
      assert.ok(feedbacks[fb.feedbackId], `${id}: feedback ${fb.feedbackId}`)
      assert.ok(fb.style, `${id}: boolean feedback has a style`)
    }
    for (const [, conn, name] of preset.style.text.matchAll(VAR_RE)) {
      assert.equal(conn, 'myconn')
      assert.ok(variables[name], `${id}: variable ${name} is defined`)
    }
  }
})

test('variables: definitions and values per widget type', () => {
  const state = sampleState()
  const keys = buildVarKeys(state)
  const defs = getVariableDefinitions(state, keys)
  const values = getVariableValues(state, keys, Date.now())
  for (const key of Object.keys(values)) assert.ok(defs[key], `value ${key} has a definition`)
  assert.equal(defs.theme, undefined, 'dead theme variable removed')

  const m = keys.get(IDS.match)
  const h = keys.get(IDS.hockey)
  assert.equal(values.project_name, 'Demo Cup')
  assert.equal(values.graphic_count, 8)
  assert.equal(values.visible_count, 2)
  assert.equal(values[`name_${m}`], 'Match')
  assert.equal(values[`onair_${m}`], true)
  assert.equal(values[`code_${m}_home`], 'AJA')
  assert.equal(values[`score_${m}_home`], 2)
  assert.equal(values[`score_${h}_away`], 3)
  assert.equal(values[`clock_${m}`], '12:05')
  assert.equal(values[`clock_${h}`], '12:55')
  assert.equal(values[`period_${m}`], '1st half')
  assert.equal(values[`period_${h}`], 'Q2')
  assert.equal(values[`ticker_${keys.get(IDS.ticker)}_current`], 'Welcome • Follow us')
  assert.equal(values[`speaker_${keys.get(IDS.roster)}_name`], 'Bram')
  assert.equal(values[`quiz_${keys.get(IDS.quiz)}_question`], 'Who scores first?')
  assert.equal(values[`message_${keys.get(IDS.message)}`], 'Back in 5')
  assert.match(values[`countdown_${keys.get(IDS.countdown)}`], /^1:0[45]$/)
})

test('time variables follow a running clock without new state', () => {
  const state = sampleState()
  const keys = buildVarKeys(state)
  const t0 = Date.parse('2026-06-01T12:00:00Z')
  const match = state.graphics.find((g) => g.id === IDS.match)
  match.data.clock = {
    period: 'first_half',
    minute: 0,
    second: 0,
    running: true,
    runningSince: new Date(t0).toISOString(),
  }
  const k = keys.get(IDS.match)
  assert.equal(getTimeVariableValues(state, keys, t0)[`clock_${k}`], '00:00')
  assert.equal(getTimeVariableValues(state, keys, t0 + 61_500)[`clock_${k}`], '01:01')
  assert.deepEqual(Object.keys(diffValues({ a: 1, b: '2' }, { a: 1, b: '3', c: true })), ['b', 'c'])
})

test('feedbacks: on air, solo, clock running, speaker, quiz', () => {
  const self = fakeSelf()
  const fb = getFeedbackDefinitions(self)
  const check = (id, options) => fb[id].callback({ options })
  assert.equal(check('graphic_on_air', { graphic: IDS.match }), true)
  assert.equal(check('graphic_on_air', { graphic: IDS.hockey }), false)
  assert.equal(check('graphic_solo_on_air', { graphic: IDS.hockey }), true)
  assert.equal(check('clock_running', { graphic: IDS.match }), false)
  self.state.graphics[0].data.clock = { running: true, runningSince: new Date().toISOString() }
  assert.equal(check('clock_running', { graphic: IDS.match }), true)
  assert.equal(check('lower_third_entry_active', { speaker: `${IDS.roster}|sp-2` }), true)
  assert.equal(check('lower_third_entry_active', { speaker: `${IDS.roster}|sp-1` }), false)
  assert.equal(check('quiz_revealed', { graphic: IDS.quiz }), true)
  assert.equal(check('quiz_question_active', { question: `${IDS.quiz}|q-1` }), false, 'quiz is not on air')
  assert.equal(check('ticker_message_enabled', { message: `${IDS.ticker}|msg-1` }), true)
  assert.equal(check('graphic_on_air', { graphic: 'missing' }), false)
  for (const def of Object.values(fb)) assert.equal(def.type, 'boolean')
  assert.deepEqual(fb.graphic_on_air.defaultStyle, fb.graphic_solo_on_air.defaultStyle)
})
