import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UpgradeScripts, upgradeV1 } from '../src/upgrades.js'
import { getActionDefinitions } from '../src/actions.js'
import { getFeedbackDefinitions } from '../src/feedbacks.js'
import { fakeSelf } from './fixtures.js'

const v = (value) => ({ value, isExpression: false })

test('UpgradeScripts is an append-only list starting with v1', () => {
  assert.equal(UpgradeScripts[0], upgradeV1)
})

test('v1 maps legacy actions and feedbacks to the new ids', () => {
  const actions = [
    { id: '1', controlId: 'c', actionId: 'toggleGraphic', options: { graphic: v('g1') } },
    { id: '2', controlId: 'c', actionId: 'scoreMinus', options: { graphic: v('g1'), side: v('away') } },
    { id: '3', controlId: 'c', actionId: 'clockStart', options: { graphic: v('g1') } },
    { id: '4', controlId: 'c', actionId: 'showLowerThirdEntry', options: { speaker: v('g2|sp-1') } },
    { id: '5', controlId: 'c', actionId: 'startCountdownDuration', options: { graphic: v('g3'), minutes: v(3) } },
    {
      id: '6',
      controlId: 'c',
      actionId: 'hideGraphicSolo',
      options: { graphic: { value: '$(x)', isExpression: true } },
    },
    { id: '7', controlId: 'c', actionId: 'graphic_visibility', options: { graphic: v('g1'), mode: v('show') } },
  ]
  const feedbacks = [
    { id: 'f1', controlId: 'c', feedbackId: 'graphic_visible', options: { graphic: v('g1') } },
    { id: 'f2', controlId: 'c', feedbackId: 'lower_third_visible', options: { graphic: v('g2') } },
  ]
  const result = upgradeV1(
    { currentConfig: {} },
    {
      config: { host: '10.0.0.2', port: '2014', reconnect: true, reconnect_interval: 5000 },
      secrets: null,
      actions,
      feedbacks,
    },
  )

  assert.deepEqual(result.updatedConfig, { host: '10.0.0.2', port: '2014' })
  assert.equal(result.updatedActions.length, 6, 'already-new actions are left alone')
  const byId = Object.fromEntries(result.updatedActions.map((a) => [a.id, a]))
  assert.equal(byId['1'].actionId, 'graphic_visibility')
  assert.deepEqual(byId['1'].options, { graphic: v('g1'), mode: v('toggle') })
  assert.deepEqual(byId['2'].options, { graphic: v('g1'), side: v('away'), mode: v('subtract'), amount: v(1) })
  assert.equal(byId['3'].options.action.value, 'start')
  assert.equal(byId['4'].actionId, 'lower_third_show')
  assert.deepEqual(byId['5'].options, { graphic: v('g3'), minutes: v(3), seconds: v(0) })
  assert.deepEqual(byId['6'].options.graphic, { value: '$(x)', isExpression: true }, 'expressions are kept')

  const self = fakeSelf()
  const actionDefs = getActionDefinitions(self)
  for (const action of result.updatedActions) {
    const optionIds = actionDefs[action.actionId].options.map((o) => o.id)
    for (const key of Object.keys(action.options)) assert.ok(optionIds.includes(key), `${action.actionId}.${key}`)
  }
  const feedbackDefs = getFeedbackDefinitions(self)
  assert.deepEqual(
    result.updatedFeedbacks.map((f) => f.feedbackId),
    ['graphic_on_air', 'graphic_on_air'],
  )
  for (const f of result.updatedFeedbacks) assert.ok(feedbackDefs[f.feedbackId])
})

test('v1 leaves a current config untouched', () => {
  const result = upgradeV1({}, { config: { host: 'a', port: '1' }, secrets: null, actions: [], feedbacks: [] })
  assert.equal(result.updatedConfig, null)
})
