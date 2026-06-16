import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { UpgradeScripts } from './src/upgrades.js'
import config from './src/config.js'
import actions from './src/actions.js'
import feedbacks from './src/feedbacks.js'
import variables from './src/variables.js'
import presets from './src/presets.js'
import api from './src/api.js'

class ProVerlayInstance extends InstanceBase {
  constructor(internal) {
    super(internal)
    Object.assign(this, { ...config, ...actions, ...feedbacks, ...variables, ...presets, ...api })

    this.client = null
    this.state = { graphics: [], theme: 'clean', colors: {}, settings: {} }
    this.graphics = [{ id: null, label: 'No graphics loaded' }]
    this.themes = [
      { id: 'clean', label: 'Clean' },
      { id: 'bold', label: 'Bold' },
      { id: 'minimal', label: 'Minimal' }
    ]
  }

  async destroy() {
    if (this.client) {
      this.client.removeAllListeners()
      this.client.disconnect()
      this.client = null
    }
  }

  async init(cfg) {
    this.updateStatus(InstanceStatus.Connecting)
    this.configUpdated(cfg)
  }

  async configUpdated(cfg) {
    this.config = cfg
    this.updateStatus(InstanceStatus.Connecting)
    this.initConnection()
    this.initActions()
    this.initFeedbacks()
    this.initVariables()
    this.initPresets()
    this.checkAllFeedbacks()
  }
}

export default ProVerlayInstance
export { UpgradeScripts }
