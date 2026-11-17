import { EventEmitter } from 'node:events'
import { UpgradeScripts } from '../index.js'

/** Fake Companion host context: records every call the module makes. */
export function fakeContext() {
  const calls = {
    actions: 0,
    feedbacks: 0,
    variables: 0,
    presets: 0,
    values: [],
    status: [],
    checkAll: 0,
    lastActions: null,
    lastFeedbacks: null,
    lastVariables: null,
    lastPresets: null,
  }
  return {
    _isInstanceContext: true,
    id: 'conn-1',
    label: 'proverlay',
    upgradeScripts: UpgradeScripts,
    calls,
    saveConfig() {},
    updateStatus: (status, message) => calls.status.push([status, message]),
    oscSend() {},
    recordAction() {},
    setActionDefinitions: (defs) => {
      calls.actions++
      calls.lastActions = defs
    },
    subscribeActions() {},
    unsubscribeActions() {},
    setFeedbackDefinitions: (defs) => {
      calls.feedbacks++
      calls.lastFeedbacks = defs
    },
    unsubscribeFeedbacks() {},
    checkFeedbacks() {},
    checkAllFeedbacks: () => calls.checkAll++,
    checkFeedbacksById() {},
    setPresetDefinitions: (structure, presets) => {
      calls.presets++
      calls.lastPresets = { structure, presets }
    },
    setVariableDefinitions: (defs) => {
      calls.variables++
      calls.lastVariables = defs
    },
    setVariableValues: (values) => calls.values.push(values),
    getVariableValue() {},
    sharedUdpSocketHandlers: new Map(),
  }
}

export class FakeSocket extends EventEmitter {
  constructor(url, options) {
    super()
    this.url = url
    this.options = options
    this.disconnected = false
  }
  disconnect() {
    this.disconnected = true
  }
}
